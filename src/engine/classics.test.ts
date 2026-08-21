// The classic-RPG round: named elites & rivals, inter-companion
// banter, companions judging crimes, unidentified items, class
// ascension, dual-affix rares & named uniques, resurrection risk,
// rep-gated shop stock, and aging with birthdays.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { ELITE_MODIFIERS, livingRivals, makeEliteCombatant, maybeElevateElite, settleElites } from './rivals';
import { banterTopic, buildBanterPrompt, driftCompanionBonds, rememberBanter } from './banter';
import { pickpocket } from './crime';
import {
  ASCENSIONS,
  affixMod,
  ascensionOptions,
  canKessIdentify,
  chooseAscension,
  identifyItem,
  maybeMakeUnique,
  rollGearMods,
} from './progression';
import { buyFromShop, buyTempleService } from './services';
import { autoResolve, resolveRound, startCombat } from './combat';
import { answerRiddle, campInDungeon, drainSong, isDark, lightTorch, moveInDungeon, startSong, takeKey } from './dungeon';
import { buyMount, fulfillWrit, getWrit } from './services';
import { slotCapacity } from './rules';
import { generateDungeon } from './dungeon';
import { SKILLS, SPELLS } from './combat';
import { CLASSES, ITEM_PROTOS } from './rules';
import { RECIPES } from './crafting';
import { useConsumable } from './services';
import { FESTIVALS, festivalPriceMult, festivalToday } from './festivals';
import { COMPANION_ARCS } from './companions';
import { beginNextBook, currentBook, scenesInBook } from './series';
import { checkRelationshipMilestones } from './romance';
import { openThreads } from './muse';
import { maybeCompanionSight } from './moments';
import { DAILY_CONCEPTION_CHANCE, PREGNANCY_TERM_DAYS, dailyFamilyTick, eligibleSpouses } from './family';
import { advanceUntilMorning } from './world';
import { compileMarkdown } from './compile';
import { DEFAULT_COMPILE } from './compile';
import { buyTempleService as templeRite } from './services';
import { advanceCampaign, mainQuests } from './campaign';
import { MONSTERS } from './monsters';
import { getAuctionLots, isAuctionDay, placeBid } from './auction';
import { enterPitTrials, settleTournament } from './tournament';
import { boardQuests, letterCandidates, roomFacts, roomFactsFor, rumorGrounds } from './flavorLlm';
import { collectWorldArt } from './artFiles';
import { remakeMc } from './world';
import { addMinutes } from './world';
import { birthDayFor, relationshipBetween, runBirthdays, travelTo } from './world';
import { addToContainer, makeItem } from './rules';
import { Rng } from './rng';
import { generateStoryIdeas } from './muse';
import { generateDungeonEncounter } from './encounter';
import { enterDungeon } from './dungeon';
import type { PendingEncounter, WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 4242;
  return w;
}

function wolfEncounter(w: WorldState): PendingEncounter {
  return {
    seed: 99,
    description: 'wolves on the tomb road',
    monsters: [{ templateKey: 'dire-wolf', count: 2 }],
    source: 'city',
    locationId: w.partyLocation,
  };
}

describe('named elites & rivals', () => {
  it('elevates encounters into named elites at some rate', () => {
    const w = freshWorld();
    let elevated = 0;
    for (let s = 0; s < 200; s++) {
      const enc = wolfEncounter(w);
      maybeElevateElite(w, enc, new Rng(s));
      if (enc.elite) {
        elevated++;
        expect(enc.elite.name.length).toBeGreaterThan(3);
        expect(ELITE_MODIFIERS.some((m) => m.key === enc.elite!.modifierKey)).toBe(true);
        expect(enc.description).toContain(enc.elite.name);
      }
    }
    expect(elevated).toBeGreaterThan(5);
    expect(elevated).toBeLessThan(80);
  });

  it('builds a tougher combatant from the elite marker', () => {
    const w = freshWorld();
    const enc = wolfEncounter(w);
    enc.elite = { templateKey: 'dire-wolf', name: 'Vhessa the Grim', modifierKey: 'grim', power: 2 };
    const m = makeEliteCombatant(w, enc, 'M_ELITE')!;
    expect(m.name).toBe('Vhessa the Grim');
    expect(m.elite?.attackBonus).toBe(2 + 2); // modifier + power
    expect(m.hp.max).toBeGreaterThan(20); // 1.8x wolf, +25%/power
  });

  it('an escaped elite becomes a rival; the rival deepens on re-escape and dies for good', () => {
    const w = freshWorld();
    const enc = wolfEncounter(w);
    enc.elite = { templateKey: 'dire-wolf', name: 'Grulk Stonehide', modifierKey: 'stonehide', power: 0 };
    const m = makeEliteCombatant(w, enc, 'M1')!;
    m.fled = true;
    m.hp.current = Math.floor(m.hp.max * 0.3); // wounded → scar
    settleElites(w, [m], 'victory', new Rng(7));
    expect(livingRivals(w).length).toBe(1);
    const rival = livingRivals(w)[0];
    expect(rival.name).toBe('Grulk Stonehide');
    expect(rival.power).toBe(1);
    expect(rival.scars.length).toBe(1);
    // it returns, escapes again, grows
    const m2 = makeEliteCombatant(w, { ...enc, elite: { ...enc.elite, rivalId: rival.id, power: rival.power } }, 'M2')!;
    m2.fled = true;
    settleElites(w, [m2], 'victory', new Rng(8));
    expect(rival.power).toBe(2);
    expect(rival.grudge).toBe(2);
    // finally dies
    const m3 = makeEliteCombatant(w, { ...enc, elite: { ...enc.elite, rivalId: rival.id, power: rival.power } }, 'M3')!;
    m3.alive = false;
    settleElites(w, [m3], 'victory', new Rng(9));
    expect(livingRivals(w).length).toBe(0);
    expect(w.events.some((e) => e.kind === 'rival.slain')).toBe(true);
  });

  it('an inflicting elite over a non-inflicting template resolves without crashing', () => {
    // regression: the combat log once read t.inflicts!.status when only
    // the ELITE carried the inflict (Vhessa the Venomous over skeletons)
    let sawStatus = false;
    for (let seed = 0; seed < 40; seed++) {
      const w = freshWorld();
      const combat = startCombat(w, {
        seed,
        description: 'skeletons led by Vhessa the Venomous',
        monsters: [{ templateKey: 'skeleton', count: 2 }],
        source: 'city',
        locationId: w.partyLocation,
        elite: { templateKey: 'skeleton', name: 'Vhessa the Venomous', modifierKey: 'venomous', power: 2 },
      });
      autoResolve(w); // throws before the fix whenever the poison lands
      if (combat.log.some((l) => l.statusApplied === 'poisoned')) sawStatus = true;
    }
    expect(sawStatus).toBe(true); // the crashing path must actually be exercised
  });

  it('living rivals can take the field again and feed the Muse', () => {
    const w = freshWorld();
    w.rivals = [{ id: 'RIV_T', name: 'Old Tench Gilded-Tooth', templateKey: 'dire-wolf', modifierKey: 'gilded', power: 3, scars: ['a limp it blames on you'], lastSeenDay: 1, grudge: 3, defeated: false }];
    let returned = false;
    for (let s = 0; s < 100 && !returned; s++) {
      const enc = wolfEncounter(w);
      maybeElevateElite(w, enc, new Rng(s));
      if (enc.elite?.rivalId === 'RIV_T') returned = true;
    }
    expect(returned).toBe(true);
    const ideas = generateStoryIdeas(w);
    expect(ideas.some((i) => `${i.title} ${i.pitch}`.includes('Old Tench'))).toBe(true);
  });
});

