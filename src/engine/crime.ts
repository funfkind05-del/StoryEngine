// Crime, justice, and heat. Blackwall finally lets you be what half
// its population is. Pickpocketing and burglary use the stealth and
// lockpicking skills (and train them); witnessed crimes raise the
// Watch's bounty; carry enough heat onto Watch turf and a patrol
// corners you — pay, resist, run, or take the cells. Stolen goods
// only move through fences.

import type { WorldState } from './types';
import { Rng, randomSeed } from './rng';
import { addMinutes, logEvent, partyMembers, relationshipBetween } from './world';
import { addToContainer, fmtMoney, makeItem } from './rules';
import { trainSkill } from './progression';

export const ARREST_THRESHOLD = 100; // copper of bounty before patrols care

/** Lift a purse. Trains stealth either way. */
export function pickpocket(world: WorldState, targetId: string): string | null {
  const mc = world.characters[world.mcId];
  const target = world.characters[targetId];
  if (!target || !target.alive) return 'No mark.';
  if (target.location !== world.partyLocation) return 'They are not here.';
  if (target.inParty) return 'Robbing your own party is a different genre.';
  const rng = new Rng(randomSeed());
  addMinutes(world, 10);
  trainSkill(world, mc, 'stealth');
  const roll = rng.die(20) + mc.skills.stealth + Math.floor((mc.attributes.dexterity - 10) / 2);
  const difficulty = 12 + Math.floor(target.attributes.wisdom / 3) + target.level;
  if (roll >= difficulty) {
    const take = Math.max(1, Math.floor(target.money * (0.1 + rng.next() * 0.25)));
    target.money -= take;
    mc.money += take;
    logEvent(world, 'crime.pickpocket', { target: target.id, take, roll }, `${mc.name} lifted ${fmtMoney(take)} from ${target.name}'s purse, clean. (roll ${roll})`, { location: world.partyLocation });
    return null;
  }
  // caught
  const fine = 30 + target.level * 10;
  world.bounty = (world.bounty ?? 0) + fine;
  const rel = relationshipBetween(world, target.id, mc.id);
  rel.trust = Math.max(-10, rel.trust - 3);
  rel.respect = Math.max(-10, rel.respect - 2);
  target.memories.push({ subject: mc.id, event: `${mc.name} tried to pick my pocket.`, importance: 7, emotionalValue: -6, day: world.time.day });
  logEvent(world, 'crime.caught', { target: target.id, fine, roll }, `${target.name} caught ${mc.name}'s hand in their purse. Word will reach the Watch — bounty +${fmtMoney(fine)} (now ${fmtMoney(world.bounty)}).`, { location: world.partyLocation, witnesses: [target.id] });
  return `Caught. ${target.name} will remember, and the Watch will hear.`;
}

