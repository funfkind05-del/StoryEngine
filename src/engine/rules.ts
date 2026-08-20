// ============================================================
// The RPG Rules Engine. Single authority for: XP and levels,
// classes and training, the item catalog, stacking and
// encumbrance, consumable effects, status-effect rules, temple
// services, and currency. The dungeon doesn't decide what a
// goblin is worth, the combat UI doesn't decide what a potion
// heals, and the prose engine decides neither.
// ============================================================

import type {
  ActiveStatus,
  CharClass,
  Character,
  Item,
  ItemTier,
  StatusKey,
  WorldState,
} from './types';
import { OWNER_HOME, OWNER_PARTY } from './types';
import { Rng } from './rng';
import { festivalPriceMult } from './festivals';

// ---------- Currency (1 gold = 10 silver = 100 copper) ----------
export function fmtMoney(copper: number): string {
  const g = Math.floor(copper / 100);
  const s = Math.floor((copper % 100) / 10);
  const c = copper % 10;
  const parts: string[] = [];
  if (g) parts.push(`${g}g`);
  if (s) parts.push(`${s}s`);
  if (c || parts.length === 0) parts.push(`${c}c`);
  return parts.join(' ');
}

// ---------- XP & levels ----------
export const MAX_LEVEL = 50;

export function xpForLevel(level: number): number {
  return level * level * 100;
}

export function levelUpAvailable(c: Character): boolean {
  return c.alive && c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level);
}

export function trainingCost(currentLevel: number): number {
  // autoplayer-calibrated: the first climb must be reachable on
  // street-job money; the late climbs stay a real sink
  return 100 + currentLevel * 150; // L1: 250c, L5: 850c, L20: 3100c
}

// ---------- Classes ----------
export interface ClassDef {
  key: CharClass;
  label: string;
  trainer: string; // where you level up
  hpPerLevel: number;
  manaPerLevel: number;
  staminaPerLevel: number;
  attackEvery: number; // +1 attack every N levels
  defenseEvery: number;
  /** ability unlocked at a given level (skill/spell keys from combat) */
  unlocks: Record<number, string>;
}

export const CLASSES: Record<CharClass, ClassDef> = {
  fighter: {
    key: 'fighter', label: 'Fighter', trainer: 'Fighters Guild',
    hpPerLevel: 6, manaPerLevel: 0, staminaPerLevel: 3, attackEvery: 1, defenseEvery: 2,
    unlocks: { 2: 'shield-bash', 3: 'power-strike', 5: 'cleave', 8: 'whirlwind', 12: 'crushing-blow', 16: 'execute', 20: 'twin-cleave', 25: 'titanic-strike', 32: 'avatar-of-war', 40: 'worldbreaker' },
  },
  rogue: {
    key: 'rogue', label: 'Rogue', trainer: 'Thieves Guild',
    hpPerLevel: 4, manaPerLevel: 0, staminaPerLevel: 3, attackEvery: 1, defenseEvery: 2,
    unlocks: { 2: 'backstab', 4: 'dirty-fighting', 8: 'hamstring', 12: 'shadow-strike', 16: 'twin-fangs', 20: 'garrote', 25: 'death-mark', 32: 'thousand-cuts', 40: 'kingslayer' },
  },
  mage: {
    key: 'mage', label: 'Mage', trainer: 'Arcane College',
    hpPerLevel: 3, manaPerLevel: 5, staminaPerLevel: 1, attackEvery: 3, defenseEvery: 3,
    unlocks: { 1: 'firebolt', 3: 'frost-grasp', 5: 'fireball', 8: 'lightning-lance', 12: 'ice-storm', 16: 'immolate', 20: 'chain-lightning', 25: 'meteor', 32: 'cataclysm', 40: 'unmaking' },
  },
  priest: {
    key: 'priest', label: 'Priest', trainer: 'Temple',
    hpPerLevel: 4, manaPerLevel: 4, staminaPerLevel: 2, attackEvery: 2, defenseEvery: 2,
    unlocks: { 1: 'mend-wounds', 3: 'purify', 5: 'sanctuary', 8: 'greater-mending', 12: 'smite', 16: 'circle-of-renewal', 20: 'holy-fire', 25: 'aegis', 32: 'mass-renewal', 40: 'divine-wrath' },
  },
  ranger: {
    key: 'ranger', label: 'Ranger', trainer: "Hunter's Lodge",
    hpPerLevel: 5, manaPerLevel: 1, staminaPerLevel: 3, attackEvery: 1, defenseEvery: 2,
    unlocks: { 2: 'aimed-shot', 4: 'twin-strike', 8: 'pinning-shot', 12: 'volley', 16: 'piercing-arrow', 20: 'double-volley', 25: 'heartseeker', 32: 'storm-of-arrows', 40: 'wind-that-kills' },
  },
  bard: {
    key: 'bard', label: 'Bard', trainer: 'The Broken Crown',
    hpPerLevel: 4, manaPerLevel: 3, staminaPerLevel: 2, attackEvery: 2, defenseEvery: 2,
    unlocks: { 1: 'sharp-word', 3: 'rallying-chorus', 5: 'cutting-jest', 8: 'discordant-note', 12: 'march-of-old-kings', 16: 'siren-strain', 20: 'battle-hymn', 25: 'song-of-the-broken-crown', 32: 'requiem', 40: 'the-last-song' },
  },
  monk: {
    key: 'monk', label: 'Monk', trainer: 'House of the Open Hand',
    hpPerLevel: 5, manaPerLevel: 0, staminaPerLevel: 4, attackEvery: 1, defenseEvery: 2,
    unlocks: { 2: 'palm-strike', 4: 'flowing-fists', 8: 'iron-knuckle', 12: 'whirling-crane', 16: 'pressure-point', 20: 'hundred-hands', 25: 'dragon-fist', 32: 'empty-body', 40: 'fist-of-the-void' },
  },
  spellblade: {
    key: 'spellblade', label: 'Spellblade', trainer: 'The Edged Hall',
    hpPerLevel: 5, manaPerLevel: 3, staminaPerLevel: 2, attackEvery: 1, defenseEvery: 2,
    unlocks: { 1: 'spark-edge', 3: 'riposte', 5: 'flame-brand', 8: 'frost-guard', 12: 'storm-brand', 16: 'mirror-parry', 20: 'runic-burst', 25: 'runed-cleave', 32: 'blade-tempest', 40: 'edge-of-dawn' },
  },
  warlock: {
    key: 'warlock', label: 'Warlock', trainer: 'The Nameless Chapel',
    hpPerLevel: 4, manaPerLevel: 4, staminaPerLevel: 1, attackEvery: 3, defenseEvery: 3,
    unlocks: { 1: 'wither', 3: 'gnawing-dark', 5: 'hex', 8: 'soul-lash', 12: 'black-tide', 16: 'unravel', 20: 'pact-flame', 25: 'devouring-sign', 32: 'the-hungry-door', 40: 'name-eater' },
  },
  commoner: {
    key: 'commoner', label: 'Commoner', trainer: 'nowhere',
    hpPerLevel: 3, manaPerLevel: 0, staminaPerLevel: 2, attackEvery: 2, defenseEvery: 3,
    unlocks: {},
  },
};

