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
  { name: 'of the Tide', stat: 'initiative', amount: 3 },
  { name: 'of the Lamplight', stat: 'evasion', amount: 3 },
  { name: 'of the Open Hand', stat: 'critChance', amount: 7 },
  { name: 'of the Pact', stat: 'attack', amount: 3 },
  { name: 'of the Bonewarden', stat: 'defense', amount: 4 },
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
    match: (i) => i.kind === 'weapon' && !i.ranged,
    name: 'Lamplighter’s Answer',
    affixes: [{ name: 'of the Lamplight', stat: 'evasion', amount: 3 }, { name: 'of the Wind', stat: 'initiative', amount: 2 }],
    lore: 'A hooked snuffing-pole reforged into a fighting staff after the Winter of Bad Lamps. The Union does not confirm the winter happened; the staff is inconveniently covered in notches.',
  },
  {
    match: (i) => i.kind === 'weapon' && !i.ranged,
    name: 'The Salt Queen’s Regret',
    affixes: [{ name: 'of the Tide', stat: 'initiative', amount: 3 }, { name: 'of the Adder', stat: 'critChance', amount: 6 }],
    lore: 'Cut from a single crystal of the deep pans. It weeps in fresh air — thin, briny lines down the blade — and dries the moment it draws blood, which the surviving works-clerks agreed was worse.',
  },
  {
    match: (i) => i.kind === 'armor',
    name: 'Vestment of the Chiseled Name',
    affixes: [{ name: 'of the Pact', stat: 'attack', amount: 3 }, { name: 'of the Fox', stat: 'evasion', amount: 2 }],
    lore: 'Robes from the Nameless Chapel’s last consecrated year. The embroidered name on the hem has been unpicked so carefully that reading the empty stitching almost — almost — pronounces something.',
  },
  {
    match: (i) => i.kind === 'weapon' && i.ranged === true,
    name: 'The Fifth-Night Encore',
    affixes: [{ name: 'of the Open Hand', stat: 'critChance', amount: 7 }],
    lore: 'A performer’s bow — the stringed kind, rebuilt into the shooting kind — that once belonged to a Crown singer who took requests until the wrong table made one. The last song is carved along the belly. Nobody plays it.',
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
  { key: 'songweaver', charClass: 'bard', label: 'Songweaver', blurb: 'The city hums your choruses without knowing why.', attrs: { charisma: 2 }, mana: 10, ability: 'requiem' },
  { key: 'doomsinger', charClass: 'bard', label: 'Doomsinger', blurb: 'Some songs end things.', attrs: { charisma: 1, intelligence: 1 }, critChance: 5, ability: 'the-last-song' },
  { key: 'stormfist', charClass: 'monk', label: 'Stormfist', blurb: 'The strike arrives before the decision to strike.', attrs: { strength: 1, dexterity: 1 }, initiative: 2, ability: 'empty-body' },
  { key: 'still-water', charClass: 'monk', label: 'Still Water', blurb: 'Nothing moves you. Then everything does.', attrs: { constitution: 2 }, hp: 10, evasion: 2, ability: 'fist-of-the-void' },
  { key: 'runeknight', charClass: 'spellblade', label: 'Runeknight', blurb: 'Steel that remembers every sigil cut into it.', attrs: { strength: 1, intelligence: 1 }, defense: 1, ability: 'blade-tempest' },
  { key: 'stormblade', charClass: 'spellblade', label: 'Stormblade', blurb: 'The sword is the wand. Always was.', attrs: { dexterity: 2 }, critChance: 6, ability: 'edge-of-dawn' },
  { key: 'voidcaller', charClass: 'warlock', label: 'Voidcaller', blurb: 'What answers has no name, and it likes you.', attrs: { intelligence: 2 }, mana: 12, ability: 'the-hungry-door' },
  { key: 'pactlord', charClass: 'warlock', label: 'Pactlord', blurb: 'You read the fine print. You wrote some of it.', attrs: { intelligence: 1, wisdom: 1 }, mana: 8, critChance: 4, ability: 'name-eater' },
  { key: 'lamplord', charClass: 'paladin', label: 'Lamplord', blurb: 'Where you stand, the dark files a grievance.', attrs: { constitution: 2 }, hp: 10, defense: 1, ability: 'last-vigil' },
  { key: 'dawnbreaker', charClass: 'paladin', label: 'Dawnbreaker', blurb: 'Some vows are weapons. Yours is a sunrise.', attrs: { strength: 1, wisdom: 1 }, hp: 6, critChance: 4, ability: 'daybreak' },
  { key: 'gravelord', charClass: 'necromancer', label: 'Gravelord', blurb: 'The dead take a knee. It is a long ceremony.', attrs: { intelligence: 2 }, mana: 12, ability: 'legion-of-the-dead' },
  { key: 'pale-shepherd', charClass: 'necromancer', label: 'Pale Shepherd', blurb: 'Every flock comes home eventually. You keep the gate.', attrs: { intelligence: 1, wisdom: 1 }, mana: 8, critChance: 4, ability: 'the-grey-court' },
  { key: 'pit-king', charClass: 'berserker', label: 'Pit-King', blurb: 'The crowd crowned you. The crowd is not wrong.', attrs: { strength: 2 }, hp: 12, ability: 'the-long-madness' },
  { key: 'red-saint', charClass: 'berserker', label: 'Red Saint', blurb: 'They pray to you the way you pray to nothing.', attrs: { constitution: 2 }, hp: 10, critChance: 6, ability: 'the-last-red-day' },
  { key: 'core-formation', charClass: 'cultivator', label: 'Core Formation', blurb: 'The breath condenses. The furnace becomes a sun, pocket-sized.', attrs: { constitution: 1, wisdom: 1 }, hp: 8, mana: 8, ability: 'mountain-splitting-fist' },
  { key: 'sword-heart', charClass: 'cultivator', label: 'Sword Heart', blurb: 'Ten thousand cuts, one intention.', attrs: { dexterity: 2 }, critChance: 6, ability: 'tribulation-lightning' },
  { key: 'master-of-mutagens', charClass: 'alchemist', label: 'Master of Mutagens', blurb: 'You drank the early drafts. It shows. It HELPS.', attrs: { constitution: 2 }, hp: 10, ability: 'the-perfect-solvent' },
  { key: 'the-white-alchemist', charClass: 'alchemist', label: 'The White Alchemist', blurb: 'Death keeps sending back your work, improved.', attrs: { intelligence: 2 }, mana: 12, ability: 'panacea' },
  { key: 'tide-priest', charClass: 'tidecaller', label: 'Tide-Priest', blurb: 'The old sea takes your calls now.', attrs: { wisdom: 2 }, mana: 12, ability: 'tide-of-the-old-sea' },
  { key: 'keeper-of-fathoms', charClass: 'tidecaller', label: 'Keeper of Fathoms', blurb: 'What the deep holds, you hold jointly.', attrs: { intelligence: 1, constitution: 1 }, hp: 8, ability: 'the-black-fathom' },
  { key: 'gate-of-horn', charClass: 'oneiromancer', label: 'Gate of Horn', blurb: 'True dreams pass through you. Some stay.', attrs: { wisdom: 2 }, mana: 12, ability: 'wake-them-never' },
  { key: 'gate-of-ivory', charClass: 'oneiromancer', label: 'Gate of Ivory', blurb: 'False dreams too. You stopped judging.', attrs: { intelligence: 2 }, critChance: 5, mana: 8, ability: 'the-lucid-city' },
];

