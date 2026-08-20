// The relationship system. Dials (affection/trust/respect/attraction/
// commitment) already exist and move through witnessed acts, arcs, and
// conversations; this adds STAGES derived from the dials, deliberate
// courting (gifts matched against her values, shared time), and harem
// dynamics — companions notice who else holds the MC's attention, and
// answer it through their own values, not a script.

import type { Character, Item, RelationshipValues, WorldState } from './types';
import { festivalToday } from './festivals';
import { Rng, randomSeed } from './rng';
import { addMinutes, logEvent, relationshipBetween } from './world';
import { fmtMoney } from './rules';

// ---------- stages ----------
export type RelationshipStage =
  | 'stranger' | 'acquaintance' | 'friend' | 'close' | 'smitten' | 'lover' | 'partner' | 'spouse';

export function relationshipStage(rel: RelationshipValues | undefined): RelationshipStage {
  if (!rel) return 'stranger';
  const warmth = rel.affection + rel.trust;
  if (rel.commitment >= 8 && rel.attraction >= 4) return 'spouse';
  if (rel.commitment >= 5 && rel.attraction >= 3) return 'partner';
  if (rel.attraction >= 5 && rel.affection >= 4) return 'lover';
  if (rel.attraction >= 3 && rel.affection >= 3) return 'smitten';
  if (warmth >= 8) return 'close';
  if (warmth >= 4) return 'friend';
  if (warmth >= 1) return 'acquaintance';
  return 'stranger';
}

export const STAGE_LABELS: Record<RelationshipStage, string> = {
  stranger: 'Stranger', acquaintance: 'Acquaintance', friend: 'Friend', close: 'Close',
  smitten: 'Something unspoken', lover: 'Lover', partner: 'Partner', spouse: 'Spouse',
};

/** Diminishing returns: dials move less the higher they already are. */
function nudge(rel: RelationshipValues, key: keyof RelationshipValues, amount: number) {
  const current = rel[key];
  const scaled = amount > 0 && current >= 6 ? Math.max(1, Math.round(amount / 2)) : amount;
  rel[key] = Math.max(-10, Math.min(10, current + scaled));
}

// ---------- gifts ----------
// What a gift SAYS depends on what she values, not what it costs.
const GIFT_TAGS: { match: (item: Item) => boolean; tags: string[] }[] = [
  { match: (i) => i.kind === 'weapon', tags: ['strength', 'courage'] },
  { match: (i) => i.kind === 'armor' || i.kind === 'shield', tags: ['loyalty', 'kindness'] },
  { match: (i) => i.kind === 'jewelry' || i.kind === 'treasure', tags: ['wealth', 'beauty'] },
  { match: (i) => i.kind === 'potion' || i.proto === 'antidote', tags: ['kindness', 'practical'] },
  { match: (i) => i.kind === 'tool' || i.proto === 'lockpick', tags: ['cunning', 'freedom'] },
  { match: (i) => i.kind === 'supply', tags: ['practical', 'kindness'] },
  { match: (i) => !!i.affix || i.tier === 'rare' || i.tier === 'exceptional' || i.tier === 'legendary', tags: ['strength', 'wealth', 'cunning'] },
];

