// Achievements and titles: cheap checks over world aggregates, run
// after each committed change. Titles feed the LitRPG stat blocks.

import type { WorldState } from './types';
import { findHome } from './household';
import { logEvent } from './world';
import { mainQuests } from './campaign';

export interface AchievementDef {
  key: string;
  label: string;
  desc: string;
  title?: string; // granted to the MC
  earned: (world: WorldState) => boolean;
}

const kills = (w: WorldState, key: string) => w.killCounts?.[key] ?? 0;
const totalKills = (w: WorldState) => Object.values(w.killCounts ?? {}).reduce((s, n) => s + n, 0);

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first-blood', label: 'First Blood', desc: 'Kill anything at all.', earned: (w) => totalKills(w) >= 1 },
  { key: 'grudge-settled', label: 'Grudge Settled', desc: 'Put down a named rival for good.', title: 'Grudge-Keeper', earned: (w) => (w.rivals ?? []).some((r) => r.defeated) },
  { key: 'torch-thrift', label: 'Dark-Walker', desc: 'Pick a lock in total darkness.', earned: (w) => w.events.some((e) => e.kind === 'dungeon.lockpicked' && (w.torchMinutes ?? 0) === 0) },
  { key: 'ascended', label: 'Ascended', desc: 'Take an ascension rite.', earned: (w) => Object.values(w.characters).some((c) => c.ascension) },
  { key: 'salt-crowned', label: 'Salt-Crowned', desc: 'Defeat the Salt Queen.', title: 'Queensbane', earned: (w) => kills(w, 'salt-queen') >= 1 },
  { key: 'pit-night', label: 'A Night at the Pit', desc: 'Beat five Pit Bruisers.', earned: (w) => kills(w, 'pit-bruiser') >= 5 },
  { key: 'street-scholar', label: 'Street Scholar', desc: 'Collect all six city Codex entries.', title: 'Street Scholar', earned: (w) => (w.codex ?? []).filter((c) => c.startsWith('CITY:')).length >= 6 },
  { key: 'well-read', label: 'Well-Read', desc: 'Study any tome or songbook.', earned: (w) => w.events.some((e) => e.kind === 'item.consumed' && /studied/.test(e.summary)) },
  { key: 'full-table', label: 'A Full Table', desc: 'Six in the party at once.', earned: (w) => Object.values(w.characters).filter((c) => c.inParty && c.alive).length >= 6 },
  { key: 'rat-catcher', label: 'Rat-Catcher', desc: '25 giant rats put down.', title: 'Rat-Catcher', earned: (w) => kills(w, 'giant-rat') >= 25 },
  { key: 'centurion', label: 'Centurion', desc: 'One hundred kills.', earned: (w) => totalKills(w) >= 100 },
  { key: 'key-of-his-own', label: 'A Key of His Own', desc: 'Buy the first home.', title: 'Householder', earned: (w) => !!findHome(w) },
  { key: 'landed', label: 'Landed', desc: 'Reach a small house or better.', earned: (w) => { const h = findHome(w); return !!h && !['rented-room', 'cheap-apartment'].includes(w.locations[h].household!.tier); } },
  { key: 'guildsman', label: 'Guildsman', desc: 'Join any guild.', earned: (w) => Object.keys(w.guildRanks ?? {}).length > 0 },
  { key: 'master-of-one', label: 'Master of One', desc: 'Reach top rank in a guild.', earned: (w) => Object.values(w.guildRanks ?? {}).some((r) => r >= 3) },
  { key: 'truth-seeker', label: 'Truth-Seeker', desc: 'Learn three revelations of the spine.', title: 'Delver of Truths', earned: (w) => mainQuests(w).filter((q) => q.status === 'completed').length >= 3 },
  { key: 'crown-taker', label: 'The Crown Taken', desc: 'Complete the campaign spine.', title: 'Crownbreaker', earned: (w) => mainQuests(w).filter((q) => q.status === 'completed').length >= 8 },
  { key: 'gilded', label: 'Gilded', desc: 'Hold 100 gold at once.', earned: (w) => w.characters[w.mcId].money >= 10000 },
  { key: 'tenth-step', label: 'The Tenth Step', desc: 'Reach level 10.', earned: (w) => w.characters[w.mcId].level >= 10 },
  { key: 'half-century', label: 'Half-Century', desc: 'Reach level 25.', title: 'Veteran of Blackwall', earned: (w) => w.characters[w.mcId].level >= 25 },
  { key: 'summit', label: 'The Summit', desc: 'Reach level 50.', title: 'Peerless', earned: (w) => w.characters[w.mcId].level >= 50 },
  { key: 'jailbird', label: 'Jailbird', desc: 'Spend a night in the cells.', earned: (w) => w.events.some((e) => e.kind === 'crime.jailed') },
  { key: 'lorekeeper', label: 'Lorekeeper', desc: 'Collect ten Codex entries.', title: 'Lorekeeper', earned: (w) => (w.codex?.length ?? 0) >= 10 },
  { key: 'old-salt', label: 'Old Salt', desc: 'Catch ten fish off the wharves.', earned: (w) => w.events.filter((e) => e.kind === 'fishing.catch').length >= 10 },
];

/** Check and award anything newly earned. Cheap; call after commits. */
export function checkAchievements(world: WorldState): string[] {
  world.achievements ??= [];
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (world.achievements.includes(a.key)) continue;
    if (!a.earned(world)) continue;
    world.achievements.push(a.key);
    fresh.push(a.label);
    const mc = world.characters[world.mcId];
    if (a.title) mc.title = a.title;
    logEvent(world, 'achievement', { key: a.key, title: a.title ?? null }, `ACHIEVEMENT: ${a.label} — ${a.desc}${a.title ? ` Title earned: "${a.title}".` : ''}`);
  }
  return fresh;
}
