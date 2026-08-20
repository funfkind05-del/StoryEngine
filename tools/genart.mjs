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
// run with `npx tsx tools/genart.mjs` — these are TypeScript modules
import { MONSTERS } from '../src/engine/monsters';
import { ART_STYLE_PREFIX, MONSTER_ART_PROMPTS } from '../src/engine/artPrompts';
import { buildSeedWorld } from '../src/data/seed';

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

// the real engine tables — no source parsing, no drift
const parseMonsterPrompts = () => MONSTER_ART_PROMPTS;
const parseMonsters = () => Object.values(MONSTERS).map((t) => ({ key: t.key, name: t.name, level: String(t.level), arch: t.art?.archetype ?? 'beast' }));
const PREFIX = ART_STYLE_PREFIX;

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

// ---- character portraits: the seed cast, from their sheets ----
async function runCharacters() {
  const dir = join(root, 'public', 'portraits');
  mkdirSync(dir, { recursive: true });
  const world = buildSeedWorld();
  const cast = Object.values(world.characters).filter((c) => c.persistent);
  console.log(`portraits: ${cast.length} characters`);
  let made = 0, skipped = 0, failed = 0;
  for (const c of cast) {
    const file = join(dir, `${c.id}.png`);
    if (existsSync(file)) { skipped++; continue; }
    const desc = `${c.sex === 'female' ? 'a woman' : 'a man'}, age ${c.age}, ${c.occupation} in a grim low-fantasy city. ${c.description} Head and shoulders portrait.`;
    try {
      const buf = await generate(PREFIX(c.name, desc));
      writeFileSync(file, buf);
      made++;
      console.log(`  [${made + skipped + failed}/${cast.length}] ${c.id} — ${c.name} (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) {
      failed++;
      console.log(`  FAILED ${c.id}: ${e.message}`);
      await sleep(2000);
    }
    await sleep(400);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(files));
  console.log(`portraits done: ${made} new, ${skipped} existing, ${failed} failed, manifest ${files.length}`);
}

// ---- class portraits: one exemplar per playable trade ----
const CLASS_PROMPTS = {
  fighter: 'a battle-worn human fighter in dented plate with a longsword over his shoulder, standing in a torchlit guild drill-yard',
  rogue: 'a sharp-eyed human rogue in dark leathers palming a knife, half in shadow in a dockside alley',
  mage: 'a stern human mage in blue-slate college robes, one hand wreathed in controlled flame, tower library behind',
  priest: 'a solemn human priest in white-and-flame temple vestments holding a censer-mace, marble sanctuary light',
  ranger: 'a weathered human ranger in a hooded travel cloak with a longbow, pine road and distant hills behind',
  bard: 'a grinning human bard mid-verse in a smoky dockside tavern, lute in hand, crowd blurred behind',
  monk: 'a serene human monk in plain grey wraps in a bare stone courtyard, hands folded, breath visible in cold air',
  spellblade: 'a duelist spellblade with glowing sigils cut down the flat of a raised sword, ozone sparks in the air',
  warlock: 'a gaunt human warlock in a deconsecrated chapel, shadows bending toward the pact-marks on their forearms',
  paladin: 'an armored paladin holding a burning storm-lantern high in a dark street, oil-and-scripture vigil regalia',
  necromancer: 'a calm grey-robed necromancer among cemetery bonehouses, pale motes rising from an open reliquary',
  berserker: 'a scarred pit berserker wrapped in chalk and rope-bandages, roaring in a drained cistern fighting pit',
};

async function runClasses() {
  const dir = join(root, 'public', 'classes');
  mkdirSync(dir, { recursive: true });
  let made = 0;
  for (const [k, desc] of Object.entries(CLASS_PROMPTS)) {
    const file = join(dir, `${k}.png`);
    if (existsSync(file)) continue;
    try {
      const buf = await generate(PREFIX(k, `${desc}. Three-quarter portrait, a single centered subject with no text.`));
      writeFileSync(file, buf);
      made++;
      console.log(`  class ${k} (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) { console.log(`  FAILED class ${k}: ${e.message}`); await sleep(2000); }
    await sleep(400);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(files));
  console.log(`classes done: ${made} new, manifest ${files.length}`);
}

// ---- doors & props: painted pieces the corridor composites ----
const DOOR_PROMPTS = {
  bones: 'an open ancient stone doorway in a crypt wall, carved skull motifs on the arch, pure darkness inside the opening',
  slime: 'an open slimy brick doorway in a flooded tunnel wall, green algae dripping from the arch, pure darkness inside the opening',
  flutes: 'an open doorway between two barnacle-crusted fluted stone columns in a sunken temple, pure darkness inside the opening',
  brands: 'an open scorched stone doorway, ritual sigils branded around the frame, faint embers, pure darkness inside the opening',
  rivets: 'an open massive riveted iron vault doorway, cold blue steel frame, pure darkness inside the opening',
  cracks: 'an open heat-cracked stone doorway, melted edges faintly glowing, pure darkness inside the opening',
  runes: 'an open smooth dark stone doorway carved with faint violet glowing runes, pure darkness inside the opening',
  bricks: 'an open weathered brick doorway with a heavy timber lintel, pure darkness inside the opening',
};
const PROP_PROMPTS = {
  chest: 'a closed ancient wooden treasure chest with iron bands and an old lock, slightly glowing highlights',
  'stairs-down': 'worn stone stairs descending into darkness, viewed from above',
  'stairs-up': 'worn stone stairs ascending toward faint daylight',
  shrine: 'a small ancient stone shrine with a single lit candle and melted wax',
  padlock: 'a massive ancient iron padlock with ornate keyhole, faintly glowing',
  key: 'an ornate ancient iron key, faintly glowing',
  spinner: 'a great circular stone disc set into a dungeon floor, carved with worn rotation grooves',
  ring: 'a ring of fused glowing stone set into a dungeon floor, magical shimmer above it',
  mount: 'a sturdy saddled dun horse with travel packs, standing at a stable rail',
  'set-ashgrip': 'a masterwork steel longsword with an ember-ash quenched blade and wyrm-scale wound grip, faintly glowing forge-light on the edge',
  'set-tidewalker': 'a hauberk of sea-cured scale armor, brine-white and blue-grey, drops of seawater beading on it',
  'set-edgesong': 'a duelist\u2019s greatsword with treaty-breaking sigils cut the full length of the blade, humming with faint resonance lines',
  'set-lamplight': 'a brigandine of soot-lacquered plates that drink the light, small lamplighter\u2019s union rivets',
};

async function runProps() {
  const dir = join(root, 'public', 'props');
  mkdirSync(dir, { recursive: true });
  let made = 0;
  for (const [k, desc] of Object.entries(DOOR_PROMPTS)) {
    const file = join(dir, `door-${k}.png`);
    if (existsSync(file)) continue;
    try {
      const buf = await generate(`A dark fantasy game asset: ${desc}. Front view, centered, filling most of the frame, on a completely pure black background. No creatures, no people, no text. The art style is gritty digital painting with moody lighting.`, '2x3');
      writeFileSync(file, buf);
      made++;
      console.log(`  door-${k} (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) { console.log(`  FAILED door-${k}: ${e.message}`); await sleep(2000); }
    await sleep(400);
  }
  for (const [k, desc] of Object.entries(PROP_PROMPTS)) {
    const file = join(dir, `${k}.png`);
    if (existsSync(file)) continue;
    try {
      const buf = await generate(`A dark fantasy game asset icon: ${desc}. Single object, centered, on a completely pure black background. No creatures, no people, no text. The art style is gritty digital painting with moody lighting.`, '1x1');
      writeFileSync(file, buf);
      made++;
      console.log(`  prop ${k} (${Math.round(buf.length / 1024)} KB)`);
    } catch (e) { console.log(`  FAILED prop ${k}: ${e.message}`); await sleep(2000); }
    await sleep(400);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(files));
  console.log(`props done: ${made} new, manifest ${files.length}`);
}

const args = process.argv.slice(2);
const doMonsters = args.length === 0 || args.includes('--monsters');
const doDungeons = args.length === 0 || args.includes('--dungeons');
const doCharacters = args.length === 0 || args.includes('--characters');
const doProps = args.length === 0 || args.includes('--props');
const doClasses = args.length === 0 || args.includes('--classes');
if (doDungeons) await runDungeons();
if (doMonsters) await runMonsters();
if (doCharacters) await runCharacters();
if (doProps) await runProps();
if (doClasses) await runClasses();
console.log('ALL DONE');
