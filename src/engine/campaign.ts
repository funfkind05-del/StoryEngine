// The campaign spine: what is under Blackwall. Eight main quests
// threaded through the eight dungeons in level order. Each stage is
// offered by a citizen with their own reasons, each boss guards a
// piece of the truth, and each turn-in pays a REVELATION — an
// accurate world-truth knowledge entry the whole party learns. The
// knowledge-separation system then does the rest: what the party
// knows, what the Circle knows, and what the reader suspects drift
// apart and reconverge, which is the saga.

import type { Quest, WorldState } from './types';
import { logEvent, partyMembers } from './world';

interface CampaignStage {
  stage: number;
  choice?: Quest['choice'];
  title: string;
  giver: Quest['giver'];
  giverLocation: string;
  dungeonId: string;
  description: string;
  offerText: string; // logged when the stage opens
  revelation: string;
  reward: Quest['reward'];
}

export const CAMPAIGN: CampaignStage[] = [
  {
    stage: 1,
    title: 'What Sleeps Below',
    giver: 'CHAR_SELLA',
    giverLocation: 'LOC_TEMPLE',
    dungeonId: 'DUN_OLDQUARTER_001',
    description: 'Sister Sella has heard what the grave-robbers woke under Saint Varro’s crypts. The temple will pay to have it put back to sleep — permanently.',
    offerText: 'Sister Sella at the temple is asking after sellswords who aren’t afraid of the old crypts.',
    revelation: 'The Crypt Warden was not guarding the dead. The tombs of Saint Varro are a plug — the crypts were built DOWNWARD, to close something, and the Warden stood watch on the inside.',
    reward: { money: 800, itemProtos: ['healing-potion'], factionRep: { FAC_VEILEDFLAME: 2 }, xp: 150 },
  },
  {
    stage: 2,
    title: 'The Water Under the Stone',
    giver: 'CHAR_SELLA',
    giverLocation: 'LOC_TEMPLE',
    dungeonId: 'DUN_DOCKWARD_001',
    description: 'The Warden’s tomb bore water-marks fathoms above any flood line. Sella traced the old survey maps: the Drowning Cellars run UNDER the crypts. Whatever the plug holds back, the smugglers have been living on its roof. Clear the Cellars to their king.',
    offerText: 'Sister Sella sends word: the survey maps arrived. The Drowning Cellars run beneath everything — she needs them cleared.',
    revelation: 'The flooded tunnels are older than the city above them. The under-river does not drain TO the harbor — it flows FROM somewhere beneath the Old Quarter, and the water is warm.',
    reward: { money: 1500, factionRep: { FAC_VEILEDFLAME: 1 }, xp: 400 },
  },
  {
    stage: 3,
    title: 'The Branded Door',
    giver: 'CHAR_DORN',
    giverLocation: 'LOC_IRONMARKET_SQ',
    dungeonId: 'DUN_OLDQUARTER_002',
    description: 'Captain Dorn has watched the Ash Circle for years and called them mad beggars. Now his informants say their warrens have SHORING — engineered tunnels, driven with purpose. Mad beggars don’t survey. Break the warrens and bring him their Hierophant.',
    offerText: 'Captain Dorn is quietly hiring: the Ash Circle’s digging has the Watch worried enough to pay well.',
    revelation: 'The Ash Circle is not worshipping. It is EXCAVATING — and has been for generations. The Hierophant’s ledger records depths, headings, and one name written where a god’s should be: the Hollow King.',
    reward: { money: 3000, factionRep: { FAC_WATCH: 2, FAC_ASHCIRCLE: -3 }, xp: 900 },
    choice: {
      prompt: 'The Hierophant’s ledger is in your hands. Who gets it?',
      options: [
        { key: 'dorn', label: 'Hand it to Captain Dorn', description: 'The Watch archives it — and owes you.', factionRep: { FAC_WATCH: 2 }, knowledge: 'Dorn holds the Hierophant’s ledger. The Watch now knows the Circle digs with purpose.' },
        { key: 'varga', label: 'Sell it to Varga', description: 'The Knives pay well for maps of what’s under the city.', money: 2500, factionRep: { FAC_REDKNIVES: 2, FAC_WATCH: -2 }, knowledge: 'Varga bought the Hierophant’s ledger. Whatever the Knives want below, they now have headings.' },
        { key: 'keep', label: 'Keep it', description: 'Nobody knows you have it. Yet.', knowledge: 'The party kept the Hierophant’s ledger — depths, headings, and the Hollow King’s name, hidden in their own storage.' },
      ],
    },
  },
  {
    stage: 4,
    title: 'What the Vaults Bank',
    giver: 'CHAR_VARGA',
    giverLocation: 'LOC_SALTWAREHOUSE',
    dungeonId: 'DUN_IRONMARKET_001',
    description: 'Varga fences what comes up from below, and she has seen what certain buyers pay for it. The sealed countinghouse interests her: a bank does not brick itself up over a robbery. Open the Undervaults and she’ll split what the Coin Guild buried.',
    offerText: 'Varga has an opening for people who can walk into a place the Coin Guild pays to keep shut.',
    revelation: 'The bank did not fail — it BREACHED. The vault crews dug for bedrock and found worked stone below it. The Coin Guild has paid for forty years of silence, and the Gilded Golem was minted to make sure the silence held.',
    reward: { money: 8000, factionRep: { FAC_REDKNIVES: 2, FAC_COINGUILD: -2 }, xp: 2000 },
    choice: {
      prompt: 'The vault stands open and the Coin Guild’s forty-year secret with it.',
      options: [
        { key: 'varga', label: 'Split it with Varga, as agreed', description: 'A deal kept is leverage forever.', factionRep: { FAC_REDKNIVES: 2 }, knowledge: 'Varga honored the split. The Red Knives consider the party good for their word.' },
        { key: 'guild', label: 'Ransom the silence back to the Coin Guild', description: 'They paid forty years for quiet; they’ll pay you too.', money: 6000, factionRep: { FAC_COINGUILD: 2, FAC_REDKNIVES: -3 }, knowledge: 'The Coin Guild bought the party’s silence about the breach beneath the Undervaults. Varga was cut out, and knows it.' },
      ],
    },
  },
  {
    stage: 5,
    title: 'The Under-River',
    giver: 'CHAR_MARA',
    giverLocation: 'LOC_DOCK_0042',
    dungeonId: 'DUN_DOCKWARD_002',
    description: 'Mara Venn has been selling you rumors for coin since you met. This one she gives away scared: things are coming UP the sewers that never used to. She knows the deep galleries. She wants the Tyrant of the under-river dead before it learns the way to Ratcatcher Lane.',
    offerText: 'Mara Venn, of all people, is offering to SHARE a job. That alone should worry you.',
    revelation: 'The under-river is a road. Whatever sits beneath the city breathes through it, and on the out-breath, things ride the current up. The Sewer Tyrant was not the source — it was a toll-keeper.',
    reward: { money: 15000, factionRep: { FAC_REDKNIVES: 1 }, xp: 4000 },
  },
  {
    stage: 6,
    title: 'The Drowned Temple',
    giver: 'CHAR_SELLA',
    giverLocation: 'LOC_TEMPLE',
    dungeonId: 'DUN_HARBOR_001',
    description: 'Sella has stopped pretending this is temple business. Under the harbor stands a temple older than Blackwall’s gods, and its priesthood never disbanded — it went under with the tide. What they worship openly is what the city was built to forget. Silence their Priest.',
    offerText: 'Sister Sella asks for you by name now. She has found where the old faith went when the city drowned it.',
    revelation: 'Before Blackwall there was a temple, and the temple served what lies beneath. The city’s founders did not defeat it — they DROWNED the temple, raised the crypts as a seal, and wrote their god-king out of every record. The thing below is not dead. It is held. It has been held for three hundred years.',
    reward: { money: 30000, factionRep: { FAC_VEILEDFLAME: 3 }, xp: 9000 },
    choice: {
      prompt: 'The drowned archive names every founder — including the line that became the city’s great houses. Sella asks what you intend.',
      options: [
        { key: 'truth', label: 'Let Sella publish the truth', description: 'The city learns what it was built on.', factionRep: { FAC_VEILEDFLAME: 2, FAC_WATCH: -1 }, knowledge: 'The temple published the drowned archive. All Blackwall now knows the founders sealed something alive beneath the city.' },
        { key: 'bury', label: 'Bury it again', description: 'Some seals hold because nobody picks at them.', factionRep: { FAC_WATCH: 2 }, knowledge: 'The party reburied the drowned archive. Only they and Sella know the founders’ whole crime — and the great houses owe their ignorance to you.' },
      ],
    },
  },
  {
    stage: 7,
    title: 'The Wyrm’s Vigil',
    giver: 'CHAR_HARROW',
    giverLocation: 'LOC_FORGE',
    dungeonId: 'DUN_HIGHCOURT_001',
    description: 'Master Harrow has kept a dwarf’s silence about the Wyrmspire his whole life. No longer: the wyrm beneath it is no squatter. His grandmother’s people FORGED its vigil — the last warden set by the founders, bound to guard the deep approach. It has stopped answering the old signs. Find out why.',
    offerText: 'Master Harrow shut the forge at midday — a thing not seen in thirty years — and asked for you.',
    revelation: 'The wyrm was the founders’ last living seal, bound to the deep approach beneath the spire. It stopped answering because it was already listening to something else. The seals are not failing one by one. They are being OPENED in order — and the order ends at the Hollow Gate.',
    reward: { money: 60000, xp: 20000 },
  },
  {
    stage: 8,
    title: 'The Hollow Crown',
    giver: 'CHAR_SELLA',
    giverLocation: 'LOC_TEMPLE',
    dungeonId: 'DUN_DEEP_001',
    description: 'The gate with no hinges has opened three times in written history. It is opening a fourth. The Hollow King — first to open it, first to kneel to what waited, herald for three hundred years — is calling every root of the buried thing awake. Go down through the palace under everything, take his crown, and decide what Blackwall owes the thing his master became.',
    offerText: 'The Hollow Gate is warm to the touch. Sella does not ask this time. She only tells you what stands open.',
    revelation: 'The Hollow King wears the crown of Blackwall’s written-out god-king — the founder who opened the gate, knelt, and was remade as its herald. With his crown taken, the buried thing has no voice above. What it has instead, now, is your attention. (End of the recorded spine — the rest is yours to write.)',
    reward: { money: 200000, xp: 60000, factionRep: { FAC_VEILEDFLAME: 3, FAC_WATCH: 3 } },
  },
];

