// Custom art lives in IndexedDB, not the save. localStorage caps the
// whole project at ~5MB; one generous PNG ate most of that when art
// rode inside the world (and every snapshot cloned it again). Now the
// world stays lean facts, IndexedDB holds the images against a disk-
// sized quota, and a synchronous in-memory cache keeps rendering
// simple. Exports can still bundle the art so a .json moves machines
// whole.

import type { Snapshot, WorldState } from './types';

const DB = 'storyengine-art';
const STORE = 'art';

export type ArtKind = 'monster' | 'char';
const keyOf = (kind: ArtKind, id: string) => `${kind}:${id}`;

// ---------- synchronous cache over the async store ----------
const cache: Record<string, string> = {};

// tiny external store so portraits re-render without importing zustand
let version = 0;
const listeners = new Set<() => void>();
function notifyArt(): void {
  version += 1;
  for (const l of listeners) l();
}
export function subscribeArt(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function artSnapshot(): number {
  return version;
}

export function getMonsterArtCached(templateKey: string): string | undefined {
  return cache[keyOf('monster', templateKey)];
}

export function getCharacterArtCached(charId: string): string | undefined {
  return cache[keyOf('char', charId)];
}

export function allCachedArt(): Record<string, string> {
  return { ...cache };
}

// ---------- generated art on the dev server's disk ----------
// tools/genart.mjs writes PNGs + manifests under public/; the app
// treats them as a middle layer: custom upload > generated file > drawn plate.
const serverBestiary = new Set<string>();
const serverDungeons = new Set<string>();

export async function initServerArt(): Promise<void> {
  try {
    const b = await fetch('/bestiary/manifest.json');
    if (b.ok) for (const k of (await b.json()) as string[]) serverBestiary.add(k);
  } catch { /* no generated bestiary yet */ }
  try {
    const d = await fetch('/dungeons/manifest.json');
    if (d.ok) for (const k of (await d.json()) as string[]) serverDungeons.add(k);
  } catch { /* no generated backdrops yet */ }
  if (serverBestiary.size || serverDungeons.size) notifyArt();
}

export function serverMonsterArtUrl(templateKey: string): string | undefined {
  return serverBestiary.has(templateKey) ? `/bestiary/${templateKey}.png` : undefined;
}

export function dungeonBackdropUrl(pattern: string): string | undefined {
  return serverDungeons.has(pattern) ? `/dungeons/${pattern}.png` : undefined;
}

// ---------- IndexedDB plumbing ----------
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveArt(kind: ArtKind, id: string, dataUri: string): Promise<void> {
  cache[keyOf(kind, id)] = dataUri;
  notifyArt();
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataUri, keyOf(kind, id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // cache still serves this session; worst case the art re-uploads
  }
}

export async function deleteArt(kind: ArtKind, id: string): Promise<void> {
  delete cache[keyOf(kind, id)];
  notifyArt();
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(keyOf(kind, id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // nothing to do — the cache is already clean
  }
}

/** Load everything into the cache at boot. Returns how many pieces. */
export async function initArtCache(): Promise<number> {
  try {
    const db = await openDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE);
      const store = tx.objectStore(STORE);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      tx.oncomplete = () => {
        const keys = keysReq.result as string[];
        const vals = valsReq.result as string[];
        keys.forEach((k, i) => { cache[k] = vals[i]; });
        if (keys.length) notifyArt();
        resolve(keys.length);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return 0;
  }
}

/** Restore an export's art pack into the store. */
export async function importArtPack(pack: Record<string, string>): Promise<void> {
  for (const [key, dataUri] of Object.entries(pack)) {
    const [kind, ...rest] = key.split(':');
    if ((kind === 'monster' || kind === 'char') && rest.length) {
      await saveArt(kind, rest.join(':'), dataUri);
    }
  }
}

// ---------- migration: sweep art out of saved worlds ----------
/**
 * Pure sweep: pull legacy embedded art out of a world and its
 * snapshots, returning the collected pieces. Mutates the world (and
 * snapshot worlds) to drop the payloads — that's the point.
 */
export function collectWorldArt(world: WorldState, snapshots: Snapshot[] = []): Record<string, string> {
  const found: Record<string, string> = {};
  const sweep = (w: WorldState) => {
    let had = false;
    for (const [id, uri] of Object.entries(w.monsterArt ?? {})) {
      if (uri) { found[keyOf('monster', id)] ??= uri; had = true; }
    }
    for (const [id, uri] of Object.entries(w.characterArt ?? {})) {
      if (uri) { found[keyOf('char', id)] ??= uri; had = true; }
    }
    w.monsterArt = {};
    w.characterArt = {};
    return had;
  };
  sweep(world);
  // snapshots hold the world as a JSON string — only touch the ones
  // actually carrying image payloads
  for (const s of snapshots) {
    if (!s.world.includes('data:image')) continue;
    try {
      const w = JSON.parse(s.world) as WorldState;
      if (sweep(w)) s.world = JSON.stringify(w);
    } catch {
      // a snapshot too broken to parse is a snapshot we leave alone
    }
  }
  return found;
}
