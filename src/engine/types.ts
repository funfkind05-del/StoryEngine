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

export interface Want {
  key: string;
  charId: string;
  label: string;
  day: number; // offered
  kind: 'visit' | 'gift' | 'date' | 'hearth';
  locationId?: string; // visit
  giftKind?: string; // gift: item.kind to give
}

export interface Household {
  tier: HomeTier;
  upgrades: string[]; // e.g. 'training-yard', 'armory', 'library'
  residents: CharacterId[];
  storage: ItemId[]; // items owned by OWNER_HOME
  treasury: number; // copper, separate from personal purses
  lastSparDay?: number; // training-yard use
  lastBrewDay?: number; // alchemy-room use
  lastHarvestDay?: number; // garden
  lastPrayDay?: number; // shrine
  lastFletchDay?: number; // forge annex
  lastFeastDay?: number; // great hall
}

// ---------- Shops, inns, temples ----------
export interface ShopEntry {
  proto: string; // rules-engine prototype key
  qty: number;
  price: number; // copper
  /** kept under the counter until your standing with the street reaches this */
  minRep?: number;
}

export interface Shop {
  stock: ShopEntry[];
  buys: boolean; // will this shop buy items from the party?
  buyRate: number; // fraction of value paid when buying from the party
  restockDay: number; // last world day the stock refreshed
  /** fences take stolen goods; honest shops refuse them */
  fence?: boolean;
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
  ranged?: boolean; // uses DEX and consumes ammo
  ammoProto?: string; // e.g. 'arrow'
  durability?: { current: number; max: number };
  /** taken, not bought — legitimate shops refuse it; fences don't ask */
  stolen?: boolean;
  /** craftsmanship grade rolled at creation */
  quality?: 'fine' | 'superior' | 'exquisite';
  /** magical affix, e.g. "of the Fox" (+2 evasion) */
  affix?: { name: string; stat: 'attack' | 'defense' | 'critChance' | 'evasion' | 'initiative'; amount: number };
  /** second affix — only on hot rolls; the dual-affix rares */
  affix2?: { name: string; stat: 'attack' | 'defense' | 'critChance' | 'evasion' | 'initiative'; amount: number };
  /** crafted-set family: 2+ equipped pieces wake the family bonus */
  setKey?: string;
  /** cursed gear will not come off until a temple lifts it */
  cursed?: boolean;
  /** enchantment present but unread — can't be equipped until identified */
  unidentified?: boolean;
  /** named uniques carry a history worth putting in a book */
  lore?: string;
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

export type CharClass = 'fighter' | 'rogue' | 'mage' | 'priest' | 'ranger' | 'bard' | 'monk' | 'spellblade' | 'warlock' | 'paladin' | 'necromancer' | 'berserker' | 'cultivator' | 'alchemist' | 'tidecaller' | 'oneiromancer' | 'commoner';

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
  /** minutes endured without treatment; afflictions burn out eventually */
  minutesUntreated?: number;
  /** marked for removal after running its course */
  expired?: boolean;
}

export interface Injury {
  name: string; // 'a deep thigh wound'
  stat: 'attack' | 'defense';
  amount: number; // negative
  day: number;
  treated: boolean;
  scar: string; // permanent flavor once treated
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
  /** lasting wounds from going down in combat; penalties until treated */
  injuries: Injury[];
  statuses: ActiveStatus[];
  tempBonuses: TempBonus[];
  /** unspent attribute points from leveling (author assigns) */
  attributePoints?: number;
  /** use-based skill progression counters */
  skillXp?: Partial<Record<keyof Skills, number>>;
  /** last day a gift/date was accepted, per giver — courting has pacing */
  lastGiftDay?: Record<CharacterId, number>;
  lastDateDay?: Record<CharacterId, number>;
  /** earned title, shown in stat blocks */
  title?: string;
  /** ascension path chosen at level 25 (key into ASCENSIONS) */
  ascension?: string;
  /** first evolution (L10) and last (L40) — see progression.ts */
  calling?: string;
  transcendence?: string;
  /** day-of-year (0..359) this character was born; ages tick on it */
  birthDay?: number;
  /** what's left after a failed risky resurrection */
  remains?: 'ashes' | 'beyondRecall';
  /** ever marched with the party — deaths and anniversaries get weight */
  wasParty?: boolean;
  /** a memorial rite has been spoken for this fallen character */
  memorialized?: boolean;
  /** day a pregnancy began; cleared at the birth */
  pregnantSince?: number;
  /** [mother, father] for characters born in play */
  parents?: [CharacterId, CharacterId];
  /** battle line: melee reaches the front rank only (Bard's Tale rows) */
  row?: 'front' | 'back';
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
export type Element = 'fire' | 'frost' | 'shock' | 'venom' | 'holy' | 'void';

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
  /** elements this thing shrugs (×0.5) or dreads (×1.5) */
  resists?: Element[];
  weakTo?: Element[];
  /** bestiary-plate rendering for monsters without a dedicated drawing */
  art?: { archetype: 'beast' | 'humanoid' | 'undead' | 'construct' | 'horror' | 'serpent' | 'dragon' | 'demon' | 'spirit' | 'giant'; accent?: string };
}

