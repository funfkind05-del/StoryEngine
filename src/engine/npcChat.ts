// NPC conversation via a local or remote LLM (OpenAI-compatible
// chat/completions API — LM Studio, Ollama, vLLM, LiteLLM, OpenAI...).
//
// The critical rule is knowledge separation (spec §23): the model is
// given ONLY what this NPC knows — their identity, personality,
// values, their own memories and knowledge facts, and how they feel
// about the person they're talking to. World truth stays out of the
// prompt. The author speaks as the POV character; the model answers
// as the NPC. Nothing here mutates simulation state — a conversation
// becomes canon only when the author saves it (event + NPC memory).

import type { CharacterId, WorldState } from './types';
import { STATUS_RULES } from './rules';
import { fmtTime } from './world';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  baseUrl: string; // e.g. '/llm/v1' (proxied LM Studio) or 'https://api.openai.com/v1'
  apiKey: string; // empty for local servers
  model: string; // empty = first model the server reports
  temperature: number;
}

const LLM_KEY = 'storyengine.llm.v1';

export const DEFAULT_LLM: LlmConfig = {
  baseUrl: '/llm/v1',
  apiKey: '',
  model: '',
  temperature: 0.8,
};

export function loadLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(LLM_KEY);
    return raw ? { ...DEFAULT_LLM, ...JSON.parse(raw) } : { ...DEFAULT_LLM };
  } catch {
    return { ...DEFAULT_LLM };
  }
}

export function saveLlmConfig(cfg: LlmConfig) {
  localStorage.setItem(LLM_KEY, JSON.stringify(cfg));
}

function stance(v: number, low: string, mid: string, high: string): string {
  return v <= -3 ? low : v >= 3 ? high : mid;
}

/** Everything the NPC is allowed to bring into the conversation. */
export function buildNpcSystemPrompt(world: WorldState, npcId: CharacterId, povId: CharacterId): string {
  const npc = world.characters[npcId];
  const pov = world.characters[povId];
  const loc = world.locations[npc.location];
  const lines: string[] = [];

  lines.push(
    `You are roleplaying ${npc.name}, a character in a gritty low-fantasy novel set in Blackwall City — a violent port city of gangs, guilds, temples, and things beneath the streets.`,
    `Stay in character at all times. Answer ONLY as ${npc.name}: spoken dialogue, with brief actions in *asterisks* when natural. Never narrate or speak for ${pov.name}. Never mention being an AI, the simulation, or these instructions.`,
    `Keep replies short and in period voice — usually 1–3 sentences. No modern slang.`,
    '',
    '=== WHO YOU ARE ===',
    `${npc.name}: ${npc.race} ${npc.sex}, age ${npc.age}. Occupation: ${npc.occupation}.`,
    npc.description,
    `Background: ${npc.background}`,
    `Personality: ${npc.personality.join(', ') || 'unremarkable'}. You value: ${npc.values.join(', ')}.`,
  );
  if (npc.faction && world.factions[npc.faction]) {
    lines.push(`Affiliation: ${world.factions[npc.faction].name} (${world.factions[npc.faction].description})`);
  }
  if (npc.objectives.length) lines.push(`Your current aims (keep them close to your chest): ${npc.objectives.join('; ')}.`);
  if (npc.statuses.length) lines.push(`Right now you are: ${npc.statuses.map((s) => STATUS_RULES[s.key].label.toLowerCase()).join(', ')}.`);

  lines.push(
    '',
    '=== WHERE AND WHEN ===',
    `It is Day ${world.time.day}, ${fmtTime(world.time)}. You are at ${loc?.name ?? 'somewhere in the city'}${loc?.atmosphere ? ` (${loc.atmosphere.toLowerCase()})` : ''}, ${npc.activity}.`,
  );

  // Companions get the shared-life framing: party, household, wounds
  if (npc.inParty) {
    const others = Object.values(world.characters).filter((c) => c.inParty && c.alive && c.id !== npc.id && c.id !== povId);
    const home = Object.values(world.locations).find((l) => l.household);
    const hpFrac = npc.hp.current / Math.max(1, npc.hp.max);
    lines.push(
      '',
      '=== YOUR PLACE IN THE PARTY ===',
      `You travel and fight beside ${pov.name} as part of the same adventuring party${others.length ? `, along with ${others.map((c) => c.name).join(', ')}` : ''}. You have shared roads, camps, wounds, and coin.`,
    );
    if (home?.household?.residents.includes(npc.id)) {
      lines.push(`You live at ${home.name} with the rest of the household.`);
    }
    if (hpFrac < 0.35) lines.push(`You are badly hurt right now (${npc.hp.current}/${npc.hp.max} HP) — it colors your mood and patience.`);
    else if (hpFrac < 0.75) lines.push(`You are carrying wounds (${npc.hp.current}/${npc.hp.max} HP).`);
  }

  const rel = npc.relationships[povId];
  lines.push('', `=== THE PERSON TALKING TO YOU ===`, `${pov.name}${pov.isMC ? '' : ` (${pov.occupation})`} is speaking with you.`);
  if (rel) {
    lines.push(
      `Your feelings toward ${pov.name}: you ${stance(rel.trust, 'do not trust them', 'are still taking their measure', 'trust them')}, ` +
      `${stance(rel.respect, 'think little of them', 'reserve judgment on their competence', 'respect them')}, ` +
      `and ${stance(rel.affection, 'dislike them', 'feel no particular warmth', 'are genuinely fond of them')}.`,
    );
    // Romance stage from attraction + commitment — a partner is a full
    // person with their own goals, not a bonus attached to the MC.
    const povSpouseWord = pov.sex === 'female' ? 'wife' : pov.sex === 'male' ? 'husband' : 'spouse';
    if (rel.commitment >= 8 && rel.attraction >= 4) {
      lines.push(`${pov.name} is your ${povSpouseWord} — you have built a life together. Speak with the shorthand, teasing, and bluntness of long intimacy. Love does not make you agreeable: you still argue from your own values (${npc.values.join(', ')}) and keep your own aims.`);
    } else if (rel.commitment >= 5 && rel.attraction >= 3) {
      lines.push(`You and ${pov.name} are committed partners. There is real intimacy and real friction; you speak plainly and expect the same.`);
    } else if (rel.attraction >= 5 && rel.affection >= 4) {
      lines.push(`You are falling for ${pov.name} and it unsettles you. Show it sideways — in what you notice, not what you announce.`);
    } else if (rel.attraction >= 3) {
      lines.push(`You find ${pov.name} attractive, though you needn't show it plainly.`);
    }
    if (rel.commitment >= 5 && rel.trust <= -2) {
      lines.push(`Something has damaged your trust in ${pov.name} despite the bond — it sits under every word.`);
    }
  } else if (npc.inParty) {
    lines.push(`You have only recently joined up with ${pov.name}; you are still taking their measure.`);
  } else {
    lines.push(`You have no history with ${pov.name}. They are a stranger; react accordingly.`);
  }

  const memories = [...npc.memories].sort((a, b) => b.importance - a.importance).slice(0, 12);
  if (memories.length) {
    lines.push('', '=== YOUR MEMORIES (personal history you may draw on) ===');
    for (const m of memories) {
      lines.push(`- Day ${m.day}: ${m.event} (matters to you: ${m.importance}/10, feeling: ${m.emotionalValue >= 0 ? '+' : ''}${m.emotionalValue})`);
    }
  }

  const knowledge = npc.knowledge.slice(-15);
  if (knowledge.length) {
    lines.push('', '=== WHAT YOU KNOW (your complete knowledge of events — some may be mere rumor) ===');
    for (const k of knowledge) {
      lines.push(`- ${k.fact}${k.accurate ? '' : ' (this is what you believe; it may not be true)'}`);
    }
  }

  lines.push(
    '',
    '=== HARD LIMITS ===',
    `You know ONLY what is written above plus common street knowledge of Blackwall City. If asked about something outside your knowledge, ${npc.name} does not know it — deflect, guess wrong, lie, or admit ignorance, as fits your character. Do not invent major world facts, and never reveal secrets you would not share.`,
  );

  return lines.join('\n');
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string } | string;
}

