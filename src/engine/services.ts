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
  makeItem,
  performTempleService,
  removeUnits,
  templePrice,
  trainingCost,
} from './rules';
import { Rng, randomSeed } from './rng';
import { addMinutes, advanceUntilMorning, logEvent, partyMembers } from './world';

// ---------- Shops ----------
export function buyFromShop(world: WorldState, locId: LocationId, entryIdx: number, buyer: Character): string | null {
  const loc = world.locations[locId];
  const entry = loc.shop?.stock[entryIdx];
  if (!loc.shop || !entry) return 'No such ware.';
  if (entry.qty <= 0) return 'Sold out.';
  if (buyer.money < entry.price) return `Not enough coin (${fmtMoney(entry.price)}).`;
  const item = makeItem(world, entry.proto, 1);
  if (!hasRoomFor(world, buyer, item)) {
    delete world.items[item.id];
    return `${buyer.name}'s pack is full.`;
  }
  buyer.money -= entry.price;
  entry.qty -= 1;
  addMinutes(world, 5);
  item.history.push(`Bought at ${loc.name} on Day ${world.time.day} for ${fmtMoney(entry.price)}`);
  addToContainer(world, item, buyer);
  logEvent(world, 'shop.buy', { item: entry.proto, price: entry.price, shop: locId }, `${buyer.name} bought ${item.name} at ${loc.name} for ${fmtMoney(entry.price)}.`, { location: locId });
  return null;
}

export function sellToShop(world: WorldState, locId: LocationId, itemId: string, seller: Character): string | null {
  const loc = world.locations[locId];
  const item = world.items[itemId];
  if (!loc.shop?.buys) return 'This shop does not buy.';
  if (!item || item.owner !== seller.id) return 'Not yours to sell.';
  if (item.equippedBy) return 'Unequip it first.';
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
      const baseline = ITEM_PROTOS[entry.proto]?.stackable ? 8 : 2;
      if (entry.qty < baseline && rng.chance(0.7)) entry.qty += rng.int(1, 2);
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
  advanceUntilMorning(world);
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
  advanceUntilMorning(world);
  for (const c of partyMembers(world)) {
    c.statuses = c.statuses.filter((s) => s.key === 'cursed'); // home comfort cures all but curses
  }
  logEvent(world, 'rest.home', {}, 'The party slept in their own beds and woke whole.', { location: home.id });
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
  const templeFaction = Object.keys(loc.factionInfluence).sort((a, b) => loc.factionInfluence[b] - loc.factionInfluence[a])[0] ?? null;
  const price = templePrice(world, svc, payer, templeFaction);
  if (price === Infinity) return 'The priests will not serve you. Your name is known here, and not kindly.';
  if (payer.money < price) return `Not enough coin (${fmtMoney(price)}).`;
  payer.money -= price;
  addMinutes(world, 30);
  const line = performTempleService(svc.key, target);
  logEvent(world, 'temple.service', { service: svc.key, target: target.id, price }, `${svc.label} at ${loc.name} for ${fmtMoney(price)}: ${line}`, { location: locId, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

// ---------- Training ----------
export function trainAt(world: WorldState, locId: LocationId, charId: string): string | null {
  const loc = world.locations[locId];
  const c = world.characters[charId];
  if (!c) return 'Who?';
  const def = CLASSES[c.charClass];
  if (!loc.trainerFor && !(loc.temple && c.charClass === 'priest')) return 'No trainer here.';
  if (loc.trainerFor && loc.trainerFor !== c.charClass) return `${loc.name} trains ${CLASSES[loc.trainerFor!].label.toLowerCase()}s, not ${def.label.toLowerCase()}s.`;
  if (!levelUpAvailable(c)) return `${c.name} has not earned enough experience yet.`;
  const cost = trainingCost(c.level);
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

// ---------- Consumables outside combat ----------
export function useConsumable(world: WorldState, itemId: string, targetId: string): string | null {
  const item = world.items[itemId];
  const target = world.characters[targetId];
  if (!item || !target) return 'No such item.';
  const edible = item.kind === 'potion' || item.effectKey?.startsWith('food-');
  if (!edible) return 'Not consumable.';
  const rng = new Rng(randomSeed());
  const res = consumeItem(world, item, target, rng);
  const remaining = item.owner ? item.qty ?? 0 : 0;
  logEvent(world, 'item.consumed', { item: item.proto ?? item.name, remaining }, res.lines.join(' '), { witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}
