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

// click Ratcatcher Lane on the minimap itself (adjacent → travels)
await page.locator('.minimap-svg g', { has: page.locator('title', { hasText: 'Ratcatcher Lane' }) }).click();
await page.waitForTimeout(200);
const notYet = page.getByRole('button', { name: 'Not yet' });
if (await notYet.isVisible().catch(() => false)) await notYet.click();
const crumb = await page.locator('.topbar .crumb').textContent();
if (!crumb.includes('Ratcatcher Lane')) throw new Error('minimap travel failed: ' + crumb);
console.log('minimap click-to-travel ✓');
await page.screenshot({ path: `${SCRATCH}/map-city.png` });

// walk to the mausoleum and enter the dungeon to see the automap
for (const dest of ['Ironmarket Square', 'Cemetery District', 'Abandoned Mausoleum']) {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(120);
  if (await notYet.isVisible().catch(() => false)) await notYet.click();
}
await page.getByRole('button', { name: 'Enter Dungeon…' }).click();
await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
await page.getByText('Automap').waitFor();
// move a couple of rooms so the automap has content
for (let i = 0; i < 4; i++) {
  const enabled = await page.locator('.compass button:enabled').all();
  if (enabled.length) await enabled[Math.floor(Math.random() * enabled.length)].click();
  await page.waitForTimeout(80);
}
await page.screenshot({ path: `${SCRATCH}/map-dungeon.png` });
console.log('automap rendered ✓');
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('MAP E2E PASSED');
