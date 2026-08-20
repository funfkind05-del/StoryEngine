// Crafting: materials gathered from kills and dungeon nodes become
// weapons, armor, glyphs, and food at the household's working rooms.
// Quality rolls on crafted gear reward a well-built home (forge annex)
// and high strength; enchanting applies affix glyphs at the study.

import type { WorldState } from './types';
import { Rng, randomSeed } from './rng';
import { addMinutes, logEvent, partyMembers } from './world';
import { addToContainer, fmtMoney, makeItem } from './rules';
import { findHome } from './household';
import { AFFIXES, rollGearMods } from './progression';

// Materials themselves live in rules.ts ITEM_PROTOS (iron-scrap,
// leather-strips, night-herbs, ember-essence, hearty-stew).

export interface Recipe {
  key: string;
  label: string;
  room: 'workshop' | 'alchemy-room' | 'kitchen' | 'enchanters-study';
  needs: { proto: string; qty: number }[];
  makes: string; // proto key, or 'glyph' for enchanting
  minutes: number;
}

export const RECIPES: Recipe[] = [
  { key: 'smith-dagger', label: 'Smith a dagger', room: 'workshop', needs: [{ proto: 'iron-scrap', qty: 3 }], makes: 'dagger', minutes: 120 },
  { key: 'smith-shortsword', label: 'Smith an iron shortsword', room: 'workshop', needs: [{ proto: 'iron-scrap', qty: 6 }], makes: 'iron-shortsword', minutes: 180 },
  { key: 'smith-longsword', label: 'Smith an iron longsword', room: 'workshop', needs: [{ proto: 'iron-scrap', qty: 9 }], makes: 'iron-longsword', minutes: 240 },
  { key: 'cure-leather', label: 'Work leather armor', room: 'workshop', needs: [{ proto: 'leather-strips', qty: 8 }], makes: 'leather-armor', minutes: 200 },
  { key: 'brew-antidote', label: 'Brew an antidote', room: 'alchemy-room', needs: [{ proto: 'night-herbs', qty: 2 }], makes: 'antidote', minutes: 60 },
  { key: 'brew-tonic', label: 'Brew stoneblood tonic', room: 'alchemy-room', needs: [{ proto: 'night-herbs', qty: 2 }, { proto: 'iron-scrap', qty: 1 }], makes: 'stoneblood-tonic', minutes: 90 },
  { key: 'cook-stew', label: 'Cook hearty stew (x3)', room: 'kitchen', needs: [{ proto: 'ration', qty: 1 }, { proto: 'night-herbs', qty: 1 }], makes: 'hearty-stew', minutes: 60 },
];

function countMaterial(world: WorldState, proto: string): number {
  let n = 0;
  const scan = (ids: string[]) => {
    for (const iid of ids) {
      const it = world.items[iid];
      if (it?.proto === proto) n += it.qty ?? 1;
    }
  };
  for (const c of partyMembers(world)) scan(c.inventory);
  scan(world.partyInventory);
  const home = findHome(world);
  if (home) scan(world.locations[home].household!.storage);
  return n;
}

function consumeMaterial(world: WorldState, proto: string, qty: number) {
  let left = qty;
  const drain = (ids: string[], strip: (iid: string) => void) => {
    for (const iid of [...ids]) {
      if (left <= 0) return;
      const it = world.items[iid];
      if (it?.proto !== proto) continue;
      const take = Math.min(left, it.qty ?? 1);
      it.qty = (it.qty ?? 1) - take;
      left -= take;
      if ((it.qty ?? 0) <= 0) {
        strip(iid);
        it.owner = null;
      }
    }
  };
  for (const c of partyMembers(world)) drain(c.inventory, (iid) => (c.inventory = c.inventory.filter((x) => x !== iid)));
  drain(world.partyInventory, (iid) => (world.partyInventory = world.partyInventory.filter((x) => x !== iid)));
  const home = findHome(world);
  if (home) {
    const hh = world.locations[home].household!;
    drain(hh.storage, (iid) => (hh.storage = hh.storage.filter((x) => x !== iid)));
  }
}

export function canCraft(world: WorldState, recipe: Recipe): string | null {
  const home = findHome(world);
  if (!home) return 'No home to work in.';
  if (world.partyLocation !== home) return 'The bench is at home.';
  const hh = world.locations[home].household!;
  if (!hh.upgrades.includes(recipe.room)) return `Needs a ${recipe.room.replace(/-/g, ' ')}.`;
  for (const need of recipe.needs) {
    const have = countMaterial(world, need.proto);
    if (have < need.qty) return `Short of materials: ${need.qty}× ${need.proto.replace(/-/g, ' ')} (have ${have}).`;
  }
  return null;
}

