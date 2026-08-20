// World-level helpers: ids, clock, event logging, knowledge
// propagation, travel, and the background simulation tick.
// All functions mutate the passed WorldState in place; the UI store
// owns re-render + snapshotting.

import type {
  Character,
  CharacterId,
  GameLocation,
  LocationId,
  SimEvent,
  WorldState,
  WorldTime,
} from './types';
import { Rng } from './rng';
import { CLASSES, advanceNeeds, calendarLabel, needsBlocksHpRegen, needsBlocksStaminaRegen, sleepOff, tickStatusesOverTime, weatherFor, xpForLevel as xpForLevelRule } from './rules';

// ---------- IDs ----------
export function nextId(world: WorldState, prefix: string): string {
  const n = (world.counters[prefix] ?? 0) + 1;
  world.counters[prefix] = n;
  return `${prefix}_${String(n).padStart(4, '0')}`;
}

// ---------- Time ----------
export function fmtTime(t: WorldTime): string {
  const h = Math.floor(t.minute / 60);
  const m = t.minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtWhen(t: WorldTime): string {
  return `Day ${t.day}, ${fmtTime(t)}`;
}

export function addMinutes(world: WorldState, minutes: number) {
  world.time.minute += minutes;
  while (world.time.minute >= 1440) {
    world.time.minute -= 1440;
    world.time.day += 1;
  }
}

// ---------- Events (three-layer system) ----------
export function logEvent(
  world: WorldState,
  kind: string,
  data: Record<string, unknown>,
  summary: string,
  opts: Partial<Pick<SimEvent, 'prose' | 'seed' | 'authorOverride' | 'location' | 'witnesses'>> = {},
): SimEvent {
  const evt: SimEvent = {
    id: nextId(world, 'EVT'),
    time: { ...world.time },
    chapter: world.chapter,
    kind,
    data,
    summary,
    ...opts,
  };
  world.events.push(evt);
  // Witnesses gain accurate knowledge of what they saw.
  if (opts.witnesses) {
    for (const cid of opts.witnesses) {
      const c = world.characters[cid];
      if (c && c.alive) {
        c.knowledge.push({ fact: summary, aboutEvent: evt.id, day: world.time.day, accurate: true });
      }
    }
  }
  return evt;
}

/** Everyone currently at a location (persistent, alive). */
export function charactersAt(world: WorldState, loc: LocationId): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.location === loc);
}

export function partyMembers(world: WorldState): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.inParty);
}

// ---------- Travel ----------
export function travelTo(world: WorldState, dest: LocationId): SimEvent {
  const from = world.locations[world.partyLocation];
  const to = world.locations[dest];
  const minutes = from && from.district === to.district ? 10 : 30;
  addMinutes(world, minutes);
  world.partyLocation = dest;
  world.currentDungeon = null;
  world.currentRoom = null;
  const party = partyMembers(world);
  for (const c of party) {
    c.location = dest;
    c.activity = 'traveling';
  }
  return logEvent(
    world,
    'travel',
    { from: from?.id ?? null, to: dest, minutes },
    `The party traveled from ${from?.name ?? 'nowhere'} to ${to.name}. (${minutes} min)`,
    { location: dest, witnesses: party.map((c) => c.id) },
  );
}

// ---------- NPC schedules & background simulation ----------
function applySchedules(world: WorldState) {
  const m = world.time.minute;
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.inParty || c.schedule.length === 0) continue;
    const slot = c.schedule.find((s) => (s.from <= s.to ? m >= s.from && m < s.to : m >= s.from || m < s.to));
    if (slot) {
      c.location = slot.location;
      c.activity = slot.activity;
    }
  }
}

