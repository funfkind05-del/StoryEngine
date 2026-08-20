// Guild membership and ranks, ESO-style: join for a fee, climb three
// ranks through guild-specific quest chains, earn training discounts
// and, at the top, a title. Five guilds, five parallel mini-sagas.

import type { Quest, WorldState } from './types';
import { logEvent, partyMembers } from './world';
import { fmtMoney } from './rules';

export interface GuildRankDef {
  title: string;
  quest: {
    title: string;
    description: string;
    objectives: Quest['objectives'];
    reward: Quest['reward'];
  };
}

export interface GuildDef {
  key: string;
  name: string;
  location: string;
  joinFee: number;
  ranks: GuildRankDef[]; // rank 1..3
}

const KQ = (templateKey: string, count: number) => [{ kind: 'kill' as const, templateKey, count, baseline: 0 }];

export const GUILDS: GuildDef[] = [
  {
    key: 'fighters', name: 'Fighters Guild', location: 'LOC_FIGHTGUILD', joinFee: 100,
    ranks: [
      { title: 'Blade', quest: { title: 'Guild Trial: Vermin Detail', description: 'Every Blade starts on rats. Tradition, and a lesson in humility.', objectives: KQ('giant-rat', 5), reward: { money: 150, xp: 80 } } },
      { title: 'Sword-Sworn', quest: { title: 'Guild Contract: Streets Clean', description: 'The guild sells safety. Deliver some: put down thugs working guild-protected streets.', objectives: KQ('street-thug', 4), reward: { money: 600, xp: 400, factionRep: { FAC_WATCH: 1 } } } },
      { title: 'Guild Champion', quest: { title: 'Guild Charge: The Dead Walk', description: 'A charter as old as the guild: when the dead walk, the guild answers.', objectives: KQ('skeleton', 4), reward: { money: 2000, xp: 1500 } } },
    ],
  },
  {
    key: 'thieves', name: 'Thieves Guild', location: 'LOC_THIEFGUILD', joinFee: 150,
    ranks: [
      { title: 'Footpad', quest: { title: 'Guild Errand: The Quiet Parcel', description: 'A package, a destination, no questions. The guild watches how you carry it.', objectives: [{ kind: 'deliver', itemProto: 'sealed-package', locationId: 'LOC_WHARVES', done: false }], reward: { money: 200, xp: 100 } } },
      { title: 'Second-Story', quest: { title: 'Guild Test: Walk the Vault Row', description: 'Walk the sealed countinghouse’s street at night and come back with what you noticed. (Go there; the guild will know.)', objectives: [{ kind: 'visit', locationId: 'LOC_VAULTDOOR', done: false }], reward: { money: 700, xp: 450, factionRep: { FAC_REDKNIVES: 1 } } } },
      { title: 'Shadow', quest: { title: 'Guild Price: The Cutter Problem', description: 'Red Knives cutters have been taxing guild jobs. The guild does not pay tax.', objectives: KQ('red-knife-cutter', 3), reward: { money: 2500, xp: 1600, factionRep: { FAC_REDKNIVES: -2 } } } },
    ],
  },
  {
    key: 'college', name: 'Arcane College', location: 'LOC_COLLEGE', joinFee: 200,
    ranks: [
      { title: 'Auditor', quest: { title: 'College Errand: Components', description: 'The College pays for field-harvested components. Spider ichor, preferably fresh.', objectives: KQ('giant-spider', 2), reward: { money: 400, xp: 300 } } },
      { title: 'Scholar', quest: { title: 'College Concern: The Gutter-Mage', description: 'Unlicensed practice reflects poorly on the art. Retire some of it.', objectives: KQ('gutter-mage', 2), reward: { money: 1200, xp: 900 } } },
      { title: 'Magister', quest: { title: 'College Mandate: The Animate Problem', description: 'Someone’s constructs have slipped their bindings. The College cleans up its own field.', objectives: KQ('animated-armor', 3), reward: { money: 3000, xp: 2200 } } },
    ],
  },
  {
    key: 'temple', name: 'Temple of the Veiled Flame', location: 'LOC_TEMPLE', joinFee: 50,
    ranks: [
      { title: 'Lay Brother', quest: { title: 'Temple Work: The Grave Detail', description: 'The cemetery’s robbers disturb more than bones. Sella wants them discouraged.', objectives: KQ('grave-robber', 3), reward: { money: 200, xp: 120, factionRep: { FAC_VEILEDFLAME: 1 } } } },
      { title: 'Flamekeeper', quest: { title: 'Temple Charge: The Hungry Dead', description: 'Ghouls in the crypt rows. The Flame does not tolerate the dead eating the living.', objectives: KQ('ghoul', 2), reward: { money: 900, xp: 700, factionRep: { FAC_VEILEDFLAME: 1 } } } },
      { title: 'Veiled Hand', quest: { title: 'Temple Judgment: Ash to Ash', description: 'The Circle’s acolytes preach in the open now. The Temple answers heresy in person.', objectives: KQ('cult-acolyte', 3), reward: { money: 2800, xp: 1800, factionRep: { FAC_VEILEDFLAME: 2, FAC_ASHCIRCLE: -2 } } } },
    ],
  },
  {
    key: 'lodge', name: "Hunter's Lodge", location: 'LOC_LODGE', joinFee: 100,
    ranks: [
      { title: 'Tracker', quest: { title: 'Lodge Bounty: Wolf-Sign', description: 'Dire wolves den too close to the graveyard road. The Lodge pays per pelt.', objectives: KQ('dire-wolf', 2), reward: { money: 350, xp: 250 } } },
      { title: 'Huntsman', quest: { title: 'Lodge Bounty: The Web Season', description: 'Spiders the size of dogs, webs the size of rooms. Burn them out.', objectives: KQ('giant-spider', 3), reward: { money: 1100, xp: 850 } } },
      { title: 'Master of the Hunt', quest: { title: 'Lodge Legend: The Drake', description: 'A harbor drake has taken to hunting the shipping lanes. The Lodge remembers when that meant a Master rode out.', objectives: KQ('harbor-drake', 1), reward: { money: 3500, xp: 2500 } } },
    ],
  },
];