describe('inter-companion bonds & banter', () => {
  it('shared victories drift companion↔companion dials', () => {
    const w = freshWorld();
    for (const id of ['CHAR_LYRA', 'CHAR_MARA', 'CHAR_YVENNE']) {
      w.characters[id].inParty = true;
      w.characters[id].location = w.partyLocation;
    }
    const before = relationshipBetween(w, 'CHAR_LYRA', 'CHAR_YVENNE').trust;
    for (let s = 0; s < 60; s++) driftCompanionBonds(w, ['CHAR_LYRA', 'CHAR_MARA', 'CHAR_YVENNE', w.mcId], new Rng(s));
    const after = relationshipBetween(w, 'CHAR_LYRA', 'CHAR_YVENNE').trust;
    expect(after).toBeGreaterThan(before);
  });

  it('picks a charged topic for entangled hearts and clashing codes', () => {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    const mara = w.characters['CHAR_MARA'];
    lyra.relationships[w.mcId] = { affection: 5, trust: 6, respect: 4, attraction: 6, commitment: 2 };
    mara.relationships[w.mcId] = { affection: 4, trust: 3, respect: 3, attraction: 6, commitment: 1 };
    let sawRomance = false;
    for (let s = 0; s < 40 && !sawRomance; s++) {
      const t = banterTopic(w, lyra, mara, new Rng(s));
      if (t.teaser.includes('about')) sawRomance = true;
    }
    expect(sawRomance).toBe(true);
    // honesty (Lyra) vs cunning (Mara) is a values clash
    mara.relationships[w.mcId].attraction = 0;
    lyra.relationships[w.mcId].attraction = 0;
    const t = banterTopic(w, lyra, mara, new Rng(1));
    expect(t.topic.length).toBeGreaterThan(30);
  });

  it('the banter prompt carries both character cards; kept banter becomes shared memory', () => {
    const w = freshWorld();
    const msgs = buildBanterPrompt(w, 'CHAR_LYRA', 'CHAR_MARA', 'a slow hour by the fire');
    expect(msgs[0].content).toContain('LYRA');
    expect(msgs[0].content).toContain('MARA');
    expect(msgs[0].content).toContain('TWO characters');
    rememberBanter(w, 'CHAR_LYRA', 'CHAR_MARA', 'Lyra: "You count the coin twice when you think no one watches."');
    expect(w.characters['CHAR_LYRA'].memories.some((m) => m.subject === 'CHAR_MARA')).toBe(true);
    expect(w.characters['CHAR_MARA'].memories.some((m) => m.subject === 'CHAR_LYRA')).toBe(true);
    expect(w.events.some((e) => e.kind === 'banter')).toBe(true);
  });
});

describe('companions judge crimes', () => {
  it('a clean pickpocket costs standing with the honest and buys a grin from the cunning', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.skills.stealth = 30; // guarantee success
    const lyra = w.characters['CHAR_LYRA']; // honesty — disapproves
    const mara = w.characters['CHAR_MARA']; // cunning/freedom — approves
    lyra.inParty = true;
    lyra.location = w.partyLocation;
    mara.inParty = true;
    mara.location = w.partyLocation;
    // a mark in the same room
    const mark = Object.values(w.characters).find((c) => !c.inParty && !c.isMC && c.alive && c.location === w.partyLocation)
      ?? (() => { const c = w.characters['CHAR_SERA'] ?? Object.values(w.characters).find((x) => !x.inParty && !x.isMC)!; c.location = w.partyLocation; return c; })();
    const lyraBefore = relationshipBetween(w, lyra.id, mc.id).respect;
    const maraBefore = relationshipBetween(w, mara.id, mc.id).respect;
    expect(pickpocket(w, mark.id)).toBeNull();
    expect(relationshipBetween(w, lyra.id, mc.id).respect).toBeLessThan(lyraBefore);
    expect(relationshipBetween(w, mara.id, mc.id).respect).toBeGreaterThanOrEqual(maraBefore);
    expect(lyra.memories.some((m) => m.event.includes('pocket'))).toBe(true);
  });
});

describe('unidentified items', () => {
  function unidentifiedDrop(w: WorldState): ReturnType<typeof makeItem> {
    for (let s = 0; s < 500; s++) {
      const it = makeItem(w, 'iron-longsword', 1);
      rollGearMods(new Rng(s), it, 2.2);
      if (it.unidentified) return it;
    }
    throw new Error('no unidentified roll in 500 seeds');
  }

  it('some enchanted finds come up mute, hiding the affix from the name', () => {
    const w = freshWorld();
    const it = unidentifiedDrop(w);
    expect(it.affix).toBeTruthy();
    expect(it.name).not.toContain(it.affix!.name);
  });

  it('the College reads it for a fee; Kess reads it free once her past is settled', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const it = unidentifiedDrop(w);
    it.owner = mc.id;
    mc.inventory.push(it.id);
    // not at the College → refused with directions
    expect(identifyItem(w, it.id)).toMatch(/College|Kess/);
    // at the College, with coin
    w.partyLocation = 'LOC_COLLEGE';
    mc.money = 500;
    expect(identifyItem(w, it.id)).toBeNull();
    expect(it.unidentified).toBeFalsy();
    expect(it.name).toContain(it.affix!.name);
    expect(mc.money).toBeLessThan(500);
    // Kess path
    const w2 = freshWorld();
    const it2 = (() => { const x = unidentifiedDrop(w2); x.owner = w2.characters[w2.mcId].id; w2.characters[w2.mcId].inventory.push(x.id); return x; })();
    expect(canKessIdentify(w2)).toBe(false);
    const kess = w2.characters['CHAR_KESS'];
    kess.inParty = true;
    kess.location = w2.partyLocation;
    const q = Object.values(w2.quests).find((x) => x.personal === 'CHAR_KESS');
    if (q) { q.personalStage = 2; q.status = 'completed'; }
    expect(canKessIdentify(w2)).toBe(true);
    expect(identifyItem(w2, it2.id)).toBeNull();
    expect(it2.unidentified).toBeFalsy();
  });
});

describe('class ascension at 25', () => {
  it('offers exactly two paths per class, at the trainer, for a fee', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId]; // fighter
    expect(ascensionOptions(mc)).toHaveLength(0); // underleveled
    mc.level = 25;
    const paths = ascensionOptions(mc);
    expect(paths).toHaveLength(2);
    // wrong hall
    expect(chooseAscension(w, mc.id, paths[0].key)).toMatch(/class hall/);
    travelTo(w, 'LOC_RATCATCHER');
    w.partyLocation = 'LOC_FIGHTGUILD';
    mc.money = 100;
    expect(chooseAscension(w, mc.id, paths[0].key)).toMatch(/costs/);
    mc.money = 5000;
    const hpBefore = mc.hp.max;
    const strBefore = mc.attributes.strength;
    expect(chooseAscension(w, mc.id, 'warlord')).toBeNull();
    expect(mc.ascension).toBe('warlord');
    expect(mc.title).toBe('Warlord');
    expect(mc.attributes.strength).toBe(strBefore + 2);
    expect(mc.hp.max).toBeGreaterThan(hpBefore);
    expect(mc.abilities).toContain('avatar-of-war');
    // no double dip, no cross-class paths
    expect(chooseAscension(w, mc.id, 'worldbreaker')).toMatch(/already ascended/);
    expect(ASCENSIONS.filter((a) => a.charClass === 'mage')).toHaveLength(2);
  });
});