function questId(world: WorldState): string {
  const n = (world.counters['QST'] ?? 0) + 1;
  world.counters['QST'] = n;
  return `QST_${String(n).padStart(3, '0')}`;
}

function stageToQuest(world: WorldState, s: CampaignStage): Quest {
  return {
    id: questId(world),
    title: s.title,
    giver: s.giver,
    giverLocation: s.giverLocation,
    description: s.description,
    objectives: [{ kind: 'clear-boss', dungeonId: s.dungeonId, done: false }],
    reward: s.reward,
    status: 'offered',
    offeredDay: world.time.day,
    isMain: true,
    stage: s.stage,
    revelation: s.revelation,
    choice: s.choice ? { prompt: s.choice.prompt, options: s.choice.options.map((o) => ({ ...o })) } : undefined,
  };
}

export function mainQuests(world: WorldState): Quest[] {
  return Object.values(world.quests).filter((q) => q.isMain).sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));
}

export function campaignStageNumber(world: WorldState): number {
  const done = mainQuests(world).filter((q) => q.status === 'completed');
  return done.length ? Math.max(...done.map((q) => q.stage ?? 0)) + 1 : (mainQuests(world)[0]?.stage ?? 1);
}

export function latestRevelation(world: WorldState): string | null {
  const done = mainQuests(world).filter((q) => q.status === 'completed' && q.revelation);
  if (!done.length) return null;
  return done[done.length - 1].revelation ?? null;
}

