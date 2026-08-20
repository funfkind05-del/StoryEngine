// Loot generation from per-monster loot tables. Items are created as
// real objects with ids and histories; they only enter an inventory
// when the author chooses TAKE.

import type { Item, LootResult, WorldState } from './types';
import { Rng } from './rng';
import { nextId } from './world';

interface LootEntry {
  chance: number;
  make: (world: WorldState, rng: Rng) => Item;
}

function item(world: WorldState, base: Omit<Item, 'id' | 'owner' | 'history'>): Item {
  return { ...base, id: nextId(world, 'ITEM'), owner: null, history: [] };
}

const TABLES: Record<string, { moneyDice: string; entries: LootEntry[] }> = {
  vermin: {
    moneyDice: '1d6',
    entries: [
      { chance: 0.2, make: (w) => item(w, { name: 'Rat Pelt', kind: 'misc', slot: 'none', value: 2 }) },
      { chance: 0.08, make: (w) => item(w, { name: 'Chewed Silver Ring', kind: 'jewelry', slot: 'ring', tier: 'uncommon', value: 45 }) },
    ],
  },
  goblin: {
    moneyDice: '2d8',
    entries: [
      { chance: 0.35, make: (w) => item(w, { name: 'Goblin Knife', kind: 'weapon', slot: 'main-hand', damage: '1d4', durability: { current: 30, max: 40 }, value: 8 }) },
      { chance: 0.15, make: (w) => item(w, { name: 'Cheap Leather Armor', kind: 'armor', slot: 'armor', defense: 1, durability: { current: 25, max: 50 }, value: 20 }) },
      { chance: 0.12, make: (w) => item(w, { name: 'Minor Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d11+9', stackable: true, qty: 1, proto: 'minor-healing-potion', value: 30 }) },
    ],
  },
  undead: {
    moneyDice: '2d10',
    entries: [
      { chance: 0.2, make: (w) => item(w, { name: 'Tarnished Burial Bracelet', kind: 'jewelry', slot: 'none', value: 60 }) },
      { chance: 0.18, make: (w) => item(w, { name: 'Rusted Sword', kind: 'weapon', slot: 'main-hand', damage: '1d6', durability: { current: 15, max: 60 }, value: 12 }) },
      { chance: 0.1, make: (w) => item(w, { name: 'Bone Charm', kind: 'jewelry', slot: 'amulet', value: 35 }) },
    ],
  },
  human: {
    moneyDice: '3d10',
    entries: [
      { chance: 0.3, make: (w) => item(w, { name: 'Worn Dagger', kind: 'weapon', slot: 'main-hand', damage: '1d4+1', durability: { current: 35, max: 50 }, value: 15 }) },
      { chance: 0.15, make: (w) => item(w, { name: 'Minor Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d11+9', stackable: true, qty: 1, proto: 'minor-healing-potion', value: 30 }) },
      { chance: 0.08, make: (w) => item(w, { name: 'Silver Ring', kind: 'jewelry', slot: 'ring', tier: 'uncommon', value: 50 }) },
    ],
  },
  'boss-crypt': {
    moneyDice: '6d20',
    entries: [
      { chance: 1, make: (w) => item(w, { name: 'Warden’s Blade', kind: 'weapon', slot: 'main-hand', tier: 'rare', damage: '1d8+2', durability: { current: 80, max: 80 }, value: 900 }) },
      { chance: 0.6, make: (w) => item(w, { name: 'Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d16+24', stackable: true, qty: 1, proto: 'healing-potion', value: 80 }) },
      { chance: 0.4, make: (w) => item(w, { name: 'Saint Varro’s Signet', kind: 'jewelry', slot: 'ring', tier: 'rare', value: 400 }) },
    ],
  },
  'boss-sewer': {
    moneyDice: '5d20',
    entries: [
      { chance: 1, make: (w) => item(w, { name: 'The Rat King’s Crown', kind: 'treasure', slot: 'none', tier: 'rare', value: 700 }) },
      { chance: 0.5, make: (w) => item(w, { name: 'Waterlogged Strongbox Key', kind: 'tool', slot: 'none', tier: 'uncommon', value: 5 }) },
      { chance: 0.5, make: (w) => item(w, { name: 'Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d16+24', stackable: true, qty: 1, proto: 'healing-potion', value: 80 }) },
    ],
  },
  chest: {
    moneyDice: '4d12',
    entries: [
      { chance: 0.3, make: (w) => item(w, { name: 'Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d16+24', stackable: true, qty: 1, proto: 'healing-potion', value: 80 }) },
      { chance: 0.25, make: (w) => item(w, { name: 'Iron Longsword', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d8+1', durability: { current: 70, max: 100 }, value: 340 }) },
      { chance: 0.2, make: (w) => item(w, { name: 'Studded Leather Armor', kind: 'armor', slot: 'armor', tier: 'common', defense: 2, durability: { current: 60, max: 80 }, value: 250 }) },
      { chance: 0.15, make: (w) => item(w, { name: 'Old Trinket Box', kind: 'treasure', slot: 'none', value: 120 }) },
    ],
  },
};

export function generateLoot(world: WorldState, monsterKeys: string[], seed: number, xp: number): LootResult {
  const rng = new Rng(seed);
  let money = 0;
  const items: Item[] = [];
  const seen: Record<string, boolean> = {};
  for (const key of monsterKeys) {
    const tableKey = (lootTableFor(key));
    const table = TABLES[tableKey] ?? TABLES.vermin;
    money += rng.roll(table.moneyDice);
    for (const entry of table.entries) {
      if (rng.chance(entry.chance)) {
        const it = entry.make(world, rng);
        // avoid duplicate uniques from the same kill batch
        if (it.value > 300 && seen[it.name]) continue;
        seen[it.name] = true;
        items.push(it);
      }
    }
  }
  return { xp, money, items, seed, taken: false };
}

// monster template key -> loot table key (kept here to avoid an import cycle)
function lootTableFor(monsterKey: string): string {
  const map: Record<string, string> = {
    'giant-rat': 'vermin',
    'carrion-beetle': 'vermin',
    'sewer-serpent': 'vermin',
    'tunnel-goblin': 'goblin',
    skeleton: 'undead',
    ghoul: 'undead',
    'grave-robber': 'human',
    'street-thug': 'human',
    'red-knife-cutter': 'human',
    'crypt-warden': 'boss-crypt',
    'rat-king': 'boss-sewer',
    smuggler: 'human',
  };
  return map[monsterKey] ?? 'vermin';
}

/** Open a chest in the current dungeon room. */
export function openChest(world: WorldState): LootResult | { error: string } {
  if (!world.currentDungeon || !world.currentRoom) return { error: 'Not inside a dungeon.' };
  const room = world.dungeons[world.currentDungeon].rooms[world.currentRoom];
  if (!room.chest || room.chest.opened) return { error: 'No unopened chest here.' };
  room.chest.opened = true;
  const rng = new Rng(room.chest.lootSeed);
  const table = TABLES.chest;
  const money = rng.roll(table.moneyDice);
  const items: Item[] = [];
  for (const entry of table.entries) {
    if (rng.chance(entry.chance)) items.push(entry.make(world, rng));
  }
  return { xp: 0, money, items, seed: room.chest.lootSeed, taken: false };
}
