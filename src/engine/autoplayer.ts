// The autoplayer: a bot that plays Blackwall ON PURPOSE. Where the
// burn harness hammers randomly to find crashes, this thing tries to
// WIN — take jobs, hunt in level-appropriate dungeons, train, gear up,
// keep the party fed and alive, and climb. Its test asserts the game
// is actually beatable; every wall it hits is a balance bug found
// before a reader ever meets it.

import type { Character, PendingEncounter, WorldState } from './types';
import { Rng } from './rng';
import { SPELLS, fieldCast, fieldCastable, autoRound, closeCombat, startCombat, takeLoot } from './combat';
import { generateDungeonEncounter, rollCityEncounter } from './encounter';
import {
  answerRiddle,
  campInDungeon,
  enterDungeon,
  exitDungeon,
  lightTorch,
  startSong,
  moveInDungeon,
  pickLock,
  searchRoom,
  takeKey,
  takeLorebook,
  useShrine,
  type MoveDir,
} from './dungeon';
import { partyMembers, travelTo } from './world';
import { openChest } from './loot';
import { buyFromShop, buyMeal, buyTempleService, poorRelief, restAtInn, repairAtShop, restockShops, sellToShop, trainAt, useConsumable } from './services';
import { arrestPay, arrestSurrender } from './crime';
import { acceptQuest, checkQuests, refreshJobs, turnInQuest } from './quests';
import { ITEM_PROTOS, levelUpAvailable, trainingCost } from './rules';
import { advanceUntilMorning } from './world';

export interface AutoplayerState {
  targetDungeon: string | null;
  /** committed travel destination — no dithering between goals mid-road */
  goalDest: string | null;
  goalWhy: string;
  lastXp: number;
  lastProgressStep: number;
  /** consecutive in-dungeon walks with nothing to show — a floor that
   * stops paying gets left, not paced until the torches die */
  wanderStreak?: number;
  leavingFloor?: boolean;
  /** rooms already wall-searched (secret-door sweep), per dungeon */
  sweepSearched?: Record<string, boolean>;
  /** day each dungeon's full sweep last came up empty */
  sweepDoneDay?: Record<string, number>;
  /** actions spent on the current sweep — hard budget, no exceptions */
  sweepSpent?: number;
  log: string[];
}

export function newAutoplayer(): AutoplayerState {
  return { targetDungeon: null, goalDest: null, goalWhy: '', lastXp: 0, lastProgressStep: 0, log: [] };
}

// ---------- helpers ----------
function avgLevel(world: WorldState): number {
  const p = partyMembers(world);
  return p.reduce((s, c) => s + c.level, 0) / Math.max(1, p.length);
}

function totalXp(world: WorldState): number {
  return partyMembers(world).reduce((s, c) => s + c.xp + c.level * c.level * 100, 0);
}

function hurtRatio(world: WorldState): number {
  const p = partyMembers(world);
  const cur = p.reduce((s, c) => s + c.hp.current, 0);
  const max = p.reduce((s, c) => s + c.hp.max, 0);
  return cur / Math.max(1, max);
}

/** BFS one step along the city graph toward a destination. */
function cityStepToward(world: WorldState, dest: string): string | null {
  if (world.partyLocation === dest) return null;
  const prev = new Map<string, string>();
  const q = [world.partyLocation];
  prev.set(world.partyLocation, '');
  while (q.length) {
    const cur = q.shift()!;
    for (const n of world.locations[cur]?.connections ?? []) {
      if (!world.locations[n] || prev.has(n)) continue;
      prev.set(n, cur);
      if (n === dest) {
        // walk back to the first hop
        let step = n;
        while (prev.get(step) !== world.partyLocation) step = prev.get(step)!;
        return step;
      }
      q.push(n);
    }
  }
  return null;
}

/** BFS one step in the current dungeon toward the best objective room. */
function dungeonStepToward(world: WorldState, want: (roomId: string) => boolean): MoveDir | 'here' | null {
  const d = world.dungeons[world.currentDungeon!];
  const start = world.currentRoom!;
  if (want(start)) return 'here';
  const prev = new Map<string, { from: string; dir: MoveDir }>();
  const q = [start];
  const seen = new Set([start]);
  while (q.length) {
    const cur = q.shift()!;
    const room = d.rooms[cur];
    for (const [dir, to] of Object.entries(room.connections) as [MoveDir, string][]) {
      if (!to || seen.has(to)) continue;
      // a locked/riddle passage we can't open yet is a wall for pathing
      if (room.lockedDoor && !room.lockedDoor.opened && room.lockedDoor.dir === dir && !d.keysHeld?.includes(cur)) continue;
      if (room.riddleDoor && !room.riddleDoor.opened && room.riddleDoor.dir === dir) continue;
      seen.add(to);
      prev.set(to, { from: cur, dir });
      if (want(to)) {
        let step = to;
        while (prev.get(step)!.from !== start) step = prev.get(step)!.from;
        return prev.get(step)!.dir;
      }
      q.push(to);
    }
  }
  return null;
}