export const ASCENSION_LEVEL = 25;
export const ASCENSION_FEE = 2000; // copper

// ---------- the three evolutions of a career ----------
// L10 CALLING: the trade notices you. Small, early, shapes the middle game.
// L25 ASCENSION: the rite (above). L40 TRANSCENDENCE: what lives past titles.

export interface CallingPath {
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
}

export const CALLING_LEVEL = 10;
export const CALLING_FEE = 500;
export const CALLINGS: CallingPath[] = [
  { key: 'vanguard', charClass: 'fighter', label: 'Vanguard', blurb: 'First through every door.', attrs: { strength: 1 }, hp: 4 },
  { key: 'bulwark', charClass: 'fighter', label: 'Bulwark', blurb: 'The door, when the door is needed.', attrs: { constitution: 1 }, defense: 1 },
  { key: 'knife-artist', charClass: 'rogue', label: 'Knife Artist', blurb: 'It is called work because it pays.', attrs: { dexterity: 1 }, critChance: 3 },
  { key: 'second-story', charClass: 'rogue', label: 'Second-Story', blurb: 'Locks are a suggestion. Walls, an opinion.', attrs: { dexterity: 1 }, evasion: 2 },
  { key: 'pyromant', charClass: 'mage', label: 'Pyromant', blurb: 'The College teaches restraint. Later.', attrs: { intelligence: 1 }, mana: 6 },
  { key: 'scholar-of-frost', charClass: 'mage', label: 'Scholar of Frost', blurb: 'Cold keeps. Cold waits.', attrs: { wisdom: 1 }, mana: 4, defense: 1 },
  { key: 'almoner', charClass: 'priest', label: 'Almoner', blurb: 'The god counts what you give away.', attrs: { wisdom: 1 }, mana: 5 },
  { key: 'flame-warden', charClass: 'priest', label: 'Flame Warden', blurb: 'Some prayers are said with a mace.', attrs: { strength: 1 }, hp: 4 },
  { key: 'pathfinder', charClass: 'ranger', label: 'Pathfinder', blurb: 'You have been lost exactly once. It bothered you.', attrs: { wisdom: 1 }, initiative: 2 },
  { key: 'deadeye', charClass: 'ranger', label: 'Deadeye', blurb: 'Distance is a rumor.', attrs: { dexterity: 1 }, critChance: 3 },
  { key: 'crowd-favorite', charClass: 'bard', label: 'Crowd Favorite', blurb: 'They came for the ale. They stayed.', attrs: { charisma: 1 }, mana: 4 },
  { key: 'chronicler', charClass: 'bard', label: 'Chronicler', blurb: 'Every song is testimony.', attrs: { intelligence: 1 }, mana: 4 },
  { key: 'iron-palm', charClass: 'monk', label: 'Iron Palm', blurb: 'The board did not break itself.', attrs: { strength: 1 }, hp: 4 },
  { key: 'leaf-on-water', charClass: 'monk', label: 'Leaf on Water', blurb: 'Struck at, not struck.', attrs: { dexterity: 1 }, evasion: 2 },
  { key: 'edge-scribe', charClass: 'spellblade', label: 'Edge-Scribe', blurb: 'The sigils get smaller. The cuts do not.', attrs: { intelligence: 1 }, mana: 4 },
  { key: 'duelist', charClass: 'spellblade', label: 'Duelist', blurb: 'One opponent at a time, as a courtesy.', attrs: { dexterity: 1 }, critChance: 3 },
  { key: 'bound-scholar', charClass: 'warlock', label: 'Bound Scholar', blurb: 'You take notes. Something reads them.', attrs: { intelligence: 1 }, mana: 6 },
  { key: 'midnight-clerk', charClass: 'warlock', label: 'Midnight Clerk', blurb: 'The pact has paperwork. You are the paperwork.', attrs: { wisdom: 1 }, mana: 4, defense: 1 },
  { key: 'lantern-squire', charClass: 'paladin', label: 'Lantern Squire', blurb: 'Carry the light. Mind the oil.', attrs: { constitution: 1 }, hp: 4 },
  { key: 'oath-sworn', charClass: 'paladin', label: 'Oath-Sworn', blurb: 'The words were simple. Keeping them is not.', attrs: { wisdom: 1 }, mana: 4 },
  { key: 'bone-picker', charClass: 'necromancer', label: 'Bone-Picker', blurb: 'Everything the graves keep, they keep badly.', attrs: { intelligence: 1 }, mana: 6 },
  { key: 'quiet-student', charClass: 'necromancer', label: 'Quiet Student', blurb: 'The dead are patient teachers.', attrs: { wisdom: 1 }, mana: 4, defense: 1 },
  { key: 'pit-dog', charClass: 'berserker', label: 'Pit Dog', blurb: 'Get up. That is the whole lesson.', attrs: { constitution: 1 }, hp: 5 },
  { key: 'red-handed', charClass: 'berserker', label: 'Red-Handed', blurb: 'The first swing settles most arguments.', attrs: { strength: 1 }, critChance: 3 },
  { key: 'body-tempering', charClass: 'cultivator', label: 'Body Tempering', blurb: 'The flesh is the first furnace.', attrs: { constitution: 1 }, hp: 5 },
  { key: 'spirit-refining', charClass: 'cultivator', label: 'Spirit Refining', blurb: 'Breath in. Hold the world. Breath out.', attrs: { wisdom: 1 }, mana: 5 },
  { key: 'bombardier', charClass: 'alchemist', label: 'Bombardier', blurb: 'Chemistry, delivered at speed.', attrs: { dexterity: 1 }, critChance: 3 },
  { key: 'physicker', charClass: 'alchemist', label: 'Physicker', blurb: 'First, do no harm. Definitions vary.', attrs: { intelligence: 1 }, mana: 5 },
  { key: 'shorewalker', charClass: 'tidecaller', label: 'Shorewalker', blurb: 'One foot in the water, always.', attrs: { wisdom: 1 }, mana: 5 },
  { key: 'depth-touched', charClass: 'tidecaller', label: 'Depth-Touched', blurb: 'Something below learned your name and approved.', attrs: { constitution: 1 }, hp: 4, defense: 1 },
  { key: 'lucid', charClass: 'oneiromancer', label: 'Lucid', blurb: 'Awake in every room, including the impossible ones.', attrs: { intelligence: 1 }, mana: 5 },
  { key: 'night-porter', charClass: 'oneiromancer', label: 'Night Porter', blurb: 'You carry things between sleepers. Tips are strange.', attrs: { wisdom: 1 }, mana: 4, evasion: 1 },
];

