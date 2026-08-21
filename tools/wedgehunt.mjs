// Hunt the campaign wedge: run repeated bot probes until one pins at
// stage 0 with the warden alive, then autopsy the room graph — is the
// boss room reachable through open passages at all?
import { buildSeedWorld } from '../src/data/seed';
import { Rng } from '../src/engine/rng';
import { autoplayStep, newAutoplayer } from '../src/engine/autoplayer';
import { mainQuests } from '../src/engine/campaign';

function bfsOpen(d, from, opts = {}) {
  // walk the graph as the bot's pathing sees it
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    const room = d.rooms[cur];
    for (const [dir, to] of Object.entries(room.connections)) {
      if (!to || seen.has(to)) continue;
      if (!opts.ignoreLocks && room.lockedDoor && !room.lockedDoor.opened && room.lockedDoor.dir === dir) continue;
      if (!opts.ignoreRiddles && room.riddleDoor && !room.riddleDoor.opened && room.riddleDoor.dir === dir) continue;
      seen.add(to);
      q.push(to);
    }
  }
  return seen;
}

for (let attempt = 0; attempt < 8; attempt++) {
  const w = buildSeedWorld();
  const rng = new Rng(1000 + attempt);
  const state = newAutoplayer();
  for (let i = 0; i < 45000; i++) autoplayStep(w, state, rng, i);
  const stage1 = mainQuests(w).find((q) => q.stage === 4);
  const d = w.dungeons['DUN_IRONMARKET_001'];
  const boss = Object.values(d.rooms).find((r) => r.isBossRoom);
  const done = stage1?.status === 'completed';
  console.log(`attempt ${attempt}: stage4 ${stage1?.status}, bossDefeated ${d.bossDefeated}, bossRoom enemies ${boss?.enemies}, level ${w.characters[w.mcId].level}, generated ${d.generated}`);
  if (!done && boss) {
    // AUTOPSY
    console.log('=== WEDGED WORLD AUTOPSY ===');
    console.log('boss room', boss.id, 'floor', boss.floor, 'connections', JSON.stringify(boss.connections));
    const entry3 = Object.values(d.rooms).find((r) => r.floor === boss.floor && r.isStairsUp) ?? Object.values(d.rooms).find((r) => r.floor === boss.floor);
    const open = bfsOpen(d, entry3.id);
    const withLocks = bfsOpen(d, entry3.id, { ignoreLocks: true });
    const withAll = bfsOpen(d, entry3.id, { ignoreLocks: true, ignoreRiddles: true });
    console.log('from floor-entry', entry3.id, ': boss reachable open?', open.has(boss.id), '| ignoring locks?', withLocks.has(boss.id), '| ignoring locks+riddles?', withAll.has(boss.id));
    for (const r of Object.values(d.rooms)) {
      if (r.floor !== boss.floor) continue;
      if (r.lockedDoor && !r.lockedDoor.opened) console.log(' locked door', r.id, JSON.stringify(r.lockedDoor), 'keysHeld:', d.keysHeld);
      if (r.riddleDoor && !r.riddleDoor.opened) console.log(' riddle door', r.id, 'lore', r.riddleDoor.loreId, 'known:', (w.codex ?? []).includes(r.riddleDoor.loreId));
      if (r.secretDoor) console.log(' secret door', r.id, JSON.stringify(r.secretDoor));
    }
    // do stairs to the boss floor even exist/reach?
    for (let f = 1; f < boss.floor; f++) {
      const down = Object.values(d.rooms).filter((r) => r.floor === f && r.connections.down);
      console.log(` floor ${f} stairs-down rooms:`, down.map((r) => r.id).join(',') || 'NONE');
    }
    break;
  }
}
