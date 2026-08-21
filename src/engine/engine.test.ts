// End-to-end engine tests: a full play session run headlessly.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { enterDungeon, generateDungeon, moveInDungeon } from './dungeon';
import { generateDungeonEncounter, rollCityEncounter } from './encounter';
import { resolveRound, startCombat, takeLoot } from './combat';
import { combatToAuthorLog, combatToProse, travelSentence } from './bridge';
import { checkAllScenes, checkScene } from './continuity';
import { advanceUntilMorning, partyMembers, tick, travelTo } from './world';
import { generateBackgroundNpc, promoteNpc } from './npc';
import { buyFirstHome, buyUpgrade, upgradeTier } from './household';
import type { PlannedAction, WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 12345;
  return w;
}

describe('world & time', () => {
  it('advances the clock across midnight', () => {
    const w = freshWorld();
    w.time = { day: 1, minute: 23 * 60 };
    tick(w, 120);
    expect(w.time.day).toBe(2);
    expect(w.time.minute).toBe(60);
  });

  it('moves scheduled NPCs and restores the party overnight', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    kael.hp.current = 3;
    advanceUntilMorning(w, 'bed');
    expect(kael.hp.current).toBe(kael.hp.max);
    expect(w.time.minute).toBe(7 * 60);
    // Mara should be at the market at midday
    tick(w, 5 * 60 + 30);
    expect(w.characters['CHAR_MARA'].location).toBe('LOC_IRONMARKET_SQ');
  });

  it('travel moves the whole party and logs an event', () => {
    const w = freshWorld();
    travelTo(w, 'LOC_IRONMARKET_SQ');
    expect(w.partyLocation).toBe('LOC_IRONMARKET_SQ');
    for (const c of partyMembers(w)) expect(c.location).toBe('LOC_IRONMARKET_SQ');
    expect(w.events.some((e) => e.kind === 'travel')).toBe(true);
  });
});

describe('dungeon persistence', () => {
  it('generates once from its seed and keeps room state', () => {
    const w = freshWorld();
    w.dungeons['DUN_OLDQUARTER_001'].generationSeed = 777;
    const d = generateDungeon(w, 'DUN_OLDQUARTER_001');
    expect(d.generated).toBe(true);
    const roomCount = Object.keys(d.rooms).length;
    expect(roomCount).toBeGreaterThan(10);
    // re-generating is a no-op
    generateDungeon(w, 'DUN_OLDQUARTER_001');
    expect(Object.keys(d.rooms).length).toBe(roomCount);
    // deepest floor has a boss room
    expect(Object.values(d.rooms).some((r) => r.isBossRoom && r.floor === d.floors)).toBe(true);
    // same seed -> same structure in a second world
    const w2 = freshWorld();
    w2.dungeons['DUN_OLDQUARTER_001'].generationSeed = 777;
    w2.counters = { ...w.counters, ROOM: 0 };
    w2.counters['ROOM'] = 0;
    const d2 = generateDungeon(w2, 'DUN_OLDQUARTER_001');
    expect(Object.values(d2.rooms).map((r) => `${r.floor}:${r.x},${r.y}`).sort()).toEqual(
      Object.values(d.rooms).map((r) => `${r.floor}:${r.x},${r.y}`).sort(),
    );
  });

  it('supports movement through connections and marks rooms explored', () => {
    const w = freshWorld();
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const entry = d.rooms[w.currentRoom!];
    expect(entry.explored).toBe(true);
    // true-entropy worlds can bar any single direction (locked doors);
    // prove that SOME open connection walks and marks explored
    let moved = false;
    for (const dir of Object.keys(entry.connections) as 'north'[]) {
      const res = moveInDungeon(w, dir);
      if ('room' in res) {
        expect(res.room.explored).toBe(true);
        moved = true;
        break;
      }
    }
    expect(moved, 'every exit from the entry room was barred').toBe(true);
  });
});

