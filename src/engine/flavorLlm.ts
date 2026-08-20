// AI flavor: the local LLM writes PROSE around facts the simulation
// already owns — room descriptions, bought rumors, job-board voices,
// companion letters, encounter stakes. The rule never bends: the sim
// decides what is true; the model only decides how it reads.

import type { Quest, WorldState } from './types';
import { chatWithNpc, type LlmConfig } from './npcChat';
import { livingRivals } from './rivals';
import { festivalToday } from './festivals';
import { relationshipStage } from './romance';

const HOUSE_STYLE =
  'Write in the voice of a gritty low-fantasy LitRPG city called Blackwall: concrete nouns, wet stone, coin and consequence. ' +
  'No modern words, no exclamation marks, no em-dash mannerisms. Never invent names, numbers, places, or events beyond the FACTS given.';

function ask(cfg: LlmConfig, system: string, user: string, temperature = 0.85): Promise<string> {
  return chatWithNpc({ ...cfg, temperature }, [
    { role: 'system', content: `${HOUSE_STYLE}\n\n${system}` },
    { role: 'user', content: user },
  ]);
}

// ---------- 1. fresh room descriptions ----------
export function roomFacts(world: WorldState): string | null {
  if (!world.currentDungeon || !world.currentRoom) return null;
  return roomFactsFor(world, world.currentDungeon, world.currentRoom);
}

/** Facts for a specific room — background describes must not drift to
 *  wherever the party walked while the model was thinking. */
export function roomFactsFor(world: WorldState, dungeonId: string, roomId: string): string | null {
  const d = world.dungeons[dungeonId];
  const room = d?.rooms[roomId];
  if (!room) return null;
  const bits = [
    `Dungeon: ${d.name} (${d.dungeonType}), floor ${room.floor}.`,
    `Room: "${room.name}". Current description: "${room.description}"`,
    room.enemies === 'alive' ? `Hostiles present${room.encounterKey ? ` (${room.encounterKey.replace(/-/g, ' ')}s)` : ''} — not yet engaged.` : `Enemies: ${room.enemies}.`,
    room.chest && !room.chest.opened ? 'An unopened chest is here.' : '',
    room.trap && !room.trap.disarmed && !room.trap.triggered ? `A live trap: ${room.trap.kind}.` : '',
    room.shrine && !room.shrine.used ? 'An old shrine, unspent.' : '',
    (world.torchMinutes ?? 0) <= 0 ? 'The party has NO light — pitch dark.' : 'Torchlight, guttering.',
  ].filter(Boolean);
  return bits.join('\n');
}

export async function describeRoom(cfg: LlmConfig, world: WorldState, dungeonId?: string, roomId?: string): Promise<string> {
  const facts = dungeonId && roomId
    ? roomFactsFor(world, dungeonId, roomId)
    : roomFacts(world);
  if (!facts) throw new Error('Not in a dungeon room.');
  const out = await ask(
    cfg,
    'Rewrite the room description in 1-2 sentences, second person plural ("you"), present tense. Keep every FACT true; add sensory texture only.',
    `FACTS:\n${facts}\n\nWrite the new description now. Description only, no preamble.`,
  );
  return out.trim().replace(/^"|"$/g, '');
}

// ---------- 2. rumors with real grounding ----------
export interface RumorGround {
  kind: string;
  fact: string;
  /** deterministic fallback line if the model is unreachable */
  fallback: string;
}

export function rumorGrounds(world: WorldState): RumorGround[] {
  const grounds: RumorGround[] = [];
  for (const r of livingRivals(world).slice(0, 2)) {
    grounds.push({
      kind: 'rival',
      fact: `A named enemy of the party, "${r.name}", escaped them ${r.power > 1 ? `${r.power} times` : 'once'} and still hunts them${r.scars.length ? ` carrying ${r.scars[r.scars.length - 1]}` : ''}.`,
      fallback: `They say ${r.name} has been asking after a certain crew by name. Asking twice.`,
    });
  }
  if ((world.doom?.stage ?? 0) > 0) {
    grounds.push({
      kind: 'doom',
      fact: `The Ash Circle cult grows bolder (threat stage ${world.doom!.stage} of 4). Something under the city is being dug toward.`,
      fallback: 'More ash on the wind lately. The Circle only burns that much when it is close to something.',
    });
  }
  for (const ev of (world.activeEvents ?? []).slice(0, 2)) {
    grounds.push({ kind: 'event', fact: `Ongoing trouble: ${ev.description}`, fallback: ev.description });
  }
  const unbeaten = Object.values(world.dungeons).filter((d) => !d.bossDefeated).slice(0, 2);
  for (const d of unbeaten) {
    grounds.push({
      kind: 'dungeon',
      fact: `${d.name} (${d.dungeonType}) has never been cleared. It is said to hold ${d.specialFeatures[0]}.`,
      fallback: `Nobody has come back from the bottom of ${d.name} with the same face they went in with.`,
    });
  }
  const fest = festivalToday(world);
  if (fest) grounds.push({ kind: 'festival', fact: `Today is ${fest.name}: ${fest.desc}`, fallback: fest.desc });
  return grounds;
}

