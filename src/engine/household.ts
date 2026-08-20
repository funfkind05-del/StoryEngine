// Household progression: the MC's home is a persistent location that
// grows from a rented room to an estate, gaining rooms along the way.

import type { HomeTier, LocationId, WorldState } from './types';
import { logEvent } from './world';

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
