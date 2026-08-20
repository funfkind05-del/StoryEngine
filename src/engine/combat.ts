// Bard's Tale-style round-based combat. The author picks actions for
// each party member; enemy actions come from simple combat AI; the
// round resolves in initiative order. Every action produces a
// structured log entry — the canonical combat record. Prose is
// derived later by the narrative bridge and never contradicts it.
//
// All numbers (XP, potion effects, status rules) come from the RPG
// Rules Engine — combat only orchestrates.

import type {
  Character,
  CombatLogEntry,
  CombatState,
  CombatantMonster,
  Item,
  PendingEncounter,
  PlannedAction,
  WorldState,
} from './types';
import { MONSTERS } from './monsters';
import { Rng } from './rng';
import { addMinutes, grantXp, logEvent, nextId, partyMembers, reactToAct } from './world';
import {
  addToContainer,
  applyStatus,
  consumeItem,
  cureStatus,
  hasStatus,
  statusAttackMod,
  statusDefenseMod,
  tickStatusesRound,
} from './rules';
import { generateLoot } from './loot';

export interface SkillDef {
  name: string;
  stamina: number;
  toHitMod: number;
  dmgBonus: number;
  stuns?: boolean;
  blinds?: boolean;
  critBonus?: number;
  extraTargets?: number; // cleave
  doubleHit?: boolean; // twin strike
}

export const SKILLS: Record<string, SkillDef> = {
  'shield-bash': { name: 'Shield Bash', stamina: 3, toHitMod: 0, dmgBonus: 2, stuns: true },
  'power-strike': { name: 'Power Strike', stamina: 4, toHitMod: -2, dmgBonus: 5 },
  cleave: { name: 'Cleave', stamina: 5, toHitMod: -1, dmgBonus: 2, extraTargets: 1 },
  backstab: { name: 'Backstab', stamina: 3, toHitMod: 1, dmgBonus: 3, critBonus: 20 },
  'dirty-fighting': { name: 'Dirty Fighting', stamina: 3, toHitMod: 0, dmgBonus: 1, blinds: true },
  'aimed-shot': { name: 'Aimed Shot', stamina: 3, toHitMod: 3, dmgBonus: 2 },
  'twin-strike': { name: 'Twin Strike', stamina: 5, toHitMod: -1, dmgBonus: 0, doubleHit: true },
};

export interface SpellDef {
  name: string;
  mana: number;
  damage?: string;
  heal?: string;
  cures?: boolean; // purify
  partyDefense?: number; // sanctuary
  hitsAll?: boolean; // fireball
  stunChance?: number; // frost-grasp
}

export const SPELLS: Record<string, SpellDef> = {
  firebolt: { name: 'Firebolt', mana: 4, damage: '2d6' },
  'frost-grasp': { name: 'Frost Grasp', mana: 5, damage: '1d8', stunChance: 0.4 },
  fireball: { name: 'Fireball', mana: 9, damage: '2d6', hitsAll: true },
  'mend-wounds': { name: 'Mend Wounds', mana: 3, heal: '1d8+2' },
  purify: { name: 'Purify', mana: 4, cures: true },
  sanctuary: { name: 'Sanctuary', mana: 6, partyDefense: 2 },
};

function weaponOf(world: WorldState, c: Character): Item | null {
  const id = c.equipment['main-hand'];
  return id ? world.items[id] ?? null : null;
}

function charDamage(world: WorldState, c: Character, rng: Rng, bonus: number): number {
  const w = weaponOf(world, c);
  const dice = w && !w.broken && w.damage ? w.damage : '1d3';
  const strMod = Math.floor((c.attributes.strength - 10) / 2);
  return Math.max(1, rng.roll(dice) + strMod + bonus);
}

function charDefense(world: WorldState, c: Character): number {
  let def = c.defense + c.evasion + Math.floor((c.attributes.dexterity - 10) / 2) + statusDefenseMod(c);
  for (const slot of ['armor', 'off-hand'] as const) {
    const id = c.equipment[slot];
    const it = id ? world.items[id] : null;
    if (it && !it.broken && it.defense) def += it.defense;
  }
  return def;
}

