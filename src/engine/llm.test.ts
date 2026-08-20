// Tests for the LLM-facing layers that don't need a live model:
// the knowledge-separated NPC prompt and the prose→sim proposal
// executor (the part that runs only after author approval).

import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '../data/seed';
import { buildNpcSystemPrompt } from './npcChat';
import { applyProposal } from './proseLlm';
import { lastParagraph } from './proseLlm';
import type { WorldState } from './types';

function freshWorld(): WorldState {
  const w = buildSeedWorld();
  w.masterSeed = 777;
  return w;
}

describe('NPC prompt: knowledge separation', () => {
  it("contains only the NPC's own knowledge and memories, never another character's", () => {
    const w = freshWorld();
    const mara = w.characters['CHAR_MARA'];
    const kael = w.characters['CHAR_KAEL'];
    // world truth known only to Mara (from the seed)
    const prompt = buildNpcSystemPrompt(w, 'CHAR_MARA', 'CHAR_KAEL');
    expect(prompt).toContain('Varga has been moving crates');
    // Kael's private knowledge must NOT leak into Mara's prompt
    expect(kael.knowledge.some((k) => k.fact.includes('mausoleum'))).toBe(true);
    expect(prompt).not.toContain('mausoleum');
    // identity, personality, values present
    expect(prompt).toContain('Mara Venn');
    expect(prompt).toContain('suspicious');
    // stranger stance: no relationship recorded yet
    expect(prompt).toContain('no history with Kael');
    // memories change the prompt
    mara.memories.push({ subject: 'CHAR_KAEL', event: 'Kael protected Mara from Red Knives.', importance: 8, emotionalValue: 6, day: 14 });
    mara.relationships['CHAR_KAEL'] = { affection: 4, trust: 4, respect: 3, attraction: 2, commitment: 0 };
    const prompt2 = buildNpcSystemPrompt(w, 'CHAR_MARA', 'CHAR_KAEL');
    expect(prompt2).toContain('Kael protected Mara');
    expect(prompt2).toContain('trust them');
  });
});

describe('prose→sim proposals (author-approved execution)', () => {
  it('executes travel, money, damage, and item changes; refuses continuity violations', () => {
    const w = freshWorld();
    const kael = w.characters[w.mcId];
    kael.money = 100;

    expect(applyProposal(w, { kind: 'travel', label: '', params: { kind: 'travel', location: 'Ironmarket Square' } })).toContain('moved to Ironmarket Square');
    expect(w.partyLocation).toBe('LOC_IRONMARKET_SQ');

    expect(applyProposal(w, { kind: 'spend_money', label: '', params: { kind: 'spend_money', character: 'Kael', copper: 40, reason: 'ale' } })).toContain('spent');
    expect(kael.money).toBe(60);
    // cannot spend coin he doesn't have — continuity guard
    expect(applyProposal(w, { kind: 'spend_money', label: '', params: { kind: 'spend_money', character: 'Kael', copper: 5000, reason: 'bribe' } })).toContain('✖');
    expect(kael.money).toBe(60);

    expect(applyProposal(w, { kind: 'damage', label: '', params: { kind: 'damage', character: 'Kael', hp: 5, reason: 'bar fight' } })).toContain('took 5 damage');
    expect(kael.hp.current).toBe(kael.hp.max - 5);

    // gains a new story item; losing an item he never had is refused
    expect(applyProposal(w, { kind: 'take_item', label: '', params: { kind: 'take_item', character: 'Kael', item: 'Old Brass Key' } })).toContain('acquired');
    expect(kael.inventory.map((i) => w.items[i]?.name)).toContain('Old Brass Key');
    expect(applyProposal(w, { kind: 'lose_item', label: '', params: { kind: 'lose_item', character: 'Kael', item: 'Crown Jewels' } })).toContain('✖');

    // relationship + memory + new NPC
    expect(applyProposal(w, { kind: 'relationship', label: '', params: { kind: 'relationship', npc: 'Mara', dimension: 'trust', delta: 2, reason: 'kept his word' } })).toContain('trust +2');
    expect(w.characters['CHAR_MARA'].relationships['CHAR_KAEL'].trust).toBe(2);
    const before = Object.keys(w.characters).length;
    expect(applyProposal(w, { kind: 'introduce_npc', label: '', params: { kind: 'introduce_npc', name: 'Joss Kettle', occupation: 'ferryman', description: 'A one-eyed ferryman.' } })).toContain('Joss Kettle');
    expect(Object.keys(w.characters).length).toBe(before + 1);
    const joss = Object.values(w.characters).find((c) => c.name === 'Joss Kettle')!;
    expect(joss.persistent).toBe(true);

    // every applied proposal left an attributed event
    expect(w.events.filter((e) => e.kind.startsWith('prose.sync.') && e.authorOverride).length).toBeGreaterThanOrEqual(5);
  });

  it('lastParagraph finds the polish target', () => {
    expect(lastParagraph('short')).toBeNull();
    const text = 'First paragraph here, long enough to matter for the check.\n\nSecond paragraph, also long enough to be a polish target for the editor.\n\n';
    const lp = lastParagraph(text)!;
    expect(lp.text.startsWith('Second paragraph')).toBe(true);
  });
});

describe('second dungeon', () => {
  it('exists with its own entrance and boss', () => {
    const w = freshWorld();
    expect(Object.keys(w.dungeons)).toHaveLength(2);
    const d = w.dungeons['DUN_DOCKWARD_001'];
    expect(d.name).toBe('The Drowning Cellars');
    expect(w.locations['LOC_CELLARDOOR'].dungeonId).toBe('DUN_DOCKWARD_001');
    expect(w.locations['LOC_WHARVES'].connections).toContain('LOC_CELLARDOOR');
  });
});
