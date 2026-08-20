// Family: marriages can become pregnancies, pregnancies become people.
// A spouse may conceive (small daily chance); the term runs 270 days
// of the 360-day year with milestone events along the way; the birth
// creates a real character — a child who ages on the birthday system,
// carries both parents in their sheet, and gives the series its next
// generation of stakes. Books have been built on less.

import type { CharClass, Character, WorldState } from './types';
import { Rng } from './rng';
import { logEvent, partyMembers } from './world';
import { relationshipStage } from './romance';
import { findHome } from './household';
import { CLASSES } from './rules';

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

// ---------- growing up ----------
// Children do not stay a birth announcement. Each birthday that
// crosses a milestone writes a scene the saga will want; sixteen
// picks a trade and turns a child into a person with a sheet.

const CHILD_MILESTONES: Record<number, (world: WorldState, c: Character) => string> = {
  1: (_world, c) => `${c.name} said a first word today. It was 'no'. Both parents claim this proves the child takes after the other one.`,
  3: (world, c) => `${c.name} is now everywhere at once. Three separate hiding spots were discovered today, one of them genuinely concerning. ${world.characters[world.mcId].name} was proud before he was worried, and both were correct.`,
  6: (_world, c) => `${c.name} came home with a wooden sword — Master Harrow's off-cut work, 'no charge, mind the grain' — and has held formal opinions about guard stances ever since supper.`,
  8: (_world, c) => `${c.name} asked, at bedtime, in the flat voice children save for the real questions: 'What is under the city?' The answer given was mostly true. The silence afterward was mutual.`,
  12: (_world, c) => `${c.name} shadowed the household's work all season and has started doing parts of it unasked — and correctly, which is worse, because now it cannot be discouraged.`,
};

export const COMING_OF_AGE = 16;

function childClassFor(world: WorldState, c: Character, rng: Rng): CharClass {
  // the trade finds the child: a parent's path, or the city's
  const mother = c.parents?.[0] ? world.characters[c.parents[0]] : null;
  const father = c.parents?.[1] ? world.characters[c.parents[1]] : null;
  const pool: CharClass[] = [];
  if (mother && mother.charClass !== 'commoner') pool.push(mother.charClass);
  if (father && father.charClass !== 'commoner') pool.push(father.charClass);
  pool.push(rng.pick(['fighter', 'rogue', 'bard', 'ranger', 'monk'] as CharClass[]));
  return rng.pick(pool);
}

/** Fired on each child's birthday (ages already advanced upstream). */
function childBirthdays(world: WorldState, rng: Rng) {
  const dayOfYear = world.time.day % 360;
  for (const c of Object.values(world.characters)) {
    if (!c.alive || !c.parents || c.birthDay !== dayOfYear || world.time.day === 0) continue;
    const line = CHILD_MILESTONES[c.age]?.(world, c);
    if (line) {
      logEvent(world, 'family.milestone', { character: c.id, age: c.age }, line, { witnesses: [world.mcId, ...(c.parents.filter((p) => world.characters[p]?.alive) as string[])] });
      for (const pid of c.parents) {
        const parent = world.characters[pid];
        parent?.memories.push({ subject: c.id, event: line, importance: 8, emotionalValue: 7, day: world.time.day });
      }
    }
    if (c.age === COMING_OF_AGE && c.charClass === 'commoner') {
      const cls = childClassFor(world, c, rng);
      c.charClass = cls;
      c.occupation = `${CLASSES[cls].label.toLowerCase()} in training`;
      c.level = 1;
      c.abilities = Object.entries(CLASSES[cls].unlocks).filter(([lvl]) => parseInt(lvl, 10) <= 1).map(([, k]) => k);
      c.attributes.strength += rng.int(0, 2);
      c.attributes.dexterity += rng.int(0, 2);
      c.attributes.constitution += rng.int(0, 2);
      c.hp.max += 6;
      c.hp.current = c.hp.max;
      logEvent(world, 'family.coming-of-age', { character: c.id, charClass: cls }, `${c.name} turned ${COMING_OF_AGE} and chose — or was chosen by — the ${CLASSES[cls].label.toLowerCase()}'s trade. Sixteen years since a birth announcement in this log, and now there is a NAME on a guild ledger. The saga has a next generation.`, { witnesses: partyMembers(world).map((x) => x.id) });
    }
  }
}

export function dailyFamilyTick(world: WorldState): void {
  const day = world.time.day;
  const rng = new Rng((world.masterSeed ^ (day * 179426549)) >>> 0);
  const mc = world.characters[world.mcId];
  childBirthdays(world, rng);
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