export function startCombat(world: WorldState, enc: PendingEncounter): CombatState {
  const rng = new Rng(enc.seed);
  const monsters: CombatantMonster[] = [];
  const counts: Record<string, number> = {};
  for (const group of enc.monsters) {
    for (let i = 0; i < group.count; i++) {
      const t = MONSTERS[group.templateKey];
      counts[group.templateKey] = (counts[group.templateKey] ?? 0) + 1;
      monsters.push({
        id: nextId(world, 'MON'),
        templateKey: group.templateKey,
        name: `${t.name} #${counts[group.templateKey]}`,
        hp: { current: t.hp, max: t.hp },
        status: [],
        alive: true,
        fled: false,
      });
    }
  }
  const combat: CombatState = {
    active: true,
    round: 1,
    seed: enc.seed,
    rngState: rng.getState(),
    monsters,
    partyIds: partyMembers(world).map((c) => c.id),
    defending: [],
    stunned: [],
    log: [],
    outcome: 'ongoing',
    encounterDesc: enc.description,
    locationId: enc.locationId,
    roomId: enc.roomId,
  };
  world.combat = combat;
  world.pendingEncounter = null;
  logEvent(world, 'combat.start', { seed: enc.seed, monsters: enc.monsters, room: enc.roomId ?? null }, `Combat began: ${enc.description}. (seed ${enc.seed})`, { seed: enc.seed, location: enc.locationId, witnesses: combat.partyIds });
  return combat;
}

interface Turn {
  actorId: string;
  isMonster: boolean;
  initiative: number;
  action: PlannedAction;
}

function monsterAI(combat: CombatState, world: WorldState, m: CombatantMonster, rng: Rng): PlannedAction {
  const t = MONSTERS[m.templateKey];
  const living = combat.partyIds.map((id) => world.characters[id]).filter((c) => c.hp.current > 0);
  if (!living.length) return { actor: m.id, type: 'defend' };
  if (t.ai === 'cowardly' && m.hp.current <= m.hp.max * 0.3 && rng.chance(0.6)) {
    return { actor: m.id, type: 'flee' };
  }
  // pack AI gangs up on the weakest; aggressive picks at random
  const target =
    t.ai === 'pack'
      ? living.reduce((a, b) => (a.hp.current <= b.hp.current ? a : b))
      : rng.pick(living);
  return { actor: m.id, type: 'attack', target: target.id };
}

function downCheck(world: WorldState, c: Character, record: (e: CombatLogEntry) => void, round: number) {
  if (c.hp.current === 0 && !hasStatus(c, 'unconscious')) {
    applyStatus(c, 'unconscious');
    record({ round, actor: c.id, actorName: c.name, action: 'attack', detail: 'down', result: 'death', text: `${c.name} went down, bleeding.` });
    void world;
  }
}

