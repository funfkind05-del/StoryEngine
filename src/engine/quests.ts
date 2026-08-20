// Quests and jobs: patrons and job boards offer work; objectives are
// checked against simulation state (kill tallies, party position,
// carried items, boss flags); turn-in pays coin, items, XP, and
// faction reputation. Every transition is a logged event — quests are
// chapter-shaped plot hooks with deadlines and political weight.

import type { Quest, QuestObjective, WorldState } from './types';
import { MONSTERS } from './monsters';
import { Rng } from './rng';
import { grantXp, logEvent, partyMembers } from './world';
import { addToContainer, fmtMoney, makeItem, veterancyPayMult } from './rules';
import { advanceCampaign, ensureCampaign } from './campaign';
import { advanceGuild } from './guilds';
import { advancePersonal, ensurePersonalArcs } from './companions';

function questId(world: WorldState): string {
  const n = (world.counters['QST'] ?? 0) + 1;
  world.counters['QST'] = n;
  return `QST_${String(n).padStart(3, '0')}`;
}

export function objectiveLabel(world: WorldState, o: QuestObjective): string {
  switch (o.kind) {
    case 'kill': {
      const done = Math.min(o.count, (world.killCounts[o.templateKey] ?? 0) - o.baseline);
      return `Kill ${o.count} ${MONSTERS[o.templateKey]?.name ?? o.templateKey}${o.count > 1 ? 's' : ''} (${Math.max(0, done)}/${o.count})`;
    }
    case 'visit':
      return `Go to ${world.locations[o.locationId]?.name ?? o.locationId}${o.done ? ' ✔' : ''}`;
    case 'clear-boss':
      return `Destroy whatever rules the ${world.dungeons[o.dungeonId]?.name ?? o.dungeonId}${o.done ? ' ✔' : ''}`;
    case 'deliver':
      return `Deliver the package to ${world.locations[o.locationId]?.name ?? o.locationId}${o.done ? ' ✔' : ''}`;
  }
}

export function objectiveDone(world: WorldState, o: QuestObjective): boolean {
  switch (o.kind) {
    case 'kill':
      return (world.killCounts[o.templateKey] ?? 0) - o.baseline >= o.count;
    case 'visit':
    case 'deliver':
      return o.done;
    case 'clear-boss':
      return o.done || !!world.dungeons[o.dungeonId]?.bossDefeated;
  }
}

export function questProgress(world: WorldState, q: Quest): { done: number; total: number } {
  const done = q.objectives.filter((o) => objectiveDone(world, o)).length;
  return { done, total: q.objectives.length };
}

/**
 * Re-evaluate all active quests against world state. Call after
 * anything that could advance an objective (combat end, travel).
 */
export function checkQuests(world: WorldState) {
  for (const q of Object.values(world.quests)) {
    if (q.status !== 'active') continue;
    // positional objectives flip when the party stands in the right place
    for (const o of q.objectives) {
      if (o.kind === 'visit' && !o.done && world.partyLocation === o.locationId) o.done = true;
      if (o.kind === 'deliver' && !o.done && world.partyLocation === o.locationId) {
        const carrier = [...partyMembers(world).flatMap((c) => c.inventory), ...world.partyInventory]
          .map((i) => world.items[i])
          .find((i) => i && i.proto === o.itemProto);
        if (carrier) {
          o.done = true;
          // the package changes hands
          carrier.qty = (carrier.qty ?? 1) - 1;
          if ((carrier.qty ?? 0) <= 0) {
            for (const c of partyMembers(world)) c.inventory = c.inventory.filter((x) => x !== carrier.id);
            world.partyInventory = world.partyInventory.filter((x) => x !== carrier.id);
            carrier.owner = o.locationId;
          }
          logEvent(world, 'quest.deliver', { quest: q.id, item: o.itemProto }, `The package was handed over at ${world.locations[o.locationId]?.name}.`, { location: o.locationId });
        }
      }
      if (o.kind === 'clear-boss' && !o.done && world.dungeons[o.dungeonId]?.bossDefeated) o.done = true;
    }
    const { done, total } = questProgress(world, q);
    if (done === total) {
      q.status = 'ready';
      logEvent(world, 'quest.ready', { quest: q.id }, `"${q.title}" is done — return to ${world.locations[q.giverLocation]?.name} to collect.`, { witnesses: partyMembers(world).map((c) => c.id) });
    }
  }
}

