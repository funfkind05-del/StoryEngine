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
const notYet = page.getByRole('button', { name: 'Not yet' });
for (const dest of ['Ratcatcher Lane', 'Ironmarket Square', 'Cemetery District', 'Abandoned Mausoleum']) {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(120);
  if (await notYet.isVisible().catch(() => false)) await notYet.click();
}
await page.getByRole('button', { name: 'Enter Dungeon…' }).click();
await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
let fought = false;
for (let i = 0; i < 80 && !fought; i++) {
  const fightBtn = page.getByRole('button', { name: /ENCOUNTER AVAILABLE/ });
  if (await fightBtn.isVisible().catch(() => false)) { await fightBtn.click(); fought = true; break; }
  const enabled = await page.locator('.compass button:enabled').all();
  await enabled[Math.floor(Math.random() * enabled.length)].click();
  await page.waitForTimeout(60);
}
if (!fought) throw new Error('no encounter found');
// override to a rich mix so several plates show
await page.getByRole('button', { name: 'Override…' }).click();
const setCount = async (name, n) => {
  const row = page.locator('.encounter-banner .row', { hasText: name }).first();
  await row.locator('input').fill(String(n));
};
await setCount('Giant Rat (', 1);
await setCount('Skeleton (', 1);
await setCount('Ghoul (', 1);
await setCount('Crypt Warden (', 1);
await page.getByRole('button', { name: 'Apply override (logged)' }).click();
const plates = await page.locator('.encounter-banner .monster-portrait').count();
if (plates < 4) throw new Error(`expected 4 banner plates, got ${plates}`);
await page.screenshot({ path: `${SCRATCH}/art-banner.png` });
await page.locator('.encounter-banner').getByRole('button', { name: /Fight/ }).click();
await page.locator('.modal-head').waitFor();
const cardPlates = await page.locator('.modal .monster-portrait').count();
if (cardPlates < 4) throw new Error(`expected 4 combat plates, got ${cardPlates}`);
await page.getByRole('button', { name: /Resolve Round/ }).click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${SCRATCH}/art-combat.png` });
console.log('plates: banner', plates, '· combat', cardPlates);
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('ART E2E PASSED');