export async function generateRumor(cfg: LlmConfig, _world: WorldState, ground: RumorGround): Promise<string> {
  const out = await ask(
    cfg,
    'You are a Blackwall lamplighter trading rumors for coin. Turn the FACT into a 1-2 sentence street rumor: oblique, overheard, deniable. Do not contradict the fact.',
    `FACT:\n${ground.fact}\n\nThe rumor, as the lamplighter says it:`,
    0.95,
  );
  return out.trim().replace(/^"|"$/g, '');
}

// ---------- 3. job-board postings in the poster's voice ----------
export function boardQuests(world: WorldState): Quest[] {
  return Object.values(world.quests).filter((q) => q.status === 'offered' && !q.isMain && !q.personal && !q.guild);
}

export async function rewordQuest(cfg: LlmConfig, world: WorldState, quest: Quest): Promise<string> {
  const giver = quest.giver !== 'board' ? world.characters[quest.giver] : null;
  const voice = giver
    ? `${giver.name}, a ${giver.occupation} (${giver.personality.join(', ')})`
    : 'an anonymous posting nailed to the job board, half-literate, urgent';
  const out = await ask(
    cfg,
    `Rewrite the job description in the voice of the poster: ${voice}. 1-3 sentences. Keep the task, targets, and stakes exactly as stated; change only the telling.`,
    `TITLE: ${quest.title}\nCURRENT DESCRIPTION: ${quest.description}\n\nThe reworded posting:`,
  );
  return out.trim().replace(/^"|"$/g, '');
}

// ---------- 4. letters from companions ----------
export function letterCandidates(world: WorldState): string[] {
  return Object.values(world.characters)
    .filter((c) => c.persistent && c.alive && !c.isMC && c.inParty)
    .filter((c) => {
      const rel = c.relationships[world.mcId];
      return rel && (rel.affection >= 6 || ['lover', 'partner', 'spouse'].includes(relationshipStage(rel)));
    })
    .map((c) => c.id);
}

export async function writeLetter(cfg: LlmConfig, world: WorldState, charId: string): Promise<string> {
  const c = world.characters[charId];
  const mc = world.characters[world.mcId];
  const rel = c.relationships[world.mcId];
  const stage = relationshipStage(rel);
  const memories = c.memories.slice(-5).map((m) => `- ${m.event}`).join('\n');
  const out = await ask(
    cfg,
    `You are ${c.name}, ${c.occupation} (${c.personality.join(', ')}; values ${c.values.join(', ')}). You are ${stage === 'friend' || stage === 'close' ? 'close to' : `${stage} of`} ${mc.name}. Write a SHORT letter (40-90 words) left for ${mc.name} to find — in your own voice, grounded ONLY in the memories below. Sign with your name or how ${mc.name} knows you.`,
    `YOUR RECENT MEMORIES:\n${memories}\n\nThe letter:`,
    0.9,
  );
  return out.trim().replace(/^"|"$/g, '');
}

// ---------- 5. encounter stakes, GM voice ----------
export async function rewordEncounter(cfg: LlmConfig, world: WorldState): Promise<string> {
  const enc = world.pendingEncounter;
  if (!enc) throw new Error('No pending encounter.');
  const loc = world.locations[enc.locationId]?.name ?? 'the street';
  const roster = enc.monsters.map((m) => `${m.count} ${m.templateKey.replace(/-/g, ' ')}${m.count > 1 ? 's' : ''}`).join(', ');
  const out = await ask(
    cfg,
    'You are the game master. Rewrite the encounter description in 1-2 sentences: where they are, how it starts, what it wants. Keep the exact creatures and counts; invent nothing else.',
    `LOCATION: ${loc}\nCREATURES (fixed): ${roster}\nELITE PRESENT: ${enc.elite ? enc.elite.name : 'none'}\nCURRENT LINE: ${enc.description}\n\nThe new line:`,
  );
  return out.trim().replace(/^"|"$/g, '');
}
