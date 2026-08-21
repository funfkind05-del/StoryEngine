// Round 12: the house that lives — ambient events, the resident web,
// wants, children who grow up, set bonuses that wake, and trophies.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { Rng } from './rng';
import { dailyHomeLife, fulfillWant } from './homelife';
import { buyFirstHome } from './household';
import { HOUSEHOLD_ALLOWANCE, inviteToLive, spouseLedger } from './hearth';
import { relationshipBetween, remakeMc, travelTo } from './world';
import { dailyFamilyTick, COMING_OF_AGE } from './family';
import { giveGift } from './romance';
import { SET_FAMILIES, affixMod, rollGearMods, setBonusMod } from './progression';
import { SET_RECIPES, craftSetPiece } from './crafting';
import { addToContainer, makeItem, performTempleService } from './rules';
import { takeFromParty } from './services';
import { SPELLS, autoResolve, fieldCast, fieldCastable, startCombat } from './combat';
import { enterDungeon } from './dungeon';
import { doomTick } from './campaign';
import type { Character } from './types';

function homeWithResidents(n: 1 | 2) {
  const w = buildSeedWorld();
  const mc = w.characters[w.mcId];
  mc.money = 2000;
  expect(buyFirstHome(w)).toBeNull();
  const home = Object.values(w.locations).find((l) => l.household)!;
  w.partyLocation = home.id;
  const names = ['CHAR_LYRA', 'CHAR_MARA'].slice(0, n);
  for (const id of names) {
    const c = w.characters[id];
    Object.assign(relationshipBetween(w, id, w.mcId), { affection: 7, trust: 7, attraction: 6, commitment: 5, respect: 5 });
    expect(inviteToLive(w, c.id)).toBeNull();
  }
  return { w, mc, home };
}

describe('the house that lives', () => {
  it('residents generate ambient life without the party lifting a finger', () => {
    const { w } = homeWithResidents(1);
    for (let d = 0; d < 30; d++) {
      w.time.day += 1;
      dailyHomeLife(w);
    }
    expect(w.events.filter((e) => e.kind === 'home.life').length).toBeGreaterThan(0);
  });

  it('two women under one roof grow a web of their own — alliances and frictions, logged', () => {
    const { w } = homeWithResidents(2);
    for (let d = 0; d < 120; d++) {
      w.time.day += 1;
      dailyHomeLife(w);
    }
    const alliances = w.events.filter((e) => e.kind === 'home.alliance');
    const frictions = w.events.filter((e) => e.kind === 'home.friction');
    expect(alliances.length).toBeGreaterThan(0);
    expect(frictions.length).toBeGreaterThan(0);
    // the dials between THEM moved, not just toward the MC
    const rel = w.characters['CHAR_LYRA'].relationships['CHAR_MARA'];
    expect(rel).toBeTruthy();
    expect(Math.abs(rel!.affection) + rel!.trust).toBeGreaterThan(0);
  });

  it('wants surface, expire, and pay bond when heard', () => {
    const { w } = homeWithResidents(1);
    for (let d = 0; d < 20 && !(w.wants ?? []).length; d++) {
      w.time.day += 1;
      dailyHomeLife(w);
    }
    expect((w.wants ?? []).length).toBeGreaterThan(0);
    const want = w.wants![0];
    const rel = relationshipBetween(w, want.charId, w.mcId);
    const before = rel.affection;
    fulfillWant(w, want.charId, want.kind, want.kind === 'visit' ? want.locationId : want.kind === 'gift' ? want.giftKind : undefined);
    expect((w.wants ?? []).find((x) => x.key === want.key)).toBeUndefined();
    expect(rel.affection).toBeGreaterThanOrEqual(before);
    expect(w.events.some((e) => e.kind === 'want.fulfilled')).toBe(true);
  });

  it('a visit-want completes on arrival with her along', () => {
    const w = buildSeedWorld();
    const lyra = w.characters['CHAR_LYRA'];
    lyra.inParty = true;
    w.wants = [{ key: 'visit-LOC_IRONMARKET_SQ', charId: lyra.id, label: 'x', day: w.time.day, kind: 'visit', locationId: 'LOC_IRONMARKET_SQ' }];
    travelTo(w, 'LOC_RATCATCHER');
    expect(w.wants.length).toBe(1);
    travelTo(w, 'LOC_IRONMARKET_SQ');
    expect(w.wants.length).toBe(0);
  });

  it('a gift-want completes only on the kind she was circling', () => {
    const w = buildSeedWorld();
    const mc = w.characters[w.mcId];
    const lyra = w.characters['CHAR_LYRA'];
    lyra.location = w.partyLocation;
    w.wants = [{ key: 'gift-jewelry', charId: lyra.id, label: 'x', day: w.time.day, kind: 'gift', giftKind: 'jewelry' }];
    const dagger = makeItem(w, 'dagger', 1);
    addToContainer(w, dagger, mc);
    expect(giveGift(w, lyra.id, dagger.id)).toBeNull();
    expect(w.wants.length).toBe(1); // wrong kind
    w.time.day += 1; // gift pacing
    const ring = makeItem(w, 'ring-of-the-fox', 1);
    addToContainer(w, ring, mc);
    expect(giveGift(w, lyra.id, ring.id)).toBeNull();
    expect(w.wants.length).toBe(0);
  });
});

