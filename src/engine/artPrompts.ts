// The author's curated bestiary prompts. Every generation starts with
// the master prefix; monsters listed here use their hand-written
// descriptions, everything else falls back to a description built from
// the template in the same style.

export const ART_STYLE_PREFIX = (name: string, desc: string) =>
  `A dark fantasy RPG portrait of ${name}, ${desc} The art style is gritty digital painting with moody lighting.`;

export const MONSTER_ART_PROMPTS: Record<string, string> = {
  // Batch A: the urban underbelly
  'carrion-beetle': 'a massive beetle with a cracked, chitinous shell covered in grime, feasting on a rotted carcass in a dark sewer tunnel.',
  'giant-rat': 'an oversized rat with matted fur, red eyes, and bared yellow teeth, snarling in a filthy alleyway among refuse.',
  'street-thug': 'a menacing human with a scarred face, wearing patched leather armor and holding a jagged dagger, lurking in a dark stone doorway.',
  'tunnel-goblin': 'a small, hunched goblin with pale skin and large ears, holding a crude spear and a sputtering torch in a narrow mine shaft.',
  'red-knife-cutter': 'a dangerous rogue in dark, blood-stained clothing, holding twin serrated daggers that glint red, standing in a shadowy tavern corner.',
  smuggler: 'a human in heavy, concealing cloaks carrying a nondescript crate, looking over their shoulder on a foggy dock at night.',
  'city-watchman': 'a stern guard in dented plate armor with a city crest, holding a halberd, standing guard at a stone gate under gaslight.',
  // Batch B: the risen dead
  skeleton: 'a complete human skeleton in rusted chainmail, holding a chipped sword and shield, standing in a dusty crypt.',
  'crypt-warden': 'an armored undead warrior, its helmet hiding a skull face, holding a heavy mace, guarding a stone sarcophagus.',
  'bone-warden-revenant': 'a skeletal figure wrapped in heavy chains and scraps of burial shrouds, its eye sockets glowing with cold blue fire.',
  wight: 'a desiccated corpse-lord wearing ancient bronze armor and a horned helmet, seated on a stone throne inside a burial mound.',
  wraith: 'a faceless, ethereal spirit in tattered black robes floating above the ground, its form made of swirling shadows and cold mist.',
  'vampire-thrall': 'a pale human with a blank, obedient stare and slightly elongated fangs, wearing elegant but worn aristocratic clothing.',
  'bone-knight': 'an imposing warrior clad entirely in armor made from fused bones, holding a shield made of a large ribcage.',
  // Batch C: the watery grave
  'sewer-serpent': 'a massive, scaled serpent with slime-coated skin and glowing eyes raising its head from murky sewer water.',
  'bog-hag': 'a hideous, elderly crone with greenish, warty skin and tangled, wet hair, waist-deep in a swamp, holding a gnarled staff.',
  'harbor-drake': 'a small, leathery drake with webbed wings and scales the color of rusted copper, perched on a rotted pier post.',
  'brine-horror': 'an amorphous mass of rotted flesh, tentacles, and teeth, dripping saltwater and covered in sharp shells.',
  'reef-witch': 'a female humanoid with gills on her neck, shark-like teeth, and fingers ending in coral-like claws, emerging from the ocean.',
  'sewer-tyrant': 'a gigantic, mutant alligator with armored scales and extra limbs, dominating a wide sewer junction.',
  'deep-one': 'a fish-frog hybrid humanoid with bulging eyes and gills, standing hunched on a rocky, wave-battered shore.',
  'harbor-revenant': "a skeletal figure dressed in a rotted captain's attire, holding a rusted cutlass, rising from the harbor water.",
  'drowned-priest': 'a robed figure wearing a mask made of a large conch shell, holding a staff topped with a kraken skull.',
  'salt-queen': 'a pale female figure dressed in gowns encrusted with salt crystals, her hair looking like dried seaweed, standing on a desolate beach.',
  'depth-lurker': 'a horrific, bioluminescent monstrosity with multiple eyes and needle-like teeth, floating in the crushing darkness of the deep sea.',
  // Batch D: brutes, beasts, monstrosities
  'dire-wolf': 'an enormous wolf with thick grey fur and glowing red eyes, snarling in a snowy forest at twilight.',
  'pit-bruiser': 'a hulking, scarred human with bulging muscles, wearing spiked leather gauntlets and standing in a gladiatorial fighting pit.',
  'goblin-warchief': 'a larger, muscular goblin wearing heavy, scavenged plate armor and a horned helmet, wielding a large battleaxe.',
  ogre: 'a massive, brutish humanoid with thick skin and a heavy jaw, holding a crude tree-trunk club in a rocky landscape.',
  'pit-champion': 'a heavily scarred warrior in gladiator armor, holding a trident and net, raising a fist in victory in an arena.',
  gargoyle: 'a winged stone creature crouched on a cathedral ledge, its features frozen in a grotesque snarl.',
  chimera: 'a three-headed beast (lion, goat, dragon) with leathery wings and a serpent tail, breathing fire in mountainous terrain.',
  'flesh-golem': 'a hulking figure made of mismatched body parts stitched together with thick twine, bolts sticking out of its neck.',
  'tidecourt-enforcer': 'a heavily armored merfolk warrior wielding a trident made of dark coral, standing guard in an underwater palace.',
  // Batch E: the arcane, constructs, and weird
  'cult-acolyte': 'a robed figure whose face is obscured by a mask of hardened ash, holding a smoking censer with glowing embers.',
  'lamp-wisp': 'a small, glowing ball of light hovering inside an old, brass lantern held by an unseen hand.',
  'gutter-mage': 'a ragged spellcaster covered in urban filth, with arcane energy crackling around their dirty hands in a trash-filled alley.',
  'night-market-djinn': 'a mystical being made of swirling smoke and magical energy, emerging from an ornate lamp in a bustling bazaar at night.',
  'gilded-golem': 'a tall construct made entirely of polished gold and brass, with gears visible in its joints and glowing blue eyes.',
  'saltbound-golem': 'a rough, humanoid shape made of compressed salt crystals and driftwood, crumbling slightly as it moves.',
  'stone-golem': 'a massive, blocky humanoid statue carved from rough grey granite, with glowing runes etched into its chest.',
  'iron-colossus': 'an enormous construct made of dark, riveted iron plates, standing amidst a ruined city, towering over buildings.',
  'ossuary-colossus': 'a gigantic golem constructed entirely from thousands of fused human bones and skulls.',
  'animated-armor': 'a complete suit of medieval plate armor standing on its own, with a faint magical glow emanating from the helmet visor.',
  'mirror-shade': 'a humanoid figure made of polished, reflective shards of glass, reflecting a distorted image of its surroundings.',
};
