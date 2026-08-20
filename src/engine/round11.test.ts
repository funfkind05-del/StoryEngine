// Round 11: three new classes, the three-evolution career, the
// hearth (move-ins, evenings, cooling), fifteen job templates, the
// second campaign spine, and a bestiary that climbs to 100.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { CLASSES, MAX_LEVEL } from './rules';
import { SKILLS, SPELLS } from './combat';
import {
  ASCENSIONS, CALLINGS, CALLING_LEVEL, TRANSCENDENCES, TRANSCENDENCE_LEVEL,
  chooseAscension, chooseCalling, chooseTranscendence,
} from './progression';
import { CAMPAIGN, CAMPAIGN2 } from './campaign';
import { MONSTERS } from './monsters';
import { COMPANION_ARCS } from './companions';
import {
  AFFECTION_FLOOR, HEARTH_ACTIVITIES, NEGLECT_DAYS, dailyHearthTick, hearthTime, inviteToLive,
} from './hearth';
import { buyFirstHome } from './household';
import { relationshipBetween } from './world';
import { JOB_TEMPLATES } from './quests';
import { Rng } from './rng';

function freshWorld() {
  return buildSeedWorld();
}

describe('twelve classes, three evolutions', () => {
  it('every playable class has a trainer, 12 unlock rungs to L65, and 2 of each evolution', () => {
    const w = freshWorld();
    for (const def of Object.values(CLASSES)) {
      if (def.key === 'commoner') continue;
      const hall = Object.values(w.locations).find((l) => l.trainerFor === def.key || (def.key === 'priest' && l.temple));
      expect(hall, `${def.key} trains somewhere`).toBeTruthy();
      const levels = Object.keys(def.unlocks).map(Number);
      expect(Math.max(...levels), def.key).toBe(65);
      for (const key of Object.values(def.unlocks)) expect(SKILLS[key] ?? SPELLS[key], `${def.key}: ${key}`).toBeTruthy();
      expect(CALLINGS.filter((c) => c.charClass === def.key), def.key).toHaveLength(2);
      expect(ASCENSIONS.filter((c) => c.charClass === def.key), def.key).toHaveLength(2);
      expect(TRANSCENDENCES.filter((c) => c.charClass === def.key), def.key).toHaveLength(2);
    }
    expect(MAX_LEVEL).toBe(100);
  });

  it('the career ladder: calling at 10, ascension at 25, transcendence at 40 — in order, at the hall, for coin', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 50000;
    w.partyLocation = 'LOC_FIGHTGUILD'; // fighter hall
    expect(chooseCalling(w, mc.id, 'vanguard')).toMatch(/level 10/);
    mc.level = CALLING_LEVEL;
    const hpBefore = mc.hp.max;
    expect(chooseCalling(w, mc.id, 'vanguard')).toBeNull();
    expect(mc.calling).toBe('vanguard');
    expect(mc.hp.max).toBe(hpBefore + 4);
    expect(chooseCalling(w, mc.id, 'bulwark')).toMatch(/already answered/);
    // transcendence refuses the unascended
    mc.level = TRANSCENDENCE_LEVEL;
    expect(chooseTranscendence(w, mc.id, 'the-mountain')).toMatch(/ascension/);
    mc.level = 25;
    expect(chooseAscension(w, mc.id, 'warlord')).toBeNull();
    mc.level = TRANSCENDENCE_LEVEL;
    expect(chooseTranscendence(w, mc.id, 'the-mountain')).toBeNull();
    expect(mc.transcendence).toBe('the-mountain');
    expect(mc.title).toBe('The Mountain That Walks');
  });

  it('the new trades teach at their halls: pit, lamp hall, graverow', () => {
    const w = freshWorld();
    expect(w.locations['LOC_FIGHTPIT'].trainerFor).toBe('berserker');
    expect(w.locations['LOC_LAMPHALL'].trainerFor).toBe('paladin');
    expect(w.locations['LOC_GRAVEROW'].trainerFor).toBe('necromancer');
  });
});

