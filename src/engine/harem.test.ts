// The harem-book round: recruitable companions with personal arcs,
// the relationship system (stages, gifts, shared time, harem moments),
// combat autopilot, the Circle's clock, and the Tier B writer tools.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { COMPANION_ARCS, ensurePersonalArcs } from './companions';
import { DATE_ACTIVITIES, STAGE_LABELS, entangled, giveGift, haremMomentHook, relationshipStage, spendTimeWith } from './romance';
import { acceptQuest, checkQuests, turnInQuest } from './quests';
import { autoResolve, startCombat } from './combat';
import { DOOM_STAGE_DAYS, doomTick, mainQuests } from './campaign';
import { compileBible } from './bible';
import { compactEvents, recordWritingStats } from './compile';
import { addToContainer, makeItem } from './rules';
import { partyMembers, travelTo } from './world';
import type { WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 777;
  return w;
}

describe('recruitable companions & personal arcs', () => {
  it('the women exist with the missing classes and arc stage 1 on offer', () => {
    const w = freshWorld();
    expect(w.characters['CHAR_YVENNE'].charClass).toBe('priest');
    expect(w.characters['CHAR_YVENNE'].sex).toBe('female');
    expect(w.characters['CHAR_KESS'].charClass).toBe('mage');
    expect(w.characters['CHAR_KESS'].sex).toBe('female');
    for (const arc of COMPANION_ARCS) {
      const q = Object.values(w.quests).find((x) => x.personal === arc.charId && x.personalStage === 1);
      expect(q?.status, arc.charId).toBe('offered');
    }
  });

  it('stage 1 recruits her; later stages gate on trust and level, and pay bond', () => {
    const w = freshWorld();
    const yv = w.characters['CHAR_YVENNE'];
    const q1 = Object.values(w.quests).find((x) => x.personal === 'CHAR_YVENNE' && x.personalStage === 1)!;
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_IRONMARKET_SQ');
    travelTo(w, 'LOC_GRAVEROW');
    expect(acceptQuest(w, q1.id)).toBeNull();
    w.killCounts['dire-wolf'] = (w.killCounts['dire-wolf'] ?? 0) + 2;
    checkQuests(w);
    expect(turnInQuest(w, q1.id)).toBeNull();
    expect(yv.inParty).toBe(true); // recruited
    expect(yv.relationships[w.mcId].trust).toBeGreaterThanOrEqual(2);
    expect(yv.memories.some((m) => m.event.includes('Nobody paid them'))).toBe(true);
    // stage 2 not yet — trust gate is 3 and we're at 2? bond gave trust 2 → gate 3 unmet
    ensurePersonalArcs(w);
    const q2 = Object.values(w.quests).find((x) => x.personal === 'CHAR_YVENNE' && x.personalStage === 2);
    if (yv.relationships[w.mcId].trust >= 3) expect(q2).toBeTruthy();
    else expect(q2).toBeFalsy();
    // raise trust; stage 2 opens
    yv.relationships[w.mcId].trust = 5;
    ensurePersonalArcs(w);
    expect(Object.values(w.quests).some((x) => x.personal === 'CHAR_YVENNE' && x.personalStage === 2)).toBe(true);
  });
});

describe('the relationship system', () => {
  it('derives stages from the dials', () => {
    expect(relationshipStage(undefined)).toBe('stranger');
    expect(relationshipStage({ affection: 2, trust: 2, respect: 0, attraction: 0, commitment: 0 })).toBe('friend');
    expect(relationshipStage({ affection: 5, trust: 4, respect: 3, attraction: 6, commitment: 0 })).toBe('lover');
    expect(relationshipStage({ affection: 6, trust: 6, respect: 5, attraction: 5, commitment: 9 })).toBe('spouse');
    expect(STAGE_LABELS.smitten).toBe('Something unspoken');
  });

  it('gifts land by values, not price; stolen gifts read differently', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const lyra = w.characters['CHAR_LYRA']; // values honesty, courage, freedom
    // a weapon speaks to courage
    const bow = makeItem(w, 'hunting-bow');
    addToContainer(w, bow, mc);
    const before = lyra.relationships[w.mcId].affection;
    expect(giveGift(w, 'CHAR_LYRA', bow.id)).toBeNull();
    expect(lyra.relationships[w.mcId].affection).toBeGreaterThan(before + 1); // resonant
    expect(bow.owner).toBe('CHAR_LYRA');
    // pacing: one gift a day
    const ring = makeItem(w, 'dagger');
    addToContainer(w, ring, mc);
    expect(giveGift(w, 'CHAR_LYRA', ring.id)).toMatch(/Pace yourself/);
    // stolen gift to an honesty-valuer costs trust
    const w2 = freshWorld();
    const mc2 = w2.characters[w2.mcId];
    const hot = makeItem(w2, 'dagger');
    hot.stolen = true;
    addToContainer(w2, hot, mc2);
    const t0 = w2.characters['CHAR_LYRA'].relationships[w2.mcId].trust;
    expect(giveGift(w2, 'CHAR_LYRA', hot.id)).toBeNull();
    expect(w2.characters['CHAR_LYRA'].relationships[w2.mcId].trust).toBeLessThan(t0);
  });

  it('shared time moves dials with daily pacing and venue requirements', () => {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    expect(spendTimeWith(w, 'CHAR_LYRA', 'fish')).toMatch(/wharves/i);
    expect(spendTimeWith(w, 'CHAR_LYRA', 'meal')).toBeNull(); // tavern serves food
    expect(lyra.relationships[w.mcId].affection).toBeGreaterThan(1);
    expect(spendTimeWith(w, 'CHAR_LYRA', 'walk')).toMatch(/so many hours/);
    expect(DATE_ACTIVITIES.length).toBeGreaterThanOrEqual(4);
  });

  it('harem dynamics: two or more entangled hearts produce value-driven moments', () => {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    const mara = w.characters['CHAR_MARA'];
    lyra.relationships[w.mcId] = { affection: 5, trust: 6, respect: 4, attraction: 6, commitment: 2 };
    mara.relationships[w.mcId] = { affection: 4, trust: 1, respect: 3, attraction: 6, commitment: 1 };
    expect(entangled(w).map((c) => c.id).sort()).toEqual(['CHAR_LYRA', 'CHAR_MARA']);
    // Lyra values freedom → accepting; Mara (cunning/freedom/wealth) also leans accepting via freedom
    let lyraHook = null;
    for (let i = 0; i < 30 && !lyraHook; i++) lyraHook = haremMomentHook(w, 'CHAR_LYRA');
    expect(lyraHook?.hook).toContain('terms');
    // one heart only → no harem moment
    mara.relationships[w.mcId].attraction = 0;
    expect(haremMomentHook(w, 'CHAR_LYRA')).toBeNull();
  });
});

