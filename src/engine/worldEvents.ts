// Timed world events, dolmen-style: an Ash Circle ritual flares, a
// street boss surfaces, plague scare closes ranks. Show up before it
// expires, break it, get paid; let it lapse and the district suffers.

import type { WorldState } from './types';
import { Rng } from './rng';
import { logEvent, partyMembers } from './world';
import { fmtMoney } from './rules';

const EVENT_KINDS = [
  {
    kind: 'ash-ritual',
    describe: (loc: string) => `An Ash Circle ritual is burning openly near ${loc} — chanting, ash on the wind, and the crowd too afraid to scatter.`,
    monsters: [{ templateKey: 'cult-acolyte', count: 3 }],
    reward: 400,
    minDay: 3,
  },
  {
    kind: 'street-boss',
    describe: (loc: string) => `Something big has come up from below and made ${loc} its territory. The Watch has cordoned the street and is paying anyone with steel.`,
    monsters: [{ templateKey: 'sewer-serpent', count: 1 }, { templateKey: 'giant-rat', count: 3 }],
    reward: 600,
    minDay: 5,
  },
  {
    kind: 'lamp-blight',
    describe: (loc: string) => `The lamps around ${loc} are dying faster than the Union can relight them, and things made of the dark between them have started collecting what the light dropped.`,
    monsters: [{ templateKey: 'lamp-wisp', count: 3 }],
    reward: 800,
    minDay: 10,
  },
  {
    kind: 'tide-press',
    describe: (loc: string) => `Tidecourt enforcers are "renegotiating" every stall near ${loc} at once. The Coin Guild is quietly paying for someone to renegotiate back.`,
    monsters: [{ templateKey: 'tidecourt-enforcer', count: 2 }],
    reward: 900,
    minDay: 12,
  },
  {
    kind: 'grave-bloom',
    describe: (loc: string) => `Grave-mold bloomed overnight near ${loc} — pale shelves of it up the walls, and shapes underneath that used to be porters. The Bonewardens are offering coin and rites.`,
    monsters: [{ templateKey: 'grave-mold-shambler', count: 2 }],
    reward: 850,
    minDay: 9,
  },
  {
    kind: 'wolf-pack',
    describe: (loc: string) => `A dire wolf pack slipped the walls in the night and dens near ${loc}. Two porters are already dead.`,
    monsters: [{ templateKey: 'dire-wolf', count: 2 }],
    reward: 700,
    minDay: 8,
  },
];

/** Roll for a new world event; called daily from the tick. */
export function maybeSpawnWorldEvent(world: WorldState) {
  world.activeEvents ??= [];
  if (world.activeEvents.length >= 2) return;
  const rng = new Rng((world.masterSeed ^ (world.time.day * 48271)) >>> 0);
  if (!rng.chance(0.15)) return;
  const eligible = EVENT_KINDS.filter((e) => world.time.day >= e.minDay);
  if (!eligible.length) return;
  const kind = rng.pick(eligible);
  const spots = Object.values(world.locations).filter((l) => l.type === 'street' || l.type === 'market' || l.type === 'dock');
  if (!spots.length) return;
  const loc = rng.pick(spots);
  if (world.activeEvents.some((e) => e.locationId === loc.id)) return;
  const ev = {
    id: `WEV_${world.time.day}_${rng.int(100, 999)}`,
    kind: kind.kind,
    locationId: loc.id,
    expiresDay: world.time.day + rng.int(2, 3),
    description: kind.describe(loc.name),
    monsters: kind.monsters.map((m) => ({ ...m })),
    reward: kind.reward,
  };
  world.activeEvents.push(ev);
  logEvent(world, 'worldevent.spawn', { id: ev.id, kind: ev.kind, location: loc.id, expires: ev.expiresDay }, ev.description);
}

/** Expire lapsed events with consequences; called daily from the tick. */
export function expireWorldEvents(world: WorldState) {
  world.activeEvents ??= [];
  for (const ev of [...world.activeEvents]) {
    if (world.time.day <= ev.expiresDay) continue;
    world.activeEvents = world.activeEvents.filter((e) => e.id !== ev.id);
    const loc = world.locations[ev.locationId];
    if (loc && loc.dangerRating < 10) loc.dangerRating += 1; // the street got worse
    logEvent(world, 'worldevent.lapsed', { id: ev.id }, `Nobody answered: the trouble near ${loc?.name ?? 'the streets'} ran its course and the street is the worse for it (danger ${loc?.dangerRating}).`);
  }
}

/** Step into an active event at the current location: fight it. */
export function engageWorldEvent(world: WorldState): string | null {
  const ev = (world.activeEvents ?? []).find((e) => e.locationId === world.partyLocation);
  if (!ev) return 'Nothing is happening here.';
  if (world.pendingEncounter || world.combat) return 'One fight at a time.';
  const rng = new Rng((world.masterSeed ^ ev.expiresDay) >>> 0);
  world.pendingEncounter = {
    seed: rng.fork(),
    description: ev.description,
    monsters: ev.monsters,
    source: 'city',
    locationId: ev.locationId,
  };
  // resolution is paid when the fight is won — mark by removing now and
  // paying via a follow-up check in resolveWorldEventVictory
  world.activeEvents = (world.activeEvents ?? []).filter((e) => e.id !== ev.id);
  world.pendingWorldEventReward = { id: ev.id, reward: ev.reward, locationId: ev.locationId };
  logEvent(world, 'worldevent.engaged', { id: ev.id }, `The party stepped in: ${ev.description}`, { location: ev.locationId, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

/** Called after combat ends at a location with a pending event reward. */
export function resolveWorldEventVictory(world: WorldState, outcome: string) {
  const pend = world.pendingWorldEventReward;
  if (!pend) return;
  world.pendingWorldEventReward = null;
  if (outcome !== 'victory') {
    logEvent(world, 'worldevent.failed', { id: pend.id }, 'The trouble outlasted the party. The street remembers who tried, at least.');
    return;
  }
  const mc = world.characters[world.mcId];
  mc.money += pend.reward;
  for (const c of partyMembers(world)) {
    c.factionReputation['FAC_WATCH'] = Math.min(10, (c.factionReputation['FAC_WATCH'] ?? 0) + 1);
  }
  logEvent(world, 'worldevent.resolved', { id: pend.id, reward: pend.reward }, `The street is quiet again. The cordon purse paid ${fmtMoney(pend.reward)}, and the Watch took names — kindly, this time.`, { location: pend.locationId, witnesses: partyMembers(world).map((c) => c.id) });
}
