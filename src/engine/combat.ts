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
  injuryAttackMod,
  injuryDefenseMod,
  needsAttackMod,
  needsDefenseMod,
  removeUnits,
  rollInjury,
  statusAttackMod,
  statusDefenseMod,
  tickStatusesRound,
} from './rules';
import { generateLoot } from './loot';
import { checkQuests } from './quests';
import { affixMod, trainSkill } from './progression';
import { resolveWorldEventVictory } from './worldEvents';
import { makeEliteCombatant, settleElites } from './rivals';
import { driftCompanionBonds } from './banter';

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
  // fighter line
  'shield-bash': { name: 'Shield Bash', stamina: 3, toHitMod: 0, dmgBonus: 2, stuns: true },
  'power-strike': { name: 'Power Strike', stamina: 4, toHitMod: -2, dmgBonus: 5 },
  cleave: { name: 'Cleave', stamina: 5, toHitMod: -1, dmgBonus: 2, extraTargets: 1 },
  whirlwind: { name: 'Whirlwind', stamina: 7, toHitMod: -2, dmgBonus: 2, extraTargets: 3 },
  'crushing-blow': { name: 'Crushing Blow', stamina: 6, toHitMod: -1, dmgBonus: 8, stuns: true },
  execute: { name: 'Execute', stamina: 7, toHitMod: 0, dmgBonus: 6, critBonus: 35 },
  'twin-cleave': { name: 'Twin Cleave', stamina: 9, toHitMod: -1, dmgBonus: 3, doubleHit: true, extraTargets: 1 },
  'titanic-strike': { name: 'Titanic Strike', stamina: 10, toHitMod: -2, dmgBonus: 14 },
  'avatar-of-war': { name: 'Avatar of War', stamina: 12, toHitMod: 0, dmgBonus: 10, extraTargets: 4 },
  worldbreaker: { name: 'Worldbreaker', stamina: 15, toHitMod: 0, dmgBonus: 20, stuns: true },
  // rogue line
  backstab: { name: 'Backstab', stamina: 3, toHitMod: 1, dmgBonus: 3, critBonus: 20 },
  'dirty-fighting': { name: 'Dirty Fighting', stamina: 3, toHitMod: 0, dmgBonus: 1, blinds: true },
  hamstring: { name: 'Hamstring', stamina: 5, toHitMod: 0, dmgBonus: 3, stuns: true },
  'shadow-strike': { name: 'Shadow Strike', stamina: 6, toHitMod: 2, dmgBonus: 4, critBonus: 30 },
  'twin-fangs': { name: 'Twin Fangs', stamina: 7, toHitMod: 0, dmgBonus: 2, doubleHit: true },
  garrote: { name: 'Garrote', stamina: 8, toHitMod: 1, dmgBonus: 8, stuns: true },
  'death-mark': { name: 'Death Mark', stamina: 9, toHitMod: 2, dmgBonus: 6, critBonus: 50 },
  'thousand-cuts': { name: 'A Thousand Cuts', stamina: 11, toHitMod: 0, dmgBonus: 4, doubleHit: true, extraTargets: 2 },
  kingslayer: { name: 'Kingslayer', stamina: 14, toHitMod: 2, dmgBonus: 18, critBonus: 40 },
  // ranger line
  'aimed-shot': { name: 'Aimed Shot', stamina: 3, toHitMod: 3, dmgBonus: 2 },
  'twin-strike': { name: 'Twin Strike', stamina: 5, toHitMod: -1, dmgBonus: 0, doubleHit: true },
  'pinning-shot': { name: 'Pinning Shot', stamina: 5, toHitMod: 1, dmgBonus: 2, stuns: true },
  volley: { name: 'Volley', stamina: 7, toHitMod: -1, dmgBonus: 1, extraTargets: 2 },
  'piercing-arrow': { name: 'Piercing Arrow', stamina: 7, toHitMod: 2, dmgBonus: 8 },
  'double-volley': { name: 'Double Volley', stamina: 9, toHitMod: -1, dmgBonus: 2, doubleHit: true, extraTargets: 2 },
  heartseeker: { name: 'Heartseeker', stamina: 10, toHitMod: 3, dmgBonus: 8, critBonus: 40 },
  'storm-of-arrows': { name: 'Storm of Arrows', stamina: 12, toHitMod: -1, dmgBonus: 4, extraTargets: 4 },
  'wind-that-kills': { name: 'The Wind That Kills', stamina: 15, toHitMod: 2, dmgBonus: 16, doubleHit: true },
};

export interface SpellDef {
  name: string;
  mana: number;
  damage?: string;
  heal?: string;
  healAll?: boolean; // heal the whole party
  cures?: boolean; // purify
  partyDefense?: number; // sanctuary
  hitsAll?: boolean; // fireball
  stunChance?: number; // frost-grasp
}

