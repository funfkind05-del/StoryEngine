// Named elites and the rival system. Encounters sometimes field an
// ELITE — a modifier and a name. Kill it for glory and better loot;
// let it escape (or flee yourself) and it PERSISTS: it heals, grows
// stronger, remembers the scar you gave it, and comes looking. The
// simulation grows its own recurring antagonists.

import type { CombatantMonster, PendingEncounter, WorldState } from './types';
import { MONSTERS } from './monsters';
import { Rng } from './rng';
import { logEvent, partyMembers } from './world';

export interface EliteModifier {
  key: string;
  label: string; // 'the Venomous'
  hpMult: number;
  attackBonus: number;
  defenseBonus: number;
  inflicts?: { status: 'poisoned' | 'bleeding' | 'burning'; chance: number };
}

export const ELITE_MODIFIERS: EliteModifier[] = [
  { key: 'venomous', label: 'the Venomous', hpMult: 1.4, attackBonus: 1, defenseBonus: 0, inflicts: { status: 'poisoned', chance: 0.4 } },
  { key: 'gilded', label: 'Gilded-Tooth', hpMult: 1.6, attackBonus: 1, defenseBonus: 1 },
  { key: 'frenzied', label: 'the Frenzied', hpMult: 1.3, attackBonus: 3, defenseBonus: -1 },
  { key: 'stonehide', label: 'Stonehide', hpMult: 1.5, attackBonus: 0, defenseBonus: 3 },
  { key: 'grim', label: 'the Grim', hpMult: 1.8, attackBonus: 2, defenseBonus: 1 },
  { key: 'red-handed', label: 'Red-Handed', hpMult: 1.4, attackBonus: 2, defenseBonus: 0, inflicts: { status: 'bleeding', chance: 0.35 } },
];

const ELITE_NAMES = ['Vhessa', 'Grulk', 'Marrow', 'Skiv', 'Old Tench', 'Bracka', 'Hollow-Eye', 'Nine-Fingers', 'Sallow', 'Kruun', 'The Widow', 'Pale Jak'];

export interface Rival {
  id: string;
  name: string; // 'Vhessa the Venomous'
  templateKey: string;
  modifierKey: string;
  power: number; // grows each escape
  scars: string[];
  lastSeenDay: number;
  grudge: number;
  defeated: boolean;
}

/** Maybe elevate one member of a fresh encounter into a named elite. */
export function maybeElevateElite(world: WorldState, enc: PendingEncounter, rng: Rng): void {
  if (enc.elite) return;
  // a living rival may take the field instead of a fresh elite
  const living = (world.rivals ?? []).filter((r) => !r.defeated);
  if (living.length && rng.chance(0.25)) {
    const rival = rng.pick(living);
    // only where their kind plausibly roams
    if (enc.monsters.some((m) => m.templateKey === rival.templateKey) || rng.chance(0.3)) {
      enc.elite = { templateKey: rival.templateKey, name: rival.name, modifierKey: rival.modifierKey, rivalId: rival.id, power: rival.power };
      enc.description = `${enc.description} — and ${rival.name}, who remembers you`;
      rival.lastSeenDay = world.time.day;
      logEvent(world, 'rival.returns', { rival: rival.id, power: rival.power }, `${rival.name} has found the party again — stronger, and carrying the grudge${rival.scars.length ? ` and ${rival.scars[rival.scars.length - 1]}` : ''}.`, { location: enc.locationId, witnesses: partyMembers(world).map((c) => c.id) });
      return;
    }
  }
  if (!rng.chance(0.12)) return;
  const pool = enc.monsters.filter((m) => MONSTERS[m.templateKey]);
  if (!pool.length) return;
  const group = rng.pick(pool);
  const mod = rng.pick(ELITE_MODIFIERS);
  const name = `${rng.pick(ELITE_NAMES)} ${mod.label}`;
  enc.elite = { templateKey: group.templateKey, name, modifierKey: mod.key, power: 0 };
  enc.description = `${enc.description} — led by ${name}`;
}

/** Build the elite's combat instance from the encounter marker. */
export function makeEliteCombatant(_world: WorldState, enc: PendingEncounter, id: string): CombatantMonster | null {
  if (!enc.elite) return null;
  const t = MONSTERS[enc.elite.templateKey];
  const mod = ELITE_MODIFIERS.find((m) => m.key === enc.elite!.modifierKey) ?? ELITE_MODIFIERS[0];
  const power = enc.elite.power ?? 0;
  const hp = Math.round(t.hp * mod.hpMult * (1 + power * 0.25));
  return {
    id,
    templateKey: enc.elite.templateKey,
    name: enc.elite.name,
    hp: { current: hp, max: hp },
    status: [],
    alive: true,
    fled: false,
    elite: { name: enc.elite.name, modifierKey: mod.key, rivalId: enc.elite.rivalId, attackBonus: mod.attackBonus + power, defenseBonus: mod.defenseBonus + Math.floor(power / 2), inflicts: mod.inflicts },
  };
}

/** After combat: escaped elites become (or deepen) rivals; dead ones close accounts. */
export function settleElites(world: WorldState, monsters: CombatantMonster[], outcome: string, rng: Rng): void {
  world.rivals ??= [];
  for (const m of monsters) {
    if (!m.elite) continue;
    const existing = world.rivals.find((r) => r.id === m.elite!.rivalId);
    if (!m.alive) {
      if (existing) {
        existing.defeated = true;
        logEvent(world, 'rival.slain', { rival: existing.id }, `${existing.name} is dead at last. The grudge is settled — theirs, anyway.`, { witnesses: partyMembers(world).map((c) => c.id) });
      } else {
        logEvent(world, 'elite.slain', { name: m.name }, `${m.name} will not be remembered kindly, or at all.`);
      }
      continue;
    }
    // it lives: it fled, or the party did
    const scar = m.hp.current < m.hp.max * 0.5 ? rng.pick(['a wound that never closed right', 'a limp it blames on you', 'a burn scar with your name on it', 'one eye fewer than before']) : '';
    if (existing) {
      existing.power += 1;
      existing.grudge += 1;
      existing.lastSeenDay = world.time.day;
      if (scar) existing.scars.push(scar);
      logEvent(world, 'rival.escaped', { rival: existing.id, power: existing.power }, `${existing.name} slipped away again${scar ? `, carrying ${scar}` : ''}. Next time it will be worse.`);
    } else if (outcome === 'fled' || m.fled) {
      const rival: Rival = {
        id: `RIV_${world.time.day}_${rng.int(100, 999)}`,
        name: m.name,
        templateKey: m.templateKey,
        modifierKey: m.elite.modifierKey,
        power: 1,
        scars: scar ? [scar] : [],
        lastSeenDay: world.time.day,
        grudge: 1,
        defeated: false,
      };
      world.rivals.push(rival);
      logEvent(world, 'rival.born', { rival: rival.id, name: rival.name }, `${rival.name} escaped the fight alive — and things like that remember. A rival walks Blackwall now.`, { witnesses: partyMembers(world).map((c) => c.id) });
    }
  }
}

export function livingRivals(world: WorldState): Rival[] {
  return (world.rivals ?? []).filter((r) => !r.defeated);
}
