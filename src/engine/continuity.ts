// Continuity checker: compares manuscript scenes against simulation
// state and returns warnings. It never rewrites the manuscript.

import type { ContinuityWarning, Scene, WorldState } from './types';

const TOKEN_RE = /@\[([^\]]+)\]\(([A-Z]+_[A-Za-z0-9_]+)\)/g;

export function extractTokens(text: string): { name: string; id: string }[] {
  const out: { name: string; id: string }[] = [];
  for (const m of text.matchAll(TOKEN_RE)) out.push({ name: m[1], id: m[2] });
  return out;
}

export function checkScene(world: WorldState, scene: Scene): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  const warn = (severity: 'warning' | 'error', message: string) =>
    warnings.push({ sceneId: scene.id, severity, message });

  const tokens = extractTokens(scene.text);

  for (const tok of tokens) {
    const isChar = tok.id.startsWith('CHAR') || tok.id.startsWith('NPC');
    const isLoc = tok.id.startsWith('LOC');
    const isItem = tok.id.startsWith('ITEM');
    if (isChar) {
      const c = world.characters[tok.id];
      if (!c) {
        warn('error', `Reference to unknown character id ${tok.id} ("${tok.name}").`);
        continue;
      }
      if (!c.alive && c.diedOnDay !== undefined && scene.day >= c.diedOnDay) {
        warn('error', `${c.name} is dead (died Day ${c.diedOnDay}) but appears in this scene set on Day ${scene.day}.`);
      }
      if (c.name !== tok.name) {
        warn('warning', `Token "${tok.name}" points at ${c.name} (${c.id}) — name drift?`);
      }
    } else if (isLoc) {
      const l = world.locations[tok.id];
      if (!l) warn('error', `Reference to unknown location id ${tok.id} ("${tok.name}").`);
      else if (l.state === 'destroyed') warn('warning', `${l.name} is currently DESTROYED in the simulation. Make sure the scene reflects that (or predates it).`);
    } else if (isItem) {
      const it = world.items[tok.id];
      if (!it) {
        warn('error', `Reference to unknown item id ${tok.id} ("${tok.name}").`);
        continue;
      }
      if (it.broken) warn('warning', `${it.name} is broken in the simulation.`);
      if (it.owner && !scene.participants.includes(it.owner) && world.characters[it.owner]) {
        warn('warning', `${it.name} is owned by ${world.characters[it.owner].name}, who is not a participant in this scene.`);
      }
      if (!it.owner) warn('warning', `${it.name} currently has no owner in the simulation (sold, consumed, or left behind).`);
    }
  }

  // Dead characters mentioned by plain name (no token)
  for (const c of Object.values(world.characters)) {
    if (c.alive || !c.persistent) continue;
    if (c.diedOnDay !== undefined && scene.day >= c.diedOnDay && scene.text.includes(c.name) && !tokens.some((t) => t.id === c.id)) {
      warn('warning', `Scene text mentions "${c.name}", who died on Day ${c.diedOnDay} (scene is Day ${scene.day}).`);
    }
  }

  // Participants: where does the simulation put them right now?
  if (scene.day === world.time.day) {
    for (const pid of scene.participants) {
      const c = world.characters[pid];
      if (!c) continue;
      if (c.alive && c.location !== scene.location) {
        const locName = world.locations[c.location]?.name ?? c.location;
        const sceneLocName = world.locations[scene.location]?.name ?? scene.location;
        warn('warning', `${c.name} is listed as a participant at ${sceneLocName}, but the simulation currently places them at ${locName}.`);
      }
    }
  }

  // Scene set in the simulation's future
  if (scene.day > world.time.day) {
    warn('warning', `Scene is dated Day ${scene.day}, but the simulation clock is only at Day ${world.time.day}.`);
  }

  return warnings;
}

export function checkAllScenes(world: WorldState): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = [];
  const ordered = [...world.scenes].sort((a, b) => a.order - b.order);
  for (const s of ordered) warnings.push(...checkScene(world, s));
  // chronological ordering across the manuscript
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (cur.day < prev.day || (cur.day === prev.day && cur.startMinute < prev.startMinute)) {
      warnings.push({
        sceneId: cur.id,
        severity: 'warning',
        message: `"${cur.title}" (Day ${cur.day}) comes after "${prev.title}" (Day ${prev.day}) in the manuscript but is set earlier in world time. Intentional flashback?`,
      });
    }
  }
  return warnings;
}