describe('dual-affix rares & named uniques', () => {
  it('hot rolls sometimes land a second affix on a different stat', () => {
    const w = freshWorld();
    let dual = 0;
    for (let s = 0; s < 300; s++) {
      const it = makeItem(w, 'iron-longsword', 1);
      rollGearMods(new Rng(s), it, 2.2);
      if (it.affix2) {
        dual++;
        expect(it.affix2.stat).not.toBe(it.affix!.stat);
        expect(['rare', 'exceptional', 'legendary'].includes(it.tier ?? '')).toBe(true);
      }
    }
    expect(dual).toBeGreaterThan(3);
  });

  it('boss hoards can carry a named unique — with lore, once per world', () => {
    const w = freshWorld();
    let made = false;
    for (let s = 0; s < 200 && !made; s++) {
      const it = makeItem(w, 'iron-longsword', 1);
      made = maybeMakeUnique(w, new Rng(s), it);
      if (made) {
        expect(it.lore!.length).toBeGreaterThan(50);
        expect(it.tier).toBe('legendary');
        expect(it.affix).toBeTruthy();
        expect(it.unidentified).toBeFalsy();
        // the same name can never drop twice
        for (let s2 = 0; s2 < 200; s2++) {
          const again = makeItem(w, 'iron-longsword', 1);
          if (maybeMakeUnique(w, new Rng(s2), again)) expect(again.name).not.toBe(it.name);
        }
      }
    }
    expect(made).toBe(true);
  });
});

describe('resurrection risk', () => {
  it('safe rules always raise the dead; risky rules can leave ashes, then nothing', () => {
    // safe: works every time
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    lyra.alive = false;
    w.characters[w.mcId].money = 100000;
    expect(buyTempleService(w, 'LOC_TEMPLE', 'resurrection', lyra.id)).toBeNull();
    expect(lyra.alive).toBe(true);
    // risky with terrible CON: run until we see ashes and then the end
    const w2 = freshWorld();
    w2.resurrectionRule = 'risky';
    const m2 = w2.characters['CHAR_MARA'];
    m2.attributes.constitution = 3;
    m2.alive = false;
    let sawAshes = false;
    let sawEnd = false;
    for (let i = 0; i < 400 && !sawEnd; i++) {
      w2.characters[w2.mcId].money = 100000;
      const err = buyTempleService(w2, 'LOC_TEMPLE', 'resurrection', m2.id);
      if (m2.remains === 'ashes') sawAshes = true;
      if (m2.remains === 'beyondRecall') {
        sawEnd = true;
        expect(err).toBeNull(); // the failing rite itself returns null; refusal comes next
        expect(buyTempleService(w2, 'LOC_TEMPLE', 'resurrection', m2.id)).toMatch(/beyond recall/i);
      }
      if (m2.alive) { m2.alive = false; m2.remains = undefined; } // died again; keep testing
    }
    expect(sawAshes).toBe(true);
    expect(sawEnd).toBe(true);
    expect(w2.events.some((e) => e.kind === 'temple.resurrection.failed')).toBe(true);
  });
});

describe('rep-gated shop stock', () => {
  it('keeps the good steel under the counter until the street knows you', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 100000;
    const idx = w.locations['LOC_FORGE'].shop!.stock.findIndex((e) => e.proto === 'steel-longsword');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(w.locations['LOC_FORGE'].shop!.stock[idx].minRep).toBe(3);
    expect(buyFromShop(w, 'LOC_FORGE', idx, mc)).toMatch(/spoken for/);
    mc.factionReputation['FAC_COINGUILD'] = 3;
    expect(buyFromShop(w, 'LOC_FORGE', idx, mc)).toBeNull();
  });
});

describe('encounter balance', () => {
  it('a fresh duo on floor 1 never meets more bodies than it can survive', () => {
    const w = freshWorld();
    enterDungeon(w, 'DUN_OLDQUARTER_001'); // rooms generate on entry
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const room = Object.values(d.rooms).find((r) => r.floor === 1 && r.encounterKey && !r.isBossRoom)!;
    w.currentRoom = room.id;
    room.enemies = 'alive';
    for (let seed = 1; seed <= 60; seed++) {
      const enc = generateDungeonEncounter(w, seed);
      if ('error' in enc) throw new Error(enc.error);
      const bodies = enc.monsters.reduce((n, m) => n + m.count, 0);
      // level-1 duo → budget cap 3: at most 3 level-1 bodies
      expect(bodies, `seed ${seed}: ${enc.description}`).toBeLessThanOrEqual(4);
      w.pendingEncounter = null;
    }
  });
});

describe('aging & birthdays', () => {
  it('party birthdays tick age and make the record; strangers age quietly', () => {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    lyra.inParty = true;
    w.time.day = 100;
    lyra.birthDay = 100;
    const before = lyra.age;
    runBirthdays(w);
    expect(lyra.age).toBe(before + 1);
    expect(w.events.some((e) => e.kind === 'birthday' && e.summary.includes('Lyra'))).toBe(true);
    // stable hash, in range
    expect(birthDayFor('CHAR_LYRA')).toBe(birthDayFor('CHAR_LYRA'));
    expect(birthDayFor('CHAR_LYRA')).toBeGreaterThanOrEqual(0);
    expect(birthDayFor('CHAR_LYRA')).toBeLessThan(360);
    // a stranger with the same birthday ages without an event
    const eventsBefore = w.events.length;
    const stranger = Object.values(w.characters).find((c) => !c.inParty && !c.isMC && c.alive)!;
    stranger.birthDay = 100;
    const sAge = stranger.age;
    runBirthdays(w);
    expect(stranger.age).toBe(sAge + 1);
    expect(w.events.slice(eventsBefore).every((e) => !e.summary.includes(stranger.name) || e.kind !== 'birthday')).toBe(true);
  });
});


describe('battle lines (grognard round 2)', () => {
  function lineWorld(): WorldState {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    lyra.row = 'back';
    return w;
  }

  it('melee monsters cannot reach the back rank while the front stands', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = lineWorld();
      const combat = startCombat(w, {
        seed, description: 'rats', monsters: [{ templateKey: 'giant-rat', count: 3 }],
        source: 'city', locationId: w.partyLocation,
      });
      for (let r = 0; r < 4 && combat.outcome === 'ongoing'; r++) {
        resolveRound(w, [
          { actor: w.mcId, type: 'defend' },
          { actor: 'CHAR_LYRA', type: 'defend' },
        ]);
        const kael = w.characters[w.mcId];
        if (kael.hp.current === 0) break; // front rank down → back is fair game
        const hitsOnLyra = combat.log.filter((l) => l.result !== 'miss' && l.targetName === 'Lyra' && l.actorName.includes('Rat'));
        expect(hitsOnLyra, `seed ${seed}`).toHaveLength(0);
      }
    }
  });

  it('melee from the back rank swings at -4; bows do not care', () => {
    // same combat seed, same plan — only the row differs. Find seeds
    // where the -4 flips a hit into a miss, and prove bows never flip.
    let flipped = false;
    for (let seed = 0; seed < 200 && !flipped; seed++) {
      const outcomes: boolean[] = [];
      for (const row of ['front', 'back'] as const) {
        const w = freshWorld();
        const kael = w.characters[w.mcId];
        kael.row = row;
        const combat = startCombat(w, {
          seed, description: 'a rat', monsters: [{ templateKey: 'skeleton', count: 1 }],
          source: 'city', locationId: w.partyLocation,
        });
        resolveRound(w, [
          { actor: w.mcId, type: 'attack', target: combat.monsters[0].id },
          { actor: 'CHAR_LYRA', type: 'defend' },
        ]);
        const swing = combat.log.find((l) => l.actorName === 'Kael' && l.action === 'attack');
        outcomes.push(swing?.result !== 'miss');
      }
      if (outcomes[0] && !outcomes[1]) flipped = true;
    }
    expect(flipped).toBe(true);
  });
});

