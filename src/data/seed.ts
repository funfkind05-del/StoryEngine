// Blackwall City: the seed world. Hand-authored persistent locations,
// factions, NPCs, the MC and his starting situation, and the first
// dungeon. Everything else grows procedurally from play.

import type {
  Character,
  Faction,
  GameLocation,
  Item,
  Scene,
  WorldState,
} from '../engine/types';
import { randomSeed } from '../engine/rng';
import { seedQuests } from '../engine/quests';

// ---------- small builders ----------
function loc(partial: Partial<GameLocation> & Pick<GameLocation, 'id' | 'name' | 'type' | 'district'>): GameLocation {
  return {
    parent: null,
    description: '',
    atmosphere: '',
    services: [],
    factionInfluence: {},
    dangerRating: 3,
    connections: [],
    state: 'open',
    ...partial,
  };
}

function chr(partial: Partial<Character> & Pick<Character, 'id' | 'name' | 'occupation' | 'location'>): Character {
  const hp = partial.hp?.max ?? 10;
  return {
    persistent: true,
    age: 30,
    sex: 'male',
    race: 'human',
    description: '',
    background: '',
    faction: null,
    personality: [],
    charClass: 'commoner',
    level: 1,
    xp: 0,
    mana: { current: 4, max: 4 },
    stamina: { current: 10, max: 10 },
    attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    skills: { swordsmanship: 0, archery: 0, magic: 0, stealth: 0, lockpicking: 0, tracking: 0, healing: 0, streetwise: 2 },
    attack: 2,
    defense: 10,
    armor: 0,
    initiative: 2,
    accuracy: 0,
    evasion: 0,
    critChance: 5,
    resistances: {},
    needs: { hunger: 25, fatigue: 30 },
    injuries: [],
    statuses: [],
    tempBonuses: [],
    permanentBonuses: [],
    abilities: [],
    money: 20,
    inventory: [],
    equipment: {},
    activity: 'about their business',
    alive: true,
    inParty: false,
    isMC: false,
    reputation: 0,
    factionReputation: {},
    relationships: {},
    values: ['loyalty'],
    memories: [],
    knowledge: [],
    schedule: [],
    objectives: [],
    combatAI: 'aggressive',
    ...partial,
    hp: partial.hp ?? { current: hp, max: hp },
  };
}