export const SPELLS: Record<string, SpellDef> = {
  // mage line
  firebolt: { name: 'Firebolt', mana: 4, damage: '2d6' },
  'frost-grasp': { name: 'Frost Grasp', mana: 5, damage: '1d8', stunChance: 0.4 },
  fireball: { name: 'Fireball', mana: 9, damage: '2d6', hitsAll: true },
  'lightning-lance': { name: 'Lightning Lance', mana: 8, damage: '3d6' },
  'ice-storm': { name: 'Ice Storm', mana: 12, damage: '2d6', hitsAll: true, stunChance: 0.25 },
  immolate: { name: 'Immolate', mana: 12, damage: '4d6' },
  'chain-lightning': { name: 'Chain Lightning', mana: 16, damage: '3d6', hitsAll: true },
  meteor: { name: 'Meteor', mana: 20, damage: '6d6' },
  cataclysm: { name: 'Cataclysm', mana: 26, damage: '4d6', hitsAll: true },
  unmaking: { name: 'The Unmaking Word', mana: 34, damage: '10d6' },
  // priest line
  'mend-wounds': { name: 'Mend Wounds', mana: 3, heal: '1d8+2' },
  purify: { name: 'Purify', mana: 4, cures: true },
  sanctuary: { name: 'Sanctuary', mana: 6, partyDefense: 2 },
  'greater-mending': { name: 'Greater Mending', mana: 7, heal: '2d8+6' },
  smite: { name: 'Smite', mana: 7, damage: '2d8' },
  'circle-of-renewal': { name: 'Circle of Renewal', mana: 12, heal: '1d8+6', healAll: true },
  'holy-fire': { name: 'Holy Fire', mana: 12, damage: '3d8' },
  aegis: { name: 'Aegis', mana: 14, partyDefense: 4 },
  'mass-renewal': { name: 'Mass Renewal', mana: 20, heal: '2d8+8', healAll: true },
  'divine-wrath': { name: 'Divine Wrath', mana: 26, damage: '3d8', hitsAll: true },
};

function weaponOf(world: WorldState, c: Character): Item | null {
  const id = c.equipment['main-hand'];
  return id ? world.items[id] ?? null : null;
}

function findAmmo(world: WorldState, c: Character, proto: string): Item | null {
  for (const iid of [...c.inventory, ...world.partyInventory]) {
    const it = world.items[iid];
    if (it && it.proto === proto && (it.qty ?? 0) > 0) return it;
  }
  return null;
}

function charDamage(world: WorldState, c: Character, rng: Rng, bonus: number): number {
  const w = weaponOf(world, c);
  const dice = w && !w.broken && w.damage ? w.damage : '1d3';
  const statMod = w?.ranged
    ? Math.floor((c.attributes.dexterity - 10) / 2)
    : Math.floor((c.attributes.strength - 10) / 2);
  return Math.max(1, rng.roll(dice) + statMod + bonus);
}

