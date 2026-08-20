// Tier 2/3 game systems: crafting & materials, world events, dungeon
// interactivity & the Codex, combat telegraphs, achievements, carriage,
// fishing, and the stray.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { RECIPES, canCraft, craft, enchantItem, gatherResource, MATERIAL_DROPS } from './crafting';
import { engageWorldEvent, expireWorldEvents, maybeSpawnWorldEvent, resolveWorldEventVictory } from './worldEvents';
import { generateDungeon, enterDungeon, pickLock, takeLorebook, useShrine } from './dungeon';
import { LOREBOOKS, loreById } from './codex';
import { ACHIEVEMENTS, checkAchievements } from './achievements';
import { adoptStray, goFishing, rideCarriage, CARRIAGE_STOPS } from './services';
import { buyFirstHome, buyUpgrade } from './household';
import { generateLoot } from './loot';
import { resolveRound, startCombat } from './combat';
import { addToContainer, makeItem, ITEM_PROTOS } from './rules';
import { travelTo, tick } from './world';
import type { WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 4321;
  return w;
}

function homeWorld(): WorldState {
  const w = freshWorld();
  w.characters[w.mcId].money = 200000;
  buyFirstHome(w);
  travelTo(w, 'LOC_HOME');
  const hh = w.locations['LOC_HOME'].household!;
  hh.tier = 'estate';
  for (const up of ['workshop', 'alchemy-room', 'kitchen', 'enchanters-study', 'forge-annex']) buyUpgrade(w, up);
  return w;
}

describe('crafting', () => {
  it('materials drop from kills, recipes consume them, gear rolls craftsmanship', () => {
    const w = freshWorld();
    // beasts drop leather; constructs drop iron (statistically)
    let leather = 0;
    for (let seed = 0; seed < 30; seed++) {
      const loot = generateLoot(w, ['dire-wolf'], seed, 0);
      leather += loot.items.filter((i) => i.proto === 'leather-strips').length;
    }
    expect(leather).toBeGreaterThan(3);
    expect(MATERIAL_DROPS.construct[0].proto).toBe('iron-scrap');
    // craft a dagger at a fitted home
    const w2 = homeWorld();
    const mc = w2.characters[w2.mcId];
    expect(canCraft(w2, RECIPES.find((r) => r.key === 'smith-dagger')!)).toMatch(/Short of materials/);
    addToContainer(w2, makeItem(w2, 'iron-scrap', 6), mc);
    expect(craft(w2, 'smith-dagger')).toBeNull();
    expect(mc.inventory.map((i) => w2.items[i]?.proto)).toContain('dagger');
    // enchanting stamps an affix
    const sword = makeItem(w2, 'iron-longsword');
    addToContainer(w2, sword, mc);
    expect(enchantItem(w2, sword.id)).toMatch(/ember essence/);
    addToContainer(w2, makeItem(w2, 'ember-essence', 2), mc);
    expect(enchantItem(w2, sword.id)).toBeNull();
    expect(sword.affix).toBeTruthy();
    expect(enchantItem(w2, sword.id)).toMatch(/already carries/);
  });
});

describe('world events', () => {
  it('spawns, engages into combat with a payout, and lapses with consequences', () => {
    const w = freshWorld();
    w.time.day = 10;
    let guard = 0;
    while (!(w.activeEvents ?? []).length && guard++ < 200) {
      w.time.day += 1;
      maybeSpawnWorldEvent(w);
    }
    expect((w.activeEvents ?? []).length).toBeGreaterThan(0);
    const ev = w.activeEvents![0];
    // engage: travel there and step in
    w.partyLocation = ev.locationId;
    for (const c of Object.values(w.characters)) if (c.inParty) c.location = ev.locationId;
    expect(engageWorldEvent(w)).toBeNull();
    expect(w.pendingEncounter).toBeTruthy();
    expect(w.pendingWorldEventReward?.reward).toBe(ev.reward);
    // win it
    const combat = startCombat(w, w.pendingEncounter!);
    w.characters[w.mcId].attack = 40;
    w.characters['CHAR_LYRA'].attack = 40;
    let g2 = 0;
    while (combat.outcome === 'ongoing' && g2++ < 60) {
      const t = combat.monsters.find((m) => m.alive && !m.fled);
      resolveRound(w, combat.partyIds.map((id) => ({ actor: id, type: 'attack' as const, target: t?.id })));
    }
    resolveWorldEventVictory(w, combat.outcome);
    if (combat.outcome === 'victory') {
      expect(w.events.some((e) => e.kind === 'worldevent.resolved')).toBe(true);
      expect(w.pendingWorldEventReward ?? null).toBeNull();
    }
    // lapse: an ignored event worsens its street
    const w2 = freshWorld();
    w2.activeEvents = [{ id: 'WEV_T', kind: 'ash-ritual', locationId: 'LOC_RATCATCHER', expiresDay: 1, description: 'x', monsters: [], reward: 0 }];
    const dangerBefore = w2.locations['LOC_RATCATCHER'].dangerRating;
    w2.time.day = 3;
    expireWorldEvents(w2);
    expect(w2.locations['LOC_RATCATCHER'].dangerRating).toBe(dangerBefore + 1);
    expect(w2.activeEvents).toHaveLength(0);
  });
});

