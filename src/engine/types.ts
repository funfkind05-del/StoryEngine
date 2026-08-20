// ============================================================
// Core entity types for the story simulation engine.
// Everything here must remain JSON-serializable: the whole
// WorldState is snapshotted with structuredClone and exported
// as a save file.
// ============================================================

// ---------- IDs ----------
export type LocationId = string; // LOC_*
export type CharacterId = string; // CHAR_* (persistent) / NPC_* (background)
export type ItemId = string; // ITEM_*
export type FactionId = string; // FAC_*
export type DungeonId = string; // DUN_*
export type RoomId = string; // ROOM_*
export type EventId = string; // EVT_*
export type SceneId = string; // SCN_*
export type MonsterId = string; // MON_* (a live combat instance)

// ---------- Time ----------
export interface WorldTime {
  day: number; // world day, starts at 1
  minute: number; // minutes since midnight, 0..1439
}

// ---------- Locations ----------
export type LocationType =
  | 'city'
  | 'district'
  | 'street'
  | 'tavern'
  | 'inn'
  | 'shop'
  | 'temple'
  | 'guildhall'
  | 'market'
  | 'residence'
  | 'warehouse'
  | 'gate'
  | 'dungeon-entrance'
  | 'dungeon-room'
  | 'landmark'
  | 'alley'
  | 'dock';

export type LocationState =
  | 'open'
  | 'closed'
  | 'damaged'
  | 'destroyed'
  | 'occupied'
  | 'under-attack'
  | 'abandoned';

export interface GameLocation {
  id: LocationId;
  name: string;
  type: LocationType;
  district: string; // district name for display
  parent: LocationId | null;
  description: string;
  atmosphere: string;
  services: string[];
  factionInfluence: Record<FactionId, number>; // 0..10
  dangerRating: number; // 1..10
  connections: LocationId[];
  state: LocationState;
  // Household support: present only on the MC's home
  household?: Household;
  // Optional link into a dungeon
  dungeonId?: DungeonId;
  // Service economy
  shop?: Shop;
  innRooms?: InnRoom[];
  temple?: boolean; // offers temple services (rules engine prices them)
  trainerFor?: CharClass; // guild/trainer for a class
  /** position on the city minimap, 0..100 in both axes */
  mapPos?: { x: number; y: number };
}

// ---------- Household ----------
export type HomeTier =
  | 'rented-room'
  | 'cheap-apartment'
  | 'small-house'
  | 'fortified-residence'
  | 'large-household'
  | 'estate';

export interface Household {
  tier: HomeTier;
  upgrades: string[]; // e.g. 'training-yard', 'armory', 'library'
  residents: CharacterId[];
  storage: ItemId[]; // items owned by OWNER_HOME
  treasury: number; // copper, separate from personal purses
}

// ---------- Shops, inns, temples ----------
export interface ShopEntry {
  proto: string; // rules-engine prototype key
  qty: number;
  price: number; // copper
}

export interface Shop {
  stock: ShopEntry[];
  buys: boolean; // will this shop buy items from the party?
  buyRate: number; // fraction of value paid when buying from the party
  restockDay: number; // last world day the stock refreshed
}

export interface InnRoom {
  name: string;
  price: number; // copper per night
  quality: number; // 1..4, better rooms cure more
}

// ---------- Items ----------
export type ItemSlot = 'main-hand' | 'off-hand' | 'armor' | 'ring' | 'amulet' | 'none';

export type ItemTier = 'mundane' | 'common' | 'uncommon' | 'rare' | 'exceptional' | 'legendary' | 'artifact';

/** Special owner values besides a character/location id. */
export const OWNER_PARTY = 'PARTY';
export const OWNER_HOME = 'HOME_STORAGE';

export interface Item {
  id: ItemId;
  /** rules-engine prototype key, when the item came from the catalog */
  proto?: string;
  name: string;
  kind: 'weapon' | 'armor' | 'shield' | 'potion' | 'jewelry' | 'tool' | 'treasure' | 'supply' | 'misc';
  slot: ItemSlot;
  tier?: ItemTier; // default mundane
  damage?: string; // dice, e.g. '1d8+2'
  defense?: number;
  healing?: string; // dice for potions
  effectKey?: string; // rules-engine consumable effect ('antidote', ...)
  durability?: { current: number; max: number };
  /** stackable items carry a quantity; unique items omit it */
  stackable?: boolean;
  qty?: number;
  value: number; // in copper, per unit
  owner: CharacterId | LocationId | typeof OWNER_PARTY | typeof OWNER_HOME | null;
  equippedBy?: CharacterId; // set when worn/wielded
  broken?: boolean;
  history: string[]; // notable events in the object's life
}

// ---------- Characters ----------
export type Sex = 'male' | 'female';

export type CharClass = 'fighter' | 'rogue' | 'mage' | 'priest' | 'ranger' | 'commoner';

