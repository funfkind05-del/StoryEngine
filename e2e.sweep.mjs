// Detail sweep: screenshot every major surface for critical review.
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
const shot = (n) => page.screenshot({ path: `${SCRATCH}/sweep-${n}.png` });

for (const p of ['Quests', 'Party', 'Inventory', 'People', 'Muse', 'Bonds', 'Timeline', 'Home', 'Events']) {
  await page.getByRole('button', { name: p, exact: true }).click();
  await page.waitForTimeout(250);
  await shot(p.toLowerCase());
}
// play mode
await page.getByRole('button', { name: /Play/ }).first().click();
await page.waitForTimeout(300);
await shot('playmode');
// combat: provoke a fight via encounter? use fight pit? Skip - combat covered elsewhere.
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('SWEEP DONE');