export const TRANSCENDENCE_LEVEL = 40;
export const TRANSCENDENCE_FEE = 8000;
export const TRANSCENDENCES: CallingPath[] = [
  { key: 'the-mountain', charClass: 'fighter', label: 'The Mountain That Walks', blurb: 'Armies plan around you now.', attrs: { strength: 2, constitution: 2 }, hp: 20, defense: 2 },
  { key: 'the-banner', charClass: 'fighter', label: 'The Living Banner', blurb: 'Where you stand becomes the line.', attrs: { strength: 1, charisma: 2 }, hp: 12, initiative: 3 },
  { key: 'the-rumor', charClass: 'rogue', label: 'The Rumor', blurb: 'Half the city swears you do not exist. The right half.', attrs: { dexterity: 3 }, evasion: 5, critChance: 8 },
  { key: 'the-reckoning', charClass: 'rogue', label: 'The Quiet Reckoning', blurb: 'Debts remember you fondly.', attrs: { dexterity: 2, wisdom: 1 }, critChance: 12 },
  { key: 'the-tower', charClass: 'mage', label: 'The Walking Tower', blurb: 'The College named a chair after you to feel safer.', attrs: { intelligence: 3 }, mana: 25 },
  { key: 'the-theorem', charClass: 'mage', label: 'The Final Theorem', blurb: 'Reality checks its work against you.', attrs: { intelligence: 2, wisdom: 2 }, mana: 18, critChance: 6 },
  { key: 'the-vessel', charClass: 'priest', label: 'The Vessel', blurb: 'The god stopped asking and started trusting.', attrs: { wisdom: 3 }, mana: 20, hp: 8 },
  { key: 'the-judgement', charClass: 'priest', label: 'The Judgement', blurb: 'Mercy, delivered at speed.', attrs: { wisdom: 2, strength: 2 }, hp: 12, critChance: 6 },
  { key: 'the-wind', charClass: 'ranger', label: 'The Wind Itself', blurb: 'Nothing you hunt dies surprised. They saw nothing at all.', attrs: { dexterity: 3 }, initiative: 5, critChance: 8 },
  { key: 'the-warden', charClass: 'ranger', label: 'Warden of the Waste', blurb: 'The wild country calls you neighbor.', attrs: { dexterity: 2, constitution: 2 }, hp: 12, evasion: 3 },
  { key: 'the-voice', charClass: 'bard', label: 'The Voice of the City', blurb: 'Blackwall hums your verses in its sleep.', attrs: { charisma: 3 }, mana: 18, initiative: 3 },
  { key: 'the-ballad', charClass: 'bard', label: 'The Unfinished Ballad', blurb: 'You are the story. The rest is chorus.', attrs: { charisma: 2, intelligence: 2 }, mana: 14, critChance: 6 },
  { key: 'the-empty-seat', charClass: 'monk', label: 'The Empty Seat', blurb: 'The masters bow first now.', attrs: { dexterity: 2, wisdom: 2 }, evasion: 5, hp: 10 },
  { key: 'the-mountain-stream', charClass: 'monk', label: 'The Mountain Stream', blurb: 'Soft as water. Patient as water. Exactly as stoppable.', attrs: { strength: 2, constitution: 2 }, hp: 15, defense: 1 },
  { key: 'the-signed-blade', charClass: 'spellblade', label: 'The Signed Blade', blurb: 'Your name is a rune now. It cuts.', attrs: { intelligence: 2, dexterity: 2 }, mana: 12, critChance: 8 },
  { key: 'the-treaty', charClass: 'spellblade', label: 'The Broken Treaty', blurb: 'Steel and spell stopped arguing in you.', attrs: { strength: 2, intelligence: 2 }, hp: 12, defense: 2 },
  { key: 'the-creditor', charClass: 'warlock', label: 'The Creditor', blurb: 'What you owe came due. It paid YOU.', attrs: { intelligence: 3 }, mana: 25 },
  { key: 'the-threshold', charClass: 'warlock', label: 'The Threshold', blurb: 'Doors ask your permission now.', attrs: { intelligence: 2, constitution: 2 }, mana: 15, hp: 10 },
  { key: 'the-dawn-that-stays', charClass: 'paladin', label: 'The Dawn That Stays', blurb: 'The dark keeps a map of where you are not.', attrs: { constitution: 2, wisdom: 2 }, hp: 18, defense: 2 },
  { key: 'the-last-lamp', charClass: 'paladin', label: 'The Last Lamp', blurb: 'When every light fails, there is still you.', attrs: { strength: 2, charisma: 2 }, hp: 12, critChance: 6 },
  { key: 'the-grey-king', charClass: 'necromancer', label: 'The Grey King', blurb: 'Death forwards you its correspondence.', attrs: { intelligence: 3 }, mana: 25 },
  { key: 'the-kind-winter', charClass: 'necromancer', label: 'The Kind Winter', blurb: 'You close every eye gently. Almost every.', attrs: { intelligence: 2, wisdom: 2 }, mana: 15, hp: 10 },
  { key: 'the-red-legend', charClass: 'berserker', label: 'The Red Legend', blurb: 'Mothers name storms after you.', attrs: { strength: 3 }, hp: 20, critChance: 8 },
  { key: 'the-unkillable', charClass: 'berserker', label: 'The Unkillable', blurb: 'You have died twice. It did not take.', attrs: { constitution: 3 }, hp: 30, defense: 2 },
  { key: 'nascent-soul', charClass: 'cultivator', label: 'Nascent Soul', blurb: 'The self that steps out when the body is done being enough.', attrs: { wisdom: 2, constitution: 2 }, hp: 15, mana: 15 },
  { key: 'the-empty-sky', charClass: 'cultivator', label: 'The Empty Sky', blurb: 'The tribulation came. You are what walked out of it.', attrs: { strength: 2, dexterity: 2 }, critChance: 8, hp: 10 },
  { key: 'the-philosophers-stone', charClass: 'alchemist', label: "The Philosopher's Stone", blurb: 'The Great Work was never about gold.', attrs: { intelligence: 3 }, mana: 22, hp: 8 },
  { key: 'the-living-elixir', charClass: 'alchemist', label: 'The Living Elixir', blurb: 'Your blood is a controlled substance in four districts.', attrs: { constitution: 3 }, hp: 25, defense: 1 },
  { key: 'the-tide-itself', charClass: 'tidecaller', label: 'The Tide Itself', blurb: 'You stopped calling it. It stopped needing to be called.', attrs: { wisdom: 3 }, mana: 22, evasion: 3 },
  { key: 'the-old-seas-voice', charClass: 'tidecaller', label: "The Old Sea's Voice", blurb: 'When you speak, harbors listen. So do the things under them.', attrs: { wisdom: 2, charisma: 2 }, mana: 15, hp: 10 },
  { key: 'the-waking-dream', charClass: 'oneiromancer', label: 'The Waking Dream', blurb: 'The city dreams you now, a little, everywhere.', attrs: { intelligence: 3 }, mana: 22, evasion: 3 },
  { key: 'the-sleepless-crown', charClass: 'oneiromancer', label: 'The Sleepless Crown', blurb: 'You audited the god\u2019s dream and kept the marginalia.', attrs: { intelligence: 2, wisdom: 2 }, mana: 15, critChance: 6 },
];

