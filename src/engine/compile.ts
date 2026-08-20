// Manuscript compilation: stitch scenes into chapters and export the
// actual novel. Entity tokens @[Name](ID) render as plain names; sim
// scaffolding (notes/log/conversation blocks) can be stripped or kept;
// LitRPG stat-block windows are kept by default — they're the genre.

import type { Scene, WorldState } from './types';

export interface CompileOptions {
  stripSimBlocks: boolean; // [SIM NOTES] / [COMBAT LOG] / [CONVERSATION] --- blocks
  keepStatBlocks: boolean; // ╔══╗ system windows
  sceneSeparator: string; // between scenes within a chapter
  includeSceneTitles: boolean;
}

export const DEFAULT_COMPILE: CompileOptions = {
  stripSimBlocks: true,
  keepStatBlocks: true,
  sceneSeparator: '* * *',
  includeSceneTitles: false,
};

const TOKEN_RE = /@\[([^\]]+)\]\(([A-Z]+_[A-Za-z0-9_]+)\)/g;
// blocks the tooling writes: --- ... [LABEL] ... ---
const SIM_BLOCK_RE = /\n?-{3,}\n\[(?:SIM NOTES|COMBAT LOG|OUTLINE[^\]]*|CONVERSATION[^\]]*)\][\s\S]*?\n-{3,}\n?/g;
const STAT_BLOCK_RE = /╔[═]+╗\n(?:║[^\n]*\n)+╚[═]+╝/g;

export function renderSceneText(text: string, opts: CompileOptions): string {
  let out = text.replace(TOKEN_RE, '$1');
  if (opts.stripSimBlocks) out = out.replace(SIM_BLOCK_RE, '\n');
  if (!opts.keepStatBlocks) out = out.replace(STAT_BLOCK_RE, '');
  // collapse 3+ blank lines left behind by stripping
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export interface CompiledStats {
  chapters: number;
  scenes: number;
  words: number;
}

export function compileStats(world: WorldState, opts: CompileOptions): CompiledStats {
  const scenes = [...world.scenes].sort((a, b) => a.chapter - b.chapter || a.order - b.order);
  const words = scenes.reduce((sum, s) => {
    const t = renderSceneText(s.text, opts);
    return sum + (t ? t.split(/\s+/).length : 0);
  }, 0);
  return { chapters: new Set(scenes.map((s) => s.chapter)).size, scenes: scenes.length, words };
}

function orderedChapters(world: WorldState): [number, Scene[]][] {
  const chapters = new Map<number, Scene[]>();
  for (const s of [...world.scenes].sort((a, b) => a.order - b.order)) {
    if (!chapters.has(s.chapter)) chapters.set(s.chapter, []);
    chapters.get(s.chapter)!.push(s);
  }
  return [...chapters.entries()].sort((a, b) => a[0] - b[0]);
}

/** Markdown manuscript. */
export function compileMarkdown(world: WorldState, title: string, opts: CompileOptions): string {
  const parts: string[] = [`# ${title}`, ''];
  for (const [ch, scenes] of orderedChapters(world)) {
    parts.push(`## Chapter ${ch}`, '');
    scenes.forEach((s, i) => {
      if (i > 0) parts.push('', opts.sceneSeparator, '');
      if (opts.includeSceneTitles) parts.push(`### ${s.title}`, '');
      const text = renderSceneText(s.text, opts);
      if (text) parts.push(text);
    });
    parts.push('');
  }
  return parts.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Standalone printable HTML (browser print → PDF). */
export function compileHtml(world: WorldState, title: string, opts: CompileOptions): string {
  const body: string[] = [`<h1>${escapeHtml(title)}</h1>`];
  for (const [ch, scenes] of orderedChapters(world)) {
    body.push(`<h2>Chapter ${ch}</h2>`);
    scenes.forEach((s, i) => {
      if (i > 0) body.push(`<p class="sep">${escapeHtml(opts.sceneSeparator)}</p>`);
      if (opts.includeSceneTitles) body.push(`<h3>${escapeHtml(s.title)}</h3>`);
      const text = renderSceneText(s.text, opts);
      for (const para of text.split(/\n\n+/)) {
        if (!para.trim()) continue;
        if (/^╔/.test(para)) body.push(`<pre class="statblock">${escapeHtml(para)}</pre>`);
        else body.push(`<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`);
      }
    });
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Iowan Old Style', Palatino, Georgia, serif; max-width: 38em; margin: 3em auto; line-height: 1.7; font-size: 1.05em; color: #1a1a1a; padding: 0 1em; }
  h1 { text-align: center; margin-bottom: 2em; }
  h2 { margin-top: 3em; text-align: center; page-break-before: always; }
  p { text-indent: 1.5em; margin: 0 0 0.2em; }
  p.sep { text-align: center; text-indent: 0; margin: 1.5em 0; }
  pre.statblock { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.75em; background: #f4f1ea; border: 1px solid #ddd; padding: 0.8em; overflow-x: auto; page-break-inside: avoid; }
  @media print { body { margin: 0 auto; } }
</style></head><body>
${body.join('\n')}
</body></html>`;
}

/**
 * Compact the event log: everything before the outline cursor except
 * load-bearing kinds is replaced with a one-line digest. Keeps saves
 * fast across a twenty-book campaign. The outline cursor is adjusted.
 */
const KEEP_KINDS = new Set([
  'campaign.revelation', 'campaign.offered', 'campaign.complete', 'quest.completed', 'quest.choice',
  'personal.completed', 'party.join', 'party.leave', 'household.purchased', 'household.tier',
  'guild.joined', 'guild.rank', 'guild.mastery', 'achievement', 'character.death', 'doom', 'world.created',
]);

export function compactEvents(world: WorldState): { removed: number; kept: number } {
  const cursor = Math.min(world.outlinedUpTo ?? 0, world.events.length);
  if (cursor < 200) return { removed: 0, kept: world.events.length };
  const before = world.events.slice(0, cursor);
  const after = world.events.slice(cursor);
  const kept = before.filter((e) => KEEP_KINDS.has(e.kind));
  const removed = before.length - kept.length;
  if (removed === 0) return { removed: 0, kept: world.events.length };
  const firstDay = before[0]?.time.day ?? 1;
  const lastDay = before[before.length - 1]?.time.day ?? firstDay;
  const combats = before.filter((e) => e.kind === 'combat.end').length;
  world.eventArchive ??= [];
  world.eventArchive.push(`Days ${firstDay}–${lastDay}: ${removed} routine events compacted (${combats} combats among them; milestones retained).`);
  world.events = [...kept, ...after];
  world.outlinedUpTo = kept.length;
  return { removed, kept: world.events.length };
}

/** Track manuscript size per real calendar day (writing dashboard). */
export function recordWritingStats(world: WorldState) {
  const words = compileStats(world, DEFAULT_COMPILE).words;
  const today = new Date().toISOString().slice(0, 10);
  world.writingStats ??= {};
  world.writingStats[today] = words;
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
