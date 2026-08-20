// Encounter generation for dungeons and city streets. Encounters are
// generated with a stored seed, so the author can REPLAY the exact
// encounter or RESIMULATE with a fresh seed.

import type { PendingEncounter, SimEvent, WorldState } from './types';
import { MONSTERS } from './monsters';
import { Rng, randomSeed } from './rng';
import { generateBackgroundNpc } from './npc';
import { logEvent, partyMembers } from './world';
import { maybeElevateElite } from './rivals';

/** Build a dungeon encounter for the current room. */
export function generateDungeonEncounter(world: WorldState, seed?: number): PendingEncounter | { error: string } {
  if (!world.currentDungeon || !world.currentRoom) return { error: 'Not inside a dungeon.' };
  const d = world.dungeons[world.currentDungeon];
  const room = d.rooms[world.currentRoom];
  if (room.enemies !== 'alive' || !room.encounterKey) return { error: 'Nothing here wants a fight.' };

  const s = seed ?? randomSeed();
  const rng = new Rng(s);
  const party = partyMembers(world);
  const partyLevel = Math.max(1, Math.round(party.reduce((sum, c) => sum + c.level, 0) / Math.max(1, party.length)));

  const monsters: { templateKey: string; count: number }[] = [];
  if (room.isBossRoom && !d.bossDefeated) {
    monsters.push({ templateKey: d.bossKey, count: 1 });
    // boss brings minions scaled to party size
    const minion = rng.pick(d.primaryEnemies);
    monsters.push({ templateKey: minion, count: rng.int(1, Math.max(1, party.length - 1) + 1) });
  } else {
    const primary = room.encounterKey;
    // hard cap by party strength: a level-1 duo meets 3 bodies, not 8
    const cap = Math.max(2, Math.round(partyLevel * party.length * 1.25));
    const budget = Math.max(2, Math.min(cap, partyLevel + party.length + Math.floor(room.floor / 2) + rng.int(-1, 1)));
    let spent = 0;
    let guard = 0;
    while (spent < budget && guard++ < 12) {
      const key = rng.chance(0.65) ? primary : rng.pick(d.primaryEnemies);
      const t = MONSTERS[key];
      if (!t) break;
      const existing = monsters.find((m) => m.templateKey === key);
      if (existing) existing.count += 1;
      else monsters.push({ templateKey: key, count: 1 });
      spent += t.level;
    }
  }

  const desc = monsters
    .map((m) => `${m.count} ${MONSTERS[m.templateKey].name}${m.count > 1 ? 's' : ''}`)
    .join(', ');

  const enc: PendingEncounter = {
    seed: s,
    description: desc,
    monsters,
    source: 'dungeon',
    locationId: d.entranceLocation,
    roomId: room.id,
  };
  if (!room.isBossRoom) maybeElevateElite(world, enc, rng);
  world.pendingEncounter = enc;
  logEvent(world, 'encounter.generated', { seed: s, monsters, room: room.id }, `Encounter in ${room.name}: ${desc}. (seed ${s})`, { seed: s });
  return enc;
}

const CITY_HOSTILES: Record<string, { key: string; countMax: number; minDanger: number }[]> = {
  default: [
    { key: 'street-thug', countMax: 3, minDanger: 4 },
    { key: 'red-knife-cutter', countMax: 2, minDanger: 6 },
  ],
};

const FREQ_CHANCE: Record<string, number> = { low: 0.1, normal: 0.25, high: 0.45, chaotic: 0.7 };

/**
 * Roll a city encounter after travel. May produce a hostile pending
 * encounter, a social encounter (an NPC worth meeting), or nothing.
 */
export function rollCityEncounter(world: WorldState): SimEvent | null {
  const loc = world.locations[world.partyLocation];
  if (!loc || world.currentDungeon) return null;
  const mc = world.characters[world.mcId];
  // a gang you've bled comes looking for you on its own turf
  const knivesRep = mc.factionReputation['FAC_REDKNIVES'] ?? 0;
  const knivesTurf = (loc.factionInfluence['FAC_REDKNIVES'] ?? 0) >= 5;
  const vendetta = knivesTurf && knivesRep <= -3;
  // a watchtower at home makes the home district a harder place to ambush
  const home = Object.values(world.locations).find((l) => l.household);
  const watched = home?.household?.upgrades.includes('watchtower') && world.locations[home.id]?.district === loc.district;
  const chance = FREQ_CHANCE[world.encounterFrequency] * (loc.dangerRating / 6) * (vendetta ? 1.6 : 1) * (watched ? 0.6 : 1);
  const seed = randomSeed();
  const rng = new Rng(seed);
  if (!rng.chance(Math.min(0.85, chance))) return null;

  if (vendetta && rng.chance(0.5)) {
    const count = rng.int(2, Math.min(4, 2 + Math.floor(-knivesRep / 3)));
    const desc = `${count} Red Knife Cutters`;
    world.pendingEncounter = {
      seed,
      description: desc,
      monsters: [{ templateKey: 'red-knife-cutter', count }],
      source: 'city',
      locationId: loc.id,
    };
    return logEvent(world, 'encounter.vendetta', { seed, faction: 'FAC_REDKNIVES', desc }, `The Red Knives came looking for the party near ${loc.name}: ${desc}, and they know your face. (seed ${seed})`, { seed, location: loc.id });
  }

  const kind = rng.pick(['hostile', 'social', 'social', 'incident'] as const);
  if (kind === 'hostile' && loc.dangerRating >= 4) {
    const table = CITY_HOSTILES.default.filter((h) => loc.dangerRating >= h.minDanger);
    if (table.length) {
      const pickEntry = rng.pick(table);
      const count = rng.int(1, pickEntry.countMax);
      const desc = `${count} ${MONSTERS[pickEntry.key].name}${count > 1 ? 's' : ''}`;
      const cityEnc: PendingEncounter = {
        seed,
        description: desc,
        monsters: [{ templateKey: pickEntry.key, count }],
        source: 'city',
        locationId: loc.id,
      };
      maybeElevateElite(world, cityEnc, rng);
      world.pendingEncounter = cityEnc;
      return logEvent(world, 'encounter.city', { seed, hostile: true, desc: cityEnc.description }, `Trouble near ${loc.name}: ${cityEnc.description} moving in on the party. (seed ${seed})`, { seed, location: loc.id });
    }
  }
  if (kind === 'social') {
    const npc = generateBackgroundNpc(world, loc.id, rng.fork());
    return logEvent(
      world,
      'encounter.social',
      { seed, npc: npc.id },
      `The party crossed paths with ${npc.name}, a ${npc.race} ${npc.occupation} (${npc.personality.join(', ')}) at ${loc.name}.`,
      { seed, location: loc.id, witnesses: partyMembers(world).map((c) => c.id) },
    );
  }
  const incident = rng.pick([
    'a pickpocket brushing too close in the crowd',
    'a City Watch patrol shaking down a vendor',
    'two drunk adventurers arguing over a map',
    'a crime in progress down a side alley',
    'a beggar who knows more than he should',
    'a street preacher naming names',
  ]);
  return logEvent(world, 'encounter.incident', { seed, incident }, `Near ${loc.name}, the party noticed ${incident}.`, { seed, location: loc.id, witnesses: partyMembers(world).map((c) => c.id) });
}
