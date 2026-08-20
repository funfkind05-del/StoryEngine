// Multiple books: the app can hold several worlds (books) side by
// side in localStorage. Each book is a slot; switching persists the
// current one first. The legacy single-project key is book "default".

export interface BookMeta {
  slot: string;
  name: string;
  updatedAt: number;
}

const BOOKS_KEY = 'storyengine.books.v1';
const ACTIVE_KEY = 'storyengine.activeBook.v1';

export function activeSlot(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? 'default';
}

export function setActiveSlot(slot: string) {
  localStorage.setItem(ACTIVE_KEY, slot);
}

export function slotKeys(slot: string): { project: string; snapshots: string } {
  const suffix = slot === 'default' ? '' : `.${slot}`;
  return {
    project: `storyengine.project.v1${suffix}`,
    snapshots: `storyengine.snapshots.v1${suffix}`,
  };
}

export function listBooks(): BookMeta[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    const books: BookMeta[] = raw ? JSON.parse(raw) : [];
    if (!books.some((b) => b.slot === 'default')) {
      books.unshift({ slot: 'default', name: 'Blackwall', updatedAt: 0 });
    }
    return books;
  } catch {
    return [{ slot: 'default', name: 'Blackwall', updatedAt: 0 }];
  }
}

function saveBooks(books: BookMeta[]) {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
}

export function touchBook(slot: string, name?: string) {
  const books = listBooks();
  const existing = books.find((b) => b.slot === slot);
  if (existing) {
    existing.updatedAt = Date.now();
    if (name) existing.name = name;
  } else {
    books.push({ slot, name: name ?? 'Untitled book', updatedAt: Date.now() });
  }
  saveBooks(books);
}

export function newBookSlot(): string {
  return `b${Date.now().toString(36)}`;
}

export function renameBook(slot: string, name: string) {
  touchBook(slot, name);
}

export function deleteBook(slot: string) {
  if (slot === 'default') return; // the first book keeps its slot
  const { project, snapshots } = slotKeys(slot);
  localStorage.removeItem(project);
  localStorage.removeItem(snapshots);
  saveBooks(listBooks().filter((b) => b.slot !== slot));
  if (activeSlot() === slot) setActiveSlot('default');
}
