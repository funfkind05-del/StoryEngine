// Prose ⇄ simulation via the LLM, without breaking the cardinal rule:
// changing prose never SILENTLY changes simulation state.
//
// - extractActions(): the model reads newly written prose and proposes
//   structured simulation actions. The author approves each one; only
//   approved proposals are executed (as logged, attributed events).
// - polishText(): line-edits a passage on request (or on a timer) and
//   returns a suggestion the author can accept or dismiss.

import type { Character, WorldState } from './types';
import { applyStatus, cureStatus, fmtMoney } from './rules';
import { addMinutes, logEvent, nextId, relationshipBetween, travelTo } from './world';
import { generateBackgroundNpc, promoteNpc } from './npc';
import { randomSeed } from './rng';
import { chatWithNpc, type ChatMessage, type LlmConfig } from './npcChat';
import { ANTI_TIC_PROMPT } from './tics';

// ---------- proposals ----------
export interface SyncProposal {
  kind: string;
  label: string; // human-readable, shown to the author
  params: Record<string, unknown>;
}

const ACTION_SPEC = `
Allowed actions (output a JSON array; use ONLY these kinds):
- {"kind":"travel","location":"<location name>"} — the party moved somewhere
- {"kind":"advance_time","minutes":<int>} — time visibly passed
- {"kind":"spend_money","character":"<name>","copper":<int>,"reason":"..."}
- {"kind":"gain_money","character":"<name>","copper":<int>,"reason":"..."}
- {"kind":"damage","character":"<name>","hp":<int>,"reason":"..."}
- {"kind":"heal","character":"<name>","hp":<int>,"reason":"..."}
- {"kind":"apply_status","character":"<name>","status":"poisoned|diseased|bleeding|cursed|blinded"}
- {"kind":"cure_status","character":"<name>","status":"..."}
- {"kind":"take_item","character":"<name>","item":"<item name>"} — picked up / acquired something new
- {"kind":"lose_item","character":"<name>","item":"<item name>"} — gave away, lost, or consumed
- {"kind":"relationship","npc":"<name>","dimension":"affection|trust|respect|attraction|commitment","delta":<-3..3>,"reason":"..."}
- {"kind":"npc_memory","npc":"<name>","event":"<one factual line>","emotionalValue":<-6..6>}
- {"kind":"introduce_npc","name":"<full name>","occupation":"...","description":"..."} — a NEW named character appeared
- {"kind":"note_event","summary":"<one factual line>"} — anything notable that fits no other kind
`;

function extractJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Ask the model to read newly written prose and propose sim actions. */
export async function extractActions(cfg: LlmConfig, world: WorldState, prose: string): Promise<SyncProposal[]> {
  const party = Object.values(world.characters).filter((c) => c.inParty && c.alive);
  const knownChars = Object.values(world.characters).filter((c) => c.persistent).map((c) => c.name);
  const knownLocs = Object.values(world.locations).filter((l) => l.type !== 'dungeon-room').map((l) => l.name);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        `You convert fantasy-novel prose into structured simulation actions. Extract ONLY what the text clearly states or strongly implies happened. Do not invent. Ignore dialogue flavor, description, and anything already implied by an @[Name](ID) token being a mere mention.\n` +
        `Party members: ${party.map((c) => c.name).join(', ')}. Known characters: ${knownChars.join(', ')}. Known locations: ${knownLocs.join(', ')}.\n` +
        `Current sim position: ${world.locations[world.partyLocation]?.name}. Day ${world.time.day}.\n` +
        ACTION_SPEC +
        `\nOutput ONLY the JSON array, no commentary. Output [] if nothing happened.`,
    },
    { role: 'user', content: prose },
  ];
  const reply = await chatWithNpc({ ...cfg, temperature: 0.1 }, messages);
  const raw = extractJsonArray(reply);
  const proposals: SyncProposal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || typeof (item as { kind?: unknown }).kind !== 'string') continue;
    const p = item as Record<string, unknown> & { kind: string };
    proposals.push({ kind: p.kind, params: p, label: describeProposal(p) });
  }
  return proposals;
}

