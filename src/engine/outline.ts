// Outline-from-play: turn a stretch of played simulation into a
// chapter outline. The event log is segmented into scene-shaped
// beats (location changes, day breaks, long gaps, rests); each beat
// carries the facts that happened in it and can become a real Scene
// stub with a correct simulation header. The LLM layer (shapeOutline)
// adds narrative framing; the deterministic layer needs nothing.

import type { Scene, SimEvent, WorldState } from './types';
import { fmtTime, nextId, partyMembers } from './world';
import { calendarLabel } from './rules';
import { chatWithNpc, type ChatMessage, type LlmConfig } from './npcChat';

export interface OutlineBeat {
  title: string;
  sceneType: 'action' | 'dialogue' | 'exploration' | 'domestic' | 'business' | 'transition';
  day: number;
  startMinute: number;
  location: string; // LocationId
  participants: string[]; // CharacterIds
  bullets: string[];
  carryForward: string[]; // unresolved threads this beat leaves open
}

/** Event kinds worth outlining (the rest is bookkeeping). */
const SIGNIFICANT = [
  'travel', 'dungeon.enter', 'dungeon.exit', 'dungeon.move', 'dungeon.search', 'dungeon.trap',
  'combat.start', 'combat.end', 'loot.taken', 'loot.chest',
  'quest.accepted', 'quest.ready', 'quest.completed', 'quest.late', 'quest.deliver',
  'conversation', 'encounter.social', 'encounter.vendetta', 'encounter.incident',
  'temple.service', 'training.levelup', 'level.available', 'injury', 'character.death',
  'party.join', 'party.leave', 'party.defeated', 'rest', 'rest.inn', 'rest.home',
  'home.feast', 'home.spar', 'home.brew', 'home.cook', 'home.pray',
  'shop.buy', 'shop.sell', 'meal', 'weather', 'faction.rep', 'npc.promoted',
  'author.override', 'household.tier', 'household.upgrade',
];

// kinds too minor to open a beat or appear alone
const QUIET = ['dungeon.move', 'shop.buy', 'shop.sell', 'weather', 'meal'];

export function eventsSinceOutline(world: WorldState): SimEvent[] {
  return world.events.slice(world.outlinedUpTo ?? 0).filter((e) => SIGNIFICANT.includes(e.kind));
}

function minutesOf(e: SimEvent): number {
  return e.time.day * 1440 + e.time.minute;
}

function beatTitle(world: WorldState, beat: OutlineBeat, events: SimEvent[]): string {
  const byKind = (k: string) => events.find((e) => e.kind === k);
  const combat = byKind('combat.end');
  if (combat) {
    const outcome = String(combat.data.outcome ?? '');
    return outcome === 'victory' ? `Blood in ${world.locations[beat.location]?.name ?? 'the dark'}` : outcome === 'defeat' ? 'The beating' : 'The fight that went wrong';
  }
  const questDone = byKind('quest.completed');
  if (questDone) return `Collecting the coin`;
  const conv = byKind('conversation');
  if (conv) return `A word with ${world.characters[String(conv.data.npc)]?.name ?? 'someone'}`;
  const feast = byKind('home.feast');
  if (feast) return 'The feast';
  if (byKind('dungeon.enter')) return `Down into ${world.dungeons[String(byKind('dungeon.enter')!.data.dungeon)]?.name ?? 'the dark'}`;
  if (byKind('rest.home') || byKind('rest.inn') || byKind('rest')) return 'A night, survived';
  if (byKind('training.levelup')) return 'Training day';
  if (byKind('encounter.vendetta')) return 'They know your face';
  return world.locations[beat.location]?.name ?? 'On the streets';
}

function beatType(events: SimEvent[]): OutlineBeat['sceneType'] {
  const kinds = new Set(events.map((e) => e.kind));
  if (kinds.has('combat.end') || kinds.has('encounter.vendetta')) return 'action';
  if (kinds.has('conversation') || kinds.has('encounter.social')) return 'dialogue';
  if (kinds.has('dungeon.enter') || kinds.has('dungeon.search') || kinds.has('loot.chest')) return 'exploration';
  if (kinds.has('rest.home') || kinds.has('home.cook') || kinds.has('home.feast') || kinds.has('home.spar')) return 'domestic';
  if (kinds.has('quest.accepted') || kinds.has('quest.completed') || kinds.has('shop.buy') || kinds.has('training.levelup') || kinds.has('temple.service')) return 'business';
  return 'transition';
}

function carryForwardOf(events: SimEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.kind === 'combat.end') {
      const outcome = String(e.data.outcome ?? '');
      if (outcome === 'fled') out.push('The enemies the party fled from are still out there.');
      if (outcome === 'defeat') out.push('The party lost this fight — someone knows they can be beaten.');
    }
    if (e.kind === 'injury') out.push(e.summary);
    if (e.kind === 'level.available') out.push(e.summary);
    if (e.kind === 'quest.accepted') out.push(`Open job: ${e.summary}`);
    if (e.kind === 'encounter.vendetta') out.push('The Red Knives will try again.');
  }
  return out.slice(0, 3);
}

/**
 * Segment the un-outlined events into scene-shaped beats.
 * Breaks on: day change, location change, gaps > 3 hours, and rests.
 */