export function giveGift(world: WorldState, npcId: string, itemId: string): string | null {
  const npc = world.characters[npcId];
  const mc = world.characters[world.mcId];
  const item = world.items[itemId];
  if (!npc || !npc.alive) return 'Give it to whom?';
  if (npc.location !== world.partyLocation) return 'She is not here.';
  if (!item || item.owner !== mc.id) return 'Not yours to give.';
  if (item.equippedBy) return 'Unequip it first.';
  mc.lastGiftDay ??= {};
  if (mc.lastGiftDay[npcId] === world.time.day) return `${npc.name} already accepted a gift today. Pace yourself.`;
  mc.lastGiftDay[npcId] = world.time.day;
  // festival air: hearts open a little easier
  const fest = festivalToday(world);
  const festivalWarmth = fest?.heartsOpen ? 1 : 0;
  // hand it over
  mc.inventory = mc.inventory.filter((i) => i !== itemId);
  item.owner = npc.id;
  npc.inventory.push(itemId);
  item.history.push(`Given to ${npc.name} by ${mc.name} on Day ${world.time.day}`);
  addMinutes(world, 10);
  // what it says
  const tags = GIFT_TAGS.filter((g) => g.match(item)).flatMap((g) => g.tags);
  const resonance = tags.filter((t) => npc.values.includes(t)).length;
  const worth = item.value >= 500 ? 2 : item.value >= 100 ? 1 : 0;
  const rel = relationshipBetween(world, npc.id, world.mcId);
  let line: string;
  if (item.stolen) {
    nudge(rel, 'trust', npc.values.includes('cunning') ? 1 : -2);
    line = npc.values.includes('cunning')
      ? `${npc.name} turned the ${item.name} over, recognized exactly what it was, and grinned.`
      : `${npc.name} turned the ${item.name} over, recognized exactly what it was, and looked at ${mc.name} differently. Not better.`;
  } else if (resonance >= 1) {
    nudge(rel, 'affection', 2 + resonance + festivalWarmth);
    nudge(rel, 'attraction', 1 + festivalWarmth);
    nudge(rel, 'trust', 1);
    line = `${npc.name} took the ${item.name} and went quiet a moment — it was the RIGHT gift, and she knows what that means about how ${mc.name} sees her.`;
  } else if (worth >= 2) {
    nudge(rel, 'affection', 1);
    line = `${npc.name} accepted the ${item.name} politely. Expensive — and beside the point, and you both know it.`;
  } else {
    nudge(rel, 'affection', 1 + festivalWarmth);
    line = fest?.heartsOpen
      ? `${npc.name} took the ${item.name} with a smile the ${fest.name} made easier than usual.`
      : `${npc.name} took the ${item.name} with a small, real smile.`;
  }
  npc.memories.push({ subject: mc.id, event: `${mc.name} gave me ${item.name}${resonance >= 1 ? ' — and it was exactly right' : ''}.`, importance: 4 + resonance * 2, emotionalValue: item.stolen && !npc.values.includes('cunning') ? -2 : 3 + resonance, day: world.time.day });
  logEvent(world, 'gift', { npc: npc.id, item: item.id, resonance }, line, { location: world.partyLocation, witnesses: [mc.id, npc.id] });
  return null;
}

// ---------- shared time ----------
export interface DateActivity {
  key: string;
  label: string;
  requires: (world: WorldState) => string | null;
  cost: number;
  minutes: number;
  dials: Partial<RelationshipValues>;
  line: (npc: Character, mc: Character) => string;
}

export const DATE_ACTIVITIES: DateActivity[] = [
  {
    key: 'meal', label: 'Share a meal', cost: 10, minutes: 60,
    requires: (w) => (w.locations[w.partyLocation]?.services.includes('food') ? null : 'Needs somewhere that serves food.'),
    dials: { affection: 2, attraction: 1 },
    line: (npc, mc) => `${mc.name} and ${npc.name} took a table away from the noise and let the meal go long.`,
  },
  {
    key: 'walk', label: 'Walk the district', cost: 0, minutes: 60,
    requires: () => null,
    dials: { trust: 2, affection: 1 },
    line: (npc, mc) => `${mc.name} and ${npc.name} walked without a destination, which is the only honest way to talk.`,
  },
  {
    key: 'spar', label: 'Spar together', cost: 0, minutes: 60,
    requires: (w) => {
      const home = Object.values(w.locations).find((l) => l.household);
      return home && w.partyLocation === home.id && home.household!.upgrades.includes('training-yard') ? null : 'Needs the training yard at home.';
    },
    dials: { respect: 2, attraction: 1 },
    line: (npc, mc) => `${mc.name} and ${npc.name} sparred until neither could hide how they actually move.`,
  },
  {
    key: 'fish', label: 'Fish off the pilings', cost: 0, minutes: 90,
    requires: (w) => {
      const loc = w.locations[w.partyLocation];
      return loc && (loc.type === 'dock' || loc.services.includes('passage')) ? null : 'Needs the wharves.';
    },
    dials: { affection: 2, trust: 1 },
    line: (npc, mc) => `${mc.name} and ${npc.name} fished for an hour and caught mostly quiet. It was the good kind.`,
  },
];