function describeProposal(p: Record<string, unknown> & { kind: string }): string {
  const s = (k: string) => String(p[k] ?? '?');
  const n = (k: string) => Number(p[k] ?? 0);
  switch (p.kind) {
    case 'travel': return `Party travels to ${s('location')}`;
    case 'advance_time': return `Advance time ${n('minutes')} minutes`;
    case 'spend_money': return `${s('character')} spends ${fmtMoney(n('copper'))} (${s('reason')})`;
    case 'gain_money': return `${s('character')} gains ${fmtMoney(n('copper'))} (${s('reason')})`;
    case 'damage': return `${s('character')} takes ${n('hp')} damage (${s('reason')})`;
    case 'heal': return `${s('character')} recovers ${n('hp')} HP (${s('reason')})`;
    case 'apply_status': return `${s('character')} becomes ${s('status')}`;
    case 'cure_status': return `${s('character')} is cured of ${s('status')}`;
    case 'take_item': return `${s('character')} acquires "${s('item')}"`;
    case 'lose_item': return `${s('character')} loses "${s('item')}"`;
    case 'relationship': return `${s('npc')}: ${s('dimension')} ${n('delta') >= 0 ? '+' : ''}${n('delta')} toward the MC (${s('reason')})`;
    case 'npc_memory': return `${s('npc')} remembers: ${s('event')}`;
    case 'introduce_npc': return `New character: ${s('name')}, ${s('occupation')}`;
    case 'note_event': return `Log: ${s('summary')}`;
    default: return `${p.kind} (unknown)`;
  }
}

// ---------- execution (only for author-approved proposals) ----------
function findChar(world: WorldState, name: string): Character | undefined {
  const lower = name.toLowerCase();
  return Object.values(world.characters).find((c) => c.alive && (c.name.toLowerCase() === lower || c.name.toLowerCase().startsWith(lower)));
}

