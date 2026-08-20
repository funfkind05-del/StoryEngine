// The ESO inheritance: named set pieces worked at particular stations,
// and chosen glyphs at the study (a third essence buys the choice).

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { SET_RECIPES, countMaterial, craftSetPiece, enchantItem } from './crafting';
import { buyFirstHome, findHome } from './household';
import { addToContainer, makeItem } from './rules';

function give(w: ReturnType<typeof buildSeedWorld>, proto: string, qty: number) {
  addToContainer(w, makeItem(w, proto, qty), w.characters[w.mcId]);
}

describe('set stations', () => {
  it('every pattern names a real station location', () => {
    const w = buildSeedWorld();
    for (const r of SET_RECIPES) expect(w.locations[r.station], r.key).toBeTruthy();
  });

  it('refuses away from the station, then wants the full bill of materials', () => {
    const w = buildSeedWorld();
    expect(craftSetPiece(w, 'no-such')).toBe('No such pattern.');
    expect(craftSetPiece(w, 'ashgrip')).toMatch(/worked at Harrow/);
    w.partyLocation = 'LOC_FORGE';
    expect(craftSetPiece(w, 'ashgrip')).toMatch(/short on/);
  });

  it('forges the Ashgrip Blade: named, dual-affixed, storied, materials burned', () => {
    const w = buildSeedWorld();
    const mc = w.characters[w.mcId];
    w.partyLocation = 'LOC_FORGE';
    give(w, 'iron-scrap', 8);
    give(w, 'ember-essence', 2);
    give(w, 'wyrm-scale', 1);
    expect(craftSetPiece(w, 'ashgrip')).toBeNull();
    const blade = mc.inventory.map((iid) => w.items[iid]).find((i) => i?.name === 'Ashgrip Blade')!;
    expect(blade).toBeTruthy();
    expect(blade.quality).toBe('superior');
    expect(blade.tier).toBe('exceptional');
    expect(blade.affix?.name).toBe('of the Warlord');
    expect(blade.affix2?.name).toBe('of the Adder');
    expect(blade.lore).toMatch(/masterwork/);
    expect(blade.damage).toBe('1d8+5'); // steel longsword 1d8+3, pattern-tempered +2
    expect(countMaterial(w, 'iron-scrap')).toBe(0);
    expect(countMaterial(w, 'ember-essence')).toBe(0);
    expect(countMaterial(w, 'wyrm-scale')).toBe(0);
    expect(w.events.some((e) => e.kind === 'craft.set')).toBe(true);
  });
});

describe('chosen glyphs', () => {
  function homeWithStudy() {
    const w = buildSeedWorld();
    const mc = w.characters[w.mcId];
    mc.money = 900;
    expect(buyFirstHome(w)).toBeNull();
    const home = findHome(w)!;
    w.locations[home].household!.upgrades.push('enchanters-study');
    w.partyLocation = home;
    return { w, mc };
  }

  it('a chosen glyph runs a third essence; the study delivers the named affix', () => {
    const { w, mc } = homeWithStudy();
    const sword = makeItem(w, 'iron-longsword', 1);
    addToContainer(w, sword, mc);
    give(w, 'ember-essence', 2);
    expect(enchantItem(w, sword.id, 'of the Wall')).toMatch(/3× ember essence/);
    give(w, 'ember-essence', 1);
    expect(enchantItem(w, sword.id, 'no-such-glyph')).toBe('No such glyph.');
    expect(enchantItem(w, sword.id, 'of the Wall')).toBeNull();
    expect(sword.affix?.name).toBe('of the Wall');
    expect(sword.name).toMatch(/of the Wall$/);
    expect(countMaterial(w, 'ember-essence')).toBe(0);
  });

  it('the cheap way still works: two essence, the study picks the glyph', () => {
    const { w, mc } = homeWithStudy();
    const sword = makeItem(w, 'iron-longsword', 1);
    addToContainer(w, sword, mc);
    give(w, 'ember-essence', 2);
    expect(enchantItem(w, sword.id)).toBeNull();
    expect(sword.affix).toBeTruthy();
    expect(countMaterial(w, 'ember-essence')).toBe(0);
  });
});