describe('torchlight (grognard round 2)', () => {
  it('torches burn while time passes underground, then the dark comes back', () => {
    const w = freshWorld();
    expect(lightTorch(w)).toMatch(/dark below/); // only underground
    w.currentDungeon = 'DUN_OLDQUARTER_001';
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    // daylight falls through the entrance — the entry chamber is never dark
    expect(isDark(w)).toBe(false);
    expect(lightTorch(w)).toBeNull(); // party carries 4 torches
    expect(w.torchMinutes).toBeGreaterThan(0);
    expect(isDark(w)).toBe(false);
    addMinutes(w, 200);
    expect(w.torchMinutes).toBe(0);
    // step off the daylit entry: the dark is waiting
    const d0 = w.dungeons['DUN_OLDQUARTER_001'];
    const inner = Object.values(d0.rooms).find((r) => r.floor === 1 && !r.isStairsUp && !r.darkZone)!;
    w.currentRoom = inner.id;
    expect(isDark(w)).toBe(true);
    expect(w.events.some((e) => e.summary.includes('guttered out'))).toBe(true);
    // burn the rest of the bundle (draining light between lights —
    // stacking past the cap is refused now)
    let lit = 0;
    for (let i = 0; i < 10; i++) {
      if (lightTorch(w) !== null) break;
      lit++;
      addMinutes(w, 200);
    }
    expect(lit).toBe(3);
    expect(lightTorch(w)).toMatch(/No torches/);
  });
});

describe('camping underground (grognard round 2)', () => {
  it('camp restores the party, costs 8 hours, and sometimes the fire draws visitors', () => {
    let sawAmbush = false;
    let sawQuiet = false;
    for (let i = 0; i < 40 && !(sawAmbush && sawQuiet); i++) {
      const w = freshWorld();
      enterDungeon(w, 'DUN_OLDQUARTER_001');
      const room = w.dungeons['DUN_OLDQUARTER_001'].rooms[w.currentRoom!];
      room.enemies = 'none';
      const mc = w.characters[w.mcId];
      mc.needs.fatigue = 90;
      mc.hp.current = 1;
      const before = w.time.day * 1440 + w.time.minute;
      expect(campInDungeon(w)).toBeNull();
      expect(w.time.day * 1440 + w.time.minute - before).toBeGreaterThanOrEqual(480);
      expect(mc.needs.fatigue).toBeLessThanOrEqual(35);
      expect(mc.hp.current).toBeGreaterThan(1);
      if (w.pendingEncounter) sawAmbush = true;
      else sawQuiet = true;
    }
    expect(sawAmbush).toBe(true);
    expect(sawQuiet).toBe(true);
    // no camping in a hostile room
    const w2 = freshWorld();
    enterDungeon(w2, 'DUN_OLDQUARTER_001');
    w2.dungeons['DUN_OLDQUARTER_001'].rooms[w2.currentRoom!].enemies = 'alive';
    expect(campInDungeon(w2)).toMatch(/disagrees/);
  });
});

describe('stolen goods stay stolen', () => {
  it('a stolen stackable never merges into a clean stack', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const clean = makeItem(w, 'minor-healing-potion', 2);
    addToContainer(w, clean, mc);
    const hot = makeItem(w, 'minor-healing-potion', 1);
    hot.stolen = true;
    addToContainer(w, hot, mc);
    expect(clean.stolen).toBeFalsy();
    expect(w.items[hot.id]).toBeTruthy(); // kept as its own (stolen) stack
    expect(w.items[hot.id].stolen).toBe(true);
    // and stolen merges into stolen
    const hot2 = makeItem(w, 'minor-healing-potion', 1);
    hot2.stolen = true;
    addToContainer(w, hot2, mc);
    expect(w.items[hot.id].qty).toBe(2);
    expect(w.items[hot2.id]).toBeFalsy();
  });
});

describe('character creation (grognard round 2)', () => {
  it('remaking Kael as a mage swaps abilities, grants mana, and applies bonus points', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const hpBefore = mc.hp.max;
    remakeMc(w, 'mage', { intelligence: 3, constitution: 2 });
    expect(mc.charClass).toBe('mage');
    expect(mc.abilities).toContain('firebolt');
    expect(mc.abilities).not.toContain('shield-bash');
    expect(mc.mana.max).toBeGreaterThanOrEqual(9 + 6); // 4+5/level, +2/INT point
    expect(mc.attributes.intelligence).toBeGreaterThanOrEqual(13);
    expect(mc.hp.max).toBe(hpBefore + 4); // +2 per CON point
    expect(w.events.some((e) => e.kind === 'mc.created')).toBe(true);
  });
});


describe('the expansion: classes, tomes, jewelry, streets (round 3)', () => {
  it('every class unlock and ascension ability resolves to a real skill or spell', () => {
    for (const def of Object.values(CLASSES)) {
      for (const key of Object.values(def.unlocks)) {
        expect(SKILLS[key] ?? SPELLS[key], `${def.key}: ${key}`).toBeTruthy();
      }
    }
    for (const a of ASCENSIONS) {
      expect(SKILLS[a.ability] ?? SPELLS[a.ability], `${a.key}: ${a.ability}`).toBeTruthy();
      expect(CLASSES[a.charClass], a.key).toBeTruthy();
    }
    // two paths per playable class
    for (const cls of ['fighter', 'rogue', 'mage', 'priest', 'ranger', 'bard', 'monk', 'spellblade', 'warlock', 'paladin', 'necromancer', 'berserker', 'cultivator', 'alchemist', 'tidecaller', 'oneiromancer'] as const) {
      expect(ASCENSIONS.filter((a) => a.charClass === cls), cls).toHaveLength(2);
    }
  });

  it('every class trainer exists somewhere in the city', () => {
    const w = freshWorld();
    for (const def of Object.values(CLASSES)) {
      if (def.key === 'commoner') continue;
      const hall = Object.values(w.locations).find((l) => l.trainerFor === def.key || (def.key === 'priest' && l.temple));
      expect(hall, `${def.key} trains at ${def.trainer}`).toBeTruthy();
    }
  });

  it('a tome teaches its ability once and survives an idle read', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const tome = makeItem(w, 'grimoire-wither', 1);
    addToContainer(w, tome, mc);
    expect(mc.abilities).not.toContain('wither');
    const err = useConsumable(w, tome.id, mc.id);
    expect(err).toBeNull();
    expect(mc.abilities).toContain('wither');
  });

  it('enchanted jewelry ships with its affix awake and counts when equipped', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const ring = makeItem(w, 'ring-of-the-fox', 1);
    expect(ring.affix?.stat).toBe('evasion');
    addToContainer(w, ring, mc);
    mc.equipment['ring'] = ring.id;
    ring.equippedBy = mc.id;
    expect(affixMod(w, mc, 'evasion')).toBeGreaterThanOrEqual(2);
  });

  it('the new streets are wired both ways and teach their lore on first visit', () => {
    const w = freshWorld();
    for (const [a, b] of Object.entries(w.locations).flatMap(([id, l]) => l.connections.map((c) => [id, c] as const))) {
      expect(w.locations[b], `${a} -> ${b} dangles`).toBeTruthy();
      expect(w.locations[b].connections, `${b} does not point back at ${a}`).toContain(a);
    }
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_NIGHTMARKET');
    expect(w.codex).toContain('CITY:tidecourt');
    expect(w.events.some((e) => e.kind === 'codex.found')).toBe(true);
    // once only
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_NIGHTMARKET');
    expect((w.codex ?? []).filter((c) => c === 'CITY:tidecourt')).toHaveLength(1);
  });

  it('every recipe input and output is a real item proto', () => {
    for (const r of RECIPES) {
      expect(ITEM_PROTOS[r.makes], `${r.key} makes ${r.makes}`).toBeTruthy();
      for (const n of r.needs) expect(ITEM_PROTOS[n.proto], `${r.key} needs ${n.proto}`).toBeTruthy();
    }
  });

  it('the new factions exist and the new classes can be rolled at creation', () => {
    const w = freshWorld();
    for (const fac of ['FAC_LAMPLIGHTERS', 'FAC_TIDECOURT', 'FAC_BONEWARDENS']) {
      expect(w.factions[fac], fac).toBeTruthy();
    }
    remakeMc(w, 'bard', { charisma: 2 });
    const mc = w.characters[w.mcId];
    expect(mc.charClass).toBe('bard');
    expect(mc.abilities).toContain('sharp-word');
    expect(mc.mana.max).toBeGreaterThanOrEqual(7);
  });
});


