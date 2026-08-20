// Family: marriages can become pregnancies, pregnancies become people.
// A spouse may conceive (small daily chance); the term runs 270 days
// of the 360-day year with milestone events along the way; the birth
// creates a real character — a child who ages on the birthday system,
// carries both parents in their sheet, and gives the series its next
// generation of stakes. Books have been built on less.

import type { Character, WorldState } from './types';
import { Rng } from './rng';
import { logEvent, partyMembers } from './world';
import { relationshipStage } from './romance';
import { findHome } from './household';

export const PREGNANCY_TERM_DAYS = 270;
export const DAILY_CONCEPTION_CHANCE = 0.02;

const CHILD_NAMES_F = ['Aster', 'Briar', 'Ceriwen', 'Delia', 'Enna', 'Fern', 'Isolde', 'Maren', 'Novena', 'Petra', 'Rue', 'Senna', 'Tamsin', 'Wren'];
const CHILD_NAMES_M = ['Aldous', 'Bran', 'Caol', 'Darrow', 'Ewan', 'Fenn', 'Garet', 'Hale', 'Joris', 'Kellan', 'Orin', 'Piers', 'Rook', 'Tam'];

/** Wives (spouse stage) of the MC who could conceive. */
export function eligibleSpouses(world: WorldState): Character[] {
  return Object.values(world.characters).filter((c) => {
    if (!c.persistent || !c.alive || c.isMC || c.sex !== 'female') return false;
    if (c.pregnantSince !== undefined) return false;
    if (c.age >= 45) return false;
    return relationshipStage(c.relationships[world.mcId]) === 'spouse';
  });
}

function makeChild(world: WorldState, mother: Character, rng: Rng): Character {
  const mc = world.characters[world.mcId];
  const sex = rng.chance(0.5) ? 'female' : 'male';
  const name = rng.pick(sex === 'female' ? CHILD_NAMES_F : CHILD_NAMES_M);
  const home = findHome(world);
  const id = `CHAR_CHILD_${world.time.day}_${rng.int(100, 999)}`;
  const child: Character = {
    id,
    persistent: true,
    name,
    age: 0,
    sex,
    race: mother.race,
    description: `${mother.name} and ${mc.name}'s child — ${mother.name}'s eyes, ${mc.name}'s frown, everyone agrees, loudly, at every opportunity.`,
    background: `Born in Blackwall on Day ${world.time.day}.`,
    occupation: 'being extremely small',
    faction: null,
    personality: ['loud', 'beloved'],
    charClass: 'commoner',
    level: 1,
    xp: 0,
    hp: { current: 4, max: 4 },
    mana: { current: 0, max: 0 },
    stamina: { current: 4, max: 4 },
    attributes: { strength: 3, dexterity: 3, constitution: 8, intelligence: 3, wisdom: 3, charisma: 14 },
    skills: { swordsmanship: 0, archery: 0, magic: 0, stealth: 0, lockpicking: 0, tracking: 0, healing: 0, streetwise: 0 },
    attack: 0,
    defense: 8,
    armor: 0,
    initiative: 0,
    accuracy: 0,
    evasion: 0,
    critChance: 0,
    resistances: {},
    needs: { hunger: 20, fatigue: 20 },
    injuries: [],
    statuses: [],
    tempBonuses: [],
    permanentBonuses: [],
    abilities: [],
    money: 0,
    inventory: [],
    equipment: {},
    location: home ?? mother.location,
    activity: 'sleeping, briefly, allegedly',
    alive: true,
    inParty: false,
    isMC: false,
    reputation: 0,
    factionReputation: {},
    combatAI: 'cowardly',
    values: [],
    objectives: [],
    schedule: [],
    relationships: {},
    memories: [],
    knowledge: [],
    birthDay: world.time.day % 360,
    parents: [mother.id, mc.id],
  };
  return child;
}

/** Daily family tick: conception rolls, term milestones, births. */
export function dailyFamilyTick(world: WorldState): void {
  const day = world.time.day;
  const rng = new Rng((world.masterSeed ^ (day * 179426549)) >>> 0);
  const mc = world.characters[world.mcId];
  // conception
  for (const wife of eligibleSpouses(world)) {
    // a night shared at the hearth weights the dice threefold
    const sharedNight = world.nightTogether && world.nightTogether.npcId === wife.id && world.time.day - world.nightTogether.day <= 1;
    if (!rng.chance(DAILY_CONCEPTION_CHANCE * (sharedNight ? 3 : 1))) continue;
    wife.pregnantSince = day;
    logEvent(world, 'pregnancy', { character: wife.id, day }, `${wife.name} is sure now, and told ${mc.name} in her own way: there will be a child. The city outside kept selling fish like the world hadn't just changed size.`, { witnesses: [world.mcId, wife.id] });
  }
  // term milestones + birth
  for (const c of Object.values(world.characters)) {
    if (c.pregnantSince === undefined || !c.alive) continue;
    const along = day - c.pregnantSince;
    if (along === Math.floor(PREGNANCY_TERM_DAYS * 0.55) && c.inParty && (c.row ?? 'front') === 'front') {
      c.row = 'back';
      logEvent(world, 'pregnancy.term', { character: c.id, along }, `${c.name} moved herself to the back rank without discussion, daring anyone to remark on it. Nobody was that brave.`, { witnesses: partyMembers(world).map((x) => x.id) });
    }
    if (along >= PREGNANCY_TERM_DAYS) {
      c.pregnantSince = undefined;
      const child = makeChild(world, c, rng);
      world.characters[child.id] = child;
      c.memories.push({ subject: child.id, event: `The day ${child.name} was born.`, importance: 10, emotionalValue: 10, day });
      mc.memories.push({ subject: child.id, event: `The day ${child.name} was born.`, importance: 10, emotionalValue: 10, day });
      logEvent(world, 'birth', { mother: c.id, child: child.id, name: child.name, sex: child.sex }, `${child.name} was born to ${c.name} and ${mc.name} — small, furious, and instantly the most important person in Blackwall. The chronicle has a new name in it.`, { witnesses: partyMembers(world).map((x) => x.id).concat(c.id) });
    }
  }
}
