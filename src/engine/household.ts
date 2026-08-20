// Household progression: the MC's home is a persistent location that
// grows from a rented room to an estate, gaining rooms along the way.

import type { HomeTier, LocationId, WorldState } from './types';
import { addMinutes, grantXp, logEvent, partyMembers } from './world';
import { addToContainer, eatFood, fmtMoney, makeItem } from './rules';

export const TIER_ORDER: HomeTier[] = [
  'rented-room',
  'cheap-apartment',
  'small-house',
  'fortified-residence',
  'large-household',
  'estate',
];

export const TIER_INFO: Record<HomeTier, { label: string; cost: number; desc: string }> = {
  'rented-room': { label: 'Rented Room', cost: 0, desc: 'A cot above a tavern.' },
  'cheap-apartment': { label: 'Cheap Apartment', cost: 800, desc: 'Two rooms, a door that locks.' },
  'small-house': { label: 'Small House', cost: 3500, desc: 'A house of your own, with a yard.' },
  'fortified-residence': { label: 'Fortified Residence', cost: 12000, desc: 'Stone walls, barred windows, a stout gate.' },
  'large-household': { label: 'Large Household', cost: 40000, desc: 'Wings for companions, staff, and stores.' },
  estate: { label: 'Estate', cost: 120000, desc: 'A compound with grounds and a name.' },
};

export const UPGRADES: { key: string; label: string; cost: number; minTier: number }[] = [
  { key: 'bedroom', label: 'Extra Bedroom', cost: 300, minTier: 1 },
  { key: 'kitchen', label: 'Kitchen', cost: 250, minTier: 1 },
  { key: 'bath', label: 'Bath', cost: 400, minTier: 1 },
  { key: 'storage', label: 'Storage Cellar', cost: 350, minTier: 1 },
  { key: 'workshop', label: 'Workshop', cost: 900, minTier: 2 },
  { key: 'training-yard', label: 'Training Yard', cost: 1200, minTier: 2 },
  { key: 'garden', label: 'Garden', cost: 500, minTier: 2 },
  { key: 'armory', label: 'Armory', cost: 1500, minTier: 3 },
  { key: 'alchemy-room', label: 'Alchemy Room', cost: 1800, minTier: 3 },
  { key: 'library', label: 'Library', cost: 2000, minTier: 3 },
  { key: 'secret-room', label: 'Secret Room', cost: 2500, minTier: 3 },
  { key: 'stable', label: 'Stable', cost: 2200, minTier: 4 },
  { key: 'defensive-walls', label: 'Defensive Walls', cost: 8000, minTier: 4 },
  { key: 'dungeon-access', label: 'Dungeon Access', cost: 15000, minTier: 5 },
];

export function findHome(world: WorldState): LocationId | null {
  const home = Object.values(world.locations).find((l) => l.household);
  return home?.id ?? null;
}

export function upgradeTier(world: WorldState): string | null {
  const homeId = findHome(world);
  if (!homeId) return 'No home to upgrade.';
  const home = world.locations[homeId];
  const hh = home.household!;
  const idx = TIER_ORDER.indexOf(hh.tier);
  if (idx >= TIER_ORDER.length - 1) return 'The estate is already the finest home in Blackwall.';
  const next = TIER_ORDER[idx + 1];
  const info = TIER_INFO[next];
  const mc = world.characters[world.mcId];
  if (mc.money < info.cost) return `Not enough coin: ${info.label} costs ${info.cost} copper.`;
  mc.money -= info.cost;
  hh.tier = next;
  home.name = `${mc.name}’s ${info.label}`;
  home.description = info.desc;
  logEvent(world, 'household.tier', { tier: next, cost: info.cost }, `${mc.name} moved up in the world: the household is now a ${info.label.toLowerCase()}.`, { location: homeId });
  return null;
}

export function buyUpgrade(world: WorldState, key: string): string | null {
  const homeId = findHome(world);
  if (!homeId) return 'No home to upgrade.';
  const home = world.locations[homeId];
  const hh = home.household!;
  const up = UPGRADES.find((u) => u.key === key);
  if (!up) return 'Unknown upgrade.';
  if (hh.upgrades.includes(key)) return 'Already built.';
  const tierIdx = TIER_ORDER.indexOf(hh.tier);
  if (tierIdx < up.minTier) return `${up.label} needs at least a ${TIER_INFO[TIER_ORDER[up.minTier]].label}.`;
  const mc = world.characters[world.mcId];
  if (mc.money < up.cost) return `Not enough coin: ${up.label} costs ${up.cost} copper.`;
  mc.money -= up.cost;
  hh.upgrades.push(key);
  logEvent(world, 'household.upgrade', { upgrade: key, cost: up.cost }, `The household gained a ${up.label.toLowerCase()}.`, { location: homeId });
  return null;
}

