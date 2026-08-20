// Elder Scrolls-style progression: skills rise because you USE them,
// levels grant attribute points the author assigns, and gear rolls
// craftsmanship quality and magical affixes. All numbers live here.

import type { Attributes, Character, CharClass, Item, Skills, WorldState } from './types';
import { Rng } from './rng';
import { addMinutes, logEvent, partyMembers } from './world';
import { fmtMoney } from './rules';

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
    if ((item.tier === 'mundane' || item.tier === 'common') && luck > 1) item.tier = 'uncommon';
    // dual-affix rares: only hot rolls (boss hoards, chests, master crafts)
    if (luck >= 1.5 && rng.chance(0.25)) {
      const second = rng.pick(AFFIXES.filter((a) => a.stat !== affix.stat));
      item.affix2 = { ...second };
      item.value = Math.round(item.value * 1.8 + 200);
      if (item.tier === 'mundane' || item.tier === 'common' || item.tier === 'uncommon') item.tier = 'rare';
    }
    // half of enchanted finds come up mute — the magic is real but unread
    if (rng.chance(0.5)) item.unidentified = true;
    else applyAffixNames(item);
  }
}

/** Fold known affix names into the display name (once). */
export function applyAffixNames(item: Item): void {
  if (item.affix && !item.name.includes(item.affix.name)) item.name = `${item.name} ${item.affix.name}`;
  if (item.affix2 && !item.name.includes(item.affix2.name)) item.name = `${item.name} and ${item.affix2.name.replace(/^of /, 'the ')}`;
}

// ---------- identification ----------
export const IDENTIFY_FEE = 80; // copper, at the Arcane College

/** Kess reads sigils for free once her second arc chapter is closed and she walks with you. */
export function canKessIdentify(world: WorldState): boolean {
  const kess = world.characters['CHAR_KESS'];
  if (!kess?.inParty || !kess.alive) return false;
  return Object.values(world.quests).some((q) => q.personal === 'CHAR_KESS' && (q.personalStage ?? 0) >= 2 && q.status === 'completed');
}

export function identifyItem(world: WorldState, itemId: string): string | null {
  const item = world.items[itemId];
  if (!item) return 'No such thing.';
  if (!item.unidentified) return 'Nothing hidden there.';
  const mc = world.characters[world.mcId];
  if (canKessIdentify(world)) {
    item.unidentified = false;
    applyAffixNames(item);
    item.history.push(`Read by Kess on Day ${world.time.day}`);
    addMinutes(world, 15);
    logEvent(world, 'item.identified', { item: item.id, by: 'CHAR_KESS' }, `Kess turned the piece over a candleflame, lips moving, and named it: ${item.name}. No fee. A small, pleased smile.`, { witnesses: partyMembers(world).map((c) => c.id) });
    return null;
  }
  const loc = world.locations[world.partyLocation];
  if (loc?.trainerFor !== 'mage') return 'The magic on it is real but unread. The Arcane College identifies for a fee — or Kess could, if she trusted you with her past.';
  if (mc.money < IDENTIFY_FEE) return `The College clerk wants ${fmtMoney(IDENTIFY_FEE)} to read it.`;
  mc.money -= IDENTIFY_FEE;
  addMinutes(world, 30);
  item.unidentified = false;
  applyAffixNames(item);
  item.history.push(`Identified at ${loc.name} on Day ${world.time.day}`);
  logEvent(world, 'item.identified', { item: item.id, fee: IDENTIFY_FEE }, `A College reader named the enchantment for ${fmtMoney(IDENTIFY_FEE)}: ${item.name}.`, { location: world.partyLocation });
  return null;
}

// ---------- named uniques ----------
interface UniqueDef {
  match: (item: Item) => boolean;
  name: string;
  affixes: [NonNullable<Item['affix']>, NonNullable<Item['affix']>?];
  lore: string;
}

