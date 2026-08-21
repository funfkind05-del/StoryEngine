// Capture a live combat for critical review.
import { chromium } from 'playwright';
const SCRATCH = '/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.goto('http://localhost:5173');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText('The Broken Crown', { exact: true }).first().waitFor();
const notYet = page.getByRole('button', { name: 'Not yet' });
for (const dest of ['Ratcatcher Lane', 'Ironmarket Square', 'Cemetery District', 'Abandoned Mausoleum']) {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(120);
  if (await notYet.isVisible().catch(() => false)) await notYet.click();
}
await page.getByRole('button', { name: 'Enter Dungeon…' }).click();
await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
await page.getByText('Automap').waitFor();
// walk until a fight offers, then take it
let fought = false;
for (let i = 0; i < 25 && !fought; i++) {
  const fight = page.getByRole('button', { name: /Fight/ }).first();
  if (await fight.isVisible().catch(() => false)) {
    await fight.click();
    await page.waitForTimeout(400);
    if (await page.locator('.modal .combat-grid').isVisible().catch(() => false)) { fought = true; break; }
  }
  const enabled = await page.locator('.compass button:enabled').all();
  if (enabled.length) await enabled[i % enabled.length].click();
  await page.waitForTimeout(150);
}
if (!fought) throw new Error('no fight found');
await page.screenshot({ path: `${SCRATCH}/fight-round1.png` });
// take one attack action
const atk = page.getByRole('button', { name: /Attack/ }).first();
if (await atk.isVisible().catch(() => false)) await atk.click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SCRATCH}/fight-round2.png` });
console.log('FIGHT CAPTURED');
await browser.close();
