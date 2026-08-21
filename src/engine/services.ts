// City service economy: shop buying/selling with persistent stock,
// inn rest, temple services, guild training, and moving items and
// coin between personal inventory, party supplies, home storage, and
// the household treasury. Prices and effects come from the rules
// engine; this module executes the transactions and logs events.

import type { Character, LocationId, WorldState } from './types';
import {
  CLASSES,
  ITEM_PROTOS,
  TEMPLE_SERVICES,
  addToContainer,
  applyTraining,
  consumeItem,
  eatFood,
  fmtMoney,
  hasRoomFor,
  levelUpAvailable,
  dominantFaction,
  shopPriceMult,
  makeItem,
  performTempleService,
  removeUnits,
  treatInjuries,
  templePrice,
  trainingCost,
} from './rules';
import { Rng, randomSeed } from './rng';

import { addMinutes, advanceUntilMorning, logEvent, partyMembers } from './world';
import { guildTrainingDiscount } from './guilds';

// ---------- Shops ----------
export function buyFromShop(world: WorldState, locId: LocationId, entryIdx: number, buyer: Character): string | null {
  const loc = world.locations[locId];
  const entry = loc.shop?.stock[entryIdx];
  if (!loc.shop || !entry) return 'No such ware.';
  if (entry.qty <= 0) return 'Sold out.';
  if (entry.minRep) {
    const fac = dominantFaction(world, locId);
    const rep = fac ? buyer.factionReputation[fac] ?? 0 : 0;
    if (rep < entry.minRep) return `The shopkeep glances at the back room and shakes their head. "That piece is spoken for." (Needs standing ${entry.minRep}+ with whoever runs this street.)`;
  }
  const mult = shopPriceMult(world, locId, buyer);
  if (mult === Infinity) return `They look at ${buyer.name} and shake their head. Your coin's no good here — not with the company you've crossed.`;
  const price = Math.round(entry.price * mult);
  if (buyer.money < price) return `Not enough coin (${fmtMoney(price)}).`;
  const item = makeItem(world, entry.proto, 1);
  if (!hasRoomFor(world, buyer, item)) {
    delete world.items[item.id];
    return `${buyer.name}'s pack is full.`;
  }
  buyer.money -= price;
  entry.qty -= 1;
  addMinutes(world, 5);
  item.history.push(`Bought at ${loc.name} on Day ${world.time.day} for ${fmtMoney(price)}`);
  addToContainer(world, item, buyer);
  logEvent(world, 'shop.buy', { item: entry.proto, price, shop: locId }, `${buyer.name} bought ${item.name} at ${loc.name} for ${fmtMoney(price)}${mult !== 1 ? ` (${mult < 1 ? 'friendly' : 'grudging'} price)` : ''}.`, { location: locId });
  return null;
}

export function sellToShop(world: WorldState, locId: LocationId, itemId: string, seller: Character): string | null {
  const loc = world.locations[locId];
  const item = world.items[itemId];
  if (!loc.shop?.buys) return 'This shop does not buy.';
  if (!item || item.owner !== seller.id) return 'Not yours to sell.';
  if (item.equippedBy) return 'Unequip it first.';
  if (item.stolen && !loc.shop.fence) return 'The shopkeep turns it over once, looks at you, and slides it back. "Not from me, it wasn\u2019t. Try the docks."';
  const price = Math.max(1, Math.floor(item.value * loc.shop.buyRate * (item.broken ? 0.2 : 1)));
  seller.money += price;
  addMinutes(world, 5);
  item.history.push(`Sold to ${loc.name} on Day ${world.time.day} for ${fmtMoney(price)}`);
  removeUnits(world, item, 1);
  // the shop now stocks one, if it's a catalog item
  if (item.proto && loc.shop.stock.some((s) => s.proto === item.proto)) {
    const entry = loc.shop.stock.find((s) => s.proto === item.proto)!;
    entry.qty += 1;
  }
  logEvent(world, 'shop.sell', { item: item.name, price, shop: locId }, `${seller.name} sold ${item.name} to ${loc.name} for ${fmtMoney(price)}.`, { location: locId });
  return null;
}

