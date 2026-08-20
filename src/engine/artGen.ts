// Ideogram art generation, client side. The dev server holds the key
// (~/Evolution/.env) and does the API work; the browser only sends a
// prompt and receives a data URI, which goes straight into the
// IndexedDB art store like any upload.

import type { MonsterTemplate, Character } from './types';
import { ART_STYLE_PREFIX, MONSTER_ART_PROMPTS } from './artPrompts';

export function monsterPrompt(t: MonsterTemplate): string {
  const curated = MONSTER_ART_PROMPTS[t.key];
  if (curated) return ART_STYLE_PREFIX(t.name, curated);
  // unmapped monsters get a description built in the same style
  const arch = t.art?.archetype ?? 'beast';
  return ART_STYLE_PREFIX(t.name, `a menacing ${arch} of the haunted city of Blackwall, level ${t.level}, rendered as a single centered subject with no text.`);
}

export function portraitPrompt(c: Character): string {
  return ART_STYLE_PREFIX(c.name, `${c.sex === 'female' ? 'a woman' : 'a man'}, ${c.occupation} in a grim low-fantasy city. ${c.description.slice(0, 280)}`);
}

/** Ask the dev server to generate one image. Returns a data URI. */
export async function generateArt(prompt: string): Promise<string> {
  const res = await fetch('/artgen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect: '1x1' }),
  });
  const data = (await res.json()) as { dataUri?: string; error?: string };
  if (!res.ok || !data.dataUri) throw new Error(data.error ?? `Art generation failed (${res.status}).`);
  return data.dataUri;
}