export const UNIQUES: UniqueDef[] = [
  {
    match: (i) => i.kind === 'weapon' && !i.ranged,
    name: 'Oathbiter',
    affixes: [{ name: 'of the Warlord', stat: 'attack', amount: 2 }, { name: 'of the Adder', stat: 'critChance', amount: 8 }],
    lore: 'Carried by three captains of the old Wall garrison; every one of them broke an oath with it in hand, and every oath broke them back. It cuts easiest when the wielder is lying to someone.',
  },
  {
    match: (i) => i.kind === 'weapon' && i.ranged === true,
    name: 'The Long Quiet',
    affixes: [{ name: 'of the Wind', stat: 'initiative', amount: 3 }, { name: 'of the Adder', stat: 'critChance', amount: 6 }],
    lore: "A poacher's bow from before the Wall was black. The story goes that its arrows arrive before their sound does, and that the fletcher who made it was never heard speaking again.",
  },
  {
    match: (i) => i.kind === 'armor',
    name: 'Gravewarden’s Coat',
    affixes: [{ name: 'of the Mountain', stat: 'defense', amount: 3 }, { name: 'of the Fox', stat: 'evasion', amount: 2 }],
    lore: 'Stitched for the last warden of Graverow, who walked the tomb-streets forty years and died in bed. The lining is sewn with prayer-strips in a script the Temple no longer teaches.',
  },
  {
    match: (i) => i.kind === 'shield',
    name: 'The Polite Refusal',
    affixes: [{ name: 'of the Wall', stat: 'defense', amount: 3 }],
    lore: 'A duelling-buckler with seventeen notches and no owner’s mark. Whoever carried it never started anything — and never lost anything, either.',
  },
];

/** Boss hoards can carry a named piece. One of each name per world, ever. */
export function maybeMakeUnique(world: WorldState, rng: Rng, item: Item): boolean {
  if (item.kind !== 'weapon' && item.kind !== 'armor' && item.kind !== 'shield') return false;
  if (!rng.chance(0.1)) return false;
  const candidates = UNIQUES.filter((u) => u.match(item) && !Object.values(world.items).some((it) => it.name === u.name));
  if (!candidates.length) return false;
  const u = rng.pick(candidates);
  item.name = u.name;
  item.tier = 'legendary';
  item.quality = 'exquisite';
  item.affix = { ...u.affixes[0] };
  if (u.affixes[1]) item.affix2 = { ...u.affixes[1] };
  item.unidentified = false;
  item.lore = u.lore;
  item.value = Math.max(item.value * 6, 4000);
  if (item.damage) item.damage = bumpDamage(item.damage, 3);
  if (item.defense !== undefined) item.defense += 3;
  item.history.push('A named piece out of the old stories');
  return true;
}

// ---------- class ascension at 25 ----------
export interface AscensionPath {
  key: string;
  charClass: CharClass;
  label: string;
  blurb: string;
  attrs: Partial<Attributes>;
  hp?: number;
  mana?: number;
  defense?: number;
  evasion?: number;
  initiative?: number;
  critChance?: number;
  /** capstone ability granted early */
  ability: string;
}

export const ASCENSIONS: AscensionPath[] = [
  { key: 'warlord', charClass: 'fighter', label: 'Warlord', blurb: 'The line moves when you say it moves.', attrs: { strength: 2 }, hp: 8, ability: 'avatar-of-war' },
  { key: 'worldbreaker', charClass: 'fighter', label: 'Worldbreaker', blurb: 'Hit the thing until it is a different shape.', attrs: { constitution: 2 }, hp: 12, defense: 1, ability: 'worldbreaker' },
  { key: 'shadowdancer', charClass: 'rogue', label: 'Shadowdancer', blurb: 'Be plural. Be elsewhere.', attrs: { dexterity: 2 }, evasion: 3, ability: 'thousand-cuts' },
  { key: 'kingslayer', charClass: 'rogue', label: 'Kingslayer', blurb: 'One cut, correctly placed, outweighs a war.', attrs: { dexterity: 1, wisdom: 1 }, critChance: 8, ability: 'kingslayer' },
  { key: 'archmage', charClass: 'mage', label: 'Archmage', blurb: 'The College will hate this.', attrs: { intelligence: 2 }, mana: 12, ability: 'cataclysm' },
  { key: 'unmaker', charClass: 'mage', label: 'Unmaker', blurb: 'Everything is a suggestion.', attrs: { intelligence: 1, wisdom: 1 }, mana: 8, critChance: 5, ability: 'unmaking' },
  { key: 'hierophant', charClass: 'priest', label: 'Hierophant', blurb: 'The god answers faster now. Or you stopped needing to ask.', attrs: { wisdom: 2 }, mana: 10, ability: 'mass-renewal' },
  { key: 'avenger', charClass: 'priest', label: 'Avenger', blurb: 'Mercy first. Then this.', attrs: { wisdom: 1, strength: 1 }, hp: 6, ability: 'divine-wrath' },
  { key: 'stormcaller', charClass: 'ranger', label: 'Stormcaller', blurb: 'The sky has opinions and you carry them quivered.', attrs: { dexterity: 2 }, ability: 'storm-of-arrows' },
  { key: 'windwalker', charClass: 'ranger', label: 'Windwalker', blurb: 'Arrive already gone.', attrs: { dexterity: 1, constitution: 1 }, initiative: 3, ability: 'wind-that-kills' },
];