export function applyProposal(world: WorldState, p: SyncProposal): string {
  const P = p.params;
  const s = (k: string) => String(P[k] ?? '');
  const n = (k: string) => Math.round(Number(P[k]) || 0);
  const mark = (summary: string, data: Record<string, unknown> = {}) =>
    logEvent(world, `prose.sync.${p.kind}`, { ...data, proposal: P }, summary, { authorOverride: true }).summary;

  switch (p.kind) {
    case 'travel': {
      const lower = s('location').toLowerCase();
      const dest = Object.values(world.locations).find((l) => l.name.toLowerCase() === lower)
        ?? Object.values(world.locations).find((l) => l.name.toLowerCase().includes(lower));
      if (!dest) return `✖ Unknown location "${s('location')}" — skipped.`;
      travelTo(world, dest.id);
      return `✔ Party moved to ${dest.name}.`;
    }
    case 'advance_time': {
      const mins = Math.max(1, Math.min(1440, n('minutes')));
      addMinutes(world, mins);
      return mark(`Time advanced ${mins} minutes (from prose).`);
    }
    case 'spend_money':
    case 'gain_money': {
      const c = findChar(world, s('character'));
      if (!c) return `✖ Unknown character "${s('character')}" — skipped.`;
      const amount = Math.max(0, n('copper'));
      if (p.kind === 'spend_money') {
        if (c.money < amount) return `✖ ${c.name} has only ${fmtMoney(c.money)}, cannot spend ${fmtMoney(amount)} — skipped (continuity!).`;
        c.money -= amount;
      } else {
        c.money += amount;
      }
      return mark(`${c.name} ${p.kind === 'spend_money' ? 'spent' : 'gained'} ${fmtMoney(amount)}: ${s('reason')}`);
    }
    case 'damage':
    case 'heal': {
      const c = findChar(world, s('character'));
      if (!c) return `✖ Unknown character "${s('character')}" — skipped.`;
      const hp = Math.max(0, n('hp'));
      if (p.kind === 'damage') c.hp.current = Math.max(0, c.hp.current - hp);
      else c.hp.current = Math.min(c.hp.max, c.hp.current + hp);
      return mark(`${c.name} ${p.kind === 'damage' ? `took ${hp} damage` : `recovered ${hp} HP`} (${s('reason')}). Now ${c.hp.current}/${c.hp.max}.`);
    }
    case 'apply_status':
    case 'cure_status': {
      const c = findChar(world, s('character'));
      if (!c) return `✖ Unknown character "${s('character')}" — skipped.`;
      const status = s('status') as never;
      if (p.kind === 'apply_status') applyStatus(c, status);
      else cureStatus(c, status);
      return mark(`${c.name} is ${p.kind === 'apply_status' ? 'now' : 'no longer'} ${s('status')}.`);
    }
    case 'take_item': {
      const c = findChar(world, s('character'));
      if (!c) return `✖ Unknown character "${s('character')}" — skipped.`;
      const item = {
        id: nextId(world, 'ITEM'),
        name: s('item'),
        kind: 'misc' as const,
        slot: 'none' as const,
        value: 0,
        owner: c.id,
        history: [`Entered the story on Day ${world.time.day} (from prose)`],
      };
      world.items[item.id] = item;
      c.inventory.push(item.id);
      return mark(`${c.name} acquired ${item.name}.`, { item: item.id });
    }
    case 'lose_item': {
      const c = findChar(world, s('character'));
      if (!c) return `✖ Unknown character "${s('character')}" — skipped.`;
      const lower = s('item').toLowerCase();
      const itemId = c.inventory.find((i) => world.items[i]?.name.toLowerCase().includes(lower));
      if (!itemId) return `✖ ${c.name} does not carry "${s('item')}" — skipped (continuity!).`;
      const item = world.items[itemId];
      c.inventory = c.inventory.filter((i) => i !== itemId);
      if (item.equippedBy === c.id) {
        item.equippedBy = undefined;
        for (const [slot, id] of Object.entries(c.equipment)) if (id === itemId) delete c.equipment[slot as 'ring'];
      }
      item.owner = null;
      item.history.push(`Left ${c.name}'s hands on Day ${world.time.day} (from prose)`);
      return mark(`${c.name} no longer has ${item.name}.`, { item: itemId });
    }
    case 'relationship': {
      const npc = findChar(world, s('npc'));
      if (!npc) return `✖ Unknown character "${s('npc')}" — skipped.`;
      const dim = s('dimension') as 'affection' | 'trust' | 'respect' | 'attraction' | 'commitment';
      if (!['affection', 'trust', 'respect', 'attraction', 'commitment'].includes(dim)) return `✖ Unknown dimension "${dim}" — skipped.`;
      const delta = Math.max(-3, Math.min(3, n('delta')));
      const rel = relationshipBetween(world, npc.id, world.mcId);
      rel[dim] = Math.max(-10, Math.min(10, rel[dim] + delta));
      return mark(`${npc.name}: ${dim} ${delta >= 0 ? '+' : ''}${delta} toward ${world.characters[world.mcId].name} (${s('reason')}).`);
    }
    case 'npc_memory': {
      const npc = findChar(world, s('npc'));
      if (!npc) return `✖ Unknown character "${s('npc')}" — skipped.`;
      const emotionalValue = Math.max(-6, Math.min(6, n('emotionalValue')));
      npc.memories.push({ subject: world.mcId, event: s('event'), importance: Math.min(10, 3 + Math.abs(emotionalValue)), emotionalValue, day: world.time.day });
      return mark(`${npc.name} will remember: ${s('event')}`);
    }
    case 'introduce_npc': {
      const existing = findChar(world, s('name'));
      if (existing) return `✖ ${existing.name} already exists — skipped.`;
      const npc = generateBackgroundNpc(world, world.partyLocation, randomSeed());
      npc.name = s('name');
      npc.occupation = s('occupation') || npc.occupation;
      if (s('description')) npc.description = s('description');
      promoteNpc(world, npc.id);
      return mark(`${npc.name} (${npc.occupation}) entered the story as a persistent character.`, { character: npc.id });
    }
    case 'note_event':
      return mark(s('summary'));
    default:
      return `✖ Unknown action "${p.kind}" — skipped.`;
  }
}

// ---------- draft a scene ----------
import type { Scene } from './types';
import { fmtTime } from './world';
import { calendarLabel } from './rules';

