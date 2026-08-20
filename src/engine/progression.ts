// Elder Scrolls-style progression: skills rise because you USE them,
// levels grant attribute points the author assigns, and gear rolls
// craftsmanship quality and magical affixes. All numbers live here.

import type { Attributes, Character, Item, Skills, WorldState } from './types';
import { Rng } from './rng';
import { logEvent } from './world';

// ---------- skill-by-use ----------
export const SKILL_CAP = 25;

/** Uses needed to go from `current` to `current + 1`. */
export function usesForNextRank(current: number): number {
  return (current + 1) * 5;
}

/** Record one use of a skill; rank up when the practice adds up. */
export function trainSkill(world: WorldState, c: Character, key: keyof Skills): void {
  if (c.skills[key] >= SKILL_CAP) return;
  c.skillXp ??= {};
  c.skillXp[key] = (c.skillXp[key] ?? 0) + 1;
  if (c.skillXp[key]! >= usesForNextRank(c.skills[key])) {
    c.skillXp[key] = 0;
    c.skills[key] += 1;
    logEvent(world, 'skill.rankup', { character: c.id, skill: key, rank: c.skills[key] }, `${c.name}'s ${key} improved to ${c.skills[key]} — practice, not theory.`);
  }
}

// ---------- attribute points ----------
export function spendAttributePoint(world: WorldState, c: Character, attr: keyof Attributes): string | null {
  if ((c.attributePoints ?? 0) <= 0) return 'No attribute points to spend.';
  c.attributePoints = (c.attributePoints ?? 0) - 1;
  c.attributes[attr] += 1;
  if (attr === 'constitution') {
    c.hp.max += 2;
    c.hp.current += 2;
  }
  if (attr === 'intelligence') c.mana.max += 2;
  logEvent(world, 'attribute.spent', { character: c.id, attr, value: c.attributes[attr] }, `${c.name} grew: ${attr} is now ${c.attributes[attr]}.`);
  return null;
}

// ---------- gear quality & affixes ----------
const QUALITIES: { key: NonNullable<Item['quality']>; bonus: number; valueMult: number; chance: number }[] = [
  { key: 'fine', bonus: 1, valueMult: 1.6, chance: 0.18 },
  { key: 'superior', bonus: 2, valueMult: 2.5, chance: 0.06 },
  { key: 'exquisite', bonus: 3, valueMult: 4, chance: 0.02 },
];

export const AFFIXES: { name: string; stat: NonNullable<Item['affix']>['stat']; amount: number }[] = [
  { name: 'of the Bull', stat: 'attack', amount: 1 },
  { name: 'of the Wall', stat: 'defense', amount: 2 },
  { name: 'of the Fox', stat: 'evasion', amount: 2 },
  { name: 'of the Adder', stat: 'critChance', amount: 5 },
  { name: 'of the Wind', stat: 'initiative', amount: 2 },
  { name: 'of the Warlord', stat: 'attack', amount: 2 },
  { name: 'of the Mountain', stat: 'defense', amount: 3 },
];

function bumpDamage(dice: string, bonus: number): string {
  const m = dice.match(/^(\d+d\d+)([+-]\d+)?$/);
  if (!m) return dice;
  const mod = (m[2] ? parseInt(m[2], 10) : 0) + bonus;
  return mod === 0 ? m[1] : `${m[1]}${mod >= 0 ? '+' : ''}${mod}`;
}

/**
 * Roll craftsmanship and enchantment onto a weapon/armor piece.
 * `luck` shifts the odds (boss hoards roll hot).
 */
export function rollGearMods(rng: Rng, item: Item, luck = 1): void {
  if (item.kind !== 'weapon' && item.kind !== 'armor' && item.kind !== 'shield') return;
  // quality
  const q = rng.next() / luck;
  let acc = 0;
  for (const grade of [...QUALITIES].reverse()) {
    acc += grade.chance;
    if (q < acc) {
      item.quality = grade.key;
      if (item.damage) item.damage = bumpDamage(item.damage, grade.bonus);
      if (item.defense !== undefined) item.defense += grade.bonus;
      item.value = Math.round(item.value * grade.valueMult);
      item.name = `${grade.key[0].toUpperCase()}${grade.key.slice(1)} ${item.name}`;
      break;
    }
  }
  // affix
  if (rng.chance(Math.min(0.5, 0.12 * luck))) {
    const affix = rng.pick(AFFIXES);
    item.affix = { ...affix };
    item.value = Math.round(item.value * 2 + 150);
    item.name = `${item.name} ${affix.name}`;
    if ((item.tier === 'mundane' || item.tier === 'common') && luck > 1) item.tier = 'uncommon';
  }
}

/** Sum of equipped-affix contributions to a combat stat. */
export function affixMod(world: WorldState, c: Character, stat: NonNullable<Item['affix']>['stat']): number {
  let total = 0;
  for (const iid of Object.values(c.equipment)) {
    const it = iid ? world.items[iid] : null;
    if (it && !it.broken && it.affix?.stat === stat) total += it.affix.amount;
  }
  return total;
}