// ============================================================
// Functional rooms: the household earns its coin mechanically.
// All actions require the party to be at home.
// ============================================================

function homeIfPresent(world: WorldState): { err: string | null; homeId: LocationId | null } {
  const homeId = findHome(world);
  if (!homeId) return { err: 'No home.', homeId: null };
  if (world.partyLocation !== homeId) return { err: 'The party is not at home.', homeId: null };
  return { err: null, homeId };
}

/** Kitchen: cook for the whole party from the pantry — nearly free. */
export function cookAtHome(world: WorldState): string | null {
  const { err, homeId } = homeIfPresent(world);
  if (err || !homeId) return err;
  const hh = world.locations[homeId].household!;
  if (!hh.upgrades.includes('kitchen')) return 'No kitchen — build one, or eat out.';
  const party = partyMembers(world);
  const hasGarden = hh.upgrades.includes('garden');
  const cost = hasGarden ? 0 : party.length; // 1c/head for market scraps, free with a garden
  const mc = world.characters[world.mcId];
  if (mc.money < cost) return `Even a home meal needs ${fmtMoney(cost)} of makings.`;
  mc.money -= cost;
  addMinutes(world, 45);
  for (const c of party) eatFood(c, hasGarden ? 70 : 60);
  logEvent(world, 'home.cook', { cost, garden: hasGarden }, `The household ate together${hasGarden ? ', half of it out of the garden' : ''}.`, { location: homeId, witnesses: party.map((c) => c.id) });
  return null;
}

/** Training yard: spar for a modest XP trickle, once per day. */
export function sparAtHome(world: WorldState): string | null {
  const { err, homeId } = homeIfPresent(world);
  if (err || !homeId) return err;
  const hh = world.locations[homeId].household!;
  if (!hh.upgrades.includes('training-yard')) return 'No training yard.';
  if (hh.lastSparDay === world.time.day) return 'The yard has seen enough bruises today.';
  hh.lastSparDay = world.time.day;
  addMinutes(world, 60);
  const party = partyMembers(world);
  const xp = 8 + party.length * 2;
  for (const c of party) {
    c.stamina.current = Math.max(0, c.stamina.current - 3);
    grantXp(world, c, xp);
  }
  logEvent(world, 'home.spar', { xp }, `The party drilled in the yard — sweat now, blood later. (+${xp} XP each)`, { location: homeId, witnesses: party.map((c) => c.id) });
  return null;
}

/** Alchemy room: brew a potion from bought reagents, once per day. */
export function brewAtHome(world: WorldState): string | null {
  const { err, homeId } = homeIfPresent(world);
  if (err || !homeId) return err;
  const hh = world.locations[homeId].household!;
  if (!hh.upgrades.includes('alchemy-room')) return 'No alchemy room.';
  if (hh.lastBrewDay === world.time.day) return 'The retorts need to cool until tomorrow.';
  const mc = world.characters[world.mcId];
  const cost = 20; // reagents; the potion sells for 30
  if (mc.money < cost) return `Reagents cost ${fmtMoney(cost)}.`;
  hh.lastBrewDay = world.time.day;
  mc.money -= cost;
  addMinutes(world, 120);
  const withLibrary = hh.upgrades.includes('library');
  const proto = withLibrary ? 'healing-potion' : 'minor-healing-potion';
  const potion = makeItem(world, proto, 1);
  potion.history.push(`Brewed at home on Day ${world.time.day}`);
  addToContainer(world, potion, 'home');
  logEvent(world, 'home.brew', { proto, cost }, `A ${potion.name} came off the bench${withLibrary ? ' (the library’s formulae are paying off)' : ''} and went into storage.`, { location: homeId });
  return null;
}

/** Workshop: mend a damaged piece of equipment for a fee in materials. */
export function repairAtHome(world: WorldState, itemId: string): string | null {
  const { err, homeId } = homeIfPresent(world);
  if (err || !homeId) return err;
  const hh = world.locations[homeId].household!;
  if (!hh.upgrades.includes('workshop')) return 'No workshop.';
  const item = world.items[itemId];
  if (!item?.durability) return 'Nothing to mend there.';
  if (item.durability.current >= item.durability.max) return `${item.name} is sound.`;
  const missing = item.durability.max - item.durability.current;
  const cost = Math.max(5, Math.ceil(missing / 2));
  const mc = world.characters[world.mcId];
  if (mc.money < cost) return `Materials cost ${fmtMoney(cost)}.`;
  mc.money -= cost;
  addMinutes(world, 90);
  item.durability.current = item.durability.max;
  item.broken = false;
  item.history.push(`Repaired in the home workshop on Day ${world.time.day}`);
  logEvent(world, 'home.repair', { item: item.name, cost }, `${item.name} was made whole at the workbench (${fmtMoney(cost)}).`, { location: homeId });
  return null;
}