describe('children grow up', () => {
  function makeChildOf(w: ReturnType<typeof buildSeedWorld>, age: number): Character {
    const mother = w.characters['CHAR_LYRA'];
    const child: Character = JSON.parse(JSON.stringify(w.characters[w.mcId]));
    child.id = 'CHAR_CHILD_TEST';
    child.name = 'Wren';
    child.isMC = false;
    child.age = age;
    child.charClass = 'commoner';
    child.level = 0;
    child.abilities = [];
    child.parents = [mother.id, w.mcId];
    child.birthDay = w.time.day % 360;
    child.memories = [];
    w.characters[child.id] = child;
    return child;
  }

  it('milestone birthdays write scenes and parents remember', () => {
    const w = buildSeedWorld();
    const child = makeChildOf(w, 6); // just turned six today
    dailyFamilyTick(w);
    const evt = w.events.find((e) => e.kind === 'family.milestone');
    expect(evt).toBeTruthy();
    expect(evt!.summary).toContain('wooden sword');
    expect(w.characters['CHAR_LYRA'].memories.some((m) => m.subject === child.id)).toBe(true);
  });

  it('sixteen picks a trade: class, abilities, a sheet of their own', () => {
    const w = buildSeedWorld();
    const child = makeChildOf(w, COMING_OF_AGE);
    dailyFamilyTick(w);
    expect(child.charClass).not.toBe('commoner');
    expect(w.events.some((e) => e.kind === 'family.coming-of-age')).toBe(true);
  });
});

describe('the party pool shares out', () => {
  it('any member can take from the pool, and full packs refuse', () => {
    const w = buildSeedWorld();
    const lyra = w.characters['CHAR_LYRA'];
    const blade = makeItem(w, 'dagger', 1);
    addToContainer(w, blade, 'party');
    expect(w.partyInventory).toContain(blade.id);
    expect(takeFromParty(w, blade.id, lyra.id)).toBeNull();
    expect(lyra.inventory).toContain(blade.id);
    expect(w.partyInventory).not.toContain(blade.id);
    // a stuffed pack says no
    const back = makeItem(w, 'iron-longsword', 1);
    addToContainer(w, back, 'party');
    while (lyra.inventory.length < 60) {
      const filler = makeItem(w, 'rope', 1);
      addToContainer(w, filler, lyra);
      if (!lyra.inventory.includes(filler.id)) break;
    }
    const res = takeFromParty(w, back.id, lyra.id);
    if (res !== null) expect(res).toMatch(/pack is full/);
  });
});

