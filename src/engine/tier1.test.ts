// Tier 1 game systems: crime & justice, skill-by-use + attribute
// points + gear affixes, choice-based quests, guild membership.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { arrestPay, arrestResist, arrestSurrender, burgleShop, maybePatrolStop, payBountyAt, pickpocket } from './crime';
import { affixMod, rollGearMods, spendAttributePoint, trainSkill, usesForNextRank } from './progression';
import { GUILDS, advanceGuild, guildRank, guildTitle, guildTrainingDiscount, joinGuild } from './guilds';
import { acceptQuest, checkQuests, turnInQuest } from './quests';
import { sellToShop, trainAt } from './services';
import { applyTraining, makeItem, trainingCost, addToContainer } from './rules';
import { travelTo } from './world';
import { Rng } from './rng';
import type { WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 555;
  return w;
}

describe('crime & justice', () => {
  it('pickpocketing succeeds or raises bounty and sours the mark', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.skills.stealth = 25; // guarantee the lift
    const tobbe = w.characters['CHAR_TOBBE'];
    const before = tobbe.money;
    expect(pickpocket(w, 'CHAR_TOBBE')).toBeNull();
    expect(tobbe.money).toBeLessThan(before);
    // and a hopeless attempt gets caught eventually
    const w2 = freshWorld();
    const mc2 = w2.characters[w2.mcId];
    mc2.skills.stealth = 0;
    mc2.attributes.dexterity = 1;
    let caught = false;
    for (let i = 0; i < 30 && !caught; i++) {
      const res = pickpocket(w2, 'CHAR_TOBBE');
      if (res) caught = true;
    }
    expect(caught).toBe(true);
    expect(w2.bounty ?? 0).toBeGreaterThan(0);
    expect(w2.characters['CHAR_TOBBE'].relationships[w2.mcId].trust).toBeLessThan(0);
    expect(w2.characters['CHAR_TOBBE'].memories.some((m) => m.event.includes('pick my pocket'))).toBe(true);
  });

  it('burglary needs darkness, marks goods stolen, and honest shops refuse them', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.skills.lockpicking = 25;
    mc.skills.stealth = 25;
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_IRONMARKET_SQ');
    travelTo(w, 'LOC_PHYSIC');
    w.time.minute = 12 * 60;
    expect(burgleShop(w, 'LOC_PHYSIC')).toMatch(/daylight/i);
    w.time.minute = 23 * 60;
    expect(burgleShop(w, 'LOC_PHYSIC')).toBeNull();
    const stolen = mc.inventory.map((i) => w.items[i]).find((i) => i?.stolen);
    expect(stolen).toBeTruthy();
    // the honest shop won't touch it; the fence will
    expect(sellToShop(w, 'LOC_PHYSIC', stolen!.id, mc)).toMatch(/Not from me/);
    travelTo(w, 'LOC_IRONMARKET_SQ');
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_THIEFGUILD');
    expect(sellToShop(w, 'LOC_THIEFGUILD', stolen!.id, mc)).toBeNull();
  });

  it('heat draws patrols on Watch turf; pay, surrender, and resist all resolve', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    w.bounty = 600;
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_IRONMARKET_SQ'); // Watch influence 6
    let stopped = false;
    for (let i = 0; i < 40 && !stopped; i++) stopped = maybePatrolStop(w);
    expect(stopped).toBe(true);
    // pay
    mc.money = 1000;
    expect(arrestPay(w)).toBeNull();
    expect(w.bounty).toBe(0);
    expect(mc.money).toBe(1000 - 720);
    // surrender path: jail clears bounty, costs days, confiscates stolen goods
    const w2 = freshWorld();
    w2.bounty = 300;
    const hot = makeItem(w2, 'dagger');
    hot.stolen = true;
    addToContainer(w2, hot, w2.characters[w2.mcId]);
    w2.pendingArrest = { seed: 1, officers: 2 };
    const dayBefore = w2.time.day;
    expect(arrestSurrender(w2)).toBeNull();
    expect(w2.bounty).toBe(0);
    expect(w2.time.day).toBeGreaterThanOrEqual(dayBefore + 2);
    expect(w2.characters[w2.mcId].inventory.includes(hot.id)).toBe(false);
    // resist path: watch combat queued, rep torched
    const w3 = freshWorld();
    w3.bounty = 300;
    w3.pendingArrest = { seed: 2, officers: 2 };
    expect(arrestResist(w3)).toBeNull();
    expect(w3.pendingEncounter?.monsters[0].templateKey).toBe('city-watchman');
    expect(w3.characters[w3.mcId].factionReputation['FAC_WATCH']).toBeLessThan(0);
    // voluntary payment at the watch-house
    const w4 = freshWorld();
    w4.bounty = 100;
    w4.characters[w4.mcId].money = 200;
    travelTo(w4, 'LOC_RATCATCHER');
    travelTo(w4, 'LOC_IRONMARKET_SQ');
    expect(payBountyAt(w4, 'LOC_IRONMARKET_SQ')).toBeNull();
    expect(w4.bounty).toBe(0);
  });
});

