// Home life: the house generates stories without the party lifting a
// finger — the Sims pillar. Residents DO things while the day turns
// (ambient events, flavored by who they are); the women under one
// roof grow bonds and frictions with EACH OTHER, not just with the
// MC; and companions surface small daily WANTS that pay bond when
// someone actually listens. Everything logs prose-ready lines.

import type { Character, Want, WorldState } from './types';
import { logEvent, relationshipBetween } from './world';
import { findHome } from './household';
import { relationshipStage } from './romance';
import { noteAttention } from './hearth';
import { Rng } from './rng';

// ---------- ambient household events ----------

const AMBIENT_GENERIC: ((c: Character, world: WorldState) => string)[] = [
  (c) => `${c.name} rearranged the pantry by a system she declined to explain. Things are now findable, which is suspicious.`,
  (c) => `${c.name} argued the landlord's man back down the stairs over a tax that does not exist. He apologized on the way out.`,
  (c) => `${c.name} fixed the shutter that bangs. It had banged for months. The silence is enormous.`,
  (c) => `${c.name} fed half the street's cats off the back step and denies it entirely. The cats do not deny it.`,
  (c) => `${c.name} fell asleep by the fire mid-sentence, mending in her lap. Nobody moved her. The house held its breath instead.`,
  (c) => `${c.name} found the loose floorboard, and under it, somebody's decade-old hidden copper. She left it there with a button added. For the next finder.`,
];

const AMBIENT_BY_CLASS: Record<string, ((c: Character) => string)[]> = {
  mage: [
    (c) => `${c.name} recalibrated the house wards and blacked out the lamps for half the street doing it. She has written the neighbors a technical apology they cannot read.`,
    (c) => `${c.name} chalked equations up the stairwell wall. They continue onto the ceiling. She says the ceiling was load-bearing to the argument.`,
  ],
  priest: [
    (c) => `${c.name} turned the parlor into a sickroom for a dockhand's fevered boy and returned it to a parlor by supper, changed linens and all. The boy will live.`,
    (c) => `${c.name} blessed the doorframe quietly, on her own, not as doctrine. As aim.`,
  ],
  rogue: [
    (c) => `${c.name} re-hid the household strongbox somewhere better. She has told nobody where, ON PRINCIPLE, and is very pleased.`,
    (c) => `${c.name} came home over the roof again. The neighbors have decided not to see it. The tiles have decided to be replaced.`,
  ],
  bard: [
    (c) => `${c.name} worked one new verse all afternoon, the same eight bars, until the street sweeper below started humming it. She called that a review.`,
    (c) => `${c.name} taught the kettle-song to the child next door, who now performs it hourly. The street blames the house. Fairly.`,
  ],
  monk: [
    (c) => `${c.name} moved through her forms on the roof at dawn. The baker across the way has started timing his loaves by her.`,
    (c) => `${c.name} mended the courtyard gate with patience instead of nails, somehow. It hangs true.`,
  ],
  ranger: [
    (c) => `${c.name} tracked the rat that has evaded the household for a month, cornered it, and released it three streets over with what witnesses describe as professional respect.`,
  ],
  fighter: [
    (c) => `${c.name} drilled in the yard until two street kids started copying her through the fence. She corrected their stances through the fence. Now there are five of them.`,
  ],
};

/** One ambient thread a day, some days: the house does a thing. */
function ambientEvent(world: WorldState, rng: Rng, residents: Character[]) {
  if (!rng.chance(0.4)) return;
  const c = rng.pick(residents);
  const pool = [...AMBIENT_GENERIC, ...(AMBIENT_BY_CLASS[c.charClass] ?? [])];
  const line = rng.pick(pool)(c, world);
  logEvent(world, 'home.life', { character: c.id }, line, { location: findHome(world) ?? undefined, witnesses: [c.id] });
}

// ---------- the web: residents with each other ----------

