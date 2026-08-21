// Catch the bimodal tail: run 12k-step diags until one goes
// walk-heavy, then dump the milling pattern in detail.
import { buildSeedWorld } from '../src/data/seed';
import { Rng } from '../src/engine/rng';
import { autoplayStep, newAutoplayer } from '../src/engine/autoplayer';

for (let attempt = 0; attempt < 10; attempt++) {
  const w = buildSeedWorld();
  const rng = new Rng(5555 + attempt);
  const state = newAutoplayer();
  const actions = {};
  const trail = [];
  const roomVisits = {};
  for (let i = 0; i < 12000; i++) {
    const a = autoplayStep(w, state, rng, i);
    actions[a] = (actions[a] ?? 0) + 1;
    const loc = w.currentDungeon ? `${w.currentDungeon.slice(-8)}:${w.currentRoom}(f${w.dungeons[w.currentDungeon].rooms[w.currentRoom]?.floor})` : w.partyLocation;
    trail.push(`${a}@${loc}`);
    if (trail.length > 120) trail.shift();
    if (a === 'walk' && w.currentRoom) roomVisits[w.currentRoom] = (roomVisits[w.currentRoom] ?? 0) + 1;
  }
  const walks = actions['walk'] ?? 0;
  const mc = w.characters[w.mcId];
  console.log(`attempt ${attempt}: L${mc.level}, walks ${walks}, combat ${actions['combat'] ?? 0}, day ${w.time.day}`);
  if (walks > 6000) {
    console.log('=== TAIL CAUGHT ===');
    const hot = Object.entries(roomVisits).sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log('hot rooms:', hot.map(([r, n]) => `${r}:${n}`).join(' '));
    if (w.currentDungeon) {
      const d = w.dungeons[w.currentDungeon];
      console.log('in', d.id, 'bossDefeated', d.bossDefeated);
      const hotIds = hot.map(([r]) => r);
      for (const rid of hotIds.slice(0, 4)) {
        const r = d.rooms[rid];
        if (r) console.log(` ${rid} f${r.floor} enemies=${r.enemies} explored=${r.explored} conns=${Object.keys(r.connections).join(',')} spinner=${!!r.spinner} teleporter=${!!r.teleporter} dark=${!!r.darkZone}`);
      }
    }
    console.log('bot: target', state.targetDungeon, 'leavingFloor', state.leavingFloor, 'streak', state.wanderStreak, 'sweepDone', JSON.stringify(state.sweepDoneDay));
    console.log('trail tail:', trail.slice(-70).join(' '));
    break;
  }
}