export function buildSeedWorld(): WorldState {
  const world: WorldState = {
    time: { day: 1, minute: 18 * 60 + 12 },
    chapter: 1,
    locations: {},
    characters: {},
    items: {},
    factions: {},
    dungeons: {},
    events: [],
    scenes: [],
    mcId: 'CHAR_KAEL',
    partyLocation: 'LOC_DOCK_0042',
    currentRoom: null,
    currentDungeon: null,
    combat: null,
    pendingEncounter: null,
    encounterFrequency: 'normal',
    quests: {},
    killCounts: {},
    deathRule: 'story',
    encumbrance: 'light',
    needsEnabled: true,
    partyInventory: [],
    counters: {},
    masterSeed: randomSeed(),
  };

  // ---------- factions ----------
  const factions: Faction[] = [
    { id: 'FAC_REDKNIVES', name: 'The Red Knives', kind: 'gang', description: 'Dockside gang running theft, extortion, and fencing in the Dock Ward.', power: 6, hostileTo: ['FAC_WATCH', 'FAC_ASHCIRCLE'] },
    { id: 'FAC_WATCH', name: 'The City Watch', kind: 'watch', description: 'Underpaid, overextended, and for sale in the wrong districts.', power: 7, hostileTo: ['FAC_REDKNIVES'] },
    { id: 'FAC_VEILEDFLAME', name: 'Temple of the Veiled Flame', kind: 'temple', description: 'The city’s dominant faith; keeps healers and keeps secrets.', power: 5, hostileTo: ['FAC_ASHCIRCLE'] },
    { id: 'FAC_COINGUILD', name: 'The Guild of Coin', kind: 'merchants', description: 'Merchant guild that owns half the docks and rents the other half.', power: 8, hostileTo: [] },
    { id: 'FAC_ASHCIRCLE', name: 'The Ash Circle', kind: 'cult', description: 'A cult that whispers to the things under the Old Quarter.', power: 4, hostileTo: ['FAC_VEILEDFLAME', 'FAC_REDKNIVES'] },
  ];
  for (const f of factions) world.factions[f.id] = f;

  // ---------- locations ----------
  const L: GameLocation[] = [
    loc({ id: 'LOC_CITY', name: 'Blackwall City', type: 'city', district: '—', description: 'A violent port city of stone walls, black harbors, and older things beneath.', dangerRating: 5 }),

    // Districts
    loc({ id: 'LOC_DOCKWARD', name: 'Dock Ward', type: 'district', district: 'Dock Ward', parent: 'LOC_CITY', description: 'Wharves, warehouses, sailors, and knives. Cheap to live in, easy to die in.', dangerRating: 6, factionInfluence: { FAC_REDKNIVES: 8, FAC_WATCH: 3, FAC_COINGUILD: 6 } }),
    loc({ id: 'LOC_OLDQUARTER', name: 'Old Quarter', type: 'district', district: 'Old Quarter', parent: 'LOC_CITY', description: 'The city’s oldest bones: leaning tenements, cemeteries, and sealed doors.', dangerRating: 6, factionInfluence: { FAC_ASHCIRCLE: 5, FAC_VEILEDFLAME: 4, FAC_WATCH: 2 } }),
    loc({ id: 'LOC_IRONMARKET', name: 'Ironmarket', type: 'district', district: 'Ironmarket', parent: 'LOC_CITY', description: 'Smiths, traders, moneylenders, and the constant clangor of commerce.', dangerRating: 4, factionInfluence: { FAC_COINGUILD: 8, FAC_WATCH: 6 } }),
    loc({ id: 'LOC_HIGHCOURT', name: 'Highcourt', type: 'district', district: 'Highcourt', parent: 'LOC_CITY', description: 'Noble houses, temple spires, and private guards who ask questions last.', dangerRating: 2, factionInfluence: { FAC_WATCH: 8, FAC_VEILEDFLAME: 7 } }),

    // Dock Ward
    loc({ id: 'LOC_RATCATCHER', mapPos: { x: 22, y: 74 }, name: 'Ratcatcher Lane', type: 'street', district: 'Dock Ward', parent: 'LOC_DOCKWARD', description: 'A crooked lane of taverns and flophouses one block off the wharves.', atmosphere: 'Loud, lamp-lit, smelling of tar and fried fish.', dangerRating: 6, connections: ['LOC_DOCK_0042', 'LOC_WHARVES', 'LOC_SALTWAREHOUSE', 'LOC_IRONMARKET_SQ', 'LOC_THIEFGUILD', 'LOC_SEWERGATE'], factionInfluence: { FAC_REDKNIVES: 8 } }),
    loc({ id: 'LOC_DOCK_0042', mapPos: { x: 33, y: 66 }, name: 'Broken Crown Tavern', type: 'tavern', district: 'Dock Ward', parent: 'LOC_RATCATCHER', description: 'A low-ceilinged dockside tavern under a cracked sign of a broken crown. Rooms upstairs, trouble downstairs.', atmosphere: 'Dangerous, crowded, smoky, inexpensive.', services: ['food', 'alcohol', 'rooms', 'rumors', 'gambling'], dangerRating: 5, connections: ['LOC_RATCATCHER'], factionInfluence: { FAC_REDKNIVES: 7, FAC_WATCH: 1 }, innRooms: [
      { name: 'Common Room floor', price: 3, quality: 1 },
      { name: 'Private Room', price: 8, quality: 2 },
      { name: 'Good Room', price: 20, quality: 3 },
    ] }),
    loc({ id: 'LOC_WHARVES', mapPos: { x: 10, y: 86 }, name: 'The Black Wharves', type: 'dock', district: 'Dock Ward', parent: 'LOC_DOCKWARD', description: 'Tar-black piers where the ships come in and the bodies go out.', atmosphere: 'Fog, gulls, muscle.', dangerRating: 7, connections: ['LOC_RATCATCHER', 'LOC_SALTWAREHOUSE', 'LOC_CELLARDOOR', 'LOC_SEWERGATE', 'LOC_SUNKENSTAIR'], services: ['passage', 'smuggling'], factionInfluence: { FAC_REDKNIVES: 6, FAC_COINGUILD: 7 } }),
    loc({ id: 'LOC_SALTWAREHOUSE', mapPos: { x: 24, y: 90 }, name: 'Saltmerchant’s Warehouse', type: 'warehouse', district: 'Dock Ward', parent: 'LOC_DOCKWARD', description: 'A Coin Guild warehouse; the Red Knives fence stolen goods out the back.', atmosphere: 'Quiet by day, busy by night.', dangerRating: 6, connections: ['LOC_WHARVES', 'LOC_RATCATCHER'], services: ['fencing'], factionInfluence: { FAC_REDKNIVES: 7, FAC_COINGUILD: 5 }, shop: { buys: true, buyRate: 0.35, restockDay: 1, stock: [
      { proto: 'dagger', qty: 1, price: 70 },
      { proto: 'lockpick', qty: 8, price: 4 },
    ] } }),

    // Ironmarket
    loc({ id: 'LOC_IRONMARKET_SQ', mapPos: { x: 48, y: 46 }, name: 'Ironmarket Square', type: 'market', district: 'Ironmarket', parent: 'LOC_IRONMARKET', description: 'The great market square: stalls, auction blocks, and a gallows nobody uses anymore. Mostly.', atmosphere: 'Crowded from bell to bell.', services: ['trade', 'food', 'rumors'], dangerRating: 4, connections: ['LOC_RATCATCHER', 'LOC_FORGE', 'LOC_GRAVEROW', 'LOC_TEMPLE', 'LOC_FIGHTGUILD', 'LOC_PHYSIC', 'LOC_DRYGOODS', 'LOC_VAULTDOOR'], factionInfluence: { FAC_COINGUILD: 8, FAC_WATCH: 6 } }),
    loc({ id: 'LOC_FORGE', mapPos: { x: 36, y: 38 }, name: 'Harrow’s Forge', type: 'shop', district: 'Ironmarket', parent: 'LOC_IRONMARKET', description: 'Best honest steel in the middle districts. Bring coin, not promises.', atmosphere: 'Heat, sparks, patience.', services: ['weapons', 'armor', 'repair'], dangerRating: 2, connections: ['LOC_IRONMARKET_SQ'], factionInfluence: { FAC_COINGUILD: 6, FAC_WATCH: 4 }, shop: { buys: true, buyRate: 0.5, restockDay: 1, stock: [
      { proto: 'dagger', qty: 3, price: 90 },
      { proto: 'iron-shortsword', qty: 2, price: 220 },
      { proto: 'iron-longsword', qty: 2, price: 380 },
      { proto: 'steel-longsword', qty: 1, price: 840 },
      { proto: 'wooden-buckler', qty: 3, price: 60 },
      { proto: 'hunting-bow', qty: 1, price: 300 },
      { proto: 'longbow', qty: 1, price: 780 },
      { proto: 'arrow', qty: 40, price: 1 },
      { proto: 'leather-armor', qty: 2, price: 180 },
      { proto: 'studded-leather', qty: 1, price: 420 },
      { proto: 'chain-shirt', qty: 1, price: 950 },
    ] } }),

    loc({ id: 'LOC_CELLARDOOR', mapPos: { x: 5, y: 95 }, name: 'Drowned Cellar Door', type: 'dungeon-entrance', district: 'Dock Ward', parent: 'LOC_WHARVES', description: 'A barnacled hatch under the third pier, chained once, the chain long since cut. The tide breathes through it.', atmosphere: 'Salt rot and something moving below.', dangerRating: 7, connections: ['LOC_WHARVES'], dungeonId: 'DUN_DOCKWARD_001' }),

    // Ironmarket services
    loc({ id: 'LOC_FIGHTGUILD', mapPos: { x: 58, y: 36 }, name: 'Fighters Guild', type: 'guildhall', district: 'Ironmarket', parent: 'LOC_IRONMARKET', description: 'A drill yard, a trophy hall, and men who charge money to beat lessons into you.', atmosphere: 'Sweat and drumbeat count.', services: ['fighter training', 'sparring'], dangerRating: 2, connections: ['LOC_IRONMARKET_SQ'], trainerFor: 'fighter' }),
    loc({ id: 'LOC_PHYSIC', mapPos: { x: 40, y: 52 }, name: 'Petra’s Physic', type: 'shop', district: 'Ironmarket', parent: 'LOC_IRONMARKET', description: 'Shelves of stoppered glass; the good shelf is behind the counter.', atmosphere: 'Bitter herbs and beeswax.', services: ['potions', 'remedies'], dangerRating: 1, connections: ['LOC_IRONMARKET_SQ'], factionInfluence: { FAC_COINGUILD: 5, FAC_WATCH: 4 }, shop: { buys: true, buyRate: 0.45, restockDay: 1, stock: [
      { proto: 'minor-healing-potion', qty: 6, price: 30 },
      { proto: 'healing-potion', qty: 3, price: 80 },
      { proto: 'greater-healing-potion', qty: 0, price: 220 },
      { proto: 'mana-draught', qty: 2, price: 90 },
      { proto: 'antidote', qty: 4, price: 60 },
      { proto: 'purification-elixir', qty: 1, price: 150 },
      { proto: 'stoneblood-tonic', qty: 1, price: 120 },
    ] } }),
    loc({ id: 'LOC_DRYGOODS', mapPos: { x: 58, y: 54 }, name: 'The Dry Goods', type: 'shop', district: 'Ironmarket', parent: 'LOC_IRONMARKET', description: 'A general store: rope, tallow, torches, bread that keeps.', atmosphere: 'Cluttered, honest.', services: ['supplies'], dangerRating: 1, connections: ['LOC_IRONMARKET_SQ'], factionInfluence: { FAC_COINGUILD: 5, FAC_WATCH: 4 }, shop: { buys: true, buyRate: 0.4, restockDay: 1, stock: [
      { proto: 'torch', qty: 20, price: 2 },
      { proto: 'arrow', qty: 30, price: 1 },
      { proto: 'rope', qty: 4, price: 10 },
      { proto: 'lockpick', qty: 6, price: 5 },
      { proto: 'bread', qty: 12, price: 1 },
      { proto: 'ration', qty: 10, price: 4 },
    ] } }),

    // Dock Ward services
    loc({ id: 'LOC_THIEFGUILD', mapPos: { x: 10, y: 66 }, name: 'The Counting House', type: 'guildhall', district: 'Dock Ward', parent: 'LOC_DOCKWARD', description: 'Officially a shipping clerk’s office. Unofficially, where the Thieves Guild teaches quiet trades.', atmosphere: 'Ledgers in front, lockpicks in back.', services: ['rogue training', 'fencing'], dangerRating: 5, connections: ['LOC_RATCATCHER'], trainerFor: 'rogue', factionInfluence: { FAC_REDKNIVES: 5 } }),

    // Highcourt / Old Quarter services
    loc({ id: 'LOC_COLLEGE', mapPos: { x: 64, y: 8 }, name: 'Arcane College', type: 'guildhall', district: 'Highcourt', parent: 'LOC_HIGHCOURT', description: 'A tower of blue slate where magic is taught to those who can pay, and watched in those who can’t.', atmosphere: 'Ozone and old paper.', services: ['mage training', 'identification'], dangerRating: 1, connections: ['LOC_TEMPLE', 'LOC_WYRMSPIRE'], trainerFor: 'mage' }),
    loc({ id: 'LOC_LODGE', mapPos: { x: 84, y: 54 }, name: 'Hunter’s Lodge', type: 'guildhall', district: 'Old Quarter', parent: 'LOC_OLDQUARTER', description: 'Smoke-cured beams hung with antlers and worse. Rangers trade routes and lessons here.', atmosphere: 'Woodsmoke and quiet.', services: ['ranger training', 'tracking work'], dangerRating: 3, connections: ['LOC_GRAVEROW'], trainerFor: 'ranger' }),

    loc({ id: 'LOC_ASHDOOR', mapPos: { x: 92, y: 46 }, name: 'The Branded Door', type: 'dungeon-entrance', district: 'Old Quarter', parent: 'LOC_OLDQUARTER', description: 'A tenement cellar door branded with the Ash Circle\u2019s mark, ajar on darkness that smells of burnt offerings.', atmosphere: 'Warm air where it should be cold.', dangerRating: 7, connections: ['LOC_GRAVEROW'], dungeonId: 'DUN_OLDQUARTER_002' }),
    loc({ id: 'LOC_VAULTDOOR', mapPos: { x: 30, y: 30 }, name: 'The Sealed Countinghouse', type: 'dungeon-entrance', district: 'Ironmarket', parent: 'LOC_IRONMARKET', description: 'A bank that shut its doors mid-panic forty years ago. The Coin Guild pays no one to ask why.', atmosphere: 'Dust and the smell of old coin.', dangerRating: 8, connections: ['LOC_IRONMARKET_SQ'], dungeonId: 'DUN_IRONMARKET_001' }),
    loc({ id: 'LOC_SEWERGATE', mapPos: { x: 16, y: 58 }, name: 'The Iron Sewer-Gate', type: 'dungeon-entrance', district: 'Dock Ward', parent: 'LOC_DOCKWARD', description: 'The great rusted grate where the under-river meets the harbor. Things come up it at night.', atmosphere: 'The city\u2019s breath, exhaled.', dangerRating: 8, connections: ['LOC_RATCATCHER', 'LOC_WHARVES'], dungeonId: 'DUN_DOCKWARD_002' }),
    loc({ id: 'LOC_SUNKENSTAIR', mapPos: { x: 4, y: 78 }, name: 'The Sunken Stair', type: 'dungeon-entrance', district: 'Dock Ward', parent: 'LOC_DOCKWARD', description: 'At the lowest tide, a marble stair descends below the harbor \u2014 into a temple older than Blackwall\u2019s gods.', atmosphere: 'Salt, and singing, faintly.', dangerRating: 9, connections: ['LOC_WHARVES'], dungeonId: 'DUN_HARBOR_001' }),
    loc({ id: 'LOC_WYRMSPIRE', mapPos: { x: 78, y: 8 }, name: 'Wyrmspire Gate', type: 'dungeon-entrance', district: 'Highcourt', parent: 'LOC_HIGHCOURT', description: 'The ruined tower the nobles pretend is a folly. The undercroft beneath it is why no one builds nearby.', atmosphere: 'Scorch-marks on the lintel.', dangerRating: 9, connections: ['LOC_COLLEGE'], dungeonId: 'DUN_HIGHCOURT_001' }),
    loc({ id: 'LOC_HOLLOWGATE', mapPos: { x: 94, y: 66 }, name: 'The Hollow Gate', type: 'dungeon-entrance', district: 'Old Quarter', parent: 'LOC_OLDQUARTER', description: 'Behind the oldest mausoleum, a gate of black stone with no hinges. It has opened three times in written history.', atmosphere: 'Your own heartbeat, too loud.', dangerRating: 10, connections: ['LOC_MAUSOLEUM'], dungeonId: 'DUN_DEEP_001' }),

    // Old Quarter
    loc({ id: 'LOC_GRAVEROW', mapPos: { x: 74, y: 40 }, name: 'Cemetery District', type: 'street', district: 'Old Quarter', parent: 'LOC_OLDQUARTER', description: 'Grave rows, mausoleums, and mourners who don’t linger after dark.', atmosphere: 'Still. Too still.', dangerRating: 6, connections: ['LOC_IRONMARKET_SQ', 'LOC_MAUSOLEUM', 'LOC_TEMPLE', 'LOC_LODGE', 'LOC_ASHDOOR'], factionInfluence: { FAC_ASHCIRCLE: 5 } }),
    loc({ id: 'LOC_MAUSOLEUM', mapPos: { x: 88, y: 32 }, name: 'Abandoned Mausoleum', type: 'dungeon-entrance', district: 'Old Quarter', parent: 'LOC_GRAVEROW', description: 'A defaced family tomb. The slab over the lower stair has been pushed aside — recently.', atmosphere: 'Cold air rises from below.', dangerRating: 7, connections: ['LOC_GRAVEROW', 'LOC_HOLLOWGATE'], dungeonId: 'DUN_OLDQUARTER_001' }),

    // Highcourt
    loc({ id: 'LOC_TEMPLE', mapPos: { x: 50, y: 16 }, name: 'Temple of the Veiled Flame', type: 'temple', district: 'Highcourt', parent: 'LOC_HIGHCOURT', description: 'Marble and incense. Healing for the faithful; healing for a fee for everyone else.', atmosphere: 'Hushed, watchful.', services: ['healing', 'blessing', 'sanctuary', 'priest training'], dangerRating: 1, connections: ['LOC_IRONMARKET_SQ', 'LOC_GRAVEROW', 'LOC_COLLEGE'], factionInfluence: { FAC_VEILEDFLAME: 9 }, temple: true, trainerFor: 'priest' }),
  ];
  for (const l of L) world.locations[l.id] = l;

  // ---------- items ----------
  const items: Item[] = [
    { id: 'ITEM_SWORD_0001', name: 'Kael’s Shortsword', kind: 'weapon', slot: 'main-hand', damage: '1d6+1', durability: { current: 60, max: 80 }, value: 120, owner: 'CHAR_KAEL', equippedBy: 'CHAR_KAEL', history: ['Bought secondhand from a caravan guard'] },
    { id: 'ITEM_ARMOR_0001', name: 'Patched Leather Jerkin', kind: 'armor', slot: 'armor', defense: 1, durability: { current: 40, max: 60 }, value: 45, owner: 'CHAR_KAEL', equippedBy: 'CHAR_KAEL', history: [] },
    { id: 'ITEM_POTION_0001', proto: 'minor-healing-potion', name: 'Minor Healing Potion', kind: 'potion', slot: 'none', tier: 'common', healing: '1d11+9', stackable: true, qty: 2, value: 30, owner: 'CHAR_KAEL', history: [] },
    { id: 'ITEM_SUPPLY_0001', proto: 'torch', name: 'Torch', kind: 'supply', slot: 'none', tier: 'mundane', stackable: true, qty: 4, value: 2, owner: 'PARTY', history: [] },
    { id: 'ITEM_SUPPLY_0002', proto: 'rope', name: 'Rope (50 ft)', kind: 'supply', slot: 'none', tier: 'mundane', stackable: true, qty: 1, value: 10, owner: 'PARTY', history: [] },
    { id: 'ITEM_SWORD_0002', name: 'Lyra’s Short Sword', kind: 'weapon', slot: 'main-hand', damage: '1d6', durability: { current: 70, max: 80 }, value: 100, owner: 'CHAR_LYRA', history: [] },
    { id: 'ITEM_BOW_0001', proto: 'hunting-bow', name: 'Lyra’s Hunting Bow', kind: 'weapon', slot: 'main-hand', tier: 'common', damage: '1d6+2', ranged: true, ammoProto: 'arrow', durability: { current: 60, max: 70 }, value: 300, owner: 'CHAR_LYRA', equippedBy: 'CHAR_LYRA', history: ['Carried through three caravan seasons'] },
    { id: 'ITEM_AMMO_0001', proto: 'arrow', name: 'Arrow', kind: 'supply', slot: 'none', tier: 'mundane', stackable: true, qty: 24, value: 1, owner: 'CHAR_LYRA', history: [] },
    { id: 'ITEM_ARMOR_0002', name: 'Traveler’s Leathers', kind: 'armor', slot: 'armor', defense: 1, durability: { current: 55, max: 70 }, value: 60, owner: 'CHAR_LYRA', equippedBy: 'CHAR_LYRA', history: [] },
  ];
  for (const it of items) world.items[it.id] = it;

  // ---------- characters ----------
  const kael = chr({
    id: 'CHAR_KAEL', name: 'Kael', occupation: 'sellsword (new in town)', location: 'LOC_DOCK_0042',
    age: 23, sex: 'male', isMC: true, inParty: true, charClass: 'fighter', abilities: ['shield-bash'],
    description: 'Lean, watchful, a scar through one eyebrow. New boots, old sword.',
    background: 'Came to Blackwall with a dead man’s letter of introduction and eleven silver. Nine left. He rents a cot at the Broken Crown by the night; nothing in this city is his yet.',
    personality: ['stubborn', 'dry-humored', 'careful with promises'],
    hp: { current: 16, max: 16 }, mana: { current: 6, max: 6 }, stamina: { current: 12, max: 12 },
    attributes: { strength: 13, dexterity: 12, constitution: 12, intelligence: 11, wisdom: 10, charisma: 11 },
    skills: { swordsmanship: 3, archery: 1, magic: 0, stealth: 2, lockpicking: 1, tracking: 2, healing: 1, streetwise: 2 },
    attack: 3, defense: 10, armor: 0, initiative: 3, critChance: 6,
    money: 90, inventory: ['ITEM_SWORD_0001', 'ITEM_ARMOR_0001', 'ITEM_POTION_0001'],
    equipment: { 'main-hand': 'ITEM_SWORD_0001', armor: 'ITEM_ARMOR_0001' },
    values: ['courage', 'loyalty', 'honesty'],
    objectives: ['Find paying work', 'Save for a place of his own', 'Learn who runs Ratcatcher Lane', 'Look into the opened mausoleum'],
    activity: 'nursing an ale in the Broken Crown',
  });

  const lyra = chr({
    id: 'CHAR_LYRA', name: 'Lyra', occupation: 'adventurer', location: 'LOC_DOCK_0042',
    age: 25, sex: 'female', inParty: true, charClass: 'ranger', abilities: ['aimed-shot'],
    description: 'Compact, quick, hair cropped short. Counts exits when she enters a room.',
    background: 'Ex-caravan guard from the eastern roads. Between contracts, low on coin, unwilling to work for the Knives.',
    personality: ['practical', 'blunt', 'loyal once earned'],
    hp: { current: 14, max: 14 }, mana: { current: 4, max: 4 }, stamina: { current: 12, max: 12 },
    attributes: { strength: 11, dexterity: 14, constitution: 11, intelligence: 12, wisdom: 12, charisma: 10 },
    skills: { swordsmanship: 2, archery: 3, magic: 0, stealth: 3, lockpicking: 2, tracking: 3, healing: 2, streetwise: 3 },
    attack: 3, defense: 11, armor: 0, initiative: 4, critChance: 8,
    money: 45, inventory: ['ITEM_SWORD_0002', 'ITEM_BOW_0001', 'ITEM_AMMO_0001', 'ITEM_ARMOR_0002'],
    equipment: { 'main-hand': 'ITEM_BOW_0001', armor: 'ITEM_ARMOR_0002' },
    values: ['honesty', 'courage', 'freedom'],
    objectives: ['Earn enough to re-shoe and re-arm', 'Figure out whether Kael is worth partnering with'],
    combatAI: 'aggressive',
    relationships: { CHAR_KAEL: { affection: 1, trust: 2, respect: 2, attraction: 1, commitment: 0 } },
    activity: 'splitting a bench with Kael, watching the door',
  });

  const mara = chr({
    id: 'CHAR_MARA', name: 'Mara Venn', occupation: 'thief', location: 'LOC_DOCK_0042',
    age: 27, sex: 'female', faction: 'FAC_REDKNIVES', charClass: 'rogue', abilities: ['backstab'],
    description: 'Human woman, quick-fingered, quicker-tongued. Red kerchief knotted at the wrist — Knives colors, worn loose.',
    background: 'Dock Ward born. Runs small jobs for the Red Knives and keeps her own ledger of favors.',
    personality: ['suspicious', 'humorous', 'opportunistic'],
    hp: { current: 12, max: 12 },
    attributes: { strength: 9, dexterity: 15, constitution: 10, intelligence: 13, wisdom: 11, charisma: 13 },
    skills: { swordsmanship: 1, archery: 0, magic: 0, stealth: 6, lockpicking: 6, tracking: 2, healing: 1, streetwise: 7 },
    attack: 2, defense: 11, initiative: 5, critChance: 10,
    money: 130, values: ['cunning', 'freedom', 'wealth'], combatAI: 'cowardly',
    objectives: ['Skim more than the Knives notice', 'Find leverage on someone useful'],
    schedule: [
      { from: 11 * 60, to: 17 * 60, location: 'LOC_IRONMARKET_SQ', activity: 'working the market crowds' },
      { from: 17 * 60, to: 26 * 60 % 1440, location: 'LOC_DOCK_0042', activity: 'holding court at the Broken Crown' },
      { from: 2 * 60, to: 11 * 60, location: 'LOC_RATCATCHER', activity: 'sleeping somewhere she won’t say' },
    ],
    activity: 'holding court at the Broken Crown',
  });

  const tobbe = chr({
    id: 'CHAR_TOBBE', name: 'Tobbe Groat', occupation: 'tavern keeper', location: 'LOC_DOCK_0042',
    age: 51, description: 'Bald, broad, forearms like hawsers. Owns the Broken Crown and its silences.',
    background: 'Former ship’s cook. Pays the Knives their cut and keeps a loaded crossbow under the bar.',
    personality: ['gruff', 'fair', 'unshockable'],
    hp: { current: 18, max: 18 }, attributes: { strength: 14, dexterity: 9, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 },
    values: ['fairness', 'loyalty'], money: 400,
    schedule: [
      { from: 9 * 60, to: 60, location: 'LOC_DOCK_0042', activity: 'running the taproom' },
      { from: 60, to: 9 * 60, location: 'LOC_DOCK_0042', activity: 'asleep in the back room' },
    ],
    activity: 'running the taproom',
  });

  const harrow = chr({
    id: 'CHAR_HARROW', name: 'Master Harrow', occupation: 'blacksmith', location: 'LOC_FORGE',
    age: 58, race: 'dwarf', description: 'Soot-grey beard, burn-scarred hands, no patience for hagglers.',
    background: 'Forged for three noble houses before he got sick of them. Now he forges for whoever pays.',
    personality: ['taciturn', 'proud', 'honest'],
    hp: { current: 20, max: 20 }, attributes: { strength: 16, dexterity: 10, constitution: 15, intelligence: 12, wisdom: 11, charisma: 8 },
    values: ['honesty', 'strength'], money: 900,
    schedule: [
      { from: 7 * 60, to: 19 * 60, location: 'LOC_FORGE', activity: 'at the anvil' },
      { from: 19 * 60, to: 7 * 60, location: 'LOC_FORGE', activity: 'asleep above the forge' },
    ],
    activity: 'at the anvil',
  });

  const sella = chr({
    id: 'CHAR_SELLA', name: 'Sister Sella', occupation: 'healer priest', location: 'LOC_TEMPLE',
    age: 34, sex: 'female', faction: 'FAC_VEILEDFLAME', charClass: 'priest', abilities: ['mend-wounds', 'purify'],
    description: 'Grey habit, steady hands, eyes that have seen every kind of wound this city makes.',
    background: 'Runs the temple infirmary. Charges the rich, waives the poor, files everything away.',
    personality: ['calm', 'observant', 'quietly stubborn'],
    hp: { current: 12, max: 12 }, mana: { current: 14, max: 14 },
    attributes: { strength: 8, dexterity: 10, constitution: 10, intelligence: 13, wisdom: 15, charisma: 12 },
    skills: { swordsmanship: 0, archery: 0, magic: 4, stealth: 0, lockpicking: 0, tracking: 0, healing: 7, streetwise: 2 },
    values: ['kindness', 'faith', 'honesty'], combatAI: 'support',
    schedule: [
      { from: 6 * 60, to: 22 * 60, location: 'LOC_TEMPLE', activity: 'tending the infirmary' },
      { from: 22 * 60, to: 6 * 60, location: 'LOC_TEMPLE', activity: 'at rest in the cloister' },
    ],
    activity: 'tending the infirmary',
  });

  const dorn = chr({
    id: 'CHAR_DORN', name: 'Captain Dorn', occupation: 'watch captain', location: 'LOC_IRONMARKET_SQ',
    age: 44, faction: 'FAC_WATCH', charClass: 'fighter', level: 4, abilities: ['shield-bash', 'power-strike'],
    description: 'Iron-grey stubble, a watchman’s slouch, and a ledger of debts nobody’s seen.',
    background: 'Runs the Ironmarket watch-house. Rumored to take Red Knives coin; rumored to be done taking it.',
    personality: ['weary', 'calculating', 'not entirely for sale'],
    hp: { current: 22, max: 22 }, attributes: { strength: 13, dexterity: 11, constitution: 13, intelligence: 12, wisdom: 13, charisma: 11 },
    attack: 5, defense: 12, armor: 1, values: ['order', 'loyalty'], money: 250,
    schedule: [
      { from: 8 * 60, to: 20 * 60, location: 'LOC_IRONMARKET_SQ', activity: 'patrolling Ironmarket' },
      { from: 20 * 60, to: 8 * 60, location: 'LOC_IRONMARKET', activity: 'at the watch-house' },
    ],
    activity: 'patrolling Ironmarket',
  });

  const varga = chr({
    id: 'CHAR_VARGA', name: 'Varga', occupation: 'criminal boss', location: 'LOC_SALTWAREHOUSE',
    age: 39, sex: 'female', faction: 'FAC_REDKNIVES', charClass: 'rogue', level: 6, abilities: ['backstab', 'dirty-fighting'],
    description: 'Runs the Red Knives from a chair that used to belong to someone else. Smiles a great deal.',
    background: 'Clawed up from wharf-rat to boss in fifteen years. Collects debts, secrets, and knives.',
    personality: ['charming', 'ruthless', 'patient'],
    hp: { current: 24, max: 24 }, attributes: { strength: 11, dexterity: 14, constitution: 12, intelligence: 14, wisdom: 12, charisma: 15 },
    attack: 5, defense: 12, critChance: 12, values: ['cunning', 'wealth', 'strength'], money: 3200,
    schedule: [
      { from: 14 * 60, to: 2 * 60, location: 'LOC_SALTWAREHOUSE', activity: 'holding court behind the warehouse' },
      { from: 2 * 60, to: 14 * 60, location: 'LOC_WHARVES', activity: 'unseen' },
    ],
    activity: 'holding court behind the warehouse',
  });

  for (const c of [kael, lyra, mara, tobbe, harrow, sella, dorn, varga]) world.characters[c.id] = c;

  // ---------- knowledge seeds (world truth vs. what people know) ----------
  kael.knowledge.push(
    { fact: 'The Broken Crown rents rooms cheap and asks nothing.', day: 1, accurate: true },
    { fact: 'Someone opened the mausoleum in the Cemetery District recently.', day: 1, accurate: true },
  );
  lyra.knowledge.push({ fact: 'The Red Knives run Ratcatcher Lane; the Watch doesn’t come at night.', day: 1, accurate: true });
  mara.knowledge.push({ fact: 'Varga has been moving crates into the Saltmerchant’s Warehouse that don’t appear in any ledger.', day: 1, accurate: true });

  // ---------- the first dungeon ----------
  world.dungeons['DUN_OLDQUARTER_001'] = {
    id: 'DUN_OLDQUARTER_001',
    name: 'Crypts of Saint Varro',
    entranceLocation: 'LOC_MAUSOLEUM',
    recommendedLevel: '1–4',
    dungeonType: 'underground crypt',
    floors: 3,
    primaryEnemies: ['giant-rat', 'grave-robber', 'skeleton', 'carrion-beetle'],
    bossKey: 'crypt-warden',
    specialFeatures: ['locked tombs', 'hidden passages', 'ancient shrine', 'flooded chambers'],
    generated: false,
    generationSeed: randomSeed(),
    rooms: {},
    entryRoom: '',
    bossDefeated: false,
  };

  world.dungeons['DUN_DOCKWARD_001'] = {
    id: 'DUN_DOCKWARD_001',
    name: 'The Drowning Cellars',
    entranceLocation: 'LOC_CELLARDOOR',
    recommendedLevel: '2–5',
    dungeonType: 'flooded smuggler tunnels',
    floors: 2,
    primaryEnemies: ['giant-rat', 'sewer-serpent', 'smuggler', 'street-thug'],
    bossKey: 'rat-king',
    specialFeatures: ['flooded chambers', 'smuggler caches', 'tide-locked doors'],
    generated: false,
    generationSeed: randomSeed(),
    rooms: {},
    entryRoom: '',
    bossDefeated: false,
  };

  const D = (id: string, name: string, entrance: string, rec: string, kind: string, floors: number, enemies: string[], boss: string, features: string[]) => {
    world.dungeons[id] = {
      id, name, entranceLocation: entrance, recommendedLevel: rec, dungeonType: kind,
      floors, primaryEnemies: enemies, bossKey: boss, specialFeatures: features,
      generated: false, generationSeed: randomSeed(), rooms: {}, entryRoom: '', bossDefeated: false,
    };
  };
  D('DUN_OLDQUARTER_002', 'The Ash Warrens', 'LOC_ASHDOOR', '5–9', 'cult tunnels', 3,
    ['cult-acolyte', 'bog-hag', 'gutter-mage', 'dire-wolf'], 'ashen-hierophant',
    ['ritual chambers', 'ash-choked shrines', 'branded doors']);
  D('DUN_IRONMARKET_001', 'The Undervaults', 'LOC_VAULTDOOR', '8–13', 'sealed bank vaults', 3,
    ['animated-armor', 'flesh-golem', 'gargoyle', 'gutter-mage'], 'gilded-golem',
    ['coin-counting machines', 'vault doors', 'gilded traps']);
  D('DUN_DOCKWARD_002', 'The Sewers Deep', 'LOC_SEWERGATE', '10–16', 'drowned sewer labyrinth', 4,
    ['sewer-serpent', 'wight', 'giant-spider', 'plague-priest'], 'sewer-tyrant',
    ['flooded galleries', 'plague nests', 'the under-river']);
  D('DUN_HARBOR_001', 'The Sunken Temple', 'LOC_SUNKENSTAIR', '14–20', 'drowned temple', 4,
    ['deep-one', 'wraith', 'bone-knight', 'storm-witch'], 'drowned-priest',
    ['tide-locked doors', 'barnacled idols', 'salt-white bones']);
  D('DUN_HIGHCOURT_001', 'Wyrmspire Undercroft', 'LOC_WYRMSPIRE', '20–27', 'dragon-haunted undercroft', 5,
    ['vampire-thrall', 'stone-golem', 'chimera', 'harbor-drake'], 'young-dragon',
    ['scorched galleries', 'a hoard-smell on the air', 'melted stone']);
  D('DUN_DEEP_001', 'The Hollow Crown', 'LOC_HOLLOWGATE', '30–45', 'the palace under everything', 6,
    ['lich-acolyte', 'shadow-reaper', 'iron-colossus', 'elder-vampire', 'pit-fiend', 'void-spawn'], 'the-hollow-king',
    ['a throne older than the city', 'silence with weight', 'doors that remember names']);

  seedQuests(world);

  // ---------- opening scene ----------
  const opening: Scene = {
    id: 'SCN_0001',
    chapter: 1,
    title: 'The Broken Crown',
    pov: 'CHAR_KAEL',
    day: 1,
    startMinute: 18 * 60,
    location: 'LOC_DOCK_0042',
    participants: ['CHAR_KAEL', 'CHAR_LYRA', 'CHAR_TOBBE'],
    order: 1,
    text: `Kael had been in Blackwall three days, and the city had already taken two of his silver and one of his illusions.

The @[Broken Crown Tavern](LOC_DOCK_0042) filled up at dusk the way a wound fills — slowly, then all at once. He kept his back to the wall and his sword under his knee, and watched @[Tobbe Groat](CHAR_TOBBE) pull ale for sailors who paid in coin shaved so thin it whistled.

"You're doing the thing again," @[Lyra](CHAR_LYRA) said, not looking up from her boots. "Counting the room."

"Somebody should."

`,
  };
  world.scenes.push(opening);

  // counters: reserve prefixes already used by hand-authored ids
  world.partyInventory = ['ITEM_SUPPLY_0001', 'ITEM_SUPPLY_0002'];
  world.counters['ITEM'] = 100;
  world.counters['EVT'] = 0;
  world.counters['SCN'] = 1;

  return world;
}
