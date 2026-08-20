// Procedural background-NPC generation and promotion to persistence.
// A generated NPC's identity is fixed the moment it is created; a
// promoted NPC is never regenerated.

import type { Character, CharacterId, FactionId, LocationId, WorldState } from './types';
import { Rng } from './rng';
import { logEvent, nextId } from './world';

const FIRST_M = ['Kael', 'Doran', 'Brann', 'Tobbe', 'Ulric', 'Fenn', 'Gareth', 'Joss', 'Marek', 'Rilo', 'Sten', 'Vance', 'Corvin', 'Aldous', 'Piter'];
const FIRST_F = ['Mara', 'Lyra', 'Sella', 'Ilsa', 'Brena', 'Katya', 'Odella', 'Rin', 'Tessa', 'Vada', 'Yola', 'Nessa', 'Petra', 'Sable', 'Wren'];
const LAST = ['Venn', 'Ashfall', 'Coldwater', 'Marsh', 'Hobb', 'Iremark', 'Quill', 'Blackrock', 'Tarn', 'Elmsley', 'Groat', 'Harrow', 'Kettle', 'Locke', 'Mott'];
const RACES = ['human', 'human', 'human', 'human', 'half-elf', 'dwarf', 'halfling'];
const TRAITS = ['suspicious', 'humorous', 'opportunistic', 'loyal', 'greedy', 'devout', 'bitter', 'kind', 'reckless', 'cautious', 'vain', 'quiet', 'boastful', 'sharp-tongued', 'superstitious'];
const VALUES = ['courage', 'honesty', 'wealth', 'kindness', 'loyalty', 'strength', 'cunning', 'faith', 'freedom'];

const OCCUPATIONS: { name: string; factionHint?: string }[] = [
  { name: 'beggar' }, { name: 'thief', factionHint: 'gang' }, { name: 'pickpocket', factionHint: 'gang' },
  { name: 'mercenary' }, { name: 'prostitute' }, { name: 'merchant' }, { name: 'craftsman' },
  { name: 'guard', factionHint: 'watch' }, { name: 'adventurer' }, { name: 'priest', factionHint: 'temple' },
  { name: 'healer' }, { name: 'street vendor' }, { name: 'informant' }, { name: 'dock worker' },
  { name: 'fence', factionHint: 'gang' }, { name: 'refugee' }, { name: 'cultist', factionHint: 'cult' },
  { name: 'hedge mage' }, { name: 'rat catcher' }, { name: 'moneylender' },
];

export function generateBackgroundNpc(world: WorldState, at: LocationId, seed: number): Character {
  const rng = new Rng(seed);
  const sex = rng.chance(0.5) ? 'male' : 'female';
  const first = sex === 'male' ? rng.pick(FIRST_M) : rng.pick(FIRST_F);
  const name = `${first} ${rng.pick(LAST)}`;
  const occ = rng.pick(OCCUPATIONS);
  let faction: FactionId | null = null;
  if (occ.factionHint) {
    const match = Object.values(world.factions).find((f) => f.kind === occ.factionHint);
    if (match && rng.chance(0.7)) faction = match.id;
  }
  const level = rng.int(1, 3);
  const traits = [rng.pick(TRAITS), rng.pick(TRAITS)].filter((t, i, a) => a.indexOf(t) === i);
  const attr = () => rng.int(6, 14);
  const con = attr();
  const hpMax = 6 + level * 3 + Math.floor((con - 10) / 2);
  const npc: Character = {
    id: nextId(world, 'NPC'),
    persistent: false,
    name,
    age: rng.int(16, 60),
    sex,
    race: rng.pick(RACES),
    description: `A ${rng.pick(['wiry', 'stocky', 'gaunt', 'weathered', 'scarred', 'plain-faced', 'sharp-eyed'])} ${sex === 'male' ? 'man' : 'woman'} of the streets.`,
    background: `Grew up in Blackwall; makes a living as a ${occ.name}.`,
    occupation: occ.name,
    faction,
    personality: traits,
    charClass: occ.name === 'thief' || occ.name === 'pickpocket' || occ.name === 'fence' ? 'rogue' : occ.name === 'guard' || occ.name === 'mercenary' || occ.name === 'adventurer' ? 'fighter' : occ.name === 'priest' || occ.name === 'healer' ? 'priest' : occ.name === 'hedge mage' ? 'mage' : 'commoner',
    level,
    xp: 0,
    hp: { current: hpMax, max: hpMax },
    mana: { current: 4, max: 4 },
    stamina: { current: 10, max: 10 },
    attributes: { strength: attr(), dexterity: attr(), constitution: con, intelligence: attr(), wisdom: attr(), charisma: attr() },
    skills: { swordsmanship: rng.int(0, 3), archery: rng.int(0, 2), magic: 0, stealth: rng.int(0, 5), lockpicking: rng.int(0, 3), tracking: rng.int(0, 2), healing: rng.int(0, 2), streetwise: rng.int(1, 6) },
    attack: level + 1,
    defense: 9 + rng.int(0, 2),
    armor: 0,
    initiative: rng.int(1, 4),
    accuracy: 0,
    evasion: 0,
    critChance: 5,
    resistances: {},
    statuses: [],
    tempBonuses: [],
    permanentBonuses: [],
    abilities: [],
    money: rng.int(2, 80),
    inventory: [],
    equipment: {},
    location: at,
    activity: 'loitering',
    alive: true,
    inParty: false,
    isMC: false,
    reputation: 0,
    factionReputation: {},
    relationships: {},
    values: [rng.pick(VALUES), rng.pick(VALUES)].filter((v, i, a) => a.indexOf(v) === i),
    memories: [],
    knowledge: [],
    schedule: [],
    objectives: [],
    combatAI: rng.chance(0.4) ? 'cowardly' : 'aggressive',
  };
  world.characters[npc.id] = npc;
  return npc;
}

/**
 * Promote a background NPC to persistent status. Their identity is
 * frozen: they keep their id, and gain a simple daily schedule so the
 * clock moves them around the city.
 */
export function promoteNpc(world: WorldState, id: CharacterId): Character {
  const c = world.characters[id];
  if (c.persistent) return c;
  c.persistent = true;
  const home = c.location;
  c.schedule = [
    { from: 8 * 60, to: 20 * 60, location: home, activity: `working as a ${c.occupation}` },
    { from: 20 * 60, to: 8 * 60, location: home, activity: 'off the streets for the night' },
  ];
  logEvent(world, 'npc.promoted', { character: c.id }, `${c.name} became a persistent character.`);
  return c;
}