const ALLIANCE_LINES: ((a: Character, b: Character) => string)[] = [
  (a, b) => `${a.name} and ${b.name} cooked together without negotiating who leads, for the first time. The kitchen survived. Something got settled that wasn't about food.`,
  (a, b) => `${a.name} waited up for ${b.name}, who claimed she didn't need it, and accepted the warmed plate anyway. Neither reported the conversation that followed.`,
  (a, b) => `${a.name} mended the hem of ${b.name}'s traveling cloak without being asked, and said nothing. It was noticed. Everything in this house is noticed.`,
  (a, b) => `${a.name} and ${b.name} closed ranks on a nosy neighbor with such seamless coordination that both were quietly alarmed by it afterward.`,
];

const FRICTION_LINES: ((a: Character, b: Character) => string)[] = [
  (a, b) => `${a.name} and ${b.name} had the argument that is never about what it is about. Doors were not slammed. The not-slamming was very loud.`,
  (a, b) => `${b.name} came back to find her things moved — tidied, technically — and ${a.name} entirely unrepentant. The border has been redrawn and both armies are watching it.`,
  (a, b) => `${a.name} said something small and accurate, and ${b.name} left to walk it off. The house kept score and told no one.`,
];

/** Daily: co-residents drift toward each other — mostly warmer, with
 * flashpoints. Two women who both love the same man under one roof
 * are an alliance and a rivalry on alternating days; both write. */
function residentWeb(world: WorldState, rng: Rng, residents: Character[]) {
  if (residents.length < 2) return;
  const i = rng.int(0, residents.length - 1);
  let j = rng.int(0, residents.length - 2);
  if (j >= i) j += 1;
  const [a, b] = [residents[i], residents[j]];
  const relAB = relationshipBetween(world, a.id, b.id);
  const relBA = relationshipBetween(world, b.id, a.id);
  const bothHis = ['lover', 'partner', 'spouse'].includes(relationshipStage(a.relationships[world.mcId]))
    && ['lover', 'partner', 'spouse'].includes(relationshipStage(b.relationships[world.mcId]));
  // friction runs hotter between rivals, but living together still bonds
  const frictionChance = bothHis ? 0.3 : 0.12;
  if (rng.chance(frictionChance)) {
    relAB.affection = Math.max(-10, relAB.affection - 1);
    relBA.affection = Math.max(-10, relBA.affection - 1);
    relAB.respect = Math.min(10, relAB.respect + (rng.chance(0.5) ? 1 : 0)); // a good fight earns something
    const line = rng.pick(FRICTION_LINES)(a, b);
    logEvent(world, 'home.friction', { a: a.id, b: b.id }, line, { location: findHome(world) ?? undefined, witnesses: [a.id, b.id] });
  } else if (rng.chance(0.5)) {
    relAB.affection = Math.min(10, relAB.affection + 1);
    relBA.affection = Math.min(10, relBA.affection + 1);
    relAB.trust = Math.min(10, relAB.trust + 1);
    relBA.trust = Math.min(10, relBA.trust + 1);
    const line = rng.pick(ALLIANCE_LINES)(a, b);
    logEvent(world, 'home.alliance', { a: a.id, b: b.id }, line, { location: findHome(world) ?? undefined, witnesses: [a.id, b.id] });
  }
}

// ---------- wants ----------

export type { Want } from './types';

export const WANT_LIFETIME_DAYS = 3;

const WANT_MAKERS: ((world: WorldState, c: Character, rng: Rng) => Want | null)[] = [
  (world, c, rng) => {
    const spots = ['LOC_NIGHTMARKET', 'LOC_WHARVES', 'LOC_TEMPLE', 'LOC_IRONMARKET_SQ', 'LOC_LAMPHALL', 'LOC_GRAVEROW'].filter((l) => world.locations[l]);
    if (!spots.length) return null;
    const loc = rng.pick(spots);
    return { key: `visit-${loc}`, charId: c.id, label: `${c.name} wants to walk ${world.locations[loc].name} together — no errand, just the two of you.`, day: world.time.day, kind: 'visit', locationId: loc };
  },
  (world, c, rng) => {
    const kind = rng.pick(['jewelry', 'weapon', 'potion', 'supply']);
    const KIND_LINE: Record<string, string> = {
      jewelry: 'something that glitters, for no practical reason at all',
      weapon: 'good steel — she has opinions about her current edge',
      potion: 'something from the physic’s shelf; she worries more than she says',
      supply: 'something useful; she distrusts glitter and says so',
    };
    return { key: `gift-${kind}`, charId: c.id, label: `${c.name} has been circling the stalls: ${KIND_LINE[kind]}.`, day: world.time.day, kind: 'gift', giftKind: kind };
  },
  (world, c) => ({ key: 'date', charId: c.id, label: `${c.name} wants an hour that belongs to nobody else — a meal, a walk, anything that is not work.`, day: world.time.day, kind: 'date' }),
  (world, c) => (findHome(world) ? { key: 'hearth', charId: c.id, label: `${c.name} wants an evening at home — the fire, the quiet, the door shut on the whole city.`, day: world.time.day, kind: 'hearth' } : null),
];

