// Bestiary plates: stylized SVG portraits for every monster template,
// drawn in the app's palette — no assets, no network. The author can
// override any plate with their own image (stored in the save as a
// data URI), so generated or commissioned art drops straight in.

import type { WorldState } from '../engine/types';

const INK = '#0e0c09'; // plate background
const BODY = '#5f564a'; // silhouette
const BONE = '#cfc4a8';
const FLESH = '#77675a';
const EYE = '#e8483f';
const EYE_GREEN = '#8fd16a';
const GOLD = '#c9a227';
const RED = '#b23a2e';
const STEEL = '#8b93a1';

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <rect x="0" y="0" width="100" height="100" rx="8" fill={INK} />
      <rect x="2.5" y="2.5" width="95" height="95" rx="6.5" fill="none" stroke="#3a322a" strokeWidth="1.5" />
      {children}
    </>
  );
}

const PLATES: Record<string, React.ReactNode> = {
  'giant-rat': (
    <Plate>
      {/* humped body, long tail, bald ears */}
      <path d="M14 72 Q18 46 42 40 Q66 34 76 52 Q82 62 78 72 Z" fill={BODY} />
      <path d="M76 52 Q88 44 92 34 Q86 44 79 48 Z" fill={FLESH} />
      <ellipse cx="72" cy="47" rx="7" ry="6" fill={BODY} />
      <path d="M77 44 Q84 40 86 44 Q82 46 78 47 Z" fill={FLESH} />
      <circle cx="73.5" cy="45.5" r="1.8" fill={EYE} />
      <path d="M78 50 L88 53 L78 52.5 Z" fill={BONE} />
      <path d="M14 72 Q4 78 6 88 Q16 84 22 76" fill="none" stroke={FLESH} strokeWidth="3" strokeLinecap="round" />
      <path d="M30 72 l-2 8 M44 72 l0 8 M60 72 l2 8" stroke={FLESH} strokeWidth="3" strokeLinecap="round" />
    </Plate>
  ),
  'carrion-beetle': (
    <Plate>
      <ellipse cx="50" cy="56" rx="26" ry="22" fill={BODY} />
      <path d="M50 34 L50 78" stroke={INK} strokeWidth="2" />
      <path d="M34 42 Q50 50 66 42" stroke={INK} strokeWidth="2" fill="none" />
      <ellipse cx="50" cy="30" rx="10" ry="8" fill={FLESH} />
      <circle cx="45" cy="28" r="2" fill={EYE_GREEN} />
      <circle cx="55" cy="28" r="2" fill={EYE_GREEN} />
      <path d="M42 25 Q36 16 30 14 M58 25 Q64 16 70 14" stroke={FLESH} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M28 62 l-10 6 M28 50 l-11 0 M72 62 l10 6 M72 50 l11 0 M34 72 l-8 9 M66 72 l8 9" stroke={FLESH} strokeWidth="2.5" strokeLinecap="round" />
    </Plate>
  ),
  'tunnel-goblin': (
    <Plate>
      <path d="M30 88 Q26 60 38 52 Q30 50 28 42 Q36 44 40 40 Q38 26 50 24 Q62 26 60 40 Q64 44 72 42 Q70 50 62 52 Q74 60 70 88 Z" fill={BODY} />
      {/* ears */}
      <path d="M28 42 Q12 36 8 26 Q20 30 30 34 Z" fill={FLESH} />
      <path d="M72 42 Q88 36 92 26 Q80 30 70 34 Z" fill={FLESH} />
      <circle cx="44" cy="36" r="2.6" fill={EYE_GREEN} />
      <circle cx="56" cy="36" r="2.6" fill={EYE_GREEN} />
      <path d="M44 45 Q50 49 56 45 L54 47 L50 45.5 L46 47 Z" fill={BONE} />
      {/* crude knife */}
      <path d="M70 66 L86 50 L88 54 L74 69 Z" fill={STEEL} />
    </Plate>
  ),
  skeleton: (
    <Plate>
      <ellipse cx="50" cy="32" rx="14" ry="13" fill={BONE} />
      <rect x="44" y="42" width="12" height="6" fill={BONE} />
      <ellipse cx="44.5" cy="30" rx="3.5" ry="4.5" fill={INK} />
      <ellipse cx="55.5" cy="30" rx="3.5" ry="4.5" fill={INK} />
      <circle cx="44.5" cy="31" r="1.4" fill={EYE} />
      <circle cx="55.5" cy="31" r="1.4" fill={EYE} />
      <path d="M46 40 l1.6 3 M50 41 l0 3 M54 40 l-1.6 3" stroke={INK} strokeWidth="1.4" />
      {/* ribs */}
      <path d="M50 50 L50 84" stroke={BONE} strokeWidth="3.4" />
      <path d="M36 56 Q50 62 64 56 M38 64 Q50 70 62 64 M40 72 Q50 77 60 72" stroke={BONE} strokeWidth="3" fill="none" />
      <path d="M36 56 L32 78 M64 56 L68 78" stroke={BONE} strokeWidth="3" strokeLinecap="round" />
    </Plate>
  ),
  'grave-robber': (
    <Plate>
      {/* hooded figure with shovel */}
      <path d="M32 88 Q30 52 50 44 Q70 52 68 88 Z" fill={BODY} />
      <path d="M38 44 Q38 24 50 22 Q62 24 62 44 Q56 38 50 38 Q44 38 38 44 Z" fill={BODY} />
      <path d="M42 36 Q50 42 58 36 Q56 44 50 44 Q44 44 42 36 Z" fill={INK} />
      <circle cx="46.5" cy="38" r="1.5" fill={EYE} />
      <circle cx="53.5" cy="38" r="1.5" fill={EYE} />
      <path d="M72 84 L76 36" stroke={FLESH} strokeWidth="3" />
      <path d="M76 36 Q70 30 74 22 Q82 24 80 34 Z" fill={STEEL} />
      <path d="M20 86 q6 -8 14 -4" stroke={FLESH} strokeWidth="2.5" fill="none" />
    </Plate>
  ),
  'street-thug': (
    <Plate>
      <path d="M28 88 Q26 60 40 54 L60 54 Q74 60 72 88 Z" fill={BODY} />
      <ellipse cx="50" cy="40" rx="12" ry="13" fill={FLESH} />
      <path d="M38 38 Q50 30 62 38 Q60 26 50 26 Q40 26 38 38 Z" fill={BODY} />
      <circle cx="45" cy="41" r="1.8" fill={EYE} />
      <circle cx="55" cy="41" r="1.8" fill={EYE} />
      <path d="M44 48 L56 48" stroke={INK} strokeWidth="1.6" />
      <path d="M40 34 l6 2 M60 34 l-6 2" stroke={INK} strokeWidth="1.4" />
      {/* club */}
      <path d="M70 70 L88 44 Q92 40 90 36 Q86 34 82 40 L66 66 Z" fill={FLESH} />
    </Plate>
  ),
  'red-knife-cutter': (
    <Plate>
      <path d="M30 88 Q28 56 50 48 Q72 56 70 88 Z" fill={BODY} />
      <path d="M38 48 Q36 28 50 26 Q64 28 62 48 Q56 42 50 42 Q44 42 38 48 Z" fill={BODY} />
      <path d="M41 40 Q50 46 59 40 Q57 48 50 48 Q43 48 41 40 Z" fill={INK} />
      <circle cx="46" cy="41" r="1.6" fill={EYE} />
      <circle cx="54" cy="41" r="1.6" fill={EYE} />
      {/* red kerchief */}
      <path d="M40 52 Q50 58 60 52 L58 60 Q50 64 42 60 Z" fill={RED} />
      {/* twin daggers */}
      <path d="M26 76 L16 58 L20 56 L30 73 Z" fill={STEEL} />
      <path d="M74 76 L84 58 L80 56 L70 73 Z" fill={STEEL} />
    </Plate>
  ),
  ghoul: (
    <Plate>
      {/* gaunt crouched thing, long arms */}
      <path d="M34 84 Q28 62 42 52 Q36 46 38 36 Q46 40 50 38 Q54 40 62 36 Q64 46 58 52 Q72 62 66 84 Z" fill={FLESH} />
      <ellipse cx="50" cy="34" rx="10" ry="11" fill={FLESH} />
      <circle cx="45" cy="32" r="2.4" fill={EYE_GREEN} />
      <circle cx="55" cy="32" r="2.4" fill={EYE_GREEN} />
      <path d="M44 41 L47 44 L50 41 L53 44 L56 41" stroke={INK} strokeWidth="1.4" fill="none" />
      <path d="M36 58 Q18 66 14 84 M64 58 Q82 66 86 84" stroke={FLESH} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M14 84 l-3 4 m3 -4 l1 5 m-1 -5 l4 3 M86 84 l3 4 m-3 -4 l-1 5 m1 -5 l-4 3" stroke={BONE} strokeWidth="1.6" strokeLinecap="round" />
    </Plate>
  ),
  'crypt-warden': (
    <Plate>
      {/* armored skull-knight with halberd, gold accents */}
      <path d="M30 88 Q28 58 42 52 L58 52 Q72 58 70 88 Z" fill={STEEL} />
      <path d="M30 62 Q50 70 70 62 L70 68 Q50 76 30 68 Z" fill={INK} opacity="0.5" />
      <ellipse cx="50" cy="36" rx="12" ry="12.5" fill={BONE} />
      <path d="M36 30 Q50 20 64 30 L64 24 Q50 14 36 24 Z" fill={GOLD} />
      <path d="M40 24 l2 -7 M50 21 l0 -8 M60 24 l-2 -7" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="45" cy="35" rx="3" ry="4" fill={INK} />
      <ellipse cx="55" cy="35" rx="3" ry="4" fill={INK} />
      <circle cx="45" cy="36" r="1.5" fill={EYE} />
      <circle cx="55" cy="36" r="1.5" fill={EYE} />
      <path d="M46 44 l1.5 3 M50 45 l0 3 M54 44 l-1.5 3" stroke={INK} strokeWidth="1.3" />
      <path d="M78 88 L78 30" stroke={FLESH} strokeWidth="3" />
      <path d="M78 30 Q70 26 70 18 Q80 16 82 26 L86 20 L84 32 Z" fill={STEEL} />
    </Plate>
  ),
  'sewer-serpent': (
    <Plate>
      <path d="M20 82 Q10 70 22 62 Q34 56 46 62 Q58 68 68 62 Q78 56 74 46 Q70 38 60 40" fill="none" stroke={BODY} strokeWidth="11" strokeLinecap="round" />
      <path d="M62 42 Q52 34 56 24 Q66 20 74 28 Q80 36 72 44 Q68 46 62 42 Z" fill={BODY} />
      <circle cx="66" cy="32" r="2.4" fill={EYE_GREEN} />
      <path d="M72 40 Q80 44 84 50 L78 48 L80 54 Z" fill={EYE_GREEN} opacity="0.9" />
      <path d="M70 42 l4 6 m-7 -4 l3 7" stroke={BONE} strokeWidth="1.6" strokeLinecap="round" />
    </Plate>
  ),
  'rat-king': (
    <Plate>
      <path d="M12 76 Q16 46 44 40 Q70 34 80 54 Q86 66 80 76 Z" fill={BODY} />
      <ellipse cx="74" cy="46" rx="8.5" ry="7.5" fill={BODY} />
      <path d="M80 42 Q88 38 90 42 Q86 45 81 45 Z" fill={FLESH} />
      <circle cx="75" cy="44" r="2.2" fill={EYE} />
      <path d="M81 50 L92 54 L81 53 Z" fill={BONE} />
      {/* crown */}
      <path d="M66 36 L70 26 L74 33 L78 24 L82 33 L86 27 L88 38 Q77 33 66 36 Z" fill={GOLD} />
      <path d="M12 76 Q2 82 4 92 Q14 88 20 80" fill="none" stroke={FLESH} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M28 76 l-2 9 M44 76 l0 9 M62 76 l2 9" stroke={FLESH} strokeWidth="3.4" strokeLinecap="round" />
      {/* the little court */}
      <ellipse cx="24" cy="88" rx="6" ry="3.6" fill={BODY} opacity="0.8" />
      <ellipse cx="86" cy="88" rx="6" ry="3.6" fill={BODY} opacity="0.8" />
    </Plate>
  ),
  smuggler: (
    <Plate>
      <path d="M30 88 Q28 58 44 52 L56 52 Q72 58 70 88 Z" fill={BODY} />
      <ellipse cx="50" cy="40" rx="11" ry="12" fill={FLESH} />
      {/* kerchief */}
      <path d="M38 36 Q50 26 62 36 L62 30 Q50 22 38 30 Z" fill={RED} />
      <path d="M62 32 L72 28 L66 38 Z" fill={RED} />
      <circle cx="45" cy="41" r="1.7" fill={EYE} />
      <circle cx="55" cy="41" r="1.7" fill={EYE} />
      <path d="M45 48 Q50 51 55 48" stroke={INK} strokeWidth="1.5" fill="none" />
      {/* sack over shoulder */}
      <path d="M64 54 Q84 50 84 68 Q84 82 72 80 Q64 78 64 66 Z" fill={FLESH} />
      <path d="M64 54 L58 44" stroke={FLESH} strokeWidth="3" />
    </Plate>
  ),
};

/** Generic plate for unknown/modded templates. */
function GenericPlate() {
  return (
    <Plate>
      <path d="M30 84 Q28 50 50 44 Q72 50 70 84 Z" fill={BODY} />
      <circle cx="44" cy="60" r="3" fill={EYE} />
      <circle cx="56" cy="60" r="3" fill={EYE} />
    </Plate>
  );
}

export const PLATE_KEYS = Object.keys(PLATES);

export function MonsterPortrait({
  templateKey,
  size = 40,
  world,
}: {
  templateKey: string;
  size?: number;
  world?: WorldState;
}) {
  const custom = world?.monsterArt?.[templateKey];
  if (custom) {
    return <img src={custom} width={size} height={size} className="monster-portrait" alt={templateKey} />;
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="monster-portrait" role="img" aria-label={templateKey}>
      {PLATES[templateKey] ?? <GenericPlate />}
    </svg>
  );
}
