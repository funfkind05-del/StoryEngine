// Uploaded music: keep real audio files (AI-generated elsewhere or
// otherwise) in IndexedDB, one per theme, and hand the player object
// URLs. Blobs survive reloads; localStorage never sees them.

import type { MusicTheme } from '../sound';

const DB = 'storyengine-music';
const STORE = 'tracks';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMusicFile(theme: Exclude<MusicTheme, 'off'>, file: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, theme);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteMusicFile(theme: Exclude<MusicTheme, 'off'>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(theme);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadMusicFiles(): Promise<Partial<Record<Exclude<MusicTheme, 'off'>, Blob>>> {
  try {
    const db = await openDb();
    const out: Partial<Record<Exclude<MusicTheme, 'off'>, Blob>> = {};
    for (const theme of ['city', 'dungeon', 'combat'] as const) {
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(theme);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error);
      });
      if (blob) out[theme] = blob;
    }
    return out;
  } catch {
    return {};
  }
}
