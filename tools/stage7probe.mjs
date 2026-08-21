// Isolate stage 7: leveled party, campaign at the Wyrmspire, 4000 bot
// steps — then autopsy what the bot actually did and what blocked it.
import { buildSeedWorld } from '../src/data/seed';
import { Rng } from '../src/engine/rng';
import { autoplayStep, newAutoplayer } from '../src/engine/autoplayer';
import { applyTraining } from '../src/engine/rules';
import { partyMembers } from '../src/engine/world';
import { mainQuests, advanceCampaign } from '../src/engine/campaign';
import { acceptQuest } from '../src/engine/quests';

const w = buildSeedWorld();
for (const id of ['CHAR_LYRA', 'CHAR_MARA', 'CHAR_YVENNE', 'CHAR_KESS']) {
  const c = w.characters[id];
  if (c) { c.inParty = true; c.location = w.partyLocation; c.persistent = true; }
}
for (const c of partyMembers(w)) {
  while (c.level < 38) { c.xp = 99_999_999; applyTraining(c); }
  c.hp.current = c.hp.max; c.mana.current = c.mana.max; c.stamina.current = c.stamina.max;
}
w.characters[w.mcId].money = 30000;
// walk the campaign to stage 7 (mark 1..6 done, offer 7)
for (let st = 1; st <= 6; st++) {
  const q = mainQuests(w).find((x) => x.stage === st) ?? mainQuests(w)[0];
  if (q) { q.status = 'completed'; advanceCampaign(w, q); }
}
const st7 = mainQuests(w).find((q) => q.stage === 7);
console.log('stage 7 offered at:', st7?.giverLocation, st7?.status);
// bosses of stages 1-6 are 'defeated' so target selection matches a real run
for (const dunId of ['DUN_OLDQUARTER_001', 'DUN_DOCKWARD_001', 'DUN_OLDQUARTER_002', 'DUN_IRONMARKET_001', 'DUN_DOCKWARD_002', 'DUN_HARBOR_001']) {
  if (w.dungeons[dunId]) w.dungeons[dunId].bossDefeated = true;
}
const rng = new Rng(777);
const state = newAutoplayer();
const actions = {};
const trail = [];
for (let i = 0; i < 4000; i++) {
  const a = autoplayStep(w, state, rng, i);
  actions[a] = (actions[a] ?? 0) + 1;
  trail.push(`${a}@${w.currentDungeon ? `${w.currentRoom}(f${w.dungeons[w.currentDungeon].rooms[w.currentRoom]?.floor ?? '?'})` : w.partyLocation}`);
  if (trail.length > 60) trail.shift();
  const done = mainQuests(w).find((q) => q.stage === 7)?.status;
  if (done === 'completed') { console.log(`STAGE 7 COMPLETE at step ${i}, day ${w.time.day}`); break; }
}
console.log('final stage7:', mainQuests(w).find((q) => q.stage === 7)?.status, 'day', w.time.day);
console.log('actions:', Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' '));
const d = w.dungeons['DUN_HIGHCOURT_001'];
if (d?.generated) {
  const boss = Object.values(d.rooms).find((r) => r.isBossRoom);
  console.log('wyrmspire bossDefeated', d.bossDefeated, 'boss', boss?.id, 'f' + boss?.floor, boss?.enemies, 'keysHeld', JSON.stringify(d.keysHeld));
  for (const r of Object.values(d.rooms)) {
    if (r.lockedDoor && !r.lockedDoor.opened) console.log(' locked', r.id, 'f' + r.floor, JSON.stringify(r.lockedDoor));
    if (r.riddleDoor && !r.riddleDoor.opened) console.log(' riddle', r.id, 'f' + r.floor, r.riddleDoor.loreId, 'known', (w.codex ?? []).includes(r.riddleDoor.loreId), 'guessedToday', r.riddleDoor.lastGuessDay === w.time.day);
  }
} else console.log('wyrmspire never generated/entered!');
console.log('bot target', state.targetDungeon, 'sweepDone', JSON.stringify(state.sweepDoneDay));
console.log('trail:', trail.slice(-40).join(' '));
