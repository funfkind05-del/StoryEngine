// E2E smoke: buy potions, cross the city, prep screen, enter the
// dungeon, explore to an encounter, fight it round by round, take the
// loot, copy the combat to prose, and run the continuity checker.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad';
const shot = (page, name) => page.screenshot({ path: `${SCRATCH}/${name}.png` });

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());

await page.goto('http://localhost:5173');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText('The Broken Crown', { exact: true }).first().waitFor();

const dodgeEncounter = async () => {
  const notYet = page.getByRole('button', { name: 'Not yet' });
  if (await notYet.isVisible().catch(() => false)) await notYet.click();
};
const go = async (dest) => {
  await page.getByRole('button', { name: `→ ${dest}` }).click();
  await page.waitForTimeout(120);
  await dodgeEncounter();
};

// --- shopping trip: Broken Crown -> Ratcatcher -> Ironmarket -> Petra's Physic
await go('Ratcatcher Lane');
await go('Ironmarket Square');
await go('Petra’s Physic');
const buyButtons = page.locator('.panel-body .row', { hasText: 'Minor Healing Potion' }).getByRole('button');
await buyButtons.first().click();
await page.waitForTimeout(100);
console.log('bought a potion');

// --- to the mausoleum
await go('Ironmarket Square');
await go('Cemetery District');
await go('Abandoned Mausoleum');

// --- adventure preparation screen
await page.getByRole('button', { name: 'Enter Dungeon…' }).click();
await page.getByText('Estimated difficulty').waitFor();
await shot(page, 'e2e-prep');
await page.getByRole('button', { name: 'ENTER DUNGEON', exact: true }).click();
await page.getByText('Crypts of Saint Varro').first().waitFor();
console.log('entered dungeon via prep screen');

// --- explore until an encounter is available
let fought = false;
for (let i = 0; i < 80 && !fought; i++) {
  const fightBtn = page.getByRole('button', { name: /ENCOUNTER AVAILABLE/ });
  if (await fightBtn.isVisible().catch(() => false)) {
    await fightBtn.click();
    fought = true;
    break;
  }
  const enabled = await page.locator('.compass button:enabled').all();
  if (!enabled.length) throw new Error('no enabled moves');
  await enabled[Math.floor(Math.random() * enabled.length)].click();
  await page.waitForTimeout(60);
}
if (!fought) throw new Error('never found an encounter');
console.log('encounter generated');
await shot(page, 'e2e-encounter');

// --- start combat from the banner
await page.locator('.encounter-banner').getByRole('button', { name: '⚔ Fight' }).click();
await page.locator('.modal-head').waitFor();

// --- resolve rounds until a terminal outcome
for (let round = 0; round < 40; round++) {
  const resolveBtn = page.getByRole('button', { name: /Resolve Round/ });
  if (!(await resolveBtn.isVisible().catch(() => false))) break;
  await resolveBtn.click();
  await page.waitForTimeout(120);
}
const outcome = await page.locator('.modal-head .tag').textContent();
console.log('combat outcome:', outcome);
await shot(page, 'e2e-combat-end');

// --- loot & prose
const takeAll = page.getByRole('button', { name: 'Take all' });
if (await takeAll.isVisible().catch(() => false)) await takeAll.click();
await page.getByRole('button', { name: 'Copy combat to prose' }).click();
await page.getByRole('button', { name: 'Close', exact: true }).click();
await page.waitForTimeout(200);
console.log('loot + prose copied');

// --- verify the prose landed in the scene text
const text = await page.locator('.prose-editor').inputValue();
if (!/damage|missed|over|retreat|dark/i.test(text)) throw new Error('no combat prose in scene');
console.log('prose draft present in scene ✓');

// --- party panel should show XP / possibly LEVEL AVAILABLE
await page.getByRole('button', { name: 'Party', exact: true }).click();
const partyText = await page.locator('.panel-body').textContent();
if (!/xp/i.test(partyText)) throw new Error('party panel missing XP');
console.log('party panel ok', /LEVEL AVAILABLE/.test(partyText) ? '(level available!)' : '');
await shot(page, 'e2e-party');

// --- continuity check
await page.getByRole('button', { name: 'Continuity' }).click();
await page.getByRole('button', { name: 'Check all scenes' }).click();
await page.waitForTimeout(200);
await shot(page, 'e2e-final');

// --- events panel shows the combat events
await page.getByRole('button', { name: 'Events', exact: true }).click();
const evText = await page.locator('.panel-body').textContent();
if (!evText.includes('combat.end')) throw new Error('combat.end event missing from log');
if (!evText.includes('shop.buy')) throw new Error('shop.buy event missing from log');
console.log('event log has combat.end and shop.buy ✓');

console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('E2E PASSED');
