// Companion-initiated moments: sometimes a companion wants a word —
// driven by their state (wounds, hunger, unspoken feelings, readiness
// to train, their values against recent events), not by the author.
// A moment is only an invitation: the author can hear them out (an
// LLM conversation opens with the companion speaking first) or wave
// them off. Nothing is canon until the conversation is kept.

import type { Character, CharacterId, GameLocation, WorldState } from './types';
import { Rng } from './rng';
import { logEvent, partyMembers } from './world';
import { levelUpAvailable } from './rules';
import { haremMomentHook } from './romance';
import { banterTopic } from './banter';

export interface CompanionMoment {
  npcId: CharacterId;
  /** what's on their mind — steers the LLM's opening line */
  hook: string;
  /** short teaser for the banner */
  teaser: string;
  /** set when this is a two-companion banter the MC overhears */
  banterWith?: CharacterId;
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
  const harem = haremMomentHook(world, cid);
  if (harem) out.push({ weight: 5, hook: harem.hook, teaser: harem.teaser });
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
  // sometimes it's two of them, and the MC just overhears
  if (companions.length >= 2 && rng.chance(0.35)) {
    const a = rng.pick(companions);
    const b = rng.pick(companions.filter((x) => x.id !== a.id));
    const t = banterTopic(world, a, b, rng);
    world.lastMomentDay = world.time.day;
    world.pendingMoment = { npcId: a.id, banterWith: b.id, hook: t.topic, teaser: t.teaser };
    return world.pendingMoment;
  }
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


// ---------- first-sight color: companions react to places ----------
const SIGHT_TYPES = new Set(['guildhall', 'temple', 'market', 'dungeon-entrance', 'landmark', 'dock']);

function sightLine(c: Character, loc: GameLocation, rng: Rng): string {
  const v = c.values[0] ?? 'loyalty';
  const danger = loc.dangerRating >= 6;
  const byValue: Record<string, string[]> = {
    faith: [`${c.name} touches two fingers to her lips at ${loc.name}, an old ward, half-embarrassed.`, `${c.name} goes quiet at ${loc.name} the way people do in doorways of things they used to believe.`],
    cunning: [`${c.name} clocks every exit of ${loc.name} inside ten steps, then pretends she didn't.`, `${c.name} prices ${loc.name} at a glance — the stock, the locks, the take.`],
    kindness: [`${c.name} finds the most tired person at ${loc.name} without trying. She always does.`, `${c.name} slips something small to a child near ${loc.name} and dares you with a look to mention it.`],
    courage: [`${c.name} squares up slightly at ${loc.name}, weight forward, an old habit shaking itself awake.`, `${c.name} looks at ${loc.name} like it owes her a fight.`],
    freedom: [`${c.name} checks the rooflines of ${loc.name} first. Ways up are ways out.`, `${c.name} stands a little looser at ${loc.name} — some places don't close in.`],
    order: [`${c.name} reads ${loc.name} like a ledger: what's maintained, what's let go, who's responsible.`, `${c.name} straightens a leaning signpost at ${loc.name} without breaking stride.`],
    wealth: [`${c.name} appraises ${loc.name} in silver per season, out of habit.`, `${c.name} notes who at ${loc.name} carries real coin. It's never who's loudest.`],
    loyalty: [`${c.name} marks where everyone in the party is before she looks at ${loc.name} itself.`, `${c.name} files ${loc.name} away: good ground, bad ground, where she'd stand if it went wrong.`],
    honesty: [`${c.name} says exactly what she thinks of ${loc.name}, unprompted, at conversational volume.`, `${c.name} looks at ${loc.name} and doesn't perform anything at all. It's restful.`],
  };
  const pool = byValue[v] ?? byValue.loyalty;
  const line = rng.pick(pool);
  return danger ? `${line} Her hand stays near her weapon the whole time.` : line;
}

/** First time a companion sees a notable place, they say who they are. */
export function maybeCompanionSight(world: WorldState): void {
  const loc = world.locations[world.partyLocation];
  if (!loc) return;
  if (!SIGHT_TYPES.has(loc.type) && loc.dangerRating < 6) return;
  world.companionSights ??= {};
  const companions = partyMembers(world).filter((c) => !c.isMC && c.alive);
  const fresh = companions.filter((c) => !world.companionSights![`${c.id}:${loc.id}`]);
  if (!fresh.length) return;
  const rng = new Rng((world.masterSeed ^ (world.time.day * 524287 + world.time.minute * 31 + loc.id.length)) >>> 0);
  if (!rng.chance(0.5)) return; // not every arrival is a moment
  const c = rng.pick(fresh);
  world.companionSights[`${c.id}:${loc.id}`] = true;
  const line = sightLine(c, loc, rng);
  c.memories.push({ subject: world.mcId, event: `First time I saw ${loc.name} with the party.`, importance: 3, emotionalValue: 1, day: world.time.day });
  logEvent(world, 'companion.sight', { character: c.id, location: loc.id }, line, { location: loc.id, witnesses: partyMembers(world).map((x) => x.id) });
}
