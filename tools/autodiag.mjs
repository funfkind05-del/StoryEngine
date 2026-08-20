// Diagnostic: drive the autoplayer and sample the economy — where does
// the money go, and what blocks training? Run: npx tsx tools/autodiag.mjs
import { buildSeedWorld } from '../src/data/seed';
import { Rng } from '../src/engine/rng';
import { autoplayStep, newAutoplayer } from '../src/engine/autoplayer';
import { trainingCost, levelUpAvailable } from '../src/engine/rules';
import { partyMembers } from '../src/engine/world';

const STEPS = parseInt(process.env.DIAG_STEPS ?? '12000', 10);
const w = buildSeedWorld();
w.masterSeed = 5000;
const rng = new Rng(70000);
const state = newAutoplayer();
const actions = {};
const moneyByAction = {};
let trainBlockedSteps = 0;
let moneyIn = 0, moneyOut = 0, lastMoney = w.characters[w.mcId].money;

for (let i = 0; i < STEPS; i++) {
  const a = autoplayStep(w, state, rng, i);
  actions[a] = (actions[a] ?? 0) + 1;
  const mc = w.characters[w.mcId];
  const dm = mc.money - lastMoney;
  if (dm > 0) moneyIn += dm; else moneyOut -= dm;
  moneyByAction[a] = (moneyByAction[a] ?? 0) + dm;
  lastMoney = mc.money;
  if (levelUpAvailable(mc) && mc.money < trainingCost(mc.level)) trainBlockedSteps++;
  if (i % 1000 === 0) {
    const bag = mc.inventory.map((iid) => w.items[iid]).filter(Boolean);
    const unequippedValue = bag.filter((it) => !it.equippedBy && it.kind !== 'potion').reduce((n, it) => n + it.value * (it.qty ?? 1), 0);
    console.log(`step ${i} day ${w.time.day} L${mc.level} xp ${mc.xp} money ${mc.money} trainCost ${trainingCost(mc.level)} bagValue ${unequippedValue} target ${state.targetDungeon ?? '-'}`);
  }
}
const mc = w.characters[w.mcId];
console.log('---');
console.log(`final: L${mc.level} xp ${mc.xp} money ${mc.money} day ${w.time.day}`);
console.log(`quests done: ${Object.values(w.quests).filter((q) => q.status === 'completed').length}`);
console.log(`bosses: ${Object.values(w.dungeons).filter((d) => d.bossDefeated).length}`);
console.log(`money in ${moneyIn} out ${moneyOut}`);
console.log(`train-blocked steps: ${trainBlockedSteps}/${STEPS}`);
console.log('money by action:', Object.entries(moneyByAction).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('actions:', Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}:${v}`).join(' '));
const bag = mc.inventory.map((iid) => w.items[iid]).filter(Boolean);
console.log('final bag:', bag.map((it) => `${it.name}${it.equippedBy ? '*' : ''}(${it.value})`).join(', '));
console.log('party:', partyMembers(w).map((c) => `${c.name} L${c.level} xp${c.xp}`).join(' · '));
