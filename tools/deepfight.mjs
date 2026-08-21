// Why does a L52 party lose in the Hollow Crown? Simulate.
import { buildSeedWorld } from '../src/data/seed';
import { applyTraining, makeItem, addToContainer } from '../src/engine/rules';
import { startCombat, autoResolve } from '../src/engine/combat';
import { partyMembers } from '../src/engine/world';

function bigParty(level) {
  const w = buildSeedWorld();
  for (const id of ['CHAR_LYRA', 'CHAR_MARA', 'CHAR_YVENNE', 'CHAR_KESS']) {
    const c = w.characters[id];
    if (c) { c.inParty = true; c.location = w.partyLocation; }
  }
  for (const c of partyMembers(w)) {
    while (c.level < level) { c.xp = 10_000_000; applyTraining(c); }
    c.hp.current = c.hp.max;
    c.mana.current = c.mana.max;
    c.stamina.current = c.stamina.max;
    // decent endgame gear
    const wpn = makeItem(w, 'steel-longsword', 1);
    addToContainer(w, wpn, c);
    c.equipment['main-hand'] = wpn.id; wpn.equippedBy = c.id;
    const arm = makeItem(w, 'scale-hauberk', 1);
    addToContainer(w, arm, c);
    c.equipment['armor'] = arm.id; arm.equippedBy = c.id;
  }
  return w;
}

const PACKS = [
  ['crown pack', [{ templateKey: 'void-spawn', count: 3 }, { templateKey: 'lich-acolyte', count: 2 }]],
  ['crown small', [{ templateKey: 'void-spawn', count: 2 }]],
  ['the king', [{ templateKey: 'the-hollow-king', count: 1 }]],
];
for (const [label, monsters] of PACKS) {
  let wins = 0, defeats = 0, fled = 0, totalRounds = 0, partyHpLeft = 0;
  for (let s = 0; s < 20; s++) {
    const w = bigParty(52);
    const combat = startCombat(w, { seed: s, description: label, monsters, source: 'dungeon', locationId: w.partyLocation });
    autoResolve(w);
    totalRounds += combat.round;
    if (combat.outcome === 'victory') { wins++; partyHpLeft += partyMembers(w).reduce((a, c) => a + c.hp.current, 0) / partyMembers(w).reduce((a, c) => a + c.hp.max, 0); }
    else if (combat.outcome === 'defeat') defeats++;
    else fled++;
  }
  console.log(`${label}: ${wins}W/${defeats}L/${fled}F over 20, avg rounds ${(totalRounds / 20).toFixed(1)}, avg hp left on win ${(partyHpLeft / Math.max(1, wins) * 100).toFixed(0)}%`);
}
// stat sheet for reference
const w = bigParty(52);
const kael = w.characters[w.mcId];
console.log('L52 fighter:', `hp ${kael.hp.max} atk ${kael.attack} def ${kael.defense}`);
