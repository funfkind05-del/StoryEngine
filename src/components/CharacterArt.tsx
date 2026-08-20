// Character portraits: deterministic drawn faces (seeded by the
// character's id) with race skin tones, hair variants, and a class
// accent — plus author-uploaded overrides stored in the save, same
// pattern as monster art.

import { useSyncExternalStore } from 'react';
import { artSnapshot, getCharacterArtCached, subscribeArt } from '../engine/artFiles';
import type { Character, WorldState } from '../engine/types';

const INK = '#0e0c09';

const SKIN: Record<string, string[]> = {
  human: ['#c9a07a', '#a87f5c', '#8a6244', '#e0b590'],
  'half-elf': ['#d8b48c', '#c19b70'],
  dwarf: ['#c08d62', '#a5714a'],
  halfling: ['#d3a87e', '#b98a5e'],
};
const HAIR_COLORS = ['#2a2018', '#4a3626', '#6b4a2a', '#8a6a3a', '#3a3a42', '#7a2f22', '#9a8a70', '#d8cdb8'];
const CLOTH = ['#4a4238', '#3a4248', '#4a3a48', '#3f4a3a', '#544438'];

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ClassAccent({ cls, hairColor }: { cls: Character['charClass']; hairColor: string }) {
  switch (cls) {
    case 'fighter': // steel half-helm band
      return <path d="M26 34 Q50 18 74 34 L74 27 Q50 10 26 27 Z" fill="#8b93a1" />;
    case 'rogue': // hood
      return (
        <>
          <path d="M22 46 Q20 12 50 10 Q80 12 78 46 Q68 24 50 24 Q32 24 22 46 Z" fill="#3a3630" />
          <path d="M26 44 Q36 28 50 28 Q64 28 74 44 L74 50 Q62 34 50 34 Q38 34 26 50 Z" fill={INK} opacity="0.55" />
        </>
      );
    case 'mage': // circlet with gem
      return (
        <>
          <path d="M28 31 Q50 20 72 31" stroke="#c9a227" strokeWidth="2.6" fill="none" />
          <circle cx="50" cy="24.5" r="2.6" fill="#6a9fb5" />
        </>
      );
    case 'priest': // cowl
      return <path d="M24 40 Q24 14 50 12 Q76 14 76 40 L76 30 Q64 18 50 18 Q36 18 24 30 Z" fill="#5a5248" />;
    case 'ranger': // feather at the temple
      return <path d="M70 26 Q80 14 88 12 Q84 24 74 30 Z" fill="#5c7a4a" stroke={hairColor} strokeWidth="0.6" />;
    default:
      return null;
  }
}

function DrawnPortrait({ c }: { c: Character }) {
  const h = hashId(c.id);
  const skins = SKIN[c.race] ?? SKIN.human;
  const skin = skins[h % skins.length];
  const hairColor = HAIR_COLORS[(h >> 3) % HAIR_COLORS.length];
  const cloth = CLOTH[(h >> 6) % CLOTH.length];
  const hairStyle = (h >> 9) % 4;
  const headPath = c.sex === 'male'
    ? 'M32 44 Q32 24 50 22 Q68 24 68 44 Q68 66 50 68 Q32 66 32 44 Z'
    : 'M34 44 Q34 25 50 23 Q66 25 66 44 Q66 64 50 66 Q34 64 34 44 Z';
  const beard = c.sex === 'male' && (h >> 12) % 3 === 0;
  return (
    <>
      <rect x="0" y="0" width="100" height="100" rx="8" fill={INK} />
      <rect x="2.5" y="2.5" width="95" height="95" rx="6.5" fill="none" stroke="#3a322a" strokeWidth="1.5" />
      {/* shoulders */}
      <path d="M18 96 Q22 74 50 72 Q78 74 82 96 Z" fill={cloth} />
      {/* head */}
      <path d={headPath} fill={skin} />
      {/* hair */}
      {hairStyle === 0 && <path d="M30 42 Q28 18 50 16 Q72 18 70 42 Q66 26 50 26 Q34 26 30 42 Z" fill={hairColor} />}
      {hairStyle === 1 && <path d="M30 44 Q26 14 50 14 Q74 14 70 44 L72 58 Q70 40 64 32 Q56 24 44 26 Q32 30 30 44 Z" fill={hairColor} />}
      {hairStyle === 2 && <path d="M32 38 Q32 20 50 18 Q68 20 68 38 Q60 24 50 24 Q40 24 32 38 Z" fill={hairColor} />}
      {hairStyle === 3 && <path d="M30 40 Q28 16 50 15 Q72 16 70 40 Q70 26 60 22 Q66 34 58 30 Q48 24 40 30 Q34 34 30 40 Z" fill={hairColor} />}
      {beard && <path d="M38 54 Q40 68 50 70 Q60 68 62 54 Q56 62 50 62 Q44 62 38 54 Z" fill={hairColor} />}
      {/* eyes */}
      <ellipse cx="43" cy="44" rx="2.4" ry="1.8" fill={INK} />
      <ellipse cx="57" cy="44" rx="2.4" ry="1.8" fill={INK} />
      <path d="M39.5 41 L46.5 41 M53.5 41 L60.5 41" stroke={hairColor} strokeWidth="1.5" strokeLinecap="round" />
      {/* nose + mouth */}
      <path d="M50 46 L49 52 L52 52" stroke={INK} strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M45 58 Q50 60 55 58" stroke={INK} strokeWidth="1.3" fill="none" opacity="0.75" />
      <ClassAccent cls={c.charClass} hairColor={hairColor} />
    </>
  );
}

export function CharacterPortrait({
  charId,
  size = 40,
  world,
}: {
  charId: string;
  size?: number;
  world: WorldState;
}) {
  const c = world.characters[charId];
  if (!c) return null;
  useSyncExternalStore(subscribeArt, artSnapshot); // re-render on art changes
  const custom = getCharacterArtCached(charId) ?? world.characterArt?.[charId];
  if (custom) return <img src={custom} width={size} height={size} className="monster-portrait" alt={c.name} />;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="monster-portrait" role="img" aria-label={c.name}>
      <DrawnPortrait c={c} />
    </svg>
  );
}
