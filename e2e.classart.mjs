// Verify: class portrait in the New Game card, set-piece art at the Forge.
import { chromium } from 'playwright';
const SCRATCH = '/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText('The Broken Crown', { exact: true }).first().waitFor();

// Saves panel → New Game card → pick berserker
await page.getByRole('button', { name: 'Saves' }).click();
await page.getByText('And who is Kael?').waitFor();
await page.locator('select').filter({ has: page.locator('option[value="berserker"]') }).first().selectOption('berserker');
await page.waitForTimeout(400);
const classImg = page.locator('img[src="/classes/berserker.png"]');
if (!(await classImg.count())) throw new Error('no berserker class portrait rendered');
await classImg.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
console.log('class portrait in New Game card ✓');
await page.screenshot({ path: `${SCRATCH}/classart-newgame.png` });

// Forge: set card art
const notYet = page.getByRole('button', { name: 'Not yet' });
await page.getByRole('button', { name: 'Location' }).click();
for (const dest of ['Ratcatcher Lane', 'Ironmarket Square', 'Harrow’s Forge']) {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(120);
  if (await notYet.isVisible().catch(() => false)) await notYet.click();
}
await page.getByText('Set patterns worked here').waitFor();
const setImg = await page.locator('img[src="/props/set-ashgrip.png"]').count();
if (!setImg) throw new Error('no Ashgrip set art rendered');
console.log('set-piece art on crafting card ✓');
await page.screenshot({ path: `${SCRATCH}/classart-forge.png` });

console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('CLASSART E2E PASSED');
