// The hearth: home is where the harem book actually lives. Partners
// move in, evenings happen, affection needs TENDING or it cools —
// the Sims loop under the Bard's Tale one. Everything here logs
// rich event lines, because these are the scenes the reader buys
// book nine for.

import type { Character, RelationshipValues, WorldState } from './types';
import { addMinutes, logEvent, relationshipBetween } from './world';
import { findHome } from './household';
import { relationshipStage, type RelationshipStage } from './romance';

const STAGE_RANK: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'close', 'smitten', 'lover', 'partner', 'spouse'];
function atLeast(stage: RelationshipStage, floor: RelationshipStage): boolean {
  return STAGE_RANK.indexOf(stage) >= STAGE_RANK.indexOf(floor);
}

function nudge(rel: RelationshipValues, key: keyof RelationshipValues, amount: number) {
  const current = rel[key];
  const scaled = amount > 0 && current >= 6 ? Math.max(1, Math.round(amount / 2)) : amount;
  rel[key] = Math.max(-10, Math.min(10, current + scaled));
}

/** Stamp that someone got real attention today (dates, gifts, hearth). */
export function noteAttention(world: WorldState, npcId: string) {
  world.lastAttentionDay ??= {};
  world.lastAttentionDay[npcId] = world.time.day;
}

// ---------- moving in ----------

/** Invite a lover (or beyond) to live at the home. */
export function inviteToLive(world: WorldState, npcId: string): string | null {
  const home = findHome(world);
  if (!home) return 'There is no home to offer.';
  const c = world.characters[npcId];
  if (!c || !c.alive) return 'Who?';
  const hh = world.locations[home].household!;
  if (hh.residents.includes(npcId)) return `${c.name} already lives here.`;
  const stage = relationshipStage(c.relationships[world.mcId]);
  if (!atLeast(stage, 'lover')) return `${c.name} would need to be more than ${stage} for that door to be hers.`;
  hh.residents.push(npcId);
  const rel = relationshipBetween(world, c.id, world.mcId);
  nudge(rel, 'commitment', 3);
  nudge(rel, 'affection', 2);
  noteAttention(world, npcId);
  c.memories.push({ subject: world.mcId, event: 'They asked me to live with them. Not stay over. LIVE.', importance: 10, emotionalValue: 7, day: world.time.day });
  return null;
}

/** Everyone who shares the roof (and is around to share an evening). */
export function residentsPresent(world: WorldState): Character[] {
  const home = findHome(world);
  if (!home || world.partyLocation !== home) return [];
  const hh = world.locations[home].household!;
  return hh.residents
    .map((id) => world.characters[id])
    .filter((c): c is Character => !!c && c.alive && c.id !== world.mcId);
}

// ---------- evenings ----------

export interface HearthActivity {
  key: string;
  label: string;
  minStage: RelationshipStage;
  minutes: number;
  dials: Partial<RelationshipValues>;
  line: (npc: Character, mc: Character) => string;
  memory: (mc: Character) => string;
}

export const HEARTH_ACTIVITIES: HearthActivity[] = [
  {
    key: 'hearth-meal', label: 'Cook and eat together', minStage: 'close', minutes: 90,
    dials: { affection: 2, trust: 1 },
    line: (npc, mc) => `${mc.name} and ${npc.name} cooked with four hands in a kitchen sized for two, and ate it slowly, and nobody reached for a weapon or a ledger the whole time.`,
    memory: () => 'We cooked. Ordinary as bread. I would not trade it for a legendary sword, and I have SEEN a legendary sword.',
  },
  {
    key: 'hearth-evening', label: 'A quiet evening by the fire', minStage: 'close', minutes: 120,
    dials: { trust: 2, affection: 1 },
    line: (npc, mc) => `${mc.name} and ${npc.name} let the fire do the talking for an evening — mending, reading, the small nothing-work of people who intend to stay.`,
    memory: () => 'An evening where nothing happened. I used to think those were wasted. I have amended my records.',
  },
  {
    key: 'hearth-bath', label: 'Draw a bath for two', minStage: 'lover', minutes: 90,
    dials: { attraction: 2, affection: 2 },
    line: (npc, mc) => `${mc.name} heated water the slow way while ${npc.name} pretended not to watch, and the bath went cold long before either of them noticed.`,
    memory: () => 'Hot water, low light, no armor. Scars stop being stories you tell and become places someone has been careful of.',
  },
  {
    key: 'hearth-night', label: 'Retire together', minStage: 'lover', minutes: 480,
    dials: { attraction: 2, affection: 2, commitment: 2 },
    line: (npc, mc) => `${mc.name} and ${npc.name} banked the fire and took the stairs together, and the house kept the rest of the night to itself.`,
    memory: () => 'The house keeps our nights. That is all any record needs to say, and more than I ever thought I would get to write.',
  },
];

