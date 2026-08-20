// Tests for the RPG Rules Engine and the city service economy.

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import {
  CLASSES,
  applyStatus,
  consumeItem,
  fmtMoney,
  hasStatus,
  levelUpAvailable,
  makeItem,
  needsAttackMod,
  needsDefenseMod,
  addToContainer,
  slotCapacity,
  slotsUsed,
  tickStatusesRound,
  xpForLevel,
} from './rules';
import {
  buyFromShop,
  buyMeal,
  buyTempleService,
  depositItem,
  moveToParty,
  restAtInn,
  sellToShop,
  trainAt,
  treasuryTransfer,
  useConsumable,
} from './services';
import { grantXp, tick, travelTo } from './world';
import { buyFirstHome } from './household';
import { resolveRound, startCombat } from './combat';
import { Rng } from './rng';
import type { WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 4242;
  return w;
}

describe('currency', () => {
  it('formats copper as g/s/c', () => {
    expect(fmtMoney(0)).toBe('0c');
    expect(fmtMoney(7)).toBe('7c');
    expect(fmtMoney(37)).toBe('3s 7c');
    expect(fmtMoney(1234)).toBe('12g 3s 4c');
  });
});

describe('XP, levels, and training', () => {
  it('awards XP without auto-leveling; training at the right guild levels up', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    expect(kael.level).toBe(1);
    grantXp(w, kael, 150); // past the 100 needed for level 2
    expect(kael.level).toBe(1); // not yet — needs a trainer
    expect(levelUpAvailable(kael)).toBe(true);
    expect(w.events.some((e) => e.kind === 'level.available')).toBe(true);

    // wrong trainer: the temple trains priests, not fighters
    travelTo(w, 'LOC_TEMPLE');
    expect(trainAt(w, 'LOC_TEMPLE', kael.id)).toMatch(/trains priests/);

    // right trainer, but broke
    travelTo(w, 'LOC_FIGHTGUILD');
    kael.money = 0;
    expect(trainAt(w, 'LOC_FIGHTGUILD', kael.id)).toMatch(/Training costs/);

    kael.money = 5000;
    const hpBefore = kael.hp.max;
    expect(trainAt(w, 'LOC_FIGHTGUILD', kael.id)).toBeNull();
    expect(kael.level).toBe(2);
    expect(kael.hp.max).toBeGreaterThan(hpBefore);
    expect(kael.abilities).toContain('shield-bash');
    expect(levelUpAvailable(kael)).toBe(false);
    expect(xpForLevel(2)).toBe(400);
  });

  it('every class has a trainer name', () => {
    for (const def of Object.values(CLASSES)) expect(def.trainer.length).toBeGreaterThan(0);
  });
});

describe('items, stacking, encumbrance', () => {
  it('stacks stackables and decrements on use until gone', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    const potion = kael.inventory.map((i) => w.items[i]).find((i) => i?.proto === 'minor-healing-potion')!;
    expect(potion.qty).toBe(2);
    // buying another merges into the stack
    const extra = makeItem(w, 'minor-healing-potion', 1);
    addToContainer(w, extra, kael);
    expect(potion.qty).toBe(3);
    kael.hp.current = 1;
    useConsumable(w, potion.id, kael.id);
    expect(potion.qty).toBe(2);
    useConsumable(w, potion.id, kael.id);
    useConsumable(w, potion.id, kael.id);
    // stack exhausted: removed from inventory (Healing Potion ×0)
    expect(kael.inventory.includes(potion.id)).toBe(false);
    expect(potion.owner).toBeNull();
    expect(kael.hp.current).toBeGreaterThan(1);
  });

  it('light encumbrance limits slots', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    w.encumbrance = 'light';
    travelTo(w, 'LOC_RATCATCHER');
    travelTo(w, 'LOC_IRONMARKET_SQ');
    travelTo(w, 'LOC_DRYGOODS');
    kael.money = 100000;
    expect(buyFromShop(w, 'LOC_DRYGOODS', 0, kael)).toBeNull(); // start a torch stack
    // fill the pack with distinct non-stack items
    let guard = 0;
    while (slotsUsed(w, kael) < slotCapacity(kael) && guard++ < 60) {
      addToContainer(w, makeItem(w, 'dagger'), kael);
    }
    expect(slotsUsed(w, kael)).toBe(slotCapacity(kael));
    const err = buyFromShop(w, 'LOC_DRYGOODS', 1, kael); // rope: new stack → needs a free slot
    expect(err).toMatch(/pack is full/);
    // a stackable he already carries merges without needing a slot
    expect(buyFromShop(w, 'LOC_DRYGOODS', 0, kael)).toBeNull();
    // encumbrance OFF lifts the limit
    w.encumbrance = 'off';
    expect(buyFromShop(w, 'LOC_DRYGOODS', 1, kael)).toBeNull();
  });
});

