// The Codex: recovered writings, keyed by dungeon and floor. Lore that
// deepens the campaign's buried-god spine — and doubles as the
// author's worldbuilding bible. Entries unlock when lorebooks are
// taken; the Muse can point at unread implications.

export interface LoreEntry {
  id: string; // `${dungeonId}:${floor}` — or `CITY:<slug>` for street lore
  title: string;
  text: string;
}

/** City lore surfaces the first time the party stands in the right place. */
export const CITY_LORE_AT: Record<string, string> = {
  LOC_LAMPHALL: 'CITY:lamplighters',
  LOC_NIGHTMARKET: 'CITY:tidecourt',
  LOC_GRAVEROW: 'CITY:bonewardens',
  LOC_OPENHAND: 'CITY:openhand',
  LOC_NAMELESS: 'CITY:namelesschapel',
  LOC_EDGEDHALL: 'CITY:edgedhall',
};

export const LOREBOOKS: LoreEntry[] = [
  { id: 'DUN_WILD_001:1', title: 'Standing Orders, Third Watch', text: 'Hold the tower. Watch the road. Relief comes in spring. — The orders are carved, not written, and the carving has been re-cut deeper at least twice by hands that must have known, by then, that spring was not coming. The garrison held anyway. Parts of it still do.' },
  { id: 'DUN_WILD_001:2', title: 'The Mason\u2019s Complaint', text: 'Instructed to cut arrow-slits into the CELLAR walls, facing INWARD, at the height of a crawling man. Queried the order twice. Was told the tower\u2019s purpose is not to keep enemies out of the fort. It is to keep the fort between the enemy and the road. I did not ask which enemy. — a stonemason\u2019s daybook' },
  { id: 'DUN_WILD_001:3', title: 'Pay-Chits of a Dead Kingdom', text: 'Copper chits stamped with a crown no herald recognizes, still stacked in the paymaster\u2019s chest, still counted — the stacks are STRAIGHTENED, recently. Whatever draws wages here has kept its own books for six hundred years and is not owed nothing.' },
  { id: 'DUN_TIDE_001:1', title: 'Works Ledger, Final Season', text: 'Pan seven came back wrong again. The brine holds a reflection after the man who cast it walks away. Foreman says sell the works. Buyer already found, he says. Nobody asks how a buyer was found before the works were for sale. — the last shift-clerk' },
  { id: 'DUN_TIDE_001:2', title: 'A Tidecourt Memorandum', text: 'Acquire the deed quietly. Post no guards; guards attract questions, and the asset guards itself below the second gallery. Delay all municipal inspection until the Queen’s pans yield. — unsigned, sealed with a wave' },
  { id: 'DUN_TIDE_001:3', title: 'Salt-Cured Prayers', text: 'The workers left prayers cut into the pan-rims, the way miners do. The later ones stop asking to be kept safe and start asking to be FORGOTTEN. The last one is a name, crossed out by the same hand that carved it.' },
  { id: 'DUN_TIDE_001:4', title: 'What the Brine Keeps', text: 'Salt preserves. That is its whole argument. Something below the works learned this before we had words for it, and it has been preserving — patiently, gallery by gallery — everything the sea ever showed it. Including, now, us. — a folio in a drowned surveyor’s case' },
  { id: 'CITY:lamplighters', title: "The Lamplighters' Ledger", text: 'Before the Watch there were the lamps, and before the lamps there were the men who carried fire street to street and wrote down what the light found. The Union still keeps both habits. The ledger has never been read by an outsider; the excerpts that circulate are either fakes or warnings.' },
  { id: 'CITY:tidecourt', title: 'Articles of the Tidecourt', text: 'Seventeen shipping houses, one table, no flag. The Articles bind them to a single rule: the harbor decides. What the harbor decides is written in freight rates and drowned partners, and lately the harbor has been deciding that Blackwall is cheap.' },
  { id: 'CITY:bonewardens', title: 'Rites of the Older Door', text: 'The Bonewardens buried this city for six hundred years before the Veiled Flame arrived and called it heresy with better vestments. Their rites persist in the tomb-streets: coins on doors, salt on stairs, and the instruction — never written twice the same way — that some doors are load-bearing.' },
  { id: 'CITY:openhand', title: 'The Open Hand Precepts', text: 'Precept one: the fist is the last argument, so finish arguments early. Precept two: stillness is not peace; it is aim. The rest of the precepts are taught by standing in the courtyard until you understand the first two differently.' },
  { id: 'CITY:namelesschapel', title: 'What Was Chiseled Off', text: 'The altar bore a name for two hundred years. The chisel-work is dated to a single night. No record says who held the chisel, but the pact-scholars note that whatever answers prayers there now answers faster than the old occupant ever did — and never in writing.' },
  { id: 'CITY:edgedhall', title: 'A Treatise on Cut Sigils', text: 'The College holds that magic lives in intent. The Edged Hall holds that intent lives in the wrist. Both are wrong, which is why the treaty between them is renewed annually and violated weekly, usually in duels neither institution admits sanctioning.' },
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