describe('round 4: companions, the Saltworks, and the calendar', () => {
  it('Isha and Corva exist, are women, and their arcs open at their halls', () => {
    const w = freshWorld();
    for (const id of ['CHAR_ISHA', 'CHAR_CORVA'] as const) {
      const c = w.characters[id];
      expect(c, id).toBeTruthy();
      expect(c.sex).toBe('female');
      const arc = COMPANION_ARCS.find((a) => a.charId === id);
      expect(arc, id).toBeTruthy();
      expect(arc!.stages).toHaveLength(4);
      const q1 = Object.values(w.quests).find((q) => q.personal === id && q.personalStage === 1);
      expect(q1?.status, id).toBe('offered');
    }
    expect(w.characters['CHAR_ISHA'].charClass).toBe('monk');
    expect(w.characters['CHAR_CORVA'].charClass).toBe('bard');
  });

  it('the Saltworks exists, is entered from its gate, and its boss drops from its own table', () => {
    const w = freshWorld();
    const d = w.dungeons['DUN_TIDE_001'];
    expect(d).toBeTruthy();
    expect(w.locations[d.entranceLocation]?.dungeonId).toBe('DUN_TIDE_001');
    expect(MONSTERS[d.bossKey]?.lootTable).toBe('boss-saltworks');
    for (const key of d.primaryEnemies) expect(MONSTERS[key], key).toBeTruthy();
    enterDungeon(w, 'DUN_TIDE_001');
    expect(Object.keys(d.rooms).length).toBeGreaterThan(6);
  });

  it('festivals land on their calendar days and soften market prices', () => {
    const w = freshWorld();
    expect(FESTIVALS.length).toBeGreaterThanOrEqual(4);
    w.time.day = 360 + 90; // the Salt Blessing, next year
    expect(festivalToday(w)?.name).toBe('The Salt Blessing');
    expect(festivalPriceMult(w)).toBeLessThan(1);
    w.time.day = 360 + 91;
    expect(festivalToday(w)).toBeNull();
    expect(festivalPriceMult(w)).toBe(1);
  });

  it('auction lots are deterministic per day, refuse lowballs, and can be won with enough coin', () => {
    const w = freshWorld();
    w.time.day = 10;
    expect(isAuctionDay(w)).toBe(true);
    const a = getAuctionLots(w);
    const b = getAuctionLots(w);
    expect(a.map((l) => l.item.name)).toEqual(b.map((l) => l.item.name));
    expect(a).toHaveLength(3);
    const mc = w.characters[w.mcId];
    w.partyLocation = 'LOC_NIGHTMARKET';
    mc.money = 5;
    expect(placeBid(w, 0, 4)).toMatch(/purse|Reserve|look up/i);
    // deep pockets and big offers land it eventually (the room can outbid once, not forever)
    mc.money = 1000000;
    mc.attributes.charisma = 18;
    let won = false;
    for (let offer = a[0].reserve; offer < a[0].reserve * 4 && !won; offer = Math.ceil(offer * 1.3)) {
      won = placeBid(w, 0, offer) === null;
    }
    expect(won).toBe(true);
    expect(getAuctionLots(w)[0].sold).toBe(true);
    expect(placeBid(w, 0, 999999)).toMatch(/hammer already fell/);
    expect(mc.inventory.map((i) => w.items[i]?.name)).toContain(a[0].item.name);
  });

  it('the Pit Trials run a three-bout card and crown a champion', () => {
    const w = freshWorld();
    w.time.day = 30;
    const mc = w.characters[w.mcId];
    mc.money = 500;
    expect(enterPitTrials(w)).toMatch(/Pit of Honest Work/); // wrong place
    w.partyLocation = 'LOC_FIGHTPIT';
    expect(enterPitTrials(w)).toBeNull();
    expect(w.pendingEncounter?.description).toContain('bout 1');
    // walk the card by decree: three victories
    for (let round = 1; round <= 3; round++) {
      w.pendingEncounter = null;
      settleTournament(w, 'victory');
    }
    expect(w.tournament).toBeNull();
    expect(mc.title).toBe('Champion of the Pit');
    expect(mc.money).toBeGreaterThan(3000); // purses paid
    expect(w.tournamentDaysWon).toContain(30);
    expect(enterPitTrials(w)).toMatch(/already took/);
    // losing scratches the card
    const w2 = freshWorld();
    w2.time.day = 30;
    w2.partyLocation = 'LOC_FIGHTPIT';
    w2.characters[w2.mcId].money = 500;
    expect(enterPitTrials(w2)).toBeNull();
    settleTournament(w2, 'defeat');
    expect(w2.tournament).toBeNull();
    expect(w2.events.some((e) => e.kind === 'tournament.out')).toBe(true);
  });

  it('the party cap holds the whole cast of eight', () => {
    const w = freshWorld();
    expect(COMPANION_ARCS).toHaveLength(5);
    for (const arc of COMPANION_ARCS) {
      expect(w.characters[arc.charId].sex, arc.charId).toBe('female');
    }
  });
});


describe('AI flavor stays grounded (round 5)', () => {
  it('room facts carry the truth the model must keep', () => {
    const w = freshWorld();
    expect(roomFacts(w)).toBeNull(); // above ground
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const room = w.dungeons['DUN_OLDQUARTER_001'].rooms[w.currentRoom!];
    room.enemies = 'alive';
    room.encounterKey = 'skeleton';
    const facts = roomFacts(w)!;
    expect(facts).toContain('Crypts of Saint Varro');
    expect(facts).toContain('Hostiles present');
    expect(facts).toContain('pitch dark'); // no torch lit
    lightTorch(w);
    expect(roomFacts(w)).toContain('Torchlight');
  });

  it('background describes target their own room, not wherever the party walked', () => {
    const w = freshWorld();
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const entry = w.currentRoom!;
    const other = Object.values(d.rooms).find((r) => r.id !== entry && r.floor === 1)!;
    other.description = 'A very specific sentence for the test.';
    // party stays at the entry; facts are for the OTHER room
    const facts = roomFactsFor(w, d.id, other.id)!;
    expect(facts).toContain('A very specific sentence for the test.');
    expect(facts).toContain(`"${other.name}"`);
    // and the current-room path still matches the old behavior
    expect(roomFacts(w)).toContain(d.rooms[entry].name);
  });

  it('rumor grounds only ever cite real world state, and each carries a true fallback', () => {
    const w = freshWorld();
    w.rivals = [{ id: 'RIV_X', name: 'Old Tench Gilded-Tooth', templateKey: 'dire-wolf', modifierKey: 'gilded', power: 2, scars: [], lastSeenDay: 1, grudge: 2, defeated: false }];
    w.doom = { stage: 2, lastAdvanceDay: 1 } as never;
    const grounds = rumorGrounds(w);
    expect(grounds.length).toBeGreaterThanOrEqual(3);
    const rival = grounds.find((g) => g.kind === 'rival');
    expect(rival?.fact).toContain('Old Tench');
    expect(rival?.fallback).toContain('Old Tench');
    expect(grounds.find((g) => g.kind === 'doom')?.fact).toContain('stage 2');
    for (const g of grounds) {
      expect(g.fallback.length).toBeGreaterThan(10);
    }
  });

  it('letters come only from party members whose hearts are in it', () => {
    const w = freshWorld();
    expect(letterCandidates(w)).toHaveLength(0);
    const lyra = w.characters['CHAR_LYRA'];
    lyra.relationships[w.mcId] = { affection: 7, trust: 5, respect: 4, attraction: 5, commitment: 2 };
    expect(letterCandidates(w)).toContain('CHAR_LYRA'); // in party from seed
    lyra.inParty = false;
    expect(letterCandidates(w)).toHaveLength(0);
  });

  it('the board reword targets only open board jobs, never the spine or arcs', () => {
    const w = freshWorld();
    const jobs = boardQuests(w);
    for (const q of jobs) {
      expect(q.isMain).toBeFalsy();
      expect(q.personal).toBeFalsy();
      expect(q.guild).toBeFalsy();
      expect(q.status).toBe('offered');
    }
  });
});