function charDefense(world: WorldState, c: Character): number {
  let def = c.defense + c.evasion + Math.floor((c.attributes.dexterity - 10) / 2) + statusDefenseMod(c)
    + (world.needsEnabled ? needsDefenseMod(c) : 0) + injuryDefenseMod(c)
    + affixMod(world, c, 'defense') + affixMod(world, c, 'evasion');
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
  const eliteMon = makeEliteCombatant(world, enc, nextId(world, 'MON'));
  if (eliteMon) monsters.push(eliteMon);
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
  // big creatures telegraph a heavy blow: one round of warning
  if (!m.charging && t.level >= 4 && rng.chance(0.25)) {
    m.charging = true;
    return { actor: m.id, type: 'defend', skillKey: 'charge-up' };
  }
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
    turns.push({ actorId: pa.actor, isMonster: false, initiative: c.initiative + affixMod(world, c, 'initiative') + Math.floor(c.attributes.dexterity / 4) + rng.die(6), action: pa });
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
      trainSkill(world, c, spell.heal || spell.cures ? 'healing' : 'magic');
      if (spell.heal && spell.healAll) {
        const healedNames: string[] = [];
        for (const pid of combat.partyIds) {
          const ally = world.characters[pid];
          if (!ally.alive) continue;
          const healed = rng.roll(spell.heal) + Math.floor(c.skills.magic / 2);
          ally.hp.current = Math.min(ally.hp.max, ally.hp.current + healed);
          if (ally.hp.current > 0) cureStatus(ally, 'unconscious');
          healedNames.push(`${ally.name} +${healed}`);
        }
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'heal', text: `${c.name} cast ${spell.name} over the whole party: ${healedNames.join(', ')}.` });
      } else if (spell.heal) {
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
  // ranged weapons need ammunition; loose an arrow per swing
  const w0 = weaponOf(world, c);
  if (w0?.ranged && w0.ammoProto) {
    const ammo = findAmmo(world, c, w0.ammoProto);
    if (!ammo) {
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'attack', detail: w0.name, result: 'info', text: `${c.name} reached for an arrow and found the quiver empty.` });
      return;
    }
    removeUnits(world, ammo, 1);
  }
  trainSkill(world, c, w0?.ranged ? 'archery' : 'swordsmanship');
  const weaponSkill = w0?.ranged ? Math.floor(c.skills.archery / 2) : Math.floor(c.skills.swordsmanship / 2);
  const roll = rng.die(20);
  const toHit = roll + c.attack + c.accuracy + weaponSkill + (skill?.toHitMod ?? 0) + statusAttackMod(c)
    + (world.needsEnabled ? needsAttackMod(c) : 0) + injuryAttackMod(c) + affixMod(world, c, 'attack');
  const detail = skill ? skill.name : w0?.name ?? 'bare hands';
  const targetDefense = t.defense + (m.elite?.defenseBonus ?? 0);
  if (roll !== 20 && (roll === 1 || toHit < targetDefense)) {
    record({ round: combat.round, actor: c.id, actorName: c.name, action: skill ? 'skill' : 'attack', targetName: m.name, detail, roll, result: 'miss', text: `${c.name} ${skill ? `used ${skill.name} against` : 'attacked'} ${m.name} and missed. (roll ${roll})` });
    return;
  }
  const opening = m.status.includes('stunned');
  const isCrit = roll === 20 || rng.chance((c.critChance + (skill?.critBonus ?? 0) + affixMod(world, c, 'critChance') + (opening ? 20 : 0)) / 100);
  let dmg = charDamage(world, c, rng, (skill?.dmgBonus ?? 0) + (opening ? 2 : 0));
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
    if (m.charging) {
      m.charging = false;
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'skill', targetName: m.name, detail: 'interrupt', result: 'status', text: `${c.name}'s blow INTERRUPTED ${m.name}'s wind-up — the massive strike dies unthrown.` });
    }
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
    world.killCounts[m.templateKey] = (world.killCounts[m.templateKey] ?? 0) + 1;
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
  if (action.skillKey === 'charge-up') {
    record({ round: combat.round, actor: m.id, actorName: m.name, action: 'defend', detail: 'telegraph', result: 'status', text: `${m.name} draws back, gathering itself for a massive blow — STUN IT OR BRACE.` });
    return;
  }
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
  const toHit = roll + t.attack + (m.elite?.attackBonus ?? 0);
  if (roll !== 20 && (roll === 1 || toHit < charDefense(world, target) + defBonus)) {
    record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', targetName: target.name, detail: 'attack', roll, result: 'miss', text: `${m.name} attacked ${target.name} and missed. (roll ${roll})` });
    return;
  }
  let dmg = Math.max(1, rng.roll(t.damage) + Math.floor((m.elite?.attackBonus ?? 0) / 2) - target.armor);
  let heavyNote = '';
  if (m.charging) {
    m.charging = false;
    if (combat.defending.includes(target.id)) {
      heavyNote = ` ${target.name} braced — the massive blow broke on their guard (halved).`;
      dmg = Math.max(1, Math.floor(dmg / 2));
    } else {
      dmg *= 2;
      heavyNote = ' — a MASSIVE blow!';
    }
  }
  target.hp.current = Math.max(0, target.hp.current - dmg);
  let inflictNote = '';
  const inflicts = m.elite?.inflicts ?? t.inflicts;
  if (inflicts && target.hp.current > 0 && rng.chance(inflicts.chance) && !hasStatus(target, inflicts.status)) {
    applyStatus(target, inflicts.status, undefined, m.name);
    if (hasStatus(target, inflicts.status)) inflictNote = ` ${target.name} is ${inflicts.status}!`;
  }
  record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', targetName: target.name, detail: 'attack', roll, result: 'hit', damage: dmg, statusApplied: inflictNote ? inflicts!.status : undefined, text: `${m.name} hit ${target.name} for ${dmg} damage.${heavyNote}${inflictNote}` });
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
    const xp = killed.reduce((s, m) => s + MONSTERS[m.templateKey].xp * (m.elite ? 2 : 1), 0);
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
    const injuryRng = new Rng((combat.seed ^ 0x9e3779b9) >>> 0);
    for (const c of survivors) {
      if (c.hp.current === 0) {
        c.hp.current = 1; // downed allies stabilize after victory
        cureStatus(c, 'unconscious');
        // going down can leave a mark that outlasts the fight
        const injury = rollInjury(c, injuryRng);
        if (injury) {
          c.injuries[c.injuries.length - 1].day = world.time.day;
          logEvent(world, 'injury', { character: c.id, injury }, `${c.name} took ${injury} — it will need proper treatment (temple or time won't fix it alone).`);
        }
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
  // political weight: killing a faction's people is noticed
  const MONSTER_FACTION: Record<string, string> = { 'red-knife-cutter': 'FAC_REDKNIVES', 'city-watchman': 'FAC_WATCH' };
  const facKills: Record<string, number> = {};
  for (const m of combat.monsters) {
    if (!m.alive && MONSTER_FACTION[m.templateKey]) {
      facKills[MONSTER_FACTION[m.templateKey]] = (facKills[MONSTER_FACTION[m.templateKey]] ?? 0) + 1;
    }
  }
  for (const [fac, n] of Object.entries(facKills)) {
    for (const id of combat.partyIds) {
      const c = world.characters[id];
      c.factionReputation[fac] = Math.max(-10, (c.factionReputation[fac] ?? 0) - n);
    }
    logEvent(world, 'faction.rep', { faction: fac, delta: -n, why: 'blood spilled' }, `${world.factions[fac]?.name ?? fac} will hear about their dead (reputation -${n}).`);
  }
  settleElites(world, combat.monsters, combat.outcome, new Rng((combat.seed ^ 0x51ed) >>> 0));
  if (combat.outcome === 'victory') driftCompanionBonds(world, combat.partyIds, new Rng((combat.seed ^ 0xb0bd) >>> 0));
  checkQuests(world);
  resolveWorldEventVictory(world, combat.outcome);
  logEvent(
    world,
    'combat.end',
    { outcome: combat.outcome, seed: combat.seed, rounds: combat.round, log: combat.log },
    `Combat ended in ${combat.outcome} after ${combat.round} round${combat.round > 1 ? 's' : ''} (${combat.encounterDesc}).`,
    { seed: combat.seed, location: combat.locationId, witnesses: combat.partyIds },
  );
}

/** Sensible auto-play for one party member's round. */
function autoAction(world: WorldState, combat: CombatState, c: Character): PlannedAction {
  const living = combat.monsters.filter((m) => m.alive && !m.fled);
  const target = living.find((m) => m.status.includes('stunned')) ?? living.reduce((a, b) => (a && a.hp.current <= b.hp.current ? a : b), living[0]);
  // heal the hurt first
  const hurt = combat.partyIds.map((id) => world.characters[id]).filter((a) => a.alive && a.hp.current > 0 && a.hp.current < a.hp.max * 0.4);
  const healSpell = c.abilities.find((k) => SPELLS[k]?.heal);
  if (hurt.length && healSpell && c.mana.current >= SPELLS[healSpell].mana) {
    return { actor: c.id, type: 'spell', spellKey: healSpell, target: hurt[0].id };
  }
  if (c.hp.current < c.hp.max * 0.3) {
    const potion = [...c.inventory, ...world.partyInventory].find((i) => world.items[i]?.kind === 'potion' && world.items[i]?.healing);
    if (potion) return { actor: c.id, type: 'item', itemId: potion, target: c.id };
  }
  // brace against a telegraphed blow if fragile
  if (living.some((m) => m.charging) && c.hp.current < c.hp.max * 0.5) return { actor: c.id, type: 'defend' };
  // interrupt a charger with a stun skill
  const stunSkill = c.abilities.find((k) => SKILLS[k]?.stuns);
  if (living.some((m) => m.charging) && stunSkill && c.stamina.current >= SKILLS[stunSkill].stamina) {
    return { actor: c.id, type: 'skill', skillKey: stunSkill, target: living.find((m) => m.charging)!.id };
  }
  // spend big abilities when rich
  const dmgSpell = c.abilities.filter((k) => SPELLS[k]?.damage).sort((a, b) => SPELLS[b].mana - SPELLS[a].mana)[0];
  if (dmgSpell && c.mana.current >= SPELLS[dmgSpell].mana * 1.5 && target) {
    return { actor: c.id, type: 'spell', spellKey: dmgSpell, target: target.id };
  }
  const skill = c.abilities.filter((k) => SKILLS[k]).sort((a, b) => SKILLS[b].stamina - SKILLS[a].stamina)[0];
  if (skill && c.stamina.current >= SKILLS[skill].stamina * 2 && target) {
    return { actor: c.id, type: 'skill', skillKey: skill, target: target.id };
  }
  return { actor: c.id, type: 'attack', target: target?.id };
}

/** Run one round on autopilot. */
export function autoRound(world: WorldState): void {
  const combat = world.combat;
  if (!combat || !combat.active) return;
  const planned = combat.partyIds
    .map((id) => world.characters[id])
    .filter((c) => c && c.hp.current > 0)
    .map((c) => autoAction(world, combat, c));
  resolveRound(world, planned);
}

/** Let them fight: auto-rounds until the fight ends (bounded). */
export function autoResolve(world: WorldState): void {
  let guard = 0;
  while (world.combat?.active && guard++ < 60) autoRound(world);
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