/** Stock drifts back toward baseline every few days; simulated citizens buy things. */
export function restockShops(world: WorldState) {
  const rng = new Rng((world.masterSeed ^ (world.time.day * 31)) >>> 0);
  for (const loc of Object.values(world.locations)) {
    if (!loc.shop) continue;
    if (world.time.day - loc.shop.restockDay < 3) continue;
    loc.shop.restockDay = world.time.day;
    for (const entry of loc.shop.stock) {
      const proto = ITEM_PROTOS[entry.proto];
      // penny goods arrive by the crate — nobody waits a week for
      // torches (the autoplayer did: 800 nights of it, and starved)
      const cheapBulk = proto?.stackable && proto.value <= 5;
      const baseline = cheapBulk ? 24 : proto?.stackable ? 8 : 2;
      if (cheapBulk) entry.qty = Math.max(entry.qty, baseline);
      else if (entry.qty < baseline && rng.chance(0.7)) entry.qty += rng.int(1, 2);
      // someone else in the city bought something
      if (entry.qty > 0 && rng.chance(0.15)) entry.qty -= 1;
    }
  }
}

// ---------- Inns & rest ----------
export function restAtInn(world: WorldState, locId: LocationId, roomIdx: number): string | null {
  const loc = world.locations[locId];
  const room = loc.innRooms?.[roomIdx];
  if (!room) return 'No rooms here.';
  const mc = world.characters[world.mcId];
  if (mc.money < room.price) return `Not enough coin (${fmtMoney(room.price)}).`;
  mc.money -= room.price;
  advanceUntilMorning(world, 'bed');
  for (const c of partyMembers(world)) {
    if (room.quality >= 2) c.statuses = c.statuses.filter((s) => s.key !== 'bleeding');
    if (room.quality >= 3) c.statuses = c.statuses.filter((s) => s.key !== 'poisoned' && s.key !== 'diseased');
  }
  logEvent(world, 'rest.inn', { room: room.name, price: room.price }, `The party took the ${room.name} at ${loc.name} (${fmtMoney(room.price)}) and slept until morning.`, { location: locId });
  return null;
}

/** Sleeping at home is free and heals as well as a good room. */
export function restAtHome(world: WorldState): string | null {
  const home = Object.values(world.locations).find((l) => l.household);
  if (!home) return 'No home yet.';
  if (world.partyLocation !== home.id) return 'The party is not at home.';
  advanceUntilMorning(world, 'bed');
  const infirmary = home.household?.upgrades.includes('infirmary');
  const mended: string[] = [];
  for (const c of partyMembers(world)) {
    c.statuses = c.statuses.filter((s) => s.key === 'cursed'); // home comfort cures all but curses
    if (infirmary && c.injuries.some((i) => !i.treated)) {
      treatInjuries(c);
      mended.push(c.name);
    }
  }
  if (world.pet) {
    for (const c of partyMembers(world)) c.tempBonuses.push({ stat: 'defense', amount: 1, roundsLeft: 5, source: `${world.pet.name} slept against the door` });
  }
  logEvent(world, 'rest.home', { mended }, mended.length ? `The party slept in their own beds; the infirmary mended ${mended.join(', ')} (the scars remain).` : `The party slept in their own beds and woke whole.${world.pet ? ` ${world.pet.name} held the doorway all night, seriously.` : ''}`, { location: home.id });
  return null;
}