/** Resolve one round given the author's planned actions for the party. */
export function resolveRound(world: WorldState, planned: PlannedAction[]): CombatLogEntry[] {
  const combat = world.combat;
  if (!combat || !combat.active) return [];
  const rng = new Rng(0);
  rng.setState(combat.rngState);
  const roundEntries: CombatLogEntry[] = [];
  const record = (e: CombatLogEntry) => {
    combat.log.push(e);
    roundEntries.push(e);
  };

  // status upkeep (poison, bleeding, burning, expiring effects)
  for (const cid of combat.partyIds) {
    const c = world.characters[cid];
    if (c.hp.current <= 0) continue;
    for (const line of tickStatusesRound(c)) {
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'attack', detail: 'status', result: 'status', text: line });
    }
    downCheck(world, c, record, combat.round);
  }
  checkOutcome(world, combat, rng, record);
  if (combat.outcome !== 'ongoing') {
    combat.rngState = rng.getState();
    return roundEntries;
  }

  combat.defending = [];
  const turns: Turn[] = [];
  for (const pa of planned) {
    const c = world.characters[pa.actor];
    if (!c || c.hp.current <= 0) continue;
    turns.push({ actorId: pa.actor, isMonster: false, initiative: c.initiative + Math.floor(c.attributes.dexterity / 4) + rng.die(6), action: pa });
  }
  for (const m of combat.monsters) {
    if (!m.alive || m.fled) continue;
    const t = MONSTERS[m.templateKey];
    turns.push({ actorId: m.id, isMonster: true, initiative: t.initiative + rng.die(6), action: monsterAI(combat, world, m, rng) });
  }
  turns.sort((a, b) => b.initiative - a.initiative);

  for (const turn of turns) {
    if (combat.outcome !== 'ongoing') break;
    if (turn.isMonster) {
      const m = combat.monsters.find((x) => x.id === turn.actorId)!;
      if (!m.alive || m.fled) continue;
      if (m.status.includes('stunned')) {
        m.status = m.status.filter((s) => s !== 'stunned');
        record({ round: combat.round, actor: m.id, actorName: m.name, action: 'defend', detail: 'stunned', result: 'status', text: `${m.name} was stunned and lost its turn.` });
        continue;
      }
      resolveMonsterAction(world, combat, m, turn.action, rng, record);
    } else {
      const c = world.characters[turn.actorId];
      if (!c || c.hp.current <= 0) continue;
      const skip = (['stunned', 'paralyzed'] as const).find((k) => hasStatus(c, k));
      if (skip) {
        cureStatus(c, 'stunned');
        record({ round: combat.round, actor: c.id, actorName: c.name, action: 'defend', detail: skip, result: 'status', text: `${c.name} was ${skip} and lost the round.` });
        continue;
      }
      resolveCharacterAction(world, combat, c, turn.action, rng, record);
    }
    checkOutcome(world, combat, rng, record);
  }

  if (combat.outcome === 'ongoing') combat.round += 1;
  combat.rngState = rng.getState();
  addMinutes(world, 1);
  return roundEntries;
}