/**
 * Apply one trained level. Returns human-readable gain lines.
 * (Money handling and the training-location check live in the caller.)
 */
export function applyTraining(c: Character): string[] {
  const def = CLASSES[c.charClass];
  const notes: string[] = [];
  c.level += 1;
  const hpGain = def.hpPerLevel + Math.floor((c.attributes.constitution - 10) / 3);
  c.hp.max += Math.max(1, hpGain);
  c.hp.current = c.hp.max;
  notes.push(`Maximum HP +${Math.max(1, hpGain)}`);
  if (def.manaPerLevel) {
    c.mana.max += def.manaPerLevel;
    c.mana.current = c.mana.max;
    notes.push(`Maximum Mana +${def.manaPerLevel}`);
  }
  c.stamina.max += def.staminaPerLevel;
  c.stamina.current = c.stamina.max;
  if (c.level % def.attackEvery === 0) {
    c.attack += 1;
    notes.push('Attack +1');
  }
  if (c.level % def.defenseEvery === 0) {
    c.defense += 1;
    notes.push('Defense +1');
  }
  // growth is the author's to assign
  c.attributePoints = (c.attributePoints ?? 0) + 1;
  notes.push('+1 attribute point (assign in the Party panel)');
  const unlock = def.unlocks[c.level];
  if (unlock && !c.abilities.includes(unlock)) {
    c.abilities.push(unlock);
    notes.push(`New ability: ${unlock.replace(/-/g, ' ')}`);
  }
  return notes;
}

// ---------- Item catalog ----------
export interface ItemProto {
  key: string;
  name: string;
  kind: Item['kind'];
  slot: Item['slot'];
  tier: ItemTier;
  damage?: string;
  defense?: number;
  healing?: string;
  effectKey?: string;
  ranged?: boolean;
  ammoProto?: string;
  durability?: number;
  stackable?: boolean;
  value: number;
  /** built-in enchantment (magic jewelry ships enchanted) */
  affix?: NonNullable<Item['affix']>;
}