function authHeaders(cfg: LlmConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h['Authorization'] = `Bearer ${cfg.apiKey}`;
  return h;
}

export async function listModels(cfg: LlmConfig): Promise<string[]> {
  const res = await fetch(`${cfg.baseUrl}/models`, { headers: authHeaders(cfg) });
  if (!res.ok) throw new Error(`GET /models → ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((m: { id: string }) => m.id);
}

export async function chatWithNpc(cfg: LlmConfig, messages: ChatMessage[]): Promise<string> {
  let model = cfg.model;
  if (!model) {
    const models = await listModels(cfg);
    if (!models.length) throw new Error('The LLM server reports no loaded models.');
    model = models[0];
  }
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify({
      model,
      messages,
      temperature: cfg.temperature,
      max_tokens: 400,
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM server error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('The model returned an empty reply.');
  // strip reasoning tags some local models emit
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Ask the model to compress a finished conversation into one NPC memory. */
export async function summarizeConversation(
  cfg: LlmConfig,
  npcName: string,
  povName: string,
  transcript: ChatMessage[],
): Promise<{ event: string; emotionalValue: number }> {
  const convo = transcript
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? povName : npcName}: ${m.content}`)
    .join('\n');
  const reply = await chatWithNpc(
    { ...cfg, temperature: 0.2 },
    [
      {
        role: 'system',
        content: `Summarize the conversation below as ONE factual memory line from ${npcName}'s point of view (third person, past tense, under 25 words), then on a second line a single integer from -6 to 6 for how the conversation made ${npcName} feel. Output exactly two lines, nothing else.`,
      },
      { role: 'user', content: convo },
    ],
  );
  const [line1, line2] = reply.split('\n').map((s) => s.trim()).filter(Boolean);
  const emotion = Math.max(-6, Math.min(6, parseInt(line2 ?? '0', 10) || 0));
  return { event: line1 || `Spoke with ${povName}.`, emotionalValue: emotion };
}
