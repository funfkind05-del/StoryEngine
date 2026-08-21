import type { MonsterTemplate } from './types';

export const MONSTERS: Record<string, MonsterTemplate> = {
  // the expansion bestiary: pit, market, chapel, and union trouble
  'pit-bruiser': {
    key: 'pit-bruiser', name: 'Pit Bruiser', level: 4, hp: 34, attack: 6, defense: 13,
    damage: '1d8+3', initiative: 3, xp: 90, lootTable: 'human', ai: 'aggressive', art: { archetype: 'humanoid' },
  },
  'drowned-smuggler': {
    key: 'drowned-smuggler', name: 'Drowned Smuggler', level: 3, hp: 24, attack: 5, defense: 11,
    damage: '1d6+2', initiative: 2, xp: 66, lootTable: 'undead', ai: 'aggressive', art: { archetype: 'undead' }, inflicts: { status: 'diseased', chance: 0.15 },
    resists: ['frost'],
    weakTo: ['shock','holy'],
  },
  'lamp-wisp': {
    key: 'lamp-wisp', name: 'Lamp-Wisp', level: 5, hp: 22, attack: 7, defense: 15,
    damage: '2d4+2', initiative: 6, xp: 120, lootTable: 'sunken', ai: 'cowardly', art: { archetype: 'spirit' },
  },
  'bone-warden-revenant': {
    key: 'bone-warden-revenant', name: 'Bone-Warden Revenant', level: 7, hp: 52, attack: 8, defense: 15,
    damage: '1d10+4', initiative: 3, xp: 210, lootTable: 'greater-undead', ai: 'aggressive', art: { archetype: 'undead' },
    resists: ['venom','frost'],
    weakTo: ['holy'],
  },
  'pact-hound': {
    key: 'pact-hound', name: 'Pact-Hound', level: 6, hp: 40, attack: 8, defense: 13,
    damage: '1d8+4', initiative: 5, xp: 170, lootTable: 'demonkin', ai: 'pack', art: { archetype: 'demon' }, inflicts: { status: 'burning', chance: 0.2 },
  },
  'tidecourt-enforcer': {
    key: 'tidecourt-enforcer', name: 'Tidecourt Enforcer', level: 6, hp: 44, attack: 8, defense: 14,
    damage: '1d8+3', initiative: 4, xp: 175, lootTable: 'human', ai: 'aggressive', art: { archetype: 'humanoid' },
  },
  'grave-mold-shambler': {
    key: 'grave-mold-shambler', name: 'Grave-Mold Shambler', level: 5, hp: 46, attack: 6, defense: 11,
    damage: '1d8+2', initiative: 1, xp: 140, lootTable: 'undead', ai: 'aggressive', art: { archetype: 'horror' }, inflicts: { status: 'diseased', chance: 0.3 },
  },
  'night-market-djinn': {
    key: 'night-market-djinn', name: 'Night-Market Djinn', level: 9, hp: 60, attack: 10, defense: 17,
    damage: '2d6+4', initiative: 7, xp: 340, lootTable: 'sunken', ai: 'cowardly', art: { archetype: 'spirit' },
  },
  'pit-champion': {
    key: 'pit-champion', name: 'Pit Champion', level: 10, hp: 80, attack: 12, defense: 17,
    damage: '2d6+4', initiative: 5, xp: 420, lootTable: 'human', ai: 'aggressive', art: { archetype: 'humanoid' },
  },
  'salt-wight': {
    key: 'salt-wight', name: 'Salt Wight', level: 12, hp: 88, attack: 13, defense: 17,
    damage: '2d6+5', initiative: 4, xp: 520, lootTable: 'greater-undead', ai: 'aggressive', art: { archetype: 'undead' },
    resists: ['frost','venom'],
    weakTo: ['holy','shock'],
  },
  'brine-horror': {
    key: 'brine-horror', name: 'Brine Horror', level: 14, hp: 110, attack: 14, defense: 16,
    damage: '2d8+5', initiative: 3, xp: 640, lootTable: 'sunken', ai: 'aggressive', art: { archetype: 'horror' }, inflicts: { status: 'diseased', chance: 0.2 },
    resists: ['frost'],
    weakTo: ['shock'],
  },
  'reef-witch': {
    key: 'reef-witch', name: 'Reef Witch', level: 15, hp: 92, attack: 15, defense: 18,
    damage: '2d8+6', initiative: 6, xp: 700, lootTable: 'cult', ai: 'cowardly', art: { archetype: 'humanoid' }, inflicts: { status: 'poisoned', chance: 0.3 },
  },
  'saltbound-golem': {
    key: 'saltbound-golem', name: 'Saltbound Golem', level: 16, hp: 150, attack: 15, defense: 20,
    damage: '2d10+5', initiative: 2, xp: 820, lootTable: 'construct', ai: 'aggressive', art: { archetype: 'construct' },
    resists: ['venom'],
    weakTo: ['shock','fire'],
  },
  'harbor-revenant': {
    key: 'harbor-revenant', name: 'Harbor Revenant', level: 18, hp: 130, attack: 17, defense: 19,
    damage: '2d10+6', initiative: 5, xp: 980, lootTable: 'greater-undead', ai: 'aggressive', art: { archetype: 'undead' },
    resists: ['venom'],
    weakTo: ['holy'],
  },
  'salt-queen': {
    key: 'salt-queen', name: 'The Salt Queen', level: 20, hp: 260, attack: 19, defense: 21,
    damage: '3d8+7', initiative: 6, xp: 2600, lootTable: 'boss-saltworks', ai: 'aggressive', art: { archetype: 'horror' }, inflicts: { status: 'bleeding', chance: 0.3 },
  },
  'depth-lurker': {
    key: 'depth-lurker', name: 'Depth Lurker', level: 22, hp: 170, attack: 20, defense: 21,
    damage: '3d8+6', initiative: 7, xp: 1300, lootTable: 'sunken', ai: 'pack', art: { archetype: 'serpent' } },
  'mirror-shade': {
    key: 'mirror-shade', name: 'Mirror-Shade', level: 24, hp: 150, attack: 22, defense: 24,
    damage: '3d8+8', initiative: 9, xp: 1600, lootTable: 'sunken', ai: 'cowardly', art: { archetype: 'spirit' },
    resists: ['shock'],
    weakTo: ['void'],
  },
  'void-choir': {
    key: 'void-choir', name: 'Void Choir', level: 28, hp: 210, attack: 24, defense: 24,
    damage: '4d8+8', initiative: 8, xp: 2200, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'spirit' },
    resists: ['void','frost'],
    weakTo: ['holy'],
  },
  'ossuary-colossus': {
    key: 'ossuary-colossus', name: 'Ossuary Colossus', level: 32, hp: 340, attack: 26, defense: 26,
    damage: '4d10+10', initiative: 3, xp: 3200, lootTable: 'giantkin', ai: 'aggressive', art: { archetype: 'giant' },
  },
  'ash-seraph': {
    key: 'ash-seraph', name: 'Ash Seraph', level: 36, hp: 300, attack: 30, defense: 28,
    damage: '5d8+12', initiative: 10, xp: 4400, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'spirit' }, inflicts: { status: 'burning', chance: 0.35 },
    resists: ['fire'],
    weakTo: ['frost'],
  },
  'gilded-lich': {
    key: 'gilded-lich', name: 'Gilded Lich', level: 40, hp: 360, attack: 32, defense: 30,
    damage: '5d10+12', initiative: 8, xp: 6000, lootTable: 'greater-undead', ai: 'cowardly', art: { archetype: 'undead' },
    resists: ['frost','venom'],
    weakTo: ['holy'],
  },
  'hollow-herald': {
    key: 'hollow-herald', name: 'Herald of the Hollow King', level: 44, hp: 420, attack: 35, defense: 31,
    damage: '6d10+14', initiative: 9, xp: 8200, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'demon' },
    resists: ['void','fire'],
    weakTo: ['holy'],
  },
  // ---------- past the ceiling: L48–100, the villains of the later books ----------
  'root-wight': {
    key: 'root-wight', name: 'Root-Wight', level: 48, hp: 380, attack: 34, defense: 30,
    damage: '5d10+14', initiative: 8, xp: 8000, lootTable: 'greater-undead', ai: 'pack', art: { archetype: 'undead' },
    resists: ['venom'],
    weakTo: ['holy','fire'],
  },
  'chorister-of-want': {
    key: 'chorister-of-want', name: 'Chorister of Want', level: 52, hp: 400, attack: 36, defense: 32,
    damage: '6d8+16', initiative: 11, xp: 10000, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'spirit' },
    resists: ['void'],
    weakTo: ['holy'],
  },
  'salt-kraken': {
    key: 'salt-kraken', name: 'Salt-Kraken', level: 55, hp: 620, attack: 36, defense: 30,
    damage: '6d10+14', initiative: 5, xp: 12000, lootTable: 'dragonkin', ai: 'aggressive', art: { archetype: 'horror' }, inflicts: { status: 'bleeding', chance: 0.3 },
    resists: ['frost'],
    weakTo: ['shock'],
  },
  'unlamped-dark': {
    key: 'unlamped-dark', name: 'The Unlamped Dark', level: 58, hp: 450, attack: 40, defense: 34,
    damage: '7d8+16', initiative: 12, xp: 14000, lootTable: 'demonkin', ai: 'cowardly', art: { archetype: 'spirit' },
    resists: ['void','frost'],
    weakTo: ['fire','holy'],
  },
  'warden-of-nine-forts': {
    key: 'warden-of-nine-forts', name: 'Warden of the Nine Forts', level: 62, hp: 700, attack: 42, defense: 36,
    damage: '7d10+18', initiative: 8, xp: 18000, lootTable: 'greater-undead', ai: 'aggressive', art: { archetype: 'undead' },
  },
  'grief-golem': {
    key: 'grief-golem', name: 'Grief-Golem', level: 65, hp: 800, attack: 42, defense: 38,
    damage: '8d8+18', initiative: 4, xp: 20000, lootTable: 'construct', ai: 'aggressive', art: { archetype: 'construct' },
    resists: ['venom','frost'],
    weakTo: ['shock'],
  },
  'the-auditor': {
    key: 'the-auditor', name: 'The Auditor of Debts', level: 68, hp: 620, attack: 46, defense: 38,
    damage: '8d8+20', initiative: 12, xp: 24000, lootTable: 'greater-undead', ai: 'aggressive', art: { archetype: 'undead' },
  },
  'tide-empress': {
    key: 'tide-empress', name: 'The Tide Empress', level: 72, hp: 900, attack: 46, defense: 40,
    damage: '8d10+20', initiative: 9, xp: 30000, lootTable: 'dragonkin', ai: 'aggressive', art: { archetype: 'horror' }, inflicts: { status: 'poisoned', chance: 0.3 },
    resists: ['frost'],
    weakTo: ['shock'],
  },
  'ashfather': {
    key: 'ashfather', name: 'The Ashfather', level: 76, hp: 850, attack: 50, defense: 42,
    damage: '9d8+22', initiative: 11, xp: 36000, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'demon' }, inflicts: { status: 'burning', chance: 0.4 },
    resists: ['fire'],
    weakTo: ['frost'],
  },
  'hollow-empress': {
    key: 'hollow-empress', name: 'The Hollow Empress', level: 80, hp: 1000, attack: 52, defense: 44,
    damage: '9d10+24', initiative: 12, xp: 44000, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'spirit' },
    resists: ['void'],
    weakTo: ['holy'],
  },
  'worm-of-the-ring': {
    key: 'worm-of-the-ring', name: 'The Worm of the Ring', level: 84, hp: 1400, attack: 52, defense: 42,
    damage: '10d10+22', initiative: 6, xp: 52000, lootTable: 'dragonkin', ai: 'aggressive', art: { archetype: 'dragon' }, inflicts: { status: 'poisoned', chance: 0.35 },
    resists: ['fire','venom'],
    weakTo: ['frost'],
  },
  'the-forgotten-founder': {
    key: 'the-forgotten-founder', name: 'The Forgotten Founder', level: 88, hp: 1100, attack: 56, defense: 46,
    damage: '10d10+26', initiative: 13, xp: 62000, lootTable: 'greater-undead', ai: 'aggressive', art: { archetype: 'undead' },
    resists: ['void'],
    weakTo: ['holy'],
  },
  'the-first-warden': {
    key: 'the-first-warden', name: 'The First Warden', level: 92, hp: 1300, attack: 58, defense: 48,
    damage: '11d10+26', initiative: 12, xp: 74000, lootTable: 'giantkin', ai: 'aggressive', art: { archetype: 'giant' },
  },
  'the-held-god-dreaming': {
    key: 'the-held-god-dreaming', name: 'The Held God, Dreaming', level: 96, hp: 1600, attack: 60, defense: 50,
    damage: '12d10+28', initiative: 14, xp: 90000, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'horror' },
    resists: ['void','fire','frost'],
    weakTo: ['holy'],
  },
  'the-held-god-waking': {
    key: 'the-held-god-waking', name: 'The Held God, Waking', level: 100, hp: 2200, attack: 66, defense: 54,
    damage: '14d10+30', initiative: 15, xp: 140000, lootTable: 'demonkin', ai: 'aggressive', art: { archetype: 'horror' }, inflicts: { status: 'burning', chance: 0.4 },
    resists: ['void','fire','frost'],
    weakTo: ['holy'],
  },
  'candidate-in-borrowed-skin': {
    key: 'candidate-in-borrowed-skin', name: 'Candidate in Borrowed Skin', level: 50, hp: 420, attack: 36, defense: 33,
    damage: '6d8+15', initiative: 10, xp: 9500, lootTable: 'human', ai: 'cowardly', art: { archetype: 'humanoid' },
  },
  'giant-rat': {
    key: 'giant-rat', name: 'Giant Rat', level: 1, hp: 6, attack: 2, defense: 8,
    damage: '1d4', initiative: 3, xp: 12, lootTable: 'vermin', ai: 'pack', inflicts: { status: 'poisoned', chance: 0.12 },
    weakTo: ['fire'],
  },
  'carrion-beetle': {
    key: 'carrion-beetle', name: 'Carrion Beetle', level: 1, hp: 8, attack: 2, defense: 10,
    damage: '1d4+1', initiative: 1, xp: 16, lootTable: 'vermin', ai: 'aggressive', inflicts: { status: 'poisoned', chance: 0.1 },
    weakTo: ['fire'],
  },
  'tunnel-goblin': {
    key: 'tunnel-goblin', name: 'Tunnel Goblin', level: 1, hp: 9, attack: 3, defense: 10,
    damage: '1d6', initiative: 2, xp: 22, lootTable: 'goblin', ai: 'pack',
  },
  'skeleton': {
    key: 'skeleton', name: 'Skeleton', level: 2, hp: 13, attack: 4, defense: 11,
    damage: '1d6+1', initiative: 2, xp: 35, lootTable: 'undead', ai: 'aggressive',
    resists: ['venom','frost'],
    weakTo: ['holy'],
  },
  'grave-robber': {
    key: 'grave-robber', name: 'Grave Robber', level: 2, hp: 12, attack: 4, defense: 11,
    damage: '1d6+1', initiative: 3, xp: 32, lootTable: 'human', ai: 'cowardly',
  },
  'street-thug': {
    key: 'street-thug', name: 'Street Thug', level: 1, hp: 10, attack: 3, defense: 10,
    damage: '1d6', initiative: 2, xp: 25, lootTable: 'human', ai: 'cowardly',
  },
  'red-knife-cutter': {
    key: 'red-knife-cutter', name: 'Red Knife Cutter', level: 2, hp: 14, attack: 5, defense: 12,
    damage: '1d6+2', initiative: 4, xp: 45, lootTable: 'human', ai: 'aggressive', inflicts: { status: 'bleeding', chance: 0.25 },
  },
  'ghoul': {
    key: 'ghoul', name: 'Ghoul', level: 3, hp: 20, attack: 6, defense: 12,
    damage: '1d8+1', initiative: 3, xp: 70, lootTable: 'undead', ai: 'aggressive', inflicts: { status: 'paralyzed', chance: 0.15 },
    resists: ['venom'],
    weakTo: ['holy','fire'],
  },
  'crypt-warden': {
    key: 'crypt-warden', name: 'Crypt Warden', level: 4, hp: 38, attack: 7, defense: 14,
    damage: '1d10+2', initiative: 3, xp: 220, lootTable: 'boss-crypt', ai: 'aggressive',
    resists: ['venom','frost'],
    weakTo: ['holy'],
  },
  'rat-king': {
    key: 'rat-king', name: 'The Rat King', level: 4, hp: 34, attack: 6, defense: 13,
    damage: '1d8+2', initiative: 5, xp: 190, lootTable: 'boss-sewer', ai: 'aggressive', inflicts: { status: 'diseased', chance: 0.25 },
    resists: ['venom'],
    weakTo: ['fire'],
  },
  'city-watchman': {
    key: 'city-watchman', name: 'City Watchman', level: 3, hp: 26, attack: 6, defense: 14,
    damage: '1d8+2', initiative: 3, xp: 90, lootTable: 'human', ai: 'aggressive', art: { archetype: 'humanoid', accent: '#8b93a1' },
  },
  'smuggler': {
    key: 'smuggler', name: 'Smuggler', level: 2, hp: 13, attack: 4, defense: 11,
    damage: '1d6+1', initiative: 3, xp: 38, lootTable: 'human', ai: 'cowardly',
  },
  'sewer-serpent': {
    key: 'sewer-serpent', name: 'Sewer Serpent', level: 3, hp: 24, attack: 6, defense: 12,
    damage: '1d8', initiative: 4, xp: 80, lootTable: 'vermin', ai: 'aggressive', inflicts: { status: 'poisoned', chance: 0.3 },
    resists: ['venom'],
    weakTo: ['fire'],
  },
};