/** Offer at most one new want a day, to someone entangled or in party. */
function offerWant(world: WorldState, rng: Rng) {
  world.wants ??= [];
  // sweep the expired
  world.wants = world.wants.filter((w) => world.time.day - w.day < WANT_LIFETIME_DAYS);
  if (!rng.chance(0.5)) return;
  const candidates = Object.values(world.characters).filter((c) => {
    if (!c.persistent || !c.alive || c.isMC) return false;
    if (world.wants!.some((w) => w.charId === c.id)) return false;
    const stage = relationshipStage(c.relationships[world.mcId]);
    return c.inParty || ['smitten', 'lover', 'partner', 'spouse'].includes(stage);
  });
  if (!candidates.length) return;
  const c = rng.pick(candidates);
  const want = rng.pick(WANT_MAKERS)(world, c, rng);
  if (!want) return;
  world.wants.push(want);
  logEvent(world, 'want.offered', { character: c.id, want: want.key }, want.label, { witnesses: [c.id] });
}

/** Pay off a fulfilled want: called from the acts that could satisfy one. */
export function fulfillWant(world: WorldState, charId: string, kind: Want['kind'], detail?: string) {
  const want = (world.wants ?? []).find((w) => w.charId === charId && w.kind === kind);
  if (!want) return;
  if (want.kind === 'visit' && want.locationId !== detail) return;
  if (want.kind === 'gift' && want.giftKind && want.giftKind !== detail) return;
  world.wants = world.wants!.filter((w) => w !== want);
  const c = world.characters[charId];
  const rel = relationshipBetween(world, charId, world.mcId);
  rel.affection = Math.min(10, rel.affection + 2);
  rel.trust = Math.min(10, rel.trust + 1);
  noteAttention(world, charId);
  c.memories.push({ subject: world.mcId, event: 'I wanted a small thing and did not ask twice. They heard me the first time.', importance: 5, emotionalValue: 5, day: world.time.day });
  logEvent(world, 'want.fulfilled', { character: charId, want: want.key }, `${c.name} got the small thing she wanted, and the day was better for both of them: ${want.label}`, { witnesses: [world.mcId, charId] });
}

/** Visit-wants check themselves on travel: she's along, and you're there. */
export function checkVisitWants(world: WorldState) {
  for (const w of [...(world.wants ?? [])]) {
    if (w.kind !== 'visit') continue;
    const c = world.characters[w.charId];
    if (c?.inParty && world.partyLocation === w.locationId) fulfillWant(world, w.charId, 'visit', w.locationId);
  }
}

// ---------- the daily turn of the house ----------

export function dailyHomeLife(world: WorldState) {
  const rng = new Rng((world.masterSeed ^ (world.time.day * 611953)) >>> 0);
  const home = findHome(world);
  if (home) {
    const hh = world.locations[home].household!;
    const residents = hh.residents.map((id) => world.characters[id]).filter((c): c is Character => !!c && c.alive && !c.isMC);
    ambientEvent(world, rng, residents.length ? residents : []);
    if (residents.length >= 2) residentWeb(world, rng, residents);
    else if (residents.length === 1 && rng.chance(0.15)) {
      const c = residents[0];
      logEvent(world, 'home.life', { character: c.id }, `${c.name} kept the house alone today and left the lamp burning in the window for whoever comes back first.`, { location: home, witnesses: [c.id] });
    }
  }
  offerWant(world, rng);
}
