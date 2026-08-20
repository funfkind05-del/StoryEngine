// Inter-companion bonds & banter (the Baldur's Gate layer). The
// relationship graph stops being a star: companions drift toward and
// against each other through shared fights and clashing values, and
// sometimes two of them get into it where the MC can overhear —
// a banner opens a two-voice LLM scene.

import type { Character, WorldState } from './types';
import { Rng } from './rng';
import { logEvent, relationshipBetween } from './world';
import { buildNpcSystemPrompt, type ChatMessage, type LlmConfig } from './npcChat';
import { chatWithNpc } from './npcChat';
import { entangled } from './romance';

const CLASHES: [string, string][] = [
  ['honesty', 'cunning'],
  ['faith', 'freedom'],
  ['order', 'freedom'],
  ['kindness', 'wealth'],
];

function valuesOverlap(a: Character, b: Character): number {
  return a.values.filter((v) => b.values.includes(v)).length;
}

function valuesClash(a: Character, b: Character): boolean {
  return CLASHES.some(([x, y]) => (a.values.includes(x) && b.values.includes(y)) || (a.values.includes(y) && b.values.includes(x)));
}

/** After a shared victory, companions drift toward or against each other. */
export function driftCompanionBonds(world: WorldState, partyIds: string[], rng: Rng): void {
  const companions = partyIds.map((id) => world.characters[id]).filter((c) => c && !c.isMC && c.alive);
  for (let i = 0; i < companions.length; i++) {
    for (let j = i + 1; j < companions.length; j++) {
      if (!rng.chance(0.15)) continue;
      const a = companions[i];
      const b = companions[j];
      const relAB = relationshipBetween(world, a.id, b.id);
      const relBA = relationshipBetween(world, b.id, a.id);
      if (valuesOverlap(a, b) >= 1 || rng.chance(0.5)) {
        relAB.trust = Math.min(10, relAB.trust + 1);
        relBA.trust = Math.min(10, relBA.trust + 1);
        relAB.affection = Math.min(10, relAB.affection + 1);
      } else if (valuesClash(a, b)) {
        relAB.respect = Math.max(-10, relAB.respect - 1);
      }
    }
  }
}

interface BanterTopic {
  topic: string;
  teaser: string;
}

/** What would these two actually get into it about, right now? */
export function banterTopic(world: WorldState, a: Character, b: Character, rng: Rng): BanterTopic {
  const mc = world.characters[world.mcId];
  const both = entangled(world);
  if (both.some((c) => c.id === a.id) && both.some((c) => c.id === b.id) && rng.chance(0.5)) {
    return {
      topic: `Both of you hold ${mc.name}'s attention and you both know it. This is the conversation where you two work out — between yourselves, without ${mc.name} steering it — what that is going to look like. Rivalry, terms, or an understanding; let it be true to what each of you values.`,
      teaser: `about ${mc.name}, actually`,
    };
  }
  if (valuesClash(a, b)) {
    const av = a.values.join('/');
    const bv = b.values.join('/');
    return {
      topic: `Your codes collide (${a.name}: ${av}; ${b.name}: ${bv}) and something recent — the last fight, the last job, the way coin got split — has set it off. Argue it properly: neither of you is wrong by your own lights.`,
      teaser: 'going at it about principles',
    };
  }
  const recent = world.events.slice(-10).find((e) => ['combat.end', 'quest.completed', 'crime.burglary', 'rival.born', 'doom'].includes(e.kind));
  if (recent) {
    return {
      topic: `You two are chewing over what just happened: "${recent.summary}" — from your two very different angles.`,
      teaser: 'rehashing what happened',
    };
  }
  return {
    topic: `A slow hour, and the two of you fell to talking — needle each other, trade a story, let a real question slip out under the jokes.`,
    teaser: 'talking, for once',
  };
}

/** LLM prompt for a two-voice scene the MC overhears and may join. */
export function buildBanterPrompt(world: WorldState, aId: string, bId: string, topic: string): ChatMessage[] {
  const a = world.characters[aId];
  const b = world.characters[bId];
  const mc = world.characters[world.mcId];
  const cardA = buildNpcSystemPrompt(world, aId, world.mcId);
  const cardB = buildNpcSystemPrompt(world, bId, world.mcId);
  return [
    {
      role: 'system',
      content:
        `You are roleplaying TWO characters at once in a gritty LitRPG novel: ${a.name} and ${b.name}. ${mc.name} is nearby and can hear.\n` +
        `Format every line as "Name: dialogue" with actions in *asterisks*. 6–10 lines per exchange, alternating naturally. Neither dominates. ` +
        `When ${mc.name} speaks (the user's messages), both may respond. Stay in character for BOTH, using only what each knows.\n\n` +
        `=== ${a.name.toUpperCase()} ===\n${cardA}\n\n=== ${b.name.toUpperCase()} ===\n${cardB}\n\n=== THE SCENE ===\n${topic}`,
    },
    { role: 'user', content: `*${mc.name} is close enough to hear. Begin the exchange between ${a.name} and ${b.name}.*` },
  ];
}

export async function generateBanter(cfg: LlmConfig, world: WorldState, aId: string, bId: string, topic: string): Promise<string> {
  return (await chatWithNpc({ ...cfg, temperature: 0.9 }, buildBanterPrompt(world, aId, bId, topic))).trim();
}

/** Record a kept banter as memories on both participants. */
export function rememberBanter(world: WorldState, aId: string, bId: string, summary: string): void {
  const day = world.time.day;
  world.characters[aId]?.memories.push({ subject: bId, event: summary, importance: 4, emotionalValue: 2, day });
  world.characters[bId]?.memories.push({ subject: aId, event: summary, importance: 4, emotionalValue: 2, day });
  logEvent(world, 'banter', { a: aId, b: bId }, `${world.characters[aId]?.name} and ${world.characters[bId]?.name}: ${summary}`, { witnesses: [world.mcId, aId, bId] });
}
