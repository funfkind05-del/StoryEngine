// Durable on-disk backup via the File System Access API (Chromium).
// localStorage can be evicted by the browser; a novel cannot. The
// author links a .json file once; the app then rewrites it after
// every burst of changes (throttled), and the file handle survives
// reloads via IndexedDB.

import type { Snapshot, WorldState } from './types';

// Minimal typings for the File System Access API (not yet in lib.dom)
interface FsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface FsFileHandle {
  name: string;
  createWritable(): Promise<FsWritable>;
  queryPermission?(opts: { mode: string }): Promise<string>;
  requestPermission?(opts: { mode: string }): Promise<string>;
}
interface FsWindow {
  showSaveFilePicker?(opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FsFileHandle>;
}

export function diskSaveSupported(): boolean {
  return typeof (window as FsWindow).showSaveFilePicker === 'function';
}

// ---------- handle persistence (IndexedDB; handles can't go in localStorage) ----------
const DB_NAME = 'storyengine-fs';
const STORE = 'handles';
const KEY = 'backup-file';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<FsFileHandle | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    tx.onsuccess = () => resolve((tx.result as FsFileHandle) ?? null);
    tx.onerror = () => resolve(null);
  });
}

async function idbSet(handle: FsFileHandle | null): Promise<void> {
  const db = await openDb();
  return new Promise((resolve) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const tx = handle ? store.put(handle, KEY) : store.delete(KEY);
    tx.onsuccess = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ---------- public API ----------
let cachedHandle: FsFileHandle | null = null;
let lastWriteAt = 0;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

export async function getLinkedBackup(): Promise<FsFileHandle | null> {
  if (cachedHandle) return cachedHandle;
  cachedHandle = await idbGet();
  return cachedHandle;
}

export async function chooseBackupFile(): Promise<FsFileHandle | null> {
  const w = window as FsWindow;
  if (!w.showSaveFilePicker) return null;
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: 'blackwall-backup.json',
      types: [{ description: 'Story Engine project', accept: { 'application/json': ['.json'] } }],
    });
    cachedHandle = handle;
    await idbSet(handle);
    return handle;
  } catch {
    return null; // user cancelled
  }
}

export async function unlinkBackup(): Promise<void> {
  cachedHandle = null;
  await idbSet(null);
}

async function ensurePermission(handle: FsFileHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  const q = await handle.queryPermission({ mode: 'readwrite' });
  if (q === 'granted') return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function writeBackupNow(world: WorldState, snapshots: Snapshot[]): Promise<string | null> {
  const handle = await getLinkedBackup();
  if (!handle) return 'No backup file linked.';
  try {
    if (!(await ensurePermission(handle))) return 'Permission to write the backup file was denied.';
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify({ version: 1, world, snapshots }, null, 1));
    await writable.close();
    lastWriteAt = Date.now();
    return null;
  } catch (e) {
    return `Backup write failed: ${e instanceof Error ? e.message : e}`;
  }
}

/** Throttled auto-backup: at most one disk write per 60s of activity. */
export function scheduleBackup(getState: () => { world: WorldState; snapshots: Snapshot[] }) {
  if (!cachedHandle) return;
  if (writeTimer) return;
  const due = Math.max(1000, 60_000 - (Date.now() - lastWriteAt));
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const { world, snapshots } = getState();
    void writeBackupNow(world, snapshots);
  }, due);
}

export function lastBackupAt(): number {
  return lastWriteAt;
}