function resolveCharacterAction(
  world: WorldState,
  combat: CombatState,
  c: Character,
  action: PlannedAction,
  rng: Rng,
  record: (e: CombatLogEntry) => void,
) {
  const round = combat.round;
  switch (action.type) {
    case 'defend': {
      combat.defending.push(c.id);
      record({ round, actor: c.id, actorName: c.name, action: 'defend', detail: 'defend', result: 'defend', text: `${c.name} took a defensive stance.` });
      return;
    }
    case 'flee': {
      const roll = rng.die(20) + Math.floor(c.attributes.dexterity / 3);
      if (roll >= 12) {
        combat.outcome = 'fled';
        combat.active = false;
        record({ round, actor: c.id, actorName: c.name, action: 'flee', detail: 'flee', roll, result: 'flee-success', text: `${c.name} led the party in a retreat. They escaped. (roll ${roll})` });
        finishCombat(world, combat);
      } else {
        record({ round, actor: c.id, actorName: c.name, action: 'flee', detail: 'flee', roll, result: 'flee-fail', text: `${c.name} tried to break away but the enemy cut off the retreat. (roll ${roll})` });
      }
      return;
    }
    case 'item': {
      const item = action.itemId ? world.items[action.itemId] : null;
      if (item && item.kind === 'potion') {
        const targetChar = action.target ? world.characters[action.target] ?? c : c;
        const remainingBefore = item.qty ?? 1;
        const res = consumeItem(world, item, targetChar, rng);
        const remaining = item.owner ? item.qty ?? 0 : remainingBefore - 1;
        record({ round, actor: c.id, actorName: c.name, action: 'item', targetName: targetChar.name, detail: item.name, result: 'heal', text: `${res.lines.join(' ')} (${item.name} ×${Math.max(0, remaining)} left)` });
      } else {
        record({ round, actor: c.id, actorName: c.name, action: 'item', detail: 'nothing usable', result: 'info', text: `${c.name} fumbled for an item and found nothing useful.` });
      }
      return;
    }
    case 'spell': {
      const spell = action.spellKey ? SPELLS[action.spellKey] : null;
      if (!spell || c.mana.current < spell.mana) {
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell?.name ?? 'unknown spell', result: 'info', text: `${c.name} tried to cast but lacked the mana.` });
        return;
      }
      if (hasStatus(c, 'silenced')) {
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'info', text: `${c.name} mouthed the words of ${spell.name}, but no sound came.` });
        return;
      }
      c.mana.current -= spell.mana;
      if (spell.heal) {
        const targetChar = action.target ? world.characters[action.target] ?? c : c;
        const healed = rng.roll(spell.heal) + Math.floor(c.skills.magic / 2);
        targetChar.hp.current = Math.min(targetChar.hp.max, targetChar.hp.current + healed);
        if (targetChar.hp.current > 0) cureStatus(targetChar, 'unconscious');
        record({ round, actor: c.id, actorName: c.name, action: 'spell', targetName: targetChar.name, detail: spell.name, result: 'heal', damage: healed, text: `${c.name} cast ${spell.name} on ${targetChar.name}, restoring ${healed} HP.` });
      } else if (spell.cures) {
        const targetChar = action.target ? world.characters[action.target] ?? c : c;
        const cured = ['poisoned', 'diseased', 'bleeding'].filter((k) => cureStatus(targetChar, k as never));
        record({ round, actor: c.id, actorName: c.name, action: 'spell', targetName: targetChar.name, detail: spell.name, result: 'heal', text: cured.length ? `${c.name} cast ${spell.name}: ${targetChar.name} was cleansed of ${cured.join(', ')}.` : `${c.name} cast ${spell.name}, but ${targetChar.name} carried no taint.` });
      } else if (spell.partyDefense) {
        for (const pid of combat.partyIds) {
          const ally = world.characters[pid];
          if (ally.hp.current > 0) ally.tempBonuses.push({ stat: 'defense', amount: spell.partyDefense, roundsLeft: 5, source: spell.name });
        }
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'defend', text: `${c.name} cast ${spell.name}: the party is warded (+${spell.partyDefense} defense, 5 rounds).` });
      } else if (spell.damage) {
        const targets = spell.hitsAll
          ? combat.monsters.filter((x) => x.alive && !x.fled)
          : combat.monsters.filter((x) => x.id === action.target && x.alive && !x.fled);
        if (!targets.length) {
          record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'info', text: `${c.name}'s ${spell.name} found no target.` });
          return;
        }
        for (const m of targets) {
          const dmg = rng.roll(spell.damage) + Math.floor(c.skills.magic / 2);
          applyDamageToMonster(world, combat, c, m, dmg, spell.name, 'hit', rng, record, undefined, spell.stunChance !== undefined && rng.chance(spell.stunChance));
          if (combat.outcome !== 'ongoing') break;
        }
      }
      return;
    }
    case 'skill':
    case 'attack': {
      const skill = action.type === 'skill' && action.skillKey ? SKILLS[action.skillKey] : null;
      if (skill) {
        if (action.skillKey && !c.abilities.includes(action.skillKey)) {
          record({ round, actor: c.id, actorName: c.name, action: 'skill', detail: skill.name, result: 'info', text: `${c.name} hasn't trained ${skill.name}.` });
          return;
        }
        if (c.stamina.current < skill.stamina) {
          record({ round, actor: c.id, actorName: c.name, action: 'skill', detail: skill.name, result: 'info', text: `${c.name} was too winded to use ${skill.name}.` });
          return;
        }
        c.stamina.current -= skill.stamina;
      }
      const primary = combat.monsters.find((x) => x.id === action.target && x.alive && !x.fled)
        ?? combat.monsters.find((x) => x.alive && !x.fled);
      if (!primary) return;
      const swings = skill?.doubleHit ? 2 : 1;
      for (let s = 0; s < swings; s++) {
        if (!primary.alive) break;
        swingAt(world, combat, c, primary, skill, rng, record);
      }
      if (skill?.extraTargets) {
        const others = combat.monsters.filter((x) => x.alive && !x.fled && x.id !== primary.id).slice(0, skill.extraTargets);
        for (const m of others) swingAt(world, combat, c, m, skill, rng, record);
      }
      return;
    }
  }
}