describe('progression: use, points, gear', () => {
  it('skills rank up through use', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const start = mc.skills.stealth;
    for (let i = 0; i < usesForNextRank(start); i++) trainSkill(w, mc, 'stealth');
    expect(mc.skills.stealth).toBe(start + 1);
    expect(w.events.some((e) => e.kind === 'skill.rankup')).toBe(true);
  });

  it('levels grant assignable attribute points', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.xp = 10000;
    applyTraining(mc);
    expect(mc.attributePoints).toBe(1);
    const con = mc.attributes.constitution;
    const hp = mc.hp.max;
    expect(spendAttributePoint(w, mc, 'constitution')).toBeNull();
    expect(mc.attributes.constitution).toBe(con + 1);
    expect(mc.hp.max).toBe(hp + 2);
    expect(spendAttributePoint(w, mc, 'strength')).toMatch(/No attribute points/);
  });

  it('gear rolls quality and affixes; equipped affixes feed combat stats', () => {
    const w = freshWorld();
    const rng = new Rng(9);
    let modded = 0;
    for (let i = 0; i < 60; i++) {
      const it = makeItem(w, 'iron-longsword');
      rollGearMods(rng, it, 2.2);
      if (it.quality || it.affix) modded++;
    }
    expect(modded).toBeGreaterThan(10); // boss-luck rolls hot
    // a specific affix contributes
    const sword = makeItem(w, 'iron-longsword');
    sword.affix = { name: 'of the Bull', stat: 'attack', amount: 2 };
    const mc = w.characters[w.mcId];
    addToContainer(w, sword, mc);
    mc.equipment['main-hand'] = sword.id;
    sword.equippedBy = mc.id;
    expect(affixMod(w, mc, 'attack')).toBe(2);
    expect(affixMod(w, mc, 'evasion')).toBe(0);
  });
});

describe('choice quests', () => {
  it('campaign stage 3 demands a decision and pays it out', () => {
    const w = freshWorld();
    // fast-forward: complete stages 1-2
    for (let stage = 1; stage <= 2; stage++) {
      const q = Object.values(w.quests).find((x) => x.isMain && x.stage === stage)!;
      travelTo(w, q.giverLocation);
      acceptQuest(w, q.id);
      w.dungeons[(q.objectives[0] as { dungeonId: string }).dungeonId].bossDefeated = true;
      checkQuests(w);
      turnInQuest(w, q.id);
    }
    const q3 = Object.values(w.quests).find((x) => x.isMain && x.stage === 3)!;
    expect(q3.choice).toBeTruthy();
    travelTo(w, q3.giverLocation);
    acceptQuest(w, q3.id);
    w.dungeons['DUN_OLDQUARTER_002'].bossDefeated = true;
    checkQuests(w);
    // no choice, no coin
    expect(turnInQuest(w, q3.id)).toMatch(/decision/);
    expect(q3.status).not.toBe('completed');
    const mc = w.characters[w.mcId];
    const money = mc.money;
    expect(turnInQuest(w, q3.id, 'varga')).toBeNull();
    expect(q3.choice!.chosen).toBe('varga');
    expect(mc.money).toBe(money + 3000 + 2500); // base + Varga's price
    expect(mc.factionReputation['FAC_REDKNIVES']).toBeGreaterThan(0);
    expect(mc.knowledge.some((k) => k.fact.includes('Varga bought the Hierophant'))).toBe(true);
  });
});

describe('guild membership', () => {
  it('joins, climbs ranks through quests, earns discounts and a title', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 100000;
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_IRONMARKET_SQ');
    travelTo(w, 'LOC_FIGHTGUILD');
    expect(joinGuild(w, 'fighters')).toBeNull();
    expect(guildRank(w, 'fighters')).toBe(0);
    expect(guildTitle(w, 'fighters')).toBe('Initiate');
    expect(joinGuild(w, 'fighters')).toMatch(/Already a member/);
    // climb all three ranks
    for (let rank = 1; rank <= 3; rank++) {
      const q = Object.values(w.quests).find((x) => x.guild === 'fighters' && x.guildRank === rank)!;
      expect(q, `rank ${rank} quest posted`).toBeTruthy();
      travelTo(w, q.giverLocation);
      acceptQuest(w, q.id);
      for (const o of q.objectives) {
        if (o.kind === 'kill') w.killCounts[o.templateKey] = (w.killCounts[o.templateKey] ?? 0) + o.count;
      }
      checkQuests(w);
      expect(turnInQuest(w, q.id)).toBeNull();
      expect(guildRank(w, 'fighters')).toBe(rank);
    }
    expect(guildTitle(w, 'fighters')).toBe('Guild Champion');
    expect(mc.title).toBe('Guild Champion');
    expect(guildTrainingDiscount(w, 'LOC_FIGHTGUILD')).toBeCloseTo(0.3);
    // the discount actually applies
    mc.xp = 10000;
    const full = trainingCost(mc.level);
    const money = mc.money;
    expect(trainAt(w, 'LOC_FIGHTGUILD', mc.id)).toBeNull();
    expect(money - mc.money).toBe(Math.round(full * 0.7));
    void advanceGuild;
    void GUILDS;
  });
});
