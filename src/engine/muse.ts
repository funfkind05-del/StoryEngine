// The Muse: mines the simulation for latent story material and turns
// it into grounded, citable ideas. No invention — every idea lists
// the sim facts it stands on. The LLM layer (developIdea) expands a
// hook into scene directions; the deterministic layer works offline.
//
// This is where knowledge separation pays off twice: the engine can
// see exactly which character knows what the others don't — which is
// most of what plot is made of.

import type { Character, Quest, WorldState } from './types';
import { CLASSES, calendarLabel, fmtMoney, levelUpAvailable, seasonOf } from './rules';
import { questProgress } from './quests';
import { latestRevelation, mainQuests } from './campaign';
import { livingRivals } from './rivals';
import { chatWithNpc, type ChatMessage, type LlmConfig } from './npcChat';

export interface StoryIdea {
  kind: string;
  title: string;
  pitch: string; // one-paragraph editable idea
  grounding: string[]; // the sim facts this stands on
  urgency: number; // higher = more pressing
  /** ready-to-use outline for the Draft Scene tool */
  outline: string;
}

function allSceneText(world: WorldState): string {
  return world.scenes.map((s) => s.text).join('\n');
}

function partyOf(world: WorldState): Character[] {
  return Object.values(world.characters).filter((c) => c.inParty && c.alive);
}

// ---------- generators ----------

function secretIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  const mc = world.characters[world.mcId];
  const cast = Object.values(world.characters).filter((c) => c.persistent && c.alive && c.id !== mc.id);
  for (const c of cast) {
    const mcFacts = new Set(mc.knowledge.map((k) => k.fact));
    const secrets = c.knowledge.filter((k) => !mcFacts.has(k.fact)).slice(-3);
    if (!secrets.length) continue;
    const secret = secrets[secrets.length - 1];
    ideas.push({
      kind: 'secret',
      title: `What ${c.name} isn't telling ${mc.name}`,
      pitch: `${c.name} knows something ${mc.name} doesn't: "${secret.fact}"${secret.accurate ? '' : ' (and it may not even be true)'}. A scene could pry at it — a slip in conversation, a document out of place, a third party who mentions it — or set up the cost of the secret staying kept.`,
      grounding: [`${c.name}'s knowledge: ${secret.fact}`, `${mc.name} has no matching knowledge entry`],
      urgency: 6,
      outline: `${mc.name} gets close to something ${c.name} has been keeping: "${secret.fact}". ${c.name} deflects — how they deflect reveals character. End with ${mc.name} suspicious but not certain.`,
    });
  }
  return ideas.slice(0, 2);
}

function deadlineIdeas(world: WorldState): StoryIdea[] {
  return Object.values(world.quests)
    .filter((q) => q.status === 'active' && q.deadlineDay !== undefined && q.deadlineDay - world.time.day <= 2)
    .map((q) => ({
      kind: 'deadline',
      title: `"${q.title}" is nearly due`,
      pitch: `The job for ${giverName(world, q)} expires Day ${q.deadlineDay} — it is Day ${world.time.day} and the work stands at ${questProgress(world, q).done}/${q.objectives.length}. Late means half pay and a noted failure. A scene under time pressure writes itself: things go wrong, corners get cut, someone pays for the hurry.`,
      grounding: [`Quest "${q.title}" active, deadline Day ${q.deadlineDay}`, `Progress ${questProgress(world, q).done}/${q.objectives.length}`, `Today is Day ${world.time.day}`],
      urgency: 10,
      outline: `The party races to finish "${q.title}" before Day ${q.deadlineDay}. Something forces a hard choice between speed and safety.`,
    }));
}

function unfinishedIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  const ready = Object.values(world.quests).filter((q) => q.status === 'ready');
  for (const q of ready) {
    ideas.push({
      kind: 'unfinished',
      title: `Collect on "${q.title}"`,
      pitch: `The work is done but the coin hasn't changed hands. Turn-in scenes are where patrons show their true faces — ${giverName(world, q)} might pay clean, shortchange, or offer worse work as a compliment.`,
      grounding: [`Quest "${q.title}" complete, not yet turned in at ${world.locations[q.giverLocation]?.name}`],
      urgency: 7,
      outline: `The party returns to ${world.locations[q.giverLocation]?.name} to collect on "${q.title}". The payment comes with something unasked-for: an offer, a warning, or a new name.`,
    });
  }
  const declined = Object.values(world.quests).filter((q) => q.status === 'declined');
  if (declined.length) {
    const q = declined[declined.length - 1];
    ideas.push({
      kind: 'unfinished',
      title: `The job they turned down`,
      pitch: `The party declined "${q.title}". Someone else took it — and did it worse, or did it well and now stands where the party could have stood. Refusals have consequences in a small city.`,
      grounding: [`Quest "${q.title}" was declined on Day ${q.offeredDay}`],
      urgency: 3,
      outline: `News reaches the party of how "${q.title}" ended without them — and who profited.`,
    });
  }
  return ideas;
}

function dungeonIdeas(world: WorldState): StoryIdea[] {
  const party = partyOf(world);
  const avgLevel = party.reduce((s, c) => s + c.level, 0) / Math.max(1, party.length);
  const ideas: StoryIdea[] = [];
  for (const d of Object.values(world.dungeons)) {
    const [lo, hi] = d.recommendedLevel.split(/[–-]/).map((n) => parseInt(n, 10));
    if (!d.generated && avgLevel >= lo - 1 && avgLevel <= (hi || lo) + 3) {
      ideas.push({
        kind: 'dungeon',
        title: `${d.name} waits`,
        pitch: `The party (avg level ${avgLevel.toFixed(0)}) is ready for ${d.name} (${d.recommendedLevel}) — ${d.dungeonType}, said to hold ${d.specialFeatures[0]}. Untouched dungeons are chapters nobody has written yet.`,
        grounding: [`${d.name} never entered`, `Recommended ${d.recommendedLevel}; party average ${avgLevel.toFixed(1)}`, `Entrance: ${world.locations[d.entranceLocation]?.name}`],
        urgency: 5,
        outline: `First descent into ${d.name}: the entrance at ${world.locations[d.entranceLocation]?.name}, the first sign this place is worse than rumor said, first blood.`,
      });
    }
    if (d.generated && !d.bossDefeated && Object.values(d.rooms).some((r) => r.explored)) {
      ideas.push({
        kind: 'dungeon',
        title: `${d.name}: the thing below still lives`,
        pitch: `The party has walked ${Object.values(d.rooms).filter((r) => r.explored).length} rooms of ${d.name} and left its master alive. Whatever rules it knows someone came. Return scenes carry dread the first visit didn't have.`,
        grounding: [`${d.name}: ${Object.values(d.rooms).filter((r) => r.explored).length}/${Object.keys(d.rooms).length} rooms explored`, `Boss (${d.bossKey}) undefeated`],
        urgency: 6,
        outline: `The party goes back down into ${d.name}, deeper this time. The dungeon has changed in small ways that say it noticed them.`,
      });
    }
  }
  return ideas.slice(0, 2);
}

function relationshipIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  const mc = world.characters[world.mcId];
  for (const c of Object.values(world.characters)) {
    if (!c.persistent || !c.alive || c.id === mc.id) continue;
    const rel = c.relationships[mc.id];
    if (!rel) continue;
    if (rel.attraction >= 4 && rel.affection >= 3 && rel.commitment < 5) {
      ideas.push({
        kind: 'romance',
        title: `${c.name}: the unsaid thing`,
        pitch: `${c.name}'s attraction (${rel.attraction}) and affection (${rel.affection}) have outrun any commitment (${rel.commitment}). The genre calls this a powder keg. A quiet scene — a watch shared, a wound bound, a market errand — could light it or deliberately fail to.`,
        grounding: [`${c.name} → ${mc.name}: attraction ${rel.attraction}, affection ${rel.affection}, commitment ${rel.commitment}`],
        urgency: 6,
        outline: `A quiet moment alone between ${mc.name} and ${c.name}. Something almost gets said. Decide whether it does.`,
      });
    }
    if (rel.trust <= -2) {
      ideas.push({
        kind: 'friction',
        title: `${c.name}'s broken trust`,
        pitch: `${c.name}'s trust in ${mc.name} sits at ${rel.trust}. That doesn't heal by itself — it heals in a scene, or it festers into a departure, a betrayal, or a knife held back one beat too long in a fight.`,
        grounding: [`${c.name} → ${mc.name}: trust ${rel.trust}`],
        urgency: 8,
        outline: `The thing between ${mc.name} and ${c.name} finally comes out — at a bad time, because it always does.`,
      });
    }
  }
  return ideas.slice(0, 2);
}

function conditionIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  for (const c of partyOf(world)) {
    const untreated = c.injuries.filter((i) => !i.treated);
    if (untreated.length) {
      ideas.push({
        kind: 'wounds',
        title: `${c.name} is carrying ${untreated[0].name}`,
        pitch: `${c.name} has ${untreated.map((i) => i.name).join(' and ')} — a live penalty in every fight until the temple's rite (${fmtMoney(500)}). Pain writes well: pride refusing help, a companion noticing the wince, the wound failing at the worst moment.`,
        grounding: untreated.map((i) => `${c.name}: ${i.name} (${i.stat} ${i.amount}, since Day ${i.day})`),
        urgency: 7,
        outline: `${c.name}'s wound makes itself known mid-task. Someone pushes them toward the temple; they push back.`,
      });
    }
    if (levelUpAvailable(c)) {
      ideas.push({
        kind: 'training',
        title: `${c.name} is ready to train`,
        pitch: `${c.name} has the experience for level ${c.level + 1} and needs the ${CLASSES[c.charClass].trainer}. Training scenes earn their pages: a teacher with opinions, a fee that stings, a new ability shown before it's needed.`,
        grounding: [`${c.name}: ${c.xp} XP, level ${c.level}, LEVEL AVAILABLE`, `Trainer: ${CLASSES[c.charClass].trainer}`],
        urgency: 4,
        outline: `${c.name} trains at the ${CLASSES[c.charClass].trainer} — the drill, the teacher, the moment the new technique first works.`,
      });
    }
  }
  return ideas.slice(0, 2);
}

function factionIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  const mc = world.characters[world.mcId];
  for (const f of Object.values(world.factions)) {
    const rep = mc.factionReputation[f.id] ?? 0;
    if (rep <= -3) {
      ideas.push({
        kind: 'faction',
        title: `${f.name} wants blood`,
        pitch: `Reputation with ${f.name} stands at ${rep}. On their turf they already come hunting. Escalate it: a message nailed to the door, a friend leaned on, an ambush with a named face leading it — or a parley, because gangs are businesses first.`,
        grounding: [`${mc.name} → ${f.name}: reputation ${rep}`, `${f.name}: ${f.description}`],
        urgency: 9,
        outline: `${f.name} makes their grievance with the party personal — through someone or something the party cares about.`,
      });
    } else if (rep >= 3) {
      ideas.push({
        kind: 'faction',
        title: `${f.name} extends a hand`,
        pitch: `Reputation with ${f.name} stands at +${rep}. Patronage is a plot engine: better work, protected streets, and the slow discovery of what the favor actually costs.`,
        grounding: [`${mc.name} → ${f.name}: reputation +${rep}`],
        urgency: 5,
        outline: `An envoy from ${f.name} brings an offer that is generous, useful, and not free.`,
      });
    }
  }
  return ideas.slice(0, 2);
}

function pressureIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  const mc = world.characters[world.mcId];
  const partyCoin = partyOf(world).reduce((s, c) => s + c.money, 0);
  if (partyCoin < 100) {
    ideas.push({
      kind: 'money',
      title: 'The purse is nearly empty',
      pitch: `The whole party holds ${fmtMoney(partyCoin)}. Poverty makes characters honest about what they'll do — cheap rooms, cheaper jobs, the fence's prices, an old rule bent.`,
      grounding: [`Party total coin: ${fmtMoney(partyCoin)}`],
      urgency: 8,
      outline: `Broke, the party weighs work they'd have refused a week ago.`,
    });
  }
  const home = Object.values(world.locations).find((l) => l.household);
  if (!home) {
    const cost = 800;
    const saved = Math.min(mc.money, cost);
    ideas.push({
      kind: 'home',
      title: 'A door of his own',
      pitch: `${mc.name} owns nothing he can't carry. The flat over the chandler's costs ${fmtMoney(cost)}; he holds ${fmtMoney(mc.money)}. Every night is rented or rough. The gap between those numbers is a whole act of story — and the night he finally turns his own key is a chapter.`,
      grounding: [`No owned home`, `${mc.name}'s purse: ${fmtMoney(mc.money)} of ${fmtMoney(cost)} needed`],
      urgency: saved >= cost ? 8 : 5,
      outline: saved >= cost
        ? `${mc.name} has the coin. He buys the flat — the walk to the chandler's, the counting-out, the first night behind his own lock.`
        : `A night that makes the missing ${fmtMoney(cost - saved)} for the flat feel personal — rented cot, or a doorway, and the resolve that comes of it.`,
    });
  }
  if (home && !world.scenes.slice(-5).some((s) => s.location === home.id)) {
    ideas.push({
      kind: 'home',
      title: 'The house hasn\'t been on the page lately',
      pitch: `No recent scene at ${home.name}. Slice-of-life is the mortar between dungeon bricks — a meal cooked, gear mended at the bench, an argument about money, someone claiming the good chair.`,
      grounding: [`No scene set at ${home.name} in the last 5 scenes`, `Residents: ${home.household!.residents.map((r) => world.characters[r]?.name).join(', ')}`],
      urgency: 3,
      outline: `An evening at ${home.name}: small tasks, small talk, and one line of real honesty nobody expected.`,
    });
  }
  void mc;
  return ideas;
}