export function guildRank(world: WorldState, key: string): number | null {
  const r = world.guildRanks?.[key];
  return r === undefined ? null : r;
}

export function guildTitle(world: WorldState, key: string): string | null {
  const r = guildRank(world, key);
  const g = GUILDS.find((x) => x.key === key);
  if (r === null || !g) return null;
  return r === 0 ? 'Initiate' : g.ranks[r - 1]?.title ?? null;
}

/** Training at your guild gets cheaper as you rise: 10% per rank. */
export function guildTrainingDiscount(world: WorldState, trainerLocation: string): number {
  const g = GUILDS.find((x) => x.location === trainerLocation);
  if (!g) return 0;
  const r = guildRank(world, g.key);
  return r ? Math.min(0.3, r * 0.1) : 0;
}

function questId(world: WorldState): string {
  const n = (world.counters['QST'] ?? 0) + 1;
  world.counters['QST'] = n;
  return `QST_${String(n).padStart(3, '0')}`;
}

function offerRankQuest(world: WorldState, g: GuildDef, rank: number) {
  const def = g.ranks[rank - 1];
  if (!def) return;
  const q: Quest = {
    id: questId(world),
    title: def.quest.title,
    giver: 'board',
    giverLocation: g.location,
    description: def.quest.description,
    objectives: def.quest.objectives.map((o) => ({ ...o })),
    reward: { ...def.quest.reward },
    status: 'offered',
    offeredDay: world.time.day,
    guild: g.key,
    guildRank: rank,
  };
  world.quests[q.id] = q;
}

export function joinGuild(world: WorldState, key: string): string | null {
  const g = GUILDS.find((x) => x.key === key);
  if (!g) return 'No such guild.';
  if (world.partyLocation !== g.location) return `Join at the ${g.name}.`;
  if (guildRank(world, key) !== null) return `Already a member (${guildTitle(world, key)}).`;
  const mc = world.characters[world.mcId];
  if (mc.money < g.joinFee) return `The ${g.name} charges ${fmtMoney(g.joinFee)} to take the book.`;
  mc.money -= g.joinFee;
  world.guildRanks ??= {};
  world.guildRanks[key] = 0;
  offerRankQuest(world, g, 1);
  logEvent(world, 'guild.joined', { guild: key, fee: g.joinFee }, `${mc.name} signed the ${g.name}'s book as an Initiate (${fmtMoney(g.joinFee)}). First trial posted.`, { location: g.location, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

/** Called from quest turn-in: completing a rank quest promotes and posts the next. */
export function advanceGuild(world: WorldState, q: Quest) {
  if (!q.guild || !q.guildRank) return;
  const g = GUILDS.find((x) => x.key === q.guild);
  if (!g) return;
  world.guildRanks ??= {};
  world.guildRanks[q.guild] = Math.max(world.guildRanks[q.guild] ?? 0, q.guildRank);
  const title = guildTitle(world, q.guild);
  logEvent(world, 'guild.rank', { guild: q.guild, rank: q.guildRank, title }, `The ${g.name} raises ${world.characters[world.mcId].name} to ${title}.`, { location: g.location, witnesses: partyMembers(world).map((c) => c.id) });
  if (q.guildRank >= g.ranks.length) {
    const mc = world.characters[world.mcId];
    mc.title = title ?? mc.title;
    logEvent(world, 'guild.mastery', { guild: q.guild }, `${mc.name} now carries the title "${title}" — the ${g.name} has nothing left to teach, only work to offer.`);
    return;
  }
  offerRankQuest(world, g, q.guildRank + 1);
}
