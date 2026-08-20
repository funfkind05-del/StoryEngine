// The Night Market auction. Every tenth day the Tidecourt's auctioneer
// sets three lots under the lanterns — enchanted gear, tomes, oddities
// with provenance nobody checks. Bids are a contest: your coin and
// your presence against the room's appetite. Deterministic per day,
// so the same evening always offers the same lots.

import type { Item, WorldState } from './types';
import { Rng } from './rng';
import { addToContainer, fmtMoney, hasRoomFor, makeItem } from './rules';
import { rollGearMods } from './progression';
import { addMinutes, logEvent, partyMembers } from './world';
import { trainSkill } from './progression';

export const AUCTION_LOCATION = 'LOC_NIGHTMARKET';
export const AUCTION_EVERY_DAYS = 10;

const LOT_POOL = [
  'steel-longsword', 'brigandine', 'runed-staff', 'greatsword', 'scale-hauberk',
  'ring-of-the-fox', 'ring-of-the-bull', 'amulet-of-the-wall', 'amulet-of-the-adder', 'circlet-of-the-wind',
  'tome-of-firebolt', 'tome-of-mending', 'songbook-chorus', 'manual-palm-strike', 'grimoire-wither', 'folio-spark-edge',
  'harbor-pearl', 'wyrm-scale',
];

export interface AuctionLot {
  idx: number;
  item: Item; // preview instance — not in the world until won
  reserve: number; // copper; the room will not let it go cheaper
  sold: boolean;
}

export function isAuctionDay(world: WorldState): boolean {
  return world.time.day > 0 && world.time.day % AUCTION_EVERY_DAYS === 0;
}

function lotSeed(world: WorldState): number {
  return (world.masterSeed ^ (world.time.day * 2654435761)) >>> 0;
}

/**
 * Tonight's lots. Preview items live outside world.items until won —
 * call with a throwaway eye; only placeBid moves property.
 */
export function getAuctionLots(world: WorldState): AuctionLot[] {
  if (!isAuctionDay(world)) return [];
  const rng = new Rng(lotSeed(world));
  const lots: AuctionLot[] = [];
  const won = world.auctionsWon ?? [];
  for (let i = 0; i < 3; i++) {
    const proto = rng.pick(LOT_POOL);
    const item = makeItem(world, proto, 1);
    // hot rolls: auction gear comes enchanted more often than shop stock
    rollGearMods(new Rng(rng.fork()), item, 1.8);
    delete world.items[item.id]; // preview only — not in the world yet
    const reserve = Math.round(item.value * (0.7 + rng.next() * 0.5));
    lots.push({ idx: i, item, reserve, sold: won.includes(`${world.time.day}:${i}`) });
  }
  return lots;
}

/**
 * Bid on a lot. The room answers with an appetite roll — your CHA and
 * streetwise sway it, and coin over the reserve speaks loudest.
 */
export function placeBid(world: WorldState, lotIdx: number, offer: number): string | null {
  if (world.partyLocation !== AUCTION_LOCATION) return 'The auction happens under the Night Market lanterns.';
  if (!isAuctionDay(world)) return `No auction tonight. The Tidecourt sets lots every ${AUCTION_EVERY_DAYS}th day.`;
  const lots = getAuctionLots(world);
  const lot = lots[lotIdx];
  if (!lot) return 'No such lot.';
  if (lot.sold) return 'The hammer already fell on that one.';
  const mc = world.characters[world.mcId];
  if (offer > mc.money) return `Your purse holds ${fmtMoney(mc.money)}.`;
  if (offer < lot.reserve) return `The auctioneer doesn't even look up. (Reserve is ${fmtMoney(lot.reserve)}.)`;
  const rng = new Rng((lotSeed(world) ^ (lotIdx + 1) ^ offer) >>> 0);
  trainSkill(world, mc, 'streetwise');
  addMinutes(world, 20);
  // the room bids back: rich lots draw rich rivals
  const appetite = lot.reserve * (1 + rng.next() * 0.6);
  const sway = (mc.attributes.charisma - 10) * 0.02 + mc.skills.streetwise * 0.01;
  const effective = offer * (1 + sway);
  if (effective < appetite) {
    logEvent(world, 'auction.outbid', { day: world.time.day, lot: lotIdx, offer }, `${mc.name} bid ${fmtMoney(offer)} on ${lot.item.name} and watched a Tidecourt purse bury it. The room remembers who tried.`, { location: AUCTION_LOCATION });
    return `Outbid — the room wanted it more. (Your ${fmtMoney(offer)} against deeper pockets.)`;
  }
  // what you saw is what you win: clone the previewed roll under a fresh id
  const idCarrier = makeItem(world, lot.item.proto ?? LOT_POOL[0], 1);
  delete world.items[idCarrier.id];
  const wonItem: Item = { ...lot.item, id: idCarrier.id, owner: null, history: [...lot.item.history, `Won at the Night Market auction on Day ${world.time.day} for ${fmtMoney(offer)}`] };
  world.items[wonItem.id] = wonItem;
  if (!hasRoomFor(world, mc, wonItem)) {
    delete world.items[wonItem.id];
    return `${mc.name}'s pack is full — the auctioneer will not hold the lot.`;
  }
  mc.money -= offer;
  addToContainer(world, wonItem, mc);
  world.auctionsWon = [...(world.auctionsWon ?? []), `${world.time.day}:${lotIdx}`];
  logEvent(world, 'auction.won', { day: world.time.day, lot: lotIdx, item: wonItem.name, paid: offer }, `The hammer fell: ${wonItem.name} to ${mc.name} for ${fmtMoney(offer)}. The Night Market applauded with its eyebrows.`, { location: AUCTION_LOCATION, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}