/** Break into a shop after dark. Trains lockpicking and stealth. */
export function burgleShop(world: WorldState, locId: string): string | null {
  const loc = world.locations[locId];
  const mc = world.characters[world.mcId];
  if (!loc?.shop) return 'Nothing here worth breaking into.';
  if (world.partyLocation !== locId) return 'You have to be there.';
  const hour = Math.floor(world.time.minute / 60);
  if (hour >= 6 && hour < 21) return 'In daylight? The shutters are open and so are eyes.';
  const rng = new Rng(randomSeed());
  addMinutes(world, 30);
  trainSkill(world, mc, 'lockpicking');
  trainSkill(world, mc, 'stealth');
  const watch = loc.factionInfluence['FAC_WATCH'] ?? 0;
  const roll = rng.die(20) + mc.skills.lockpicking + mc.skills.stealth;
  const difficulty = 16 + watch;
  if (roll >= difficulty) {
    const stock = loc.shop.stock.filter((s) => s.qty > 0);
    const taken: string[] = [];
    let coin = rng.int(10, 60);
    for (let i = 0; i < Math.min(2, stock.length); i++) {
      const entry = rng.pick(stock);
      if (entry.qty <= 0) continue;
      entry.qty -= 1;
      const item = makeItem(world, entry.proto, 1);
      item.stolen = true;
      item.history.push(`Stolen from ${loc.name} on Day ${world.time.day}`);
      addToContainer(world, item, mc);
      taken.push(item.name);
    }
    mc.money += coin;
    logEvent(world, 'crime.burglary', { shop: locId, taken, coin }, `${mc.name} went through ${loc.name} in the dark: ${fmtMoney(coin)}${taken.length ? ` and ${taken.join(', ')}` : ''}. Nobody saw. Yet.`, { location: locId });
    return null;
  }
  const fine = 150 + watch * 20;
  world.bounty = (world.bounty ?? 0) + fine;
  logEvent(world, 'crime.caught', { shop: locId, fine, roll }, `A lamp, a shout, a whistle — ${mc.name} was seen at ${loc.name}'s shutters. Bounty +${fmtMoney(fine)} (now ${fmtMoney(world.bounty)}).`, { location: locId });
  // sometimes the Watch is close enough to matter right now
  if (rng.chance(0.4)) queueArrest(world, rng);
  return 'Seen. Move.';
}

/** Roll a patrol stop after travel when carrying heat on Watch turf. */
export function maybePatrolStop(world: WorldState): boolean {
  const bounty = world.bounty ?? 0;
  if (bounty < ARREST_THRESHOLD || world.pendingArrest || world.combat || world.currentDungeon) return false;
  const loc = world.locations[world.partyLocation];
  const watch = loc?.factionInfluence['FAC_WATCH'] ?? 0;
  if (watch < 4) return false;
  const rng = new Rng(randomSeed());
  if (!rng.chance(Math.min(0.5, (bounty / 1000) + watch * 0.04))) return false;
  queueArrest(world, rng);
  return true;
}

function queueArrest(world: WorldState, rng: Rng) {
  const officers = Math.min(4, 1 + Math.floor((world.bounty ?? 0) / 200));
  world.pendingArrest = { seed: rng.fork(), officers };
  logEvent(world, 'crime.patrol', { officers, bounty: world.bounty }, `A Watch patrol — ${officers} of them — steps out of the crowd. "That's the one. Bounty says ${fmtMoney(world.bounty ?? 0)}."`, { location: world.partyLocation });
}

/** Pay the patrol off: bounty + a fifth for their trouble. */
export function arrestPay(world: WorldState): string | null {
  const arrest = world.pendingArrest;
  if (!arrest) return 'No one is asking.';
  const mc = world.characters[world.mcId];
  const due = Math.ceil((world.bounty ?? 0) * 1.2);
  if (mc.money < due) return `They want ${fmtMoney(due)} — bounty plus a fifth for the walk over. You don't have it.`;
  mc.money -= due;
  world.bounty = 0;
  world.pendingArrest = null;
  logEvent(world, 'crime.fined', { paid: due }, `${mc.name} paid the patrol ${fmtMoney(due)} and the ledger closed. For now.`, { location: world.partyLocation });
  return null;
}

/** Fight the Watch: combat, deeper bounty, the Watch remembers. */
export function arrestResist(world: WorldState): string | null {
  const arrest = world.pendingArrest;
  if (!arrest) return 'No one is asking.';
  world.pendingArrest = null;
  world.bounty = (world.bounty ?? 0) + 200 * arrest.officers;
  for (const c of partyMembers(world)) {
    c.factionReputation['FAC_WATCH'] = Math.max(-10, (c.factionReputation['FAC_WATCH'] ?? 0) - 2);
  }
  world.pendingEncounter = {
    seed: arrest.seed,
    description: `${arrest.officers} City Watchmen`,
    monsters: [{ templateKey: 'city-watchman', count: arrest.officers }],
    source: 'city',
    locationId: world.partyLocation,
  };
  logEvent(world, 'crime.resist', { officers: arrest.officers, bounty: world.bounty }, `Steel came out against the Watch. Whatever happens next, the bounty just became a story (${fmtMoney(world.bounty)}), and the Watch does not forget its own.`, { location: world.partyLocation });
  return null;
}