describe('the hearth', () => {
  function homeWithLyra() {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 2000;
    expect(buyFirstHome(w)).toBeNull();
    const home = Object.values(w.locations).find((l) => l.household)!;
    w.partyLocation = home.id;
    const lyra = w.characters['CHAR_LYRA'];
    const rel = relationshipBetween(w, lyra.id, w.mcId);
    Object.assign(rel, { affection: 7, trust: 7, attraction: 6, commitment: 4, respect: 5 });
    return { w, mc, lyra, home };
  }

  it('a lover can move in; a stranger cannot', () => {
    const { w, lyra, home } = homeWithLyra();
    const mara = w.characters['CHAR_MARA'];
    expect(inviteToLive(w, mara.id)).toMatch(/more than/);
    expect(inviteToLive(w, lyra.id)).toBeNull();
    expect(home.household!.residents).toContain(lyra.id);
    expect(inviteToLive(w, lyra.id)).toMatch(/already lives/);
  });

  it('evenings are stage-gated, once a day, and the house remembers', () => {
    const { w, lyra } = homeWithLyra();
    expect(hearthTime(w, lyra.id, 'hearth-meal')).toBeNull(); // close+ stage
    expect(hearthTime(w, lyra.id, 'hearth-bath')).toMatch(/one such evening/); // the day is spent
    w.time.day += 1;
    expect(hearthTime(w, lyra.id, 'hearth-night')).toBeNull(); // lover stage
    expect(w.nightTogether?.npcId).toBe(lyra.id);
    expect(w.events.some((e) => e.kind === 'hearth')).toBe(true);
    // a mere friend is refused the bath
    const mara = w.characters['CHAR_MARA'];
    const rel = relationshipBetween(w, mara.id, w.mcId);
    Object.assign(rel, { affection: 3, trust: 3 });
    mara.inParty = true;
    mara.location = w.partyLocation;
    expect(hearthTime(w, mara.id, 'hearth-bath')).toMatch(/not where things stand/);
  });

  it('untended hearts cool by a point a week, down to a floor', () => {
    const { w, lyra } = homeWithLyra();
    const rel = lyra.relationships[w.mcId]!;
    w.lastAttentionDay = { [lyra.id]: w.time.day };
    const start = rel.affection;
    w.time.day += NEGLECT_DAYS;
    dailyHearthTick(w);
    expect(rel.affection).toBe(start - 1);
    expect(w.events.some((e) => e.kind === 'hearth.cooling')).toBe(true);
    // the floor holds
    rel.affection = AFFECTION_FLOOR;
    w.time.day += NEGLECT_DAYS;
    dailyHearthTick(w);
    expect(rel.affection).toBe(AFFECTION_FLOOR);
  });

  it('every companion arc now runs four stages, ending at the hearth', () => {
    for (const arc of COMPANION_ARCS) {
      expect(arc.stages, arc.charId).toHaveLength(4);
      const last = arc.stages[3];
      expect(last.needsTrust, arc.charId).toBeGreaterThanOrEqual(8);
      expect((last.bond.commitment ?? 0), arc.charId).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the second spine and the deep bestiary', () => {
  it('arc II runs stages 9–16 over real places, monsters, and the Rootways', () => {
    const w = freshWorld();
    expect(CAMPAIGN).toHaveLength(8);
    expect(CAMPAIGN2).toHaveLength(8);
    expect(w.dungeons['DUN_DEEP_002']).toBeTruthy();
    for (const st of CAMPAIGN2) {
      if (st.dungeonId) expect(w.dungeons[st.dungeonId], st.title).toBeTruthy();
      for (const o of st.objectives ?? []) {
        if (o.kind === 'kill') expect(MONSTERS[o.templateKey], `${st.title}: ${o.templateKey}`).toBeTruthy();
        if (o.kind === 'visit') expect(w.locations[o.locationId], `${st.title}: ${o.locationId}`).toBeTruthy();
      }
      expect(w.locations[st.giverLocation], st.title).toBeTruthy();
    }
  });

  it('the bestiary climbs to 100 with valid dice and tables', () => {
    const levels = Object.values(MONSTERS).map((m) => m.level);
    expect(Math.max(...levels)).toBe(100);
    const past50 = Object.values(MONSTERS).filter((m) => m.level > 50);
    expect(past50.length).toBeGreaterThanOrEqual(12);
    for (const m of past50) {
      expect(m.damage, m.key).toMatch(/^\d+d\d+(\+\d+)?$/);
      expect(m.xp, m.key).toBeGreaterThan(0);
    }
  });

  it('all fifteen job templates ground in real monsters, places, and givers', () => {
    const w = freshWorld();
    expect(JOB_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    for (let t = 0; t < JOB_TEMPLATES.length; t++) {
      for (let roll = 0; roll < 6; roll++) {
        const q = JOB_TEMPLATES[t](w, new Rng(1000 + t * 17 + roll));
        if (!q) continue; // the warden bounty needs an open dungeon in reach
        expect(w.locations[q.giverLocation], q.title).toBeTruthy();
        expect(q.reward.money, q.title).toBeGreaterThan(0);
        for (const o of q.objectives) {
          if (o.kind === 'kill') expect(MONSTERS[o.templateKey], `${q.title}: ${o.templateKey}`).toBeTruthy();
          if (o.kind === 'visit' || o.kind === 'deliver') expect(w.locations[o.locationId], `${q.title}: ${o.locationId}`).toBeTruthy();
          if (o.kind === 'clear-boss') expect(w.dungeons[o.dungeonId], q.title).toBeTruthy();
        }
      }
    }
  });

  it('hearth activities all carry prose and gates', () => {
    for (const a of HEARTH_ACTIVITIES) {
      expect(a.line(({ name: 'Her' } as never), ({ name: 'Him' } as never)).length).toBeGreaterThan(40);
      expect(['close', 'lover'].includes(a.minStage)).toBe(true);
    }
  });
});
