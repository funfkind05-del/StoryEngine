// Companion-initiated moments: sometimes a companion wants a word —
// driven by their state (wounds, hunger, unspoken feelings, readiness
// to train, their values against recent events), not by the author.
// A moment is only an invitation: the author can hear them out (an
// LLM conversation opens with the companion speaking first) or wave
// them off. Nothing is canon until the conversation is kept.

import type { CharacterId, WorldState } from './types';
import { Rng } from './rng';
import { levelUpAvailable } from './rules';

export interface CompanionMoment {
  npcId: CharacterId;
  /** what's on their mind — steers the LLM's opening line */
  hook: string;
  /** short teaser for the banner */
  teaser: string;
}

interface Candidate {
  weight: number;
  hook: string;
  teaser: string;
}

function candidatesFor(world: WorldState, cid: CharacterId): Candidate[] {
  const c = world.characters[cid];
  const mc = world.characters[world.mcId];
  const rel = c.relationships[world.mcId];
  const out: Candidate[] = [];
  if (c.hp.current < c.hp.max * 0.5) {
    out.push({ weight: 3, hook: `Your wounds are bad and it has you thinking about whether this life is worth what it costs. Raise it with ${mc.name} — in your own way.`, teaser: 'about the wounds' });
  }
  if (rel && rel.attraction >= 4 && rel.affection >= 3 && rel.commitment < 5) {
    out.push({ weight: 4, hook: `Something unspoken has been growing between you and ${mc.name}. You've decided to say something — or almost say it, if saying it plainly isn't your way.`, teaser: 'something on their mind' });
  }
  if (rel && rel.trust <= -2) {
    out.push({ weight: 4, hook: `Your trust in ${mc.name} is damaged and you can't carry it silently anymore. Have it out.`, teaser: 'wants to have it out' });
  }
  if (levelUpAvailable(c)) {
    out.push({ weight: 2, hook: `You've earned enough to train for your next level and you're restless about it. Tell ${mc.name} you want to visit your trainer — and what getting stronger means to you.`, teaser: 'restless to train' });
  }
  if (world.needsEnabled && c.needs.hunger >= 60) {
    out.push({ weight: 2, hook: `You are hungry and past pretending otherwise. Complain to ${mc.name} — with whatever humor or edge fits you.`, teaser: 'about food, pointedly' });
  }
  const recentDefeat = world.events.slice(-15).some((e) => e.kind === 'party.defeated' || (e.kind === 'combat.end' && String(e.data.outcome) === 'defeat'));
  if (recentDefeat) {
    out.push({ weight: 4, hook: `The party was recently beaten badly. Through the lens of what you value (${c.values.join(', ')}), tell ${mc.name} what you think went wrong.`, teaser: 'about the defeat' });
  }
  const recentBoss = world.events.slice(-15).some((e) => e.kind === 'combat.end' && /warden|king/i.test(String(e.data.log ? '' : '')) === false && String(e.summary).includes('victory'));
  if (recentBoss && c.values.includes('courage')) {
    out.push({ weight: 1, hook: `The recent fight is still in your blood. Share a war story from your past that it reminded you of.`, teaser: 'in a storytelling mood' });
  }
  // always available, low weight: their past
  out.push({ weight: 1, hook: `A memory from your past surfaced today. Share a piece of it with ${mc.name} — the piece you can bear to.`, teaser: 'thinking about the past' });
  return out;
}

/**
 * Maybe generate a companion moment. Call after time passes; fires at
 * most once per in-world day, ~1 in 4 evaluations.
 */
export function maybeCompanionMoment(world: WorldState): CompanionMoment | null {
  if (world.pendingMoment || world.combat || world.pendingEncounter) return null;
  if (world.lastMomentDay === world.time.day) return null;
  const companions = Object.values(world.characters).filter((c) => c.inParty && c.alive && !c.isMC);
  if (!companions.length) return null;
  const rng = new Rng((world.masterSeed ^ (world.time.day * 131071 + world.time.minute)) >>> 0);
  if (!rng.chance(0.25)) return null;
  const c = rng.pick(companions);
  const cands = candidatesFor(world, c.id);
  const total = cands.reduce((s, x) => s + x.weight, 0);
  let at = rng.next() * total;
  for (const cand of cands) {
    at -= cand.weight;
    if (at <= 0) {
      world.lastMomentDay = world.time.day;
      world.pendingMoment = { npcId: c.id, hook: cand.hook, teaser: cand.teaser };
      return world.pendingMoment;
    }
  }
  return null;
}
