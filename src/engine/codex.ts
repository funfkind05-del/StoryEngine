// The Codex: recovered writings, keyed by dungeon and floor. Lore that
// deepens the campaign's buried-god spine — and doubles as the
// author's worldbuilding bible. Entries unlock when lorebooks are
// taken; the Muse can point at unread implications.

export interface LoreEntry {
  id: string; // `${dungeonId}:${floor}`
  title: string;
  text: string;
}

export const LOREBOOKS: LoreEntry[] = [
  { id: 'DUN_OLDQUARTER_001:1', title: 'Mason’s Tally, Year 12', text: 'Tally of the crypt works, twelfth year of the city: stone drawn UP from below quota again. The engineer asks no one to remark that we quarry downward for a cemetery. Paid double, all hands, for silence. — G., foreman' },
  { id: 'DUN_OLDQUARTER_001:2', title: 'The Warden’s Commission', text: 'You will stand the inner post. You will not open the door for weeping, for reason, for the King’s own voice. Especially not for the King’s own voice. — Commission of the First Warden, unsigned' },
  { id: 'DUN_OLDQUARTER_001:3', title: 'A Priest’s Doubt', text: 'They tell the flock we buried saints here. We buried a threshold. I have heard water where no water should run, warm as blood through the stones. — torn from a breviary' },
  { id: 'DUN_DOCKWARD_001:1', title: 'Smuggler’s Rutter', text: 'Third gallery floods on no tide I can chart. The water comes UP, brothers, and it comes warm. We move the cargo higher and do not speak of what the lanterns showed. — rutter of the Drowning Cellars' },
  { id: 'DUN_DOCKWARD_001:2', title: 'The Rat-King’s Bargain', text: 'Feed it and it lets the boats pass. Short it and men drown on dry nights. Whatever wears the crown down here, it learned bargaining from something older. — knife-scratched on a beam' },
  { id: 'DUN_OLDQUARTER_002:1', title: 'Circle Catechism, Outer', text: 'Q: Why do we burn? A: Because ash falls where it is thrown, and we are thrown by a hand below. Q: Where does the hand rest? A: Deeper. Always the answer is deeper.' },
  { id: 'DUN_OLDQUARTER_002:2', title: 'Circle Catechism, Inner', text: 'The King under everything did not die. Dying is for things whose names survive them. The founders ate his name and called the meal a city. We dig to give it back. — Inner Catechism, forbidden to the Outer' },
  { id: 'DUN_OLDQUARTER_002:3', title: 'Hierophant’s Margin Notes', text: 'Heading corrected again — the old surveys LIE on purpose. Whoever drew them buried errors like traps. Forty more feet of true depth this season. He is patient. We are not required to be. — margin of a ledger page' },
  { id: 'DUN_IRONMARKET_001:1', title: 'Vault Crew Requisition', text: 'Requisitioned: 40 lamps, 200 ft rope, six masons sworn to the Guild. Struck through, different hand: NO FURTHER DIGGING. SEAL SUBLEVEL. RATE OF SILENCE DOUBLED. — countinghouse requisition, year 271' },
  { id: 'DUN_IRONMARKET_001:2', title: 'The Minting of the Golem', text: 'It cost the Guild a year of profit to mint the guardian, and the founder-families paid without complaint. Ask what frightens a banker out of a year of profit. — private correspondence, unsigned' },
  { id: 'DUN_IRONMARKET_001:3', title: 'Assayer’s Report', text: 'The stone below bedrock is WORKED. Tool-marks older than any guild pattern-book. And the marks face upward — whoever cut this stone was digging OUT. — assayer’s report, marked SUPPRESSED' },
  { id: 'DUN_DOCKWARD_002:1', title: 'Sewerman’s Almanac', text: 'The under-river rises when nothing else does. My father called it the city breathing and laughed. He stopped laughing the year the breath came warm. — almanac of the deep galleries' },
  { id: 'DUN_DOCKWARD_002:2', title: 'Toll Marks', text: 'Tallies cut into the arch, hundreds deep. Something counted what passed beneath. The newest marks are fresh. — traveler’s note pinned with a fish-knife' },
  { id: 'DUN_DOCKWARD_002:3', title: 'A Warning in Three Hands', text: 'First hand: TURN BACK. Second hand, older: WE ALSO WROTE THIS. Third hand, oldest, carved deep and filled with lead: IT READS.' },
  { id: 'DUN_DOCKWARD_002:4', title: 'The Tyrant’s Leavings', text: 'Bones sorted by kind. Coins stacked by year. Whatever ruled the under-river kept accounts. Kept them for whom? — salvage diver’s deposition, case dismissed' },
  { id: 'DUN_HARBOR_001:1', title: 'Liturgy of the First Temple', text: 'We do not worship because it is good. We worship because it is THERE, and the alternative to a fed god is a hungry one. — drowned liturgy, salt-eaten' },
  { id: 'DUN_HARBOR_001:2', title: 'The Founders’ Minutes', text: 'Motion carried: the temple drowns at the equinox tide. Motion carried: the crypts rise on the old threshold. Motion carried, one dissenting: the King’s name passes from every record. The dissenter’s name also does not appear. — minutes, final session' },
  { id: 'DUN_HARBOR_001:3', title: 'Hymn, Interrupted', text: 'HE THAT IS HELD IS NOT HEALED / HE THAT IS DROWNED IS NOT DEAD / HE THAT IS NAMELESS IS NOT — the carving stops mid-line. The chisel is still in the wall.' },
  { id: 'DUN_HARBOR_001:4', title: 'Tidekeeper’s Confession', text: 'Three hundred years the priesthood kept the tide-locks and told the city we were fishermen. We were wardens. Forgive us: we were also worshippers. The two jobs were never different. — confession, weighted and sunk' },
  { id: 'DUN_HIGHCOURT_001:1', title: 'The Binding of the Wyrm', text: 'Dwarf-work, this binding: a living seal for the deep approach, paid for in the founders’ own blood-line. It will hold while it is REMEMBERED. Teach your children its name. — instructions to the noble houses, ignored' },
  { id: 'DUN_HIGHCOURT_001:2', title: 'A Noble’s Diary', text: 'Grandmother spoke a name at the spire each solstice and would not say why. We buried her in spring. No one went at solstice. The tower has smelled of scorched stone since. — diary of House Verane' },
  { id: 'DUN_HIGHCOURT_001:3', title: 'The Wyrm’s Own Mark', text: 'One word, claw-cut into melted stone, in a script older than the city and legible anyway: LISTENING.' },
  { id: 'DUN_HIGHCOURT_001:4', title: 'Signs of the Vigil', text: 'The old signs, so a warden might speak to a warden: two knocks for ALL QUIET. Three for DEEPS RESTLESS. One, alone, for OPENED. The last page is a single knock, pressed through the vellum. — signalbook of the vigil' },
  { id: 'DUN_HIGHCOURT_001:5', title: 'Draconic Arithmetic', text: 'It counted the years of its vigil in scores scorched on the wall: fifteen score files, then the counting stops — not finished, ABANDONED. Something gave it a better offer than duty. — College survey, redacted' },
  { id: 'DUN_DEEP_001:1', title: 'The Herald’s Coronation', text: 'He went down a king and knelt. What rose wore his face the way a door wears paint. The crown, note, did not change at all. The crown was always its. — fragment attributed to the dissenting founder' },
  { id: 'DUN_DEEP_001:2', title: 'What The Gate Is', text: 'Not a door. Doors are for keeping things out. This is a THROAT, and the city is what it swallowed slowly. The founders did not seal it. They gave it something to hold in its mouth. — carved in black stone, author unknowable' },
  { id: 'DUN_DEEP_001:3', title: 'The Three Openings', text: 'First opening: the King went down. Second: the King came partway back, and the harbor boiled. Third: nothing entered and nothing left, and every child born that year in Blackwall dreamed the same word. The records do not say the word. The records are afraid of it. — Temple sealed annal' },
  { id: 'DUN_DEEP_001:4', title: 'The Palace Under Everything', text: 'There are banners down here. Halls. A court. It built a KINGDOM in the dark from what the city dropped, and it has been holding court for three hundred years with one throne empty. Guess whose. — last page of an explorer’s journal, found neatly closed' },
  { id: 'DUN_DEEP_001:5', title: 'A Kindness', text: 'If you are reading this you are deeper than help. Two things are true: it already knows your name, and it is POLITE. Whatever it offers you, the price is the same price the King paid. Leave the crown where it sits. — unsigned, undated, unheeded' },
  { id: 'DUN_DEEP_001:6', title: 'The Word Beneath', text: 'The children’s word, the one the annals feared: it was HELD. Not a report. A complaint. — marginal note in the sealed annal, in a child’s hand no scribe could identify' },
];

export function loreById(id: string): LoreEntry | undefined {
  return LOREBOOKS.find((l) => l.id === id);
}
