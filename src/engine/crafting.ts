// Crafting: materials gathered from kills and dungeon nodes become
// weapons, armor, glyphs, and food at the household's working rooms.
// Quality rolls on crafted gear reward a well-built home (forge annex)
// and high strength; enchanting applies affix glyphs at the study.

import type { WorldState, Item } from './types';
import { Rng, randomSeed } from './rng';
import { addMinutes, logEvent, partyMembers } from './world';
import { addToContainer, fmtMoney, makeItem, ITEM_PROTOS } from './rules';
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
  { key: 'brew-healing', label: 'Brew a healing potion', room: 'alchemy-room', needs: [{ proto: 'night-herbs', qty: 3 }, { proto: 'bogroot', qty: 2 }], makes: 'healing-potion', minutes: 90 },
  { key: 'brew-greater-healing', label: 'Brew a greater healing potion', room: 'alchemy-room', needs: [{ proto: 'night-herbs', qty: 4 }, { proto: 'silver-ash', qty: 2 }], makes: 'greater-healing-potion', minutes: 150 },
  { key: 'brew-mana', label: 'Distil a mana draught', room: 'alchemy-room', needs: [{ proto: 'bogroot', qty: 2 }, { proto: 'silver-ash', qty: 1 }], makes: 'mana-draught', minutes: 90 },
  { key: 'brew-purification', label: 'Brew a purification elixir', room: 'alchemy-room', needs: [{ proto: 'grave-mold', qty: 3 }, { proto: 'silver-ash', qty: 1 }], makes: 'purification-elixir', minutes: 120 },
  { key: 'smith-mace', label: 'Smith an iron mace', room: 'workshop', needs: [{ proto: 'iron-scrap', qty: 7 }], makes: 'iron-mace', minutes: 200 },
  { key: 'smith-spear', label: 'Smith a boarding spear', room: 'workshop', needs: [{ proto: 'iron-scrap', qty: 5 }, { proto: 'leather-strips', qty: 2 }], makes: 'boarding-spear', minutes: 180 },
  { key: 'temper-scale', label: 'Temper a scale hauberk', room: 'workshop', needs: [{ proto: 'iron-scrap', qty: 12 }, { proto: 'wyrm-scale', qty: 2 }, { proto: 'leather-strips', qty: 4 }], makes: 'scale-hauberk', minutes: 400 },
];

