// Tests for the compile/export pipeline, quests & jobs, faction
// consequences, functional household rooms, and companion moments.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { DEFAULT_COMPILE, compileHtml, compileMarkdown, compileStats, renderSceneText } from './compile';
import {
  acceptQuest,
  activeQuests,
  checkQuests,
  objectiveLabel,
  offeredQuestsAt,
  refreshJobs,
  turnInQuest,
} from './quests';
import { brewAtHome, buyUpgrade, cookAtHome, repairAtHome, sparAtHome } from './household';
import { maybeCompanionMoment } from './moments';
import { shopPriceMult } from './rules';
import { rollCityEncounter } from './encounter';
import { resolveRound, startCombat } from './combat';
import { migrateWorld } from './saves';
import { travelTo } from './world';
import type { WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 31337;
  return w;
}

describe('manuscript compile', () => {
  it('renders tokens as names and strips sim scaffolding', () => {
    const text = `Kael entered the @[Broken Crown Tavern](LOC_DOCK_0042).\n\n---\n[SIM NOTES]\n[Day 1] stuff happened\n---\n\nHe sat down.`;
    const out = renderSceneText(text, DEFAULT_COMPILE);
    expect(out).toContain('the Broken Crown Tavern');
    expect(out).not.toContain('LOC_DOCK_0042');
    expect(out).not.toContain('SIM NOTES');
    expect(out).toContain('He sat down.');
    // stat blocks survive by default, are stripped on request
    const withBlock = `Text.\n\n╔══╗\n║ X ║\n╚══╝\n\nMore.`;
    expect(renderSceneText(withBlock, DEFAULT_COMPILE)).toContain('╔');
    expect(renderSceneText(withBlock, { ...DEFAULT_COMPILE, keepStatBlocks: false })).not.toContain('╔');
  });

  it('compiles chapters in order with stats', () => {
    const w = freshWorld();
    w.scenes.push({ id: 'SCN_X', chapter: 2, title: 'Later', pov: w.mcId, day: 3, startMinute: 0, location: 'LOC_DOCK_0042', participants: [], text: 'Chapter two begins.', order: 2 });
    const md = compileMarkdown(w, 'Blackwall', DEFAULT_COMPILE);
    expect(md.indexOf('## Chapter 1')).toBeLessThan(md.indexOf('## Chapter 2'));
    expect(md).toContain('Chapter two begins.');
    const html = compileHtml(w, 'Blackwall', DEFAULT_COMPILE);
    expect(html).toContain('<h2>Chapter 2</h2>');
    expect(compileStats(w, DEFAULT_COMPILE).words).toBeGreaterThan(50);
  });
});

describe('quests', () => {
  it('offers seeded work, tracks kill objectives from acceptance, and pays on turn-in', () => {
    const w = freshWorld();
    const tobbeJob = offeredQuestsAt(w, 'LOC_DOCK_0042').find((q) => q.title.includes('Cellar Problem'))!;
    expect(tobbeJob).toBeTruthy();
    // kills before acceptance must not count
    w.killCounts['giant-rat'] = 10;
    expect(acceptQuest(w, tobbeJob.id)).toBeNull();
    expect(activeQuests(w)).toHaveLength(1);
    checkQuests(w);
    expect(tobbeJob.status).toBe('active');
    expect(objectiveLabel(w, tobbeJob.objectives[0])).toContain('(0/4)');
    // now kill four rats
    w.killCounts['giant-rat'] += 4;
    checkQuests(w);
    expect(tobbeJob.status).toBe('ready');
    const before = w.characters[w.mcId].money;
    const xpBefore = w.characters[w.mcId].xp;
    expect(turnInQuest(w, tobbeJob.id)).toBeNull();
    expect(w.characters[w.mcId].money).toBe(before + 120);
    expect(w.characters[w.mcId].xp).toBe(xpBefore + 50);
    expect(tobbeJob.status).toBe('completed');
  });

  it('boss quests complete from dungeon state; faction rewards apply', () => {
    const w = freshWorld();
    const sellaQuest = offeredQuestsAt(w, 'LOC_TEMPLE')[0];
    travelTo(w, 'LOC_RATCATCHER');
    expect(acceptQuest(w, sellaQuest.id)).toMatch(/must be where/);
    travelTo(w, 'LOC_IRONMARKET_SQ');
    travelTo(w, 'LOC_TEMPLE');
    expect(acceptQuest(w, sellaQuest.id)).toBeNull();
    w.dungeons['DUN_OLDQUARTER_001'].bossDefeated = true;
    checkQuests(w);
    expect(sellaQuest.status).toBe('ready');
    expect(turnInQuest(w, sellaQuest.id)).toBeNull();
    expect(w.characters[w.mcId].factionReputation['FAC_VEILEDFLAME']).toBe(2);
  });

  it('the boards generate procedural jobs over time', () => {
    const w = freshWorld();
    const before = Object.keys(w.quests).length;
    for (let d = 0; d < 20; d++) {
      w.time.day += 1;
      refreshJobs(w);
    }
    expect(Object.keys(w.quests).length).toBeGreaterThan(before);
  });
});

