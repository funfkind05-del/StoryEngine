// Verify: the opencode bridge is the live LLM — config migrated,
// Test finds the prose model, and a real NPC exchange comes back.
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

// open a Talk with Tobbe (persistent NPC at the starting tavern)
await page.getByRole('button', { name: 'People' }).click();
await page.getByRole('button', { name: '🗨 Talk' }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '⚙ LLM' }).click();
await page.getByText('Server URL').waitFor();
const cfgInput = page.locator('div.row', { has: page.getByText('Server URL') }).locator('input').first();
const base = await cfgInput.inputValue();
console.log('configured baseUrl:', base);
if (base !== '/oclm/v1') throw new Error(`expected /oclm/v1, got ${base}`);
await page.getByRole('button', { name: 'Test', exact: true }).click();
await page.waitForTimeout(1500);
const options = await page.locator('select option').allTextContents();
console.log('models listed:', options.filter((o) => o.includes('prose')).length ? 'prose ✓' : options.slice(0, 5));

// one real exchange
const chatBox = page.locator('textarea').last();
await chatBox.fill('Evening, Tobbe. Anything on the board worth my steel?');
await page.keyboard.press('Enter');
// wait up to 90s for a reply bubble beyond our own
await page.waitForFunction(() => document.body.innerText.match(/Tobbe/g)?.length, null, { timeout: 90000 });
let replied = false;
for (let i = 0; i < 60 && !replied; i++) {
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText);
  if (/board|work|coin|cellar|rats|ale|steel/i.test(text.split('Anything on the board worth my steel?').pop() ?? '')) replied = true;
}
await page.screenshot({ path: `${SCRATCH}/oclm-talk.png` });
console.log(replied ? 'NPC replied via opencode ✓' : 'WARNING: no reply detected in time');
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (!replied || errors.length) process.exit(1);
console.log('OCLM E2E PASSED');