export const ITEM_PROTOS: Record<string, ItemProto> = {
  // consumables
  'minor-healing-potion': { key: 'minor-healing-potion', name: 'Minor Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d11+9', stackable: true, value: 30 },
  'healing-potion': { key: 'healing-potion', name: 'Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d16+24', stackable: true, value: 80 },
  'greater-healing-potion': { key: 'greater-healing-potion', name: 'Greater Healing Potion', kind: 'potion', slot: 'none', tier: 'uncommon', healing: '1d31+59', stackable: true, value: 220 },
  'mana-draught': { key: 'mana-draught', name: 'Mana Draught', kind: 'potion', slot: 'none', tier: 'common', effectKey: 'mana-30', stackable: true, value: 90 },
  antidote: { key: 'antidote', name: 'Antidote', kind: 'potion', slot: 'none', tier: 'common', effectKey: 'cure-poisoned', stackable: true, value: 60 },
  'purification-elixir': { key: 'purification-elixir', name: 'Purification Elixir', kind: 'potion', slot: 'none', tier: 'uncommon', effectKey: 'cure-diseased', stackable: true, value: 150 },
  'stoneblood-tonic': { key: 'stoneblood-tonic', name: 'Stoneblood Tonic', kind: 'potion', slot: 'none', tier: 'uncommon', effectKey: 'defense-3-10', stackable: true, value: 120 },
  // supplies
  torch: { key: 'torch', name: 'Torch', kind: 'supply', slot: 'none', tier: 'mundane', stackable: true, value: 2 },
  rope: { key: 'rope', name: 'Rope (50 ft)', kind: 'supply', slot: 'none', tier: 'mundane', stackable: true, value: 10 },
  lockpick: { key: 'lockpick', name: 'Lockpick', kind: 'tool', slot: 'none', tier: 'mundane', stackable: true, value: 5 },
  bread: { key: 'bread', name: 'Bread', kind: 'supply', slot: 'none', tier: 'mundane', effectKey: 'food-25', stackable: true, value: 1 },
  ration: { key: 'ration', name: 'Trail Ration', kind: 'supply', slot: 'none', tier: 'mundane', effectKey: 'food-40', stackable: true, value: 4 },
  'sealed-package': { key: 'sealed-package', name: 'Sealed Package', kind: 'misc', slot: 'none', tier: 'mundane', stackable: true, value: 0 },
  // crafting materials & products
  'iron-scrap': { key: 'iron-scrap', name: 'Iron Scrap', kind: 'misc', slot: 'none', tier: 'mundane', stackable: true, value: 4 },
  'leather-strips': { key: 'leather-strips', name: 'Leather Strips', kind: 'misc', slot: 'none', tier: 'mundane', stackable: true, value: 3 },
  'night-herbs': { key: 'night-herbs', name: 'Night Herbs', kind: 'misc', slot: 'none', tier: 'common', stackable: true, value: 8 },
  'ember-essence': { key: 'ember-essence', name: 'Ember Essence', kind: 'misc', slot: 'none', tier: 'uncommon', stackable: true, value: 40 },
  'hearty-stew': { key: 'hearty-stew', name: 'Hearty Stew', kind: 'supply', slot: 'none', tier: 'common', effectKey: 'food-80', stackable: true, value: 12 },
  'harbor-fish': { key: 'harbor-fish', name: 'Harbor Fish', kind: 'supply', slot: 'none', tier: 'mundane', effectKey: 'food-30', stackable: true, value: 3 },
  'old-boot': { key: 'old-boot', name: 'Old Boot', kind: 'misc', slot: 'none', tier: 'mundane', stackable: true, value: 1 },
  // tomes & songbooks: read once, keep the ability forever
  'tome-of-firebolt': { key: 'tome-of-firebolt', name: 'Tome of the First Spark', kind: 'misc', slot: 'none', tier: 'rare', effectKey: 'teach-firebolt', value: 900 },
  'tome-of-mending': { key: 'tome-of-mending', name: 'Psalter of Small Mercies', kind: 'misc', slot: 'none', tier: 'rare', effectKey: 'teach-mend-wounds', value: 900 },
  'songbook-chorus': { key: 'songbook-chorus', name: 'Songbook: the Rallying Chorus', kind: 'misc', slot: 'none', tier: 'rare', effectKey: 'teach-rallying-chorus', value: 1100 },
  'manual-palm-strike': { key: 'manual-palm-strike', name: 'Manual of the Open Hand', kind: 'misc', slot: 'none', tier: 'rare', effectKey: 'teach-palm-strike', value: 800 },
  'grimoire-wither': { key: 'grimoire-wither', name: 'Grimoire of the Thin Places', kind: 'misc', slot: 'none', tier: 'rare', effectKey: 'teach-wither', value: 1000 },
  'folio-spark-edge': { key: 'folio-spark-edge', name: 'Folio of the Edged Hall', kind: 'misc', slot: 'none', tier: 'rare', effectKey: 'teach-spark-edge', value: 950 },
  // enchanted jewelry: ships with its magic already awake
  'ring-of-the-fox': { key: 'ring-of-the-fox', name: 'Ring of the Fox', kind: 'jewelry', slot: 'ring', tier: 'rare', value: 700, affix: { name: 'of the Fox', stat: 'evasion', amount: 2 } },
  'ring-of-the-bull': { key: 'ring-of-the-bull', name: 'Ring of the Bull', kind: 'jewelry', slot: 'ring', tier: 'rare', value: 750, affix: { name: 'of the Bull', stat: 'attack', amount: 1 } },
  'amulet-of-the-wall': { key: 'amulet-of-the-wall', name: 'Amulet of the Wall', kind: 'jewelry', slot: 'amulet', tier: 'rare', value: 800, affix: { name: 'of the Wall', stat: 'defense', amount: 2 } },
  'amulet-of-the-adder': { key: 'amulet-of-the-adder', name: 'Adder-Tooth Amulet', kind: 'jewelry', slot: 'amulet', tier: 'rare', value: 850, affix: { name: 'of the Adder', stat: 'critChance', amount: 5 } },
  'circlet-of-the-wind': { key: 'circlet-of-the-wind', name: 'Circlet of the Wind', kind: 'jewelry', slot: 'amulet', tier: 'exceptional', value: 1400, affix: { name: 'of the Wind', stat: 'initiative', amount: 3 } },
  // alchemy materials
  'bogroot': { key: 'bogroot', name: 'Bogroot', kind: 'misc', slot: 'none', tier: 'mundane', stackable: true, value: 6 },
  'silver-ash': { key: 'silver-ash', name: 'Silver Ash', kind: 'misc', slot: 'none', tier: 'common', stackable: true, value: 25 },
  'wyrm-scale': { key: 'wyrm-scale', name: 'Wyrm Scale', kind: 'misc', slot: 'none', tier: 'rare', stackable: true, value: 120 },
  'grave-mold': { key: 'grave-mold', name: 'Grave Mold', kind: 'misc', slot: 'none', tier: 'mundane', stackable: true, value: 8 },
  'harbor-pearl': { key: 'harbor-pearl', name: 'Harbor Pearl', kind: 'treasure', slot: 'none', tier: 'uncommon', stackable: true, value: 150 },
  // weapons & armor (shop stock)
  dagger: { key: 'dagger', name: 'Dagger', kind: 'weapon', slot: 'main-hand', tier: 'mundane', damage: '1d4+1', durability: 50, value: 90 },
  'iron-shortsword': { key: 'iron-shortsword', name: 'Iron Shortsword', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d6+1', durability: 80, value: 220 },
  'iron-longsword': { key: 'iron-longsword', name: 'Iron Longsword', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d8+1', durability: 100, value: 380 },
  'steel-longsword': { key: 'steel-longsword', name: 'Steel Longsword', kind: 'weapon', slot: 'main-hand', tier: 'uncommon', damage: '1d8+3', durability: 120, value: 840 },
  'iron-mace': { key: 'iron-mace', name: 'Iron Mace', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d8', durability: 110, value: 300 },
  'boarding-spear': { key: 'boarding-spear', name: 'Boarding Spear', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d8+1', durability: 90, value: 340 },
  'quarterstaff': { key: 'quarterstaff', name: 'Quarterstaff', kind: 'weapon', slot: 'main-hand', tier: 'mundane', damage: '1d6', durability: 80, value: 60 },
  'runed-staff': { key: 'runed-staff', name: 'Runed Staff', kind: 'weapon', slot: 'main-hand', tier: 'uncommon', damage: '1d6+2', durability: 100, value: 700 },
  'greatsword': { key: 'greatsword', name: 'Greatsword', kind: 'weapon', slot: 'main-hand', tier: 'uncommon', damage: '2d6+1', durability: 130, value: 1100 },
  'dueling-dagger': { key: 'dueling-dagger', name: 'Dueling Dagger', kind: 'weapon', slot: 'off-hand', tier: 'common', damage: '1d4+2', durability: 70, value: 260 },
  'monk-wraps': { key: 'monk-wraps', name: 'Weighted Hand-Wraps', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d6+1', durability: 90, value: 220 },
  'padded-jack': { key: 'padded-jack', name: 'Padded Jack', kind: 'armor', slot: 'armor', tier: 'mundane', defense: 1, durability: 60, value: 80 },
  'brigandine': { key: 'brigandine', name: 'Brigandine', kind: 'armor', slot: 'armor', tier: 'uncommon', defense: 3, durability: 110, value: 1200 },
  'scale-hauberk': { key: 'scale-hauberk', name: 'Scale Hauberk', kind: 'armor', slot: 'armor', tier: 'uncommon', defense: 4, durability: 130, value: 1900 },
  'warded-robes': { key: 'warded-robes', name: 'Warded Robes', kind: 'armor', slot: 'armor', tier: 'uncommon', defense: 2, durability: 80, value: 950 },
  'hunting-bow': { key: 'hunting-bow', name: 'Hunting Bow', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d6+2', durability: 70, value: 300, ranged: true, ammoProto: 'arrow' },
  longbow: { key: 'longbow', name: 'Longbow', kind: 'weapon', slot: 'main-hand', tier: 'uncommon', damage: '1d8+3', durability: 90, value: 780, ranged: true, ammoProto: 'arrow' },
  arrow: { key: 'arrow', name: 'Arrow', kind: 'supply', slot: 'none', tier: 'mundane', stackable: true, value: 1 },
  'wooden-buckler': { key: 'wooden-buckler', name: 'Wooden Buckler', kind: 'shield', slot: 'off-hand', tier: 'mundane', defense: 1, durability: 40, value: 60 },
  'leather-armor': { key: 'leather-armor', name: 'Leather Armor', kind: 'armor', slot: 'armor', tier: 'common', defense: 1, durability: 60, value: 180 },
  'studded-leather': { key: 'studded-leather', name: 'Studded Leather Armor', kind: 'armor', slot: 'armor', tier: 'common', defense: 2, durability: 80, value: 420 },
  'chain-shirt': { key: 'chain-shirt', name: 'Chain Shirt', kind: 'armor', slot: 'armor', tier: 'uncommon', defense: 3, durability: 110, value: 950 },
};

function freshItemId(world: WorldState): string {
  const n = (world.counters['ITEM'] ?? 0) + 1;
  world.counters['ITEM'] = n;
  return `ITEM_${String(n).padStart(4, '0')}`;
}

export function makeItem(world: WorldState, protoKey: string, qty = 1): Item {
  const p = ITEM_PROTOS[protoKey];
  if (!p) throw new Error(`unknown item proto: ${protoKey}`);
  const item: Item = {
    id: freshItemId(world),
    proto: p.key,
    name: p.name,
    kind: p.kind,
    slot: p.slot,
    tier: p.tier,
    damage: p.damage,
    defense: p.defense,
    healing: p.healing,
    effectKey: p.effectKey,
    affix: p.affix ? { ...p.affix } : undefined,
    ranged: p.ranged,
    ammoProto: p.ammoProto,
    durability: p.durability ? { current: p.durability, max: p.durability } : undefined,
    stackable: p.stackable,
    qty: p.stackable ? qty : undefined,
    value: p.value,
    owner: null,
    history: [],
  };
  world.items[item.id] = item;
  return item;
}

/**
 * Put an item into a container (character inventory, party supplies,
 * or home storage), merging stackables into an existing stack.
 */
export function addToContainer(world: WorldState, item: Item, holder: Character | 'party' | 'home') {
  const list = holder === 'party' ? world.partyInventory : holder === 'home' ? homeStorage(world) : holder.inventory;
  const ownerTag = holder === 'party' ? OWNER_PARTY : holder === 'home' ? OWNER_HOME : holder.id;
  if (item.stackable && item.proto) {
    // stolen goods never merge into clean stacks (and vice versa) —
    // stacking must not launder the flag off hot property
    const existing = list.map((id) => world.items[id]).find((i) => i && i.proto === item.proto && !i.broken && !!i.stolen === !!item.stolen);
    if (existing) {
      existing.qty = (existing.qty ?? 1) + (item.qty ?? 1);
      delete world.items[item.id];
      return;
    }
  }
  item.owner = ownerTag;
  list.push(item.id);
}

/** Remove n units from a stack (or the whole item). */
export function removeUnits(world: WorldState, item: Item, n = 1): void {
  if (item.stackable && (item.qty ?? 1) > n) {
    item.qty = (item.qty ?? 1) - n;
    return;
  }
  // remove entirely from whatever container holds it
  const removeFrom = (list: string[]) => {
    const idx = list.indexOf(item.id);
    if (idx >= 0) list.splice(idx, 1);
  };
  removeFrom(world.partyInventory);
  const home = Object.values(world.locations).find((l) => l.household);
  if (home?.household) removeFrom(home.household.storage);
  for (const c of Object.values(world.characters)) removeFrom(c.inventory);
  item.owner = null;
}

function homeStorage(world: WorldState): string[] {
  const home = Object.values(world.locations).find((l) => l.household);
  if (!home?.household) throw new Error('no home');
  return home.household.storage;
}

// ---------- Encumbrance ----------
export const LIGHT_SLOTS_BASE = 18;

export function slotsUsed(world: WorldState, c: Character): number {
  // one slot per item or stack; equipped gear rides free
  return c.inventory.map((id) => world.items[id]).filter((i) => i && i.equippedBy !== c.id).length;
}

export function slotCapacity(c: Character, world?: WorldState): number {
  const saddlebags = world?.mount ? 3 : 0; // the horse carries her share
  return LIGHT_SLOTS_BASE + Math.floor((c.attributes.strength - 10) / 2) * 2 + saddlebags;
}

export function hasRoomFor(world: WorldState, c: Character, item: Item): boolean {
  if (world.encumbrance === 'off') return true;
  if (item.stackable && item.proto && c.inventory.some((id) => world.items[id]?.proto === item.proto)) return true;
  return slotsUsed(world, c) < slotCapacity(c, world);
}

// ---------- Consumable effects ----------
export interface ConsumeResult {
  lines: string[];
}

export function consumeItem(world: WorldState, item: Item, target: Character, rng: Rng): ConsumeResult {
  const lines: string[] = [];
  if (item.healing) {
    const healed = rng.roll(item.healing);
    target.hp.current = Math.min(target.hp.max, target.hp.current + healed);
    lines.push(`${item.name} consumed. ${target.name} restored ${healed} HP.`);
  }
  if (item.effectKey?.startsWith('food-')) {
    const amount = parseInt(item.effectKey.slice(5), 10) || 20;
    eatFood(target, amount);
    lines.push(`${target.name} ate the ${item.name.toLowerCase()}${target.needs.hunger <= 10 ? ' and is well fed' : ''}.`);
  }
  if (item.effectKey?.startsWith('teach-')) {
    const abilityKey = item.effectKey.slice(6);
    if (target.abilities.includes(abilityKey)) {
      lines.push(`${target.name} already knows ${abilityKey.replace(/-/g, ' ')}; the pages hold nothing new.`);
      return { lines }; // the tome survives an idle read
    }
    target.abilities.push(abilityKey);
    lines.push(`${target.name} studied ${item.name} until the candle died — and learned ${abilityKey.replace(/-/g, ' ')}.`);
  }
  switch (item.effectKey) {
    case 'mana-30': {
      target.mana.current = Math.min(target.mana.max, target.mana.current + 30);
      lines.push(`${target.name} restored 30 mana.`);
      break;
    }
    case 'cure-poisoned':
      lines.push(cureStatus(target, 'poisoned') ? `The poison in ${target.name}'s blood went quiet.` : `${target.name} was not poisoned; the antidote is spent anyway.`);
      break;
    case 'cure-diseased':
      lines.push(cureStatus(target, 'diseased') ? `${target.name}'s fever broke.` : `${target.name} had no disease to purge.`);
      break;
    case 'defense-3-10':
      target.tempBonuses.push({ stat: 'defense', amount: 3, roundsLeft: 10, source: item.name });
      lines.push(`${target.name}'s skin greyed like granite: +3 Defense for 10 rounds.`);
      break;
  }
  removeUnits(world, item, 1);
  return { lines };
}

// ---------- Status effects ----------
export interface StatusRule {
  key: StatusKey;
  label: string;
  perRoundDamage?: number;
  per10MinDamage?: number;
  defaultRounds?: number;
  attackMod?: number;
  defenseMod?: number;
}

export const STATUS_RULES: Record<StatusKey, StatusRule> = {
  poisoned: { key: 'poisoned', label: 'Poisoned', perRoundDamage: 3, per10MinDamage: 3 },
  diseased: { key: 'diseased', label: 'Diseased', attackMod: -2, defenseMod: -1 },
  bleeding: { key: 'bleeding', label: 'Bleeding', perRoundDamage: 2, defaultRounds: 5 },
  burning: { key: 'burning', label: 'Burning', perRoundDamage: 4, defaultRounds: 3 },
  stunned: { key: 'stunned', label: 'Stunned', defaultRounds: 1 },
  blinded: { key: 'blinded', label: 'Blinded', attackMod: -4, defaultRounds: 3 },
  silenced: { key: 'silenced', label: 'Silenced', defaultRounds: 3 },
  cursed: { key: 'cursed', label: 'Cursed', attackMod: -1, defenseMod: -1 },
  paralyzed: { key: 'paralyzed', label: 'Paralyzed', defaultRounds: 2 },
  unconscious: { key: 'unconscious', label: 'Unconscious' },
};

export function hasStatus(c: Character, key: StatusKey): boolean {
  return c.statuses.some((s) => s.key === key);
}

export function applyStatus(c: Character, key: StatusKey, rounds?: number, source?: string) {
  if (hasStatus(c, key)) return;
  const rule = STATUS_RULES[key];
  const resist = c.resistances[key === 'poisoned' ? 'poison' : key] ?? 0;
  if (resist >= 3) return; // strong resistance shrugs it off
  const s: ActiveStatus = { key, source };
  const r = rounds ?? rule.defaultRounds;
  if (r !== undefined) s.roundsLeft = r;
  c.statuses.push(s);
}

export function cureStatus(c: Character, key: StatusKey): boolean {
  const before = c.statuses.length;
  c.statuses = c.statuses.filter((s) => s.key !== key);
  return c.statuses.length < before;
}

/** Status upkeep at the start of a combat round. Returns log lines. */
export function tickStatusesRound(c: Character): string[] {
  const lines: string[] = [];
  for (const s of [...c.statuses]) {
    const rule = STATUS_RULES[s.key];
    if (rule.perRoundDamage && c.hp.current > 0) {
      c.hp.current = Math.max(0, c.hp.current - rule.perRoundDamage);
      lines.push(`${c.name} suffers ${rule.perRoundDamage} damage from ${rule.label.toLowerCase()}.`);
      if (c.hp.current === 0) lines.push(`${c.name} collapsed from it.`);
    }
    if (s.roundsLeft !== undefined) {
      s.roundsLeft -= 1;
      if (s.roundsLeft <= 0) {
        c.statuses = c.statuses.filter((x) => x !== s);
        if (s.key !== 'stunned') lines.push(`${c.name} is no longer ${rule.label.toLowerCase()}.`);
      }
    }
  }
  for (const b of [...c.tempBonuses]) {
    b.roundsLeft -= 1;
    if (b.roundsLeft <= 0) c.tempBonuses = c.tempBonuses.filter((x) => x !== b);
  }
  return lines;
}

/** Status damage outside combat (called from the world tick). */
export function tickStatusesOverTime(c: Character, minutes: number): string[] {
  const lines: string[] = [];
  for (const s of c.statuses) {
    if (s.roundsLeft !== undefined) continue; // combat-scoped; combat ticks it
    const rule = STATUS_RULES[s.key];
    if (rule.per10MinDamage) {
      const ticks = Math.floor(minutes / 10);
      if (ticks > 0 && c.hp.current > 1) {
        const dmg = Math.min(c.hp.current - 1, rule.per10MinDamage * ticks);
        c.hp.current -= dmg;
        if (dmg > 0) lines.push(`${c.name} lost ${dmg} HP to ${rule.label.toLowerCase()} (untreated).`);
      }
    }
    // untreated afflictions run their course: ~2 days, then the body
    // wins or the fever breaks — no eternal sentences for the destitute
    if (s.key === 'poisoned' || s.key === 'diseased' || s.key === 'bleeding' || s.key === 'burning') {
      s.minutesUntreated = (s.minutesUntreated ?? 0) + minutes;
      if (s.minutesUntreated >= 2880) {
        s.expired = true;
        lines.push(`${c.name}'s ${rule.label.toLowerCase()} finally ran its course.`);
      }
    }
  }
  c.statuses = c.statuses.filter((s) => !s.expired);
  return lines;
}

export function statusAttackMod(c: Character): number {
  return c.statuses.reduce((m, s) => m + (STATUS_RULES[s.key].attackMod ?? 0), 0)
    + c.tempBonuses.filter((b) => b.stat === 'attack').reduce((m, b) => m + b.amount, 0);
}

export function statusDefenseMod(c: Character): number {
  return c.statuses.reduce((m, s) => m + (STATUS_RULES[s.key].defenseMod ?? 0), 0)
    + c.tempBonuses.filter((b) => b.stat === 'defense').reduce((m, b) => m + b.amount, 0);
}

// ---------- Survival needs ----------
// Hunger climbs ~3/hour (a full day unfed ≈ 72 — deep in the penalties);
// fatigue ~5/hour awake (a normal day ends around 80 — bed calls).
export const NEEDS = {
  hungerPerHour: 3,
  fatiguePerHour: 5,
  uncomfortable: 60,
  critical: 85,
};

export interface NeedsWarning {
  line: string;
}

/** Advance one character's needs by `minutes`; returns threshold-crossing warnings. */
export function advanceNeeds(c: Character, minutes: number): string[] {
  const warnings: string[] = [];
  const cross = (before: number, after: number, at: number, line: string) => {
    if (before < at && after >= at) warnings.push(line);
  };
  const h0 = c.needs.hunger;
  const f0 = c.needs.fatigue;
  c.needs.hunger = Math.min(100, c.needs.hunger + (NEEDS.hungerPerHour * minutes) / 60);
  c.needs.fatigue = Math.min(100, c.needs.fatigue + (NEEDS.fatiguePerHour * minutes) / 60);
  cross(h0, c.needs.hunger, NEEDS.uncomfortable, `${c.name} is hungry — it's been too long since a real meal.`);
  cross(h0, c.needs.hunger, NEEDS.critical, `${c.name} is starving. Strength is going out of them.`);
  cross(f0, c.needs.fatigue, NEEDS.uncomfortable, `${c.name} is flagging — they need sleep before long.`);
  cross(f0, c.needs.fatigue, NEEDS.critical, `${c.name} is dead on their feet, stumbling through exhaustion.`);
  return warnings;
}

export function eatFood(c: Character, amount: number) {
  c.needs.hunger = Math.max(0, c.needs.hunger - amount);
}

export function sleepOff(c: Character) {
  c.needs.fatigue = 0;
}

/** Combat/regen penalties from unmet needs. */
export function needsAttackMod(c: Character): number {
  let mod = 0;
  if (c.needs.hunger >= NEEDS.critical) mod -= 2;
  if (c.needs.fatigue >= NEEDS.critical) mod -= 3;
  else if (c.needs.fatigue >= NEEDS.uncomfortable) mod -= 1;
  return mod;
}

export function needsDefenseMod(c: Character): number {
  let mod = 0;
  if (c.needs.fatigue >= NEEDS.critical) mod -= 2;
  else if (c.needs.fatigue >= NEEDS.uncomfortable) mod -= 1;
  return mod;
}

/** Starving characters stop recovering HP; the badly tired regain no stamina. */
export function needsBlocksHpRegen(c: Character): boolean {
  return c.needs.hunger >= NEEDS.critical;
}

export function needsBlocksStaminaRegen(c: Character): boolean {
  return c.needs.hunger >= NEEDS.uncomfortable || c.needs.fatigue >= NEEDS.critical;
}

// ---------- Injuries & scars ----------
const INJURY_FORMS: { name: string; stat: 'attack' | 'defense'; scar: string }[] = [
  { name: 'a deep shoulder wound', stat: 'attack', scar: 'a ridged scar across the shoulder' },
  { name: 'a badly bruised sword-arm', stat: 'attack', scar: 'an arm that aches before rain' },
  { name: 'cracked ribs', stat: 'defense', scar: 'a hitch in the breath on cold mornings' },
  { name: 'a torn thigh muscle', stat: 'defense', scar: 'a thin white line down the thigh' },
  { name: 'a gashed brow', stat: 'attack', scar: 'a pale scar through the eyebrow' },
  { name: 'a mangled hand', stat: 'attack', scar: 'two fingers that never sit quite straight' },
];

/** Roll a lasting injury for a character who went down. Returns its name or null. */
export function rollInjury(c: Character, rng: Rng): string | null {
  if (!rng.chance(0.4)) return null;
  const form = rng.pick(INJURY_FORMS);
  c.injuries.push({ ...form, amount: -1, day: 0, treated: false });
  return form.name;
}

export function injuryAttackMod(c: Character): number {
  return c.injuries.filter((i) => !i.treated && i.stat === 'attack').reduce((s, i) => s + i.amount, 0);
}

export function injuryDefenseMod(c: Character): number {
  return c.injuries.filter((i) => !i.treated && i.stat === 'defense').reduce((s, i) => s + i.amount, 0);
}

/** Treat all untreated injuries; each leaves its scar as permanent flavor. */
export function treatInjuries(c: Character): string[] {
  const treated: string[] = [];
  for (const inj of c.injuries) {
    if (inj.treated) continue;
    inj.treated = true;
    c.permanentBonuses.push(`Scar: ${inj.scar}`);
    treated.push(inj.name);
  }
  return treated;
}

// ---------- Weather & calendar ----------
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export function seasonOf(day: number): (typeof SEASONS)[number] {
  return SEASONS[Math.floor(((day - 1) % 360) / 90)];
}

export function calendarLabel(day: number): string {
  const season = seasonOf(day);
  const into = ((day - 1) % 90) + 1;
  const part = into <= 30 ? 'early' : into <= 60 ? 'mid' : 'late';
  return `${part} ${season}`;
}

const WEATHER_BY_SEASON: Record<string, [string, number][]> = {
  spring: [['clear', 3], ['overcast', 3], ['rain', 3], ['fog', 2], ['storm', 1]],
  summer: [['clear', 5], ['overcast', 2], ['rain', 1], ['storm', 2]],
  autumn: [['overcast', 4], ['rain', 3], ['fog', 3], ['clear', 2], ['storm', 1]],
  winter: [['overcast', 3], ['snow', 3], ['fog', 2], ['clear', 2], ['storm', 1]],
};

export const WEATHER_GLYPH: Record<string, string> = {
  clear: '☀', overcast: '☁', rain: '🌧', storm: '⛈', fog: '🌫', snow: '❄',
};

/** Deterministic weather for a given world-day. */
export function weatherFor(masterSeed: number, day: number): string {
  const rng = new Rng((masterSeed ^ (day * 2654435761)) >>> 0);
  const table = WEATHER_BY_SEASON[seasonOf(day)];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let at = rng.next() * total;
  for (const [kind, w] of table) {
    at -= w;
    if (at <= 0) return kind;
  }
  return 'clear';
}

// ---------- Faction-aware pricing ----------
export function dominantFaction(world: WorldState, locId: string): string | null {
  const loc = world.locations[locId];
  if (!loc) return null;
  const entries = Object.entries(loc.factionInfluence);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** Price multiplier at a shop, from the buyer's standing with whoever runs the street. */
export function shopPriceMult(world: WorldState, locId: string, buyer: Character): number {
  const fest = festivalPriceMult(world);
  const fac = dominantFaction(world, locId);
  if (!fac) return fest;
  const rep = buyer.factionReputation[fac] ?? 0;
  if (rep <= -6) return Infinity; // refused service
  if (rep <= -3) return 1.25 * fest;
  if (rep >= 6) return 0.8 * fest;
  if (rep >= 3) return 0.9 * fest;
  return fest;
}

// ---------- Temple services ----------
export interface TempleService {
  key: string;
  label: string;
  basePrice: number; // copper
  needsDead?: boolean;
}

export const TEMPLE_SERVICES: TempleService[] = [
  { key: 'minor-healing', label: 'Minor Healing (half HP)', basePrice: 40 },
  { key: 'full-healing', label: 'Full Healing', basePrice: 170 },
  { key: 'cure-poison', label: 'Cure Poison', basePrice: 120 },
  { key: 'cure-disease', label: 'Cure Disease', basePrice: 300 },
  { key: 'remove-curse', label: 'Remove Curse', basePrice: 750 },
  { key: 'mend-injuries', label: 'Mend Lasting Harm (injuries)', basePrice: 500 },
  { key: 'resurrection', label: 'Resurrection', basePrice: 3000, needsDead: true },
  { key: 'memorial', label: 'Memorial Rite (for the fallen)', basePrice: 200, needsDead: true },
];

/** Reputation with the temple's faction discounts or inflates prices. */
export function templePrice(world: WorldState, svc: TempleService, payer: Character, templeFaction: string | null): number {
  void world;
  const rep = templeFaction ? payer.factionReputation[templeFaction] ?? 0 : 0;
  const mult = rep >= 5 ? 0.5 : rep >= 2 ? 0.75 : rep <= -5 ? Infinity : rep <= -2 ? 1.5 : 1;
  return mult === Infinity ? Infinity : Math.round(svc.basePrice * mult);
}

export function performTempleService(svcKey: string, target: Character): string {
  switch (svcKey) {
    case 'minor-healing':
      target.hp.current = Math.min(target.hp.max, target.hp.current + Math.ceil(target.hp.max / 2));
      return `${target.name} was healed to ${target.hp.current}/${target.hp.max} HP.`;
    case 'full-healing':
      target.hp.current = target.hp.max;
      return `${target.name} was fully healed.`;
    case 'cure-poison':
      cureStatus(target, 'poisoned');
      return `The poison was drawn out of ${target.name}.`;
    case 'cure-disease':
      cureStatus(target, 'diseased');
      return `${target.name}'s disease was cured.`;
    case 'remove-curse':
      cureStatus(target, 'cursed');
      return `The curse on ${target.name} was lifted.`;
    case 'mend-injuries': {
      const treated = treatInjuries(target);
      return treated.length
        ? `${target.name}'s lasting wounds were mended: ${treated.join(', ')}. The scars remain.`
        : `${target.name} carries no lasting wounds.`;
    }
    case 'memorial':
      if (target.memorialized) return `${target.name}'s rite was already spoken. Once is what the dead ask.`;
      target.memorialized = true;
      return `The Flame spoke ${target.name}'s name into the smoke, and the party said the answering line. What was carried alone is carried together now.`;
    case 'resurrection':
      target.alive = true;
      target.diedOnDay = undefined;
      target.statuses = [];
      target.hp.current = 1;
      return `${target.name} drew breath again, pale and shaking.`;
    default:
      return 'Nothing happened.';
  }
}

// ---------- Loot tiers ----------
export const TIER_ORDER_LOOT: ItemTier[] = ['mundane', 'common', 'uncommon', 'rare', 'exceptional', 'legendary', 'artifact'];

export function tierColor(tier: ItemTier | undefined): string {
  switch (tier) {
    case 'uncommon': return 'var(--accent2)';
    case 'rare': return 'var(--info)';
    case 'exceptional': return '#b07fd6';
    case 'legendary': return 'var(--accent)';
    case 'artifact': return 'var(--danger)';
    default: return 'var(--text-dim)';
  }
}