describe('status effects', () => {
  it('poison damages each combat round and over world time; antidote cures', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    applyStatus(kael, 'poisoned');
    expect(hasStatus(kael, 'poisoned')).toBe(true);
    const hp = kael.hp.current;
    tickStatusesRound(kael);
    expect(kael.hp.current).toBe(hp - 3);
    // over time: 3 HP per 10 minutes
    const hp2 = kael.hp.current;
    tick(w, 30);
    expect(kael.hp.current).toBeLessThanOrEqual(hp2 - 6); // regen suppressed while poisoned
    const antidote = makeItem(w, 'antidote');
    addToContainer(w, antidote, kael);
    consumeItem(w, w.items[antidote.id] ?? antidote, kael, new Rng(1));
    expect(hasStatus(kael, 'poisoned')).toBe(false);
  });

  it('poison never kills outright outside combat', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    applyStatus(kael, 'poisoned');
    kael.hp.current = 2;
    tick(w, 600);
    expect(kael.hp.current).toBe(1);
    expect(kael.alive).toBe(true);
  });
});

describe('shops', () => {
  it('buying decrements stock and coin; stock can sell out; selling pays', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    travelTo(w, 'LOC_PHYSIC');
    const shop = w.locations['LOC_PHYSIC'].shop!;
    const entryIdx = shop.stock.findIndex((s) => s.proto === 'purification-elixir'); // qty 1
    kael.money = 1000;
    expect(buyFromShop(w, 'LOC_PHYSIC', entryIdx, kael)).toBeNull();
    expect(shop.stock[entryIdx].qty).toBe(0);
    expect(buyFromShop(w, 'LOC_PHYSIC', entryIdx, kael)).toBe('Sold out.');
    expect(kael.money).toBe(1000 - 150);
    // greater healing potion starts SOLD OUT in the seed
    const greater = shop.stock.find((s) => s.proto === 'greater-healing-potion')!;
    expect(greater.qty).toBe(0);
    // sell the elixir back
    const elixir = kael.inventory.map((i) => w.items[i]).find((i) => i?.proto === 'purification-elixir')!;
    const before = kael.money;
    expect(sellToShop(w, 'LOC_PHYSIC', elixir.id, kael)).toBeNull();
    expect(kael.money).toBeGreaterThan(before);
  });
});

describe('temple & death rules', () => {
  it('heals for a price and resurrects only the dead', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    const lyra = w.characters['CHAR_LYRA'];
    travelTo(w, 'LOC_TEMPLE');
    kael.money = 1000;
    lyra.hp.current = 1;
    expect(buyTempleService(w, 'LOC_TEMPLE', 'full-healing', lyra.id)).toBeNull();
    expect(lyra.hp.current).toBe(lyra.hp.max);
    expect(kael.money).toBe(1000 - 170);
    expect(buyTempleService(w, 'LOC_TEMPLE', 'resurrection', lyra.id)).toMatch(/not dead/);
    lyra.alive = false;
    lyra.diedOnDay = 2;
    kael.money = 5000;
    expect(buyTempleService(w, 'LOC_TEMPLE', 'resurrection', lyra.id)).toBeNull();
    expect(lyra.alive).toBe(true);
  });

  it('story mode keeps the party alive through defeat; classic kills', () => {
    for (const rule of ['story', 'classic'] as const) {
      const w = freshWorld();
      w.deathRule = rule;
      const kael = w.characters[w.mcId];
      const lyra = w.characters['CHAR_LYRA'];
      kael.hp.current = 1;
      lyra.hp.current = 1;
      kael.attack = -20; // they cannot win
      lyra.attack = -20;
      const combat = startCombat(w, {
        seed: 99,
        description: 'a pack of ghouls',
        monsters: [{ templateKey: 'ghoul', count: 4 }],
        source: 'city',
        locationId: w.partyLocation,
      });
      let guard = 0;
      while (combat.outcome === 'ongoing' && guard++ < 60) {
        resolveRound(w, combat.partyIds.map((id) => ({ actor: id, type: 'defend' as const })));
      }
      expect(combat.outcome).toBe('defeat');
      if (rule === 'story') {
        expect(kael.alive && lyra.alive).toBe(true);
        expect(kael.hp.current).toBe(1);
      } else {
        expect(kael.alive || lyra.alive).toBe(false);
        expect(kael.diedOnDay).toBeDefined();
      }
    }
  });
});

