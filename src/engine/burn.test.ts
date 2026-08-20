// Burn test: play the whole game headlessly with random-but-valid
// author actions for thousands of steps across several seeds, and
// assert engine invariants after every step. Anything that drifts —
// negative coin, orphaned items, a corpse that acts, a clock that
// runs backwards, unserializable state — fails loudly.
//
// Default: quick burn (CI-friendly). Crank it with:
//   BURN_ITERS=20000 BURN_SEEDS=5 npx vitest run src/engine/burn.test.ts

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { Rng } from './rng';
import { advanceUntilMorning, partyMembers, tick, travelTo } from './world';
import { campInDungeon, disarmTrap, enterDungeon, exitDungeon, lightTorch, moveInDungeon, pickLock, searchRoom, takeKey, takeLorebook, useShrine } from './dungeon';
import { getAuctionLots, isAuctionDay, placeBid } from './auction';
import { contestArchery, contestSong, enterPitTrials, isPitTrialsDay } from './tournament';
import { gatherResource, craft, RECIPES } from './crafting';
import { engageWorldEvent } from './worldEvents';
import { CARRIAGE_STOPS, adoptStray, goFishing, rideCarriage } from './services';
import { loreById } from './codex';
import { checkAchievements } from './achievements';
import { generateDungeonEncounter, rollCityEncounter } from './encounter';
import { SKILLS, SPELLS, closeCombat, resolveRound, startCombat, takeLoot } from './combat';
import { openChest } from './loot';
import {
  buyFromShop,
  buyMeal,
  buyTempleService,
  depositItem,
  moveToParty,
  restAtHome,
  restAtInn,
  restockShops,
  sellToShop,
  takeFromParty,
  trainAt,
  treasuryTransfer,
  useConsumable,
} from './services';
import { brewAtHome, buyFirstHome, buyUpgrade, cookAtHome, findHome, fletchArrows, hostFeast, prayAtShrine, sparAtHome, upgradeTier } from './household';
import { acceptQuest, checkQuests, offeredQuestsAt, refreshJobs, turnInQuest } from './quests';
import { maybeCompanionMoment } from './moments';
import { generateStoryIdeas } from './muse';
import { arrestFlee, arrestPay, arrestResist, arrestSurrender, burgleShop, maybePatrolStop, payBountyAt, pickpocket } from './crime';
import { GUILDS, joinGuild } from './guilds';
import { spendAttributePoint } from './progression';
import { DATE_ACTIVITIES, giveGift, spendTimeWith } from './romance';
import { autoRound } from './combat';
import { compactEvents } from './compile';
import { buildOutline } from './outline';
import { applyProposal } from './proseLlm';
import { generateBackgroundNpc, promoteNpc } from './npc';
import { OWNER_HOME, OWNER_PARTY, type PlannedAction, type WorldState } from './types';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ITERS = parseInt(env.BURN_ITERS ?? '1500', 10);
const SEEDS = parseInt(env.BURN_SEEDS ?? '3', 10);
// shift into fresh seed territory: BURN_OFFSET=100 burns worlds 100..104
const OFFSET = parseInt(env.BURN_OFFSET ?? '0', 10);

// ---------- invariants ----------
function assertNoNaN(obj: unknown, path = 'world'): void {
  if (typeof obj === 'number') {
    if (Number.isNaN(obj) || !Number.isFinite(obj)) throw new Error(`non-finite number at ${path}`);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoNaN(v, `${path}[${i}]`));
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) assertNoNaN(v, `${path}.${k}`);
  }
}