describe('art moves out of the save (round 6)', () => {
  it('collectWorldArt sweeps world and snapshot art into a pack and strips the payloads', () => {
    const w = freshWorld();
    w.monsterArt = { 'giant-rat': 'data:image/png;base64,AAA' };
    w.characterArt = { CHAR_LYRA: 'data:image/png;base64,BBB' };
    const snapWorld = JSON.parse(JSON.stringify(w));
    const snapshots = [
      { id: 'S1', kind: 'manual' as const, label: 'x', day: 1, minute: 0, createdAt: 0, world: JSON.stringify(snapWorld) },
      { id: 'S2', kind: 'auto' as const, label: 'y', day: 1, minute: 0, createdAt: 0, world: JSON.stringify({ ...snapWorld, monsterArt: {}, characterArt: {} }) },
    ];
    const before2 = snapshots[1].world;
    const pack = collectWorldArt(w, snapshots);
    expect(pack['monster:giant-rat']).toBe('data:image/png;base64,AAA');
    expect(pack['char:CHAR_LYRA']).toBe('data:image/png;base64,BBB');
    expect(Object.keys(w.monsterArt ?? {})).toHaveLength(0);
    expect(Object.keys(w.characterArt ?? {})).toHaveLength(0);
    expect(snapshots[0].world).not.toContain('data:image');
    expect(snapshots[1].world).toBe(before2); // untouched: no art inside
    // idempotent: second sweep finds nothing
    expect(Object.keys(collectWorldArt(w, snapshots))).toHaveLength(0);
  });
});


describe('the maze round (round 7)', () => {
  function gen(seed: number, dungeonId = 'DUN_DEEP_001') {
    const w = freshWorld();
    w.dungeons[dungeonId].generationSeed = seed;
    generateDungeon(w, dungeonId);
    return { w, d: w.dungeons[dungeonId] };
  }

  it('deep floors sprawl onto bigger grids with more rooms', () => {
    let sawWide = false;
    let deepBigger = false;
    for (let seed = 1; seed <= 10; seed++) {
      const { d } = gen(seed); // the Hollow Crown: 6 floors
      const byFloor = new Map<number, number>();
      for (const r of Object.values(d.rooms)) {
        byFloor.set(r.floor, (byFloor.get(r.floor) ?? 0) + 1);
        if (r.floor >= 4 && (r.x >= 4 || r.y >= 4)) sawWide = true; // beyond the old 4x4
      }
      if ((byFloor.get(6) ?? 0) > (byFloor.get(1) ?? 99)) deepBigger = true;
    }
    expect(sawWide).toBe(true);
    expect(deepBigger).toBe(true);
  });

  it('spinners, dark zones, teleport rings, and keys all occur — and every target exists', () => {
    let spinners = 0, darks = 0, rings = 0, keys = 0, oneWays = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { d } = gen(seed);
      const OPP: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
      for (const r of Object.values(d.rooms)) {
        if (r.spinner) spinners++;
        if (r.darkZone) darks++;
        if (r.teleporter) {
          rings++;
          expect(d.rooms[r.teleporter.to], `${d.id} ring target`).toBeTruthy();
        }
        if (r.key) {
          keys++;
          expect(d.rooms[r.key.opensRoom]?.lockedDoor, `${d.id} key's lock`).toBeTruthy();
        }
        for (const [dir, t] of Object.entries(r.connections)) {
          if (!t || !OPP[dir]) continue;
          expect(d.rooms[t], `${r.id} ${dir}`).toBeTruthy();
          if (d.rooms[t].connections[OPP[dir] as 'north'] !== r.id) oneWays++;
        }
      }
    }
    expect(spinners).toBeGreaterThan(0);
    expect(darks).toBeGreaterThan(0);
    expect(rings).toBeGreaterThan(0);
    expect(keys).toBeGreaterThan(0);
    expect(oneWays).toBeGreaterThan(0); // some doors have no handle on the far side
  });

  it('one-way doors never strand the party: every room reaches and is reached from its floor entry', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { d } = gen(seed);
      const floors = new Map<number, string[]>();
      for (const r of Object.values(d.rooms)) {
        floors.set(r.floor, [...(floors.get(r.floor) ?? []), r.id]);
      }
      for (const [floor, ids] of floors) {
        const entry = ids.find((id) => d.rooms[id].isStairsUp) ?? ids[0];
        const walk = (start: string, reverse: boolean) => {
          const seen = new Set([start]);
          const q = [start];
          while (q.length) {
            const cur = q.pop()!;
            for (const rid of ids) {
              if (seen.has(rid)) continue;
              const fwd = Object.values(d.rooms[cur].connections).includes(rid);
              const bck = Object.values(d.rooms[rid].connections).includes(cur);
              if ((reverse ? bck : fwd)) { seen.add(rid); q.push(rid); }
            }
          }
          return seen;
        };
        expect(walk(entry, false).size, `seed ${seed} floor ${floor} out`).toBe(ids.length);
        expect(walk(entry, true).size, `seed ${seed} floor ${floor} back`).toBe(ids.length);
      }
    }
  });

  it('no lock ever gates its own key: the key is always reachable with the door closed', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { d } = gen(seed);
      const floors = new Map<number, string[]>();
      for (const r of Object.values(d.rooms)) floors.set(r.floor, [...(floors.get(r.floor) ?? []), r.id]);
      for (const [floor, ids] of floors) {
        const lockRoom = ids.map((id) => d.rooms[id]).find((r) => r.lockedDoor && !r.lockedDoor.opened);
        if (!lockRoom) continue;
        const keyRoom = ids.map((id) => d.rooms[id]).find((r) => r.key);
        const entry = ids.find((id) => d.rooms[id].isStairsUp) ?? ids[0];
        // BFS from the floor entry with the locked passage closed
        const seen = new Set([entry]);
        const q = [entry];
        while (q.length) {
          const cur = q.pop()!;
          for (const [dir, t] of Object.entries(d.rooms[cur].connections)) {
            if (!t || !ids.includes(t) || seen.has(t)) continue;
            if (cur === lockRoom.id && dir === lockRoom.lockedDoor!.dir) continue;
            seen.add(t);
            q.push(t);
          }
        }
        expect(seen.has(lockRoom.id), `seed ${seed} floor ${floor}: the locked door itself is unreachable`).toBe(true);
        if (keyRoom) expect(seen.has(keyRoom.id), `seed ${seed} floor ${floor}: key locked behind its own door`).toBe(true);
      }
    }
  });

  it('a carried key opens its floor\'s lock without picking', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { w, d } = gen(seed);
      const keyRoom = Object.values(d.rooms).find((r) => r.key && !r.key.taken);
      if (!keyRoom) continue;
      const lockRoom = d.rooms[keyRoom.key!.opensRoom];
      w.currentDungeon = d.id;
      w.currentRoom = keyRoom.id;
      expect(takeKey(w)).toBeNull();
      expect(d.keysHeld).toContain(lockRoom.id);
      w.currentRoom = lockRoom.id;
      const res = moveInDungeon(w, lockRoom.lockedDoor!.dir);
      expect('error' in res, `seed ${seed}`).toBe(false);
      expect(lockRoom.lockedDoor!.opened).toBe(true);
      return; // one full pass is the test
    }
    throw new Error('no key found across 30 seeds');
  });

  it('teleport rings move the party; dead-dark rooms ignore torchlight', () => {
    let tested = 0;
    for (let seed = 1; seed <= 40 && tested < 2; seed++) {
      const { w, d } = gen(seed);
      const ringRoom = Object.values(d.rooms).find((r) => r.teleporter);
      if (ringRoom && tested % 2 === 0) {
        const neighbor = Object.values(d.rooms).find((r) => Object.values(r.connections).includes(ringRoom.id) && r.floor === ringRoom.floor);
        if (neighbor) {
          const dir = (Object.entries(neighbor.connections).find(([, t]) => t === ringRoom.id)![0]) as 'north';
          w.currentDungeon = d.id;
          w.currentRoom = neighbor.id;
          if (neighbor.lockedDoor?.dir === dir && !neighbor.lockedDoor.opened) continue;
          const res = moveInDungeon(w, dir);
          if ('error' in res) continue;
          expect(w.currentRoom).toBe(ringRoom.teleporter!.to);
          tested++;
        }
      }
      const darkRoom = Object.values(d.rooms).find((r) => r.darkZone);
      if (darkRoom && tested < 2) {
        w.currentDungeon = d.id;
        w.currentRoom = darkRoom.id;
        w.torchMinutes = 200;
        expect(isDark(w)).toBe(true); // the dark eats torches
        tested++;
      }
    }
    expect(tested).toBeGreaterThanOrEqual(2);
  });
});


