// Save system: snapshots (auto / scene / chapter / manual) plus
// project persistence to localStorage and JSON file export/import.

import type { Snapshot, WorldState } from './types';
import { seedQuests } from './quests';
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
  if (!world.quests) {
    world.quests = {};
    seedQuests(world);
  }
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

export function exportProject(world: WorldState, snapshots: Snapshot[]) {
  const blob = new Blob([JSON.stringify({ version: 1, world, snapshots }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `storyengine-day${world.time.day}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProject(file: File): Promise<{ world: WorldState; snapshots: Snapshot[] } | null> {
  try {
    const data = JSON.parse(await file.text());
    if (!data.world) return null;
    return { world: migrateWorld(data.world as WorldState), snapshots: (data.snapshots ?? []) as Snapshot[] };
  } catch {
    return null;
  }
}