function applyPathPackage(c: Character, path: CallingPath): void {
  for (const [attr, amt] of Object.entries(path.attrs)) c.attributes[attr as keyof Attributes] += amt ?? 0;
  if (path.hp) { c.hp.max += path.hp; c.hp.current = c.hp.max; }
  if (path.mana) { c.mana.max += path.mana; c.mana.current = c.mana.max; }
  if (path.defense) c.defense += path.defense;
  if (path.evasion) c.evasion += path.evasion;
  if (path.initiative) c.initiative += path.initiative;
  if (path.critChance) c.critChance += path.critChance;
}

export function callingOptions(c: Character): CallingPath[] {
  if (c.calling || c.level < CALLING_LEVEL) return [];
  return CALLINGS.filter((a) => a.charClass === c.charClass);
}

/** The trade notices you: a small package taken at the class hall. */
export function chooseCalling(world: WorldState, charId: string, pathKey: string): string | null {
  const c = world.characters[charId];
  if (!c) return 'Who?';
  const path = CALLINGS.find((a) => a.key === pathKey);
  if (!path || path.charClass !== c.charClass) return 'That calling is not open to this class.';
  if (c.calling) return `${c.name} already answered a calling.`;
  if (c.level < CALLING_LEVEL) return `A calling asks for level ${CALLING_LEVEL}.`;
  const loc = world.locations[world.partyLocation];
  const atTrainer = loc?.trainerFor === c.charClass || (loc?.temple && c.charClass === 'priest');
  if (!atTrainer) return 'Callings are answered at the class hall.';
  const payer = world.characters[world.mcId];
  if (payer.money < CALLING_FEE) return `The masters ask ${fmtMoney(CALLING_FEE)} for the naming.`;
  payer.money -= CALLING_FEE;
  addMinutes(world, 240);
  c.calling = path.key;
  applyPathPackage(c, path);
  c.permanentBonuses.push(`Calling — ${path.label}: ${path.blurb}`);
  logEvent(world, 'calling', { character: c.id, path: path.key }, `${c.name} answered a calling: ${path.label}. ${path.blurb}`, { location: world.partyLocation, witnesses: partyMembers(world).map((x) => x.id) });
  return null;
}