describe('faction consequences', () => {
  it('killing Red Knives costs reputation and invites vendettas and worse prices', () => {
    const w = freshWorld();
    const combat = startCombat(w, {
      seed: 5, description: '2 cutters', monsters: [{ templateKey: 'red-knife-cutter', count: 2 }],
      source: 'city', locationId: w.partyLocation,
    });
    w.characters[w.mcId].attack = 30; // end it fast
    w.characters['CHAR_LYRA'].attack = 30;
    let guard = 0;
    while (combat.outcome === 'ongoing' && guard++ < 40) {
      const living = combat.monsters.find((m) => m.alive && !m.fled);
      resolveRound(w, combat.partyIds.map((id) => ({ actor: id, type: 'attack' as const, target: living?.id })));
    }
    expect(combat.outcome).toBe('victory');
    const mc = w.characters[w.mcId];
    expect(mc.factionReputation['FAC_REDKNIVES']).toBeLessThanOrEqual(-2);
    // grudging prices at a Knives-run fence
    mc.factionReputation['FAC_REDKNIVES'] = -4;
    expect(shopPriceMult(w, 'LOC_SALTWAREHOUSE', mc)).toBe(1.25);
    mc.factionReputation['FAC_REDKNIVES'] = -7;
    expect(shopPriceMult(w, 'LOC_SALTWAREHOUSE', mc)).toBe(Infinity);
    // vendetta encounters show up on Knives turf
    travelTo(w, 'LOC_RATCATCHER');
    w.encounterFrequency = 'chaotic';
    let vendettas = 0;
    for (let i = 0; i < 60; i++) {
      w.pendingEncounter = null;
      const e = rollCityEncounter(w);
      if (e?.kind === 'encounter.vendetta') vendettas++;
    }
    expect(vendettas).toBeGreaterThan(0);
  });

  it('good standing earns friendly prices', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.factionReputation['FAC_COINGUILD'] = 6;
    expect(shopPriceMult(w, 'LOC_FORGE', mc)).toBeLessThan(1); // Ironmarket is Coin Guild turf
  });
});

describe('functional household rooms', () => {
  it('kitchen feeds, yard trains, alchemy brews, workshop repairs — each gated by its upgrade', async () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 20000;
    expect(cookAtHome(w)).toMatch(/No home/);
    const { buyFirstHome: buyHome } = await import('./household');
    expect(buyHome(w)).toBeNull();
    travelTo(w, 'LOC_HOME');
    expect(cookAtHome(w)).toMatch(/No kitchen/);
    expect(buyUpgrade(w, 'kitchen')).toBeNull(); // a bought flat can take a kitchen
    mc.needs.hunger = 80;
    expect(cookAtHome(w)).toBeNull();
    expect(mc.needs.hunger).toBeLessThan(30);
    expect(sparAtHome(w)).toMatch(/No training yard/);
    // brute-force tier up to unlock yard/alchemy/workshop
    const home = w.locations['LOC_HOME'].household!;
    home.tier = 'fortified-residence';
    expect(buyUpgrade(w, 'training-yard')).toBeNull();
    expect(buyUpgrade(w, 'alchemy-room')).toBeNull();
    expect(buyUpgrade(w, 'workshop')).toBeNull();
    const xpBefore = mc.xp;
    expect(sparAtHome(w)).toBeNull();
    expect(mc.xp).toBeGreaterThan(xpBefore);
    expect(sparAtHome(w)).toMatch(/enough bruises/); // once per day
    expect(brewAtHome(w)).toBeNull();
    expect(home.storage.map((i) => w.items[i]?.proto)).toContain('minor-healing-potion');
    expect(brewAtHome(w)).toMatch(/cool until tomorrow/);
    // workshop repair
    const sword = w.items['ITEM_SWORD_0001'];
    sword.durability!.current = 10;
    sword.broken = true;
    expect(repairAtHome(w, sword.id)).toBeNull();
    expect(sword.durability!.current).toBe(sword.durability!.max);
    expect(sword.broken).toBe(false);
  });
});

describe('companion moments', () => {
  it('fires at most once a day, picks a companion, and carries a state-driven hook', () => {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    lyra.hp.current = 3; // wounded → strong candidate
    let fired = 0;
    for (let d = 0; d < 40 && fired < 3; d++) {
      w.time.day += 1;
      w.time.minute = (w.time.minute + 137) % 1440;
      const m = maybeCompanionMoment(w);
      if (m) {
        fired++;
        expect(m.npcId).toBe('CHAR_LYRA');
        expect(m.hook.length).toBeGreaterThan(20);
        expect(maybeCompanionMoment(w)).toBeNull(); // pending blocks another
        w.pendingMoment = null;
        expect(maybeCompanionMoment(w)).toBeNull(); // once per day
      }
    }
    expect(fired).toBeGreaterThan(0);
  });
});

describe('migration', () => {
  it('old saves gain quests and kill counts', () => {
    const w = freshWorld();
    const raw = JSON.parse(JSON.stringify(w)) as WorldState;
    delete (raw as Partial<WorldState>).quests;
    delete (raw as Partial<WorldState>).killCounts;
    const migrated = migrateWorld(raw);
    expect(migrated.killCounts).toEqual({});
    expect(Object.keys(migrated.quests).length).toBeGreaterThan(0);
  });
});

describe('bestiary art', () => {
  it('every monster template has a drawn plate', async () => {
    const { PLATE_KEYS } = await import('../components/MonsterArt');
    const { MONSTERS } = await import('./monsters');
    for (const [key, t] of Object.entries(MONSTERS)) {
      const covered = PLATE_KEYS.includes(key) || !!t.art;
      expect(covered, `no plate or art archetype for ${key}`).toBe(true);
    }
  });
});