function chekhovIdeas(world: WorldState): StoryIdea[] {
  const text = allSceneText(world);
  const ideas: StoryIdea[] = [];
  const notable = Object.values(world.items).filter((i) => {
    const held = typeof i.owner === 'string' && (world.characters[i.owner]?.inParty || i.owner === 'PARTY' || i.owner === 'HOME_STORAGE');
    const interesting = (i.tier && ['rare', 'exceptional', 'legendary', 'artifact'].includes(i.tier)) || i.history.length >= 2;
    return held && interesting && !text.includes(i.name);
  });
  for (const item of notable.slice(0, 2)) {
    ideas.push({
      kind: 'chekhov',
      title: `${item.name} hasn't fired yet`,
      pitch: `The party holds ${item.name}${item.tier && item.tier !== 'mundane' ? ` (${item.tier})` : ''} and the manuscript has never mentioned it. Its history: ${item.history.join('; ') || 'unwritten'}. Someone recognizes it, wants it, or asks the question the party can't answer about where it came from.`,
      grounding: [`${item.name} owned, never mentioned in any scene`, ...item.history.map((h) => `History: ${h}`)],
      urgency: 4,
      outline: `${item.name} draws exactly the wrong person's attention.`,
    });
  }
  return ideas;
}

function forgottenCastIdeas(world: WorldState): StoryIdea[] {
  const text = allSceneText(world);
  const forgotten = Object.values(world.characters).filter(
    (c) => c.persistent && c.alive && !c.inParty && !c.isMC && !text.includes(c.name) && !world.scenes.some((s) => s.participants.includes(c.id)),
  );
  return forgotten.slice(0, 1).map((c) => ({
    kind: 'cast',
    title: `${c.name} exists and the book doesn't know it`,
    pitch: `${c.name} (${c.occupation}, ${c.personality.join(', ')}) is at ${world.locations[c.location]?.name ?? 'somewhere'} right now, ${c.activity} — and has never appeared on the page. Their goals: ${c.objectives.join('; ') || 'unstated'}. Walk-ons become load-bearing characters all the time.`,
    grounding: [`${c.name} in no scene`, `Currently: ${c.activity} at ${world.locations[c.location]?.name}`],
    urgency: 2,
    outline: `${c.name} crosses the party's path in a way that shows exactly who they are in one beat.`,
  }));
}

function worldIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  const day = world.time.day;
  const daysLeft = 90 - (((day - 1) % 90) + 1);
  if (daysLeft <= 5) {
    ideas.push({
      kind: 'season',
      title: `${seasonOf(day + daysLeft + 1)} is coming`,
      pitch: `${calendarLabel(day)} turns to ${seasonOf(day + daysLeft + 1)} in ${daysLeft + 1} days. Seasons move cities: harvest prices, harbor ice, festival crowds, the poor bracing for cold. Good chapter-turn texture.`,
      grounding: [`Today: Day ${day} (${calendarLabel(day)})`],
      urgency: 3,
      outline: `The season turns over Blackwall and the party feels it in small, concrete ways.`,
    });
  }
  if (world.weather && (world.weather.kind === 'storm' || world.weather.kind === 'snow')) {
    ideas.push({
      kind: 'weather',
      title: `Write the ${world.weather.kind}`,
      pitch: `A ${world.weather.kind} sits over the city today. Weather forces scenes indoors, cancels plans, strands the wrong people together, floods the sewers somebody is currently standing in.`,
      grounding: [`Weather today: ${world.weather.kind}`],
      urgency: 4,
      outline: `The ${world.weather.kind} wrecks the party's plan for the day and hands them a different scene.`,
    });
  }
  return ideas;
}