export function transcendenceOptions(c: Character): CallingPath[] {
  if (c.transcendence || !c.ascension || c.level < TRANSCENDENCE_LEVEL) return [];
  return TRANSCENDENCES.filter((a) => a.charClass === c.charClass);
}

/** Past titles: the third evolution, open only to the ascended. */
export function chooseTranscendence(world: WorldState, charId: string, pathKey: string): string | null {
  const c = world.characters[charId];
  if (!c) return 'Who?';
  const path = TRANSCENDENCES.find((a) => a.key === pathKey);
  if (!path || path.charClass !== c.charClass) return 'That path is not open to this class.';
  if (c.transcendence) return `${c.name} has already gone past the ceiling.`;
  if (!c.ascension) return 'Transcendence builds on an ascension — take the rite at 25 first.';
  if (c.level < TRANSCENDENCE_LEVEL) return `Transcendence asks for level ${TRANSCENDENCE_LEVEL}.`;
  const loc = world.locations[world.partyLocation];
  const atTrainer = loc?.trainerFor === c.charClass || (loc?.temple && c.charClass === 'priest');
  if (!atTrainer) return 'The masters must witness it, at the class hall.';
  const payer = world.characters[world.mcId];
  if (payer.money < TRANSCENDENCE_FEE) return `The vigil costs ${fmtMoney(TRANSCENDENCE_FEE)}.`;
  payer.money -= TRANSCENDENCE_FEE;
  addMinutes(world, 720);
  c.transcendence = path.key;
  c.title = path.label;
  applyPathPackage(c, path);
  c.permanentBonuses.push(`Transcendence — ${path.label}: ${path.blurb}`);
  logEvent(world, 'transcendence', { character: c.id, path: path.key }, `${c.name} went past the ceiling and became ${path.label}. ${path.blurb}`, { location: world.partyLocation, witnesses: partyMembers(world).map((x) => x.id) });
  return null;
}

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

