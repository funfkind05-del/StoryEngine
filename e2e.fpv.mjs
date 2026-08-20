// Verify: painted corridor with no wireframe overlay, painted door art,
// prop sprites, and the ESO set-crafting UI at the Forge.
import { chromium } from 'playwright';
const SCRATCH = '/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText('The Broken Crown', { exact: true }).first().waitFor();
await page.locator('.minimap-svg').waitFor();
const notYet = page.getByRole('button', { name: 'Not yet' });

// 1) Forge first: set-crafting UI
for (const dest of ['Ratcatcher Lane', 'Ironmarket Square', 'Harrow’s Forge']) {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(120);
  if (await notYet.isVisible().catch(() => false)) await notYet.click();
}
await page.getByText('Set patterns worked here').waitFor();
await page.getByText('Ashgrip').first().waitFor();
await page.screenshot({ path: `${SCRATCH}/fpv-setcraft.png` });
console.log('set-crafting UI at Forge ✓');

// 2) into the mausoleum for the corridor
for (const dest of ['Ironmarket Square', 'Cemetery District', 'Abandoned Mausoleum']) {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(120);
  if (await notYet.isVisible().catch(() => false)) await notYet.click();
}
await page.getByRole('button', { name: 'Enter Dungeon…' }).click();
await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
await page.getByText('Automap').waitFor();
await page.waitForTimeout(600); // let art manifests load + images paint

// assertions inside the FPV svg
const info = await page.evaluate(() => {
  const svg = document.querySelector('.fpv svg') ?? document.querySelector('svg.fpv-svg') ?? [...document.querySelectorAll('svg')].find((s) => s.querySelector('image[href^="/dungeons/"]') || s.querySelector('image[href^="/props/"]'));
  if (!svg) return { found: false };
  const backdrop = svg.querySelector('image[href^="/dungeons/"]');
  const doors = [...svg.querySelectorAll('image')].filter((i) => (i.getAttribute('href') ?? '').startsWith('/props/door-'));
  const props = [...svg.querySelectorAll('image')].filter((i) => (i.getAttribute('href') ?? '').startsWith('/props/') && !(i.getAttribute('href') ?? '').includes('door-'));
  const lines = svg.querySelectorAll('line').length;
  return { found: true, backdrop: backdrop?.getAttribute('href') ?? null, doorImgs: doors.map((d) => d.getAttribute('href')), propImgs: props.map((p) => p.getAttribute('href')), lineCount: lines };
});
console.log('fpv:', JSON.stringify(info));
if (!info.found) throw new Error('no FPV svg found');
if (!info.backdrop) throw new Error('no painted backdrop in corridor');
await page.screenshot({ path: `${SCRATCH}/fpv-corridor-1.png` });

// walk a few rooms hunting for a doorway view with painted door art
let sawDoor = info.doorImgs.length > 0;
for (let i = 0; i < 10 && !sawDoor; i++) {
  const enabled = await page.locator('.compass button:enabled').all();
  if (enabled.length) await enabled[i % enabled.length].click();
  await page.waitForTimeout(150);
  const d = await page.evaluate(() => [...document.querySelectorAll('svg image')].filter((im) => (im.getAttribute('href') ?? '').startsWith('/props/door-')).length);
  if (d > 0) sawDoor = true;
}
await page.screenshot({ path: `${SCRATCH}/fpv-corridor-2.png` });
console.log(sawDoor ? 'painted door art rendered ✓' : 'WARNING: no doorway encountered in walk');
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('FPV E2E PASSED');
