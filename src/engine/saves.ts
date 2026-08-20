// Save system: snapshots (auto / scene / chapter / manual) plus
// project persistence to localStorage and JSON file export/import.

import type { Snapshot, WorldState } from './types';

const PROJECT_KEY = 'storyengine.project.v1';
const SNAPSHOTS_KEY = 'storyengine.snapshots.v1';
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
  return JSON.parse(snap.world) as WorldState;
}

export function persistProject(world: WorldState, snapshots: Snapshot[]) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(world));
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  } catch {
    // localStorage may be full; snapshots are the likeliest culprit
    try {
      localStorage.setItem(PROJECT_KEY, JSON.stringify(world));
    } catch {
      /* give up quietly; export still works */
    }
  }
}

export function loadProject(): { world: WorldState; snapshots: Snapshot[] } | null {
  const raw = localStorage.getItem(PROJECT_KEY);
  if (!raw) return null;
  try {
    const world = JSON.parse(raw) as WorldState;
    const snapsRaw = localStorage.getItem(SNAPSHOTS_KEY);
    const snapshots = snapsRaw ? (JSON.parse(snapsRaw) as Snapshot[]) : [];
    return { world, snapshots };
  } catch {
    return null;
  }
}

export function clearProject() {
  localStorage.removeItem(PROJECT_KEY);
  localStorage.removeItem(SNAPSHOTS_KEY);
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
    return { world: data.world as WorldState, snapshots: (data.snapshots ?? []) as Snapshot[] };
  } catch {
    return null;
  }
}
