// E2E: play a short session, then outline it into scene stubs.
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
// play: cross the city, enter the crypts, find and win a fight
for (const dest of ['Ratcatcher Lane', 'Ironmarket Square', 'Cemetery District', 'Abandoned Mausoleum']) {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(100);
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
  await page.waitForTimeout(50);
}
if (!fought) throw new Error('no encounter');
await page.locator('.encounter-banner').getByRole('button', { name: '⚔ Fight' }).click();
for (let r = 0; r < 40; r++) {
  const btn = page.getByRole('button', { name: /Resolve Round/ });
  if (!(await btn.isVisible().catch(() => false))) break;
  await btn.click();
  await page.waitForTimeout(100);
}
const takeAll = page.getByRole('button', { name: 'Take all' });
if (await takeAll.isVisible().catch(() => false)) await takeAll.click();
await page.getByRole('button', { name: 'Close', exact: true }).click();
await page.waitForTimeout(200);
// outline the session
await page.getByRole('button', { name: /Outline from play/ }).click();
try {
  await page.locator('.modal-head').waitFor({ timeout: 8000 });
} catch (e) {
  console.log('modal never appeared; page errors so far:', errors);
  throw e;
}
const beatCards = await page.locator('.modal .card').count();
if (beatCards < 2) throw new Error(`expected >=2 beats, got ${beatCards}`);
await page.screenshot({ path: `${SCRATCH}/outline-modal.png` });
const sceneCountBefore = await page.locator('.scene-item').count();
await page.getByRole('button', { name: /Create \d+ scene stub/ }).click();
await page.waitForTimeout(300);
const sceneCountAfter = await page.locator('.scene-item').count();
if (sceneCountAfter <= sceneCountBefore) throw new Error('no scene stubs created');
// the selected stub carries the outline block and Draft Scene picks it up
const text = await page.locator('.prose-editor').inputValue();
if (!text.includes('[OUTLINE]')) throw new Error('stub missing outline block');
await page.getByRole('button', { name: '🪶 Draft scene…' }).click();
const outlineVal = await page.locator('.draft-outline').inputValue();
if (!outlineVal.includes('-')) throw new Error('draft box did not prefill from outline');
console.log(`beats: ${beatCards} · stubs: ${sceneCountAfter - sceneCountBefore} · draft prefilled ✓`);
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('OUTLINE E2E PASSED');
