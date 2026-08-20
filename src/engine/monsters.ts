import type { MonsterTemplate } from './types';

export const MONSTERS: Record<string, MonsterTemplate> = {
  'giant-rat': {
    key: 'giant-rat', name: 'Giant Rat', level: 1, hp: 6, attack: 2, defense: 8,
    damage: '1d4', initiative: 3, xp: 12, lootTable: 'vermin', ai: 'pack', inflicts: { status: 'poisoned', chance: 0.12 },
  },
  'carrion-beetle': {
    key: 'carrion-beetle', name: 'Carrion Beetle', level: 1, hp: 8, attack: 2, defense: 10,
    damage: '1d4+1', initiative: 1, xp: 16, lootTable: 'vermin', ai: 'aggressive', inflicts: { status: 'poisoned', chance: 0.1 },
  },
  'tunnel-goblin': {
    key: 'tunnel-goblin', name: 'Tunnel Goblin', level: 1, hp: 9, attack: 3, defense: 10,
    damage: '1d6', initiative: 2, xp: 22, lootTable: 'goblin', ai: 'pack',
  },
  'skeleton': {
    key: 'skeleton', name: 'Skeleton', level: 2, hp: 13, attack: 4, defense: 11,
    damage: '1d6+1', initiative: 2, xp: 35, lootTable: 'undead', ai: 'aggressive',
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
  },
  'crypt-warden': {
    key: 'crypt-warden', name: 'Crypt Warden', level: 4, hp: 38, attack: 7, defense: 14,
    damage: '1d10+2', initiative: 3, xp: 220, lootTable: 'boss-crypt', ai: 'aggressive',
  },
  'rat-king': {
    key: 'rat-king', name: 'The Rat King', level: 4, hp: 34, attack: 6, defense: 13,
    damage: '1d8+2', initiative: 5, xp: 190, lootTable: 'boss-sewer', ai: 'aggressive', inflicts: { status: 'diseased', chance: 0.25 },
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
): MonsterTemplate => ({ key, name, level, hp, attack, defense, damage, initiative, xp, lootTable, ai, art, inflicts });

export const WIDER_BESTIARY: MonsterTemplate[] = [
  // — levels 4–8: the deeper city —
  T('dire-wolf', 'Dire Wolf', 4, 34, 6, 12, '1d8+2', 5, 130, 'beast', 'pack', { archetype: 'beast', accent: '#8b93a1' }, { status: 'bleeding', chance: 0.2 }),
  T('goblin-warchief', 'Goblin Warchief', 5, 44, 8, 14, '1d10+2', 4, 200, 'goblin', 'aggressive', { archetype: 'humanoid', accent: '#7fb069' }),
  T('cult-acolyte', 'Ash Circle Acolyte', 5, 38, 7, 13, '1d8+2', 3, 200, 'cult', 'aggressive', { archetype: 'humanoid', accent: '#b23a2e' }, { status: 'cursed', chance: 0.15 }),
  T('giant-spider', 'Giant Spider', 6, 46, 8, 14, '1d10+2', 6, 290, 'beast', 'aggressive', { archetype: 'horror', accent: '#6b5a8a' }, { status: 'poisoned', chance: 0.35 }),
  T('animated-armor', 'Animated Armor', 7, 62, 9, 17, '1d10+3', 2, 390, 'construct', 'aggressive', { archetype: 'construct', accent: '#8b93a1' }),
  T('wight', 'Barrow Wight', 8, 66, 10, 16, '2d6+3', 4, 510, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#8fd16a' }, { status: 'diseased', chance: 0.2 }),
  T('bog-hag', 'Bog Hag', 8, 60, 10, 15, '2d6+2', 5, 510, 'cult', 'cowardly', { archetype: 'horror', accent: '#5c7a4a' }, { status: 'cursed', chance: 0.25 }),
  // — levels 9–14: things with names —
  T('gutter-mage', 'Gutter Mage', 9, 62, 11, 15, '3d6', 6, 640, 'cult', 'cowardly', { archetype: 'humanoid', accent: '#6a9fb5' }),
  T('flesh-golem', 'Flesh Golem', 10, 96, 12, 16, '2d8+4', 2, 800, 'construct', 'aggressive', { archetype: 'construct', accent: '#77675a' }),
  T('wraith', 'Wraith', 11, 78, 13, 18, '2d8+4', 7, 960, 'greater-undead', 'aggressive', { archetype: 'spirit', accent: '#9db4c9' }, { status: 'paralyzed', chance: 0.2 }),
  T('ogre', 'Ogre', 12, 120, 14, 16, '2d10+5', 3, 1150, 'giantkin', 'aggressive', { archetype: 'giant', accent: '#a08453' }),
  T('harbor-drake', 'Harbor Drake', 13, 116, 15, 19, '2d10+5', 6, 1350, 'dragonkin', 'aggressive', { archetype: 'dragon', accent: '#4a7a6a' }),
  T('plague-priest', 'Plague Priest', 14, 108, 15, 18, '3d8+3', 4, 1560, 'cult', 'aggressive', { archetype: 'humanoid', accent: '#8fd16a' }, { status: 'diseased', chance: 0.4 }),
  // — levels 15–22: the mid-saga —
  T('gargoyle', 'Gargoyle', 15, 130, 16, 21, '2d10+6', 5, 1800, 'construct', 'aggressive', { archetype: 'construct', accent: '#6e6e7a' }),
  T('stone-golem', 'Stone Golem', 16, 170, 17, 22, '3d8+6', 2, 2040, 'construct', 'aggressive', { archetype: 'construct', accent: '#7a746a' }),
  T('vampire-thrall', 'Vampire Thrall', 17, 140, 18, 21, '3d8+6', 7, 2310, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#b23a2e' }, { status: 'bleeding', chance: 0.35 }),
  T('deep-one', 'Deep One', 18, 152, 19, 21, '3d8+7', 5, 2590, 'sunken', 'pack', { archetype: 'horror', accent: '#3f6f7a' }, { status: 'poisoned', chance: 0.25 }),
  T('bone-knight', 'Bone Knight', 20, 170, 21, 24, '3d10+7', 5, 3200, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#cfc4a8' }),
  T('storm-witch', 'Storm Witch', 22, 168, 23, 23, '5d6+6', 8, 3870, 'cult', 'cowardly', { archetype: 'humanoid', accent: '#6a9fb5' }, { status: 'stunned', chance: 0.25 }),
  // — levels 24–32: powers of the dark —
  T('chimera', 'Chimera', 24, 220, 25, 25, '4d8+8', 7, 4600, 'beast', 'aggressive', { archetype: 'beast', accent: '#c9a227' }, { status: 'burning', chance: 0.3 }),
  T('elder-vampire', 'Elder Vampire', 26, 230, 27, 27, '4d8+10', 9, 5400, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#b23a2e' }, { status: 'bleeding', chance: 0.4 }),
  T('abyssal-hound', 'Abyssal Hound', 27, 235, 28, 26, '4d8+10', 9, 5830, 'demonkin', 'pack', { archetype: 'demon', accent: '#c0533e' }, { status: 'burning', chance: 0.35 }),
  T('shadow-reaper', 'Shadow Reaper', 29, 240, 30, 29, '5d8+10', 10, 6720, 'demonkin', 'aggressive', { archetype: 'spirit', accent: '#5a4a6a' }, { status: 'paralyzed', chance: 0.3 }),
  T('lich-acolyte', 'Acolyte of the Hollow King', 31, 255, 32, 29, '6d8+8', 7, 7690, 'greater-undead', 'aggressive', { archetype: 'undead', accent: '#8fd16a' }, { status: 'cursed', chance: 0.35 }),
  T('iron-colossus', 'Iron Colossus', 32, 340, 33, 32, '5d10+12', 3, 8190, 'construct', 'aggressive', { archetype: 'construct', accent: '#8b93a1' }),
  // — levels 34–45: the last books —
  T('pit-fiend', 'Pit Fiend', 36, 360, 37, 33, '6d10+12', 8, 10360, 'demonkin', 'aggressive', { archetype: 'demon', accent: '#c0533e' }, { status: 'burning', chance: 0.45 }),
  T('void-spawn', 'Void Spawn', 40, 400, 41, 35, '7d10+14', 9, 12800, 'demonkin', 'aggressive', { archetype: 'horror', accent: '#6b5a8a' }, { status: 'paralyzed', chance: 0.35 }),
  T('elder-dragon', 'Elder Dragon', 45, 520, 46, 38, '8d10+18', 10, 16200, 'dragonkin', 'aggressive', { archetype: 'dragon', accent: '#c9a227' }, { status: 'burning', chance: 0.5 }),
];

// bosses for the new dungeons
export const NEW_BOSSES: MonsterTemplate[] = [
  T('ashen-hierophant', 'The Ashen Hierophant', 8, 130, 11, 18, '2d8+4', 5, 1400, 'boss-warrens', 'aggressive', { archetype: 'humanoid', accent: '#b23a2e' }, { status: 'cursed', chance: 0.35 }),
  T('gilded-golem', 'The Gilded Golem', 12, 220, 15, 21, '3d8+6', 3, 2900, 'boss-vaults', 'aggressive', { archetype: 'construct', accent: '#c9a227' }),
  T('sewer-tyrant', 'The Sewer Tyrant', 15, 260, 18, 22, '3d10+7', 5, 4200, 'boss-sewersdeep', 'aggressive', { archetype: 'horror', accent: '#5c7a4a' }, { status: 'diseased', chance: 0.45 }),
  T('drowned-priest', 'Priest of the Drowned God', 19, 310, 22, 25, '4d8+8', 6, 6200, 'boss-sunken', 'aggressive', { archetype: 'horror', accent: '#3f6f7a' }, { status: 'paralyzed', chance: 0.3 }),
  T('young-dragon', 'The Wyrm of the Spire', 25, 420, 28, 29, '5d10+10', 8, 10500, 'boss-wyrmspire', 'aggressive', { archetype: 'dragon', accent: '#4a7a6a' }, { status: 'burning', chance: 0.4 }),
  T('the-hollow-king', 'The Hollow King', 38, 640, 40, 36, '7d10+15', 9, 25000, 'boss-hollowcrown', 'aggressive', { archetype: 'undead', accent: '#c9a227' }, { status: 'cursed', chance: 0.45 }),
];

for (const m of [...WIDER_BESTIARY, ...NEW_BOSSES]) MONSTERS[m.key] = m;
