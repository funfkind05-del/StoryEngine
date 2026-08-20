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
  dungeonId?: string;
  /** overrides the default clear-boss objective when set */
  objectives?: Quest['objectives'];
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


// ---------- the second spine: THE VOICELESS (stages 9–16) ----------
// The crown is taken; the thing below has no herald. Arc 2 is the
// vacancy: what a god-sized want does without a voice, and who
// auditions to become one. It ends with the party deciding what
// fills the silence — possibly themselves.
export const CAMPAIGN2: CampaignStage[] = [
  {
    stage: 9,
    title: 'The Quiet After',
    giver: 'CHAR_SELLA',
    giverLocation: 'LOC_TEMPLE',
    objectives: [{ kind: 'visit', locationId: 'LOC_HOLLOWGATE', done: false }],
    description: 'The crown sits in whatever keeping you left it, and the city sleeps better than it has in three hundred years. Sella does not. The gate is cool, the under-river runs quiet — and every sensitive in the temple is dreaming of roots. She wants your eyes on the Hollow Gate before she trusts the quiet.',
    offerText: 'Sister Sella found sleeping draughts in the novices’ cells. All of them. She asks you to walk down and LOOK at the gate.',
    revelation: 'The quiet is not peace. The gate has grown a lip of new stone — worked stone, grown not built — and it runs DOWNWARD, out of the palace, like roots leaving a pot. The thing below has stopped waiting for a voice. It is growing toward everything, slowly, instead.',
    reward: { money: 5000, xp: 4000, factionRep: { FAC_VEILEDFLAME: 2 } },
  },
  {
    stage: 10,
    title: 'What the Salt Keeps',
    giver: 'CHAR_VARGA',
    giverLocation: 'LOC_SALTWAREHOUSE',
    dungeonId: 'DUN_TIDE_001',
    description: 'The Tidecourt’s deed to the Saltworks predates the Tidecourt. Varga finally read the small print: the works were built to CURE things — to keep them, unrotting, indefinitely. Something down there has been held in brine for centuries, and the roots are growing toward it with intent. Get to the Salt Queen’s pans first.',
    offerText: 'Varga bought a drink and paid for it. Then she showed you the Saltworks deed, and the word underlined in it: PRESERVATIF.',
    revelation: 'The Saltworks were the founders’ pantry: what could not be killed and could not be buried was SALTED. The Queen kept the inventory. The roots want the inventory. The inventory, gods help everyone, is wakeable.',
    reward: { money: 40000, xp: 15000, factionRep: { FAC_TIDECOURT: 2 } },
  },
  {
    stage: 11,
    title: 'The Watch That Knew',
    giver: 'CHAR_DORN',
    giverLocation: 'LOC_IRONMARKET_SQ',
    dungeonId: 'DUN_WILD_001',
    description: 'Dorn pulled the oldest maps the Watch owns. The Broken Watch on the eastern hills was not built against raiders: its arrow-slits face INWARD and DOWNWARD. The kingdom nobody remembers built it over a root — and garrisoned it until the pay-chits stopped. He wants to know what its revenant warden was still standing watch OVER.',
    offerText: 'Captain Dorn spread a map older than the city across his desk and put his finger on the Broken Watch. "Explain this to me."',
    revelation: 'The dead kingdom knew about the roots a thousand years before Blackwall was founded. The Broken Watch was one fort in a RING — a perimeter around the buried thing, wide as the whole hinterland. Blackwall was built inside the cordon. The founders knew. They built anyway. The harbor was too good.',
    reward: { money: 45000, xp: 18000, factionRep: { FAC_WATCH: 2 } },
  },
  {
    stage: 12,
    title: 'The Choir Below',
    giver: 'CHAR_SELLA',
    giverLocation: 'LOC_TEMPLE',
    objectives: [{ kind: 'kill', templateKey: 'void-choir', count: 2, baseline: 0 }],
    description: 'The dreams have words now. The temple sensitives wake singing — the same held note, the same question. Something in the Rootways is teaching the city to sing in its sleep, one dreamer at a time, and Sella can name the tune: it is a CALL FOR CANDIDATES. Go down into the roots and silence the choirs.',
    offerText: 'A novice sang in her sleep last night in a pitch no human throat should hold. Sella stopped writing letters and started sharpening things.',
    revelation: 'The choirs sing with the god’s stolen voice — scraps of it, hoarded since the crown fell. They are not worshipping. They are ADVERTISING: broadcasting the vacancy into every sleeping mind in reach, auditioning the city itself for a new herald.',
    reward: { money: 60000, xp: 25000, factionRep: { FAC_VEILEDFLAME: 2 } },
  },
  {
    stage: 13,
    title: 'The Standing Applicant',
    giver: 'board',
    giverLocation: 'LOC_GRAVEROW',
    objectives: [{ kind: 'kill', templateKey: 'ossuary-colossus', count: 1, baseline: 0 }],
    description: 'The Bonewardens post it plainly, because they are past pride: every ossuary in the district emptied in one night, and the bones walked DOWN. Something in the Rootways is building itself a body big enough for a god to wear, one borrowed skeleton at a time.',
    offerText: 'The Bonewardens’ notice is four words and a purse: "OUR DEAD WALKED DOWN."',
    revelation: 'The colossus was not attacking anything. It was STANDING — in the deepest root-chamber, where the throne could see it, wearing ten thousand of Blackwall’s dead like a fitted suit. An applicant, dressing for the interview. It will not be the last, and the next ones will not stand still.',
    reward: { money: 70000, xp: 30000, factionRep: { FAC_BONEWARDENS: 3 } },
  },
  {
    stage: 14,
    title: 'The Ash Regent',
    giver: 'CHAR_DORN',
    giverLocation: 'LOC_IRONMARKET_SQ',
    objectives: [{ kind: 'kill', templateKey: 'ash-seraph', count: 1, baseline: 0 }],
    description: 'The Ash Circle should have died with its Hierophant. Instead its remnant found the Rootways and BURNED ITS WAY IN — and what walked out of the fire calls itself the Regent of Ash, keeping the throne warm for a king it means to become. Dorn is done watching. So, privately, is the Circle’s own surviving membership.',
    offerText: 'A cult remnant nailed a proclamation to the Watch-house door: the vacancy below is FILLED, pending coronation. Dorn is hiring everyone.',
    revelation: 'The seraph was a founder — the dissenting one, the name struck from the minutes, kept in ash and grudge for three hundred years by the Circle he built. He voted against the sealing because he wanted the throne OPEN. Everything since — the digging, the doors opened in order — was one long application, and the thing below still has not said yes to anyone. It is holding the vacancy. As if it is waiting for someone specific.',
    reward: { money: 90000, xp: 40000, factionRep: { FAC_WATCH: 3, FAC_ASHCIRCLE: -5 } },
    choice: {
      prompt: 'The Regent’s ashes are still warm, and the question he died auditioning for now hangs in the air, addressed — the choirs were always addressing — to you.',
      options: [
        { key: 'refuse', label: 'Refuse it, aloud, at the gate', description: 'Say no to a god. See if no is a word it keeps.', knowledge: 'The party stood at the Hollow Gate and refused the vacancy aloud. The held note stopped for nine heartbeats. Then it resumed, patient, a half-step lower.' },
        { key: 'silent', label: 'Say nothing. Keep the question open', description: 'An unanswered question is leverage on a god.', knowledge: 'The party left the god’s question unanswered. The vacancy stays open, and whoever holds their silence holds the only bargaining chip the thing below respects.' },
      ],
    },
  },
  {
    stage: 15,
    title: 'The Gilded Claim',
    giver: 'CHAR_VARGA',
    giverLocation: 'LOC_SALTWAREHOUSE',
    objectives: [{ kind: 'kill', templateKey: 'gilded-lich', count: 1, baseline: 0 }],
    description: 'The Coin Guild’s answer to a divine vacancy was always going to be a BID. Their forty-years-dead founding treasurer has been down in the vaults the whole time, gilded and patient, and he has moved into the Rootways with the Guild’s deep ledger — proposing to BUY the throne with three centuries of compounded interest on the whole city’s debt. Varga would like the ledger. Everyone else would like him stopped.',
    offerText: 'Varga slid a Guild obituary across the table, forty years old. "He’s been accruing," she said. "He’s gone below to collect."',
    revelation: 'The lich’s deep ledger names what Blackwall owes the thing below — every founder’s bargain, every drowned sailor the harbor kept, every good year the city did not earn — and the sum is real, and the thing below keeps ACCOUNTS. The debt cannot be paid in coin. The lich knew that. His bid was the city itself, signed over as collateral.',
    reward: { money: 120000, xp: 50000, factionRep: { FAC_COINGUILD: -2, FAC_REDKNIVES: 2 } },
  },
  {
    stage: 16,
    title: 'The Second Silence',
    giver: 'CHAR_SELLA',
    giverLocation: 'LOC_TEMPLE',
    dungeonId: 'DUN_DEEP_002',
    description: 'The failed applicants are dead and the roots have stopped growing — not in defeat, in ATTENTION. At the bottom of the Rootways something has finally stood up wearing the office all of them wanted: a Herald of the Hollow, grown by the thing below from three hundred years of held breath, coming up to deliver, in person, the offer it has been holding for you since the crown came off. Go down and answer it — whatever your answer is.',
    offerText: 'Every dreamer in Blackwall woke at the same hour, calm, and said the same sentence to whoever was nearest: "IT IS SENDING SOMEONE UP."',
    revelation: 'The Herald spoke one sentence before the end, and it was an offer of terms: the thing below does not want OUT. It wants to be KNOWN — held, named, remembered, the way the wyrm was bound by memory — and it will accept the party as its wardens, its namers, its second silence. The founders sealed it with stone and forgetting. It proposes to be sealed, instead, with witnesses. (End of the second spine — the terms are the author’s to write.)',
    reward: { money: 400000, xp: 120000, factionRep: { FAC_VEILEDFLAME: 3, FAC_WATCH: 3, FAC_BONEWARDENS: 3 } },
  },
];