const BG_EVENTS: {
  kind: string;
  weight: number;
  make: (world: WorldState, rng: Rng) => string | null;
}[] = [
  {
    kind: 'city.crime',
    weight: 3,
    make: (world, rng) => {
      const locs = Object.values(world.locations).filter((l) => l.dangerRating >= 5 && l.type !== 'dungeon-room');
      if (!locs.length) return null;
      const loc = rng.pick(locs);
      const what = rng.pick(['A stabbing', 'A robbery', 'A gang beating', 'A burglary', 'A knife fight']);
      return `${what} occurred near ${loc.name}.`;
    },
  },
  {
    kind: 'city.faction',
    weight: 2,
    make: (world, rng) => {
      const facs = Object.values(world.factions).filter((f) => f.hostileTo.length > 0);
      if (!facs.length) return null;
      const f = rng.pick(facs);
      const enemy = world.factions[rng.pick(f.hostileTo)];
      if (!enemy) return null;
      return `${f.name} clashed with ${enemy.name} over territory.`;
    },
  },
  {
    kind: 'city.rumor',
    weight: 3,
    make: (world, rng) => {
      const dungeons = Object.values(world.dungeons);
      const r = rng.pick([
        'Word spreads of a merchant caravan lost outside the walls.',
        dungeons.length ? `Rumors circulate about treasure in the ${rng.pick(dungeons).name}.` : 'Rumors of treasure circulate in the taverns.',
        'The City Watch raised patrols after last night’s killings.',
        'A noble house is quietly hiring blades.',
        'Something has been taking beggars near the docks at night.',
      ]);
      return r;
    },
  },
  {
    kind: 'city.mundane',
    weight: 2,
    make: (_world, rng) =>
      rng.pick([
        'Rain moved in off the harbor.',
        'A fire broke out in a tannery and was put down by neighbors.',
        'Grain prices rose at the market.',
        'A ship from the south unloaded spices and rats in equal measure.',
      ]),
  },
];

/**
 * Advance world time by `minutes`, moving scheduled NPCs and rolling
 * event-driven background happenings (roughly one check per hour).
 * Only important entities are simulated; the city is event-driven.
 */
export function tick(world: WorldState, minutes: number): SimEvent[] {
  const produced: SimEvent[] = [];
  let remaining = minutes;
  const rng = new Rng((world.masterSeed ^ (world.time.day * 1440 + world.time.minute) ^ minutes) >>> 0);
  while (remaining > 0) {
    const step = Math.min(60, remaining);
    remaining -= step;
    addMinutes(world, step);
    applySchedules(world);
    // daily weather
    if (!world.weather || world.weather.day !== world.time.day) {
      const kind = weatherFor(world.masterSeed, world.time.day);
      const changed = world.weather && world.weather.kind !== kind;
      world.weather = { kind, day: world.time.day };
      if (changed) {
        produced.push(logEvent(world, 'weather', { kind }, `The weather turned: ${kind} over Blackwall (${calendarLabel(world.time.day)}).`));
      }
    }
    // ~18% chance of a notable background event per hour advanced
    if (rng.chance(0.18 * (step / 60))) {
      const totalW = BG_EVENTS.reduce((s, e) => s + e.weight, 0);
      let pickAt = rng.next() * totalW;
      for (const be of BG_EVENTS) {
        pickAt -= be.weight;
        if (pickAt <= 0) {
          const text = be.make(world, rng);
          if (text) produced.push(logEvent(world, be.kind, { background: true }, text, { seed: rng.getState() }));
          break;
        }
      }
    }
    // Party natural recovery while time passes outside combat —
    // unless sickness or unmet needs interfere
    for (const c of partyMembers(world)) {
      if (world.needsEnabled) {
        for (const line of advanceNeeds(c, step)) {
          produced.push(logEvent(world, 'needs', { character: c.id, hunger: Math.round(c.needs.hunger), fatigue: Math.round(c.needs.fatigue) }, line));
        }
      }
      const sick = c.statuses.some((s) => s.key === 'poisoned' || s.key === 'diseased' || s.key === 'bleeding');
      const starving = world.needsEnabled && needsBlocksHpRegen(c);
      if (!sick && !starving && c.hp.current < c.hp.max) c.hp.current = Math.min(c.hp.max, c.hp.current + Math.ceil(step / 60));
      if (starving && c.hp.current > 1) c.hp.current -= Math.ceil(step / 120); // hunger grinds them down
      if (c.hp.current < 1) c.hp.current = 1;
      if (c.mana.current < c.mana.max) c.mana.current = Math.min(c.mana.max, c.mana.current + Math.ceil(step / 30));
      if (!(world.needsEnabled && needsBlocksStaminaRegen(c)) && c.stamina.current < c.stamina.max) {
        c.stamina.current = Math.min(c.stamina.max, c.stamina.current + Math.ceil(step / 20));
      }
      for (const line of tickStatusesOverTime(c, step)) {
        produced.push(logEvent(world, 'status.tick', { character: c.id }, line));
      }
    }
  }
  return produced;
}

