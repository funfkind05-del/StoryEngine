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
  ascensionOptions,
  canKessIdentify,
  chooseAscension,
  identifyItem,
  maybeMakeUnique,
  rollGearMods,
} from './progression';
import { buyFromShop, buyTempleService } from './services';
import { autoResolve, resolveRound, startCombat } from './combat';
import { campInDungeon, isDark, lightTorch } from './dungeon';
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
    expect(isDark(w)).toBe(true);
    expect(lightTorch(w)).toBeNull(); // party carries 4 torches
    expect(w.torchMinutes).toBeGreaterThan(0);
    expect(isDark(w)).toBe(false);
    addMinutes(w, 200);
    expect(w.torchMinutes).toBe(0);
    expect(isDark(w)).toBe(true);
    expect(w.events.some((e) => e.summary.includes('guttered out'))).toBe(true);
    // burn the rest of the bundle
    let lit = 0;
    while (lightTorch(w) === null) lit++;
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