export function acceptQuest(world: WorldState, id: string): string | null {
  const q = world.quests[id];
  if (!q || q.status !== 'offered') return 'That work is not on offer.';
  if (world.partyLocation !== q.giverLocation) return 'You must be where the work is offered.';
  q.status = 'active';
  q.acceptedDay = world.time.day;
  // a war room buys planning time
  const home = Object.values(world.locations).find((l) => l.household);
  if (q.deadlineDay !== undefined && home?.household?.upgrades.includes('war-room')) q.deadlineDay += 1;
  // kill objectives count from acceptance, not from lifetime tallies
  for (const o of q.objectives) {
    if (o.kind === 'kill') o.baseline = world.killCounts[o.templateKey] ?? 0;
  }
  // a delivery quest hands the party the package
  for (const o of q.objectives) {
    if (o.kind === 'deliver') {
      const item = makeItem(world, o.itemProto, 1);
      item.history.push(`Entrusted to the party on Day ${world.time.day} ("${q.title}")`);
      addToContainer(world, item, 'party');
    }
  }
  logEvent(world, 'quest.accepted', { quest: q.id }, `Job taken: "${q.title}" (${describeReward(world, q)}).`, { location: q.giverLocation, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

export function declineQuest(world: WorldState, id: string): string | null {
  const q = world.quests[id];
  if (q?.isMain) return 'The spine of the story does not go away because you look elsewhere. It waits.';
  if (q && q.status === 'offered') q.status = 'declined';
  return null;
}

export function describeReward(_world: WorldState, q: Quest): string {
  const parts = [fmtMoney(q.reward.money)];
  if (q.reward.xp) parts.push(`${q.reward.xp} XP`);
  if (q.reward.itemProtos?.length) parts.push(q.reward.itemProtos.join(', '));
  return parts.join(' + ');
}

export function turnInQuest(world: WorldState, id: string, choiceKey?: string): string | null {
  const q = world.quests[id];
  if (!q) return 'No such job.';
  if (q.status !== 'ready' && !(q.status === 'active' && questProgress(world, q).done === q.objectives.length)) {
    return 'The work is not finished.';
  }
  if (world.partyLocation !== q.giverLocation) return `Collect from ${world.locations[q.giverLocation]?.name}.`;
  if (q.choice && !q.choice.chosen) {
    const opt = q.choice.options.find((o) => o.key === choiceKey);
    if (!opt) return `This one ends with a decision: ${q.choice.prompt}`;
    q.choice.chosen = opt.key;
    if (opt.money) q.reward.money += opt.money;
    if (opt.factionRep) {
      q.reward.factionRep = { ...(q.reward.factionRep ?? {}) };
      for (const [fac, d] of Object.entries(opt.factionRep)) {
        q.reward.factionRep[fac] = (q.reward.factionRep[fac] ?? 0) + d;
      }
    }
    if (opt.knowledge) {
      for (const c of partyMembers(world)) c.knowledge.push({ fact: opt.knowledge, day: world.time.day, accurate: true });
    }
    logEvent(world, 'quest.choice', { quest: q.id, chosen: opt.key }, `Decision on "${q.title}": ${opt.label}. ${opt.description}`, { location: q.giverLocation, witnesses: partyMembers(world).map((c) => c.id) });
  }
  if (q.deadlineDay !== undefined && world.time.day > q.deadlineDay) {
    q.status = 'completed';
    q.completedDay = world.time.day;
    const half = Math.floor(q.reward.money / 2);
    world.characters[world.mcId].money += half;
    logEvent(world, 'quest.late', { quest: q.id }, `"${q.title}" delivered late — half pay (${fmtMoney(half)}), and a note taken of it.`, { location: q.giverLocation });
    advanceCampaign(world, q);
    return null;
  }
  q.status = 'completed';
  q.completedDay = world.time.day;
  const mc = world.characters[world.mcId];
  mc.money += q.reward.money;
  if (q.reward.itemProtos) {
    for (const proto of q.reward.itemProtos) {
      const item = makeItem(world, proto, 1);
      item.history.push(`Payment for "${q.title}"`);
      addToContainer(world, item, mc);
    }
  }
  if (q.reward.xp) for (const c of partyMembers(world)) grantXp(world, c, q.reward.xp);
  if (q.reward.factionRep) {
    for (const [fac, delta] of Object.entries(q.reward.factionRep)) {
      for (const c of partyMembers(world)) {
        c.factionReputation[fac] = Math.max(-10, Math.min(10, (c.factionReputation[fac] ?? 0) + delta));
      }
      logEvent(world, 'faction.rep', { faction: fac, delta, why: q.title }, `${world.factions[fac]?.name ?? fac} takes note: reputation ${delta > 0 ? '+' : ''}${delta} ("${q.title}").`);
    }
  }
  logEvent(world, 'quest.completed', { quest: q.id, reward: q.reward }, `"${q.title}" completed — paid ${describeReward(world, q)}.`, { location: q.giverLocation, witnesses: partyMembers(world).map((c) => c.id) });
  advanceCampaign(world, q);
  advanceGuild(world, q);
  advancePersonal(world, q);
  return null;
}

// ---------- offers ----------
export function offeredQuestsAt(world: WorldState, locationId: string): Quest[] {
  return Object.values(world.quests).filter((q) => q.status === 'offered' && q.giverLocation === locationId);
}

export function activeQuests(world: WorldState): Quest[] {
  return Object.values(world.quests).filter((q) => q.status === 'active' || q.status === 'ready');
}

function avgPartyLevel(world: WorldState): number {
  const members = partyMembers(world);
  return members.reduce((n, c) => n + c.level, 0) / Math.max(1, members.length);
}

/** Procedural jobs drift onto the boards every few days. */
export const JOB_TEMPLATES: ((world: WorldState, rng: Rng) => Omit<Quest, 'id' | 'status' | 'offeredDay'> | null)[] = [
  (world, rng) => ({
    title: rng.pick(['Rats in the cellar', 'Vermin pay', 'The catch-quota']),
    giver: 'board',
    giverLocation: 'LOC_DOCK_0042',
    description: 'The Broken Crown pays per tail. The cellars and the crypts are crawling.',
    objectives: [{ kind: 'kill', templateKey: rng.chance(0.5) ? 'giant-rat' : 'carrion-beetle', count: rng.int(3, 6), baseline: 0 }],
    reward: { money: Math.round(rng.int(6, 12) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 40 },
    deadlineDay: world.time.day + rng.int(4, 8),
  }),
  (world, rng) => ({
    title: rng.pick(['A quiet parcel', 'No questions carried', 'The sealed satchel']),
    giver: 'CHAR_VARGA',
    giverLocation: 'LOC_SALTWAREHOUSE',
    description: 'Varga wants a package moved. Do not open it. Do not be seen by the Watch.',
    objectives: [{ kind: 'deliver', itemProto: 'sealed-package', locationId: rng.pick(['LOC_WHARVES', 'LOC_THIEFGUILD', 'LOC_GRAVEROW']), done: false }],
    reward: { money: Math.round(rng.int(15, 30) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 30, factionRep: { FAC_REDKNIVES: 1, FAC_WATCH: -1 } },
    deadlineDay: world.time.day + rng.int(2, 4),
  }),
  (world, rng) => ({
    title: rng.pick(['Bones walking', 'The Watch pays for quiet', 'Thug trouble']),
    giver: 'CHAR_DORN',
    giverLocation: 'LOC_IRONMARKET_SQ',
    description: 'Captain Dorn pays honest coin for dishonest men taken off his streets.',
    objectives: [{ kind: 'kill', templateKey: rng.chance(0.6) ? 'street-thug' : 'red-knife-cutter', count: rng.int(2, 4), baseline: 0 }],
    reward: { money: Math.round(rng.int(12, 22) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 60, factionRep: { FAC_WATCH: 1, FAC_REDKNIVES: -1 } },
  }),
  (world, rng) => ({
    title: rng.pick(['Bones out of the ground', 'The graves won\u2019t keep', 'Warden\u2019s bounty']),
    giver: 'board',
    giverLocation: 'LOC_GRAVEROW',
    description: 'The Bonewardens pay per skull returned to rest. The crypts are giving them up faster than the shovels can keep pace.',
    objectives: [{ kind: 'kill', templateKey: rng.chance(0.5) ? 'skeleton' : 'ghoul', count: rng.int(3, 6), baseline: 0 }],
    reward: { money: Math.round(rng.int(14, 26) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 70, factionRep: { FAC_BONEWARDENS: 1 } },
    deadlineDay: world.time.day + rng.int(5, 9),
  }),
  (world, rng) => ({
    title: rng.pick(['Goblins in the walls', 'The under-toll', 'Tunnel trouble']),
    giver: 'board',
    giverLocation: 'LOC_IRONMARKET_SQ',
    description: 'Something small and organized has been robbing cellars along the market row. The merchants pooled a purse.',
    objectives: [{ kind: 'kill', templateKey: 'tunnel-goblin', count: rng.int(3, 5), baseline: 0 }],
    reward: { money: Math.round(rng.int(12, 20) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 60, factionRep: { FAC_COINGUILD: 1 } },
    deadlineDay: world.time.day + rng.int(4, 8),
  }),
  (world, rng) => ({
    title: rng.pick(['The lamp route', 'Oil for the dark streets', 'A lamplighter short']),
    giver: 'board',
    giverLocation: 'LOC_LAMPHALL',
    description: 'A lamplighter is down with the shakes and the union will not leave a route dark. Walk the oil out and come back whole.',
    objectives: [{ kind: 'deliver', itemProto: 'sealed-package', locationId: rng.pick(['LOC_GRAVEROW', 'LOC_WHARVES', 'LOC_NIGHTMARKET']), done: false }],
    reward: { money: Math.round(rng.int(10, 18) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 40, factionRep: { FAC_LAMPLIGHTERS: 1 } },
    deadlineDay: world.time.day + rng.int(2, 4),
  }),
  (world, rng) => ({
    title: rng.pick(['Serpents under the street', 'The drowned toll', 'Sewer bounty']),
    giver: 'board',
    giverLocation: 'LOC_RATCATCHER',
    description: 'The sewer gate crews won\u2019t go down while things with too many ribs are swimming the outfalls.',
    objectives: [{ kind: 'kill', templateKey: rng.chance(0.6) ? 'sewer-serpent' : 'giant-rat', count: rng.int(3, 6), baseline: 0 }],
    reward: { money: Math.round(rng.int(10, 18) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 55 },
    deadlineDay: world.time.day + rng.int(4, 7),
  }),
  (world, rng) => ({
    title: rng.pick(['Eyes on the Land Gate', 'Count the carts', 'The long walk east']),
    giver: 'board',
    giverLocation: 'LOC_IRONMARKET_SQ',
    description: 'The Guild of Coin wants fresh eyes on the eastern road: walk out to the waystations, note what moves, come back.',
    objectives: [
      { kind: 'visit', locationId: 'LOC_WAYREST', done: false },
      { kind: 'visit', locationId: 'LOC_SALTMERE', done: false },
    ],
    reward: { money: Math.round(rng.int(16, 28) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 60, factionRep: { FAC_COINGUILD: 1 } },
    deadlineDay: world.time.day + rng.int(6, 10),
  }),
  (world, rng) => ({
    title: rng.pick(['A letter for the hermit', 'Salt-road post', 'Carried past the walls']),
    giver: 'board',
    giverLocation: 'LOC_TEMPLE',
    description: 'The temple keeps a correspondence with the Hermitage. The road between is not what it was.',
    objectives: [{ kind: 'deliver', itemProto: 'sealed-package', locationId: 'LOC_HERMITAGE', done: false }],
    reward: { money: Math.round(rng.int(18, 30) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 60, factionRep: { FAC_VEILEDFLAME: 1 } },
    deadlineDay: world.time.day + rng.int(5, 8),
  }),
  (world, rng) => ({
    title: rng.pick(['Grave-robbers again', 'The mausoleum watch', 'Shovels at midnight']),
    giver: 'CHAR_DORN',
    giverLocation: 'LOC_IRONMARKET_SQ',
    description: 'Somebody is opening graves before the Bonewardens close them. The Watch pays for the shovels\u2019 owners.',
    objectives: [{ kind: 'kill', templateKey: 'grave-robber', count: rng.int(2, 4), baseline: 0 }],
    reward: { money: Math.round(rng.int(14, 24) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 65, factionRep: { FAC_WATCH: 1 } },
    deadlineDay: world.time.day + rng.int(4, 7),
  }),
  (world, rng) => ({
    title: rng.pick(['The smugglers\u2019 tithe', 'Cellar clearance', 'What the tide brought']),
    giver: 'CHAR_VARGA',
    giverLocation: 'LOC_SALTWAREHOUSE',
    description: 'Varga\u2019s cellar has competition in it. She would like the competition to stop being alive in her cellar.',
    objectives: [{ kind: 'kill', templateKey: 'smuggler', count: rng.int(2, 4), baseline: 0 }],
    reward: { money: Math.round(rng.int(16, 26) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 60, factionRep: { FAC_REDKNIVES: 1, FAC_WATCH: -1 } },
    deadlineDay: world.time.day + rng.int(3, 6),
  }),
  (world, rng) => ({
    title: rng.pick(['Prove the crypt is quiet', 'A widow\u2019s peace', 'Walk the deep row']),
    giver: 'board',
    giverLocation: 'LOC_GRAVEROW',
    description: 'A dowager pays to have the family mausoleum walked end to end and pronounced quiet. It will not be quiet.',
    objectives: [{ kind: 'visit', locationId: 'LOC_MAUSOLEUM', done: false }],
    reward: { money: Math.round(rng.int(8, 14) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 35 },
    deadlineDay: world.time.day + rng.int(3, 5),
  }),
  (world, rng) => {
    // put a bounty on whichever early warden still stands
    const open = Object.values(world.dungeons).filter((d) => !d.bossDefeated && (parseInt(d.recommendedLevel, 10) || 1) <= avgPartyLevel(world) + 3);
    if (!open.length) return null;
    const target = rng.pick(open);
    return {
      title: `The warden of ${target.name}`,
      giver: 'board',
      giverLocation: 'LOC_IRONMARKET_SQ',
      description: `A standing purse, half the city\u2019s coin and half its nerves: whoever puts down whatever rules ${target.name} drinks free for a season.`,
      objectives: [{ kind: 'clear-boss', dungeonId: target.id, done: false }],
      reward: { money: Math.round(rng.int(40, 60) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 200 },
    };
  },
  (world, rng) => ({
    title: rng.pick(['The fight they bet on', 'Pit meat wanted', 'Three rounds, honest work']),
    giver: 'board',
    giverLocation: 'LOC_FIGHTPIT',
    description: 'The bookmaker wants bodies the crowd hasn\u2019t seen before. Beat what the streets send and the house pays out.',
    objectives: [{ kind: 'kill', templateKey: rng.chance(0.5) ? 'street-thug' : 'pit-bruiser', count: rng.int(2, 3), baseline: 0 }],
    reward: { money: Math.round(rng.int(14, 22) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 55, factionRep: { FAC_TIDECOURT: 1 } },
    deadlineDay: world.time.day + rng.int(3, 6),
  }),
  (world, rng) => ({
    title: rng.pick(['The night market wants quiet', 'Wisp trouble', 'Lamps going strange']),
    giver: 'board',
    giverLocation: 'LOC_NIGHTMARKET',
    description: 'Lamp-wisps have been leading customers into the canal. Bad for trade. Worse for the customers.',
    objectives: [{ kind: 'kill', templateKey: 'lamp-wisp', count: rng.int(2, 4), baseline: 0 }],
    reward: { money: Math.round(rng.int(16, 26) * 10 * veterancyPayMult(avgPartyLevel(world))), xp: 70, factionRep: { FAC_LAMPLIGHTERS: 1 } },
    deadlineDay: world.time.day + rng.int(4, 7),
  }),
];

export function refreshJobs(world: WorldState) {
  ensurePersonalArcs(world); // trust/level gates may have opened
  // the board cap counts board jobs only — never the spine, arcs, or guild trials
  const openOffers = Object.values(world.quests).filter((q) => q.status === 'offered' && !q.isMain && !q.personal && !q.guild).length;
  if (openOffers >= 4) return;
  const rng = new Rng((world.masterSeed ^ (world.time.day * 7907)) >>> 0);
  if (!rng.chance(0.6)) return;
  const make = rng.pick(JOB_TEMPLATES)(world, rng);
  if (!make) return;
  // avoid stacking identical offers
  if (Object.values(world.quests).some((q) => q.status === 'offered' && q.title === make.title)) return;
  const q: Quest = { ...make, id: questId(world), status: 'offered', offeredDay: world.time.day };
  world.quests[q.id] = q;
  logEvent(world, 'quest.offered', { quest: q.id }, `Work on offer at ${world.locations[q.giverLocation]?.name}: "${q.title}" (${describeReward(world, q)}).`);
}

/** Hand-authored hooks present from Day 1 (plus the campaign spine). */
export function seedQuests(world: WorldState) {
  const seed: Quest[] = [
    {
      id: questId(world),
      title: 'The Broken Crown’s Cellar Problem',
      giver: 'CHAR_TOBBE',
      giverLocation: 'LOC_DOCK_0042',
      description: 'Tobbe’s heard scratching under the floorboards for a week. Something is coming up from the Drowning Cellars, and he’d rather pay you than the Knives.',
      objectives: [{ kind: 'kill', templateKey: 'giant-rat', count: 4, baseline: 0 }],
      reward: { money: 120, xp: 50 },
      status: 'offered',
      offeredDay: 1,
    },
  ];
  for (const q of seed) world.quests[q.id] = q;
  ensureCampaign(world);
  ensurePersonalArcs(world);
}
