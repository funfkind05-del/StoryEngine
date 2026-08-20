// Save system: snapshots (auto / scene / chapter / manual) plus
// project persistence to localStorage and JSON file export/import.

import type { Snapshot, WorldState } from './types';
import { seedQuests } from './quests';
import { ensureCampaign } from './campaign';
import { ensurePersonalArcs } from './companions';
import { buildSeedWorld } from '../data/seed';
import { activeSlot, slotKeys, touchBook } from './books';

const MAX_AUTO = 20;

export function makeSnapshot(world: WorldState, kind: Snapshot['kind'], label: string): Snapshot {
  return {
    id: `SNAP_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    kind,
    label,
    day: world.time.day,
    minute: world.time.minute,
    createdAt: Date.now(),
    world: JSON.stringify(world),
  };
}

export function pruneSnapshots(snaps: Snapshot[]): Snapshot[] {
  const autos = snaps.filter((s) => s.kind === 'auto');
  if (autos.length <= MAX_AUTO) return snaps;
  const keepAutoIds = new Set(autos.slice(-MAX_AUTO).map((s) => s.id));
  return snaps.filter((s) => s.kind !== 'auto' || keepAutoIds.has(s.id));
}

export function restoreSnapshot(snap: Snapshot): WorldState {
  return migrateWorld(JSON.parse(snap.world) as WorldState);
}

export function persistProject(world: WorldState, snapshots: Snapshot[]) {
  const keys = slotKeys(activeSlot());
  try {
    localStorage.setItem(keys.project, JSON.stringify(world));
    localStorage.setItem(keys.snapshots, JSON.stringify(snapshots));
  } catch {
    // localStorage may be full; snapshots are the likeliest culprit
    try {
      localStorage.setItem(keys.project, JSON.stringify(world));
    } catch {
      /* give up quietly; export still works */
    }
  }
  touchBook(activeSlot());
}

/** Fill fields added after a save was written, so old saves keep working. */
export function migrateWorld(world: WorldState): WorldState {
  world.needsEnabled ??= true;
  world.deathRule ??= 'story';
  world.encumbrance ??= 'light';
  world.partyInventory ??= [];
  world.killCounts ??= {};
  world.monsterArt ??= {};
  world.characterArt ??= {};
  world.outlinedUpTo ??= 0;
  world.bounty ??= 0;
  world.guildRanks ??= {};
  world.codex ??= [];
  world.activeEvents ??= [];
  world.achievements ??= [];
  world.doomEnabled ??= true;
  world.eventArchive ??= [];
  world.rivals ??= [];
  world.resurrectionRule ??= 'safe';
  world.torchMinutes ??= 0;
  world.tournament ??= null;
  world.activeSong ??= null;
  world.mount ??= null;
  world.writsDone ??= [];
  world.tournamentDaysWon ??= [];
  world.auctionsWon ??= [];
  world.contestsWon ??= [];
  world.bookNumber ??= 1;
  world.bookStarts ??= [{ book: 1, day: 0 }];
  world.relStages ??= {}; // baselines quietly on first milestone check
  world.mourning ??= [];
  world.companionSights ??= {};
  for (const sc of world.scenes) sc.book ??= 1;
  for (const c of Object.values(world.characters)) {
    c.wasParty ??= c.inParty;
  }
  world.writingStats ??= {};
  if (!world.quests) {
    world.quests = {};
    seedQuests(world);
  }
  ensureCampaign(world);
  // pre-companion saves gain the recruitable women + their arcs
  if (!world.characters['CHAR_YVENNE'] || !world.characters['CHAR_KESS'] || !world.characters['CHAR_ISHA'] || !world.characters['CHAR_CORVA']) {
    const fresh = buildSeedWorld();
    for (const id of ['CHAR_YVENNE', 'CHAR_KESS', 'CHAR_ISHA', 'CHAR_CORVA']) {
      if (!world.characters[id] && fresh.characters[id]) world.characters[id] = fresh.characters[id];
    }
    for (const id of ['LOC_OPENHAND', 'LOC_LAMPHALL', 'LOC_NIGHTMARKET', 'LOC_EDGEDHALL', 'LOC_NAMELESS', 'LOC_FIGHTPIT', 'LOC_SALTGATE', 'LOC_LANDGATE', 'LOC_SALTROAD1', 'LOC_WAYREST', 'LOC_SALTMERE', 'LOC_PINEROAD1', 'LOC_HERMITAGE', 'LOC_BROKENWATCH']) {
      if (!world.locations[id] && fresh.locations[id]) world.locations[id] = fresh.locations[id];
    }
    for (const id of ['FAC_LAMPLIGHTERS', 'FAC_TIDECOURT', 'FAC_BONEWARDENS']) {
      if (!world.factions[id] && fresh.factions[id]) world.factions[id] = fresh.factions[id];
    }
    if (!world.dungeons['DUN_TIDE_001'] && fresh.dungeons['DUN_TIDE_001']) world.dungeons['DUN_TIDE_001'] = fresh.dungeons['DUN_TIDE_001'];
    if (!world.dungeons['DUN_WILD_001'] && fresh.dungeons['DUN_WILD_001']) world.dungeons['DUN_WILD_001'] = fresh.dungeons['DUN_WILD_001'];
    // and the road back in for old saves that gained the Land Gate
    if (world.locations['LOC_GRAVEROW'] && !world.locations['LOC_GRAVEROW'].connections.includes('LOC_LANDGATE') && world.locations['LOC_LANDGATE']) {
      world.locations['LOC_GRAVEROW'].connections.push('LOC_LANDGATE');
    }
  }
  ensurePersonalArcs(world);
  for (const c of Object.values(world.characters)) {
    c.needs ??= { hunger: 25, fatigue: 30 };
    c.injuries ??= [];
    c.statuses ??= [];
    c.tempBonuses ??= [];
    c.permanentBonuses ??= [];
    c.abilities ??= [];
    c.resistances ??= {};
    c.charClass ??= 'commoner';
    c.evasion ??= 0;
    c.attributePoints ??= 0;
    c.skillXp ??= {};
  }
  for (const l of Object.values(world.locations)) {
    if (l.household) {
      l.household.storage ??= [];
      l.household.treasury ??= 0;
    }
  }
  return world;
}

export function loadProject(): { world: WorldState; snapshots: Snapshot[] } | null {
  const keys = slotKeys(activeSlot());
  const raw = localStorage.getItem(keys.project);
  if (!raw) return null;
  try {
    const world = migrateWorld(JSON.parse(raw) as WorldState);
    const snapsRaw = localStorage.getItem(keys.snapshots);
    const snapshots = snapsRaw ? (JSON.parse(snapsRaw) as Snapshot[]) : [];
    return { world, snapshots };
  } catch {
    return null;
  }
}

export function clearProject() {
  const keys = slotKeys(activeSlot());
  localStorage.removeItem(keys.project);
  localStorage.removeItem(keys.snapshots);
}

export function exportProject(world: WorldState, snapshots: Snapshot[], artPack?: Record<string, string>) {
  const blob = new Blob([JSON.stringify({ version: 1, world, snapshots, artPack: artPack && Object.keys(artPack).length ? artPack : undefined }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `storyengine-day${world.time.day}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProject(file: File): Promise<{ world: WorldState; snapshots: Snapshot[]; artPack?: Record<string, string> } | null> {
  try {
    const data = JSON.parse(await file.text());
    if (!data.world) return null;
    return {
      world: migrateWorld(data.world as WorldState),
      snapshots: (data.snapshots ?? []) as Snapshot[],
      artPack: data.artPack as Record<string, string> | undefined,
    };
  } catch {
    return null;
  }
}