function swingAt(
  world: WorldState,
  combat: CombatState,
  c: Character,
  m: CombatantMonster,
  skill: SkillDef | null,
  rng: Rng,
  record: (e: CombatLogEntry) => void,
) {
  const t = MONSTERS[m.templateKey];
  const roll = rng.die(20);
  const toHit = roll + c.attack + c.accuracy + Math.floor(c.skills.swordsmanship / 2) + (skill?.toHitMod ?? 0) + statusAttackMod(c);
  const detail = skill ? skill.name : weaponOf(world, c)?.name ?? 'bare hands';
  if (roll !== 20 && (roll === 1 || toHit < t.defense)) {
    record({ round: combat.round, actor: c.id, actorName: c.name, action: skill ? 'skill' : 'attack', targetName: m.name, detail, roll, result: 'miss', text: `${c.name} ${skill ? `used ${skill.name} against` : 'attacked'} ${m.name} and missed. (roll ${roll})` });
    return;
  }
  const isCrit = roll === 20 || rng.chance((c.critChance + (skill?.critBonus ?? 0)) / 100);
  let dmg = charDamage(world, c, rng, skill?.dmgBonus ?? 0);
  if (isCrit) dmg *= 2;
  // weapon wear
  const w = weaponOf(world, c);
  if (w && w.durability && !w.broken && rng.chance(0.08)) {
    w.durability.current = Math.max(0, w.durability.current - rng.int(1, 3));
    if (w.durability.current === 0) {
      w.broken = true;
      w.history.push(`Broke in combat on Day ${world.time.day}`);
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'attack', detail: w.name, result: 'info', text: `${c.name}'s ${w.name} broke!` });
    }
  }
  applyDamageToMonster(world, combat, c, m, dmg, detail, isCrit ? 'crit' : 'hit', rng, record, roll, !!skill?.stuns && rng.chance(0.6));
  if (skill?.blinds && m.alive && rng.chance(0.5)) {
    m.status.push('stunned'); // monsters model blind as a lost turn
    record({ round: combat.round, actor: c.id, actorName: c.name, action: 'skill', targetName: m.name, detail: skill.name, result: 'status', statusApplied: 'blinded', text: `${c.name} raked filth across ${m.name}'s eyes — it staggers, blinded.` });
  }
}

function applyDamageToMonster(
  world: WorldState,
  combat: CombatState,
  c: Character,
  m: CombatantMonster,
  dmg: number,
  detail: string,
  result: 'hit' | 'crit',
  rng: Rng,
  record: (e: CombatLogEntry) => void,
  roll?: number,
  stuns?: boolean,
) {
  m.hp.current = Math.max(0, m.hp.current - dmg);
  let statusApplied: string | undefined;
  if (stuns && m.hp.current > 0) {
    statusApplied = 'stunned';
    m.status.push('stunned');
  }
  const critTxt = result === 'crit' ? 'CRITICAL HIT — ' : '';
  record({
    round: combat.round,
    actor: c.id,
    actorName: c.name,
    action: 'attack',
    targetName: m.name,
    detail,
    roll,
    result,
    damage: dmg,
    statusApplied,
    text: `${c.name} struck ${m.name} with ${detail}: ${critTxt}${dmg} damage.${statusApplied ? ` ${m.name} is stunned.` : ''}`,
  });
  if (m.hp.current === 0) {
    m.alive = false;
    record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', detail: 'death', result: 'death', text: `${m.name} died.` });
    // Companions react to the kill through their own values
    for (const cid of combat.partyIds) {
      if (cid !== c.id) reactToAct(world, cid, c.id, { tags: ['courage', 'strength'], magnitude: 1, description: `${c.name} killed ${m.name}` });
    }
  }
  void rng;
}

