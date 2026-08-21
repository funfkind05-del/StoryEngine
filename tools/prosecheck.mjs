// The product check: play a stretch, outline it, compile it — and
// read what the pipeline actually hands a novelist.
import { writeFileSync } from 'node:fs';
import { buildSeedWorld } from '../src/data/seed';
import { Rng } from '../src/engine/rng';
import { autoplayStep, newAutoplayer } from '../src/engine/autoplayer';
import { buildOutline, createScenesFromBeats, outlineToText } from '../src/engine/outline';
import { compileMarkdown, DEFAULT_COMPILE } from '../src/engine/compile';

const w = buildSeedWorld();
w.masterSeed = 4242;
const rng = new Rng(24);
const state = newAutoplayer();
for (let i = 0; i < 6000; i++) autoplayStep(w, state, rng, i);

const beats = buildOutline(w);
const outlineText = outlineToText(w, beats, 2);
createScenesFromBeats(w, beats.slice(0, 8), 2);
const md = compileMarkdown(w, 'Blackwall — prosecheck', { ...DEFAULT_COMPILE, stripSimBlocks: false });
const out = '/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad/prosecheck.md';
writeFileSync(out, `# OUTLINE (${beats.length} beats)\n\n${outlineText.slice(0, 9000)}\n\n# COMPILED (first 6000 chars)\n\n${md.slice(0, 6000)}`);
console.log('beats:', beats.length, '— written to prosecheck.md');