export function countMaterial(world: WorldState, proto: string): number {
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
export function enchantItem(world: WorldState, itemId: string, chosenAffix?: string): string | null {
  const home = findHome(world);
  if (!home || world.partyLocation !== home) return 'The study is at home.';
  const hh = world.locations[home].household!;
  if (!hh.upgrades.includes('enchanters-study')) return 'Needs an enchanter’s study.';
  const item = world.items[itemId];
  if (!item || (item.kind !== 'weapon' && item.kind !== 'armor' && item.kind !== 'shield')) return 'Only arms and armor take a glyph.';
  if (item.affix) return `${item.name} already carries an enchantment.`;
  const cost = chosenAffix ? 3 : 2; // choosing the glyph costs a third essence
  if (countMaterial(world, 'ember-essence') < cost) return `Needs ${cost}× ember essence${chosenAffix ? ' (a chosen glyph runs richer)' : ''}.`;
  const picked = chosenAffix ? AFFIXES.find((a) => a.name === chosenAffix) : undefined;
  if (chosenAffix && !picked) return 'No such glyph.';
  consumeMaterial(world, 'ember-essence', cost);
  addMinutes(world, 120);
  const rng = new Rng(randomSeed());
  const before = item.name;
  const affix = picked ?? rng.pick(AFFIXES);
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
  dragonkin: [{ proto: 'ember-essence', chance: 0.5, qty: [1, 2] }, { proto: 'wyrm-scale', chance: 0.35, qty: [1, 2] }],
  demonkin: [{ proto: 'ember-essence', chance: 0.4, qty: [1, 2] }],
  undead: [{ proto: 'grave-mold', chance: 0.45, qty: [1, 3] }],
  swamp: [{ proto: 'bogroot', chance: 0.5, qty: [1, 3] }],
  arcane: [{ proto: 'silver-ash', chance: 0.4, qty: [1, 2] }],
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


// ---------- set stations (the ESO inheritance) ----------
// Special gear is not found; it is MADE — at particular benches, from
// materials the deep places guard, to designs with names.

export interface SetRecipe {
  key: string;
  /** family for the 2-piece bonus (progression.SET_FAMILIES) */
  setKey: string;
  label: string;
  station: string; // location id
  stationName: string;
  baseProto: string;
  itemName: string;
  lore: string;
  quality: NonNullable<Item['quality']>;
  tier: 'rare' | 'exceptional';
  affixes: [NonNullable<Item['affix']>, NonNullable<Item['affix']>];
  needs: { proto: string; qty: number }[];
  minutes: number;
}

export const SET_RECIPES: SetRecipe[] = [
  {
    key: 'ashgrip',
    setKey: 'ashgrip',
    label: 'Forge the Ashgrip Blade',
    station: 'LOC_FORGE',
    stationName: 'Harrow\u2019s Forge',
    baseProto: 'steel-longsword',
    itemName: 'Ashgrip Blade',
    lore: 'Harrow\u2019s masterwork pattern: steel quenched in ember-ash, the grip wound with wyrm-scale. The old smiths made nine; the pattern-book says the tenth is whoever earns the metal.',
    quality: 'superior',
    tier: 'exceptional',
    affixes: [{ name: 'of the Warlord', stat: 'attack', amount: 2 }, { name: 'of the Adder', stat: 'critChance', amount: 6 }],
    needs: [{ proto: 'iron-scrap', qty: 8 }, { proto: 'ember-essence', qty: 2 }, { proto: 'wyrm-scale', qty: 1 }],
    minutes: 480,
  },
  {
    key: 'tidewalker',
    setKey: 'tidewalker',
    label: 'Fit the Tidewalker Hauberk',
    station: 'LOC_SALTMERE',
    stationName: 'Saltmere\u2019s drying racks',
    baseProto: 'scale-hauberk',
    itemName: 'Tidewalker Hauberk',
    lore: 'Scale cured in Saltmere brine until it forgets it was ever fish or steel. The village fits one a generation, for whoever the sea keeps refusing to drown.',
    quality: 'superior',
    tier: 'exceptional',
    affixes: [{ name: 'of the Wall', stat: 'defense', amount: 2 }, { name: 'of the Fox', stat: 'evasion', amount: 2 }],
    needs: [{ proto: 'iron-scrap', qty: 10 }, { proto: 'leather-strips', qty: 4 }, { proto: 'bogroot', qty: 3 }, { proto: 'wyrm-scale', qty: 1 }],
    minutes: 480,
  },
  {
    key: 'edgesong',
    setKey: 'edgesong',
    label: 'Cut the Edgesong Runes',
    station: 'LOC_EDGEDHALL',
    stationName: 'the Edged Hall',
    baseProto: 'greatsword',
    itemName: 'Edgesong Greatsword',
    lore: 'A duelist\u2019s blade with the Hall\u2019s treaty-breaking sigils cut full length. It hums a fifth above the note of whatever it last struck. The College files a complaint annually.',
    quality: 'superior',
    tier: 'exceptional',
    affixes: [{ name: 'of the Wind', stat: 'initiative', amount: 2 }, { name: 'of the Warlord', stat: 'attack', amount: 2 }],
    needs: [{ proto: 'iron-scrap', qty: 9 }, { proto: 'silver-ash', qty: 3 }, { proto: 'ember-essence', qty: 2 }],
    minutes: 480,
  },
  {
    key: 'lamplight-mail',
    setKey: 'lamplight',
    label: 'Rivet the Lamplight Mail',
    station: 'LOC_LAMPHALL',
    stationName: 'Lamplighters\u2019 Hall',
    baseProto: 'brigandine',
    itemName: 'Lamplight Brigandine',
    lore: 'Union work: plates lacquered with lamp-soot until they drink the light instead of throwing it. Ladder-crews wore these on the bad rounds. The bad rounds are why there are spares.',
    quality: 'superior',
    tier: 'rare',
    affixes: [{ name: 'of the Lamplight', stat: 'evasion', amount: 3 }, { name: 'of the Wall', stat: 'defense', amount: 2 }],
    needs: [{ proto: 'iron-scrap', qty: 8 }, { proto: 'leather-strips', qty: 5 }, { proto: 'night-herbs', qty: 2 }],
    minutes: 420,
  },
  {
    key: 'ashgrip-band',
    setKey: 'ashgrip',
    label: 'Forge the Ashgrip Band',
    station: 'LOC_FORGE',
    stationName: 'Harrow\u2019s Forge',
    baseProto: 'iron-band',
    itemName: 'Ashgrip Band',
    lore: 'The pattern-book\u2019s footnote: the blade wants a keeper. A ring of the same quench, worn sword-hand, so the metal knows its own.',
    quality: 'superior',
    tier: 'rare',
    affixes: [{ name: 'of the Warlord', stat: 'attack', amount: 1 }, { name: 'of the Adder', stat: 'critChance', amount: 3 }],
    needs: [{ proto: 'iron-scrap', qty: 3 }, { proto: 'ember-essence', qty: 1 }],
    minutes: 180,
  },
  {
    key: 'tidewalker-charm',
    setKey: 'tidewalker',
    label: 'Cure the Tidewalker Charm',
    station: 'LOC_SALTMERE',
    stationName: 'Saltmere\u2019s drying racks',
    baseProto: 'iron-band',
    itemName: 'Tidewalker Charm',
    lore: 'A knot of brine-cured cord and scale on an iron band. The sea keeps refusing; the charm keeps count.',
    quality: 'superior',
    tier: 'rare',
    affixes: [{ name: 'of the Wall', stat: 'defense', amount: 1 }, { name: 'of the Fox', stat: 'evasion', amount: 1 }],
    needs: [{ proto: 'leather-strips', qty: 2 }, { proto: 'bogroot', qty: 2 }],
    minutes: 180,
  },
  {
    key: 'edgesong-locket',
    setKey: 'edgesong',
    label: 'Cut the Edgesong Locket',
    station: 'LOC_EDGEDHALL',
    stationName: 'the Edged Hall',
    baseProto: 'iron-band',
    itemName: 'Edgesong Locket',
    lore: 'A sliver of the greatsword\u2019s off-cut steel, sigil-scored, worn at the throat where the hum can reach the blood.',
    quality: 'superior',
    tier: 'rare',
    affixes: [{ name: 'of the Wind', stat: 'initiative', amount: 1 }, { name: 'of the Adder', stat: 'critChance', amount: 2 }],
    needs: [{ proto: 'iron-scrap', qty: 2 }, { proto: 'silver-ash', qty: 2 }],
    minutes: 180,
  },
  {
    key: 'lamplight-band',
    setKey: 'lamplight',
    label: 'Rivet the Lamplight Band',
    station: 'LOC_LAMPHALL',
    stationName: 'Lamplighters\u2019 Hall',
    baseProto: 'iron-band',
    itemName: 'Lamplight Band',
    lore: 'Union issue, soot-lacquered like the mail. Ladder-crews touch it before a bad round. Spares exist for the same reason the mail\u2019s do.',
    quality: 'superior',
    tier: 'rare',
    affixes: [{ name: 'of the Lamplight', stat: 'evasion', amount: 1 }, { name: 'of the Wall', stat: 'defense', amount: 1 }],
    needs: [{ proto: 'iron-scrap', qty: 2 }, { proto: 'night-herbs', qty: 1 }],
    minutes: 150,
  },
];

/** Craft a named set piece at its station. Materials from all pools. */
export function craftSetPiece(world: WorldState, key: string): string | null {
  const recipe = SET_RECIPES.find((r) => r.key === key);
  if (!recipe) return 'No such pattern.';
  if (world.partyLocation !== recipe.station) return `That pattern is worked at ${recipe.stationName}.`;
  for (const n of recipe.needs) {
    if (countMaterial(world, n.proto) < n.qty) {
      return `The pattern wants ${recipe.needs.map((x) => `${x.qty}× ${ITEM_PROTOS[x.proto]?.name ?? x.proto}`).join(', ')} — short on ${ITEM_PROTOS[n.proto]?.name ?? n.proto}.`;
    }
  }
  for (const n of recipe.needs) consumeMaterial(world, n.proto, n.qty);
  addMinutes(world, recipe.minutes);
  const mc = world.characters[world.mcId];
  const item = makeItem(world, recipe.baseProto, 1);
  item.name = recipe.itemName;
  item.quality = recipe.quality;
  item.tier = recipe.tier;
  item.affix = { ...recipe.affixes[0] };
  item.affix2 = { ...recipe.affixes[1] };
  item.setKey = recipe.setKey;
  item.lore = recipe.lore;
  item.value = Math.round(item.value * 5 + 800);
  if (item.damage) item.damage = `${item.damage}+2`.replace(/\+(\d+)\+2$/, (_m, n) => `+${parseInt(n, 10) + 2}`);
  if (item.defense !== undefined) item.defense += 2;
  item.history.push(`Made to the ${recipe.itemName} pattern at ${recipe.stationName} on Day ${world.time.day}`);
  addToContainer(world, item, mc);
  logEvent(world, 'craft.set', { key, item: item.id }, `${mc.name} worked the ${recipe.itemName} pattern at ${recipe.stationName} — hours of it — and held up something with a NAME. ${recipe.lore}`, { location: recipe.station, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}