function resolveMonsterAction(
  world: WorldState,
  combat: CombatState,
  m: CombatantMonster,
  action: PlannedAction,
  rng: Rng,
  record: (e: CombatLogEntry) => void,
) {
  const t = MONSTERS[m.templateKey];
  if (action.type === 'flee') {
    const roll = rng.die(20);
    if (roll >= 10) {
      m.fled = true;
      record({ round: combat.round, actor: m.id, actorName: m.name, action: 'flee', detail: 'flee', roll, result: 'flee-success', text: `${m.name} broke and fled into the dark. (roll ${roll})` });
    } else {
      record({ round: combat.round, actor: m.id, actorName: m.name, action: 'flee', detail: 'flee', roll, result: 'flee-fail', text: `${m.name} tried to flee but was cornered. (roll ${roll})` });
    }
    return;
  }
  const target = action.target ? world.characters[action.target] : null;
  if (!target || target.hp.current <= 0) return;
  const roll = rng.die(20);
  const defBonus = combat.defending.includes(target.id) ? 4 : 0;
  const toHit = roll + t.attack;
  if (roll !== 20 && (roll === 1 || toHit < charDefense(world, target) + defBonus)) {
    record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', targetName: target.name, detail: 'attack', roll, result: 'miss', text: `${m.name} attacked ${target.name} and missed. (roll ${roll})` });
    return;
  }
  const dmg = Math.max(1, rng.roll(t.damage) - target.armor);
  target.hp.current = Math.max(0, target.hp.current - dmg);
  let inflictNote = '';
  if (t.inflicts && target.hp.current > 0 && rng.chance(t.inflicts.chance) && !hasStatus(target, t.inflicts.status)) {
    applyStatus(target, t.inflicts.status, undefined, m.name);
    if (hasStatus(target, t.inflicts.status)) inflictNote = ` ${target.name} is ${t.inflicts.status}!`;
  }
  record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', targetName: target.name, detail: 'attack', roll, result: 'hit', damage: dmg, statusApplied: inflictNote ? t.inflicts!.status : undefined, text: `${m.name} hit ${target.name} for ${dmg} damage.${inflictNote}` });
  downCheck(world, target, record, combat.round);
}

function checkOutcome(world: WorldState, combat: CombatState, rng: Rng, record: (e: CombatLogEntry) => void) {
  if (combat.outcome !== 'ongoing') return;
  const enemiesLeft = combat.monsters.some((m) => m.alive && !m.fled);
  const partyUp = combat.partyIds.some((id) => world.characters[id].hp.current > 0);
  if (!enemiesLeft) {
    combat.outcome = 'victory';
    combat.active = false;
    const killed = combat.monsters.filter((m) => !m.alive);
    const xp = killed.reduce((s, m) => s + MONSTERS[m.templateKey].xp, 0);
    combat.pendingLoot = generateLoot(world, killed.map((m) => m.templateKey), rng.fork(), xp);
    record({ round: combat.round, actor: 'SYSTEM', actorName: 'System', action: 'attack', detail: 'victory', result: 'info', text: `Victory. ${killed.length} enemies slain, ${combat.monsters.filter((m) => m.fled).length} fled. XP earned: ${xp} (full award to each participant).` });
    finishCombat(world, combat);
  } else if (!partyUp) {
    combat.outcome = 'defeat';
    combat.active = false;
    record({ round: combat.round, actor: 'SYSTEM', actorName: 'System', action: 'attack', detail: 'defeat', result: 'info', text: 'The whole party was beaten down. Everything went dark.' });
    finishCombat(world, combat);
  }
}