export function buildOutline(world: WorldState): OutlineBeat[] {
  const events = eventsSinceOutline(world);
  if (!events.length) return [];
  const beats: OutlineBeat[] = [];
  let group: SimEvent[] = [];

  const flush = () => {
    if (!group.length) return;
    const loud = group.filter((e) => !QUIET.includes(e.kind));
    if (!loud.length && beats.length) {
      group = [];
      return; // pure bookkeeping between real beats
    }
    const first = group[0];
    const witnesses = new Set<string>();
    for (const e of group) (e.witnesses ?? []).forEach((w) => witnesses.add(w));
    if (witnesses.size === 0) partyMembers(world).forEach((c) => witnesses.add(c.id));
    const beat: OutlineBeat = {
      title: '',
      sceneType: 'transition',
      day: first.time.day,
      startMinute: first.time.minute,
      location: first.location ?? world.partyLocation,
      participants: [...witnesses],
      bullets: group.map((e) => e.summary),
      carryForward: carryForwardOf(group),
    };
    beat.sceneType = beatType(group);
    beat.title = beatTitle(world, beat, group);
    beats.push(beat);
    group = [];
  };

  let lastLoc: string | null = null;
  let lastMin = minutesOf(events[0]);
  for (const e of events) {
    const gap = minutesOf(e) - lastMin;
    const locChanged = e.kind === 'travel' || (e.location && lastLoc && e.location !== lastLoc);
    const dayChanged = group.length > 0 && e.time.day !== group[0].time.day;
    if (group.length && (locChanged || dayChanged || gap > 180)) flush();
    group.push(e);
    if (e.location) lastLoc = e.location;
    lastMin = minutesOf(e);
    // a night's rest closes its beat
    if (e.kind === 'rest' || e.kind === 'rest.inn' || e.kind === 'rest.home') flush();
  }
  flush();
  // collapse runs of pure-travel beats into one journey beat
  const merged: OutlineBeat[] = [];
  for (const b of beats) {
    const travelOnly = b.bullets.every((x) => x.startsWith('The party traveled'));
    const prev = merged[merged.length - 1];
    const prevTravelOnly = prev && prev.day === b.day && prev.bullets.every((x) => x.startsWith('The party traveled'));
    if (travelOnly && prevTravelOnly) {
      prev.bullets.push(...b.bullets);
      prev.title = 'Across the city';
      prev.location = b.location; // the journey ends where it ends
      continue;
    }
    merged.push(b);
  }
  return merged;
}

/** Human-readable outline text (markdown-ish, for export or notes). */
export function outlineToText(world: WorldState, beats: OutlineBeat[], chapter: number): string {
  const lines = [`# Chapter ${chapter} — outline from play`, ''];
  beats.forEach((b, i) => {
    lines.push(`## ${i + 1}. ${b.title}  _(${b.sceneType})_`);
    lines.push(`Day ${b.day}, ${fmtTime({ day: b.day, minute: b.startMinute })} (${calendarLabel(b.day)}) · ${world.locations[b.location]?.name ?? b.location} · ${b.participants.map((p) => world.characters[p]?.name).filter(Boolean).join(', ')}`);
    for (const bullet of b.bullets) lines.push(`- ${bullet}`);
    if (b.carryForward.length) {
      lines.push(`- _Leaves open:_ ${b.carryForward.join(' · ')}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * Turn beats into real Scene stubs with correct sim headers. The beat
 * facts land in the scene as an [OUTLINE] block the author writes over
 * (compile strips it). Marks the events as outlined.
 */
export function createScenesFromBeats(world: WorldState, beats: OutlineBeat[], chapter: number): Scene[] {
  const maxOrder = world.scenes.reduce((m, s) => Math.max(m, s.order), 0);
  const created: Scene[] = beats.map((b, i) => {
    const scene: Scene = {
      id: nextId(world, 'SCN'),
      chapter,
      title: b.title,
      pov: world.mcId,
      day: b.day,
      startMinute: b.startMinute,
      location: b.location,
      participants: b.participants,
      order: maxOrder + i + 1,
      text: `---\n[OUTLINE] (${b.sceneType})\n${b.bullets.map((x) => `- ${x}`).join('\n')}${b.carryForward.length ? `\n- Leaves open: ${b.carryForward.join(' · ')}` : ''}\n---\n\n`,
    };
    world.scenes.push(scene);
    return scene;
  });
  world.outlinedUpTo = world.events.length;
  return created;
}

export function markOutlined(world: WorldState) {
  world.outlinedUpTo = world.events.length;
}

/** LLM: shape the beats into a chapter with a throughline. */
export async function shapeOutline(cfg: LlmConfig, world: WorldState, beats: OutlineBeat[], chapter: number): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        `You are a development editor shaping one chapter of a gritty LitRPG novel from a play session's factual beats. ` +
        `Propose: a chapter title; a one-sentence throughline; then for each beat a scene pitch (goal / conflict / turn, 1–2 sentences each) with a note on which beats could merge or be summarized in passing; end with a hook for the next chapter drawn from what's left open. ` +
        `Use ONLY the given facts — never add events. Under 300 words.`,
    },
    { role: 'user', content: outlineToText(world, beats, chapter) },
  ];
  return (await chatWithNpc({ ...cfg, temperature: 0.7 }, messages)).trim();
}