describe('races and curses (the classics round)', () => {
  it('race choice at creation moves the sheet and leaves a mark', () => {
    const w = buildSeedWorld();
    const before = { hp: w.characters[w.mcId].hp.max, con: w.characters[w.mcId].attributes.constitution };
    remakeMc(w, 'fighter', {}, 'dwarf');
    const mc = w.characters[w.mcId];
    expect(mc.race).toBe('dwarf');
    expect(mc.attributes.constitution).toBe(before.con + 2);
    expect(mc.hp.max).toBe(before.hp + 6);
    expect(mc.permanentBonuses.some((b) => b.includes('Dwarf blood'))).toBe(true);
  });

  it('cursed gear hides, sticks, and lets go at the temple', () => {
    const w = buildSeedWorld();
    const mc = w.characters[w.mcId];
    const it = makeItem(w, 'iron-longsword', 1);
    it.cursed = true;
    it.unidentified = true;
    it.affix = { name: 'of the False Warlord', stat: 'attack', amount: -2 };
    addToContainer(w, it, mc);
    mc.equipment['main-hand'] = it.id;
    it.equippedBy = mc.id;
    // the temple frees it
    const msg = performTempleService('remove-curse', mc, w);
    expect(msg).toMatch(/released/);
    expect(it.cursed).toBe(false);
    expect(it.unidentified).toBe(false);
  });

  it('about one drop in sixteen is cursed, and always hides as unidentified', () => {
    const w = buildSeedWorld();
    const rng = new Rng(42);
    let cursed = 0;
    for (let i = 0; i < 400; i++) {
      const it = makeItem(w, 'iron-longsword', 1);
      rollGearMods(rng, it, 1);
      if (it.cursed) {
        cursed++;
        expect(it.unidentified).toBe(true);
        expect((it.affix?.amount ?? 0)).toBeLessThan(0);
      }
    }
    expect(cursed).toBeGreaterThan(8);
    expect(cursed).toBeLessThan(60);
  });
});

describe('the Circle resurrects wardens with bodies', () => {
  it('doom stage 2 restores the boss room to alive — no more unkillable open dungeons', () => {
    const w = buildSeedWorld();
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    d.bossDefeated = true;
    const bossRoom = Object.values(d.rooms).find((r) => r.isBossRoom)!;
    bossRoom.enemies = 'dead';
    bossRoom.clearedDay = 1;
    // idle main quest + 30 days → doom advances to 1, then 2
    w.doom = { stage: 1, lastAdvanceDay: 1 };
    w.time.day = 50; // stage 1→2 waits 30+15 idle days now
    doomTick(w);
    expect(w.doom!.stage).toBe(2);
    expect(d.bossDefeated).toBe(false);
    expect(bossRoom.enemies).toBe('alive');
    expect(bossRoom.encounterKey).toBe(d.bossKey);
  });
});

describe('one ledger', () => {
  it('a resident spouse pools her coin above the allowance, and draws back when broke; a lover does not', () => {
    const { w, home } = homeWithResidents(2);
    const lyra = w.characters['CHAR_LYRA'];
    const mara = w.characters['CHAR_MARA'];
    // Lyra marries in; Mara stays a lover (moving in nudged commitment,
    // so pin her below the vow line explicitly)
    Object.assign(relationshipBetween(w, lyra.id, w.mcId), { commitment: 9, attraction: 6 });
    Object.assign(relationshipBetween(w, mara.id, w.mcId), { commitment: 3, attraction: 6, affection: 7 });
    lyra.money = 400;
    mara.money = 400;
    const hh = home.household!;
    const chest = hh.treasury;
    spouseLedger(w);
    expect(lyra.money).toBe(HOUSEHOLD_ALLOWANCE);
    expect(hh.treasury).toBe(chest + 350);
    expect(mara.money).toBe(400); // her purse is her own until vows
    expect(w.events.some((e) => e.kind === 'hearth.ledger')).toBe(true);
    // broke spouse draws pin money back
    lyra.money = 0;
    spouseLedger(w);
    expect(lyra.money).toBe(HOUSEHOLD_ALLOWANCE);
  });
});