/**
 * Ensure the campaign exists and the correct next stage is on offer.
 * Idempotent; safe for old saves (adopts a pre-campaign "What Sleeps
 * Below" if present, and respects already-defeated bosses).
 */
export function ensureCampaign(world: WorldState) {
  // adopt the legacy stage-1 quest from pre-campaign saves
  const legacy = Object.values(world.quests).find((q) => q.title === 'What Sleeps Below' && !q.isMain);
  if (legacy) {
    legacy.isMain = true;
    legacy.stage = 1;
    legacy.revelation = CAMPAIGN[0].revelation;
  }
  const main = mainQuests(world);
  if (main.some((q) => q.status === 'offered' || q.status === 'active' || q.status === 'ready')) return;
  const completedStages = new Set(main.filter((q) => q.status === 'completed').map((q) => q.stage));
  const next = CAMPAIGN.find((s) => !completedStages.has(s.stage) && !main.some((q) => q.stage === s.stage && q.status !== 'declined'));
  if (!next) return;
  const q = stageToQuest(world, next);
  world.quests[q.id] = q;
  if (next.stage > 1) {
    logEvent(world, 'campaign.offered', { stage: next.stage, quest: q.id }, next.offerText, { witnesses: partyMembers(world).map((c) => c.id) });
  }
}

/** Called after a main quest is turned in: pay the revelation, open the next stage. */
export function advanceCampaign(world: WorldState, completed: Quest) {
  if (!completed.isMain) return;
  if (completed.revelation) {
    for (const c of partyMembers(world)) {
      c.knowledge.push({ fact: completed.revelation, day: world.time.day, accurate: true });
    }
    logEvent(world, 'campaign.revelation', { stage: completed.stage, quest: completed.id }, `REVELATION (stage ${completed.stage}): ${completed.revelation}`, { witnesses: partyMembers(world).map((c) => c.id) });
  }
  const next = CAMPAIGN.find((s) => s.stage === (completed.stage ?? 0) + 1);
  if (next) {
    const q = stageToQuest(world, next);
    world.quests[q.id] = q;
    logEvent(world, 'campaign.offered', { stage: next.stage, quest: q.id }, next.offerText, { witnesses: partyMembers(world).map((c) => c.id) });
  } else {
    logEvent(world, 'campaign.complete', {}, 'The recorded spine of the campaign is complete. What Blackwall does with an unsealed, voiceless god below it is the author’s to write.');
  }
}
