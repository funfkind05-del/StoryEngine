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

// money tracker visible with MC purse (Kael starts at 90c = 9s)
const tracker = page.locator('.money-tracker');
const before = await tracker.textContent();
console.log('tracker before:', before.trim());
if (!/9s/.test(before)) throw new Error('tracker missing MC purse');
if (!/party/.test(before)) throw new Error('tracker missing party total');

// travel and check the prose got the sentence with the token
await page.getByRole('button', { name: '→ Ratcatcher Lane' }).click();
await page.waitForTimeout(200);
const text = await page.locator('.prose-editor').inputValue();
if (!text.includes('@[Ratcatcher Lane](LOC_RATCATCHER)')) throw new Error('travel sentence not inserted: ' + text.slice(-200));
console.log('inserted:', text.trim().split('\n').pop());

// tracker click opens inventory panel
await tracker.click();
await page.getByText('Party supplies (shared)').waitFor();
console.log('tracker click → inventory panel ✓');
await page.screenshot({ path: `${SCRATCH}/money-travel.png` });
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('PASSED');