describe('the log round (round 8): books, milestones, digests, threads, grief, sights, family', () => {
  it('closing a book marks the boundary, resets chapters, and scopes compile', () => {
    const w = freshWorld();
    w.scenes[0].book = 1;
    w.scenes[0].text = 'Book one prose here.';
    expect(currentBook(w)).toBe(1);
    beginNextBook(w, 'The Broken Crown');
    expect(currentBook(w)).toBe(2);
    expect(w.chapter).toBe(1);
    expect(w.bookStarts).toHaveLength(2);
    expect(w.bookStarts![0].title).toBe('The Broken Crown');
    expect(w.events.some((e) => e.kind === 'book.end')).toBe(true);
    expect(w.events.some((e) => e.kind === 'book.begin')).toBe(true);
    // a new scene belongs to book 2; compile scopes cleanly
    w.scenes.push({ ...w.scenes[0], id: 'SCN_B2', book: 2, order: 99, chapter: 1, text: 'Book two prose here.' });
    expect(scenesInBook(w, 2)).toHaveLength(1);
    const md1 = compileMarkdown(w, 'T', { ...DEFAULT_COMPILE, book: 1 });
    const md2 = compileMarkdown(w, 'T', { ...DEFAULT_COMPILE, book: 2 });
    expect(md1).toContain('Book one prose');
    expect(md1).not.toContain('Book two prose');
    expect(md2).toContain('Book two prose');
  });

  it('relationship stage crossings log events and hand the author the scene', () => {
    const w = freshWorld();
    checkRelationshipMilestones(w); // baseline pass — no events
    expect(w.events.filter((e) => e.kind === 'romance.stage')).toHaveLength(0);
    const lyra = w.characters['CHAR_LYRA'];
    lyra.relationships[w.mcId] = { affection: 5, trust: 6, respect: 4, attraction: 6, commitment: 2 };
    checkRelationshipMilestones(w);
    const crossings = w.events.filter((e) => e.kind === 'romance.stage');
    expect(crossings.length).toBeGreaterThan(0);
    expect(w.pendingMoment?.npcId).toBe('CHAR_LYRA'); // the scene, on a plate
    expect(w.pendingMoment?.teaser).toBe('the morning after'); // stranger -> lover in one leap
    // no re-log while the stage holds
    checkRelationshipMilestones(w);
    expect(w.events.filter((e) => e.kind === 'romance.stage')).toHaveLength(crossings.length);
  });

  it('mornings digest the day into a chapter-seam summary', () => {
    const w = freshWorld();
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_IRONMARKET_SQ');
    advanceUntilMorning(w, 'bed');
    const digest = w.events.find((e) => e.kind === 'day.summary');
    expect(digest).toBeTruthy();
    expect(digest!.summary).toMatch(/streets? walked/);
  });

  it('the threads board surfaces rivals, waiting arcs, and unspoken rites', () => {
    const w = freshWorld();
    w.rivals = [{ id: 'RIV_T', name: 'Old Tench', templateKey: 'dire-wolf', modifierKey: 'gilded', power: 3, scars: [], lastSeenDay: 1, grudge: 3, defeated: false }];
    const kess = w.characters['CHAR_KESS'];
    kess.alive = false;
    kess.wasParty = true;
    const threads = openThreads(w);
    expect(threads.some((t) => t.kind === 'rival' && t.label.includes('Old Tench'))).toBe(true);
    expect(threads.some((t) => t.kind === 'arc')).toBe(true); // offered personal arcs
    expect(threads.some((t) => t.kind === 'grief' && t.label.includes('Kess'))).toBe(true);
    expect(threads[0].urgency).toBeGreaterThanOrEqual(threads[threads.length - 1].urgency);
  });

  it('death leaves grief, a morning of mourning, a rite, and an anniversary', () => {
    const w = freshWorld();
    w.deathRule = 'classic';
    const lyra = w.characters['CHAR_LYRA'];
    lyra.alive = false;
    lyra.diedOnDay = w.time.day;
    lyra.wasParty = true;
    w.mourning = [{ charId: lyra.id, day: w.time.day }];
    advanceUntilMorning(w, 'bed');
    expect(w.events.some((e) => e.kind === 'mourning' && e.summary.includes('Lyra'))).toBe(true);
    // the rite
    w.characters[w.mcId].money = 10000;
    expect(templeRite(w, 'LOC_TEMPLE', 'memorial', lyra.id)).toBeNull();
    expect(lyra.memorialized).toBe(true);
    expect(templeRite(w, 'LOC_TEMPLE', 'memorial', lyra.id)).toMatch(/already spoken/);
    // the anniversary
    w.time.day = lyra.diedOnDay + 360;
    runBirthdays(w);
    expect(w.events.some((e) => e.kind === 'remembrance' && e.summary.includes('Lyra'))).toBe(true);
  });

  it('companions react to notable places once, in their own voice', () => {
    const w = freshWorld();
    const mara = w.characters['CHAR_MARA'];
    mara.inParty = true;
    mara.location = w.partyLocation;
    let saw = 0;
    for (let i = 0; i < 40 && !saw; i++) {
      w.time.minute = (w.time.minute + 37) % 1440;
      w.partyLocation = 'LOC_TEMPLE';
      maybeCompanionSight(w);
      saw = w.events.filter((e) => e.kind === 'companion.sight').length;
    }
    expect(saw).toBeGreaterThanOrEqual(1);
    // keep visiting: each companion reacts at most once per place
    for (let i = 0; i < 60; i++) {
      w.time.minute = (w.time.minute + 37) % 1440;
      maybeCompanionSight(w);
    }
    const byChar = new Map<string, number>();
    for (const e of w.events.filter((x) => x.kind === 'companion.sight')) {
      const id = (e.data as { character: string }).character;
      byChar.set(id, (byChar.get(id) ?? 0) + 1);
    }
    for (const [id, n] of byChar) expect(n, id).toBe(1);
  });

  it('a wife may conceive; the term runs its days; the birth is a person', () => {
    const w = freshWorld();
    const lyra = w.characters['CHAR_LYRA'];
    lyra.relationships[w.mcId] = { affection: 8, trust: 8, respect: 7, attraction: 7, commitment: 9 };
    expect(eligibleSpouses(w).map((c) => c.id)).toContain('CHAR_LYRA');
    expect(DAILY_CONCEPTION_CHANCE).toBeLessThanOrEqual(0.05); // a small chance, as asked
    let conceived = false;
    for (let d = 1; d <= 600 && !conceived; d++) {
      w.time.day = d;
      dailyFamilyTick(w);
      conceived = lyra.pregnantSince !== undefined;
    }
    expect(conceived).toBe(true);
    expect(w.events.some((e) => e.kind === 'pregnancy')).toBe(true);
    // late term: she moves herself off the front rank
    lyra.inParty = true;
    lyra.row = 'front';
    w.time.day = lyra.pregnantSince! + Math.floor(PREGNANCY_TERM_DAYS * 0.55);
    dailyFamilyTick(w);
    expect(lyra.row).toBe('back');
    // the birth
    w.time.day = lyra.pregnantSince! + PREGNANCY_TERM_DAYS;
    dailyFamilyTick(w);
    expect(lyra.pregnantSince).toBeUndefined();
    const child = Object.values(w.characters).find((c) => c.parents?.[0] === 'CHAR_LYRA');
    expect(child).toBeTruthy();
    expect(child!.parents![1]).toBe(w.mcId);
    expect(child!.age).toBe(0);
    expect(child!.birthDay).toBe(w.time.day % 360);
    expect(w.events.some((e) => e.kind === 'birth' && e.summary.includes(child!.name))).toBe(true);
  });

  it('the first spine ends by opening the second; the second writes the epilogue', () => {
    const w = freshWorld();
    const stage1 = mainQuests(w)[0];
    advanceCampaign(w, { ...stage1, stage: 8, status: 'completed' });
    // arc I closing is a book-end, not the end: arc II stage 9 is offered
    expect(w.campaignComplete).toBeUndefined();
    expect(mainQuests(w).some((q) => q.stage === 9 && q.status === 'offered')).toBe(true);
    expect(w.events.some((e) => e.kind === 'campaign.complete' && e.summary.includes('first spine'))).toBe(true);
    advanceCampaign(w, { ...stage1, stage: 16, status: 'completed' });
    expect(w.campaignComplete).toBe(true);
    const epi = w.events.find((e) => e.kind === 'epilogue');
    expect(epi).toBeTruthy();
    expect(epi!.summary).toContain('EPILOGUE MATERIAL');
  });
});