export type StatusKey =
  | 'poisoned'
  | 'diseased'
  | 'bleeding'
  | 'burning'
  | 'stunned'
  | 'blinded'
  | 'silenced'
  | 'cursed'
  | 'paralyzed'
  | 'unconscious';

export interface ActiveStatus {
  key: StatusKey;
  /** rounds remaining in combat; undefined = until cured */
  roundsLeft?: number;
  magnitude?: number;
  source?: string;
}

export interface TempBonus {
  stat: 'attack' | 'defense' | 'accuracy' | 'evasion';
  amount: number;
  roundsLeft: number;
  source: string;
}

export interface Attributes {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface Skills {
  swordsmanship: number;
  archery: number;
  magic: number;
  stealth: number;
  lockpicking: number;
  tracking: number;
  healing: number;
  streetwise: number;
}

export interface RelationshipValues {
  affection: number; // -10..10
  trust: number;
  respect: number;
  attraction: number;
  commitment: number;
}

export interface NpcMemory {
  subject: CharacterId | string;
  event: string;
  importance: number; // 1..10
  emotionalValue: number; // -10..10
  day: number;
  chapter?: number;
}

export interface KnowledgeFact {
  fact: string; // what this character believes/knows
  aboutEvent?: EventId; // link to the world-truth event, if any
  day: number;
  accurate: boolean; // false = rumor/mistaken belief
}

export interface ScheduleSlot {
  from: number; // minute of day
  to: number;
  location: LocationId;
  activity: string;
}

export interface Character {
  id: CharacterId;
  persistent: boolean; // background NPCs can be promoted
  name: string;
  age: number;
  sex: Sex;
  race: string;
  description: string;
  background: string;
  occupation: string;
  faction: FactionId | null;
  personality: string[];

  charClass: CharClass;
  level: number;
  xp: number;
  hp: { current: number; max: number };
  mana: { current: number; max: number };
  stamina: { current: number; max: number };
  attributes: Attributes;
  skills: Skills;

  attack: number;
  defense: number;
  armor: number;
  initiative: number;
  accuracy: number;
  evasion: number;
  critChance: number; // percent
  resistances: Record<string, number>; // e.g. { poison: 2, fire: 1 }

  /** survival needs, 0 (sated/rested) .. 100 (starving/collapsing) */
  needs: { hunger: number; fatigue: number };
  statuses: ActiveStatus[];
  tempBonuses: TempBonus[];
  permanentBonuses: string[]; // human-readable, e.g. 'Blessing of the Flame: +1 WIS'
  abilities: string[]; // known skill/spell keys from the rules engine

  money: number; // copper (rules engine formats as g/s/c)
  inventory: ItemId[];
  equipment: Partial<Record<ItemSlot, ItemId>>;

  location: LocationId;
  activity: string;
  alive: boolean;
  diedOnDay?: number;
  inParty: boolean;
  isMC: boolean;

  reputation: number; // city-wide, -10..10
  factionReputation: Record<FactionId, number>;
  relationships: Record<CharacterId, RelationshipValues>;
  // Compatibility: what this character values in others (used so
  // relationship values don't rise mechanically from quests alone)
  values: string[]; // e.g. 'courage', 'honesty', 'wealth', 'kindness'

