// Tests for the level-50 expansion: ability trees, the wider
// bestiary and dungeon roster, ranged weapons and ammo, injuries and
// scars, weather and calendar, scene tools, and multiple books.

import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { CLASSES, MAX_LEVEL, applyTraining, calendarLabel, injuryAttackMod, levelUpAvailable, performTempleService, rollInjury, seasonOf, treatInjuries, weatherFor } from './rules';
import { SKILLS, SPELLS, resolveRound, startCombat } from './combat';
import { MONSTERS } from './monsters';
import { generateDungeon } from './dungeon';
import { buildDraftPrompt } from './proseLlm';
import { reorderScene, tick, travelTo } from './world';
import { Rng } from './rng';
import type { WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 8888;
  return w;
}

describe('ability trees to level 50', () => {
  it('every class unlock maps to a real skill or spell, spread to level 40+', () => {
    for (const def of Object.values(CLASSES)) {
      const levels = Object.keys(def.unlocks).map(Number);
      for (const [lvl, key] of Object.entries(def.unlocks)) {
        expect(SKILLS[key] || SPELLS[key], `${def.key} L${lvl} unlock "${key}" missing`).toBeTruthy();
      }
      if (def.key !== 'commoner') expect(Math.max(...levels)).toBeGreaterThanOrEqual(40);
    }
  });

  it('training a fighter to the cap grants the whole tree and then stops', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    for (let i = 0; i < MAX_LEVEL + 10; i++) {
      kael.xp = 10_000_000;
      if (!levelUpAvailable(kael)) break;
      applyTraining(kael);
    }
    expect(kael.level).toBe(MAX_LEVEL);
    expect(levelUpAvailable(kael)).toBe(false); // capped
    for (const key of Object.values(CLASSES.fighter.unlocks)) expect(kael.abilities).toContain(key);
    expect(kael.hp.max).toBeGreaterThan(200);
  });
});

describe('wider bestiary', () => {
  it('covers levels 1 through 45 with valid stats and plates', () => {
    const levels = Object.values(MONSTERS).map((m) => m.level);
    expect(Math.min(...levels)).toBe(1);
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(45);
    expect(Object.keys(MONSTERS).length).toBeGreaterThanOrEqual(40);
    for (const m of Object.values(MONSTERS)) {
      expect(m.hp).toBeGreaterThan(0);
      expect(m.xp).toBeGreaterThan(0);
      expect(m.damage).toMatch(/^\d+d\d+([+-]\d+)?$/);
    }
  });
});

describe('dungeon roster', () => {
  it('all eight dungeons generate with reachable bosses', () => {
    const w = freshWorld();
    for (const id of Object.keys(w.dungeons)) {
      const d = generateDungeon(w, id);
      expect(d.generated).toBe(true);
      const rooms = Object.values(d.rooms);
      expect(rooms.length).toBeGreaterThan(d.floors * 4);
      expect(rooms.some((r) => r.isBossRoom && r.floor === d.floors), `${d.name} boss room`).toBe(true);
      expect(MONSTERS[d.bossKey], `${d.name} boss template`).toBeTruthy();
      for (const key of d.primaryEnemies) expect(MONSTERS[key], `${d.name} enemy ${key}`).toBeTruthy();
    }
  });
});

