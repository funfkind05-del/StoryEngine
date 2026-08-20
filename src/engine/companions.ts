// Recruitable companions and their personal arcs. Each woman has a
// three-stage personal questline: stage one ends with her joining the
// party; later stages unlock as trust grows and her history catches
// up with her. Completing stages moves the relationship dials hard —
// these are the subplot chapters of the book.

import type { Quest, RelationshipValues, WorldState } from './types';
import { logEvent, partyMembers, relationshipBetween } from './world';

interface ArcStage {
  stage: number;
  title: string;
  description: string;
  giverLocation: string;
  objectives: Quest['objectives'];
  reward: Quest['reward'];
  /** relationship deltas toward the MC on completion */
  bond: Partial<RelationshipValues>;
  /** what she'll remember of it */
  memory: string;
  /** unlock gates for stages beyond the first */
  needsTrust?: number;
  needsLevel?: number;
  choice?: Quest['choice'];
}

interface CompanionArc {
  charId: string;
  stages: ArcStage[];
}

const K = (templateKey: string, count: number) => [{ kind: 'kill' as const, templateKey, count, baseline: 0 }];

export const COMPANION_ARCS: CompanionArc[] = [
  {
    charId: 'CHAR_MARA',
    stages: [
      {
        stage: 1,
        title: 'Mara: A Debt Called In',
        description: 'Mara Venn owes the Red Knives a tithe she cannot pay this month, and Varga’s collectors are not patient people. She’ll run with you — properly, as a partner — if you get the collectors off her back first.',
        giverLocation: 'LOC_DOCK_0042',
        objectives: K('red-knife-cutter', 2),
        reward: { money: 0, xp: 200 },
        bond: { trust: 3, affection: 2, respect: 2 },
        memory: 'They stood between me and Varga’s collectors and asked for nothing.',
      },
      {
        stage: 2,
        title: 'Mara: The Ledger She Keeps',
        description: 'Mara keeps her own ledger of favors — and one entry has come due against HER. Someone she once informed on is out of the cells and asking after her by name. Find him among the wharf thugs before he finds her.',
        giverLocation: 'LOC_DOCK_0042',
        objectives: K('street-thug', 3),
        reward: { money: 300, xp: 600 },
        bond: { trust: 2, affection: 2, attraction: 2 },
        memory: 'I told them the worst thing I ever did, and they went to the wharves anyway.',
        needsTrust: 3,
      },
      {
        stage: 3,
        title: 'Mara: Out From Under',
        description: 'One cut ties Mara to the Knives forever: her marker, held in Varga’s strongbox. She wants it back — bought, stolen, or bled for. Get her marker and she is finally, entirely, her own. And maybe yours.',
        giverLocation: 'LOC_DOCK_0042',
        objectives: [{ kind: 'visit', locationId: 'LOC_SALTWAREHOUSE', done: false }, ...K('red-knife-cutter', 2)],
        reward: { money: 0, xp: 1500, factionRep: { FAC_REDKNIVES: -2 } },
        bond: { trust: 3, affection: 3, attraction: 2, commitment: 3 },
        memory: 'I watched my marker burn. First morning of my life that belonged to me — and I spent it looking at them.',
        needsTrust: 6,
        needsLevel: 4,
      },
    ],
  },
  {
    charId: 'CHAR_YVENNE',
    stages: [
      {
        stage: 1,
        title: 'Yvenne: The Lych-House Wolves',
        description: 'Dire wolves have taken to the grave rows at night, and Yvenne will not leave her sick to reach safety. She does not ask for help — she simply keeps working while you decide. Clear the wolves and she’ll consider that an argument worth answering.',
        giverLocation: 'LOC_GRAVEROW',
        objectives: K('dire-wolf', 2),
        reward: { money: 0, xp: 250 },
        bond: { trust: 2, respect: 3, affection: 2 },
        memory: 'They fought wolves in the dark for paupers who couldn’t pay them. I checked. Nobody paid them.',
      },
      {
        stage: 2,
        title: 'Yvenne: The Mercy',
        description: 'The Temple cast Yvenne out for “a mercy the doctrine forbade” — she eased a plague-mad man’s passing when the rite demanded he suffer through. His brother, now a plague priest of the Circle, has come to make her answer for it. Stand with her.',
        giverLocation: 'LOC_GRAVEROW',
        objectives: K('cult-acolyte', 2),
        reward: { money: 400, xp: 800, factionRep: { FAC_VEILEDFLAME: 1 } },
        bond: { trust: 3, affection: 3, attraction: 2 },
        memory: 'I finally said the whole of it out loud. They didn’t flinch. They said the doctrine was wrong, plainly, like weather.',
        needsTrust: 3,
      },
      {
        stage: 3,
        title: 'Yvenne: The Unpicked Sigil',
        description: 'Sella has quietly offered Yvenne reinstatement — the Temple needs healers who’ve seen what’s coming up from below. Yvenne must answer, and she wants you there when she does. Whatever she chooses, the grave rows need clearing of ghouls one last time, as her farewell or her return-gift.',
        giverLocation: 'LOC_GRAVEROW',
        objectives: K('ghoul', 2),
        reward: { money: 0, xp: 1800 },
        bond: { trust: 2, affection: 3, attraction: 3, commitment: 3 },
        memory: 'I made my choice with them beside me. Grey looks different when you wear it on purpose.',
        needsTrust: 6,
        needsLevel: 5,
        choice: {
          prompt: 'Sella waits for Yvenne’s answer — and Yvenne looks at you first.',
          options: [
            { key: 'return', label: 'Encourage her to take the grey back', description: 'Reinstated — the Temple’s discount extends to the party.', factionRep: { FAC_VEILEDFLAME: 2 }, knowledge: 'Yvenne took the grey back on her own terms; the Temple owes the party her return.' },
            { key: 'free', label: 'Tell her she owes the Temple nothing', description: 'She stays her own — and entirely with you.', knowledge: 'Yvenne refused reinstatement. Her vows now are only the ones she chooses.' },
          ],
        },
      },
    ],
  },
  {
    charId: 'CHAR_KESS',
    stages: [
      {
        stage: 1,
        title: 'Kess: Repossession',
        description: 'The College sent constructs — CONSTRUCTS — to repossess Kess’s blanket-stall inventory against her disputed debt. She is five feet of outrage with singed cuffs, and she will absolutely fight them alone if you don’t help. Don’t let her fight them alone.',
        giverLocation: 'LOC_IRONMARKET_SQ',
        objectives: K('animated-armor', 1),
        reward: { money: 0, xp: 300 },
        bond: { trust: 2, affection: 2, respect: 2 },
        memory: 'They stepped in front of the construct like it was nothing. It was NOT nothing. I checked the mass estimates.',
      },
      {
        stage: 2,
        title: 'Kess: The Notes',
        description: 'Her research notes sit in a College archive box she is legally forbidden to touch. Kess has a plan involving the Undervaults survey door, two fire-charms, and you. It is a terrible plan. She knows. Walk the Vault Row with her and pull it off anyway.',
        giverLocation: 'LOC_IRONMARKET_SQ',
        objectives: [{ kind: 'visit', locationId: 'LOC_VAULTDOOR', done: false }, ...K('gutter-mage', 1)],
        reward: { money: 200, xp: 900 },
        bond: { trust: 3, affection: 2, attraction: 3 },
        memory: 'The plan worked. THE PLAN WORKED. They ran the second fuse exactly when I said and never once asked if I was sure.',
        needsTrust: 3,
      },
      {
        stage: 3,
        title: 'Kess: The Experiment',
        description: 'With her notes back, Kess can finally rerun the experiment that got her expelled — a containment lattice she swears could hold “something even very, very big.” Given what you both now know sleeps under the city, that claim has stopped being academic. She needs components off dead constructs, and a witness she trusts.',
        giverLocation: 'LOC_IRONMARKET_SQ',
        objectives: K('animated-armor', 2),
        reward: { money: 0, xp: 2000 },
        bond: { trust: 3, affection: 3, attraction: 2, commitment: 3 },
        memory: 'It held. Eleven seconds, but it HELD, and the only person I wanted looking at me when it did — was.',
        needsTrust: 6,
        needsLevel: 6,
      },
    ],
  },
  {
    charId: 'CHAR_ISHA',
    stages: [
      {
        stage: 1,
        title: 'Isha: The Pit Keeps Calling',
        description: 'The Pit of Honest Work has been strong-arming Open Hand students into "exhibition bouts" that end in the physic’s tent. Isha will not go down there herself — the Pit remembers her old name too fondly. Break the recruiters and she’ll walk with you to keep it broken.',
        giverLocation: 'LOC_OPENHAND',
        objectives: K('pit-bruiser', 2),
        reward: { money: 0, xp: 260 },
        bond: { trust: 3, affection: 2, respect: 2 },
        memory: 'They went down to the Pit so I wouldn’t have to. Nobody has ever done that.',
      },
      {
        stage: 2,
        title: 'Isha: The Tidecourt’s Offer',
        description: 'The Tidecourt offered to "endow" the House of the Open Hand — with enforcers on the door and their sigil over the gate. The abbot is old and tired and tempted. Isha wants the enforcers met in the street first, so the offer arrives pre-declined.',
        giverLocation: 'LOC_OPENHAND',
        objectives: K('tidecourt-enforcer', 2),
        reward: { money: 350, xp: 700 },
        bond: { trust: 2, affection: 2, attraction: 2 },
        memory: 'I hit no one that day. I watched them stand for my House instead, and my hands stayed folded, and it felt like winning twice.',
        needsTrust: 3,
      },
      {
        stage: 3,
        title: 'Isha: The Last Bout',
        description: 'The Pit’s book still carries one open line: her old name, one unfinished bout, and a champion who has held the title since she vanished. Isha means to close the book — walk in under her true name, finish it, and walk out done. She wants you in her corner.',
        giverLocation: 'LOC_OPENHAND',
        objectives: [{ kind: 'visit', locationId: 'LOC_FIGHTPIT', done: false }, ...K('pit-bruiser', 3)],
        reward: { money: 0, xp: 1600 },
        bond: { trust: 3, affection: 3, attraction: 2, commitment: 3 },
        memory: 'The book closed. The crowd shouted the old name and I didn’t answer to it, because the person I am now was watching from my corner.',
        needsTrust: 6,
        needsLevel: 5,
      },
    ],
  },
  {
    charId: 'CHAR_CORVA',
    stages: [
      {
        stage: 1,
        title: 'Corva: Who Snuffs the Lamps',
        description: 'Lamps are dying along Ratcatcher Lane — not wind, not oil. Wisps rise where the light fails, and the Union blames bad wicks because the truth costs more. Corva has mapped the dead lamps into a spiral someone is drawing on the city. Walk her rounds with her and burn out what’s nesting in the dark.',
        giverLocation: 'LOC_LAMPHALL',
        objectives: K('lamp-wisp', 2),
        reward: { money: 0, xp: 240 },
        bond: { trust: 3, affection: 2, respect: 2 },
        memory: 'They walked my whole round in the dark and never once told me the spiral was my imagination.',
      },
      {
        stage: 2,
        title: 'Corva: The Page From the Ledger',
        description: 'A page of the Union ledger — in Corva’s own hand — has surfaced at the Night Market, priced for auction. On it: three names and where their lamps failed the night they drowned. She needs it back before the Tidecourt reads what the light saw.',
        giverLocation: 'LOC_LAMPHALL',
        objectives: [{ kind: 'visit', locationId: 'LOC_NIGHTMARKET', done: false }, ...K('drowned-smuggler', 2)],
        reward: { money: 300, xp: 650 },
        bond: { trust: 2, affection: 2, attraction: 2 },
        memory: 'I told them what I wrote on that page and why, and they handed it back unread. Unread. I checked the fold.',
        needsTrust: 3,
      },
      {
        stage: 3,
        title: 'Corva: The Buyer of Silence',
        description: 'Something at the Night Market has been buying snuffed lamps, drowned names, and quiet — paying in wishes that curdle. Corva has written the song about it already; she just needs it to be TRUE, which means the thing has to be gone. Kill the djinn and she’ll sing the premiere at the Broken Crown.',
        giverLocation: 'LOC_LAMPHALL',
        objectives: [{ kind: 'visit', locationId: 'LOC_LAMPHALL', done: false }, ...K('night-market-djinn', 1)],
        reward: { money: 0, xp: 1500, factionRep: { FAC_LAMPLIGHTERS: 3 } },
        bond: { trust: 3, affection: 3, attraction: 2, commitment: 3 },
        memory: 'The premiere ran long. I changed the last verse while looking straight at them, and the whole taproom knew who the song was for.',
        needsTrust: 6,
        needsLevel: 5,
      },
    ],
  },
];