export const ASCENSION_LEVEL = 25;
export const ASCENSION_FEE = 2000; // copper

export function ascensionOptions(c: Character): AscensionPath[] {
  if (c.ascension || c.level < ASCENSION_LEVEL) return [];
  return ASCENSIONS.filter((a) => a.charClass === c.charClass);
}

/** Take the rite at your class trainer: a title, a stat package, and a capstone ability early. */
export function chooseAscension(world: WorldState, charId: string, pathKey: string): string | null {
  const c = world.characters[charId];
  if (!c) return 'Who?';
  const path = ASCENSIONS.find((a) => a.key === pathKey);
  if (!path || path.charClass !== c.charClass) return 'That path is not open to this class.';
  if (c.ascension) return `${c.name} has already ascended.`;
  if (c.level < ASCENSION_LEVEL) return `Ascension asks for level ${ASCENSION_LEVEL}.`;
  const loc = world.locations[world.partyLocation];
  const atTrainer = loc?.trainerFor === c.charClass || (loc?.temple && c.charClass === 'priest');
  if (!atTrainer) return 'The rite happens at the class hall, before the masters.';
  const payer = world.characters[world.mcId];
  if (payer.money < ASCENSION_FEE) return `The rite costs ${fmtMoney(ASCENSION_FEE)}.`;
  payer.money -= ASCENSION_FEE;
  addMinutes(world, 480); // a day of trial and vigil
  c.ascension = path.key;
  c.title = path.label;
  for (const [attr, amt] of Object.entries(path.attrs)) {
    c.attributes[attr as keyof Attributes] += amt ?? 0;
  }
  if (path.hp) { c.hp.max += path.hp; c.hp.current = c.hp.max; }
  if (path.mana) { c.mana.max += path.mana; c.mana.current = c.mana.max; }
  if (path.defense) c.defense += path.defense;
  if (path.evasion) c.evasion += path.evasion;
  if (path.initiative) c.initiative += path.initiative;
  if (path.critChance) c.critChance += path.critChance;
  if (!c.abilities.includes(path.ability)) c.abilities.push(path.ability);
  c.permanentBonuses.push(`Ascension — ${path.label}: ${path.blurb}`);
  logEvent(world, 'ascension', { character: c.id, path: path.key }, `${c.name} took the rite of ascension and rose as ${path.label}. ${path.blurb}`, { location: world.partyLocation, witnesses: partyMembers(world).map((x) => x.id) });
  return null;
}

/** Sum of equipped-affix contributions to a combat stat (both affix slots). */
export function affixMod(world: WorldState, c: Character, stat: NonNullable<Item['affix']>['stat']): number {
  let total = 0;
  for (const iid of Object.values(c.equipment)) {
    const it = iid ? world.items[iid] : null;
    if (!it || it.broken) continue;
    if (it.affix?.stat === stat) total += it.affix.amount;
    if (it.affix2?.stat === stat) total += it.affix2.amount;
  }
  return total;
}