/** Run for it: DEX and stealth against the patrol. */
export function arrestFlee(world: WorldState): string | null {
  const arrest = world.pendingArrest;
  if (!arrest) return 'No one is asking.';
  const mc = world.characters[world.mcId];
  const rng = new Rng(arrest.seed);
  trainSkill(world, mc, 'stealth');
  const roll = rng.die(20) + mc.skills.stealth + Math.floor((mc.attributes.dexterity - 10) / 2);
  if (roll >= 12 + arrest.officers * 2) {
    world.pendingArrest = null;
    world.bounty = (world.bounty ?? 0) + 50; // fleeing is noted
    addMinutes(world, 20);
    logEvent(world, 'crime.fled', { roll }, `The party scattered through the alleys and lost the patrol. The bounty ticks up for the insolence (+${fmtMoney(50)}).`, { location: world.partyLocation });
    return null;
  }
  logEvent(world, 'crime.cornered', { roll }, `The alley ended in a wall and the patrol was patient. (roll ${roll})`, { location: world.partyLocation });
  return arrestResist(world) === null ? 'Cornered — it comes to steel.' : null;
}

/** Take the cells: two days, the fine from whatever you carry, stolen goods confiscated. */
export function arrestSurrender(world: WorldState): string | null {
  const arrest = world.pendingArrest;
  if (!arrest) return 'No one is asking.';
  const mc = world.characters[world.mcId];
  world.pendingArrest = null;
  // stolen goods confiscated
  const confiscated: string[] = [];
  for (const iid of [...mc.inventory, ...world.partyInventory]) {
    const it = world.items[iid];
    if (it?.stolen) {
      mc.inventory = mc.inventory.filter((x) => x !== iid);
      world.partyInventory = world.partyInventory.filter((x) => x !== iid);
      it.owner = null;
      it.history.push(`Confiscated by the Watch on Day ${world.time.day}`);
      confiscated.push(it.name);
    }
  }
  const paid = Math.min(mc.money, world.bounty ?? 0);
  mc.money -= paid;
  world.bounty = 0;
  const days = 2;
  for (let i = 0; i < days; i++) {
    addMinutes(world, 1440);
  }
  world.time.minute = 8 * 60;
  for (const c of partyMembers(world)) {
    c.needs.fatigue = 20;
    c.needs.hunger = 55; // cell gruel
  }
  logEvent(world, 'crime.jailed', { days, paid, confiscated }, `${mc.name} spent ${days} days in the Ironmarket cells. ${fmtMoney(paid)} went to fines${confiscated.length ? `; the Watch kept ${confiscated.join(', ')}` : ''}. The ledger is clean and the cot was worse than any doorway.`, { location: world.partyLocation, witnesses: partyMembers(world).map((c) => c.id) });
  return null;
}

/** Square the ledger voluntarily at the watch-house. */
export function payBountyAt(world: WorldState, locId: string): string | null {
  const bounty = world.bounty ?? 0;
  if (bounty <= 0) return 'The ledger holds nothing against you.';
  const loc = world.locations[locId];
  if ((loc?.factionInfluence['FAC_WATCH'] ?? 0) < 4) return 'No watch-house desk here.';
  const mc = world.characters[world.mcId];
  if (mc.money < bounty) return `The ledger says ${fmtMoney(bounty)}.`;
  mc.money -= bounty;
  world.bounty = 0;
  addMinutes(world, 30);
  logEvent(world, 'crime.paid', { paid: bounty }, `${mc.name} paid the ledger down at the watch-house desk: ${fmtMoney(bounty)}, no questions kept.`, { location: locId });
  return null;
}