function bestPotion(world: WorldState, _c: Character): string | null {
  // the party shares its medicine — search every bag
  const pool = [...world.partyInventory, ...partyMembers(world).flatMap((m) => m.inventory)];
  for (const iid of pool) {
    const it = world.items[iid];
    if (it && it.kind === 'potion' && it.healing) return iid;
  }
  return null;
}

/** Equip the best weapon/armor each member owns. */
function equipBest(world: WorldState): void {
  for (const c of partyMembers(world)) {
    const owned = c.inventory.map((i) => world.items[i]).filter(Boolean);
    const score = (dice?: string) => {
      const m = dice?.match(/(\d+)d(\d+)([+-]\d+)?/);
      if (!m) return 0;
      return parseInt(m[1], 10) * (parseInt(m[2], 10) + 1) / 2 + (m[3] ? parseInt(m[3], 10) : 0);
    };
    const weapons = owned.filter((i) => i!.kind === 'weapon' && !i!.broken && !i!.unidentified && (!i!.ranged || c.charClass === 'ranger'));
    const bestW = weapons.sort((a, b) => score(b!.damage) - score(a!.damage))[0];
    if (bestW && c.equipment['main-hand'] !== bestW.id) {
      const prevId = c.equipment['main-hand'];
      if (prevId && world.items[prevId]) world.items[prevId].equippedBy = undefined;
      c.equipment['main-hand'] = bestW.id;
      bestW.equippedBy = c.id;
    }
    const armors = owned.filter((i) => i!.kind === 'armor' && !i!.broken && !i!.unidentified);
    const bestA = armors.sort((a, b) => (b!.defense ?? 0) - (a!.defense ?? 0))[0];
    if (bestA && c.equipment.armor !== bestA.id) {
      const prevId = c.equipment.armor;
      if (prevId && world.items[prevId]) world.items[prevId].equippedBy = undefined;
      c.equipment.armor = bestA.id;
      bestA.equippedBy = c.id;
    }
  }
}

function pickTargetDungeon(world: WorldState, state?: AutoplayerState): string | null {
  const avoided = (id: string) => {
    const day = state?.sweepDoneDay?.[id];
    return day !== undefined && world.time.day - day < 10;
  };
  const lvl = avgLevel(world);
  // the spine's clear-boss target outranks farming, once we're ready:
  // grinding the 'lowest open' dungeon while Sella waits is how the
  // Circle got four quiet months (bot-found wedge)
  const mainBoss = Object.values(world.quests).find((q) => q.isMain && q.status === 'active'
    && q.objectives.some((o) => o.kind === 'clear-boss' && !o.done));
  if (mainBoss) {
    const obj = mainBoss.objectives.find((o) => o.kind === 'clear-boss' && !o.done);
    const target = obj && 'dungeonId' in obj ? world.dungeons[obj.dungeonId] : null;
    if (target && !avoided(target.id) && lvl >= (parseInt(target.recommendedLevel, 10) || 1) - 1) return target.id;
  }
  const open = Object.values(world.dungeons)
    .filter((d) => !d.bossDefeated)
    .map((d) => {
      const lo = parseInt(d.recommendedLevel, 10) || 1;
      return { d, lo };
    })
    .filter((x) => lvl >= x.lo - 1 && !avoided(x.d.id))
    .sort((a, b) => a.lo - b.lo);
  return open[0]?.d.id ?? null;
}

