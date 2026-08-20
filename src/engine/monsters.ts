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
  'smuggler': {
    key: 'smuggler', name: 'Smuggler', level: 2, hp: 13, attack: 4, defense: 11,
    damage: '1d6+1', initiative: 3, xp: 38, lootTable: 'human', ai: 'cowardly',
  },
  'sewer-serpent': {
    key: 'sewer-serpent', name: 'Sewer Serpent', level: 3, hp: 24, attack: 6, defense: 12,
    damage: '1d8', initiative: 4, xp: 80, lootTable: 'vermin', ai: 'aggressive', inflicts: { status: 'poisoned', chance: 0.3 },
  },
};