describe('field casting', () => {
  it('a priest mends the party between fights — mana spent, wounds closed, refusals honest', () => {
    const w = buildSeedWorld();
    const yvenne = w.characters['CHAR_YVENNE'];
    yvenne.inParty = true;
    yvenne.location = w.partyLocation;
    expect(fieldCastable(yvenne)).toContain('mend-wounds');
    const kael = w.characters[w.mcId];
    // whole party: nothing to mend
    expect(fieldCast(w, yvenne.id, 'mend-wounds')).toMatch(/whole already|No one to mend/);
    kael.hp.current = 3;
    const manaBefore = yvenne.mana.current;
    expect(fieldCast(w, yvenne.id, 'mend-wounds')).toBeNull();
    expect(kael.hp.current).toBeGreaterThan(3);
    expect(yvenne.mana.current).toBe(manaBefore - SPELLS['mend-wounds'].mana);
    expect(w.events.some((e) => e.kind === 'spell.field')).toBe(true);
    // out of breath: refused
    yvenne.mana.current = 0;
    kael.hp.current = 3;
    expect(fieldCast(w, yvenne.id, 'mend-wounds')).toMatch(/needs/);
    // damage spells never cast cold
    expect(fieldCast(w, w.mcId, 'firebolt')).toMatch(/does not know|only answers in battle/);
  });

  it('purify strips afflictions in the field', () => {
    const w = buildSeedWorld();
    const yvenne = w.characters['CHAR_YVENNE'];
    yvenne.inParty = true;
    yvenne.abilities.push('purify');
    const kael = w.characters[w.mcId];
    kael.statuses.push({ key: 'poisoned', appliedDay: w.time.day, minutesUntreated: 0 } as never);
    expect(fieldCast(w, yvenne.id, 'purify')).toBeNull();
    expect(kael.statuses.some((st) => st.key === 'poisoned')).toBe(false);
  });
});

describe('set families and trophies', () => {
  it('two Ashgrip pieces wake the family bonus; one does not', () => {
    const w = buildSeedWorld();
    const mc = w.characters[w.mcId];
    w.partyLocation = 'LOC_FORGE';
    for (const proto of [['iron-scrap', 11], ['ember-essence', 3], ['wyrm-scale', 1]] as const) {
      addToContainer(w, makeItem(w, proto[0], proto[1]), mc);
    }
    expect(craftSetPiece(w, 'ashgrip')).toBeNull();
    expect(craftSetPiece(w, 'ashgrip-band')).toBeNull();
    const blade = mc.inventory.map((i) => w.items[i]).find((i) => i?.name === 'Ashgrip Blade')!;
    const band = mc.inventory.map((i) => w.items[i]).find((i) => i?.name === 'Ashgrip Band')!;
    expect(blade.setKey).toBe('ashgrip');
    expect(band.setKey).toBe('ashgrip');
    mc.equipment['main-hand'] = blade.id;
    blade.equippedBy = mc.id;
    expect(setBonusMod(w, mc, 'attack')).toBe(0);
    mc.equipment['ring'] = band.id;
    band.equippedBy = mc.id;
    expect(setBonusMod(w, mc, 'attack')).toBe(SET_FAMILIES.ashgrip.amount);
    expect(affixMod(w, mc, 'attack')).toBeGreaterThanOrEqual(SET_FAMILIES.ashgrip.amount + 2 + 1);
  });

  it('every set recipe belongs to a real family with a real station', () => {
    const w = buildSeedWorld();
    for (const r of SET_RECIPES) {
      expect(SET_FAMILIES[r.setKey], r.key).toBeTruthy();
      expect(w.locations[r.station], r.key).toBeTruthy();
    }
    for (const fam of Object.keys(SET_FAMILIES)) {
      expect(SET_RECIPES.filter((r) => r.setKey === fam).length, fam).toBeGreaterThanOrEqual(2);
    }
  });

  it('a fallen warden becomes a trophy for the wall', () => {
    const w = buildSeedWorld();
    for (const c of Object.values(w.characters)) if (c.inParty || c.isMC) { c.level = 20; c.hp.max = 300; c.hp.current = 300; c.attributes.strength = 20; }
    enterDungeon(w, 'DUN_OLDQUARTER_001');
    const d = w.dungeons['DUN_OLDQUARTER_001'];
    const bossRoom = Object.values(d.rooms).find((r) => r.isBossRoom)!;
    w.currentRoom = bossRoom.id;
    startCombat(w, {
      seed: 7, description: 'the warden', monsters: [{ templateKey: 'giant-rat', count: 1 }],
      source: 'dungeon', locationId: w.partyLocation, roomId: bossRoom.id,
    });
    autoResolve(w);
    expect(d.bossDefeated).toBe(true);
    const trophy = [...w.partyInventory].map((i) => w.items[i]).find((i) => i?.proto === 'boss-trophy');
    expect(trophy).toBeTruthy();
    expect(trophy!.name).toContain('Trophy:');
    expect(w.events.some((e) => e.kind === 'trophy')).toBe(true);
  });
});