function checkInvariants(w: WorldState, step: number, action: string, deep: boolean) {
  function fail(msg: string): never {
    throw new Error(`[step ${step}, after ${action}] ${msg}`);
  }

  for (const c of Object.values(w.characters)) {
    if (c.hp.current < 0 || c.hp.current > c.hp.max) fail(`${c.name} HP ${c.hp.current}/${c.hp.max}`);
    if (c.mana.current < 0 || c.stamina.current < 0) fail(`${c.name} negative mana/stamina`);
    if (c.money < 0) fail(`${c.name} has negative money: ${c.money}`);
    if (c.needs.hunger < 0 || c.needs.hunger > 100 || c.needs.fatigue < 0 || c.needs.fatigue > 100) {
      fail(`${c.name} needs out of range: hunger ${c.needs.hunger}, fatigue ${c.needs.fatigue}`);
    }
    if (!c.alive && c.inParty && w.deathRule === 'story') fail(`dead ${c.name} still in party under story mode`);
    if (c.remains && c.alive) fail(`${c.name} is alive but has remains='${c.remains}'`);
    if (c.age < 1 || c.age > 400 || !Number.isFinite(c.age)) fail(`${c.name} age out of range: ${c.age}`);
    if (c.birthDay !== undefined && (c.birthDay < 0 || c.birthDay >= 360)) fail(`${c.name} birthDay out of range: ${c.birthDay}`);
    if (c.ascension && c.level < 25) fail(`${c.name} ascended (${c.ascension}) below level 25`);
    if (c.row !== undefined && c.row !== 'front' && c.row !== 'back') fail(`${c.name} in unknown row ${String(c.row)}`);
    if (!w.locations[c.location] && !c.location.startsWith('ROOM')) fail(`${c.name} at unknown location ${c.location}`);
    // inventory backrefs
    for (const iid of c.inventory) {
      const it = w.items[iid];
      if (!it) fail(`${c.name} carries missing item ${iid}`);
      if (it.owner !== c.id) fail(`${it.name} in ${c.name}'s pack but owner=${String(it.owner)}`);
      if (it.stackable && (it.qty ?? 0) <= 0) fail(`${it.name} stack qty ${it.qty}`);
    }
    // equipment integrity
    for (const [slot, iid] of Object.entries(c.equipment)) {
      const it = iid ? w.items[iid] : null;
      if (!it) fail(`${c.name} equips missing item in ${slot}`);
      if (it.equippedBy !== c.id) fail(`${it.name} in ${c.name}'s ${slot} but equippedBy=${it.equippedBy}`);
      if (!c.inventory.includes(it.id)) fail(`${c.name} equips ${it.name} not in inventory`);
    }
  }
  for (const iid of w.partyInventory) {
    const it = w.items[iid];
    if (!it) fail(`party supplies contain missing item ${iid}`);
    if (it.owner !== OWNER_PARTY) fail(`${it.name} in party pool but owner=${String(it.owner)}`);
  }
  const home = Object.values(w.locations).find((l) => l.household);
  if (home?.household) {
    if (home.household.treasury < 0) fail('negative treasury');
    for (const iid of home.household.storage) {
      const it = w.items[iid];
      if (!it) fail(`home storage contains missing item ${iid}`);
      if (it.owner !== OWNER_HOME) fail(`${it.name} in home storage but owner=${String(it.owner)}`);
    }
  }
  // party coherence: members alive and co-located
  const party = partyMembers(w);
  if (party.length === 0) fail('party is empty');
  for (const c of party) {
    if (c.location !== w.partyLocation) fail(`${c.name} at ${c.location}, party at ${w.partyLocation}`);
  }
  // combat coherence
  if (w.combat) {
    for (const m of w.combat.monsters) {
      if (m.hp.current < 0 || m.hp.current > m.hp.max) fail(`${m.name} HP ${m.hp.current}`);
      if (!m.alive && m.hp.current > 0) fail(`${m.name} dead with ${m.hp.current} HP`);
    }
    if (!w.combat.active && w.combat.outcome === 'ongoing') fail('inactive combat still ongoing');
  }
  if ((w.bounty ?? 0) < 0) fail('negative bounty');
  if (w.torchMinutes !== undefined && (!Number.isFinite(w.torchMinutes) || w.torchMinutes < 0 || w.torchMinutes > 240)) {
    fail(`torchMinutes out of range: ${w.torchMinutes}`);
  }
  if (w.tournament && (w.tournament.round < 1 || w.tournament.round > 3)) fail(`tournament round ${w.tournament.round}`);
  if (deep) {
    // dungeon structural integrity: no passage, ring, or key points nowhere
    for (const d of Object.values(w.dungeons)) {
      if (!d.generated) continue;
      for (const r of Object.values(d.rooms)) {
        for (const [dir, target] of Object.entries(r.connections)) {
          if (target && !d.rooms[target]) fail(`${d.id}/${r.id} connection ${dir} -> missing room ${target}`);
        }
        if (r.teleporter && !d.rooms[r.teleporter.to]) fail(`${d.id}/${r.id} teleporter -> missing room`);
        if (r.key && !d.rooms[r.key.opensRoom]) fail(`${d.id}/${r.id} key opens missing room`);
      }
    }
  }
  for (const r of w.rivals ?? []) {
    if (!r.name || r.power < 0 || r.grudge < 0) fail(`malformed rival ${r.id}: power ${r.power}, grudge ${r.grudge}`);
  }
  for (const it of Object.values(w.items)) {
    if (it.unidentified && it.equippedBy) fail(`${it.name} equipped by ${it.equippedBy} while unidentified`);
    if (it.affix2 && !it.affix) fail(`${it.name} has affix2 without affix`);
  }
  for (const id of w.codex ?? []) {
    if (!loreById(id)) fail(`codex holds unknown lore id ${id}`);
  }
  if ((w.activeEvents ?? []).length > 2) fail('too many concurrent world events');
  for (const [gk, r] of Object.entries(w.guildRanks ?? {})) {
    if (r < 0 || r > 3) fail(`guild ${gk} rank ${r} out of range`);
  }
  for (const c of Object.values(w.characters)) {
    if ((c.attributePoints ?? 0) < 0) fail(`${c.name} negative attribute points`);
    for (const rel of Object.values(c.relationships)) {
      for (const [k, v] of Object.entries(rel)) {
        if (v < -10 || v > 10) fail(`${c.name} relationship ${k}=${v} out of bounds`);
      }
    }
  }
  if ((w.doom?.stage ?? 0) < 0 || (w.doom?.stage ?? 0) > 4) fail('doom stage out of range');
  // quests: no double-pay, objectives well-formed
  for (const q of Object.values(w.quests)) {
    for (const o of q.objectives) {
      if (o.kind === 'kill' && (o.count <= 0 || o.baseline < 0)) fail(`quest ${q.id} bad kill objective`);
    }
    if (q.status === 'completed' && q.completedDay === undefined) fail(`quest ${q.id} completed without a day`);
  }
  // shops never oversell
  for (const l of Object.values(w.locations)) {
    if (l.shop) for (const e of l.shop.stock) if (e.qty < 0) fail(`${l.name} stocks ${e.qty} of ${e.proto}`);
  }
  // deep scan (whole world incl. event log) is O(world) — run periodically
  if (deep) assertNoNaN(w);
  else {
    assertNoNaN(w.characters, 'characters');
    assertNoNaN(w.items, 'items');
    assertNoNaN(w.time, 'time');
  }
}