/** One shared evening act per person per day; the house remembers. */
export function hearthTime(world: WorldState, npcId: string, actKey: string): string | null {
  const home = findHome(world);
  if (!home || world.partyLocation !== home) return 'The hearth is at home.';
  const c = world.characters[npcId];
  const mc = world.characters[world.mcId];
  const act = HEARTH_ACTIVITIES.find((a) => a.key === actKey);
  if (!c || !c.alive || !act) return 'No.';
  const here = c.inParty || world.locations[home].household!.residents.includes(npcId);
  if (!here) return `${c.name} is not under this roof.`;
  const stage = relationshipStage(c.relationships[world.mcId]);
  if (!atLeast(stage, act.minStage)) return `That is not where things stand with ${c.name}. Yet.`;
  world.hearthDays ??= {};
  const key = `${world.time.day}:${npcId}`;
  if (world.hearthDays[key]) return `The day only holds one such evening with ${c.name}.`;
  world.hearthDays[key] = act.key;
  addMinutes(world, act.minutes);
  const rel = relationshipBetween(world, c.id, world.mcId);
  for (const [k, v] of Object.entries(act.dials)) nudge(rel, k as keyof RelationshipValues, v ?? 0);
  noteAttention(world, npcId);
  const line = act.line(c, mc);
  c.memories.push({ subject: world.mcId, event: act.memory(mc), importance: 6, emotionalValue: 6, day: world.time.day });
  logEvent(world, 'hearth', { npc: c.id, activity: act.key }, line, { location: home, witnesses: [mc.id, c.id] });
  // retiring together is how spouse pregnancies actually start —
  // family.ts rolls daily for spouses; a shared night weights the dice
  if (act.key === 'hearth-night') world.nightTogether = { npcId, day: world.time.day };
  return null;
}

// ---------- the cooling (Sims decay) ----------

export const NEGLECT_DAYS = 7; // untended hearts cool after a week
export const AFFECTION_FLOOR = 3; // old fires bank, they don't die

/** Daily: entangled hearts that get no attention slowly cool. */
export function dailyHearthTick(world: WorldState) {
  world.lastAttentionDay ??= {};
  for (const c of Object.values(world.characters)) {
    if (!c.persistent || !c.alive || c.isMC) continue;
    const rel = c.relationships[world.mcId];
    const stage = relationshipStage(rel);
    if (!atLeast(stage, 'smitten')) continue;
    const last = world.lastAttentionDay[c.id] ?? world.time.day;
    world.lastAttentionDay[c.id] ??= world.time.day;
    const idle = world.time.day - last;
    if (idle > 0 && idle % NEGLECT_DAYS === 0 && rel!.affection > AFFECTION_FLOOR) {
      rel!.affection -= 1;
      if (idle === NEGLECT_DAYS) {
        logEvent(world, 'hearth.cooling', { npc: c.id, idle }, `${c.name} has stopped mentioning ${world.characters[world.mcId].name} first in conversations. A week is a long time to be someone's afterthought.`, { witnesses: [c.id] });
      }
    }
  }
}