const SPINE: CampaignStage[] = [...CAMPAIGN, ...CAMPAIGN2];

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
    objectives: s.objectives ? s.objectives.map((o) => ({ ...o })) : [{ kind: 'clear-boss', dungeonId: s.dungeonId!, done: false }],
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
  const next = SPINE.find((s) => !completedStages.has(s.stage) && !main.some((q) => q.stage === s.stage && q.status !== 'declined'));
  if (!next) return;
  const q = stageToQuest(world, next);
  world.quests[q.id] = q;
  if (next.stage > 1) {
    logEvent(world, 'campaign.offered', { stage: next.stage, quest: q.id }, next.offerText, { witnesses: partyMembers(world).map((c) => c.id) });
  }
}

// ---------- the Circle's clock ----------
// The villain is not waiting. If the spine's current stage sits idle
// too long, the Ash Circle advances — the world degrades in stages,
// loudly, until the party moves. Toggleable (world.doomEnabled).

export const DOOM_STAGE_DAYS = 30; // idle days per doom advance
export const DOOM_MAX = 4;

export function doomTick(world: WorldState) {
  if (world.doomEnabled === false) return;
  const open = mainQuests(world).find((q) => q.status === 'offered' || q.status === 'active' || q.status === 'ready');
  if (!open) return; // spine finished — the clock stops
  world.doom ??= { stage: 0, lastAdvanceDay: open.offeredDay };
  const idleSince = Math.max(world.doom.lastAdvanceDay, open.offeredDay);
  if (world.time.day - idleSince < DOOM_STAGE_DAYS || world.doom.stage >= DOOM_MAX) return;
  world.doom.stage += 1;
  world.doom.lastAdvanceDay = world.time.day;
  const stage = world.doom.stage;
  const circle = world.factions['FAC_ASHCIRCLE'];
  if (stage === 1) {
    if (circle) circle.power = Math.min(10, circle.power + 1);
    logEvent(world, 'doom', { stage }, 'THE CIRCLE MOVES: new converts in ash-marked grey preach openly in three districts. Whatever they dig toward, they dig faster now.');
  } else if (stage === 2) {
    const cleared = Object.values(world.dungeons).find((d) => d.bossDefeated && d.id !== 'DUN_DEEP_001');
    if (cleared) {
      cleared.bossDefeated = false;
      logEvent(world, 'doom', { stage, dungeon: cleared.id }, `THE CIRCLE MOVES: something stirs again in ${cleared.name}. What the party put down has been... encouraged back up.`);
    } else {
      logEvent(world, 'doom', { stage }, 'THE CIRCLE MOVES: the under-river runs warm for a week straight. The sewermen stop going below the second gallery.');
    }
  } else if (stage === 3) {
    const grave = world.locations['LOC_GRAVEROW'];
    if (grave) {
      grave.state = 'occupied';
      grave.dangerRating = Math.min(10, grave.dangerRating + 2);
    }
    logEvent(world, 'doom', { stage }, 'THE CIRCLE MOVES: the Cemetery District belongs to the ash-marked after dark now. The Watch pulled its patrols. The digging is audible from the street.');
  } else {
    for (const c of partyMembers(world)) {
      c.knowledge.push({ fact: 'The Hollow Gate is warming ahead of any schedule the founders feared. The Circle is no longer digging TOWARD something — they are digging it OUT.', day: world.time.day, accurate: true });
    }
    logEvent(world, 'doom', { stage }, 'THE CIRCLE MOVES: the Hollow Gate is warm to the touch and the party knows it. The spine of this story has stopped waiting for them.');
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
  if (world.doom) world.doom.lastAdvanceDay = world.time.day; // progress resets the clock
  const next = SPINE.find((s) => s.stage === (completed.stage ?? 0) + 1);
  if (next) {
    const q = stageToQuest(world, next);
    world.quests[q.id] = q;
    logEvent(world, 'campaign.offered', { stage: next.stage, quest: q.id }, next.offerText, { witnesses: partyMembers(world).map((c) => c.id) });
  } else {
    world.campaignComplete = true;
    logEvent(world, 'campaign.complete', {}, 'Both recorded spines are complete. What Blackwall does with a god that asked to be REMEMBERED is the author’s to write.');
    logEvent(world, 'epilogue', {}, generateEpilogueText(world), { witnesses: partyMembers(world).map((c) => c.id) });
  }
  // the first arc closing is its own book-end moment
  if (completed.stage === 8) {
    logEvent(world, 'campaign.complete', {}, 'The first spine is complete: the crown is taken and the buried thing has no voice. The city exhales. Below it, something begins — patiently — to grow.', { witnesses: partyMembers(world).map((c) => c.id) });
  }
}

/** A deterministic epilogue: the state of everything, as last-chapter prose fodder. */
export function generateEpilogueText(world: WorldState): string {
  const mc = world.characters[world.mcId];
  const bits: string[] = [`EPILOGUE MATERIAL — Day ${world.time.day}.`];
  const hearts = Object.values(world.characters)
    .filter((c) => c.persistent && c.alive && !c.isMC)
    .map((c) => ({ c, stage: world.relStages?.[c.id] }))
    .filter((x) => x.stage && ['smitten', 'lover', 'partner', 'spouse'].includes(x.stage));
  if (hearts.length) bits.push(`Hearts: ${hearts.map((h) => `${h.c.name} (${h.stage})`).join(', ')}.`);
  const fallen = Object.values(world.characters).filter((c) => !c.alive && c.wasParty);
  if (fallen.length) bits.push(`The fallen: ${fallen.map((c) => c.name).join(', ')}${fallen.some((c) => !c.memorialized) ? ' — not all of them given their rite' : ''}.`);
  const conquered = Object.values(world.dungeons).filter((d) => d.bossDefeated).length;
  bits.push(`${conquered} of ${Object.keys(world.dungeons).length} depths conquered.`);
  const rivalsLeft = (world.rivals ?? []).filter((r) => !r.defeated);
  bits.push(rivalsLeft.length ? `Still hunting them: ${rivalsLeft.map((r) => r.name).join(', ')}.` : 'No named enemy left standing.');
  if (mc.title) bits.push(`${mc.name} ends this as ${mc.title}.`);
  bits.push(`Book ${world.bookNumber ?? 1} of the chronicle.`);
  return bits.join(' ');
}