// ---------- random driver ----------
function randomCombatRound(w: WorldState, rng: Rng) {
  const combat = w.combat!;
  const forceFlee = combat.round > 35;
  const living = combat.monsters.filter((m) => m.alive && !m.fled);
  const planned: PlannedAction[] = combat.partyIds
    .map((id) => w.characters[id])
    .filter((c) => c && c.hp.current > 0)
    .map((c) => {
      if (forceFlee) return { actor: c.id, type: 'flee' as const };
      const roll = rng.next();
      const target = living.length ? rng.pick(living).id : undefined;
      if (roll < 0.5 || !target) return { actor: c.id, type: 'attack' as const, target };
      if (roll < 0.62) return { actor: c.id, type: 'defend' as const };
      if (roll < 0.74 && c.abilities.some((a) => SKILLS[a])) {
        return { actor: c.id, type: 'skill' as const, skillKey: rng.pick(c.abilities.filter((a) => SKILLS[a])), target };
      }
      if (roll < 0.86 && c.abilities.some((a) => SPELLS[a])) {
        const spellKey = rng.pick(c.abilities.filter((a) => SPELLS[a]));
        return { actor: c.id, type: 'spell' as const, spellKey, target: SPELLS[spellKey].heal || SPELLS[spellKey].cures ? rng.pick(combat.partyIds) : target };
      }
      const potions = [...c.inventory, ...w.partyInventory].filter((i) => w.items[i]?.kind === 'potion');
      if (roll < 0.94 && potions.length) return { actor: c.id, type: 'item' as const, itemId: rng.pick(potions), target: c.id };
      return { actor: c.id, type: 'flee' as const };
    });
  resolveRound(w, planned);
}