/** The full context handed to the model for a first-pass scene draft. */
export function buildDraftPrompt(world: WorldState, scene: Scene, outline: string): ChatMessage[] {
  const participants = scene.participants
    .map((id) => world.characters[id])
    .filter(Boolean)
    .map((c) => `${c.name} — ${c.charClass} L${c.level}, ${c.personality.join(', ') || 'plain'}; ${c.description}`);
  const loc = world.locations[scene.location];
  const recent = world.events.slice(-14).map((e) => `- [Day ${e.time.day}] ${e.summary}`);
  const ordered = [...world.scenes].sort((a, b) => a.chapter - b.chapter || a.order - b.order);
  const prevIdx = ordered.findIndex((s) => s.id === scene.id) - 1;
  const prevTail = prevIdx >= 0 ? ordered[prevIdx].text.replace(/\s+$/, '').slice(-600) : '';
  return [
    {
      role: 'system',
      content:
        `You are drafting one scene of a gritty LitRPG novel set in Blackwall City, in close third person past tense, POV ${world.characters[scene.pov]?.name ?? 'the protagonist'}. ` +
        `Spare, concrete prose; period voice; dialogue that earns its place. 400–700 words. ` +
        `Use ONLY the facts provided — invent texture (weather on skin, sounds, small gestures), never events, items, wounds, or coin that the simulation did not report. ` +
        `${ANTI_TIC_PROMPT} ` +
        `Output only the scene prose, no headings or commentary.`,
    },
    {
      role: 'user',
      content: [
        `SCENE: "${scene.title}" — Day ${scene.day}, ${fmtTime({ day: scene.day, minute: scene.startMinute })}, ${calendarLabel(scene.day)}${world.weather ? `, weather: ${world.weather.kind}` : ''}.`,
        `LOCATION: ${loc?.name ?? scene.location} — ${loc?.description ?? ''} ${loc?.atmosphere ?? ''}`,
        `CHARACTERS PRESENT:\n${participants.join('\n')}`,
        prevTail ? `THE PREVIOUS SCENE ENDED:\n…${prevTail}` : '',
        `RECENT SIMULATION EVENTS (the facts):\n${recent.join('\n')}`,
        `AUTHOR'S OUTLINE FOR THIS SCENE:\n${outline}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

export async function draftScene(cfg: LlmConfig, world: WorldState, scene: Scene, outline: string): Promise<string> {
  const reply = await chatWithNpc({ ...cfg, temperature: 0.7 }, buildDraftPrompt(world, scene, outline));
  return reply.trim();
}

// ---------- polish ----------
/**
 * Line-edit a passage. Facts, names, plot, and @[Name](ID) tokens must
 * survive untouched; only wording improves. Returns the suggestion.
 */
export async function polishText(cfg: LlmConfig, passage: string, styleHint: string): Promise<string> {
  const reply = await chatWithNpc({ ...cfg, temperature: 0.4 }, [
    {
      role: 'system',
      content:
        `You are a fiction line editor. Polish the passage: tighten wording, fix grammar, improve rhythm. ` +
        `PRESERVE the author's voice, all facts, names, plot beats, and every @[Name](ID) token EXACTLY as written. ` +
        `Do not add new events or details. ${styleHint ? `Style guidance: ${styleHint}. ` : ''}` +
        `${ANTI_TIC_PROMPT} Do not introduce these constructions where the author has none; where the passage already leans on them, replace the excess with what is actually there. ` +
        `Output ONLY the polished passage, no commentary.`,
    },
    { role: 'user', content: passage },
  ]);
  return reply.trim();
}

/** The last paragraph of a text — the default polish target. */
export function lastParagraph(text: string): { start: number; end: number; text: string } | null {
  const trimmedEnd = text.replace(/\s+$/, '');
  if (!trimmedEnd) return null;
  const idx = trimmedEnd.lastIndexOf('\n\n');
  const start = idx < 0 ? 0 : idx + 2;
  const para = trimmedEnd.slice(start);
  if (para.trim().length < 40) return null; // too short to bother
  return { start, end: trimmedEnd.length, text: para };
}