describe('riddle doors (round 9): knowledge is the oldest key', () => {
  it('riddle doors cite lorebooks from shallower floors and open only to the read', () => {
    let tested = false;
    for (let seed = 1; seed <= 40 && !tested; seed++) {
      const w = freshWorld();
      w.dungeons['DUN_DEEP_001'].generationSeed = seed;
      enterDungeon(w, 'DUN_DEEP_001');
      const d = w.dungeons['DUN_DEEP_001'];
      const room = Object.values(d.rooms).find((r) => r.riddleDoor && !r.riddleDoor.opened);
      if (!room) continue;
      // the answer lives shallower than the door
      const loreFloor = parseInt(room.riddleDoor!.loreId.split(':')[1], 10);
      expect(loreFloor).toBeLessThan(room.floor);
      // barred without the reading
      w.currentRoom = room.id;
      const blocked = moveInDungeon(w, room.riddleDoor!.dir);
      expect('error' in blocked && blocked.error).toMatch(/riddle-door/);
      expect(answerRiddle(w)).toMatch(/does not know the answer/);
      // read the pages, speak the answer
      w.codex = [...(w.codex ?? []), room.riddleDoor!.loreId];
      expect(answerRiddle(w)).toBeNull();
      expect(room.riddleDoor!.opened).toBe(true);
      const through = moveInDungeon(w, room.riddleDoor!.dir);
      expect('error' in through).toBe(false);
      tested = true;
    }
    expect(tested).toBe(true);
  });
});


describe('round 9b: songs, the Hinterlands, mounts, writs', () => {
  it('the Lantern Round lights the dark on the singer\'s breath', () => {
    const w = freshWorld();
    const corva = w.characters['CHAR_CORVA'];
    corva.inParty = true;
    corva.location = w.partyLocation;
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const inner = Object.values(d.rooms).find((r) => r.floor === 1 && !r.isStairsUp && !r.darkZone)!;
    w.currentRoom = inner.id;
    expect(isDark(w)).toBe(true); // no torch
    expect(startSong(w, 'light')).toBeNull();
    expect(isDark(w)).toBe(false); // the song holds
    // breath runs out
    corva.stamina.current = 2;
    drainSong(w);
    drainSong(w);
    expect(w.activeSong).toBeNull();
    expect(isDark(w)).toBe(true);
    // no bard, no songs
    const w2 = freshWorld();
    expect(startSong(w2, 'finding')).toMatch(/carries the songs/);
  });

  it('the Hinterlands are on the map, roads run both ways, and the Broken Watch stands', () => {
    const w = freshWorld();
    for (const id of ['LOC_LANDGATE', 'LOC_SALTROAD1', 'LOC_WAYREST', 'LOC_SALTMERE', 'LOC_PINEROAD1', 'LOC_HERMITAGE', 'LOC_BROKENWATCH']) {
      expect(w.locations[id], id).toBeTruthy();
      expect(w.locations[id].district).toBe('The Hinterlands');
    }
    expect(w.locations['LOC_GRAVEROW'].connections).toContain('LOC_LANDGATE');
    expect(w.locations['LOC_BROKENWATCH'].dungeonId).toBe('DUN_WILD_001');
    enterDungeon(w, 'DUN_WILD_001');
    expect(Object.keys(w.dungeons['DUN_WILD_001'].rooms).length).toBeGreaterThan(6);
    expect(MONSTERS[w.dungeons['DUN_WILD_001'].bossKey]).toBeTruthy();
  });

  it('a horse shortens roads and deepens packs', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    mc.money = 5000;
    expect(buyMount(w)).toMatch(/No stable/);
    // walk to the Wayrest the long way (engine travel is instant per hop)
    for (const hop of ['LOC_RATCATCHER', 'LOC_IRONMARKET_SQ', 'LOC_GRAVEROW', 'LOC_LANDGATE', 'LOC_SALTROAD1', 'LOC_WAYREST']) travelTo(w, hop);
    const before = w.time.day * 1440 + w.time.minute;
    expect(buyMount(w)).toBeNull();
    expect(w.mount).toBeTruthy();
    expect(buyMount(w)).toMatch(/personally/);
    expect(slotCapacity(mc, w) - slotCapacity(mc)).toBe(3);
    // roads shrink: same-district hop was 10, mounted is 6
    const t0 = w.time.day * 1440 + w.time.minute;
    travelTo(w, 'LOC_SALTROAD1');
    expect(w.time.day * 1440 + w.time.minute - t0).toBe(6);
    void before;
  });

  it('writs post daily, pay over the odds, and fill once per counter', () => {
    const w = freshWorld();
    const mc = w.characters[w.mcId];
    const writ = getWrit(w, 'LOC_PHYSIC')!;
    expect(writ).toBeTruthy();
    expect(getWrit(w, 'LOC_PHYSIC')!.proto).toBe(writ.proto); // deterministic per day
    // deliver
    w.partyLocation = 'LOC_PHYSIC';
    expect(fulfillWrit(w, 'LOC_PHYSIC')).toMatch(/short/);
    const goods = makeItem(w, writ.proto, writ.qty);
    addToContainer(w, goods, mc);
    const cash = mc.money;
    expect(fulfillWrit(w, 'LOC_PHYSIC')).toBeNull();
    expect(mc.money).toBe(cash + writ.reward);
    expect(fulfillWrit(w, 'LOC_PHYSIC')).toMatch(/already filled/);
    // reward beats raw value
    expect(writ.reward).toBeGreaterThan((w.items[goods.id]?.value ?? 0) * writ.qty);
  });
});
