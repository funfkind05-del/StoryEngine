// AI-composed music: the same local LLM that voices the NPCs writes
// the sheet music — semitones and beats as strict JSON — and the
// WebAudio sequencer performs it. Fully offline, like everything else.

import { chatWithNpc, type LlmConfig } from './npcChat';
import type { Composition, MusicTheme } from '../sound';

const MOODS: Record<Exclude<MusicTheme, 'off'>, string> = {
  city: 'A crowded fantasy port city at dusk — taverns, markets, coin and trouble. Jaunty but a little dangerous. Think a bard busking near a gallows.',
  dungeon: 'Deep underground in a black crypt. Slow, sparse, minor-key dread. Long notes, long silences. Something is listening.',
  combat: 'A desperate melee — driving, urgent, repetitive enough to loop under a fight without wearing out its welcome.',
};

const COMPOSE_PROMPT = (theme: Exclude<MusicTheme, 'off'>) => `You are a chiptune composer for a dark-fantasy RPG called Blackwall.

Write a short looping theme. MOOD: ${MOODS[theme]}

Reply with ONLY a JSON object, no prose, no code fences:
{
  "bpm": <number 40-200>,
  "tracks": [
    { "wave": "triangle"|"square"|"sawtooth"|"sine", "gain": <0.005-0.025>, "notes": [[<semitone or null>, <beats>], ...] },
    ...
  ]
}

Rules:
- 2 or 3 tracks: a melody (triangle or square) and a bass line (square or sawtooth), optionally a third voice.
- "notes" entries are [semitones from A440 (use null for a rest), duration in beats].
- Melody range: -12 to +12 semitones. Bass range: -36 to -12.
- 16 to 48 notes per track. Track durations should sum to the SAME total beats so the loop stays aligned.
- Stay in one key. Minor keys suit this world.
- End the melody so it loops smoothly back to its first note.`;

/** Ask the LLM for a theme. Throws with a readable message on garbage. */
export async function composeTheme(cfg: LlmConfig, theme: Exclude<MusicTheme, 'off'>): Promise<Composition> {
  const raw = await chatWithNpc({ ...cfg, temperature: 0.9 }, [
    { role: 'system', content: COMPOSE_PROMPT(theme) },
    { role: 'user', content: `Compose the ${theme} theme now. JSON only.` },
  ]);
  const text = raw.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model replied without JSON.');
  const parsed = JSON.parse(text.slice(start, end + 1)) as Composition;
  if (typeof parsed.bpm !== 'number' || !Array.isArray(parsed.tracks)) {
    throw new Error('The model\'s JSON is missing bpm or tracks.');
  }
  return parsed;
}
