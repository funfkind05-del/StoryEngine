// The long walk: drive the autoplayer through the ENTIRE first
// campaign (stages 1–8, ending at the Hollow King) and instrument
// everything a designer would want: stage pacing, economy, deaths,
// doom pressure, stalls, and where the hours actually go.
// Run: npx tsx tools/campaignrun.mjs [maxSteps] [outFile]
import { writeFileSync, appendFileSync } from 'node:fs';
import { buildSeedWorld } from '../src/data/seed';
import { Rng } from '../src/engine/rng';
import { autoplayStep, newAutoplayer } from '../src/engine/autoplayer';
import { partyMembers } from '../src/engine/world';
import { mainQuests } from '../src/engine/campaign';
import { trainingCost, levelUpAvailable } from '../src/engine/rules';

const MAX_STEPS = parseInt(process.argv[2] ?? '300000', 10);
const OUT = process.argv[3] ?? '/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad/campaign-run.log';

const w = buildSeedWorld();
w.masterSeed = 7777;
const rng = new Rng(9999);
const state = newAutoplayer();
const actions = {};
const moneyByAction = {};
let lastMoney = w.characters[w.mcId].money;
let trainBlocked = 0;
const stageLog = [];
const trail = [];
let lastStage = 0;
let lastStageStep = 0;
let seenEvents = 0;
const eventCounts = {};
let stallStart = 0;
let worstStall = { steps: 0, at: 0, level: 0 };
let lastXpTotal = 0;

writeFileSync(OUT, `campaign run: max ${MAX_STEPS} steps\n`);

const totalXp = () => partyMembers(w).reduce((s, c) => s + c.xp + c.level * c.level * 100, 0);