export function advanceUntilMorning(world: WorldState): SimEvent[] {
  const nowMin = world.time.minute;
  const target = 7 * 60;
  const minutes = nowMin < target ? target - nowMin : 1440 - nowMin + target;
  const evts = tick(world, minutes);
  // Sleeping restores fully — unless untreated sickness or starvation interferes
  for (const c of partyMembers(world)) {
    sleepOff(c);
    const sick = c.statuses.some((s) => s.key === 'poisoned' || s.key === 'diseased');
    if (!sick && !(world.needsEnabled && needsBlocksHpRegen(c))) c.hp.current = c.hp.max;
    c.mana.current = c.mana.max;
    c.stamina.current = c.stamina.max;
  }
  evts.push(logEvent(world, 'rest', { kind: 'sleep' }, 'The party slept until morning.'));
  return evts;
}

// ---------- Relationships ----------
export function relationshipBetween(world: WorldState, a: CharacterId, b: CharacterId) {
  const c = world.characters[a];
  if (!c.relationships[b]) {
    c.relationships[b] = { affection: 0, trust: 0, respect: 0, attraction: 0, commitment: 0 };
  }
  return c.relationships[b];
}

/**
 * Adjust how `observer` feels about `subject` after witnessing an act.
 * Deltas are filtered through the observer's values: characters react
 * to what they personally care about, not to quest completion.
 */
export function reactToAct(
  world: WorldState,
  observer: CharacterId,
  subject: CharacterId,
  act: { tags: string[]; magnitude: number; description: string },
) {
  const o = world.characters[observer];
  if (!o || !o.alive || observer === subject) return;
  const rel = relationshipBetween(world, observer, subject);
  const resonance = act.tags.filter((t) => o.values.includes(t)).length;
  const scale = resonance > 0 ? act.magnitude * (1 + resonance) : Math.round(act.magnitude * 0.3);
  rel.respect = clamp10(rel.respect + scale);
  rel.trust = clamp10(rel.trust + Math.round(scale * 0.7));
  rel.affection = clamp10(rel.affection + Math.round(scale * 0.5));
  o.memories.push({
    subject,
    event: act.description,
    importance: Math.min(10, Math.abs(scale) + 3),
    emotionalValue: clamp10(scale),
    day: world.time.day,
  });
}

function clamp10(n: number): number {
  return Math.max(-10, Math.min(10, n));
}

// ---------- Character helpers ----------
export { xpForLevel } from './rules';

/**
 * Award XP. Levels are NOT applied automatically: when the threshold
 * is crossed, the character becomes LEVEL AVAILABLE and must visit
 * their class trainer in the city (rules engine handles training).
 */
export function grantXp(world: WorldState, c: Character, xp: number): string[] {
  const notes: string[] = [];
  const before = c.xp >= xpForLevelRule(c.level);
  c.xp += xp;
  if (!before && c.xp >= xpForLevelRule(c.level)) {
    notes.push(`${c.name}: LEVEL AVAILABLE (trainer required: ${CLASSES[c.charClass].trainer}).`);
    logEvent(world, 'level.available', { character: c.id, level: c.level + 1 }, `${c.name} has enough experience for level ${c.level + 1}. Trainer required: ${CLASSES[c.charClass].trainer}.`);
  }
  return notes;
}

/** Move a scene up/down within its chapter's ordering. */
export function reorderScene(world: WorldState, sceneId: string, dir: -1 | 1): boolean {
  const scene = world.scenes.find((s) => s.id === sceneId);
  if (!scene) return false;
  const siblings = world.scenes.filter((s) => s.chapter === scene.chapter).sort((a, b) => a.order - b.order);
  const idx = siblings.indexOf(scene);
  const swap = siblings[idx + dir];
  if (!swap) return false;
  const tmp = scene.order;
  scene.order = swap.order;
  swap.order = tmp;
  return true;
}

export function locPath(world: WorldState, id: LocationId): GameLocation[] {
  const chain: GameLocation[] = [];
  let cur: GameLocation | undefined = world.locations[id];
  let guard = 0;
  while (cur && guard++ < 10) {
    chain.unshift(cur);
    cur = cur.parent ? world.locations[cur.parent] : undefined;
  }
  return chain;
}