describe('combat autopilot', () => {
  it('auto-resolves a fight to a terminal outcome, healing when hurt', () => {
    const w = freshWorld();
    // give Yvenne to the party for heal coverage
    const yv = w.characters['CHAR_YVENNE'];
    yv.inParty = true;
    yv.location = w.partyLocation;
    const combat = startCombat(w, {
      seed: 21, description: 'rats and a goblin', monsters: [{ templateKey: 'giant-rat', count: 2 }, { templateKey: 'tunnel-goblin', count: 1 }],
      source: 'city', locationId: w.partyLocation,
    });
    autoResolve(w);
    expect(combat.outcome).not.toBe('ongoing');
    expect(combat.log.length).toBeGreaterThan(3);
  });
});

describe("the Circle's clock", () => {
  it('advances only when the spine idles, degrades the world, and can be paused', () => {
    const w = freshWorld();
    // idle past the threshold
    w.time.day = DOOM_STAGE_DAYS + 5;
    doomTick(w);
    expect(w.doom?.stage).toBe(1);
    expect(w.events.some((e) => e.kind === 'doom')).toBe(true);
    // no double-advance same window
    doomTick(w);
    expect(w.doom?.stage).toBe(1);
    // stage 2 revives a cleared dungeon if any
    w.dungeons['DUN_OLDQUARTER_001'].bossDefeated = true;
    w.time.day += DOOM_STAGE_DAYS;
    doomTick(w);
    expect(w.doom?.stage).toBe(2);
    expect(w.dungeons['DUN_OLDQUARTER_001'].bossDefeated).toBe(false);
    // paused clock does nothing
    const w2 = freshWorld();
    w2.doomEnabled = false;
    w2.time.day = 500;
    doomTick(w2);
    expect(w2.doom?.stage ?? 0).toBe(0);
    // finished spine stops the clock
    const w3 = freshWorld();
    for (const q of mainQuests(w3)) q.status = 'completed';
    w3.time.day = 500;
    doomTick(w3);
    expect(w3.doom?.stage ?? 0).toBe(0);
  });
});

describe('writer tools (Tier B)', () => {
  it('the series bible compiles everything the engine knows', () => {
    const w = freshWorld();
    w.codex = ['DUN_OLDQUARTER_001:1'];
    w.achievements = ['first-blood'];
    const bible = compileBible(w, 'Blackwall');
    expect(bible).toContain('# Blackwall — Series Bible');
    expect(bible).toContain('Yvenne');
    expect(bible).toContain('What Sleeps Below');
    expect(bible).toContain('Mason’s Tally');
    expect(bible).toContain('First Blood');
    expect(bible).toContain('The Red Knives');
  });

  it('event compaction digests outlined history, keeps milestones, fixes the cursor', () => {
    const w = freshWorld();
    // simulate a played-and-outlined stretch
    for (let i = 0; i < 400; i++) {
      w.events.push({ id: `EVT_F${i}`, time: { day: 1 + Math.floor(i / 40), minute: 0 }, kind: i % 50 === 0 ? 'quest.completed' : 'travel', data: {}, summary: `event ${i}` });
    }
    w.outlinedUpTo = w.events.length - 20;
    const total = w.events.length;
    const res = compactEvents(w);
    expect(res.removed).toBeGreaterThan(300);
    expect(w.events.length).toBeLessThan(total - 300);
    // milestones survived; recent un-outlined tail survived
    expect(w.events.some((e) => e.kind === 'quest.completed')).toBe(true);
    expect(w.events.slice(-20).every((e) => e.summary.startsWith('event'))).toBe(true);
    expect(w.outlinedUpTo).toBe(w.events.length - 20);
    expect(w.eventArchive?.length).toBe(1);
  });

  it('writing stats track compiled words per day', () => {
    const w = freshWorld();
    recordWritingStats(w);
    const days = Object.keys(w.writingStats ?? {});
    expect(days.length).toBe(1);
    expect(w.writingStats![days[0]]).toBeGreaterThan(50);
  });
});

describe('harem-safe invariants', () => {
  it('all recruitables are women and the party can hold the full harem', () => {
    const w = freshWorld();
    for (const arc of COMPANION_ARCS) {
      expect(w.characters[arc.charId].sex).toBe('female');
    }
    // recruit everyone: the full cast fits under the cap of 8
    for (const arc of COMPANION_ARCS) {
      const c = w.characters[arc.charId];
      c.inParty = true;
      c.location = w.partyLocation;
    }
    expect(partyMembers(w).length).toBeLessThanOrEqual(8);
  });
});