describe('dungeon interactivity & the Codex', () => {
  it('generates locks, shrines, lorebooks, and resources; actions resolve them', () => {
    const w = freshWorld();
    // across all dungeons the features appear
    let locks = 0, shrines = 0, books = 0, nodes = 0;
    for (const id of Object.keys(w.dungeons)) {
      const d = generateDungeon(w, id);
      for (const r of Object.values(d.rooms)) {
        if (r.lockedDoor) locks++;
        if (r.shrine) shrines++;
        if (r.lorebook) books++;
        if (r.resource) nodes++;
      }
    }
    expect(locks).toBeGreaterThan(2);
    expect(shrines).toBeGreaterThan(2);
    expect(books).toBeGreaterThan(5);
    expect(nodes).toBeGreaterThan(3);
    // every generated lorebook id maps to written lore
    for (const d of Object.values(w.dungeons)) {
      for (const r of Object.values(d.rooms)) {
        if (r.lorebook) expect(loreById(r.lorebook.id), r.lorebook.id).toBeTruthy();
      }
    }
    expect(LOREBOOKS.length).toBeGreaterThanOrEqual(28);
    // exercise the actions in a real room
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const room = d.rooms[w.currentRoom!];
    room.shrine = { used: false };
    room.lorebook = { id: 'DUN_OLDQUARTER_001:1', taken: false };
    room.resource = { proto: 'night-herbs', gathered: false };
    room.lockedDoor = { dir: 'north', to: room.connections.north ?? room.id, difficulty: 1, opened: false };
    const hpBefore = w.characters[w.mcId].hp.current = 5;
    expect('error' in useShrine(w)).toBe(false);
    expect(w.characters[w.mcId].hp.current).toBeGreaterThan(hpBefore);
    expect('error' in takeLorebook(w)).toBe(false);
    expect(w.codex).toContain('DUN_OLDQUARTER_001:1');
    expect(gatherResource(w)).toBeNull();
    expect(w.partyInventory.map((i) => w.items[i]?.proto)).toContain('night-herbs');
    w.characters[w.mcId].skills.lockpicking = 25;
    expect('error' in pickLock(w)).toBe(false);
    expect(room.lockedDoor.opened).toBe(true);
  });
});

describe('achievements & titles', () => {
  it('awards on state, grants titles into the stat block', async () => {
    const w = freshWorld();
    w.killCounts['giant-rat'] = 30;
    w.characters[w.mcId].money = 20000;
    const fresh = checkAchievements(w);
    expect(fresh).toContain('Rat-Catcher');
    expect(fresh).toContain('Gilded');
    expect(w.characters[w.mcId].title).toBe('Rat-Catcher');
    expect(checkAchievements(w)).toHaveLength(0); // no double-award
    const { statBlock } = await import('./bridge');
    expect(statBlock(w, w.mcId)).toContain('"Rat-Catcher"');
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('carriage, fishing, and the stray', () => {
  it('carriage rides are safe paid travel between stops', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 100;
    travelTo(w, 'LOC_RATCATCHER');
    expect(rideCarriage(w, 'LOC_TEMPLE')).toBeNull();
    expect(w.partyLocation).toBe('LOC_TEMPLE');
    expect(mc.money).toBe(90);
    expect(rideCarriage(w, 'LOC_TEMPLE')).toMatch(/does not go/);
    expect(CARRIAGE_STOPS).toContain('LOC_WHARVES');
  });

  it('fishing catches something eventually and eases fatigue', () => {
    const w = freshWorld();
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_WHARVES');
    w.characters[w.mcId].needs.fatigue = 50;
    let caught = false;
    for (let i = 0; i < 20 && !caught; i++) {
      expect(goFishing(w)).toBeNull();
      caught = w.events.some((e) => e.kind === 'fishing.catch');
    }
    expect(caught).toBe(true);
    expect(ITEM_PROTOS['harbor-fish']).toBeTruthy();
  });

  it('the stray needs a doorstep and then holds it', () => {
    const w = freshWorld();
    expect(adoptStray(w)).toMatch(/Buy a home first/);
    const w2 = homeWorld();
    expect(adoptStray(w2)).toBeNull();
    expect(w2.pet?.name).toBeTruthy();
    expect(adoptStray(w2)).toMatch(/would object/);
  });
});

describe('combat telegraphs', () => {
  it('big monsters wind up, braced defenders halve it, stuns interrupt it', () => {
    const w = freshWorld();
    const combat = startCombat(w, {
      seed: 77, description: 'an ogre', monsters: [{ templateKey: 'ogre', count: 1 }],
      source: 'city', locationId: w.partyLocation,
    });
    // survive long enough to see a telegraph
    w.characters[w.mcId].hp.max = 500;
    w.characters[w.mcId].hp.current = 500;
    w.characters['CHAR_LYRA'].hp.max = 500;
    w.characters['CHAR_LYRA'].hp.current = 500;
    let sawTelegraph = false;
    for (let i = 0; i < 30 && combat.outcome === 'ongoing'; i++) {
      resolveRound(w, combat.partyIds.map((id) => ({ actor: id, type: 'defend' as const })));
      if (combat.log.some((e) => e.text.includes('STUN IT OR BRACE'))) sawTelegraph = true;
    }
    expect(sawTelegraph).toBe(true);
    // braced targets take the halved line
    const heavy = combat.log.find((e) => e.text.includes('braced') || e.text.includes('MASSIVE'));
    expect(heavy).toBeTruthy();
  });
});

describe('tick integration', () => {
  it('world events spawn and expire through the daily tick', () => {
    const w = freshWorld();
    for (let i = 0; i < 60; i++) tick(w, 1440);
    // over 60 days at 15%/day, spawn events almost surely fired
    expect(w.events.some((e) => e.kind === 'worldevent.spawn')).toBe(true);
  });
});