let i = 0;
for (; i < MAX_STEPS; i++) {
  const a = autoplayStep(w, state, rng, i);
  actions[a] = (actions[a] ?? 0) + 1;
  trail.push(`${a}@${w.currentDungeon ? `${w.currentRoom}(f${w.dungeons[w.currentDungeon].rooms[w.currentRoom]?.floor ?? '?'})` : w.partyLocation}`);
  if (trail.length > 80) trail.shift();
  const mc = w.characters[w.mcId];
  const dm = mc.money - lastMoney;
  moneyByAction[a] = (moneyByAction[a] ?? 0) + dm;
  lastMoney = mc.money;
  if (partyMembers(w).some((c) => levelUpAvailable(c)) && mc.money < trainingCost(mc.level)) trainBlocked++;

  // stalls
  const xt = totalXp();
  if (xt > lastXpTotal) { lastXpTotal = xt; stallStart = i; }
  else if (i - stallStart > worstStall.steps) worstStall = { steps: i - stallStart, at: stallStart, level: mc.level };
  if (i - stallStart > 8000) {
    appendFileSync(OUT, `\n=== WEDGE AUTOPSY at step ${i} (no xp since ${stallStart}) ===\n`);
    appendFileSync(OUT, `bot: at ${w.currentDungeon ?? w.partyLocation} room ${w.currentRoom} target ${state.targetDungeon} leavingFloor ${state.leavingFloor} streak ${state.wanderStreak}\n`);
    appendFileSync(OUT, `party: ${partyMembers(w).map((c) => `${c.name} L${c.level} hp${c.hp.current}/${c.hp.max} sta${c.stamina.current} mana${c.mana.current} fat${Math.round(c.needs.fatigue)} hun${Math.round(c.needs.hunger)}`).join(' | ')}\n`);
    appendFileSync(OUT, `quests: ${Object.values(w.quests).filter((q) => q.status === 'active' || q.status === 'ready').map((q) => `${q.title}:${q.status}`).join('; ')}\n`);
    if (w.currentDungeon) {
      const d = w.dungeons[w.currentDungeon];
      const boss = Object.values(d.rooms).find((r) => r.isBossRoom);
      appendFileSync(OUT, `dungeon ${d.id} bossDefeated ${d.bossDefeated} boss ${boss?.id} f${boss?.floor} enemies ${boss?.enemies} keysHeld ${JSON.stringify(d.keysHeld)}\n`);
      for (const r of Object.values(d.rooms)) {
        if (r.lockedDoor && !r.lockedDoor.opened) appendFileSync(OUT, ` locked ${r.id} f${r.floor} ${JSON.stringify(r.lockedDoor)}\n`);
        if (r.riddleDoor && !r.riddleDoor.opened) appendFileSync(OUT, ` riddle ${r.id} f${r.floor} lore ${r.riddleDoor.loreId} known ${(w.codex ?? []).includes(r.riddleDoor.loreId)}\n`);
        if (r.secretDoor && !r.secretDoor.discovered) appendFileSync(OUT, ` secret ${r.id} f${r.floor} -> ${r.secretDoor.to}\n`);
      }
    }
    appendFileSync(OUT, `trail: ${trail.join(' ')}\n`);
    break;
  }

  // new events of interest
  for (; seenEvents < w.events.length; seenEvents++) {
    const e = w.events[seenEvents];
    eventCounts[e.kind] = (eventCounts[e.kind] ?? 0) + 1;
    if (['campaign.revelation', 'campaign.offered', 'campaign.complete', 'doom', 'party.defeated', 'character.death', 'dungeon.conquered'].includes(e.kind)) {
      appendFileSync(OUT, `  [step ${i} day ${w.time.day} L${mc.level}] ${e.kind}: ${e.summary.slice(0, 140)}\n`);
    }
  }

  // stage transitions
  const done = mainQuests(w).filter((q) => q.status === 'completed');
  const stage = done.length ? Math.max(...done.map((q) => q.stage ?? 0)) : 0;
  if (stage > lastStage) {
    stageLog.push({ stage, step: i, day: w.time.day, level: mc.level, money: mc.money, stepsTaken: i - lastStageStep });
    appendFileSync(OUT, `STAGE ${stage} COMPLETE — step ${i}, day ${w.time.day}, L${mc.level}, ${mc.money}c (${i - lastStageStep} steps since last)\n`);
    lastStage = stage;
    lastStageStep = i;
  }
  if (stage >= 8) { appendFileSync(OUT, `FIRST CAMPAIGN COMPLETE at step ${i}\n`); break; }

  if (i % 5000 === 0) {
    appendFileSync(OUT, `step ${i} · day ${w.time.day} · L${mc.level} (${mc.xp}xp) · ${mc.money}c · stage ${stage} · doom ${w.doom?.stage ?? 0} · party ${partyMembers(w).length} · at ${w.currentDungeon ?? w.partyLocation}\n`);
  }
}

const mc = w.characters[w.mcId];
const report = {
  finished: lastStage >= 8,
  steps: i,
  day: w.time.day,
  level: mc.level,
  money: mc.money,
  stages: stageLog,
  doom: w.doom ?? null,
  trainBlockedShare: +(trainBlocked / Math.max(1, i)).toFixed(3),
  worstStall,
  party: partyMembers(w).map((c) => `${c.name} L${c.level} hp${c.hp.max} ${c.charClass}${c.ascension ? ' asc:' + c.ascension : ''}${c.calling ? ' call:' + c.calling : ''}`),
  bosses: Object.values(w.dungeons).filter((d) => d.bossDefeated).map((d) => d.name),
  topActions: Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 16),
  moneyByAction: Object.entries(moneyByAction).filter(([, v]) => v !== 0).sort((a, b) => a[1] - b[1]),
  notableEvents: Object.fromEntries(Object.entries(eventCounts).filter(([k]) => ['party.defeated', 'character.death', 'doom', 'quest.late', 'hearth.cooling', 'poorrelief', 'campaign.revelation', 'want.offered', 'want.fulfilled', 'spell.field', 'trophy'].includes(k))),
  questStates: Object.values(w.quests).reduce((m, q) => { m[q.status] = (m[q.status] ?? 0) + 1; return m; }, {}),
  mcAbilities: mc.abilities.length,
  mcTitle: mc.title ?? null,
};
appendFileSync(OUT, '\n=== FINAL REPORT ===\n' + JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ finished: report.finished, steps: i, day: w.time.day, level: mc.level, stages: stageLog.length }, null, 1));