function questId(world: WorldState): string {
  const n = (world.counters['QST'] ?? 0) + 1;
  world.counters['QST'] = n;
  return `QST_${String(n).padStart(3, '0')}`;
}

function stageQuest(world: WorldState, arc: CompanionArc, st: ArcStage): Quest {
  return {
    id: questId(world),
    title: st.title,
    giver: arc.charId,
    giverLocation: st.giverLocation,
    description: st.description,
    objectives: st.objectives.map((o) => ({ ...o })),
    reward: { ...st.reward },
    status: 'offered',
    offeredDay: world.time.day,
    personal: arc.charId,
    personalStage: st.stage,
    choice: st.choice ? { prompt: st.choice.prompt, options: st.choice.options.map((o) => ({ ...o })) } : undefined,
  };
}

function stageDone(world: WorldState, charId: string, stage: number): boolean {
  return Object.values(world.quests).some((q) => q.personal === charId && q.personalStage === stage && q.status === 'completed');
}

function stageOpen(world: WorldState, charId: string, stage: number): boolean {
  return Object.values(world.quests).some((q) => q.personal === charId && q.personalStage === stage && q.status !== 'completed' && q.status !== 'declined');
}

/** Offer whatever personal stages have become available. Idempotent. */
export function ensurePersonalArcs(world: WorldState) {
  const mc = world.characters[world.mcId];
  for (const arc of COMPANION_ARCS) {
    const c = world.characters[arc.charId];
    if (!c || !c.alive) continue;
    for (const st of arc.stages) {
      if (stageDone(world, arc.charId, st.stage) || stageOpen(world, arc.charId, st.stage)) continue;
      if (st.stage > 1 && !stageDone(world, arc.charId, st.stage - 1)) break;
      const rel = c.relationships[world.mcId];
      if (st.needsTrust !== undefined && (rel?.trust ?? 0) < st.needsTrust) break;
      if (st.needsLevel !== undefined && mc.level < st.needsLevel) break;
      const q = stageQuest(world, arc, st);
      world.quests[q.id] = q;
      logEvent(world, 'personal.offered', { character: arc.charId, stage: st.stage, quest: q.id }, `${c.name} has something she needs help with: "${st.title}" (find her at ${world.locations[st.giverLocation]?.name}).`);
      break;
    }
  }
}

