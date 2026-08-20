// Style-tic measurement, ported from the Lotus Gate sessions' finding:
// two restraint constructions — withheld action ("he did not look at
// her") and "Not"-fragments ("Not there. Not yet.") — read as
// discipline in isolation and become a book's only move at density.
// They COMPOUND when prior prose is fed forward as drafting context,
// and per-chapter warnings can't show the trend — so we measure per
// chapter and show the series where the author compiles.

import type { WorldState } from './types';
import { DEFAULT_COMPILE, renderSceneText } from './compile';

// "did not / didn't / does not / doesn't + <perception-restraint verb>"
const WITHHELD_RE =
  /\b(?:did|does|do)\s*n[o'’]t\s+(?:look|glance|move|answer|reply|respond|ask|speak|say|turn|flinch|smile|reach|follow|stop|wait)\b/gi;

// sentence-fragments beginning "Not …" — short, clipped sentences.
// Counted by sentence-splitting rather than a consuming regex, so
// back-to-back fragments ("Not there. Not yet.") each count.
function countNotFragments(text: string): number {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => /^Not\s/.test(s) && s.length <= 48 && s.endsWith('.')).length;
}

export interface TicCounts {
  words: number;
  withheld: number;
  notFragments: number;
  /** combined tics per 1,000 words */
  per1k: number;
}

export function measureTics(text: string): TicCounts {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const withheld = (text.match(WITHHELD_RE) ?? []).length;
  const notFragments = countNotFragments(text);
  const per1k = words > 0 ? ((withheld + notFragments) / words) * 1000 : 0;
  return { words, withheld, notFragments, per1k };
}

export interface ChapterTics extends TicCounts {
  chapter: number;
}

/** Per-chapter tic series over the compiled prose (scaffolding stripped). */
export function ticTrend(world: WorldState): ChapterTics[] {
  const byChapter = new Map<number, string[]>();
  for (const s of [...world.scenes].sort((a, b) => a.chapter - b.chapter || a.order - b.order)) {
    if (!byChapter.has(s.chapter)) byChapter.set(s.chapter, []);
    byChapter.get(s.chapter)!.push(renderSceneText(s.text, DEFAULT_COMPILE));
  }
  return [...byChapter.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chapter, texts]) => ({ chapter, ...measureTics(texts.join('\n\n')) }));
}

/** Above this combined rate a chapter is leaning on the mannerism. */
export const TIC_WARN_PER_1K = 1.5;

/**
 * The proven counter-measure for LLM drafting prompts: bans don't work;
 * occupying the slot with a named tic, a hard budget, and the
 * replacement move does. Appended to every prose-drafting system prompt.
 */
export const ANTI_TIC_PROMPT =
  `WITHHELD ACTION IS A MANNERISM, NOT A VOICE. Two constructions are rationed: ` +
  `(1) negated perception/action — "he did not look at her", "she didn't answer"; ` +
  `(2) sentence-fragments beginning "Not" — "Not there.", "Not yet." ` +
  `Each is meant to read as discipline; at density every character performs the same restraint and the prose has one move. ` +
  `Use each construction AT MOST ONCE in this scene. The rest of the time, occupy the slot with what IS there: ` +
  `instead of "he did not look at her", write what he looked at; ` +
  `instead of "Not there. Two strides left.", write "Two strides left. The ground is packed."`;