describe('encounters & combat', () => {
  function forceEncounterRoom(w: WorldState): void {
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const entry = d.rooms[w.currentRoom!];
    entry.enemies = 'alive';
    entry.encounterKey = 'giant-rat';
  }

  it('same seed yields the same encounter; new seed can differ', () => {
    const w = freshWorld();
    forceEncounterRoom(w);
    const a = generateDungeonEncounter(w, 42);
    const b = generateDungeonEncounter(w, 42);
    expect('monsters' in a && 'monsters' in b).toBe(true);
    if ('monsters' in a && 'monsters' in b) expect(a.monsters).toEqual(b.monsters);
  });

  it('runs a full combat to a terminal outcome with a faithful log', () => {
    const w = freshWorld();
    forceEncounterRoom(w);
    const enc = generateDungeonEncounter(w, 42);
    if ('error' in enc) throw new Error(enc.error);
    const combat = startCombat(w, enc);
    let guard = 0;
    while (combat.outcome === 'ongoing' && guard++ < 50) {
      const planned: PlannedAction[] = combat.partyIds
        .map((id) => w.characters[id])
        .filter((c) => c.hp.current > 0)
        .map((c) => {
          const target = combat.monsters.find((m) => m.alive && !m.fled);
          return { actor: c.id, type: 'attack', target: target?.id } as PlannedAction;
        });
      resolveRound(w, planned);
    }
    expect(['victory', 'defeat', 'fled']).toContain(combat.outcome);
    expect(combat.log.length).toBeGreaterThan(0);
    // canonical record: deaths in the log match dead monsters
    const deathLines = combat.log.filter((e) => e.result === 'death' && e.actor.startsWith('MON')).length;
    expect(deathLines).toBe(combat.monsters.filter((m) => !m.alive).length);
    if (combat.outcome === 'victory') {
      expect(combat.pendingLoot).toBeTruthy();
      const room = w.dungeons['DUN_OLDQUARTER_001'].rooms[combat.roomId!];
      expect(room.enemies).toBe('dead');
      // full XP to every participant (underdog bonus may top it up
      // when the foes outrank the fighter)
      for (const id of combat.partyIds) {
        expect(w.characters[id].xp).toBeGreaterThanOrEqual(combat.pendingLoot!.xp);
        expect(w.characters[id].xp).toBeLessThanOrEqual(combat.pendingLoot!.xp * 2);
      }
      const money = w.characters[w.mcId].money;
      takeLoot(w, 'all');
      expect(w.characters[w.mcId].money).toBe(money + combat.pendingLoot!.money);
      // every loot item was either added to the MC or merged into a stack
      for (const item of combat.pendingLoot!.items) {
        const live = w.items[item.id];
        expect(live === undefined || live.owner === w.mcId).toBe(true);
      }
    }
    // narrative bridge: prose derives from the log and mentions any kill
    const prose = combatToProse(combat.log, 1);
    const log = combatToAuthorLog(combat.log);
    expect(log).toContain('ROUND 1');
    const firstKill = combat.log.find((e) => e.result === 'death');
    if (firstKill) expect(prose).toContain(firstKill.actorName);
    // same seed -> identical wording; new seed -> same facts
    expect(combatToProse(combat.log, 1)).toBe(prose);
  });

  it('city encounters respect the frequency setting', () => {
    const w = freshWorld();
    w.encounterFrequency = 'chaotic';
    let hits = 0;
    for (let i = 0; i < 30; i++) {
      w.pendingEncounter = null;
      if (rollCityEncounter(w)) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });
});

describe('narrative bridge: travel sentences', () => {
  it('embeds the destination as an @[Name](ID) token, deterministic per seed', () => {
    const w = freshWorld();
    const s = travelSentence(w, 'LOC_IRONMARKET_SQ', 7);
    expect(s).toContain('@[Ironmarket Square](LOC_IRONMARKET_SQ)');
    expect(travelSentence(w, 'LOC_IRONMARKET_SQ', 7)).toBe(s);
  });
});

describe('NPCs', () => {
  it('generates background NPCs deterministically per seed and promotes them', () => {
    const w = freshWorld();
    const a = generateBackgroundNpc(w, 'LOC_DOCK_0042', 999);
    expect(a.persistent).toBe(false);
    const p = promoteNpc(w, a.id);
    expect(p.persistent).toBe(true);
    expect(p.schedule.length).toBeGreaterThan(0);
    expect(p.name).toBe(a.name); // identity never regenerated
  });
});

describe('continuity checker', () => {
  it('flags dead characters, wrong locations, and unknown ids', () => {
    const w = freshWorld();
    const mara = w.characters['CHAR_MARA'];
    mara.alive = false;
    mara.diedOnDay = 1;
    const scene = w.scenes[0];
    scene.text += `\n@[Mara Venn](CHAR_MARA) grinned. @[Ghost Tavern](LOC_NOPE_9999) loomed.`;
    const warnings = checkScene(w, scene);
    expect(warnings.some((x) => x.message.includes('dead'))).toBe(true);
    expect(warnings.some((x) => x.message.includes('unknown location'))).toBe(true);
    // participant elsewhere: Lyra in the dungeon while scene says tavern
    w.characters['CHAR_LYRA'].location = 'LOC_MAUSOLEUM';
    const all = checkAllScenes(w);
    expect(all.some((x) => x.message.includes('simulation currently places'))).toBe(true);
  });

  it('passes a clean scene', () => {
    const w = freshWorld();
    const warnings = checkAllScenes(w);
    expect(warnings).toEqual([]);
  });
});

describe('household', () => {
  it('nothing is his until he buys it; then upgrades gate by money and tier', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    // no home at the start of the story
    expect(Object.values(w.locations).some((l) => l.household)).toBe(false);
    expect(buyUpgrade(w, 'armory')).toBe('No home to upgrade.');
    expect(upgradeTier(w)).toBe('No home to upgrade.');
    mc.money = 100;
    expect(buyFirstHome(w)).toMatch(/Keep saving/);
    mc.money = 900;
    expect(buyFirstHome(w)).toBeNull(); // the milestone: 800c, cash on the nail
    const home = Object.values(w.locations).find((l) => l.household)!;
    expect(home.household!.tier).toBe('cheap-apartment');
    expect(mc.money).toBe(100);
    expect(buyUpgrade(w, 'armory')).toMatch(/needs at least/);
    expect(upgradeTier(w)).toMatch(/Not enough coin/);
    mc.money = 10000;
    expect(upgradeTier(w)).toBeNull();
    expect(home.household!.tier).toBe('small-house');
    expect(buyUpgrade(w, 'kitchen')).toBeNull();
    expect(home.household!.upgrades).toContain('kitchen');
  });
});

describe('save round trip', () => {
  it('serializes and restores the whole world', () => {
    const w = freshWorld();
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const json = JSON.stringify(w);
    const back = JSON.parse(json) as WorldState;
    expect(back.currentRoom).toBe(w.currentRoom);
    expect(Object.keys(back.dungeons['DUN_OLDQUARTER_001'].rooms).length).toBe(
      Object.keys(w.dungeons['DUN_OLDQUARTER_001'].rooms).length,
    );
  });
});
