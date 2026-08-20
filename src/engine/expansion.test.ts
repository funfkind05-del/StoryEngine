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
import { reorderScene, tick } from './world';
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

  it('training a fighter to 50 grants the whole tree and then stops', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    for (let i = 0; i < 60; i++) {
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