function campaignIdeas(world: WorldState): StoryIdea[] {
  const ideas: StoryIdea[] = [];
  const open = mainQuests(world).find((q) => q.status === 'offered' || q.status === 'active' || q.status === 'ready');
  if (open) {
    ideas.push({
      kind: 'campaign',
      title: `⚜ The spine: ${open.title}`,
      pitch: `Stage ${open.stage} of what lies beneath Blackwall. ${open.description}`,
      grounding: [`Main quest "${open.title}" is ${open.status}`, `Giver: ${open.giver === 'board' ? 'the board' : world.characters[open.giver]?.name} at ${world.locations[open.giverLocation]?.name}`],
      urgency: 7,
      outline: open.status === 'offered'
        ? `${world.characters[open.giver as string]?.name ?? 'The giver'} makes the offer: ${open.title}. What they say — and what they hold back.`
        : `The party moves on "${open.title}" — and finds the first sign it is bigger than the job.`,
    });
  }
  const rev = latestRevelation(world);
  if (rev && !allSceneText(world).slice(0, 500000).includes(rev.slice(0, 60))) {
    ideas.push({
      kind: 'campaign',
      title: 'The revelation nobody has reckoned with',
      pitch: `The party learned something that changes what the city is — "${rev.slice(0, 140)}…" — and the manuscript hasn't sat with it yet. Revelations land twice: once as information, once as a scene where someone realizes what it means for THEM.`,
      grounding: [`Party knowledge: ${rev.slice(0, 120)}…`, 'No scene text contains it yet'],
      urgency: 8,
      outline: `The weight of what they learned settles: each companion reacts through their own values; someone says the thing out loud that everyone was avoiding.`,
    });
  }
  return ideas;
}

function rivalIdeas(world: WorldState): StoryIdea[] {
  return livingRivals(world).slice(0, 1).map((r) => ({
    kind: 'rival',
    title: `${r.name} is still out there`,
    pitch: `${r.name} escaped the party ${r.grudge > 1 ? `${r.grudge} times` : 'once'} and has grown stronger for it (power ${r.power}${r.scars.length ? `; carries ${r.scars[r.scars.length - 1]}` : ''}). Rivals are chapters that hunt you: a sighting, a message, an ambush at the worst hour — or the party hunting first.`,
    grounding: [`Rival ${r.name} (${r.templateKey}), power ${r.power}, last seen Day ${r.lastSeenDay}`, ...r.scars.map((sc) => `Scar: ${sc}`)],
    urgency: 6 + Math.min(3, r.power),
    outline: `${r.name} resurfaces — on its terms or the party's. The scar you gave it is part of how it fights now.`,
  }));
}

function giverName(world: WorldState, q: Quest): string {
  return q.giver === 'board' ? 'the notice board' : world.characters[q.giver]?.name ?? q.giver;
}

/** Everything the Muse can see right now, most pressing first. */
export function generateStoryIdeas(world: WorldState): StoryIdea[] {
  const all = [
    ...campaignIdeas(world),
    ...rivalIdeas(world),
    ...deadlineIdeas(world),
    ...factionIdeas(world),
    ...relationshipIdeas(world),
    ...conditionIdeas(world),
    ...unfinishedIdeas(world),
    ...secretIdeas(world),
    ...dungeonIdeas(world),
    ...pressureIdeas(world),
    ...chekhovIdeas(world),
    ...worldIdeas(world),
    ...forgottenCastIdeas(world),
  ];
  return all.sort((a, b) => b.urgency - a.urgency).slice(0, 12);
}