export function craft(world: WorldState, recipeKey: string): string | null {
  const recipe = RECIPES.find((r) => r.key === recipeKey);
  if (!recipe) return 'No such recipe.';
  const blocked = canCraft(world, recipe);
  if (blocked) return blocked;
  for (const need of recipe.needs) consumeMaterial(world, need.proto, need.qty);
  addMinutes(world, recipe.minutes);
  const rng = new Rng(randomSeed());
  const mc = world.characters[world.mcId];
  const qty = recipe.makes === 'hearty-stew' ? 3 : 1;
  const item = makeItem(world, recipe.makes, qty);
  // craftsmanship: strength and a forge annex raise the odds
  const home = world.locations[findHome(world)!].household!;
  const luck = 1 + (mc.attributes.strength - 10) * 0.05 + (home.upgrades.includes('forge-annex') ? 0.6 : 0);
  if (item.kind === 'weapon' || item.kind === 'armor') rollGearMods(rng, item, Math.max(1, luck));
  item.history.push(`Crafted at home on Day ${world.time.day}`);
  addToContainer(world, item, mc);
  logEvent(world, 'craft', { recipe: recipe.key, made: item.name, qty }, `${mc.name} crafted ${qty > 1 ? `${qty}× ` : ''}${item.name} at the ${recipe.room.replace(/-/g, ' ')}.`, { location: world.partyLocation });
  return null;
}

/** Enchant: burn ember essence to put a rolled affix on carried gear. */
export function enchantItem(world: WorldState, itemId: string): string | null {
  const home = findHome(world);
  if (!home || world.partyLocation !== home) return 'The study is at home.';
  const hh = world.locations[home].household!;
  if (!hh.upgrades.includes('enchanters-study')) return 'Needs an enchanter’s study.';
  const item = world.items[itemId];
  if (!item || (item.kind !== 'weapon' && item.kind !== 'armor' && item.kind !== 'shield')) return 'Only arms and armor take a glyph.';
  if (item.affix) return `${item.name} already carries an enchantment.`;
  if (countMaterial(world, 'ember-essence') < 2) return 'Needs 2× ember essence.';
  consumeMaterial(world, 'ember-essence', 2);
  addMinutes(world, 120);
  const rng = new Rng(randomSeed());
  const before = item.name;
  const affix = rng.pick(AFFIXES);
  item.affix = { ...affix };
  item.name = `${item.name} ${affix.name}`;
  item.value = Math.round(item.value * 2 + 150);
  if (item.tier === 'mundane' || item.tier === 'common') item.tier = 'uncommon';
  logEvent(world, 'enchant', { item: item.id }, `${before} took a glyph at the study: it is now ${item.name}.`, { location: home });
  return null;
}

/** Materials drop from beasts, constructs, and the wider world. */
export const MATERIAL_DROPS: Record<string, { proto: string; chance: number; qty: [number, number] }[]> = {
  beast: [{ proto: 'leather-strips', chance: 0.5, qty: [1, 3] }],
  construct: [{ proto: 'iron-scrap', chance: 0.6, qty: [2, 4] }],
  human: [{ proto: 'iron-scrap', chance: 0.2, qty: [1, 2] }],
  goblin: [{ proto: 'iron-scrap', chance: 0.25, qty: [1, 2] }],
  cult: [{ proto: 'night-herbs', chance: 0.35, qty: [1, 2] }],
  vermin: [{ proto: 'leather-strips', chance: 0.2, qty: [1, 1] }],
  dragonkin: [{ proto: 'ember-essence', chance: 0.5, qty: [1, 2] }],
  demonkin: [{ proto: 'ember-essence', chance: 0.4, qty: [1, 2] }],
};

/** Gather a resource node found in a dungeon room. */
export function gatherResource(world: WorldState): string | null {
  if (!world.currentDungeon || !world.currentRoom) return 'Nothing to gather here.';
  const room = world.dungeons[world.currentDungeon].rooms[world.currentRoom];
  if (!room.resource || room.resource.gathered) return 'Nothing to gather here.';
  room.resource.gathered = true;
  addMinutes(world, 15);
  const rng = new Rng(randomSeed());
  const qty = rng.int(2, 4);
  const item = makeItem(world, room.resource.proto, qty);
  addToContainer(world, item, 'party');
  logEvent(world, 'gather', { proto: room.resource.proto, qty }, `The party gathered ${qty}× ${item.name} (worth ${fmtMoney(item.value * qty)}).`, { witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}
