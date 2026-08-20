// The series backbone: ONE continuing world, many books. Closing a
// book is a deliberate act — it marks the boundary in the event log,
// resets chapter numbering, and lets compile/outline scope themselves
// to the volume in hand while the simulation carries every consequence
// forward into the next one. Twenty books, one Blackwall.

import type { Scene, WorldState } from './types';
import { logEvent, partyMembers } from './world';

export function currentBook(world: WorldState): number {
  return world.bookNumber ?? 1;
}

export function bookOf(scene: Scene): number {
  return scene.book ?? 1;
}

export function scenesInBook(world: WorldState, book: number): Scene[] {
  return world.scenes.filter((s) => bookOf(s) === book);
}

/** Close the current book and open the next. The world keeps going. */
export function beginNextBook(world: WorldState, closingTitle?: string): void {
  const book = currentBook(world);
  world.bookStarts ??= [{ book: 1, day: 0 }];
  const start = world.bookStarts.find((b) => b.book === book);
  const days = world.time.day - (start?.day ?? 0);
  const scenes = scenesInBook(world, book);
  const words = scenes.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  if (closingTitle && start) start.title = closingTitle;
  logEvent(
    world,
    'book.end',
    { book, title: closingTitle ?? null, days, scenes: scenes.length, words },
    `BOOK ${book}${closingTitle ? ` — “${closingTitle}” —` : ''} closes: ${days} days of Blackwall, ${scenes.length} scene${scenes.length === 1 ? '' : 's'}, ${words.toLocaleString()} words of manuscript. The city does not pause for the cover art.`,
    { witnesses: partyMembers(world).map((c) => c.id) },
  );
  world.bookNumber = book + 1;
  world.bookStarts.push({ book: book + 1, day: world.time.day });
  world.chapter = 1; // chapters count fresh inside each volume
  logEvent(
    world,
    'book.begin',
    { book: book + 1, day: world.time.day },
    `BOOK ${book + 1} opens on Day ${world.time.day}. Everything that happened still happened.`,
    { witnesses: partyMembers(world).map((c) => c.id) },
  );
}