function step(w: WorldState, rng: Rng): string {
  // resolve any open combat / loot / encounter first
  if (w.combat) {
    if (w.combat.active) {
      if (rng.chance(0.3)) autoRound(w);
      else randomCombatRound(w, rng);
      return 'combat-round';
    }
    if (w.combat.pendingLoot && !w.combat.pendingLoot.taken) {
      takeLoot(w, rng.chance(0.7) ? 'all' : rng.chance(0.5) ? 'none' : [0]);
      return 'take-loot';
    }
    closeCombat(w);
    return 'close-combat';
  }
  if (w.pendingArrest) {
    const which = rng.next();
    if (which < 0.4) arrestPay(w);
    else if (which < 0.6) arrestFlee(w);
    else if (which < 0.8) arrestSurrender(w);
    else arrestResist(w);
    return 'arrest';
  }
  if (w.pendingEncounter) {
    if (rng.chance(0.8)) startCombat(w, w.pendingEncounter);
    else w.pendingEncounter = null;
    return 'handle-encounter';
  }

  const mc = w.characters[w.mcId];
  const roll = rng.next();

  if (w.currentDungeon && w.currentRoom) {
    const d = w.dungeons[w.currentDungeon];
    const room = d.rooms[w.currentRoom];
    if (roll < 0.35) {
      const dirs = Object.keys(room.connections);
      if (dirs.length) moveInDungeon(w, rng.pick(dirs) as never);
      return 'dungeon-move';
    }
    if (roll < 0.45) { searchRoom(w); return 'search'; }
    if (roll < 0.5 && room.trap && !room.trap.disarmed && !room.trap.triggered) { disarmTrap(w); return 'disarm'; }
    if (roll < 0.52 && room.lockedDoor && !room.lockedDoor.opened) { pickLock(w); return 'picklock'; }
    if (roll < 0.54 && room.shrine && !room.shrine.used) { useShrine(w); return 'shrine'; }
    if (roll < 0.56 && room.lorebook && !room.lorebook.taken) { takeLorebook(w); return 'lorebook'; }
    if (roll < 0.58 && room.resource && !room.resource.gathered) { gatherResource(w); return 'gather'; }
    if (roll < 0.6 && room.chest && !room.chest.opened) {
      const loot = openChest(w);
      if (!('error' in loot)) {
        for (const item of loot.items) delete w.items[item.id]; // left behind unclaimed
      }
      return 'chest';
    }
    if (roll < 0.605 && room.key && !room.key.taken) { takeKey(w); return 'key'; }
    if (roll < 0.61) { lightTorch(w); return 'torch'; }
    if (roll < 0.63 && room.enemies !== 'alive') { campInDungeon(w); return 'camp'; }
    if (roll < 0.75 && room.enemies === 'alive') { generateDungeonEncounter(w); return 'fight'; }
    if (roll < 0.85) { exitDungeon(w); return 'exit-dungeon'; }
    tick(w, rng.int(5, 30));
    return 'dungeon-tick';
  }

  // city
  if (roll < 0.22) {
    const loc = w.locations[w.partyLocation];
    const dests = loc.connections.filter((c) => w.locations[c]);
    if (dests.length) {
      travelTo(w, rng.pick(dests));
      rollCityEncounter(w);
      checkQuests(w);
    }
    return 'travel';
  }
  if (roll < 0.29) { tick(w, rng.int(10, 240)); restockShops(w); return 'tick'; }
  if (roll < 0.3) {
    // calendar systems: bid, brawl, or perform when the day allows
    if (w.partyLocation === 'LOC_NIGHTMARKET' && isAuctionDay(w)) {
      const lots = getAuctionLots(w);
      if (lots.length) placeBid(w, rng.int(0, 2), Math.max(1, Math.floor(mc.money * 0.5)));
    } else if (w.partyLocation === 'LOC_FIGHTPIT' && isPitTrialsDay(w) && !w.tournament) {
      enterPitTrials(w);
    } else {
      const member = rng.pick(partyMembers(w));
      if (rng.chance(0.5)) contestArchery(w, member.id);
      else contestSong(w, member.id);
    }
    return 'calendar';
  }
  if (roll < 0.34) { advanceUntilMorning(w); restockShops(w); return 'sleep'; }
  if (roll < 0.4) {
    const loc = w.locations[w.partyLocation];
    if (loc.dungeonId) { enterDungeon(w, loc.dungeonId); return 'enter-dungeon'; }
    return 'noop';
  }
  if (roll < 0.46) {
    const loc = w.locations[w.partyLocation];
    if (loc.shop?.stock.length) buyFromShop(w, loc.id, rng.int(0, loc.shop.stock.length - 1), mc);
    return 'shop-buy';
  }
  if (roll < 0.5) {
    const loc = w.locations[w.partyLocation];
    const sellable = mc.inventory.filter((i) => !w.items[i]?.equippedBy);
    if (loc.shop?.buys && sellable.length) sellToShop(w, loc.id, rng.pick(sellable), mc);
    return 'shop-sell';
  }
  if (roll < 0.52) {
    const loc = w.locations[w.partyLocation];
    if (loc.innRooms?.length) restAtInn(w, loc.id, rng.int(0, loc.innRooms.length - 1));
    return 'inn';
  }
  if (roll < 0.54) {
    buyMeal(w, w.partyLocation);
    return 'meal';
  }
  if (roll < 0.58) {
    const loc = w.locations[w.partyLocation];
    if (loc.temple) {
      const svc = rng.pick(['minor-healing', 'full-healing', 'cure-poison', 'cure-disease', 'resurrection']);
      buyTempleService(w, loc.id, svc, rng.pick(partyMembers(w)).id);
    }
    return 'temple';
  }
  if (roll < 0.62) {
    const loc = w.locations[w.partyLocation];
    for (const c of partyMembers(w)) trainAt(w, loc.id, c.id);
    return 'train';
  }
  if (roll < 0.66) {
    const potions = [...mc.inventory, ...w.partyInventory].filter((i) => w.items[i]?.kind === 'potion');
    if (potions.length) useConsumable(w, rng.pick(potions), rng.pick(partyMembers(w)).id);
    return 'drink';
  }
  if (roll < 0.72) {
    // shuffle items between pools
    const which = rng.next();
    const loose = mc.inventory.filter((i) => !w.items[i]?.equippedBy);
    if (which < 0.4 && loose.length) moveToParty(w, rng.pick(loose));
    else if (which < 0.6 && w.partyInventory.length) takeFromParty(w, rng.pick(w.partyInventory), mc.id);
    else if (which < 0.8 && loose.length) depositItem(w, rng.pick(loose));
    else {
      const home = Object.values(w.locations).find((l) => l.household);
      if (home?.household?.storage.length) {
        const iid = rng.pick(home.household.storage);
        if (w.partyLocation === home.id) {
          home.household.storage = home.household.storage.filter((x) => x !== iid);
          const it = w.items[iid];
          it.owner = mc.id;
          mc.inventory.push(iid);
        }
      }
    }
    return 'move-items';
  }
  if (roll < 0.76) { treasuryTransfer(w, rng.int(1, 200), rng.chance(0.5) ? 'deposit' : 'withdraw'); return 'treasury'; }
  if (roll < 0.78) {
    if (!findHome(w)) {
      if (w.characters[w.mcId].money >= 800 && rng.chance(0.5)) buyFirstHome(w);
      return 'household';
    }
    if (rng.chance(0.4)) upgradeTier(w);
    else if (rng.chance(0.5)) buyUpgrade(w, rng.pick(['kitchen', 'bath', 'storage', 'workshop', 'training-yard', 'alchemy-room', 'garden', 'armory', 'library', 'shrine', 'infirmary', 'vault', 'forge-annex', 'war-room', 'great-hall', 'watchtower', 'enchanters-study']));
    else {
      const which = rng.next();
      if (which < 0.2) cookAtHome(w);
      else if (which < 0.4) sparAtHome(w);
      else if (which < 0.6) brewAtHome(w);
      else if (which < 0.75) prayAtShrine(w);
      else if (which < 0.9) fletchArrows(w);
      else hostFeast(w, rng.pick(Object.keys(w.factions)));
    }
    return 'household';
  }
  if (roll < 0.8) {
    // quests: accept whatever's offered here, turn in whatever's ready
    refreshJobs(w);
    for (const q of offeredQuestsAt(w, w.partyLocation)) if (rng.chance(0.7)) acceptQuest(w, q.id);
    checkQuests(w);
    for (const q of Object.values(w.quests)) if (q.status === 'ready' && rng.chance(0.8)) turnInQuest(w, q.id);
    return 'quests';
  }
  if (roll < 0.82) {
    maybeCompanionMoment(w);
    if (w.pendingMoment && rng.chance(0.7)) w.pendingMoment = null; // author waves them off
    return 'moment';
  }
  if (roll < 0.83) { restAtHome(w); return 'home-rest'; }
  if (roll < 0.84) {
    const which = rng.next();
    if (which < 0.3) engageWorldEvent(w);
    else if (which < 0.5) rideCarriage(w, rng.pick(CARRIAGE_STOPS));
    else if (which < 0.7) goFishing(w);
    else if (which < 0.8) adoptStray(w);
    else {
      const r = rng.pick(RECIPES);
      craft(w, r.key);
    }
    return 'tier23';
  }
  if (roll < 0.88) {
    // prose-sync style proposals (the author-approved path)
    const kind = rng.pick(['damage', 'heal', 'gain_money', 'spend_money', 'relationship', 'note_event']);
    const target = rng.pick(partyMembers(w));
    applyProposal(w, {
      kind,
      label: '',
      params: {
        kind,
        character: target.name,
        npc: 'Mara',
        hp: rng.int(1, 8),
        copper: rng.int(1, 60),
        dimension: rng.pick(['trust', 'respect', 'affection']),
        delta: rng.int(-2, 2),
        reason: 'burn test',
        summary: 'Burn-test event.',
      },
    });
    return 'prose-sync';
  }
  if (roll < 0.9) {
    const npc = generateBackgroundNpc(w, w.partyLocation, rng.fork());
    if (rng.chance(0.3)) promoteNpc(w, npc.id);
    return 'spawn-npc';
  }
  if (roll < 0.92) {
    // a life of crime and self-improvement
    const which = rng.next();
    if (which < 0.3) {
      const marks = Object.values(w.characters).filter((c) => c.alive && !c.inParty && c.location === w.partyLocation);
      if (marks.length) pickpocket(w, rng.pick(marks).id);
    } else if (which < 0.5) {
      burgleShop(w, w.partyLocation);
    } else if (which < 0.6) {
      payBountyAt(w, w.partyLocation);
    } else if (which < 0.8) {
      const g = rng.pick(GUILDS);
      if (w.partyLocation === g.location) joinGuild(w, g.key);
    } else {
      const withPoints = partyMembers(w).filter((c) => (c.attributePoints ?? 0) > 0);
      if (withPoints.length) {
        spendAttributePoint(w, rng.pick(withPoints), rng.pick(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const));
      }
    }
    maybePatrolStop(w);
    return 'crime-and-growth';
  }
  if (roll < 0.94) {
    // courting and maintenance
    const which = rng.next();
    const present = Object.values(w.characters).filter((c) => c.persistent && c.alive && !c.isMC && c.location === w.partyLocation);
    if (which < 0.4 && present.length) {
      const mc = w.characters[w.mcId];
      const loose = mc.inventory.filter((i) => !w.items[i]?.equippedBy);
      if (loose.length) giveGift(w, rng.pick(present).id, rng.pick(loose));
    } else if (which < 0.8 && present.length) {
      spendTimeWith(w, rng.pick(present).id, rng.pick(DATE_ACTIVITIES).key);
    } else {
      compactEvents(w);
    }
    return 'courting';
  }
  if (roll < 0.96) {
    // party churn: recruit or dismiss a persistent local (never the MC)
    const locals = Object.values(w.characters).filter((c) => c.persistent && !c.isMC && c.alive && c.location === w.partyLocation && !c.inParty);
    const dismissible = partyMembers(w).filter((c) => !c.isMC);
    if (rng.chance(0.6) && locals.length && partyMembers(w).length < 6) {
      const c = rng.pick(locals);
      c.inParty = true;
      c.location = w.partyLocation;
    } else if (dismissible.length > 0 && rng.chance(0.5)) {
      rng.pick(dismissible).inParty = false;
    }
    return 'party-churn';
  }
  tick(w, rng.int(5, 60));
  return 'idle';
}

