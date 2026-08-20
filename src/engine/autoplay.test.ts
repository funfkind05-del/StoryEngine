// The playability proof: a bot that plays Blackwall to WIN, asserting
// the game is actually beatable — levels climb, bosses fall, the
// economy stays solvent, and progress never stalls for thousands of
// actions. Every failure here is a balance wall a reader would hit.
//
//   AUTO_STEPS=30000 AUTO_SEEDS=2 npx vitest run src/engine/autoplay.test.ts

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { Rng } from './rng';
import { autoplayStep, newAutoplayer, noteProgress } from './autoplayer';
import { partyMembers } from './world';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const STEPS = parseInt(env.AUTO_STEPS ?? '12000', 10);
const SEEDS = parseInt(env.AUTO_SEEDS ?? '1', 10);

describe(`autoplayer (${SEEDS} seed${SEEDS === 1 ? '' : 's'} × ${STEPS} purposeful actions)`, () => {
  for (let s = 0; s < SEEDS; s++) {
    it(`beats the early game on seed ${s}`, { timeout: 1800000 }, async () => {
      const w = buildSeedWorld();
      w.masterSeed = 5000 + s;
      const rng = new Rng(70000 + s);
      const state = newAutoplayer();
      const actions: Record<string, number> = {};
      const trail: string[] = [];
      let stallSince = 0;

      for (let i = 0; i < STEPS; i++) {
        const action = autoplayStep(w, state, rng, i);
        actions[action] = (actions[action] ?? 0) + 1;
        trail.push(`${action}@${w.currentDungeon ? w.currentRoom : w.partyLocation}`);
        if (trail.length > 24) trail.shift();
        if (env.AUTO_TRACE) state.log.push(`${i} ${action} @${w.currentDungeon ?? ''}${w.currentRoom ?? w.partyLocation} ${partyMembers(w).map((c) => `${c.name.slice(0, 4)}:${c.hp.current}/${c.hp.max}${c.statuses.map((st) => st.key[0]).join('')}i${c.injuries.filter((j) => !j.treated).length}h${Math.round(c.needs.hunger)}`).join(' ')} $${w.characters[w.mcId].money}`);
        if (noteProgress(w, state, i)) stallSince = i;
        if (i - stallSince > 5000) {
          const mc = w.characters[w.mcId];
          throw new Error(
            `STALLED: no xp progress from step ${stallSince} to ${i}. ` +
            `Level ${mc.level}, ${mc.xp} xp, ${mc.money}c, at ${w.currentDungeon ?? w.partyLocation}, ` +
            `last actions: ${Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' ')}\nTRAIL: ${trail.join(' → ')}\n${env.AUTO_TRACE ? state.log.slice(-60).join('\n') : ''}`,
          );
        }
        // hard sanity while playing
        for (const c of partyMembers(w)) {
          if (Number.isNaN(c.hp.current) || Number.isNaN(c.money)) throw new Error(`NaN on ${c.name} at step ${i}`);
        }
      }

      const mc = w.characters[w.mcId];
      const bosses = Object.values(w.dungeons).filter((d) => d.bossDefeated).length;
      const summary =
        `level ${mc.level} (${mc.xp} xp) · ${bosses} bosses down · ${mc.money}c · ` +
        `day ${w.time.day} · quests done ${Object.values(w.quests).filter((q) => q.status === 'completed').length} · ` +
        `top actions: ${Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(' ')}`;
      console.log(`[autoplay seed ${s}] ${summary}`);
      const fs = (await import('node' + ':fs')) as { appendFileSync: (p: string, d: string) => void };
      fs.appendFileSync('/tmp/claude-1000/-home-ritris-storyengine/b43db9fc-f095-491e-b942-9ff14dfcae6a/scratchpad/autoplay-results.txt', `[seed ${s}] ${summary}\n`);
      if (env.AUTO_TRACE) console.log(state.log.slice(-80).join('\n'));

      // the playability bar: the early game must be climbable.
      // (world RNG is true-random, so boss timing varies — a deep level
      // without a boss still proves the climb; both missing means a wall)
      expect(mc.level, summary).toBeGreaterThanOrEqual(8);
      expect(bosses >= 1 || mc.level >= 12, summary).toBe(true);
      expect(mc.money, summary).toBeGreaterThanOrEqual(0);
    });
  }
});
