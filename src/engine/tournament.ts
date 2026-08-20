// Competitions & tournaments. The Pit Trials run every 30th day —
// three escalating bouts, one champion, a purse and a name. Festival
// days bring skill contests: archery at the Revel, song at the Vigil.
// All of it feeds the ledger of things worth writing chapters about.

import type { WorldState } from './types';
import { Rng, randomSeed } from './rng';
import { fmtMoney } from './rules';
import { addMinutes, logEvent, partyMembers } from './world';
import { trainSkill } from './progression';
import { festivalToday } from './festivals';

export const PIT_TRIALS_EVERY = 30;
export const PIT_LOCATION = 'LOC_FIGHTPIT';
export const PIT_ENTRY_FEE = 100; // copper
const ROUND_PURSES = [300, 800, 2500];
const ROUND_FOES: { templateKey: string; count: number }[][] = [
  [{ templateKey: 'pit-bruiser', count: 2 }],
  [{ templateKey: 'pit-bruiser', count: 2 }, { templateKey: 'street-thug', count: 1 }],
  [{ templateKey: 'pit-champion', count: 1 }],
];

export function isPitTrialsDay(world: WorldState): boolean {
  return world.time.day > 0 && world.time.day % PIT_TRIALS_EVERY === 0;
}

/** Sign the party up. The Trials are three bouts back to back. */
export function enterPitTrials(world: WorldState): string | null {
  if (world.partyLocation !== PIT_LOCATION) return 'The Trials run at the Pit of Honest Work.';
  if (!isPitTrialsDay(world)) return `No Trials today — the Pit runs its card every ${PIT_TRIALS_EVERY}th day.`;
  if (world.tournament) return 'The party is already on the card.';
  if (world.pendingEncounter || world.combat) return 'Finish what you started first.';
  const mc = world.characters[world.mcId];
  if ((world.tournamentDaysWon ?? []).includes(world.time.day)) return 'The party already took today’s purse. Come back next card.';
  if (mc.money < PIT_ENTRY_FEE) return `Entry is ${fmtMoney(PIT_ENTRY_FEE)}, paid at the rope.`;
  mc.money -= PIT_ENTRY_FEE;
  world.tournament = { day: world.time.day, round: 1, purse: 0 };
  queueRound(world);
  logEvent(world, 'tournament.enter', { day: world.time.day }, `${mc.name} paid the rope-fee and took the party onto the Pit Trials card. Three bouts. The bookmaker gave odds it would be embarrassing.`, { location: PIT_LOCATION, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

function queueRound(world: WorldState): void {
  const t = world.tournament!;
  const foes = ROUND_FOES[t.round - 1];
  world.pendingEncounter = {
    seed: randomSeed(),
    description: `Pit Trials, bout ${t.round} of 3`,
    monsters: foes.map((f) => ({ ...f })),
    source: 'city',
    locationId: PIT_LOCATION,
  };
}

/** Called after combat settles: advance, pay out, or scratch. */
export function settleTournament(world: WorldState, outcome: string): void {
  const t = world.tournament;
  if (!t) return;
  const mc = world.characters[world.mcId];
  if (outcome !== 'victory') {
    world.tournament = null;
    logEvent(world, 'tournament.out', { round: t.round }, `The party went out of the Trials in bout ${t.round}. The crowd was kind, which stings worse.`, { location: PIT_LOCATION });
    return;
  }
  const purse = ROUND_PURSES[t.round - 1];
  t.purse += purse;
  mc.money += purse;
  if (t.round >= 3) {
    world.tournament = null;
    world.tournamentDaysWon = [...(world.tournamentDaysWon ?? []), world.time.day];
    mc.title = 'Champion of the Pit';
    for (const c of partyMembers(world)) {
      c.factionReputation['FAC_REDKNIVES'] = Math.min(10, (c.factionReputation['FAC_REDKNIVES'] ?? 0) + 1);
      c.factionReputation['FAC_TIDECOURT'] = Math.min(10, (c.factionReputation['FAC_TIDECOURT'] ?? 0) + 1);
    }
    logEvent(world, 'tournament.champion', { day: t.day, purse: t.purse }, `Three bouts, three hammers of crowd-noise: the party took the Pit Trials. ${fmtMoney(t.purse)} in purses, and ${mc.name} leaves as Champion of the Pit.`, { location: PIT_LOCATION, witnesses: partyMembers(world).map((c) => c.id) });
    return;
  }
  t.round += 1;
  queueRound(world);
  logEvent(world, 'tournament.advance', { round: t.round, purse }, `Bout won — ${fmtMoney(purse)} in the purse. The rope lifts for bout ${t.round}.`, { location: PIT_LOCATION });
}

// ---------- festival skill contests ----------
/** Archery butts at the Founding Revel / Salt Blessing: three flights. */
export function contestArchery(world: WorldState, charId: string): string | null {
  const f = festivalToday(world);
  if (!f || !f.marketDay) return 'The butts only go up on festival days.';
  const c = world.characters[charId];
  if (!c || !c.inParty || !c.alive) return 'Pick a shooter from the party.';
  if ((world.contestsWon ?? []).includes(`archery:${world.time.day}`)) return 'One trophy per festival — leave some ribbon for the locals.';
  const rng = new Rng(randomSeed());
  addMinutes(world, 60);
  trainSkill(world, c, 'archery');
  let hits = 0;
  const rolls: number[] = [];
  for (const dc of [10, 14, 18]) {
    const roll = rng.die(20) + c.skills.archery + Math.floor((c.attributes.dexterity - 10) / 2);
    rolls.push(roll);
    if (roll >= dc) hits += 1;
  }
  if (hits >= 3) {
    const prize = 400;
    world.characters[world.mcId].money += prize;
    world.contestsWon = [...(world.contestsWon ?? []), `archery:${world.time.day}`];
    logEvent(world, 'contest.archery', { charId, hits, prize }, `${c.name} shot the ${f.name} butts clean — three flights, three golds, ${fmtMoney(prize)} and the ribbon. (rolls ${rolls.join('/')})`, { witnesses: partyMembers(world).map((x) => x.id) });
    return null;
  }
  logEvent(world, 'contest.archery', { charId, hits }, `${c.name} took ${hits} of 3 flights at the ${f.name} butts. The ribbon went elsewhere. (rolls ${rolls.join('/')})`);
  return `${hits} of 3 flights — no ribbon this year.`;
}

/** The song contest at the Vigil and the Revel: charisma against the room. */
export function contestSong(world: WorldState, charId: string): string | null {
  const f = festivalToday(world);
  if (!f || !f.heartsOpen) return 'The song contest waits for a festival with hearts in it.';
  const c = world.characters[charId];
  if (!c || !c.inParty || !c.alive) return 'Pick a singer from the party.';
  if ((world.contestsWon ?? []).includes(`song:${world.time.day}`)) return 'The stage is done for the night.';
  const rng = new Rng(randomSeed());
  addMinutes(world, 90);
  const roll = rng.die(20) + Math.floor((c.attributes.charisma - 10) / 2) + (c.charClass === 'bard' ? 4 : 0) + Math.floor(c.skills.streetwise / 3);
  if (roll >= 18) {
    const prize = 300;
    world.characters[world.mcId].money += prize;
    world.contestsWon = [...(world.contestsWon ?? []), `song:${world.time.day}`];
    for (const other of partyMembers(world)) {
      if (other.id === c.id) continue;
      const rel = other.relationships[c.id] ?? { affection: 0, trust: 0, respect: 0, attraction: 0, commitment: 0 };
      rel.affection = Math.min(10, rel.affection + 1);
      other.relationships[c.id] = rel;
    }
    logEvent(world, 'contest.song', { charId, roll, prize }, `${c.name} took the ${f.name} stage and held the whole room in one long-drawn breath. ${fmtMoney(prize)}, the wreath, and every eye in the party a little changed. (roll ${roll})`, { witnesses: partyMembers(world).map((x) => x.id) });
    return null;
  }
  logEvent(world, 'contest.song', { charId, roll }, `${c.name} sang at the ${f.name} and the room was polite, which is its own review. (roll ${roll})`);
  return 'The room was polite. Polite is a loss.';
}