describe(`burn test (${SEEDS} seeds × ${ITERS} actions, offset ${OFFSET})`, () => {
  for (let s = 0; s < SEEDS; s++) {
    const seedIdx = OFFSET + s;
    it(`survives seed ${seedIdx} with invariants intact`, { timeout: 1800000 }, () => {
      const w = buildSeedWorld();
      w.masterSeed = 1000 + seedIdx;
      w.encounterFrequency = 'chaotic';
      if (seedIdx % 3 === 1) w.deathRule = 'classic';
      if (seedIdx % 3 === 2) w.encumbrance = 'off';
      if (seedIdx % 2 === 0) w.resurrectionRule = 'risky';
      // battle lines: the ranger starts in the back rank
      const lyra = w.characters['CHAR_LYRA'];
      if (lyra) lyra.row = 'back';
      const rng = new Rng(90000 + seedIdx);
      let lastClock = w.time.day * 1440 + w.time.minute;
      let combats = 0;
      for (let i = 0; i < ITERS; i++) {
        const before = w.combat?.active;
        const action = step(w, rng);
        if (!before && w.combat?.active) combats++;
        // story mode must always leave a playable party
        if (w.deathRule === 'story' && !w.combat?.active && partyMembers(w).length === 0) {
          throw new Error(`party wiped out under story mode at step ${i}`);
        }
        // classic mode: a full wipe ends this seed's run legitimately
        if (!partyMembers(w).some(() => true)) break;
        checkInvariants(w, i, action, i % 250 === 0);
        const clock = w.time.day * 1440 + w.time.minute;
        if (clock < lastClock) throw new Error(`clock ran backwards at step ${i} (${action})`);
        lastClock = clock;
        // periodic muse pass: ideas must always be generable and grounded
        if (i % 400 === 200) {
          checkAchievements(w);
          for (const idea of generateStoryIdeas(w)) {
            if (!idea.grounding.length || !idea.outline) throw new Error(`ungrounded muse idea: ${idea.title}`);
          }
          for (const beat of buildOutline(w)) {
            if (!beat.title || !beat.bullets.length || !w.locations[beat.location]) {
              throw new Error(`malformed outline beat at step ${i}: ${beat.title}`);
            }
          }
        }
        // periodic serialization round-trip + id uniqueness
        if (i % 500 === 250) {
          const ids = new Set<string>();
          for (const e of w.events) {
            if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id} at step ${i}`);
            ids.add(e.id);
          }
          const back = JSON.parse(JSON.stringify(w)) as WorldState;
          expect(Object.keys(back.characters).length).toBe(Object.keys(w.characters).length);
        }
      }
      expect(combats).toBeGreaterThan(0);
      // classic/permadeath runs may end early in a legitimate party wipe
      if (w.deathRule === 'story') expect(w.events.length).toBeGreaterThan(50);
    });
  }
});