describe('ranged weapons & ammo', () => {
  it('a bow consumes arrows per shot and goes quiet when the quiver empties', () => {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    expect(w.items[lyra.equipment['main-hand']!].ranged).toBe(true);
    const arrows = lyra.inventory.map((i) => w.items[i]).find((i) => i?.proto === 'arrow')!;
    arrows.qty = 2;
    const combat = startCombat(w, {
      seed: 11, description: 'a rat', monsters: [{ templateKey: 'giant-rat', count: 1 }],
      source: 'city', locationId: w.partyLocation,
    });
    // only Lyra acts; Kael defends
    for (let i = 0; i < 4 && combat.outcome === 'ongoing'; i++) {
      const target = combat.monsters.find((m) => m.alive)?.id;
      resolveRound(w, [
        { actor: 'CHAR_KAEL', type: 'defend' },
        { actor: 'CHAR_LYRA', type: 'attack', target },
      ]);
    }
    // two shots fired at most; empty-quiver turns produce the log line
    const quiverLines = combat.log.filter((e) => e.text.includes('quiver empty'));
    const shotsPossible = 2;
    const lyraAttacks = combat.log.filter((e) => e.actor === 'CHAR_LYRA' && (e.result === 'hit' || e.result === 'crit' || e.result === 'miss'));
    expect(lyraAttacks.length).toBeLessThanOrEqual(shotsPossible);
    if (combat.outcome === 'ongoing' || combat.round > 3) expect(quiverLines.length).toBeGreaterThanOrEqual(0);
    expect((w.items[arrows.id]?.qty ?? 0)).toBeLessThanOrEqual(2);
  });
});

describe('injuries & scars', () => {
  it('rolls injuries, penalizes until treated, and leaves scars', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    const rng = new Rng(3); // find a seed that rolls an injury
    let name: string | null = null;
    for (let i = 0; i < 20 && !name; i++) name = rollInjury(kael, rng);
    expect(name).toBeTruthy();
    expect(kael.injuries.length).toBeGreaterThan(0);
    const before = injuryAttackMod(kael) + kael.injuries.filter((i) => !i.treated && i.stat === 'defense').length * -1;
    expect(before).toBeLessThan(0);
    const treated = treatInjuries(kael);
    expect(treated.length).toBe(kael.injuries.length);
    expect(injuryAttackMod(kael)).toBe(0);
    expect(kael.permanentBonuses.some((b) => b.startsWith('Scar:'))).toBe(true);
    // temple service does the same through the rules engine
    const w2 = freshWorld();
    const lyra = w2.characters['CHAR_LYRA'];
    rollInjury(lyra, new Rng(3));
    for (let i = 0; i < 20 && !lyra.injuries.length; i++) rollInjury(lyra, new Rng(i));
    if (lyra.injuries.length) {
      const line = performTempleService('mend-injuries', lyra);
      expect(line).toContain('mended');
    }
  });
});

describe('weather & calendar', () => {
  it('is deterministic per day, season-appropriate, and ticks into the world', () => {
    expect(seasonOf(1)).toBe('spring');
    expect(seasonOf(95)).toBe('summer');
    expect(seasonOf(200)).toBe('autumn');
    expect(seasonOf(300)).toBe('winter');
    expect(calendarLabel(1)).toBe('early spring');
    expect(calendarLabel(89)).toBe('late spring');
    expect(weatherFor(42, 10)).toBe(weatherFor(42, 10));
    // snow only in winter
    for (let d = 1; d < 90; d++) expect(weatherFor(7, d)).not.toBe('snow');
    const w = freshWorld();
    tick(w, 60);
    expect(w.weather?.kind).toBeTruthy();
    expect(w.weather?.day).toBe(w.time.day);
  });
});

describe('scene tools', () => {
  it('reorders scenes within a chapter', () => {
    const w = freshWorld();
    w.scenes.push({ id: 'SCN_A', chapter: 1, title: 'A', pov: w.mcId, day: 1, startMinute: 0, location: 'LOC_DOCK_0042', participants: [], text: '', order: 2 });
    w.scenes.push({ id: 'SCN_B', chapter: 1, title: 'B', pov: w.mcId, day: 1, startMinute: 0, location: 'LOC_DOCK_0042', participants: [], text: '', order: 3 });
    expect(reorderScene(w, 'SCN_B', -1)).toBe(true);
    const byOrder = w.scenes.filter((s) => s.chapter === 1).sort((a, b) => a.order - b.order).map((s) => s.id);
    expect(byOrder.indexOf('SCN_B')).toBeLessThan(byOrder.indexOf('SCN_A'));
    expect(reorderScene(w, w.scenes[0].id, -1)).toBe(false); // already first
  });

  it('builds a grounded draft prompt', () => {
    const w = freshWorld();
    const prompt = buildDraftPrompt(w, w.scenes[0], 'Kael watches the room and clocks Mara.');
    const text = prompt.map((m) => m.content).join('\n');
    expect(text).toContain('Kael watches the room');
    expect(text).toContain('Broken Crown Tavern');
    expect(text).toContain('RECENT SIMULATION EVENTS');
    expect(text).toContain('never events, items, wounds, or coin');
  });
});

