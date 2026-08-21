// Reproduce the campaign-run wedge and autopsy it: what does the
// world look like when the bot orbits the Crypts forever?
import { buildSeedWorld } from '../src/data/seed';
import { Rng } from '../src/engine/rng';
import { autoplayStep, newAutoplayer } from '../src/engine/autoplayer';
import { mainQuests } from '../src/engine/campaign';

const w = buildSeedWorld();
w.masterSeed = 7777;
const rng = new Rng(9999);
const state = newAutoplayer();
const trail = [];
for (let i = 0; i < 30000; i++) {
  const a = autoplayStep(w, state, rng, i);
  trail.push(`${a}@${w.currentDungeon ? `${w.currentRoom}(f${w.dungeons[w.currentDungeon].rooms[w.currentRoom]?.floor})` : w.partyLocation}`);
  if (trail.length > 90) trail.shift();
}
const d = w.dungeons['DUN_OLDQUARTER_001'];
console.log('--- main quests ---');
for (const q of mainQuests(w)) console.log(q.stage, q.title, q.status, JSON.stringify(q.objectives));
console.log('--- dungeon ---');
console.log('bossDefeated:', d.bossDefeated, 'keysHeld:', d.keysHeld);
const boss = Object.values(d.rooms).find((r) => r.isBossRoom);
console.log('boss room:', boss?.id, 'floor', boss?.floor, 'enemies', boss?.enemies, 'encounterKey', boss?.encounterKey, 'connections', JSON.stringify(boss?.connections));
for (const r of Object.values(d.rooms)) {
  if (r.lockedDoor && !r.lockedDoor.opened) console.log('locked door at', r.id, 'f' + r.floor, JSON.stringify(r.lockedDoor));
  if (r.riddleDoor && !r.riddleDoor.opened) console.log('riddle door at', r.id, 'f' + r.floor, 'lore', r.riddleDoor.loreId, 'known:', (w.codex ?? []).includes(r.riddleDoor.loreId));
  if (r.key && !r.key.taken) console.log('key untaken at', r.id, 'f' + r.floor, JSON.stringify(r.key));
}
console.log('secretDoors:', Object.values(d.rooms).filter((r) => r.secretDoor).map((r) => `${r.id}:${JSON.stringify(r.secretDoor)}`));
console.log('--- bot ---');
console.log('at', w.currentDungeon, w.currentRoom, 'target', state.targetDungeon, 'leavingFloor', state.leavingFloor, 'streak', state.wanderStreak);
console.log('trail:', trail.slice(-60).join(' '));