// ---------- Temple ----------
export function buyTempleService(world: WorldState, locId: LocationId, svcKey: string, targetId: string): string | null {
  const loc = world.locations[locId];
  if (!loc.temple) return 'No altar here.';
  const svc = TEMPLE_SERVICES.find((s) => s.key === svcKey);
  const target = world.characters[targetId];
  const payer = world.characters[world.mcId];
  if (!svc || !target) return 'No such rite.';
  if (svc.needsDead && target.alive) return `${target.name} is not dead.`;
  if (!svc.needsDead && !target.alive) return `${target.name} is beyond this rite; only resurrection can help.`;
  if (svc.key === 'resurrection' && target.remains === 'beyondRecall') return `The priests lay a hand on the urn and take it back. ${target.name} is beyond recall — no rite reaches that far.`;
  if (svc.key === 'memorial' && target.memorialized) return `${target.name}'s rite was already spoken. Once is what the dead ask.`;
  const templeFaction = Object.keys(loc.factionInfluence).sort((a, b) => loc.factionInfluence[b] - loc.factionInfluence[a])[0] ?? null;
  let price = templePrice(world, svc, payer, templeFaction);
  if (price === Infinity) return 'The priests will not serve you. Your name is known here, and not kindly.';
  // raising ashes is delicate work
  if (svc.key === 'resurrection' && target.remains === 'ashes') price = Math.round(price * 1.5);
  if (payer.money < price) return `Not enough coin (${fmtMoney(price)}).`;
  payer.money -= price;
  addMinutes(world, 30);
  // under risky rules, resurrection is a CON gamble (the Wizardry clause)
  if (svc.key === 'resurrection' && world.resurrectionRule === 'risky') {
    const rng = new Rng(randomSeed());
    const chance = Math.min(0.95, Math.max(0.2, 0.55 + (target.attributes.constitution - 10) * 0.04 - (target.remains === 'ashes' ? 0.15 : 0)));
    if (!rng.chance(chance)) {
      if (target.remains === 'ashes') {
        target.remains = 'beyondRecall';
        logEvent(world, 'temple.resurrection.lost', { target: target.id, price }, `The rite over the ashes failed. What was ${target.name} scattered on the altar wind — beyond recall now, and forever. The coin stays with the god.`, { location: locId, witnesses: partyMembers(world).map((c) => c.id) });
        return null;
      }
      target.remains = 'ashes';
      logEvent(world, 'temple.resurrection.failed', { target: target.id, price }, `The rite failed. ${target.name}'s body sank into grey ash on the slab. One rite remains — costlier, and crueler if it fails.`, { location: locId, witnesses: partyMembers(world).map((c) => c.id) });
      return null;
    }
    target.remains = undefined;
  }
  const line = performTempleService(svc.key, target);
  logEvent(world, 'temple.service', { service: svc.key, target: target.id, price }, `${svc.label} at ${loc.name} for ${fmtMoney(price)}: ${line}`, { location: locId, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

/** The lych-house ladle: the destitute eat once a day, free, no sermon.
 *  Yvenne has been doing this all along — now the sim honors it. */
export function poorRelief(world: WorldState): string | null {
  const loc = world.locations[world.partyLocation];
  const qualifies = loc?.temple || loc?.id === 'LOC_GRAVEROW';
  if (!qualifies) return 'The ladle is at the lych-house in Graverow, or any temple.';
  const mc = world.characters[world.mcId];
  if (mc.money >= 20) return 'The ladle is for empty pockets. Yours jingles.';
  if (world.poorReliefDay === world.time.day) return 'One bowl a day keeps the line moving.';
  world.poorReliefDay = world.time.day;
  addMinutes(world, 30);
  for (const c of partyMembers(world)) {
    c.needs.hunger = Math.min(c.needs.hunger, 25); // a real meal, once a day
  }
  logEvent(world, 'poor.relief', { day: world.time.day }, `The party stood the pauper's line and ate from the lych-house ladle — thin soup, real bread, no questions. Somebody kept this kindness running when nobody was watching.`, { location: world.partyLocation, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

// ---------- The stable ----------
export const MOUNT_PRICE = 1500; // copper
const HORSE_NAMES = ['Bramble', 'Copper', 'Whitefoot', 'Ledger', 'Thistle', 'Old Sin'];

/** Buy a horse where there's a stable. Roads shrink; packs deepen. */
export function buyMount(world: WorldState): string | null {
  const loc = world.locations[world.partyLocation];
  if (!loc?.services?.includes('stable')) return 'No stable here.';
  if (world.mount) return `${world.mount.name} would take that personally.`;
  const mc = world.characters[world.mcId];
  if (mc.money < MOUNT_PRICE) return `A sound horse runs ${fmtMoney(MOUNT_PRICE)}.`;
  mc.money -= MOUNT_PRICE;
  const name = HORSE_NAMES[(world.masterSeed ^ world.time.day) % HORSE_NAMES.length];
  world.mount = { name, boughtDay: world.time.day };
  logEvent(world, 'mount.bought', { name, price: MOUNT_PRICE }, `${mc.name} bought a horse from the stable — a steady ${world.time.day % 2 ? 'bay' : 'grey'} the ostler called ${name}. The roads just got shorter and the packs deeper.`, { location: loc.id, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

// ---------- Crafting writs ----------
export interface Writ {
  proto: string;
  qty: number;
  reward: number; // copper
  xp: number;
}

const WRIT_POOLS: Record<string, string[]> = {
  LOC_FORGE: ['dagger', 'iron-shortsword', 'iron-mace', 'boarding-spear'],
  LOC_PHYSIC: ['antidote', 'healing-potion', 'stoneblood-tonic', 'mana-draught'],
  LOC_DRYGOODS: ['hearty-stew', 'ration', 'torch'],
  LOC_SALTMERE: ['hearty-stew', 'harbor-fish', 'antidote'],
};

/** Today's writ at a shop counter, deterministic per day. */
export function getWrit(world: WorldState, locId: string): Writ | null {
  const pool = WRIT_POOLS[locId];
  if (!pool) return null;
  const rng = new Rng((world.masterSeed ^ (world.time.day * 92821) ^ locId.length) >>> 0);
  const proto = rng.pick(pool);
  const p = ITEM_PROTOS[proto];
  if (!p) return null;
  const qty = proto === 'torch' || proto === 'ration' || proto === 'harbor-fish' ? rng.int(4, 8) : rng.int(2, 4);
  return { proto, qty, reward: Math.round(p.value * qty * 1.7) + 20, xp: 25 * qty };
}

/** Deliver the goods, take the coin. Once per counter per day. */
export function fulfillWrit(world: WorldState, locId: string): string | null {
  if (world.partyLocation !== locId) return 'Deliver in person.';
  const writ = getWrit(world, locId);
  if (!writ) return 'No writ posted here.';
  const key = `${world.time.day}:${locId}`;
  if ((world.writsDone ?? []).includes(key)) return 'Today\u2019s writ is already filled.';
  const mc = world.characters[world.mcId];
  const pools: string[][] = [mc.inventory, world.partyInventory, ...partyMembers(world).map((c) => c.inventory)];
  let need = writ.qty;
  const consumed: string[] = [];
  for (const pool of pools) {
    for (const iid of [...pool]) {
      if (need <= 0) break;
      const it = world.items[iid];
      if (!it || it.proto !== writ.proto || it.equippedBy) continue;
      const take = Math.min(need, it.qty ?? 1);
      removeUnits(world, it, take);
      need -= take;
      consumed.push(`${take}× ${it.name}`);
    }
  }
  if (need > 0) return `The writ wants ${writ.qty}× ${ITEM_PROTOS[writ.proto].name} — the party is ${need} short. (Craft them; the guild pays over the odds.)`;
  mc.money += writ.reward;
  for (const c of partyMembers(world)) c.xp += Math.floor(writ.xp / partyMembers(world).length);
  world.writsDone = [...(world.writsDone ?? []), key];
  logEvent(world, 'writ.fulfilled', { loc: locId, proto: writ.proto, qty: writ.qty, reward: writ.reward }, `Writ filled at ${world.locations[locId].name}: ${writ.qty}× ${ITEM_PROTOS[writ.proto].name} delivered for ${fmtMoney(writ.reward)}. Honest work, over the odds.`, { location: locId, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

// ---------- Training ----------
export function trainAt(world: WorldState, locId: LocationId, charId: string): string | null {
  const loc = world.locations[locId];
  const c = world.characters[charId];
  if (!c) return 'Who?';
  const def = CLASSES[c.charClass];
  // a temple trains priests even when another trade also keeps a
  // master there (the Hermitage hosts both the faith and the Dao)
  const priestHere = !!loc.temple && c.charClass === 'priest';
  if (!loc.trainerFor && !priestHere) return 'No trainer here.';
  if (!priestHere && loc.trainerFor && loc.trainerFor !== c.charClass) return `${loc.name} trains ${CLASSES[loc.trainerFor!].label.toLowerCase()}s, not ${def.label.toLowerCase()}s.`;
  if (!levelUpAvailable(c)) return `${c.name} has not earned enough experience yet.`;
  const discount = guildTrainingDiscount(world, locId);
  const cost = Math.round(trainingCost(c.level) * (1 - discount));
  const payer = world.characters[world.mcId];
  if (payer.money < cost) return `Training costs ${fmtMoney(cost)}.`;
  payer.money -= cost;
  addMinutes(world, 240); // an afternoon of drills, lessons, and bruises
  const notes = applyTraining(c);
  logEvent(
    world,
    'training.levelup',
    { character: c.id, level: c.level, cost, gains: notes },
    `${c.name} trained at ${loc.name} and reached level ${c.level}: ${notes.join(', ')}. (${fmtMoney(cost)})`,
    { location: locId, witnesses: partyMembers(world).map((x) => x.id) },
  );
  return null;
}

// ---------- Home storage & treasury ----------
export function depositItem(world: WorldState, itemId: string): string | null {
  const home = Object.values(world.locations).find((l) => l.household);
  if (!home?.household) return 'No home.';
  if (world.partyLocation !== home.id) return 'You must be at home.';
  const item = world.items[itemId];
  if (!item) return 'No such item.';
  if (item.equippedBy) return 'Unequip it first.';
  const holder = typeof item.owner === 'string' ? world.characters[item.owner] : null;
  if (holder) holder.inventory = holder.inventory.filter((i) => i !== itemId);
  else world.partyInventory = world.partyInventory.filter((i) => i !== itemId);
  addToContainer(world, item, 'home');
  logEvent(world, 'home.deposit', { item: item.name }, `${item.name} was placed in household storage.`, { location: home.id });
  return null;
}

export function withdrawItem(world: WorldState, itemId: string, toCharId: string): string | null {
  const home = Object.values(world.locations).find((l) => l.household);
  if (!home?.household) return 'No home.';
  if (world.partyLocation !== home.id) return 'You must be at home.';
  const item = world.items[itemId];
  const to = world.characters[toCharId];
  if (!item || !to) return 'No such item.';
  if (!hasRoomFor(world, to, item)) return `${to.name}'s pack is full.`;
  home.household.storage = home.household.storage.filter((i) => i !== itemId);
  addToContainer(world, item, to);
  return null;
}

export function moveToParty(world: WorldState, itemId: string): string | null {
  const item = world.items[itemId];
  if (!item) return 'No such item.';
  if (item.equippedBy) return 'Unequip it first.';
  const holder = typeof item.owner === 'string' ? world.characters[item.owner] : null;
  if (!holder) return 'Only personal items can be pooled.';
  holder.inventory = holder.inventory.filter((i) => i !== itemId);
  addToContainer(world, item, 'party');
  return null;
}

export function takeFromParty(world: WorldState, itemId: string, toCharId: string): string | null {
  const item = world.items[itemId];
  const to = world.characters[toCharId];
  if (!item || !to) return 'No such item.';
  if (!hasRoomFor(world, to, item)) return `${to.name}'s pack is full.`;
  world.partyInventory = world.partyInventory.filter((i) => i !== itemId);
  addToContainer(world, item, to);
  return null;
}

export function treasuryTransfer(world: WorldState, amount: number, direction: 'deposit' | 'withdraw'): string | null {
  const home = Object.values(world.locations).find((l) => l.household);
  if (!home?.household) return 'No home.';
  if (world.partyLocation !== home.id) return 'You must be at home.';
  const mc = world.characters[world.mcId];
  if (amount <= 0) return 'Nothing moved.';
  if (direction === 'deposit') {
    if (mc.money < amount) return 'Not that much in your purse.';
    mc.money -= amount;
    home.household.treasury += amount;
  } else {
    if (home.household.treasury < amount) return 'The chest is lighter than that.';
    home.household.treasury -= amount;
    mc.money += amount;
  }
  logEvent(world, 'home.treasury', { amount, direction }, `${direction === 'deposit' ? 'Deposited' : 'Withdrew'} ${fmtMoney(amount)} ${direction === 'deposit' ? 'into' : 'from'} the household chest.`, { location: home.id });
  return null;
}

// ---------- Meals ----------
/** A hot meal at any location that serves food: feeds the whole party. */
export function buyMeal(world: WorldState, locId: LocationId): string | null {
  const loc = world.locations[locId];
  if (!loc?.services.includes('food')) return 'No kitchen here.';
  const party = partyMembers(world);
  const cost = 5 * party.length;
  const mc = world.characters[world.mcId];
  if (mc.money < cost) return `A meal for ${party.length} costs ${fmtMoney(cost)}.`;
  mc.money -= cost;
  addMinutes(world, 30);
  for (const c of party) eatFood(c, 60);
  logEvent(world, 'meal', { cost, at: locId }, `The party ate a hot meal at ${loc.name} (${fmtMoney(cost)}).`, { location: locId, witnesses: party.map((c) => c.id) });
  return null;
}

// ---------- Carriage, fishing, and the stray ----------
export const CARRIAGE_STOPS = ['LOC_IRONMARKET_SQ', 'LOC_RATCATCHER', 'LOC_GRAVEROW', 'LOC_TEMPLE', 'LOC_WHARVES'];

/** Safe paid travel between carriage stops: no street encounters. */
export function rideCarriage(world: WorldState, destId: LocationId): string | null {
  if (!CARRIAGE_STOPS.includes(world.partyLocation)) return 'No carriage stand here.';
  if (!CARRIAGE_STOPS.includes(destId) || destId === world.partyLocation) return 'The carriage does not go there.';
  const mc = world.characters[world.mcId];
  const fare = 10;
  if (mc.money < fare) return `The fare is ${fmtMoney(fare)}.`;
  mc.money -= fare;
  addMinutes(world, 15);
  world.partyLocation = destId;
  for (const c of partyMembers(world)) {
    c.location = destId;
    c.activity = 'stepping down from the carriage';
  }
  logEvent(world, 'carriage', { to: destId, fare }, `The party took the carriage to ${world.locations[destId]?.name} (${fmtMoney(fare)}) — cushioned, quick, and nobody tried to rob them.`, { location: destId, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

/** An hour with a line off the docks. The most beloved pointless system. */
export function goFishing(world: WorldState): string | null {
  const loc = world.locations[world.partyLocation];
  if (!loc || (loc.type !== 'dock' && !loc.services.includes('passage'))) return 'No water worth fishing here.';
  const rng = new Rng(randomSeed());
  addMinutes(world, 60);
  const mc = world.characters[world.mcId];
  const roll = rng.next();
  if (roll < 0.5) {
    const n = rng.int(1, 3);
    const fish = makeItem(world, 'harbor-fish', n);
    addToContainer(world, fish, 'party');
    logEvent(world, 'fishing.catch', { n }, `${mc.name} pulled ${n} fish out of the black harbor. ${n > 2 ? 'A good hour.' : 'An honest hour.'}`, { location: loc.id, witnesses: partyMembers(world).map((c) => c.id) });
  } else if (roll < 0.75) {
    logEvent(world, 'fishing.nothing', {}, `An hour with the line and nothing to show but the harbor's patience. It was, somehow, still worth it.`, { location: loc.id, witnesses: partyMembers(world).map((c) => c.id) });
  } else if (roll < 0.92) {
    const boot = makeItem(world, 'old-boot', 1);
    addToContainer(world, boot, 'party');
    logEvent(world, 'fishing.catch', { n: 0 }, `${mc.name} caught a boot. Lyra has opinions about whose it was.`, { location: loc.id, witnesses: partyMembers(world).map((c) => c.id) });
  } else {
    const pearl = makeItem(world, 'harbor-pearl', 1);
    addToContainer(world, pearl, 'party');
    logEvent(world, 'fishing.catch', { n: 1, pearl: true }, `An oyster came up with the line — and a pearl inside worth real coin (${fmtMoney(150)}). The harbor pays its debts strangely.`, { location: loc.id, witnesses: partyMembers(world).map((c) => c.id) });
  }
  // the party unwinds a little
  for (const c of partyMembers(world)) c.needs.fatigue = Math.max(0, c.needs.fatigue - 5);
  return null;
}

const STRAY_NAMES = ['Bones', 'Cinder', 'Wharf', 'Copper', 'Grim', 'Biscuit', 'Tar'];

/** Take in the stray that's been haunting the doorstep. Home owners only. */
export function adoptStray(world: WorldState): string | null {
  const home = Object.values(world.locations).find((l) => l.household);
  if (!home) return 'A stray needs a doorstep to haunt. Buy a home first.';
  if (world.pet) return `${world.pet.name} would object.`;
  const rng = new Rng(randomSeed());
  const name = rng.pick(STRAY_NAMES);
  const kind = rng.chance(0.7) ? 'dock-dog' : 'harbor cat';
  world.pet = { name, kind };
  home.household!.residents.push(`PET_${name}`);
  logEvent(world, 'pet.adopted', { name, kind }, `The ${kind} that has been haunting the doorstep has a name now: ${name}. It sleeps on the cold side of the door, on purpose.`, { location: home.id, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

// ---------- Consumables outside combat ----------
export function useConsumable(world: WorldState, itemId: string, targetId: string): string | null {
  const item = world.items[itemId];
  const target = world.characters[targetId];
  if (!item || !target) return 'No such item.';
  const usable = item.kind === 'potion' || item.effectKey?.startsWith('food-') || item.effectKey?.startsWith('teach-');
  if (!usable) return 'Not consumable.';
  const rng = new Rng(randomSeed());
  const res = consumeItem(world, item, target, rng);
  const remaining = item.owner ? item.qty ?? 0 : 0;
  logEvent(world, 'item.consumed', { item: item.proto ?? item.name, remaining }, res.lines.join(' '), { witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}