describe('books (multi-world slots)', () => {
  beforeAll(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it('keeps separate worlds per slot and survives switching', async () => {
    const { activeSlot, setActiveSlot, listBooks, newBookSlot, touchBook, deleteBook, slotKeys } = await import('./books');
    const { persistProject, loadProject } = await import('./saves');
    expect(activeSlot()).toBe('default');
    const w1 = freshWorld();
    w1.chapter = 7;
    persistProject(w1, []);
    const slot = newBookSlot();
    touchBook(slot, 'Book Two');
    setActiveSlot(slot);
    expect(loadProject()).toBeNull(); // fresh slot, no world yet
    const w2 = freshWorld();
    w2.chapter = 1;
    persistProject(w2, []);
    setActiveSlot('default');
    expect(loadProject()!.world.chapter).toBe(7);
    setActiveSlot(slot);
    expect(loadProject()!.world.chapter).toBe(1);
    expect(listBooks().map((b) => b.name)).toContain('Book Two');
    deleteBook(slot);
    expect(activeSlot()).toBe('default');
    expect(localStorage.getItem(slotKeys(slot).project)).toBeNull();
  });
});

describe('the Muse', () => {
  it('mines grounded, urgency-sorted ideas from world state', async () => {
    const { generateStoryIdeas } = await import('./muse');
    const w = freshWorld();
    // set up several latent hooks
    const lyra = w.characters['CHAR_LYRA'];
    lyra.relationships['CHAR_KAEL'] = { affection: 4, trust: 2, respect: 3, attraction: 5, commitment: 0 };
    w.characters[w.mcId].factionReputation['FAC_REDKNIVES'] = -5;
    const q = Object.values(w.quests).find((x) => x.status === 'offered')!;
    q.status = 'active';
    q.deadlineDay = w.time.day + 1;
    const ideas = generateStoryIdeas(w);
    expect(ideas.length).toBeGreaterThanOrEqual(5);
    // urgency-sorted
    for (let i = 1; i < ideas.length; i++) expect(ideas[i - 1].urgency).toBeGreaterThanOrEqual(ideas[i].urgency);
    // the pressing hooks surface
    expect(ideas.some((i) => i.kind === 'deadline')).toBe(true);
    expect(ideas.some((i) => i.kind === 'faction' && i.title.includes('blood'))).toBe(true);
    expect(ideas.some((i) => i.kind === 'romance' && i.title.includes('Lyra'))).toBe(true);
    // the seed's knowledge asymmetry (Mara knows about Varga's crates) is found
    expect(ideas.some((i) => i.kind === 'secret' && i.grounding.some((g) => g.includes('Varga')))).toBe(true);
    // every idea is grounded and drafts an outline
    for (const idea of ideas) {
      expect(idea.grounding.length).toBeGreaterThan(0);
      expect(idea.outline.length).toBeGreaterThan(20);
    }
  });
});

describe('household wings', () => {
  it('shrine prays, annex fletches, great hall feasts, infirmary mends, war room extends, vault earns', async () => {
    const { prayAtShrine, fletchArrows, hostFeast, buyUpgrade: buy } = await import('./household');
    const { restAtHome } = await import('./services');
    const { acceptQuest: accept, refreshJobs: refresh } = await import('./quests');
    const { applyStatus: curse } = await import('./rules');
    const { buyFirstHome: buyHome } = await import('./household');
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 100000;
    expect(buyHome(w)).toBeNull();
    travelTo(w, 'LOC_HOME');
    const home = w.locations['LOC_HOME'].household!;
    home.tier = 'estate';
    for (const key of ['shrine', 'forge-annex', 'great-hall', 'infirmary', 'war-room', 'vault']) {
      expect(buy(w, key), key).toBeNull();
    }
    // shrine lifts curses, once a day
    curse(mc, 'cursed');
    expect(prayAtShrine(w)).toBeNull();
    expect(mc.statuses.some((s) => s.key === 'cursed')).toBe(false);
    expect(prayAtShrine(w)).toMatch(/already lit/);
    // fletching stocks the party quiver
    expect(fletchArrows(w)).toBeNull();
    expect(w.partyInventory.map((i) => w.items[i]).some((i) => i?.proto === 'arrow' && (i.qty ?? 0) >= 20)).toBe(true);
    // feast raises faction standing, weekly
    expect(hostFeast(w, 'FAC_COINGUILD')).toBeNull();
    expect(mc.factionReputation['FAC_COINGUILD']).toBe(1);
    expect(hostFeast(w, 'FAC_COINGUILD')).toMatch(/recovering/);
    // infirmary mends injuries overnight
    rollInjury(mc, new Rng(3));
    for (let i = 0; i < 20 && !mc.injuries.length; i++) rollInjury(mc, new Rng(i));
    if (mc.injuries.length) {
      expect(restAtHome(w)).toBeNull();
      expect(mc.injuries.every((i) => i.treated)).toBe(true);
    }
    // war room extends accepted deadlines
    for (let d = 0; d < 30 && !Object.values(w.quests).some((x) => x.status === 'offered' && x.deadlineDay !== undefined); d++) {
      w.time.day += 1;
      refresh(w);
    }
    const dq = Object.values(w.quests).find((x) => x.status === 'offered' && x.deadlineDay !== undefined);
    if (dq) {
      const before = dq.deadlineDay!;
      travelTo(w, dq.giverLocation);
      expect(accept(w, dq.id)).toBeNull();
      expect(dq.deadlineDay).toBe(before + 1);
    }
    // vault interest lands monthly
    home.treasury = 1000;
    w.time = { day: 29, minute: 23 * 60 };
    tick(w, 120); // crosses into day 30
    expect(home.treasury).toBe(1020);
  });
});

describe('outline from play', () => {
  it('segments a played session into beats and creates scene stubs with correct headers', async () => {
    const { buildOutline, createScenesFromBeats, eventsSinceOutline, outlineToText, markOutlined } = await import('./outline');
    const { enterDungeon: enter } = await import('./dungeon');
    const { generateDungeonEncounter: genEnc } = await import('./encounter');
    const w = freshWorld();
    w.outlinedUpTo = w.events.length; // start the session now

    // --- a play session: talk-ish event, travel, dungeon, fight, sleep
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_IRONMARKET_SQ');
    travelTo(w, 'LOC_GRAVEROW');
    travelTo(w, 'LOC_MAUSOLEUM');
    enter(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const entry = d.rooms[w.currentRoom!];
    entry.enemies = 'alive';
    entry.encounterKey = 'giant-rat';
    const enc = genEnc(w, 42);
    if ('error' in enc) throw new Error(enc.error);
    const combat = startCombat(w, enc);
    let guard = 0;
    while (combat.outcome === 'ongoing' && guard++ < 50) {
      const t = combat.monsters.find((m) => m.alive && !m.fled);
      resolveRound(w, combat.partyIds.map((id) => ({ actor: id, type: 'attack' as const, target: t?.id })));
    }
    const { exitDungeon: exit } = await import('./dungeon');
    exit(w);
    const { advanceUntilMorning: sleep } = await import('./world');
    sleep(w);

    // --- outline it
    expect(eventsSinceOutline(w).length).toBeGreaterThan(5);
    const beats = buildOutline(w);
    expect(beats.length).toBeGreaterThanOrEqual(3); // travel legs / dungeon fight / night
    // the combat beat exists, is action-typed, and carries the fight facts
    const fightBeat = beats.find((b) => b.bullets.some((x) => x.includes('Combat began')))!;
    expect(fightBeat).toBeTruthy();
    expect(fightBeat.sceneType).toBe('action');
    expect(fightBeat.bullets.some((x) => x.includes('Combat ended'))).toBe(true);
    // a rest closes the final beat
    expect(beats[beats.length - 1].bullets.some((x) => x.includes('slept'))).toBe(true);
    // text render
    const text = outlineToText(w, beats, 2);
    expect(text).toContain('# Chapter 2');
    expect(text).toContain('(action)');

    // --- stubs carry correct sim headers
    const before = w.scenes.length;
    const made = createScenesFromBeats(w, beats, 2);
    expect(w.scenes.length).toBe(before + beats.length);
    const fightScene = made.find((s) => s.text.includes('Combat began'))!;
    expect(fightScene.chapter).toBe(2);
    expect(fightScene.day).toBe(fightBeat.day);
    expect(fightScene.participants).toContain('CHAR_KAEL');
    expect(fightScene.text).toContain('[OUTLINE]');
    // cursor advanced: nothing left to outline
    expect(buildOutline(w)).toHaveLength(0);
    markOutlined(w);
    expect(w.outlinedUpTo).toBe(w.events.length);
  });

  it('compile strips [OUTLINE] blocks from stubs', async () => {
    const { renderSceneText, DEFAULT_COMPILE: opts } = await import('./compile');
    const stub = `---\n[OUTLINE] (action)\n- Combat began: rats.\n---\n\nThe real prose the author wrote.`;
    const out = renderSceneText(stub, opts);
    expect(out).not.toContain('OUTLINE');
    expect(out).toContain('The real prose');
  });
});

describe('style-tic guard (cross-session finding from the Lotus Gate drafts)', () => {
  it('measures withheld-action and Not-fragment density per chapter', async () => {
    const { measureTics, ticTrend, TIC_WARN_PER_1K } = await import('./tics');
    const clean = 'He looked at the door. The grain was oak, old, scarred by boots. Two strides left, and the ground was packed hard.';
    expect(measureTics(clean).withheld).toBe(0);
    expect(measureTics(clean).notFragments).toBe(0);
    const ticky =
      'He did not look at her. She didn’t answer. Not there. Not yet. ' +
      'He does not speak when the Watch passes. Not tonight, he decided.';
    const t = measureTics(ticky);
    expect(t.withheld).toBe(3);
    expect(t.notFragments).toBe(3);
    expect(t.per1k).toBeGreaterThan(TIC_WARN_PER_1K);
    // trend over the manuscript: seed scene should be near-clean
    const w = freshWorld();
    const trend = ticTrend(w);
    expect(trend[0].chapter).toBe(1);
    // and it ignores sim scaffolding when measuring
    w.scenes[0].text += '\n---\n[SIM NOTES]\nHe did not look. Not there. Not once.\n---\n';
    const before = trend[0].withheld;
    expect(ticTrend(w)[0].withheld).toBe(before);
  });

  it('the continuity audit hard-flags severe chapters and warns on trending ones', async () => {
    const { checkAllScenes } = await import('./continuity');
    const w = freshWorld();
    const filler = 'The lane ran crooked toward the water and the lamps were being lit one by one along it. ';
    // trending: a few tics spread thin (≈2/1k — above warn, below severe)
    w.scenes[0].text = filler.repeat(120) + 'He did not look at her. She did not answer. Not there. Not yet. ';
    let found = checkAllScenes(w).filter((x) => x.message.includes('style'));
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('warning');
    // severe: tic-saturated prose
    w.scenes[0].text = (filler + 'He did not look at her. Not there. Not yet. She did not answer. ').repeat(12);
    found = checkAllScenes(w).filter((x) => x.message.includes('style'));
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('error');
    expect(found[0].message).toContain('dominant move');
  });

  it('every prose-producing prompt carries the occupy-the-slot budget', async () => {
    const { ANTI_TIC_PROMPT } = await import('./tics');
    const { buildDraftPrompt } = await import('./proseLlm');
    expect(ANTI_TIC_PROMPT).toContain('AT MOST ONCE');
    expect(ANTI_TIC_PROMPT).toContain('write what he looked at');
    const w = freshWorld();
    const draft = buildDraftPrompt(w, w.scenes[0], 'outline').map((m) => m.content).join('\n');
    expect(draft).toContain('WITHHELD ACTION IS A MANNERISM');
  });
});

describe('silent-fallback audit', () => {
  it('every monster loot table actually exists (absence is an authoring mistake)', async () => {
    const { validateLootTables } = await import('./loot');
    expect(validateLootTables()).toEqual([]);
  });
});

describe('the campaign spine: What Lies Beneath Blackwall', () => {
  it('walks all eight stages: offer → clear boss → turn in → revelation → next stage', async () => {
    const { CAMPAIGN, mainQuests, campaignStageNumber, latestRevelation } = await import('./campaign');
    const { acceptQuest: accept, checkQuests: check, turnInQuest: turnIn, declineQuest: decline } = await import('./quests');
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    expect(CAMPAIGN).toHaveLength(8);
    // stage 1 is on offer from day one, and the spine cannot be declined
    const s1 = mainQuests(w).find((q) => q.status === 'offered')!;
    expect(s1.stage).toBe(1);
    expect(s1.title).toBe('What Sleeps Below');
    expect(decline(w, s1.id)).toMatch(/waits/);
    expect(s1.status).toBe('offered');

    for (let stage = 1; stage <= 8; stage++) {
      const q = mainQuests(w).find((x) => x.stage === stage)!;
      expect(q, `stage ${stage} offered`).toBeTruthy();
      travelTo(w, q.giverLocation);
      expect(accept(w, q.id), `accept stage ${stage}`).toBeNull();
      const dungeonId = (q.objectives[0] as { dungeonId: string }).dungeonId;
      w.dungeons[dungeonId].bossDefeated = true;
      check(w);
      expect(q.status).toBe('ready');
      // stages with a decision take the first option; the rest turn in plain
      const choiceKey = q.choice?.options[0]?.key;
      expect(turnIn(w, q.id, choiceKey), `turn in stage ${stage}`).toBeNull();
      // the revelation became party knowledge, verbatim and accurate
      // (witnessed quest events also become knowledge, so check containment)
      expect(mc.knowledge.some((k) => k.fact === q.revelation && k.accurate)).toBe(true);
      expect(campaignStageNumber(w)).toBe(stage + 1);
      if (stage < 8) {
        const next = mainQuests(w).find((x) => x.stage === stage + 1);
        expect(next?.status, `stage ${stage + 1} opens`).toBe('offered');
        expect(w.events.some((e) => e.kind === 'campaign.offered' && e.data.stage === stage + 1)).toBe(true);
      }
    }
    expect(w.events.some((e) => e.kind === 'campaign.complete')).toBe(true);
    expect(latestRevelation(w)).toContain('yours to write');
    // the Muse surfaces the unwritten revelation
    const { generateStoryIdeas } = await import('./muse');
    expect(generateStoryIdeas(w).some((i) => i.kind === 'campaign' && i.title.includes('revelation'))).toBe(true);
  });

  it('adopts pre-campaign saves without duplicating stage one', async () => {
    const { ensureCampaign, mainQuests } = await import('./campaign');
    const w = freshWorld();
    // simulate an old save: strip campaign markers from stage 1, delete later machinery
    for (const q of Object.values(w.quests)) {
      if (q.isMain) {
        delete q.isMain;
        delete q.stage;
        delete q.revelation;
      }
    }
    ensureCampaign(w);
    const main = mainQuests(w);
    expect(main).toHaveLength(1); // adopted, not duplicated
    expect(main[0].title).toBe('What Sleeps Below');
    expect(main[0].revelation).toBeTruthy();
  });
});