describe('inn rest', () => {
  it('costs coin, advances to morning, restores the party', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    kael.hp.current = 3;
    kael.money = 100;
    expect(restAtInn(w, 'LOC_DOCK_0042', 1)).toBeNull(); // private room, 8c
    expect(kael.money).toBe(92);
    expect(kael.hp.current).toBe(kael.hp.max);
    expect(w.time.day).toBe(2);
    expect(w.time.minute).toBe(7 * 60);
  });
});

describe('home storage & treasury', () => {
  it('moves items personal → party → home and coin into the chest, only at home', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    const potionId = kael.inventory.find((i) => w.items[i]?.proto === 'minor-healing-potion')!;
    // not at home yet
    expect(depositItem(w, potionId)).toMatch(/No home/);
    expect(moveToParty(w, potionId)).toBeNull();
    expect(w.partyInventory.some((i) => w.items[i]?.proto === 'minor-healing-potion')).toBe(true);
    // nothing permanent until he buys: the flat costs 800
    kael.money = 100;
    expect(buyFirstHome(w)).toMatch(/Keep saving/);
    kael.money = 1300;
    expect(buyFirstHome(w)).toBeNull();
    expect(buyFirstHome(w)).toMatch(/already own/);
    travelTo(w, 'LOC_HOME');
    expect(treasuryTransfer(w, 200, 'deposit')).toBeNull();
    const home = w.locations['LOC_HOME'].household!;
    expect(home.treasury).toBe(200);
    expect(kael.money).toBe(300);
    expect(treasuryTransfer(w, 9999, 'withdraw')).toMatch(/lighter/);
    // deposit a personal item into storage
    const swordId = 'ITEM_SWORD_0001';
    w.items[swordId].equippedBy = undefined;
    delete kael.equipment['main-hand'];
    expect(depositItem(w, swordId)).toBeNull();
    expect(home.storage).toContain(swordId);
    expect(w.items[swordId].owner).toBe('HOME_STORAGE');
    expect(home.tier).toBe('cheap-apartment'); // bought, not given
  });
});

describe('survival needs', () => {
  it('hunger and fatigue climb with story time and are visible as warnings', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    kael.needs = { hunger: 0, fatigue: 0 };
    tick(w, 12 * 60); // half a day
    expect(kael.needs.hunger).toBeCloseTo(36, 0);
    expect(kael.needs.fatigue).toBeCloseTo(60, 0);
    expect(w.events.some((e) => e.kind === 'needs' && e.summary.includes('flagging'))).toBe(true);
  });

  it('penalizes the starving and exhausted, blocks regen, and never kills outright', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    kael.needs = { hunger: 90, fatigue: 90 };
    expect(needsAttackMod(kael)).toBe(-5);
    expect(needsDefenseMod(kael)).toBe(-2);
    kael.hp.current = 5;
    tick(w, 240);
    expect(kael.hp.current).toBeLessThan(5); // starvation grinds
    kael.hp.current = 2;
    tick(w, 2000);
    expect(kael.hp.current).toBe(1); // but never kills on its own
  });

  it('meals, rations, and sleep restore needs', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    kael.needs = { hunger: 80, fatigue: 80 };
    kael.money = 100;
    expect(buyMeal(w, 'LOC_DOCK_0042')).toBeNull(); // tavern serves food
    expect(kael.needs.hunger).toBeLessThanOrEqual(21); // -60, +30min drift
    const bread = makeItem(w, 'bread', 2);
    addToContainer(w, bread, kael);
    const before = kael.needs.hunger;
    useConsumable(w, bread.id, kael.id);
    expect(kael.needs.hunger).toBeLessThan(before);
    expect(bread.qty).toBe(1);
    const preSleepHunger = kael.needs.hunger;
    tick(w, 60);
    expect(restAtInn(w, 'LOC_DOCK_0042', 0)).toBeNull();
    expect(kael.needs.fatigue).toBe(0); // slept off
    expect(kael.needs.hunger).toBeGreaterThan(preSleepHunger); // but woke hungry
    // needs off: nothing moves
    w.needsEnabled = false;
    const frozen = { ...kael.needs };
    tick(w, 300);
    expect(kael.needs).toEqual(frozen);
  });
});