// ---------- crafted-set families (the ESO signature) ----------
// A named piece is good; two of a pattern WAKE something. The family
// bonus lives here with the other gear math.
export const SET_FAMILIES: Record<string, { label: string; pieces: number; stat: NonNullable<Item['affix']>['stat']; amount: number; wakes: string }> = {
  ashgrip: { label: 'Ashgrip', pieces: 2, stat: 'attack', amount: 3, wakes: 'the ember-ash in both pieces warms when they draw blood together' },
  tidewalker: { label: 'Tidewalker', pieces: 2, stat: 'defense', amount: 3, wakes: 'the brine remembers the sea refusing to drown its wearer' },
  edgesong: { label: 'Edgesong', pieces: 2, stat: 'critChance', amount: 6, wakes: 'the sigils harmonize — the hum finds the note that ends fights' },
  lamplight: { label: 'Lamplight', pieces: 2, stat: 'evasion', amount: 3, wakes: 'the soot-lacquer drinks the light around the whole wearer' },
};

export function setBonusMod(world: WorldState, c: Character, stat: NonNullable<Item['affix']>['stat']): number {
  const counts: Record<string, number> = {};
  for (const iid of Object.values(c.equipment)) {
    const it = iid ? world.items[iid] : null;
    if (!it || it.broken || !it.setKey) continue;
    counts[it.setKey] = (counts[it.setKey] ?? 0) + 1;
  }
  let total = 0;
  for (const [key, n] of Object.entries(counts)) {
    const fam = SET_FAMILIES[key];
    if (fam && n >= fam.pieces && fam.stat === stat) total += fam.amount;
  }
  return total;
}

/** Sum of equipped-affix contributions to a combat stat (affixes + woken set families). */
export function affixMod(world: WorldState, c: Character, stat: NonNullable<Item['affix']>['stat']): number {
  let total = 0;
  for (const iid of Object.values(c.equipment)) {
    const it = iid ? world.items[iid] : null;
    if (!it || it.broken) continue;
    if (it.affix?.stat === stat) total += it.affix.amount;
    if (it.affix2?.stat === stat) total += it.affix2.amount;
  }
  return total + setBonusMod(world, c, stat);
}