/** Called from quest turn-in: bond payoff, recruitment on stage 1. */
export function advancePersonal(world: WorldState, q: Quest) {
  if (!q.personal || !q.personalStage) return;
  const arc = COMPANION_ARCS.find((a) => a.charId === q.personal);
  const st = arc?.stages.find((x) => x.stage === q.personalStage);
  const c = world.characters[q.personal];
  if (!arc || !st || !c) return;
  const rel = relationshipBetween(world, c.id, world.mcId);
  for (const [k, v] of Object.entries(st.bond)) {
    rel[k as keyof RelationshipValues] = Math.max(-10, Math.min(10, rel[k as keyof RelationshipValues] + (v ?? 0)));
  }
  c.memories.push({ subject: world.mcId, event: st.memory, importance: 9, emotionalValue: 6, day: world.time.day });
  if (st.stage === 1 && !c.inParty && partyMembers(world).length < 8) {
    c.inParty = true;
    c.persistent = true;
    c.location = world.partyLocation;
    logEvent(world, 'party.join', { character: c.id, viaArc: true }, `${c.name} joined the party — not hired, not owed. Chosen.`, { witnesses: partyMembers(world).map((x) => x.id) });
  }
  logEvent(world, 'personal.completed', { character: c.id, stage: st.stage }, `${c.name}'s story moved: "${st.title}" is done, and something between her and ${world.characters[world.mcId].name} is different now.`, { witnesses: partyMembers(world).map((x) => x.id) });
  ensurePersonalArcs(world);
}
