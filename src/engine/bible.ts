// Series bible & recap: everything the engine knows, compiled into a
// reference document per book — and a "previously on" for the next.

import type { WorldState } from './types';
import { CLASSES, calendarLabel, fmtMoney } from './rules';
import { relationshipStage, STAGE_LABELS } from './romance';
import { mainQuests } from './campaign';
import { guildRank, guildTitle, GUILDS } from './guilds';
import { loreById } from './codex';
import { ACHIEVEMENTS } from './achievements';
import { fmtTime } from './world';
import { chatWithNpc, type ChatMessage, type LlmConfig } from './npcChat';

export function compileBible(world: WorldState, bookTitle: string): string {
  const mc = world.characters[world.mcId];
  const L: string[] = [`# ${bookTitle} — Series Bible`, '', `_Generated from simulation state on Day ${world.time.day} (${calendarLabel(world.time.day)})._`, ''];

  L.push('## Principal cast');
  for (const c of Object.values(world.characters).filter((x) => x.persistent && x.alive)) {
    const rel = c.relationships[world.mcId];
    const stage = c.isMC ? null : STAGE_LABELS[relationshipStage(rel)];
    L.push(`### ${c.name}${c.title ? ` "${c.title}"` : ''}${c.isMC ? ' (MC)' : ''}`);
    L.push(`${c.race} ${c.sex}, ${c.age} — ${CLASSES[c.charClass].label} L${c.level}${c.inParty ? ' · party' : ''}. ${c.description}`);
    L.push(`Personality: ${c.personality.join(', ') || '—'}. Values: ${c.values.join(', ')}.`);
    if (stage && rel) L.push(`Toward ${mc.name}: **${stage}** (affection ${rel.affection}, trust ${rel.trust}, respect ${rel.respect}, attraction ${rel.attraction}, commitment ${rel.commitment})`);
    const scars = c.permanentBonuses.filter((b) => b.startsWith('Scar:'));
    if (scars.length) L.push(`Marks: ${scars.join('; ')}`);
    if (c.memories.length) {
      L.push('Defining memories:');
      for (const m of [...c.memories].sort((a, b) => b.importance - a.importance).slice(0, 4)) L.push(`- Day ${m.day}: ${m.event}`);
    }
    L.push('');
  }

  L.push('## The spine — What Lies Beneath Blackwall');
  for (const q of mainQuests(world)) {
    L.push(`- Stage ${q.stage}: **${q.title}** — ${q.status}${q.choice?.chosen ? ` · decision: ${q.choice.options.find((o) => o.key === q.choice!.chosen)?.label}` : ''}`);
    if (q.status === 'completed' && q.revelation) L.push(`  - _Revelation:_ ${q.revelation}`);
  }
  L.push('');

  L.push('## Factions');
  for (const f of Object.values(world.factions)) {
    L.push(`- **${f.name}** (power ${f.power}) — ${f.description} Standing: ${mc.factionReputation[f.id] ?? 0 >= 0 ? '+' : ''}${mc.factionReputation[f.id] ?? 0}.`);
  }
  const guilds = GUILDS.filter((g) => guildRank(world, g.key) !== null);
  if (guilds.length) {
    L.push('', '## Guild standing');
    for (const g of guilds) L.push(`- ${g.name}: rank ${guildRank(world, g.key)} — ${guildTitle(world, g.key)}`);
  }

  L.push('', '## Dungeons');
  for (const d of Object.values(world.dungeons)) {
    const explored = Object.values(d.rooms).filter((r) => r.explored).length;
    L.push(`- **${d.name}** (${d.recommendedLevel}) — ${d.generated ? `${explored}/${Object.keys(d.rooms).length} rooms walked` : 'unentered'}${d.bossDefeated ? ' · master destroyed' : ''}`);
  }

  const done = Object.values(world.quests).filter((q) => q.status === 'completed' && !q.isMain);
  if (done.length) {
    L.push('', '## Work completed');
    for (const q of done) L.push(`- ${q.title}${q.guild ? ` (${GUILDS.find((g) => g.key === q.guild)?.name})` : ''}${q.personal ? ` (${world.characters[q.personal]?.name}'s story)` : ''}`);
  }

  if ((world.codex ?? []).length) {
    L.push('', '## Codex — recovered writings');
    for (const id of world.codex!) {
      const lore = loreById(id);
      if (lore) L.push(`### ${lore.title}`, lore.text, '');
    }
  }

  const earned = ACHIEVEMENTS.filter((a) => (world.achievements ?? []).includes(a.key));
  if (earned.length) {
    L.push('', '## Deeds', ...earned.map((a) => `- ${a.label} — ${a.desc}`));
  }

  L.push('', '## Where things stand', `Party at ${world.locations[world.partyLocation]?.name}, Day ${world.time.day} ${fmtTime(world.time)}. ${mc.name} holds ${fmtMoney(mc.money)}${world.bounty ? `; bounty ${fmtMoney(world.bounty)}` : ''}.${world.doom?.stage ? ` The Circle's clock stands at ${world.doom.stage}/4.` : ''}`);
  return L.join('\n');
}

/** "Previously, in Blackwall…" — grounded recap for the next book's opening. */
export async function generateRecap(cfg: LlmConfig, world: WorldState): Promise<string> {
  const beats: string[] = [];
  for (const q of mainQuests(world).filter((q) => q.status === 'completed')) {
    beats.push(`- Completed: ${q.title}${q.revelation ? ` — learned: ${q.revelation}` : ''}${q.choice?.chosen ? ` — chose: ${q.choice.options.find((o) => o.key === q.choice!.chosen)?.label}` : ''}`);
  }
  for (const e of world.events.filter((e) => ['personal.completed', 'party.join', 'household.purchased', 'guild.mastery', 'character.death', 'doom'].includes(e.kind)).slice(-20)) {
    beats.push(`- ${e.summary}`);
  }
  const cast = Object.values(world.characters).filter((c) => c.inParty && c.alive).map((c) => `${c.name} (${CLASSES[c.charClass].label}, ${STAGE_LABELS[relationshipStage(c.relationships[world.mcId])]})`);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'Write a "Previously, in Blackwall…" recap for the front of the next book in a gritty LitRPG saga: 150-250 words, past tense, momentum over completeness, ending on the sharpest open thread. Use ONLY the facts given. Output only the recap.',
    },
    { role: 'user', content: `PARTY: ${cast.join('; ')}\n\nWHAT HAPPENED:\n${beats.join('\n')}` },
  ];
  return (await chatWithNpc({ ...cfg, temperature: 0.6 }, messages)).trim();
}