  memories: NpcMemory[];
  knowledge: KnowledgeFact[];
  schedule: ScheduleSlot[];
  objectives: string[];
  combatAI: 'aggressive' | 'defensive' | 'ranged' | 'support' | 'cowardly';
}

// ---------- Factions ----------
export interface Faction {
  id: FactionId;
  name: string;
  kind: 'gang' | 'guild' | 'watch' | 'temple' | 'noble-house' | 'cult' | 'merchants';
  description: string;
  power: number; // 1..10
  hostileTo: FactionId[];
}

// ---------- Monsters (templates + live instances) ----------
export interface MonsterTemplate {
  key: string; // 'giant-rat'
  name: string;
  level: number;
  hp: number;
  attack: number;
  defense: number;
  damage: string;
  initiative: number;
  xp: number;
  lootTable: string; // key into loot tables
  ai: 'aggressive' | 'cowardly' | 'pack';
  /** status a hit may inflict */
  inflicts?: { status: StatusKey; chance: number };
}

export interface CombatantMonster {
  id: MonsterId;
  templateKey: string;
  name: string; // "Giant Rat #2"
  hp: { current: number; max: number };
  status: string[]; // 'stunned' etc.
  alive: boolean;
  fled: boolean;
}

// ---------- Dungeons ----------
export interface DungeonRoom {
  id: RoomId;
  floor: number;
  x: number;
  y: number;
  name: string;
  description: string;
  explored: boolean;
  enemies: 'alive' | 'dead' | 'none' | 'fled';
  encounterKey?: string; // pending encounter table key
  chest?: { opened: boolean; lootSeed: number };
  trap?: { kind: string; disarmed: boolean; triggered: boolean };
  secretDoor?: { discovered: boolean; to: RoomId };
  itemsRemaining: ItemId[];
  isBossRoom?: boolean;
  isStairsDown?: boolean;
  isStairsUp?: boolean;
  connections: Partial<Record<'north' | 'south' | 'east' | 'west' | 'down' | 'up', RoomId>>;
}

export interface Dungeon {
  id: DungeonId;
  name: string;
  entranceLocation: LocationId;
  recommendedLevel: string;
  dungeonType: string;
  floors: number;
  primaryEnemies: string[]; // template keys
  bossKey: string;
  specialFeatures: string[];
  generated: boolean;
  generationSeed: number;
  rooms: Record<RoomId, DungeonRoom>;
  entryRoom: RoomId;
  bossDefeated: boolean;
}

// ---------- Three-layer events ----------
export interface SimEvent {
  id: EventId;
  time: WorldTime;
  chapter?: number;
  scene?: SceneId;
  kind: string; // 'combat.attack', 'travel', 'loot', 'override', ...
  // Layer 1: structured, machine-readable
  data: Record<string, unknown>;
  // Layer 2: author log, human-readable factual summary
  summary: string;
  // Layer 3: optional prose draft
  prose?: string;
  // provenance
  seed?: number;
  authorOverride?: boolean;
  witnesses?: CharacterId[];
  location?: LocationId;
}

// ---------- Combat ----------
export type CombatActionType = 'attack' | 'defend' | 'skill' | 'item' | 'spell' | 'flee';

export interface PlannedAction {
  actor: string; // CharacterId or MonsterId
  type: CombatActionType;
  target?: string;
  skillKey?: string; // 'shield-bash', 'power-strike'
  spellKey?: string; // 'firebolt', 'mend-wounds'
  itemId?: ItemId;
}

export interface CombatLogEntry {
  round: number;
  actor: string;
  actorName: string;
  action: CombatActionType;
  targetName?: string;
  detail: string; // skill/spell/item name
  roll?: number;
  result: 'hit' | 'crit' | 'miss' | 'defend' | 'heal' | 'flee-success' | 'flee-fail' | 'death' | 'status' | 'info';
  damage?: number;
  statusApplied?: string;
  text: string; // layer-2 line
}

export interface CombatState {
  active: boolean;
  round: number;
  seed: number;
  rngState: number;
  monsters: CombatantMonster[];
  partyIds: CharacterId[];
  defending: string[]; // ids defending this round
  stunned: string[];
  log: CombatLogEntry[];
  outcome: 'ongoing' | 'victory' | 'defeat' | 'fled';
  encounterDesc: string;
  locationId: LocationId;
  roomId?: RoomId;
  pendingLoot?: LootResult;
}

export interface LootResult {
  xp: number;
  money: number;
  items: Item[]; // not yet owned; created on TAKE
  seed: number;
  taken: boolean;
}

// ---------- Encounters ----------
export interface PendingEncounter {
  seed: number;
  description: string;
  monsters: { templateKey: string; count: number }[];
  source: 'dungeon' | 'city';
  locationId: LocationId;
  roomId?: RoomId;
}

// ---------- Manuscript ----------
export interface Scene {
  id: SceneId;
  chapter: number;
  title: string;
  pov: CharacterId;
  day: number;
  startMinute: number;
  location: LocationId;
  participants: CharacterId[];
  text: string; // prose; entity refs as @[Name](ID)
  order: number;
  /** character offset up to which prose→sim sync has already run */
  syncedUpTo?: number;
}

export interface ContinuityWarning {
  sceneId: SceneId;
  severity: 'warning' | 'error';
  message: string;
}

// ---------- Saves ----------
export interface Snapshot {
  id: string;
  kind: 'auto' | 'scene' | 'chapter' | 'manual';
  label: string;
  day: number;
  minute: number;
  createdAt: number; // wall clock ms
  world: string; // JSON of WorldState
}

// ---------- The whole world ----------
export type EncounterFrequency = 'low' | 'normal' | 'high' | 'chaotic';
export type DeathRule = 'permadeath' | 'classic' | 'story';
export type EncumbranceRule = 'off' | 'light' | 'full';

export interface WorldState {
  deathRule: DeathRule;
  encumbrance: EncumbranceRule;
  /** survival needs (hunger/fatigue) tracked against story time */
  needsEnabled: boolean;
  /** shared expedition supplies (owner = OWNER_PARTY) */
  partyInventory: ItemId[];
  time: WorldTime;
  chapter: number;
  locations: Record<LocationId, GameLocation>;
  characters: Record<CharacterId, Character>;
  items: Record<ItemId, Item>;
  factions: Record<FactionId, Faction>;
  dungeons: Record<DungeonId, Dungeon>;
  events: SimEvent[];
  scenes: Scene[];
  mcId: CharacterId;
  partyLocation: LocationId;
  currentRoom: RoomId | null; // set when inside a dungeon
  currentDungeon: DungeonId | null;
  combat: CombatState | null;
  pendingEncounter: PendingEncounter | null;
  encounterFrequency: EncounterFrequency;
  counters: Record<string, number>; // id counters
  masterSeed: number;
}