export interface CombatantMonster {
  id: MonsterId;
  templateKey: string;
  name: string; // "Giant Rat #2"
  hp: { current: number; max: number };
  status: string[]; // 'stunned' etc.
  /** telegraphing a heavy blow next turn (interrupt with a stun, or defend) */
  charging?: boolean;
  /** named elite data, when this one leads the pack */
  elite?: { name: string; modifierKey: string; rivalId?: string; attackBonus: number; defenseBonus: number; inflicts?: { status: StatusKey; chance: number } };
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
  /** day the room was cleared — the dark refills after a while */
  clearedDay?: number;
  encounterKey?: string; // pending encounter table key
  chest?: { opened: boolean; lootSeed: number };
  trap?: { kind: string; disarmed: boolean; triggered: boolean };
  secretDoor?: { discovered: boolean; to: RoomId };
  lockedDoor?: { dir: 'north' | 'south' | 'east' | 'west'; to: RoomId; difficulty: number; opened: boolean };
  shrine?: { used: boolean };
  lorebook?: { id: string; taken: boolean };
  resource?: { proto: string; gathered: boolean };
  itemsRemaining: ItemId[];
  isBossRoom?: boolean;
  isStairsDown?: boolean;
  isStairsUp?: boolean;
  /** stepping in scrambles the party's facing (classic spinner tile) */
  spinner?: boolean;
  /** unnatural dark: torches die here; the room is always pitch black */
  darkZone?: boolean;
  /** stepping in folds space to another room on the floor */
  teleporter?: { to: RoomId };
  /** a key lies here, opening the locked door in `opensRoom` */
  key?: { taken: boolean; opensRoom: RoomId };
  /** the model already rendered this room's description — it persists */
  describedByLlm?: boolean;
  /** a door that opens to knowledge: the answer is in a lorebook */
  riddleDoor?: { dir: 'north' | 'south' | 'east' | 'west'; to: RoomId; loreId: string; opened: boolean };
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
  /** lock-room ids whose key the party carries */
  keysHeld?: RoomId[];
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
  /** a named elite leads this encounter (possibly a returning rival) */
  elite?: { templateKey: string; name: string; modifierKey: string; rivalId?: string; power?: number };
  source: 'dungeon' | 'city';
  locationId: LocationId;
  roomId?: RoomId;
}

// ---------- Quests ----------
export type QuestObjective =
  | { kind: 'kill'; templateKey: string; count: number; baseline: number }
  | { kind: 'visit'; locationId: LocationId; done: boolean }
  | { kind: 'clear-boss'; dungeonId: DungeonId; done: boolean }
  | { kind: 'deliver'; itemProto: string; locationId: LocationId; done: boolean };