// ---------- the brain ----------
export function autoplayStep(world: WorldState, state: AutoplayerState, _rng: Rng, _step: number): string {
  const mc = world.characters[world.mcId];

  // fight what's in front of us
  if (world.combat?.active) {
    // NOTE: combat does NOT reset the wander streak — respawning
    // rooms hand out a trivial fight every ~25 walks, which kept the
    // 'floor is milked' trigger from ever firing (the bimodal tail)
    autoRound(world);
    if (world.combat && !world.combat.active) {
      if (world.combat.pendingLoot) takeLoot(world, 'all');
      equipBest(world);
      closeCombat(world);
    }
    return 'combat';
  }
  if (world.combat) closeCombat(world);

  if (world.pendingEncounter) {
    if (hurtRatio(world) >= 0.5 || world.currentDungeon) {
      // in the dungeon there is no slipping away — the room remembers
      startCombat(world, world.pendingEncounter as PendingEncounter);
      world.pendingEncounter = null;
      return 'engage';
    }
    world.pendingEncounter = null; // city trouble can be dodged
    return 'avoid';
  }

  if (world.pendingArrest) {
    const due = Math.ceil((world.bounty ?? 0) * 1.2);
    if (mc.money >= due) arrestPay(world);
    else arrestSurrender(world);
    return 'arrest';
  }

  // mend when hurt: a healer's breath is cheaper than a potion
  if (!world.combat && partyMembers(world).some((c) => c.hp.current < c.hp.max * 0.7)) {
    for (const healer of partyMembers(world)) {
      const spells = fieldCastable(healer).filter((k) => !SPELLS[k].cures);
      const best = spells.sort((a, b) => SPELLS[b].mana - SPELLS[a].mana).find((k) => healer.mana.current >= SPELLS[k].mana);
      if (best && fieldCast(world, healer.id, best) === null) return 'field-heal';
    }
  }

  // drink when hurt
  for (const c of partyMembers(world)) {
    if (c.hp.current < c.hp.max * 0.55) {
      const pot = bestPotion(world, c);
      if (pot) {
        useConsumable(world, pot, c.id);
        return 'potion';
      }
    }
  }

  // ---------- inside a dungeon ----------
  if (world.currentDungeon && world.currentRoom) {
    const d = world.dungeons[world.currentDungeon];
    const room = d.rooms[world.currentRoom];

    // retreat when beaten up or exhausted — never pick fights half-dead
    const fatigue = Math.max(...partyMembers(world).map((c) => c.needs.fatigue));
    if (hurtRatio(world) < 0.45 || fatigue > 85) {
      if (hurtRatio(world) >= 0.55 && fatigue > 85 && room.enemies !== 'alive') {
        campInDungeon(world);
        return 'camp';
      }
      exitDungeon(world);
      state.targetDungeon = null;
      return 'retreat';
    }

    if ((world.torchMinutes ?? 0) <= 0 && world.activeSong !== 'light' && !room.darkZone && !(room.floor === 1 && room.isStairsUp)) {
      // free light first: the Lantern Round burns breath, not coin —
      // torches are the fallback for a winded singer
      const sung = startSong(world, 'light');
      if (sung === null) return 'song';
      const lit = lightTorch(world);
      if (lit === null) return 'torch';
      // genuinely out of torches: searching blind is misery — head out
      exitDungeon(world);
      state.targetDungeon = null;
      return 'retreat-dark';
    }
    // dark ZONES are passable — walk through, just don't linger searching

    // work the current room first — anything found here breaks a streak
    if (room.enemies === 'alive' && room.encounterKey) {
      const enc = generateDungeonEncounter(world);
      if (!('error' in enc)) { state.wanderStreak = 0; return 'provoke'; }
    }
    if (room.key && !room.key.taken) { state.wanderStreak = 0; takeKey(world); return 'key'; }
    if (room.lorebook && !room.lorebook.taken) { state.wanderStreak = 0; takeLorebook(world); return 'lore'; }
    if (room.shrine && !room.shrine.used && hurtRatio(world) < 0.85) { useShrine(world); return 'shrine'; }
    if (room.riddleDoor && !room.riddleDoor.opened) {
      const spoke = answerRiddle(world);
      if (spoke === null) return 'riddle';
    }
    if (room.lockedDoor && !room.lockedDoor.opened && !d.keysHeld?.includes(room.id)) {
      pickLock(world);
      return 'picklock';
    }
    if (room.chest && !room.chest.opened) {
      // the burn deletes chest loot; the bot KEEPS it
      const res = openChest(world);
      if (!('error' in res)) {
        mc.money += res.money;
        for (const item of res.items) {
          world.items[item.id] = item;
          item.owner = mc.id;
          mc.inventory.push(item.id);
        }
        equipBest(world);
      }
      state.wanderStreak = 0;
      return 'chest';
    }

    // then walk toward the next objective
    const objective = (rid: string): boolean => {
      const r = d.rooms[rid];
      if (r.floor !== room.floor) return false;
      // an answerable riddle-door is an objective: standing before it
      // is how it gets spoken open
      const answerableRiddle = !!(r.riddleDoor && !r.riddleDoor.opened && (
        (world.codex ?? []).includes(r.riddleDoor.loreId) || r.riddleDoor.lastGuessDay !== world.time.day
      ));
      return r.enemies === 'alive' || !r.explored || !!(r.chest && !r.chest.opened) || !!(r.key && !r.key.taken) || !!(r.lorebook && !r.lorebook.taken) || answerableRiddle;
    };
    // sixty walks without a fight, a find, or a descent means the floor
    // is milked — respawn-chasing here starves the whole run
    if ((state.wanderStreak ?? 0) > 60) state.leavingFloor = true;
    // outgrown floors are corridors, not hunting grounds: once the party
    // is past this hole's weight class, go straight for its warden
    const overleveled = !d.bossDefeated && avgLevel(world) >= (parseInt(d.recommendedLevel, 10) || 1) + 2;
    const bossHunt = (rid: string): boolean => {
      const r = d.rooms[rid];
      return r.floor === room.floor && (!!r.connections.down || (!!r.isBossRoom && r.enemies === 'alive'));
    };
    let dir = state.leavingFloor ? null : dungeonStepToward(world, overleveled ? bossHunt : objective);
    // stairs behind a lock or a riddle read as walls — go earn the way
    // through (keys, lorebooks, answers) instead of giving up on the hole
    if (overleveled && dir === null && !state.leavingFloor) dir = dungeonStepToward(world, objective);
    if (dir === 'here' && overleveled) {
      if (room.connections.down) {
        moveInDungeon(world, 'down');
        return 'descend';
      }
      // deepest floor, warden gone quiet — nothing here outranks us
      exitDungeon(world);
      state.targetDungeon = null;
      return 'dungeon-done';
    }
    if (dir === null) {
      // floor is spent — take the stairs, or claim the boss floor is done
      const stairs = (rid: string) => {
        const r = d.rooms[rid];
        return r.floor === room.floor && (!!r.connections.down || !!r.isBossRoom);
      };
      dir = dungeonStepToward(world, stairs);
      // the classic move before giving up on a live warden: the floor
      // is mapped and there's no way on — so SEARCH THE WALLS, room by
      // room, until a secret door gives or every wall has been tried
      const wardenWaits = !d.bossDefeated;
      const sweep = (): string | null => {
        if (!wardenWaits) return null;
        // HARD BUDGET: run 6 spent 207,279 actions sweep-walking.
        // A sweep gets ~120 actions, then the verdict is 'not today'.
        state.sweepSpent = (state.sweepSpent ?? 0) + 1;
        if (state.sweepSpent > 120) {
          (state.sweepDoneDay ??= {})[d.id] = world.time.day;
          state.sweepSpent = 0;
          return null;
        }
        // a finished, fruitless sweep stands for ten days — re-sweeping
        // every visit turned the early game into wall-fondling
        state.sweepDoneDay ??= {};
        const lastDone = state.sweepDoneDay[d.id];
        if (lastDone !== undefined && world.time.day - lastDone < 10) return null;
        if (lastDone !== undefined && world.time.day - lastDone >= 10) {
          delete state.sweepDoneDay[d.id];
          for (const k of Object.keys(state.sweepSearched ?? {})) if (k.startsWith(`${d.id}:`)) delete state.sweepSearched![k];
        }
        state.sweepSearched ??= {};
        const key = `${d.id}:${room.id}`;
        if (!state.sweepSearched[key]) {
          state.sweepSearched[key] = true;
          const before = Object.keys(room.connections).length;
          searchRoom(world);
          if (Object.keys(room.connections).length > before) state.leavingFloor = false; // a wall gave
          return 'sweep-search';
        }
        const unsearched = (rid: string) => d.rooms[rid].floor === room.floor && !state.sweepSearched![`${d.id}:${rid}`];
        const dirU = dungeonStepToward(world, unsearched);
        if (dirU && dirU !== 'here') {
          const res = moveInDungeon(world, dirU);
          if (!('error' in res)) return 'sweep-walk';
        }
        return null;
      };
      if (dir === 'here') {
        state.wanderStreak = 0;
        state.leavingFloor = false;
        if (room.connections.down) {
          moveInDungeon(world, 'down');
          return 'descend';
        }
        const swept = sweep();
        if (swept) return swept;
        if (wardenWaits) (state.sweepDoneDay ??= {})[d.id] = world.time.day;
        state.sweepSpent = 0;
        // boss floor cleared or nothing left anywhere
        exitDungeon(world);
        state.targetDungeon = null;
        return 'dungeon-done';
      }
      if (dir === null) {
        const swept = sweep();
        if (swept) return swept;
        if (wardenWaits) (state.sweepDoneDay ??= {})[d.id] = world.time.day;
        state.sweepSpent = 0;
        // no stairs reachable either — this hole is done for the day
        state.wanderStreak = 0;
        state.leavingFloor = false;
        exitDungeon(world);
        state.targetDungeon = null;
        return 'dungeon-done';
      }
    }
    if (dir && dir !== 'here') {
      state.wanderStreak = (state.wanderStreak ?? 0) + 1;
      const res = moveInDungeon(world, dir);
      if ('error' in res) {
        // locked from this side without recourse — search for another way
        searchRoom(world);
        return 'stuck-search';
      }
      return 'walk';
    }
    if (dir === 'here') return 'noop';
    // nothing reachable at all
    exitDungeon(world);
    state.targetDungeon = null;
    return 'dungeon-empty';
  }

  // ---------- in the city ----------
  const loc = world.locations[world.partyLocation];

  // a committed journey finishes before new plans get a vote
  if (state.goalDest) {
    if (world.partyLocation === state.goalDest || !world.locations[state.goalDest]) {
      state.goalDest = null;
    } else {
      const hop = cityStepToward(world, state.goalDest);
      if (!hop) {
        state.goalDest = null;
      } else {
        travelTo(world, hop);
        rollCityEncounter(world);
        checkQuests(world);
        return state.goalWhy;
      }
    }
  }
  const goTo = (dest: string, why: string): string | null => {
    if (world.partyLocation === dest) return null;
    state.goalDest = dest;
    state.goalWhy = why;
    const hop = cityStepToward(world, dest);
    if (!hop) { state.goalDest = null; return null; }
    travelTo(world, hop);
    rollCityEncounter(world);
    checkQuests(world);
    return why;
  };

  // quests at hand
  for (const q of Object.values(world.quests)) {
    if (q.status === 'offered' && q.giverLocation === world.partyLocation) {
      acceptQuest(world, q.id);
      return 'accept';
    }
    if (q.status === 'ready' && q.giverLocation === world.partyLocation) {
      turnInQuest(world, q.id, q.choice?.options[0]?.key);
      return 'turnin';
    }
  }

  // needs
  const fatigue = Math.max(...partyMembers(world).map((c) => c.needs.fatigue));
  if (fatigue > 75) {
    const innErr = loc?.innRooms?.length && mc.money >= 10 ? restAtInn(world, loc.id, 0) : 'no inn';
    if (innErr !== null) advanceUntilMorning(world, 'rough');
    restockShops(world);
    refreshJobs(world);
    checkQuests(world);
    return 'sleep';
  }
  const hunger = Math.max(...partyMembers(world).map((c) => c.needs.hunger));
  if (hunger > 60 && loc?.services?.includes('food') && mc.money >= 20) {
    const mealErr = buyMeal(world, loc.id);
    if (mealErr === null) return 'eat';
    // can't afford the table — the broke protocol below earns it back
  }
  if (hunger > 80 && mc.money >= 20) {
    const kitchen = Object.values(world.locations).find((l) => l.services?.includes('food'));
    if (kitchen) {
      const rFood = goTo(kitchen.id, 'to-food');
      if (rFood) return rFood;
    }
  }

  // RECOVERY OUTRANKS COMMERCE: badly hurt with no potions means bed,
  // not errands — a 6%-HP party window-shopping is how bots die
  if (hurtRatio(world) < 0.6 && !bestPotion(world, mc)) {
    const starving2 = partyMembers(world).some((c) => c.needs.hunger > 80);
    // convalesce on SAFE ground: rough nights in a danger-7 district
    // undo themselves — the Temple has soup, sanctuary, and no knives
    if ((loc?.dangerRating ?? 0) >= 5) {
      const rSafe = goTo('LOC_TEMPLE', 'to-sanctuary');
      if (rSafe) return rSafe;
    }
    // eat before sleeping — starving bodies barely mend
    if (starving2 && mc.money < 20) {
      if (loc?.temple || loc?.id === 'LOC_GRAVEROW') {
        if (poorRelief(world) === null) return 'ladle';
      } else {
        const rLadle2 = goTo('LOC_TEMPLE', 'to-ladle');
        if (rLadle2) return rLadle2;
      }
    }
    if (!starving2 || mc.money < 2) {
      const innErr2 = loc?.innRooms?.length && mc.money >= 10 ? restAtInn(world, loc.id, 0) : 'no inn';
      if (innErr2 !== null) advanceUntilMorning(world, 'rough');
      restockShops(world);
      refreshJobs(world);
      checkQuests(world);
      return 'recover';
    }
  }

  // BROKE PROTOCOL: with an empty purse everything else deadlocks —
  // sell whatever isn't nailed down, then hunt street trouble for purses
  if (mc.money < 30) {
    if (loc?.shop?.buys) {
      const spares = mc.inventory.filter((i) => {
        const it = world.items[i];
        return it && !it.equippedBy && it.kind !== 'potion' && it.proto !== 'torch' && it.proto !== 'arrow';
      });
      for (const iid of spares) {
        if (sellToShop(world, loc.id, iid, mc) === null) return 'sell';
      }
    }
    // the pauper's ladle: free soup for pockets too empty for the tavern
    if (hunger > 55 && mc.money < 20) {
      const ladleHere = loc?.temple || loc?.id === 'LOC_GRAVEROW';
      if (ladleHere) {
        const fed = poorRelief(world);
        if (fed === null) return 'ladle';
      } else {
        const rLadle = goTo('LOC_GRAVEROW', 'to-ladle');
        if (rLadle) return rLadle;
      }
    }
    if (hurtRatio(world) >= 0.5) {
      // pick fights only on steady legs — beatings pay nothing
      const rough = Object.values(world.locations).filter((l) => l.dangerRating >= 5).sort((a, b) => b.dangerRating - a.dangerRating)[0];
      const stepR = rough && rough.id !== world.partyLocation ? cityStepToward(world, rough.id) : (world.locations[world.partyLocation]?.connections[0] ?? null);
      if (stepR) {
        travelTo(world, stepR);
        rollCityEncounter(world);
        checkQuests(world);
        return 'roam';
      }
    }
    // hurt and broke: sleep it off on safe ground
    if ((loc?.dangerRating ?? 0) >= 5) {
      const rSafe2 = goTo('LOC_TEMPLE', 'to-sanctuary');
      if (rSafe2) return rSafe2;
    }
    advanceUntilMorning(world, 'rough');
    refreshJobs(world);
    checkQuests(world);
    return 'lick-wounds';
  }

  // lasting wounds compound: pay the temple to mend them when solvent
  const totalInjuries = partyMembers(world).reduce((n, c) => n + c.injuries.filter((j) => !j.treated).length, 0);
  if (totalInjuries >= 3 && mc.money >= 600) {
    const temple = Object.values(world.locations).find((l) => l.temple);
    if (temple) {
      if (world.partyLocation === temple.id) {
        const worst = [...partyMembers(world)].sort((a, b) => b.injuries.filter((j) => !j.treated).length - a.injuries.filter((j) => !j.treated).length)[0];
        const mendErr = buyTempleService(world, temple.id, 'mend-injuries', worst.id);
        if (mendErr === null) return 'mend';
      } else {
        const rTemple = goTo(temple.id, 'to-mend');
        if (rTemple) return rTemple;
      }
    }
  }

  // broken steel loses fights a L47 party has no business losing:
  // repair equipped gear at any smith, and never delve bare-handed
  const battered = partyMembers(world).flatMap((c) => Object.values(c.equipment))
    .map((iid) => (iid ? world.items[iid] : null))
    .filter((it) => it?.durability && (it.broken || it.durability.current < it.durability.max * 0.35));
  if (battered.length > 0) {
    const smith = Object.values(world.locations).find((l) => l.services.includes('repair'));
    if (smith && world.partyLocation === smith.id) {
      const it = battered[0]!;
      const cost = Math.max(10, it.durability!.max - it.durability!.current);
      if (mc.money >= cost && repairAtShop(world, smith.id, it.id) === null) return 'repair';
    } else if (smith && battered.some((it) => it!.broken) && mc.money >= 60) {
      const rSmith = goTo(smith.id, 'to-smith');
      if (rSmith) return rSmith;
    }
  }
  // a member with no working weapon buys one off the rack
  const unarmed = partyMembers(world).find((c) => {
    const wid = c.equipment['main-hand'];
    const wpn = wid ? world.items[wid] : null;
    return !wpn || wpn.broken;
  });
  if (unarmed && loc?.shop?.stock.some((e) => e.qty > 0 && ITEM_PROTOS[e.proto]?.kind === 'weapon')) {
    const idx = loc.shop.stock.findIndex((e) => e.qty > 0 && ITEM_PROTOS[e.proto]?.kind === 'weapon' && e.price <= mc.money * 0.5);
    if (idx >= 0 && buyFromShop(world, loc.id, idx, unarmed) === null) {
      equipBest(world);
      return 'buy-weapon';
    }
  }

  // train anyone who can afford it — LOWEST level first, because the
  // dungeon gates check the party's average, not its best man
  const trainees = [...partyMembers(world)].sort((a, b) => a.level - b.level);
  for (const c of trainees) {
    if (!levelUpAvailable(c)) continue;
    if (mc.money < trainingCost(c.level)) continue;
    const hall = Object.values(world.locations).find((l) => l.trainerFor === c.charClass || (l.temple && c.charClass === 'priest'));
    if (!hall) continue;
    if (world.partyLocation === hall.id) {
      // an unchecked engine error here once trained 5000 imaginary
      // afternoons at the Hermitage — believe the refusal
      const err = trainAt(world, hall.id, c.id);
      if (err === null) return 'train';
      continue;
    }
    const rTrainer = goTo(hall.id, 'to-trainer');
    if (rTrainer) return rTrainer;
  }

  // sell dead weight FIRST so the pack has room to buy anything
  const deadWeight = mc.inventory.filter((i) => {
    const it = world.items[i];
    return it && !it.equippedBy && (it.kind === 'treasure' || it.broken || (it.kind === 'weapon' && it.value < 200) || (it.kind === 'armor' && it.value < 150) || it.kind === 'misc');
  });
  if (deadWeight.length > 2 && loc?.shop?.buys) {
    sellToShop(world, loc.id, deadWeight[0], mc);
    return 'sell';
  }

  // shopping list: torches keep the dark off, arrows keep the ranger shooting
  const countProto = (proto: string) =>
    [...mc.inventory, ...world.partyInventory, ...partyMembers(world).flatMap((c) => c.inventory)]
      .reduce((n, i) => n + (world.items[i]?.proto === proto ? (world.items[i]?.qty ?? 1) : 0), 0);
  const usesBow = partyMembers(world).some((c) => Object.values(c.equipment).some((iid) => iid && world.items[iid]?.ranged));
  const torchCount = countProto('torch');
  const arrowCount = countProto('arrow');
  const atTorchStore = world.locations[world.partyLocation]?.shop?.stock.some((e) => e.proto === 'torch');
  const atArrowStore = world.locations[world.partyLocation]?.shop?.stock.some((e) => e.proto === 'arrow');
  // travel for supplies before they're critical; once AT the store,
  // sweep the shelf in one visit — penny goods aren't bought one at a time
  const needsTorches = (atTorchStore ? torchCount < 24 : torchCount < 6) && mc.money > 30;
  const needsArrows = usesBow && (atArrowStore ? arrowCount < 60 : arrowCount < 12) && mc.money > 20;
  if (needsTorches || needsArrows) {
    const wantNow = needsTorches ? 'torch' : 'arrow';
    const store = Object.values(world.locations).find((l) => l.shop?.stock.some((e) => e.proto === wantNow));
    if (store) {
      if (world.partyLocation === store.id) {
        let bought = 0;
        while (bought < 24) {
          const bulkIdx = store.shop!.stock.findIndex((e) => e.proto === wantNow && e.qty > 0);
          if (bulkIdx < 0) break;
          if (buyFromShop(world, store.id, bulkIdx, mc) !== null) break;
          bought++;
          if (wantNow === 'torch' && torchCount + bought >= 24) break;
          if (wantNow === 'arrow' && arrowCount + bought >= 60) break;
        }
        if (bought > 0) return 'buy-supplies';
        const idx = store.shop!.stock.findIndex((e) => e.proto === wantNow && e.qty > 0);
        const err = idx >= 0 ? 'pack full' : 'sold out';
        void err;
        if (idx < 0) {
          // shelves bare until tomorrow — if we're truly dry, sleep on it;
          // if we're merely topping up, get on with the day
          if ((wantNow === 'torch' ? torchCount : arrowCount) < 2) {
            advanceUntilMorning(world, mc.money >= 10 && world.locations[store.id]?.innRooms?.length ? 'bed' : 'rough');
            restockShops(world);
            refreshJobs(world);
            checkQuests(world);
            return 'wait-restock';
          }
        }
        // pack full or sold out — make room instead of looping
        const spare = mc.inventory.find((i) => {
          const it = world.items[i];
          return it && !it.equippedBy && it.kind !== 'potion' && it.proto !== 'torch' && it.proto !== 'arrow';
        });
        if (spare && store.shop!.buys) {
          sellToShop(world, store.id, spare, mc);
          return 'make-room';
        }
        // nothing to sell here — carry on with the day
        state.targetDungeon ??= pickTargetDungeon(world, state);
      }
      const rSup = goTo(store.id, 'to-supplies');
      if (rSup) return rSup;
    }
  }

  // restock potions when flush — but not with a trainer's bill waiting:
  // every copper spent topping the satchel is a level not bought
  const potionCount = [...mc.inventory, ...world.partyInventory].reduce((n, i) => n + (world.items[i]?.healing ? (world.items[i]?.qty ?? 1) : 0), 0);
  const atPhysic = world.locations[world.partyLocation]?.shop?.stock.some((e) => e.proto.includes('healing'));
  const savingForTraining = partyMembers(world).some((c) => levelUpAvailable(c)) && mc.money < trainingCost(mc.level);
  if ((atPhysic ? potionCount < 5 : potionCount < 2) && mc.money > 150 && (!savingForTraining || potionCount === 0)) {
    const physic = Object.values(world.locations).find((l) => l.shop?.stock.some((e) => e.proto.includes('healing')));
    if (physic) {
      if (world.partyLocation === physic.id) {
        const idx = physic.shop!.stock.findIndex((e) => e.proto === 'minor-healing-potion' && e.qty > 0);
        const err = idx >= 0 ? buyFromShop(world, physic.id, idx, mc) : 'sold out';
        if (err === null) return 'buy-potion';
        if (idx < 0) restockShops(world);
        const spare = mc.inventory.find((i) => {
          const it = world.items[i];
          return it && !it.equippedBy && it.kind !== 'potion' && it.proto !== 'torch';
        });
        if (spare && physic.shop!.buys) {
          sellToShop(world, physic.id, spare, mc);
          return 'make-room';
        }
      }
      const rPot = goTo(physic.id, 'to-shop');
      if (rPot) return rPot;
    }
  }

  // collect on finished work before new hunts — coin fuels everything
  const readyQuest = Object.values(world.quests).find((q) => q.status === 'ready');
  if (readyQuest && readyQuest.giverLocation !== world.partyLocation) {
    const rTurn = goTo(readyQuest.giverLocation, 'to-turnin');
    if (rTurn) return rTurn;
  }

  // the spine does not wait: an offered MAIN quest is worth the walk
  // (leaving it lying is how the Circle gets its thirty quiet days)
  const mainOffer = Object.values(world.quests).find((q) => q.isMain && q.status === 'offered');
  if (mainOffer && mainOffer.giverLocation !== world.partyLocation) {
    const rMain = goTo(mainOffer.giverLocation, 'to-spine');
    if (rMain) return rMain;
  }

  // otherwise: to the hunting grounds
  state.targetDungeon ??= pickTargetDungeon(world, state);
  if (state.targetDungeon) {
    const d = world.dungeons[state.targetDungeon];
    const torches = countProto('torch');
    if (world.partyLocation === d.entranceLocation) {
      if (torches < 1 && mc.money <= 30) {
        // broke and blind: fish for street trouble instead — city fights
        // pay in xp and purses
        const rough = Object.values(world.locations)
          .filter((l) => l.dangerRating >= 5 && l.connections.some((c) => c === world.partyLocation || world.locations[c]))
          .sort((a, b) => b.dangerRating - a.dangerRating)[0];
        const stepR = rough && rough.id !== world.partyLocation ? cityStepToward(world, rough.id) : null;
        if (stepR) {
          travelTo(world, stepR);
          rollCityEncounter(world);
          checkQuests(world);
          return 'roam';
        }
        // pace the block until something bites
        const back = world.locations[world.partyLocation].connections[0];
        if (back) {
          travelTo(world, back);
          rollCityEncounter(world);
          checkQuests(world);
          return 'roam';
        }
      }
      if (hurtRatio(world) >= 0.7 && countProto('torch') >= 1) {
        enterDungeon(world, d.id);
        return 'delve';
      }
      // heal up first — but starving men don't heal in their sleep
      const starvingHere = partyMembers(world).some((c) => c.needs.hunger > 80);
      if (starvingHere && mc.money >= 2) {
        const kitchen2 = Object.values(world.locations).find((l) => l.services?.includes('food'));
        if (kitchen2) {
          const rFood2 = goTo(kitchen2.id, 'to-food');
          if (rFood2) return rFood2;
        }
      }
      advanceUntilMorning(world, mc.money >= 10 && loc?.innRooms?.length ? 'bed' : 'rough');
      restockShops(world);
      refreshJobs(world);
      return 'heal-up';
    }
    const rDun = goTo(d.entranceLocation, 'to-dungeon');
    if (rDun) return rDun;
  }

  // truly nothing to do: pass time productively
  advanceUntilMorning(world, 'rough');
  refreshJobs(world);
  restockShops(world);
  checkQuests(world);
  return 'idle';
}

/** Progress bookkeeping: true if the bot is visibly getting somewhere. */
export function noteProgress(world: WorldState, state: AutoplayerState, step: number): boolean {
  const xp = totalXp(world);
  if (xp > state.lastXp) {
    state.lastXp = xp;
    state.lastProgressStep = step;
    return true;
  }
  return false;
}
