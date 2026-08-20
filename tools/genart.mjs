// Batch art generation via Ideogram. Writes PNGs to public/bestiary/
// (monsters) and public/dungeons/ (per-theme corridor backdrops), plus
// manifest.json files the app loads at boot. Files are gitignored —
// regenerable content, not source. Skips anything already on disk, so
// re-runs only fill gaps.
//
// Usage: node tools/genart.mjs [--monsters] [--dungeons] (default both)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function key() {
  const env = readFileSync(join(homedir(), 'Evolution', '.env'), 'utf8');
  const line = env.split('\n').find((l) => l.trim().startsWith('IDEOGRAM_API_KEY'));
  if (!line) throw new Error('No IDEOGRAM_API_KEY in ~/Evolution/.env');
  return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

const API_KEY = key();

async function generate(prompt, aspect = '1x1') {
  const res = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
    method: 'POST',
    headers: { 'Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect_ratio: aspect, rendering_speed: 'TURBO', num_images: 1 }),
  });
  if (!res.ok) throw new Error(`Ideogram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const url = data.data?.[0]?.url;
  if (!url) throw new Error('No image URL in response');
  const img = await fetch(url);
  if (!img.ok) throw new Error(`Download failed: ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- monster prompts: pull the curated list straight from the source ----
function parseMonsterPrompts() {
  const src = readFileSync(join(root, 'src/engine/artPrompts.ts'), 'utf8');
  const map = {};
  const re = /^\s*'?([a-z-]+)'?:\s*(['"])([\s\S]*?)\2,\s*$/gm;
  let m;
  while ((m = re.exec(src))) map[m[1]] = m[3].replace(/\\'/g, "'");
  return map;
}

function parseMonsters() {
  // name + level + archetype from the MONSTERS source, enough for fallback prompts
  const src = readFileSync(join(root, 'src/engine/monsters.ts'), 'utf8');
  const out = [];
  const re = /key: '([a-z-]+)', name: '([^']+)', level: (\d+)[\s\S]*?(?:art: \{ archetype: '([a-z]+)' \})?/g;
  const blocks = src.split(/\n  '/).slice(1);
  for (const b of blocks) {
    const k = b.match(/^([a-z-]+)':/)?.[1];
    const name = b.match(/name: '([^']+)'/)?.[1];
    const level = b.match(/level: (\d+)/)?.[1];
    const arch = b.match(/archetype: '([a-z]+)'/)?.[1];
    if (k && name) out.push({ key: k, name, level: level ?? '1', arch: arch ?? 'beast' });
  }
  return out;
}

const PREFIX = (name, desc) =>
  `A dark fantasy RPG portrait of ${name}, ${desc} The art style is gritty digital painting with moody lighting.`;

async function runMonsters() {
  const dir = join(root, 'public', 'bestiary');
  mkdirSync(dir, { recursive: true });
  const curated = parseMonsterPrompts();
  const monsters = parseMonsters();
  console.log(`bestiary: ${monsters.length} monsters, ${Object.keys(curated).length} curated prompts`);
  let made = 0, skipped = 0, failed = 0;
  for (const mo of monsters) {
    const file = join(dir, `${mo.key}.png`);
    if (existsSync(file)) { skipped++; continue; }
    const desc = curated[mo.key] ?? `a menacing ${mo.arch} of the haunted city of Blackwall, level ${mo.level}, a single centered subject with no text.`;
    try {
      const buf = await generate(PREFIX(mo.name, desc));
      writeFileSync(file, buf);
      made++;
      console.log(`  [${made + skipped + failed}/${monsters.length}] ${mo.key} (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) {
      failed++;
      console.log(`  FAILED ${mo.key}: ${e.message}`);
      await sleep(2000);
    }
    await sleep(400);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(files));
  console.log(`bestiary done: ${made} new, ${skipped} existing, ${failed} failed, manifest ${files.length}`);
}

// ---- dungeon backdrops: one per wall theme ----
const DUNGEON_BACKDROPS = {
  bones: 'the interior of an ancient underground crypt corridor seen in first person, walls lined with burial niches holding old skulls and bones, dust and cobwebs, a dead-end stone wall ahead, warm torchlight from an unseen source.',
  slime: 'the interior of a flooded smuggler tunnel seen in first person, green slime running down brick walls, shallow dark water on the floor reflecting sickly green light, a dead-end wall ahead.',
  flutes: 'the interior of a drowned sunken temple corridor seen in first person, fluted stone columns crusted with barnacles and salt, pale sea-green light, a dead-end carved wall ahead.',
  brands: 'the interior of a cult tunnel seen in first person, rough walls scorched with branded ritual sigils, drifting ash in the air, ember-orange light, a dead-end branded wall ahead.',
  rivets: 'the interior of a sealed bank vault corridor seen in first person, dark riveted iron plate walls, cold steel-blue light, a massive dead-end vault wall ahead.',
  cracks: 'the interior of a dragon-scorched undercroft seen in first person, heat-cracked and half-melted stone walls glowing faintly in the cracks, drifting embers, a dead-end scorched wall ahead.',
  runes: 'the interior of an ancient buried palace corridor seen in first person, smooth dark stone carved with faint violet glowing runes, unnatural stillness, a dead-end rune wall ahead.',
  bricks: 'the interior of an old dungeon corridor seen in first person, weathered brick walls, packed earth floor, warm amber torchlight, a dead-end brick wall ahead.',
};

async function runDungeons() {
  const dir = join(root, 'public', 'dungeons');
  mkdirSync(dir, { recursive: true });
  let made = 0;
  for (const [k, desc] of Object.entries(DUNGEON_BACKDROPS)) {
    const file = join(dir, `${k}.png`);
    if (existsSync(file)) continue;
    try {
      const buf = await generate(`A dark fantasy RPG environment painting: ${desc} No creatures, no people, no text. The art style is gritty digital painting with moody lighting.`, '16x10');
      writeFileSync(file, buf);
      made++;
      console.log(`  dungeon backdrop ${k} (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) {
      console.log(`  FAILED dungeon ${k}: ${e.message}`);
      await sleep(2000);
    }
    await sleep(400);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(files));
  console.log(`dungeons done: ${made} new, manifest ${files.length}`);
}

const args = process.argv.slice(2);
const doMonsters = args.length === 0 || args.includes('--monsters');
const doDungeons = args.length === 0 || args.includes('--dungeons');
if (doDungeons) await runDungeons();
if (doMonsters) await runMonsters();
console.log('ALL DONE');