// ============================================================
// The wider bestiary: levels 4–45, fuel for twenty books.
// Rough scaling: hp ≈ level·8, attack ≈ level+2, defense ≈ 10+level/2,
// xp ≈ level²·8. Monsters without a dedicated drawn plate carry an
// `art` archetype for the procedural bestiary renderer.
// ============================================================

const T = (
  key: string, name: string, level: number, hp: number, attack: number, defense: number,
  damage: string, initiative: number, xp: number, lootTable: string,
  ai: MonsterTemplate['ai'], art: NonNullable<MonsterTemplate['art']>,
  inflicts?: MonsterTemplate['inflicts'],
  elems?: Pick<MonsterTemplate, 'resists' | 'weakTo'>,
): MonsterTemplate => ({ key, name, level, hp, attack, defense, damage, initiative, xp, lootTable, ai, art, inflicts, ...elems });

export const WIDER_BESTIARY: MonsterTemplate[] = [
  // — levels 4–8: the deeper city —
  T('dire-wolf', 'Dire Wolf', 4, 34, 6, 12, '1d8+2', 5, 130, 'beast', 'pack', { archetype: 'beast', accent: '#8b93a1' }, { status: 'bleeding', chance: 0.2 }),
  T('goblin-warchief', 'Goblin Warchief', 5, 44, 8, 14, '1d10+2', 4, 200, 'goblin', 'aggressive', { archetype: 'humanoid', accent: '#7fb069' }),
  T('cult-acolyte', 'Ash Circle Acolyte', 5, 38, 7, 13, '1d8+2', 3, 200, 'cult', 'aggressive', { archetype: 'humanoid', accent: '#b23a2e' }, { status: 'cursed', chance: 0.15 }),
  T('giant-spider', 'Giant Spider', 6, 46, 8, 14, '1d10+2', 6, 290, 'beast', 'aggressive', { archetype: 'horror', accent: '#6b5a8a' }, { status: 'poisoned', chance: 0.35 }, { resists: ['venom'], weakTo: ['fire'] }),
  T('animated-armor', 'Animated Armor', 7, 62, 9, 17, '1d10+3', 2, 390, 'construct', 'aggressive', { archetype: 'construct', accent: '#8b93a1' }, undefined, { resists: ['venom'], weakTo: ['shock'] }),
  T('wight', 'Barrow Wight', 8, 66, 10, 16, '2d6+3', 4, 510, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#8fd16a' }, { status: 'diseased', chance: 0.2 }, { resists: ['frost','venom'], weakTo: ['holy'] }),
  T('bog-hag', 'Bog Hag', 8, 60, 10, 15, '2d6+2', 5, 510, 'cult', 'cowardly', { archetype: 'horror', accent: '#5c7a4a' }, { status: 'cursed', chance: 0.25 }, { resists: ['venom'], weakTo: ['fire'] }),
  // — levels 9–14: things with names —
  T('gutter-mage', 'Gutter Mage', 9, 62, 11, 15, '3d6', 6, 640, 'cult', 'cowardly', { archetype: 'humanoid', accent: '#6a9fb5' }),
  T('flesh-golem', 'Flesh Golem', 10, 96, 12, 16, '2d8+4', 2, 800, 'construct', 'aggressive', { archetype: 'construct', accent: '#77675a' }),
  T('wraith', 'Wraith', 11, 78, 13, 18, '2d8+4', 7, 960, 'greater-undead', 'aggressive', { archetype: 'spirit', accent: '#9db4c9' }, { status: 'paralyzed', chance: 0.2 }),
  T('ogre', 'Ogre', 12, 120, 14, 16, '2d10+5', 3, 1150, 'giantkin', 'aggressive', { archetype: 'giant', accent: '#a08453' }),
  T('harbor-drake', 'Harbor Drake', 13, 116, 15, 19, '2d10+5', 6, 1350, 'dragonkin', 'aggressive', { archetype: 'dragon', accent: '#4a7a6a' }, undefined, { resists: ['fire'], weakTo: ['frost','shock'] }),
  T('plague-priest', 'Plague Priest', 14, 108, 15, 18, '3d8+3', 4, 1560, 'cult', 'aggressive', { archetype: 'humanoid', accent: '#8fd16a' }, { status: 'diseased', chance: 0.4 }),
  // — levels 15–22: the mid-saga —
  T('gargoyle', 'Gargoyle', 15, 130, 16, 21, '2d10+6', 5, 1800, 'construct', 'aggressive', { archetype: 'construct', accent: '#6e6e7a' }),
  T('stone-golem', 'Stone Golem', 16, 170, 17, 22, '3d8+6', 2, 2040, 'construct', 'aggressive', { archetype: 'construct', accent: '#7a746a' }, undefined, { resists: ['venom','fire'], weakTo: ['shock'] }),
  T('vampire-thrall', 'Vampire Thrall', 17, 140, 18, 21, '3d8+6', 7, 2310, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#b23a2e' }, { status: 'bleeding', chance: 0.35 }),
  T('deep-one', 'Deep One', 18, 152, 19, 21, '3d8+7', 5, 2590, 'sunken', 'pack', { archetype: 'horror', accent: '#3f6f7a' }, { status: 'poisoned', chance: 0.25 }, { resists: ['frost'], weakTo: ['shock'] }),
  T('bone-knight', 'Bone Knight', 20, 170, 21, 24, '3d10+7', 5, 3200, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#cfc4a8' }, undefined, { resists: ['venom','frost'], weakTo: ['holy'] }),
  T('storm-witch', 'Storm Witch', 22, 168, 23, 23, '5d6+6', 8, 3870, 'cult', 'cowardly', { archetype: 'humanoid', accent: '#6a9fb5' }, { status: 'stunned', chance: 0.25 }),
  // — levels 24–32: powers of the dark —
  T('chimera', 'Chimera', 24, 220, 25, 25, '4d8+8', 7, 4600, 'beast', 'aggressive', { archetype: 'beast', accent: '#c9a227' }, { status: 'burning', chance: 0.3 }),
  T('elder-vampire', 'Elder Vampire', 26, 230, 27, 27, '4d8+10', 9, 5400, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#b23a2e' }, { status: 'bleeding', chance: 0.4 }),
  T('abyssal-hound', 'Abyssal Hound', 27, 235, 28, 26, '4d8+10', 9, 5830, 'demonkin', 'pack', { archetype: 'demon', accent: '#c0533e' }, { status: 'burning', chance: 0.35 }),
  T('shadow-reaper', 'Shadow Reaper', 29, 240, 30, 29, '5d8+10', 10, 6720, 'demonkin', 'aggressive', { archetype: 'spirit', accent: '#5a4a6a' }, { status: 'paralyzed', chance: 0.3 }),
  T('lich-acolyte', 'Acolyte of the Hollow King', 31, 255, 32, 29, '6d8+8', 7, 7690, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#8fd16a' }, { status: 'cursed', chance: 0.35 }, { resists: ['frost','venom'], weakTo: ['holy'] }),
  T('iron-colossus', 'Iron Colossus', 32, 340, 33, 32, '5d10+12', 3, 8190, 'construct', 'aggressive', { archetype: 'construct', accent: '#8b93a1' }, undefined, { resists: ['venom','frost'], weakTo: ['shock'] }),
  // — levels 34–45: the last books —
  T('pit-fiend', 'Pit Fiend', 36, 360, 37, 33, '6d10+12', 8, 10360, 'demonkin', 'aggressive', { archetype: 'demon', accent: '#c0533e' }, { status: 'burning', chance: 0.45 }, { resists: ['fire','void'], weakTo: ['holy'] }),
  T('void-spawn', 'Void Spawn', 40, 400, 41, 35, '7d10+14', 9, 12800, 'demonkin', 'aggressive', { archetype: 'horror', accent: '#6b5a8a' }, { status: 'paralyzed', chance: 0.35 }, { resists: ['void'], weakTo: ['holy'] }),
  T('elder-dragon', 'Elder Dragon', 45, 520, 46, 38, '8d10+18', 10, 16200, 'dragonkin', 'aggressive', { archetype: 'dragon', accent: '#c9a227' }, { status: 'burning', chance: 0.5 }),
];

// bosses for the new dungeons
export const NEW_BOSSES: MonsterTemplate[] = [
  T('ashen-hierophant', 'The Ashen Hierophant', 8, 130, 11, 18, '2d8+4', 5, 1400, 'boss-warrens', 'aggressive', { archetype: 'humanoid', accent: '#b23a2e' }, { status: 'cursed', chance: 0.35 }),
  T('gilded-golem', 'The Gilded Golem', 12, 220, 15, 21, '3d8+6', 3, 2900, 'boss-vaults', 'aggressive', { archetype: 'construct', accent: '#c9a227' }, undefined, { resists: ['venom'], weakTo: ['shock'] }),
  T('sewer-tyrant', 'The Sewer Tyrant', 15, 260, 18, 22, '3d10+7', 5, 4200, 'boss-sewersdeep', 'aggressive', { archetype: 'horror', accent: '#5c7a4a' }, { status: 'diseased', chance: 0.45 }),
  T('drowned-priest', 'Priest of the Drowned God', 19, 310, 22, 25, '4d8+8', 6, 6200, 'boss-sunken', 'aggressive', { archetype: 'horror', accent: '#3f6f7a' }, { status: 'paralyzed', chance: 0.3 }, { resists: ['frost'], weakTo: ['shock','holy'] }),
  T('young-dragon', 'The Wyrm of the Spire', 25, 420, 28, 29, '5d10+10', 8, 10500, 'boss-wyrmspire', 'aggressive', { archetype: 'dragon', accent: '#4a7a6a' }, { status: 'burning', chance: 0.4 }, { resists: ['fire'], weakTo: ['frost'] }),
  T('the-hollow-king', 'The Hollow King', 38, 640, 40, 36, '7d10+15', 9, 25000, 'boss-hollowcrown', 'aggressive', { archetype: 'undead', accent: '#c9a227' }, { status: 'cursed', chance: 0.45 }, { resists: ['void','frost'], weakTo: ['holy'] }),
];

for (const m of [...WIDER_BESTIARY, ...NEW_BOSSES]) MONSTERS[m.key] = m;
