// E2E for the LLM features with a MOCKED model server (Playwright
// route interception) — proves the full UI loop without LM Studio:
// NPC conversation → memory, prose→sim proposals, and polish.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// ---- mock the OpenAI-compatible server ----
await page.route('**/llm/v1/models', (route) =>
  route.fulfill({ json: { data: [{ id: 'gemma-3-27b-it' }] } }),
);
await page.route('**/llm/v1/chat/completions', async (route) => {
  const body = route.request().postDataJSON();
  const system = body.messages.find((m) => m.role === 'system')?.content ?? '';
  let content = '';
  if (system.includes('line editor')) {
    content = 'POLISHED: ' + body.messages[body.messages.length - 1].content;
  } else if (system.includes('structured simulation actions')) {
    content = JSON.stringify([
      { kind: 'spend_money', character: 'Kael', copper: 20, reason: 'a storm lantern' },
      { kind: 'take_item', character: 'Kael', item: 'Storm Lantern' },
    ]);
  } else if (system.includes('Summarize the conversation')) {
    content = 'Kael asked Mara about the Red Knives and she deflected with a joke.\n2';
  } else {
    content = '*She looks you over, unhurried.* "Buying me a drink first, or just wasting my evening?"';
  }
  await route.fulfill({ json: { choices: [{ message: { content } }] } });
});

await page.goto('http://localhost:5173');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText('The Broken Crown', { exact: true }).first().waitFor();

// ---- 1) NPC conversation ----
await page.locator('.panel-body .card', { hasText: 'Mara Venn' }).getByRole('button', { name: '🗨 Talk' }).click();
await page.getByPlaceholder('Kael says…').fill('Evening. I hear you know who runs this lane.');
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.getByText('wasting my evening').waitFor();
console.log('NPC replied in character ✓');
await page.screenshot({ path: `${SCRATCH}/llm-talk.png` });
await page.getByRole('button', { name: 'Copy to scene' }).click();
await page.getByRole('button', { name: 'End & remember' }).click();
await page.waitForFunction(() => {
  const raw = localStorage.getItem('storyengine.project.v1');
  return raw && JSON.parse(raw).events.some((e) => e.kind === 'conversation');
}, { timeout: 10000 });
const world1 = await page.evaluate(() => JSON.parse(localStorage.getItem('storyengine.project.v1')));
const mara = world1.characters['CHAR_MARA'];
if (!mara.memories.some((m) => m.event.includes('deflected with a joke'))) throw new Error('NPC memory missing');
if (!world1.events.some((e) => e.kind === 'conversation')) throw new Error('conversation event missing');
console.log('conversation → NPC memory + logged event ✓');

// ---- 2) prose → sim (approval flow) ----
const editor = page.locator('.prose-editor');
await editor.click();
await editor.press('Control+End');
await editor.pressSequentially(' Kael bought a storm lantern from a dockside vendor for twenty copper.');
await page.getByRole('button', { name: '⇄ Sync → sim' }).click();
await page.getByText('Proposed simulation actions').waitFor();
await page.screenshot({ path: `${SCRATCH}/llm-sync.png` });
await page.getByRole('button', { name: 'Apply approved' }).click();
await page.getByText('acquired Storm Lantern').waitFor();
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.waitForFunction(() => {
  const raw = localStorage.getItem('storyengine.project.v1');
  return raw && JSON.parse(raw).events.some((e) => e.kind === 'prose.sync.spend_money');
}, { timeout: 10000 });
const world2 = await page.evaluate(() => JSON.parse(localStorage.getItem('storyengine.project.v1')));
const kael = world2.characters['CHAR_KAEL'];
if (kael.money !== 70) throw new Error(`expected 70c after lantern, got ${kael.money}`);
if (!kael.inventory.some((i) => world2.items[i]?.name === 'Storm Lantern')) throw new Error('lantern not in inventory');
if (!world2.events.some((e) => e.kind === 'prose.sync.spend_money' && e.authorOverride)) throw new Error('sync event not attributed');
console.log('prose → approved sim actions (money 90→70, lantern added, events logged) ✓');

// ---- 3) polish suggestion ----
await page.getByRole('button', { name: '✨ Polish' }).click();
await page.getByText('Polish suggestion').waitFor();
await page.getByRole('button', { name: 'Accept', exact: true }).click();
await page.waitForTimeout(300);
const text = await editor.inputValue();
if (!text.includes('POLISHED:')) throw new Error('polish not applied');
console.log('polish suggest → accept ✓');
await page.screenshot({ path: `${SCRATCH}/llm-final.png` });

console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('LLM E2E PASSED');
