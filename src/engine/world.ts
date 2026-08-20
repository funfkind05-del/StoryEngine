// World-level helpers: ids, clock, event logging, knowledge
// propagation, travel, and the background simulation tick.
// All functions mutate the passed WorldState in place; the UI store
// owns re-render + snapshotting.

import type {
  Attributes,
  CharClass,
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
import { expireWorldEvents, maybeSpawnWorldEvent } from './worldEvents';
import { CITY_LORE_AT, loreById } from './codex';
import { festivalToday } from './festivals';
import { dailyFamilyTick } from './family';
import { dailyHearthTick } from './hearth';
import { checkVisitWants, dailyHomeLife } from './homelife';
import { doomTick } from './campaign';

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
  // torchlight burns whenever time passes underground
  if (world.currentDungeon && (world.torchMinutes ?? 0) > 0) {
    const before = world.torchMinutes ?? 0;
    world.torchMinutes = Math.max(0, before - minutes);
    if (world.torchMinutes === 0) {
      logEvent(world, 'dungeon.torch', { minutes: 0 }, 'The last torch guttered out. The dark came back like it had never left.');
    }
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
  let minutes = from && from.district === to.district ? 10 : 30;
  if (world.mount) minutes = Math.max(5, Math.round(minutes * 0.6)); // hooves beat boots
  addMinutes(world, minutes);
  world.partyLocation = dest;
  world.currentDungeon = null;
  world.currentRoom = null;
  const party = partyMembers(world);
  for (const c of party) {
    c.location = dest;
    c.activity = 'traveling';
  }
  // street lore: the first visit to certain places teaches you something
  const loreId = CITY_LORE_AT[dest];
  if (loreId && !(world.codex ?? []).includes(loreId)) {
    world.codex = [...(world.codex ?? []), loreId];
    const entry = loreById(loreId);
    if (entry) {
      logEvent(world, 'codex.found', { id: loreId }, `Standing in ${to.name}, the party pieced together "${entry.title}" — a Codex entry.`, { location: dest, witnesses: party.map((c) => c.id) });
    }
  }
  const evt = logEvent(
    world,
    'travel',
    { from: from?.id ?? null, to: dest, minutes },
    `The party traveled from ${from?.name ?? 'nowhere'} to ${to.name}. (${minutes} min)`,
    { location: dest, witnesses: party.map((c) => c.id) },
  );
  checkVisitWants(world);
  return evt;
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
    // vault interest: 2% on the household treasury, monthly
    const home = Object.values(world.locations).find((l) => l.household);
    if (home?.household?.upgrades.includes('vault') && world.time.day % 30 === 0 && world.time.minute < 60 && home.household.treasury > 0) {
      const interest = Math.floor(home.household.treasury * 0.02);
      if (interest > 0) {
        home.household.treasury += interest;
        produced.push(logEvent(world, 'home.interest', { interest }, `The vault's careful lending returned ${interest} copper to the household treasury.`, { location: home.id }));
      }
    }
    // daily weather + world events + the Circle's clock
    if (!world.weather || world.weather.day !== world.time.day) {
      const fest = festivalToday(world);
      if (fest) {
        produced.push(logEvent(world, 'festival', { name: fest.name }, `${fest.name} — ${fest.desc}`));
      }
      runBirthdays(world);
      dailyFamilyTick(world);
      dailyHearthTick(world);
      dailyHomeLife(world);
      maybeSpawnWorldEvent(world);
      expireWorldEvents(world);
      doomTick(world);
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

/**
 * Sleep until 7:00. A paid bed (inn or owned home) restores fully;
 * sleeping rough is half-rest — fatigue lingers, wounds knit slowly,
 * and in a dangerous district the night has teeth.
 */
/** One line the outline can hang a chapter on: yesterday, digested. */
function summarizeDay(world: WorldState, day: number): SimEvent[] {
  const dayEvents = world.events.filter((e) => e.time.day === day && e.kind !== 'day.summary');
  if (!dayEvents.length) return [];
  const kinds = (k: string) => dayEvents.filter((e) => e.kind === k);
  const combats = kinds('combat.end');
  const wins = combats.filter((e) => (e.data as { outcome?: string }).outcome === 'victory').length;
  const places = new Set(kinds('travel').map((e) => (e.data as { to?: string }).to).filter(Boolean));
  const quests = kinds('quest.completed').length;
  const hearts = kinds('romance.stage').length;
  const deaths = kinds('character.death').length;
  const party = partyMembers(world);
  const purse = party.reduce((n, c) => n + c.money, 0);
  const delta = world.lastMorningMoney === undefined ? 0 : purse - world.lastMorningMoney;
  world.lastMorningMoney = purse;
  const bits: string[] = [];
  if (places.size) bits.push(`${places.size} street${places.size === 1 ? '' : 's'} walked`);
  if (combats.length) bits.push(`${combats.length} fight${combats.length === 1 ? '' : 's'} (${wins} won)`);
  if (quests) bits.push(`${quests} job${quests === 1 ? '' : 's'} settled`);
  if (hearts) bits.push(`${hearts} heart${hearts === 1 ? '' : 's'} moved`);
  if (deaths) bits.push(`${deaths} dead`);
  if (delta) bits.push(`purse ${delta > 0 ? '+' : ''}${delta}c`);
  if (!bits.length) return [];
  return [logEvent(world, 'day.summary', { day, fights: combats.length, wins, quests, hearts, deaths, delta }, `Day ${day}, closed: ${bits.join(' · ')}.`, { witnesses: party.map((c) => c.id) })];
}

/** The morning after a death belongs to the dead. */
function morningMourning(world: WorldState): SimEvent[] {
  const due = (world.mourning ?? []).filter((m) => m.day < world.time.day);
  if (!due.length) return [];
  world.mourning = (world.mourning ?? []).filter((m) => m.day >= world.time.day);
  const out: SimEvent[] = [];
  for (const m of due) {
    const dead = world.characters[m.charId];
    if (!dead || dead.alive) continue; // resurrected before dawn — no wake needed
    const lines: string[] = [];
    for (const c of partyMembers(world)) {
      if (c.isMC) continue;
      if (c.values.includes('faith')) lines.push(`${c.name} kept the old vigil words going until dawn`);
      else if (c.values.includes('order') || c.values.includes('loyalty')) lines.push(`${c.name} cleaned ${dead.name}'s gear twice and said nothing`);
      else if (c.values.includes('cunning')) lines.push(`${c.name} made a joke ${dead.name} would have liked, and then couldn't finish it`);
      else lines.push(`${c.name} sat with it`);
      c.memories.push({ subject: m.charId, event: `The morning after we lost ${dead.name}.`, importance: 8, emotionalValue: -6, day: world.time.day });
    }
    out.push(logEvent(world, 'mourning', { character: m.charId }, `The morning belonged to ${dead.name}. ${lines.length ? lines.join('; ') + '.' : ''} A temple can still speak the memorial rite.`, { witnesses: partyMembers(world).map((c) => c.id) }));
  }
  return out;
}

export function advanceUntilMorning(world: WorldState, quality: 'bed' | 'rough' = 'rough'): SimEvent[] {
  const nowMin = world.time.minute;
  const target = 7 * 60;
  const minutes = nowMin < target ? target - nowMin : 1440 - nowMin + target;
  const dayClosing = world.time.day; // the day being slept away
  const evts = tick(world, minutes);
  for (const c of partyMembers(world)) {
    const sick = c.statuses.some((s) => s.key === 'poisoned' || s.key === 'diseased');
    const starving = world.needsEnabled && needsBlocksHpRegen(c);
    if (quality === 'bed') {
      sleepOff(c);
      // sick or starving bodies still mend — grudgingly, never fully
      if (!sick && !starving) c.hp.current = c.hp.max;
      else c.hp.current = Math.min(c.hp.max, c.hp.current + Math.ceil((c.hp.max - c.hp.current) / 2));
      c.mana.current = c.mana.max;
      c.stamina.current = c.stamina.max;
    } else {
      // rough: fatigue never fully clears, healing is grudging
      c.needs.fatigue = Math.max(30, c.needs.fatigue - 50);
      if (!sick && !starving) c.hp.current = Math.min(c.hp.max, c.hp.current + Math.ceil((c.hp.max - c.hp.current) / 2));
      else c.hp.current = Math.min(c.hp.max, c.hp.current + Math.ceil((c.hp.max - c.hp.current) / 4));
      c.mana.current = c.mana.max;
      c.stamina.current = Math.min(c.stamina.max, c.stamina.current + Math.ceil(c.stamina.max * 0.6));
    }
  }
  // the night digests the day: a chapter-seam summary of what happened
  evts.push(...summarizeDay(world, dayClosing));
  // grief keeps its appointment with the morning
  evts.push(...morningMourning(world));
  if (quality === 'bed') {
    evts.push(logEvent(world, 'rest', { kind: 'sleep' }, 'The party slept until morning in real beds.'));
  } else {
    evts.push(logEvent(world, 'rest', { kind: 'rough' }, 'The party slept rough — doorways and watch-shifts — and rose aching and half-rested.'));
    // the street collects its own rent
    const loc = world.locations[world.partyLocation];
    const rng = new Rng((world.masterSeed ^ (world.time.day * 6007)) >>> 0);
    if (loc && loc.dangerRating >= 5 && rng.chance(0.25)) {
      const mc = world.characters[world.mcId];
      if (rng.chance(0.6) && mc.money > 0) {
        const taken = Math.max(1, Math.floor(mc.money * rng.next() * 0.3));
        mc.money -= taken;
        evts.push(logEvent(world, 'rough.robbed', { taken }, `Someone went through ${mc.name}'s pockets in the night — ${taken} copper gone.`, { location: loc.id, witnesses: [mc.id] }));
      } else {
        world.pendingEncounter = {
          seed: rng.fork(),
          description: '2 Street Thugs',
          monsters: [{ templateKey: 'street-thug', count: 2 }],
          source: 'city',
          locationId: loc.id,
        };
        evts.push(logEvent(world, 'rough.trouble', {}, 'The party woke to unfriendly silhouettes standing over their bedrolls.', { location: loc.id }));
      }
    }
  }
  return evts;
}

// ---------- Character creation ----------
/**
 * Remake the MC at world start: class swap grants that class's early
 * unlocks; bonus attribute points apply with the trainer's side
 * effects (CON→HP, INT→mana).
 */
export function remakeMc(world: WorldState, charClass: CharClass, bonus: Partial<Attributes>): void {
  const mc = world.characters[world.mcId];
  const def = CLASSES[charClass];
  mc.charClass = charClass;
  mc.abilities = Object.entries(def.unlocks)
    .filter(([lvl]) => parseInt(lvl, 10) <= mc.level)
    .map(([, key]) => key);
  if (def.manaPerLevel > 0) {
    mc.mana.max = Math.max(mc.mana.max, 4 + def.manaPerLevel * mc.level);
    mc.mana.current = mc.mana.max;
  }
  for (const attr of Object.keys(bonus) as (keyof Attributes)[]) {
    const n = bonus[attr] ?? 0;
    if (n <= 0) continue;
    mc.attributes[attr] += n;
    if (attr === 'constitution') {
      mc.hp.max += 2 * n;
      mc.hp.current = mc.hp.max;
    }
    if (attr === 'intelligence') {
      mc.mana.max += 2 * n;
      mc.mana.current = mc.mana.max;
    }
  }
  logEvent(world, 'mc.created', { charClass, bonus }, `${mc.name} came to Blackwall a ${def.label.toLowerCase()} — whatever he was before stayed on the road behind him.`);
}

// ---------- Birthdays ----------
/** Stable day-of-year for a character, hashed from the id. */
export function birthDayFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Age everyone whose day it is; party birthdays make the record. */
export function runBirthdays(world: WorldState): void {
  if (world.time.day === 0) return;
  const dayOfYear = world.time.day % 360;
  for (const c of Object.values(world.characters)) {
    if (!c.alive) continue;
    c.birthDay ??= birthDayFor(c.id);
    if (c.birthDay !== dayOfYear) continue;
    c.age += 1;
    if (c.inParty || c.isMC) {
      logEvent(world, 'birthday', { character: c.id, age: c.age }, `${c.name} turns ${c.age} today. ${c.isMC ? 'Another year on the ledger.' : 'The party knows, whether or not anyone admits to planning something.'}`, { witnesses: partyMembers(world).map((x) => x.id) });
    }
  }
  // the dead keep their days too
  for (const c of Object.values(world.characters)) {
    if (c.alive || !c.wasParty || c.diedOnDay === undefined) continue;
    if (world.time.day > c.diedOnDay && c.diedOnDay % 360 === dayOfYear) {
      const years = Math.round((world.time.day - c.diedOnDay) / 360);
      logEvent(world, 'remembrance', { character: c.id, years }, `${years} year${years === 1 ? '' : 's'} since ${c.name} fell. ${c.memorialized ? 'The rite was spoken; the day still knows its weight.' : 'No rite has ever been spoken for them.'}`, { witnesses: partyMembers(world).map((x) => x.id) });
    }
  }
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