export function spendTimeWith(world: WorldState, npcId: string, activityKey: string): string | null {
  const npc = world.characters[npcId];
  const mc = world.characters[world.mcId];
  const act = DATE_ACTIVITIES.find((a) => a.key === activityKey);
  if (!npc || !npc.alive || !act) return 'No.';
  if (npc.location !== world.partyLocation) return 'She is not here.';
  const blocked = act.requires(world);
  if (blocked) return blocked;
  mc.lastDateDay ??= {};
  if (mc.lastDateDay[npcId] === world.time.day) return `${npc.name}'s day only has so many hours in it.`;
  if (mc.money < act.cost) return `That costs ${fmtMoney(act.cost)}.`;
  mc.money -= act.cost;
  mc.lastDateDay[npcId] = world.time.day;
  const dateFest = festivalToday(world);
  const dateWarmth = dateFest?.heartsOpen ? 1 : 0;
  addMinutes(world, act.minutes);
  const rel = relationshipBetween(world, npc.id, world.mcId);
  for (const [k, v] of Object.entries(act.dials)) nudge(rel, k as keyof RelationshipValues, (v ?? 0) + (k === 'affection' ? dateWarmth : 0));
  const line = act.line(npc, mc);
  npc.memories.push({ subject: mc.id, event: line, importance: 4, emotionalValue: 4, day: world.time.day });
  logEvent(world, 'date', { npc: npc.id, activity: act.key }, line, { location: world.partyLocation, witnesses: [mc.id, npc.id] });
  return null;
}

// ---------- harem dynamics ----------
/** Everyone the MC is entangled with (smitten or beyond). */
export function entangled(world: WorldState): Character[] {
  return Object.values(world.characters).filter((c) => {
    if (!c.persistent || !c.alive || c.isMC) return false;
    const stage = relationshipStage(c.relationships[world.mcId]);
    return ['smitten', 'lover', 'partner', 'spouse'].includes(stage);
  });
}

/**
 * When more than one heart is in play, companions react through their
 * values: 'freedom'/'kindness' lean acceptance, 'loyalty' + low trust
 * leans friction. Returns a moment hook, or null. Called by the
 * moments engine.
 */
export function haremMomentHook(world: WorldState, forId: string): { hook: string; teaser: string } | null {
  const rivals = entangled(world);
  if (rivals.length < 2) return null;
  const c = world.characters[forId];
  if (!c || !rivals.some((r) => r.id === forId)) return null;
  const others = rivals.filter((r) => r.id !== forId).map((r) => r.name);
  const rel = c.relationships[world.mcId];
  const accepting = c.values.includes('freedom') || c.values.includes('kindness') || (rel?.trust ?? 0) >= 6;
  const rng = new Rng(randomSeed());
  if (!rng.chance(0.5)) return null;
  if (accepting) {
    return {
      hook: `You know what ${world.characters[world.mcId].name} is to ${others.join(' and ')}, and you have made a kind of peace with sharing — on your own terms. Say what those terms are, in your own way. You are not asking permission; you are stating how this works if it includes you.`,
      teaser: 'about how this works, with the others',
    };
  }
  return {
    hook: `${others.join(' and ')} also hold${others.length === 1 ? 's' : ''} ${world.characters[world.mcId].name}'s attention, and it sits badly against what you value. You are not here to issue an ultimatum — yet — but you need to know where you actually stand.`,
    teaser: 'about where she actually stands',
  };
}