// ---------- LLM development ----------
/** Expand a grounded hook into three concrete scene directions. */
export async function developIdea(cfg: LlmConfig, world: WorldState, idea: StoryIdea): Promise<string> {
  const recent = world.events.slice(-10).map((e) => `- ${e.summary}`).join('\n');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        `You are a development editor for a gritty LitRPG novel set in Blackwall City. Given a grounded story hook, propose THREE distinct directions the author could take it — each 2–3 sentences, concrete and scene-shaped (who, where, what turns). Then ONE complication that could attach to any of them. ` +
        `Stay inside the given facts; invent texture and possibility, never contradict the grounding. No headings other than "1.", "2.", "3.", "Complication:". Under 220 words.`,
    },
    {
      role: 'user',
      content: `HOOK: ${idea.title}\n${idea.pitch}\n\nGROUNDED IN:\n${idea.grounding.map((g) => `- ${g}`).join('\n')}\n\nRECENT EVENTS:\n${recent}`,
    },
  ];
  return (await chatWithNpc({ ...cfg, temperature: 0.9 }, messages)).trim();
}


// ---------- the dangling-threads board ----------
export interface OpenThread {
  kind: string;
  label: string;
  detail: string;
  urgency: number; // higher = more pressing
}

/** Everything unresolved that a 20-book series would drop on the floor. */
export function openThreads(world: WorldState): OpenThread[] {
  const threads: OpenThread[] = [];
  for (const r of livingRivals(world)) {
    threads.push({ kind: 'rival', label: `${r.name} still lives`, detail: `Power ${r.power}, grudge ${r.grudge}${r.scars.length ? `, carrying ${r.scars[r.scars.length - 1]}` : ''}. It will come back until somebody ends it.`, urgency: 5 + Math.min(4, r.power) });
  }
  for (const q of Object.values(world.quests)) {
    if (q.status === 'offered' && q.personal) {
      const c = world.characters[q.personal];
      threads.push({ kind: 'arc', label: `${c?.name ?? q.personal}: "${q.title}" waits`, detail: 'A personal chapter on offer and unplayed. Hearts do not hold forever.', urgency: 6 });
    }
    if (q.status === 'offered' && q.isMain) {
      threads.push({ kind: 'spine', label: `The spine waits: "${q.title}"`, detail: world.doomEnabled !== false ? 'The Circle digs while the party dallies — the clock is ticking.' : 'The clock is paused, but the story is not moving.', urgency: 8 });
    }
  }
  for (const ev of world.activeEvents ?? []) {
    const left = ev.expiresDay - world.time.day;
    if (left <= 2) threads.push({ kind: 'event', label: `Expiring: ${ev.kind}`, detail: `${ev.description} (${left <= 0 ? 'lapsing NOW' : `${left} day${left === 1 ? '' : 's'} left`} — lapsed troubles deepen the district's danger.)`, urgency: 9 });
  }
  const unidentified = Object.values(world.items).filter((i) => i.unidentified && typeof i.owner === 'string' && world.characters[i.owner]?.inParty);
  if (unidentified.length) {
    threads.push({ kind: 'item', label: `${unidentified.length} enchantment${unidentified.length === 1 ? '' : 's'} unread`, detail: `${unidentified.map((i) => i.name).slice(0, 3).join(', ')}${unidentified.length > 3 ? '…' : ''} — the College reads for coin; Kess reads for trust.`, urgency: 3 });
  }
  for (const c of Object.values(world.characters)) {
    if (c.inParty && c.alive && !c.ascension && c.level >= 25) {
      threads.push({ kind: 'ascension', label: `${c.name} stands at the threshold`, detail: `Level ${c.level} and unascended — the rite waits at the ${c.charClass} hall.`, urgency: 4 });
    }
    if (!c.alive && c.wasParty && !c.memorialized && c.remains !== 'beyondRecall') {
      threads.push({ kind: 'grief', label: `No rite spoken for ${c.name}`, detail: 'The temple can still speak the memorial. Grief unspoken curdles on the page.', urgency: 6 });
    }
  }
  for (const d of Object.values(world.dungeons)) {
    for (const lockRoom of d.keysHeld ?? []) {
      const r = d.rooms[lockRoom];
      if (r?.lockedDoor && !r.lockedDoor.opened) {
        threads.push({ kind: 'key', label: `A key burning a pocket`, detail: `The party carries the key to a door in ${d.name} and has not turned it.`, urgency: 3 });
      }
    }
  }
  return threads.sort((a, b) => b.urgency - a.urgency);
}
