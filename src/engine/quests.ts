// Quests and jobs: patrons and job boards offer work; objectives are
// checked against simulation state (kill tallies, party position,
// carried items, boss flags); turn-in pays coin, items, XP, and
// faction reputation. Every transition is a logged event — quests are
// chapter-shaped plot hooks with deadlines and political weight.

import type { Quest, QuestObjective, WorldState } from './types';
import { MONSTERS } from './monsters';
import { Rng } from './rng';
import { grantXp, logEvent, partyMembers } from './world';
import { addToContainer, fmtMoney, makeItem } from './rules';
import { advanceCampaign, ensureCampaign } from './campaign';
import { advanceGuild } from './guilds';

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
  return null;
}

// ---------- offers ----------
export function offeredQuestsAt(world: WorldState, locationId: string): Quest[] {
  return Object.values(world.quests).filter((q) => q.status === 'offered' && q.giverLocation === locationId);
}

export function activeQuests(world: WorldState): Quest[] {
  return Object.values(world.quests).filter((q) => q.status === 'active' || q.status === 'ready');
}

/** Procedural jobs drift onto the boards every few days. */
const JOB_TEMPLATES: ((world: WorldState, rng: Rng) => Omit<Quest, 'id' | 'status' | 'offeredDay'> | null)[] = [
  (world, rng) => ({
    title: rng.pick(['Rats in the cellar', 'Vermin pay', 'The catch-quota']),
    giver: 'board',
    giverLocation: 'LOC_DOCK_0042',
    description: 'The Broken Crown pays per tail. The cellars and the crypts are crawling.',
    objectives: [{ kind: 'kill', templateKey: rng.chance(0.5) ? 'giant-rat' : 'carrion-beetle', count: rng.int(3, 6), baseline: 0 }],
    reward: { money: rng.int(6, 12) * 10, xp: 40 },
    deadlineDay: world.time.day + rng.int(4, 8),
  }),
  (world, rng) => ({
    title: rng.pick(['A quiet parcel', 'No questions carried', 'The sealed satchel']),
    giver: 'CHAR_VARGA',
    giverLocation: 'LOC_SALTWAREHOUSE',
    description: 'Varga wants a package moved. Do not open it. Do not be seen by the Watch.',
    objectives: [{ kind: 'deliver', itemProto: 'sealed-package', locationId: rng.pick(['LOC_WHARVES', 'LOC_THIEFGUILD', 'LOC_GRAVEROW']), done: false }],
    reward: { money: rng.int(15, 30) * 10, factionRep: { FAC_REDKNIVES: 1, FAC_WATCH: -1 }, xp: 30 },
    deadlineDay: world.time.day + rng.int(2, 4),
  }),
  (_world, rng) => ({
    title: rng.pick(['Bones walking', 'The Watch pays for quiet', 'Thug trouble']),
    giver: 'CHAR_DORN',
    giverLocation: 'LOC_IRONMARKET_SQ',
    description: 'Captain Dorn pays honest coin for dishonest men taken off his streets.',
    objectives: [{ kind: 'kill', templateKey: rng.chance(0.6) ? 'street-thug' : 'red-knife-cutter', count: rng.int(2, 4), baseline: 0 }],
    reward: { money: rng.int(12, 22) * 10, factionRep: { FAC_WATCH: 1, FAC_REDKNIVES: -1 }, xp: 60 },
  }),
];

export function refreshJobs(world: WorldState) {
  const openOffers = Object.values(world.quests).filter((q) => q.status === 'offered').length;
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
}