/** COMBAT ENDS → survivors → temp effects off → XP → level check → loot generated → (UI reward screen) */
function finishCombat(world: WorldState, combat: CombatState) {
  addMinutes(world, 5);
  // remove temporary combat effects from everyone
  for (const id of combat.partyIds) {
    const c = world.characters[id];
    c.tempBonuses = [];
    c.statuses = c.statuses.filter((s) => s.roundsLeft === undefined && s.key !== 'stunned' && s.key !== 'paralyzed');
  }
  if (combat.outcome === 'victory' && combat.pendingLoot) {
    const survivors = combat.partyIds.map((id) => world.characters[id]).filter((c) => c.alive);
    for (const c of survivors) {
      if (c.hp.current === 0) {
        c.hp.current = 1; // downed allies stabilize after victory
        cureStatus(c, 'unconscious');
      }
      // full XP to each participant (rules-engine policy)
      grantXp(world, c, combat.pendingLoot.xp);
    }
    // room state persists
    if (combat.roomId && world.currentDungeon) {
      const room = world.dungeons[world.currentDungeon].rooms[combat.roomId];
      room.enemies = 'dead';
      if (room.isBossRoom) world.dungeons[world.currentDungeon].bossDefeated = true;
    }
  } else if (combat.outcome === 'defeat') {
    // consequences depend on the death rule
    for (const id of combat.partyIds) {
      const c = world.characters[id];
      if (world.deathRule === 'story') {
        c.hp.current = 1;
        cureStatus(c, 'unconscious');
      } else {
        c.alive = false;
        c.diedOnDay = world.time.day;
        c.statuses = [];
        logEvent(world, 'character.death', { character: c.id, rule: world.deathRule }, `${c.name} died. (${world.deathRule === 'classic' ? 'The body can be carried to a temple for resurrection.' : 'Permadeath: no resurrection.'})`);
      }
    }
    if (world.deathRule === 'story') {
      logEvent(world, 'party.defeated', {}, 'STORY MODE: the party was left for dead but survived — beaten, robbed of nothing but pride.');
    }
  }
  logEvent(
    world,
    'combat.end',
    { outcome: combat.outcome, seed: combat.seed, rounds: combat.round, log: combat.log },
    `Combat ended in ${combat.outcome} after ${combat.round} round${combat.round > 1 ? 's' : ''} (${combat.encounterDesc}).`,
    { seed: combat.seed, location: combat.locationId, witnesses: combat.partyIds },
  );
}

/** After the loot screen: apply the taken items to inventories. */
export function takeLoot(world: WorldState, itemIndexes: number[] | 'all' | 'none') {
  const combat = world.combat;
  if (!combat?.pendingLoot || combat.pendingLoot.taken) return;
  const loot = combat.pendingLoot;
  const mc = world.characters[world.mcId];
  const takenNames: string[] = [];
  if (itemIndexes !== 'none') {
    mc.money += loot.money;
    loot.items.forEach((item, i) => {
      if (itemIndexes === 'all' || itemIndexes.includes(i)) {
        world.items[item.id] = item;
        item.history.push(`Looted by ${mc.name} on Day ${world.time.day}`);
        // stack-aware pickup via the rules engine
        addToContainer(world, item, mc);
        takenNames.push(item.name);
      } else if (combat.roomId && world.currentDungeon) {
        // left behind: persists in the room
        world.items[item.id] = item;
        item.owner = world.dungeons[world.currentDungeon].entranceLocation;
        world.dungeons[world.currentDungeon].rooms[combat.roomId].itemsRemaining.push(item.id);
      }
    });
  }
  loot.taken = true;
  logEvent(
    world,
    'loot.taken',
    { money: itemIndexes === 'none' ? 0 : loot.money, items: takenNames, seed: loot.seed },
    itemIndexes === 'none'
      ? 'The party left the spoils where they lay.'
      : `The party looted ${loot.money} copper${takenNames.length ? ` and: ${takenNames.join(', ')}` : ''}.`,
    { seed: loot.seed, witnesses: combat.partyIds },
  );
}

export function closeCombat(world: WorldState) {
  world.combat = null;
}