export interface Quest {
  id: string; // QST_*
  title: string;
  giver: CharacterId | 'board';
  giverLocation: LocationId; // where to accept and turn in
  description: string;
  objectives: QuestObjective[];
  reward: {
    money: number;
    itemProtos?: string[];
    factionRep?: Record<FactionId, number>;
    xp?: number;
  };
  status: 'offered' | 'active' | 'ready' | 'completed' | 'declined';
  /** part of the campaign spine (cannot be declined away permanently) */
  isMain?: boolean;
  /** campaign stage number, 1-based */
  stage?: number;
  /** world-truth learned at turn-in; becomes party knowledge */
  revelation?: string;
  /** a decision at turn-in: outcomes differ in coin, standing, and truth */
  choice?: {
    prompt: string;
    options: { key: string; label: string; description: string; money?: number; factionRep?: Record<FactionId, number>; knowledge?: string }[];
    chosen?: string;
  };
  /** guild-rank quest markers */
  guild?: string;
  guildRank?: number;
  /** companion personal-arc markers */
  personal?: CharacterId;
  personalStage?: number;
  offeredDay: number;
  deadlineDay?: number;
  acceptedDay?: number;
  completedDay?: number;
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
  /** which volume this scene belongs to (default 1) */
  book?: number;
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
  /** 'risky' makes temple resurrection a CON gamble (Wizardry rules) */
  resurrectionRule?: 'safe' | 'risky';
  /** minutes of torchlight left underground; 0 = dark */
  torchMinutes?: number;
  /** live Pit Trials run: round advances on victories */
  tournament?: { day: number; round: number; purse: number } | null;
  /** days whose Trials purse was already taken */
  tournamentDaysWon?: number[];
  /** auction lots already hammered, as `${day}:${lot}` */
  auctionsWon?: string[];
  /** festival contests already won, as `${kind}:${day}` */
  contestsWon?: string[];
  /** which volume of the series play is currently feeding */
  bookNumber?: number;
  /** where each book began (and the title it closed under) */
  bookStarts?: { book: number; day: number; title?: string }[];
  /** last known relationship stage per NPC toward the MC — crossings log */
  relStages?: Record<CharacterId, string>;
  /** party coin at last morning, for the day-summary ledger line */
  lastMorningMoney?: number;
  /** deaths awaiting their morning of mourning */
  mourning?: { charId: CharacterId; day: number }[];
  /** companion first-sight reactions already played, `${charId}:${locId}` */
  companionSights?: Record<string, true>;
  /** the recorded spine has been played to its end */
  campaignComplete?: boolean;
  /** last day the party ate from the pauper's ladle */
  poorReliefDay?: number;
  /** the bard's walking song, sustained on stamina */
  activeSong?: 'light' | 'finding' | 'rest' | null;
  /** the party's horse, if they keep one */
  mount?: { name: string; boughtDay: number } | null;
  /** crafting writs fulfilled, as `${day}:${locId}` */
  /** hearth bookkeeping: last day each heart got real attention */
  lastAttentionDay?: Record<string, number>;
  /** one shared evening per person per day: `${day}:${npcId}` -> act */
  hearthDays?: Record<string, string>;
  /** last shared night (weights spouse conception in family.ts) */
  nightTogether?: { npcId: string; day: number };
  /** small daily wishes companions surface (homelife.ts) */
  wants?: Want[];
  writsDone?: string[];
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
  quests: Record<string, Quest>;
  /** lifetime kill tallies per monster template (quest progress etc.) */
  killCounts: Record<string, number>;
  /** a companion wants a word (banner → conversation); banterWith = two-voice scene */
  pendingMoment?: { npcId: CharacterId; hook: string; teaser: string; banterWith?: CharacterId } | null;
  lastMomentDay?: number;
  /** author-supplied art overrides per monster template (data URIs) */
  monsterArt?: Record<string, string>;
  /** author-supplied portrait overrides per character (data URIs) */
  characterArt?: Record<string, string>;
  /** current weather; changes daily with the season */
  weather?: { kind: string; day: number };
  /** index into events[] up to which outline-from-play has run */
  outlinedUpTo?: number;
  /** the Watch's price on the party's head, in copper */
  bounty?: number;
  /** a Watch patrol has cornered the party (banner: pay/resist/run/surrender) */
  pendingArrest?: { seed: number; officers: number } | null;
  /** guild membership ranks by guild key (absent = not a member) */
  guildRanks?: Record<string, number>;
  /** collected lorebook ids */
  codex?: string[];
  /** live timed world events (rituals, street bosses) */
  activeEvents?: { id: string; kind: string; locationId: string; expiresDay: number; description: string; monsters: { templateKey: string; count: number }[]; reward: number }[];
  /** the household's stray, if one was taken in */
  pet?: { name: string; kind: string } | null;
  /** a world event fought but not yet paid out */
  pendingWorldEventReward?: { id: string; reward: number; locationId: string } | null;
  /** earned achievement keys */
  achievements?: string[];
  /** named enemies who escaped and remember (see rivals.ts) */
  rivals?: import('./rivals').Rival[];
  /** the Ash Circle's counter-clock: advances when the spine idles */
  doom?: { stage: number; lastAdvanceDay: number };
  doomEnabled?: boolean;
  /** one-line digests of compacted event-log spans */
  eventArchive?: string[];
  /** total manuscript words per real calendar date (dashboard) */
  writingStats?: Record<string, number>;
  counters: Record<string, number>; // id counters
  masterSeed: number;
}
