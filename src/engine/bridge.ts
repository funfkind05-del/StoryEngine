// The Narrative Bridge: converts structured simulation records into
// editable prose drafts. Hard rule: it never invents a result that
// did not occur in the simulation. Misses stay misses; the killing
// blow belongs to whoever actually landed it. The author edits the
// draft freely afterwards — that editing never touches sim state.

import type { CombatLogEntry, SimEvent, WorldState } from './types';
import { Rng } from './rng';
import { fmtWhen } from './world';

const HIT_VERBS = ['caught', 'struck', 'ripped into', 'slammed into', 'tore across', 'hammered', 'bit into'];
const MISS_TEXT = [
  '{A} swung at {T} and found only air.',
  '{A} lunged, but {T} twisted aside.',
  '{A} struck too slow; {T} slipped the blow.',
  '{A} attacked {T} and missed.',
];
const CRIT_TEXT = [
  '{A} found the opening and drove the blow home — {T} reeled from the wound.',
  '{A} caught {T} clean, a strike that would have felled something twice its size.',
];
const DEATH_TEXT = [
  '{T} collapsed and did not move again.',
  '{T} dropped where it stood.',
  'The life went out of {T} before it hit the floor.',
];

function fill(tpl: string, a: string, t: string): string {
  return tpl.replace(/\{A\}/g, a).replace(/\{T\}/g, t);
}

/**
 * Layer 3: prose draft from the canonical combat log.
 * Deterministic for a given (log, seed) pair, so REGENERATE with a new
 * seed re-words the scene without changing any fact.
 */
export function combatToProse(entries: CombatLogEntry[], seed: number): string {
  const rng = new Rng(seed);
  const paras: string[] = [];
  let currentRound = 0;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) paras.push(lines.join(' '));
    lines = [];
  };
  for (const e of entries) {
    if (e.round !== currentRound) {
      flush();
      currentRound = e.round;
    }
    switch (e.result) {
      case 'miss':
        lines.push(fill(rng.pick(MISS_TEXT), e.actorName, e.targetName ?? 'its target'));
        break;
      case 'hit': {
        if (e.action === 'attack' || e.action === 'skill' || e.action === 'spell') {
          const via = e.detail && e.detail !== 'attack' ? ` with ${e.detail.toLowerCase() === e.detail ? 'the ' + e.detail : e.detail}` : '';
          lines.push(`${e.actorName} ${rng.pick(HIT_VERBS)} ${e.targetName}${via} — ${e.damage} damage.`);
          if (e.statusApplied) lines.push(`${e.targetName} staggered, stunned.`);
        }
        break;
      }
      case 'crit':
        lines.push(fill(rng.pick(CRIT_TEXT), e.actorName, e.targetName ?? 'the enemy') + ` (${e.damage} damage.)`);
        break;
      case 'death':
        lines.push(fill(rng.pick(DEATH_TEXT), '', e.actorName));
        break;
      case 'defend':
        if (e.detail === 'stunned') lines.push(`${e.actorName} stood senseless, the world ringing.`);
        else lines.push(`${e.actorName} gave ground, guard high, waiting.`);
        break;
      case 'heal':
        lines.push(`${e.actorName} ${e.action === 'spell' ? `worked ${e.detail} over` : `pressed ${e.detail} on`} ${e.targetName} — ${e.damage} points of hurt undone.`);
        break;
      case 'flee-success':
        lines.push(e.actor.startsWith('MON') ? `${e.actorName} broke and ran, vanishing into the dark.` : `${e.actorName} called the retreat, and the party ran for it — and made it.`);
        break;
      case 'flee-fail':
        lines.push(`${e.actorName} looked for a way out and found none.`);
        break;
      case 'status':
        lines.push(`${e.actorName} lost the moment, still dazed.`);
        break;
      case 'info':
        if (e.detail === 'victory' || e.detail === 'defeat') {
          flush();
          paras.push(e.detail === 'victory' ? 'Then it was over. The quiet after was almost worse than the noise.' : 'Then the ground came up, and the dark closed in.');
        } else {
          lines.push(e.text);
        }
        break;
    }
  }
  flush();
  return paras.join('\n\n');
}

/** Layer 2: the factual author log, one line per action. */
export function combatToAuthorLog(entries: CombatLogEntry[]): string {
  const out: string[] = [];
  let round = 0;
  for (const e of entries) {
    if (e.round !== round) {
      round = e.round;
      out.push(`--- ROUND ${round} ---`);
    }
    out.push(e.text);
  }
  return out.join('\n');
}

/** Prose-note draft for a batch of ordinary sim events. */
export function eventsToNotes(_world: WorldState, events: SimEvent[]): string {
  return events.map((e) => `[${fmtWhen(e.time)}] ${e.summary}`).join('\n');
}

const TRAVEL_TEXT = [
  '{MC} led the way to {DEST}.',
  'They made for {DEST}.',
  '{MC} set out for {DEST}.',
  'The party moved on to {DEST}.',
  'From there it was a short walk to {DEST}.',
  '{MC} took them through the streets to {DEST}.',
];

/**
 * One editable prose sentence for a completed travel action. The
 * destination is embedded as an @[Name](ID) token so the reference
 * survives renames and the continuity checker can resolve it.
 */
export function travelSentence(world: WorldState, destId: string, seed: number): string {
  const rng = new Rng(seed);
  const dest = world.locations[destId];
  const mc = world.characters[world.mcId];
  const token = `@[${dest?.name ?? destId}](${destId})`;
  return rng.pick(TRAVEL_TEXT).replace('{MC}', mc?.name ?? 'The party').replace('{DEST}', token);
}
