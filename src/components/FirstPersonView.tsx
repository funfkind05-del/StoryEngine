// The corridor you're standing in — single-point-perspective wireframe,
// the way 1985 drew dungeons and the way it still looks right. Renders
// the current room from the party's facing: openings ahead/left/right,
// stairs, chest, shrine, and the thing in the doorway when the room is
// hostile. Every dungeon type has its own walls: bone niches in the
// crypts, slime in the flooded runs, rivets in the vaults.

import { useStore } from '../state/store';
import { useSyncExternalStore } from 'react';
import { MonsterPortrait } from './MonsterArt';
import { isDark } from '../engine/dungeon';
import { MONSTERS } from '../engine/monsters';
import { artSnapshot, dungeonBackdropUrl, subscribeArt } from '../engine/artFiles';

export type Cardinal = 'north' | 'south' | 'east' | 'west';
export const LEFT_OF: Record<Cardinal, Cardinal> = { north: 'west', west: 'south', south: 'east', east: 'north' };
export const RIGHT_OF: Record<Cardinal, Cardinal> = { north: 'east', east: 'south', south: 'west', west: 'north' };
export const BEHIND: Record<Cardinal, Cardinal> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const GLYPH: Record<Cardinal, string> = { north: 'N', south: 'S', east: 'E', west: 'W' };

// ---------- wall themes by dungeon type ----------
type PatternKind = 'bones' | 'slime' | 'brands' | 'rivets' | 'flutes' | 'cracks' | 'runes' | 'bricks';

interface WallTheme {
  line: string; // edge highlights & glyphs
  dim: string; // pattern linework on surfaces
  wall: string; // far-wall surface tone
  side: string; // side-wall surface tone (lit)
  sideDark: string; // side-wall tone toward the far corner
  ceil: string; // ceiling tone
  floor: string; // floor tone near the party
  floorFar: string; // floor tone at the far wall
  jamb: string; // door frame stonework
  pattern: PatternKind;
  /** flooded dungeons show a waterline on the floor */
  waterline?: boolean;
}

function themeFor(dungeonType: string): WallTheme {
  const t = dungeonType.toLowerCase();
  if (t.includes('crypt')) return { line: '#c9a959', dim: '#7a6535', wall: '#2e2517', side: '#3a2f1d', sideDark: '#241c11', ceil: '#191309', floor: '#33291a', floorFar: '#1e1710', jamb: '#57452a', pattern: 'bones' };
  if (t.includes('sewer') || t.includes('smuggler') || t.includes('flooded')) {
    return { line: '#6aa87f', dim: '#4d7a5c', wall: '#17281c', side: '#1d3323', sideDark: '#101d14', ceil: '#0c1710', floor: '#16241a', floorFar: '#0d1610', jamb: '#2e4d38', pattern: 'slime', waterline: true };
  }
  if (t.includes('temple') || t.includes('drowned')) return { line: '#7fb8a8', dim: '#547e73', wall: '#182823', side: '#1f332c', sideDark: '#121e1a', ceil: '#0d1714', floor: '#17251f', floorFar: '#0e1713', jamb: '#35544c', pattern: 'flutes', waterline: t.includes('drowned') };
  if (t.includes('cult')) return { line: '#c97a4a', dim: '#8a5432', wall: '#2b1c11', side: '#372417', sideDark: '#20150c', ceil: '#170f08', floor: '#2d1f13', floorFar: '#1a110a', jamb: '#5a3524', pattern: 'brands' };
  if (t.includes('vault') || t.includes('bank')) return { line: '#9fb0c4', dim: '#6b7c90', wall: '#1e242c', side: '#262e38', sideDark: '#161b21', ceil: '#10141a', floor: '#20262e', floorFar: '#12161b', jamb: '#44505e', pattern: 'rivets' };
  if (t.includes('dragon') || t.includes('undercroft')) return { line: '#d98a3d', dim: '#93601f', wall: '#2e1e0d', side: '#3b2812', sideDark: '#221708', ceil: '#180f06', floor: '#30210f', floorFar: '#1c1308', jamb: '#6b431e', pattern: 'cracks' };
  if (t.includes('palace') || t.includes('hollow')) return { line: '#a98fd6', dim: '#71609a', wall: '#221b30', side: '#2b223c', sideDark: '#181123', ceil: '#100b18', floor: '#231c31', floorFar: '#140f1d', jamb: '#4b3f66', pattern: 'runes' };
  return { line: '#c9a959', dim: '#7a6535', wall: '#2e2517', side: '#3a2f1d', sideDark: '#241c11', ceil: '#191309', floor: '#33291a', floorFar: '#1e1710', jamb: '#57452a', pattern: 'bricks' };
}

/** A solid stone door frame: jambs, lintel, threshold — a real door. */
function DoorFrame({ x, y, w, h, theme, open: opening }: { x: number; y: number; w: number; h: number; theme: WallTheme; open: boolean }) {
  const j = Math.max(4, w * 0.14); // jamb width
  return (
    <g>
      <rect x={x - j} y={y - j} width={w + j * 2} height={h + j} fill={theme.jamb} stroke={theme.line} strokeWidth="0.8" />
      {/* lintel stone */}
      <rect x={x - j * 1.5} y={y - j * 1.6} width={w + j * 3} height={j * 1.2} fill={theme.jamb} stroke={theme.line} strokeWidth="0.8" />
      {/* jamb block joints */}
      <line x1={x - j} y1={y + h * 0.33} x2={x} y2={y + h * 0.33} stroke={theme.dim} strokeWidth="0.7" />
      <line x1={x - j} y1={y + h * 0.66} x2={x} y2={y + h * 0.66} stroke={theme.dim} strokeWidth="0.7" />
      <line x1={x + w} y1={y + h * 0.33} x2={x + w + j} y2={y + h * 0.33} stroke={theme.dim} strokeWidth="0.7" />
      <line x1={x + w} y1={y + h * 0.66} x2={x + w + j} y2={y + h * 0.66} stroke={theme.dim} strokeWidth="0.7" />
      {/* the opening itself */}
      <rect x={x} y={y} width={w} height={h} fill={opening ? '#020202' : theme.sideDark} />
      {opening && <rect x={x} y={y} width={w} height={h * 0.55} fill="url(#fpv-doorfog)" />}
      {/* threshold step */}
      <rect x={x - j} y={y + h} width={w + j * 2} height={3} fill={theme.jamb} opacity="0.9" />
    </g>
  );
}

/** Tiny stable hash so every room dresses its walls differently. */
function roomVariant(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Far-wall texture; `v` shifts the dressing so no two rooms match. */
function FarPattern({ kind, dim, v }: { kind: PatternKind; dim: string; v: number }) {
  const j = (n: number, spread = 6) => ((v >> (n * 3)) % spread) - Math.floor(spread / 2); // per-slot jitter
  switch (kind) {
    case 'bones':
      // burial niches, some still occupied — occupancy shifts room to room
      return (
        <g stroke={dim} strokeWidth="0.75" fill="none">
          <rect x={132 + j(0, 4)} y={74 + j(1, 5)} width="20" height="26" rx="9" />
          <rect x="160" y={76 + j(2, 5)} width="20" height="26" rx="9" />
          <rect x={188 + j(3, 4)} y={74 + j(4, 5)} width="20" height="26" rx="9" />
          {v % 3 !== 0 && <rect x="132" y="112" width="20" height="26" rx="9" />}
          {v % 4 !== 1 && <rect x="188" y="112" width="20" height="26" rx="9" />}
          {v % 2 === 0 && <circle cx={170 + j(5, 8)} cy="87" r="3.2" fill={dim} opacity="0.7" />}
          {v % 3 === 1 && <circle cx="142" cy="123" r="3.2" fill={dim} opacity="0.7" />}
          {v % 5 === 2 && <circle cx={198 + j(6, 6)} cy="123" r="3.2" fill={dim} opacity="0.7" />}
        </g>
      );
    case 'slime':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none">
          <path d={`M ${122 + j(0, 5)} 70 q 10 14 2 30 q -4 12 4 24`} />
          <path d={`M ${150 + j(1, 5)} 66 q ${8 + j(2, 4)} 20 0 36 q -6 14 3 26`} />
          <path d={`M ${186 + j(3, 5)} 68 q -6 18 2 34 q 6 12 -2 26`} />
          {v % 3 !== 1 && <path d={`M ${212 + j(4, 4)} 72 q 6 16 -2 30 q -5 12 3 22`} />}
          <circle cx={138 + j(5, 10)} cy={126 + j(6, 10)} r="2" fill={dim} />
          {v % 2 === 0 && <circle cx={196 + j(7, 8)} cy="120" r="2" fill={dim} />}
        </g>
      );
    case 'brands':
      // branded doors, ash sigils
      return (
        <g stroke={dim} strokeWidth="1" fill="none">
          <path d="M 145 85 l 8 -12 l 8 12 z" />
          <path d="M 179 85 l 8 -12 l 8 12 z" />
          <circle cx="153" cy="115" r="8" />
          <line x1="153" y1="107" x2="153" y2="123" />
          <circle cx="187" cy="115" r="8" />
          <line x1="179" y1="115" x2="195" y2="115" />
          <path d="M 150 140 h 40" strokeDasharray="3 3" />
        </g>
      );
    case 'rivets':
      return (
        <g fill="none" stroke={dim} strokeWidth="0.75">
          <line x1="120" y1="92" x2="220" y2="92" />
          <line x1="120" y1="122" x2="220" y2="122" />
          <line x1="170" y1="64" x2="170" y2="150" />
          {[130, 150, 190, 210].map((x) => (
            <g key={x}>
              <circle cx={x} cy="78" r="1.4" fill={dim} />
              <circle cx={x} cy="107" r="1.4" fill={dim} />
              <circle cx={x} cy="136" r="1.4" fill={dim} />
            </g>
          ))}
        </g>
      );
    case 'flutes':
      // column flutes and barnacle clusters
      return (
        <g stroke={dim} strokeWidth="0.75" fill="none">
          {[132, 144, 156, 184, 196, 208].map((x) => <line key={x} x1={x} y1="66" x2={x} y2="148" />)}
          <circle cx="166" cy="140" r="2.4" fill={dim} opacity="0.8" />
          <circle cx="172" cy="144" r="1.8" fill={dim} opacity="0.8" />
          <circle cx="176" cy="139" r="1.5" fill={dim} opacity="0.8" />
        </g>
      );
    case 'cracks':
      // heat-cracked, half-melted stone
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none">
          <path d="M 138 64 l 6 22 l -8 14 l 10 18 l -4 32" />
          <path d="M 176 64 l -4 18 l 8 12 l -6 20 l 8 36" />
          <path d="M 205 70 l 5 16 l -7 18 l 9 24" />
          <path d="M 120 100 q 18 6 30 -2" opacity="0.7" />
        </g>
      );
    case 'runes':
      // the palace under everything: script nobody reads aloud
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none">
          <path d="M 146 84 v 12 m -5 -6 h 10" />
          <path d="M 170 80 l 5 8 l -5 8 l -5 -8 z" />
          <path d="M 194 84 v 12 m 0 -12 l 6 12" />
          <path d="M 152 118 h 8 m -4 -4 v 12" />
          <path d="M 184 116 a 5 5 0 1 0 0.1 0" />
          <line x1="132" y1="140" x2="208" y2="140" strokeDasharray="1 4" />
        </g>
      );
    case 'bricks':
    default:
      return (
        <g stroke={dim} strokeWidth="0.75">
          <line x1="120" y1="86" x2="220" y2="86" />
          <line x1="120" y1="107" x2="220" y2="107" />
          <line x1="120" y1="128" x2="220" y2="128" />
          <line x1="145" y1="64" x2="145" y2="86" />
          <line x1="195" y1="64" x2="195" y2="86" />
          <line x1="170" y1="86" x2="170" y2="107" />
          <line x1="145" y1="107" x2="145" y2="128" />
          <line x1="195" y1="107" x2="195" y2="128" />
          <line x1="170" y1="128" x2="170" y2="150" />
        </g>
      );
  }
}

/** Side-wall dressing: the theme runs down BOTH perspective walls and
 *  shifts with the room, so walking actually changes the picture. */
function SideAccents({ kind, dim, v }: { kind: PatternKind; dim: string; v: number }) {
  const j = (n: number, spread = 10) => ((v >> (n * 3)) % spread) - Math.floor(spread / 2);
  switch (kind) {
    case 'bones':
      return (
        <g stroke={dim} strokeWidth="0.75" fill="none" opacity="0.85">
          <rect x="16" y={62 + j(0)} width="12" height="24" rx="6" transform="skewY(14)" />
          {v % 2 === 0 && <rect x="52" y={40 + j(1)} width="14" height="27" rx="7" transform="skewY(11)" />}
          <rect x="308" y={-14 + j(2)} width="12" height="24" rx="6" transform="skewY(-14)" />
          {v % 3 !== 0 && <rect x="272" y={16 + j(3)} width="14" height="27" rx="7" transform="skewY(-11)" />}
          {v % 4 === 1 && <circle cx="59" cy={62 + j(4, 8)} r="2.6" fill={dim} opacity="0.7" />}
          {v % 4 === 2 && <circle cx="279" cy={38 + j(5, 8)} r="2.6" fill={dim} opacity="0.7" />}
        </g>
      );
    case 'slime':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none" opacity="0.85">
          <path d={`M ${28 + j(0, 6)} 36 q 8 40 -2 80`} />
          {v % 2 === 0 && <path d={`M ${58 + j(1, 8)} 52 q 6 34 -1 62`} />}
          <path d={`M ${312 + j(2, 6)} 36 q -8 40 2 80`} />
          {v % 3 !== 1 && <path d={`M ${282 + j(3, 8)} 52 q -6 34 1 62`} />}
          <circle cx={44 + j(4, 12)} cy={150 + j(5, 12)} r="1.8" fill={dim} />
        </g>
      );
    case 'brands':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none" opacity="0.85">
          <path d={`M 34 ${58 + j(0)} l 9 -13 l 9 15 z`} transform="skewY(12)" />
          {v % 2 === 0 && <circle cx="60" cy={104 + j(1, 8)} r="7" transform="skewY(9)" />}
          <path d={`M 306 ${20 + j(2)} l -9 -11 l -9 17 z`} transform="skewY(-12)" />
          {v % 3 !== 0 && <circle cx="280" cy={70 + j(3, 8)} r="7" transform="skewY(-9)" />}
        </g>
      );
    case 'flutes':
      return (
        <g stroke={dim} strokeWidth="0.75" fill="none" opacity="0.85">
          {[26 + j(0, 4), 44, 62 + j(1, 4)].map((x, i) => (v + i) % 4 !== 3 ? <line key={`l${i}`} x1={x} y1={20 + x} y2={214 - x * 0.6} x2={x} /> : null)}
          {[314 - j(2, 4), 296, 278 - j(3, 4)].map((x, i) => (v + i) % 3 !== 2 ? <line key={`r${i}`} x1={x} y1={20 + (340 - x)} y2={214 - (340 - x) * 0.6} x2={x} /> : null)}
        </g>
      );
    case 'cracks':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none" opacity="0.85">
          <path d={`M ${22 + j(0, 6)} 28 l 10 30 l -8 26 l 12 40`} />
          {v % 2 === 0 && <path d={`M ${64 + j(1, 8)} 52 l 6 22 l -7 20 l 9 28`} />}
          <path d={`M ${318 - j(2, 6)} 28 l -10 30 l 8 26 l -12 40`} />
          {v % 3 !== 1 && <path d={`M ${276 - j(3, 8)} 52 l -6 22 l 7 20 l -9 28`} />}
        </g>
      );
    case 'rivets':
      return (
        <g fill={dim} opacity="0.85">
          {[40 + j(0, 6), 88, 136 + j(1, 6)].map((y) => <circle key={y} cx="22" cy={y} r="1.4" />)}
          {[64, 112 + j(2, 6)].map((y) => <circle key={`m${y}`} cx="58" cy={y} r="1.2" />)}
          {[40 + j(3, 6), 88, 136].map((y) => <circle key={`r${y}`} cx="318" cy={y} r="1.4" />)}
          {[64 + j(4, 6), 112].map((y) => <circle key={`n${y}`} cx="282" cy={y} r="1.2" />)}
          {v % 2 === 0 && <><line x1="14" y1="98" x2="104" y2="112" stroke={dim} strokeWidth="0.6" /><line x1="326" y1="98" x2="236" y2="112" stroke={dim} strokeWidth="0.6" /></>}
        </g>
      );
    case 'runes':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none" opacity="0.85">
          <path d={`M 26 ${52 + j(0)} l 5 8 l -5 8 l -5 -8 z`} />
          {v % 2 === 0 && <path d={`M 56 ${96 + j(1)} v 14 m -5 -7 h 10`} />}
          <path d={`M 314 ${52 + j(2)} l 5 8 l -5 8 l -5 -8 z`} />
          {v % 3 !== 0 && <path d={`M 284 ${96 + j(3)} a 5 5 0 1 0 0.1 0`} />}
        </g>
      );
    case 'bricks':
    default:
      return (
        <g stroke={dim} strokeWidth="0.6" fill="none" opacity="0.7">
          {[54 + j(0, 8), 96, 138 + j(1, 8)].map((y, i) => (v + i) % 4 !== 3 ? <line key={`l${y}`} x1="0" y1={y} x2="104" y2={y * 0.55 + 42} /> : null)}
          {[54, 96 + j(2, 8), 138].map((y, i) => (v + i) % 3 !== 2 ? <line key={`r${y}`} x1="340" y1={y} x2="236" y2={y * 0.55 + 42} /> : null)}
        </g>
      );
  }
}

/** The wall-theme pattern key for a dungeon type (shared with prep). */
export function themePatternFor(dungeonType: string): string {
  return themeFor(dungeonType).pattern;
}

export function FirstPersonView() {
  useSyncExternalStore(subscribeArt, artSnapshot); // backdrop manifest may load late
  const world = useStore((s) => s.world);
  const facing = useStore((s) => s.facing);
  const move = useStore((s) => s.move);
  if (!world.currentDungeon || !world.currentRoom) return null;
  const d = world.dungeons[world.currentDungeon];
  const room = d.rooms[world.currentRoom];
  const open = (dir: Cardinal) => !!room.connections[dir];
  const lockedDir = room.lockedDoor && !room.lockedDoor.opened ? room.lockedDoor.dir : null;

  const ahead = facing;
  const left = LEFT_OF[facing];
  const right = RIGHT_OF[facing];
  const behind = BEHIND[facing];

  const theme = themeFor(d.dungeonType);
  const { line, dim, wall } = theme;

  const hostile = room.enemies === 'alive';
  const chest = room.chest && !room.chest.opened;
  const stairs = room.connections.down ? 'down' : room.connections.up ? 'up' : null;
  const dark = isDark(world);
  const backdrop = dungeonBackdropUrl(theme.pattern);
  const variant = roomVariant(room.id);
  const monsterKey = hostile && room.encounterKey && MONSTERS[room.encounterKey] ? room.encounterKey : null;
  const veteran = monsterKey ? (world.killCounts?.[monsterKey] ?? 0) >= 5 : false;
  const walk = (dir: Cardinal) => () => move(dir);

  return (
    <div className="fpv" style={{ position: 'relative' }}>
      <div className="fpv-frame" key={`${room.id}:${facing}`}>
      <svg viewBox="0 0 340 214" role="img" aria-label={`First-person view of ${room.name}, facing ${facing}`}>
        <defs>
          <linearGradient id="fpv-floorgrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={theme.floor} />
            <stop offset="100%" stopColor={theme.floorFar} />
          </linearGradient>
          <linearGradient id="fpv-sidegrad-l" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={theme.side} />
            <stop offset="100%" stopColor={theme.sideDark} />
          </linearGradient>
          <linearGradient id="fpv-sidegrad-r" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor={theme.side} />
            <stop offset="100%" stopColor={theme.sideDark} />
          </linearGradient>
          <linearGradient id="fpv-ceilgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.ceil} />
            <stop offset="100%" stopColor={theme.sideDark} />
          </linearGradient>
          <linearGradient id="fpv-doorfog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.line} stopOpacity="0.14" />
            <stop offset="100%" stopColor={theme.line} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="340" height="214" fill="#050403" />
        {/* solid surfaces in perspective */}
        <polygon points="0,0 340,0 220,64 120,64" fill="url(#fpv-ceilgrad)" />
        <polygon points="0,214 340,214 220,150 120,150" fill="url(#fpv-floorgrad)" />
        <polygon points="0,0 120,64 120,150 0,214" fill="url(#fpv-sidegrad-l)" />
        <polygon points="340,0 220,64 220,150 340,214" fill="url(#fpv-sidegrad-r)" />
        <rect x="120" y="64" width="100" height="86" fill={wall} />
        {/* the painted atmosphere: Ideogram's corridor for this theme */}
        {backdrop && !dark && (
          <image href={backdrop} x="0" y="0" width="340" height="214" preserveAspectRatio="xMidYMid slice" opacity="0.72" />
        )}
        {/* flagstone floor: courses converging on the far wall */}
        <g stroke={dim} strokeWidth="0.6" opacity={backdrop ? 0.25 : 0.55}>
          <line x1="0" y1="214" x2="130" y2="150" />
          <line x1="85" y1="214" x2="152" y2="150" />
          <line x1="170" y1="214" x2="170" y2="150" />
          <line x1="255" y1="214" x2="188" y2="150" />
          <line x1="340" y1="214" x2="210" y2="150" />
          <path d="M 26 200 q 144 -16 288 0" fill="none" />
          <path d="M 78 178 q 92 -10 184 0" fill="none" />
          <path d="M 108 162 q 62 -6 124 0" fill="none" />
        </g>
        {/* ceiling beams */}
        <g stroke={dim} strokeWidth="0.6" opacity={backdrop ? 0.18 : 0.4}>
          <path d="M 30 12 q 140 12 280 0" fill="none" />
          <path d="M 74 34 q 96 8 192 0" fill="none" />
          <path d="M 104 52 q 66 5 132 0" fill="none" />
        </g>
        {/* edge highlights keep the depth honest */}
        <line x1="0" y1="0" x2="120" y2="64" stroke={line} strokeWidth="1.1" opacity="0.8" />
        <line x1="340" y1="0" x2="220" y2="64" stroke={line} strokeWidth="1.1" opacity="0.8" />
        <line x1="0" y1="214" x2="120" y2="150" stroke={line} strokeWidth="1.1" opacity="0.8" />
        <line x1="340" y1="214" x2="220" y2="150" stroke={line} strokeWidth="1.1" opacity="0.8" />
        <rect x="120" y="64" width="100" height="86" fill="none" stroke={line} strokeWidth="0.9" opacity="0.7" />
        <SideAccents kind={theme.pattern} dim={dim} v={variant} />
        {/* waterline in the flooded places */}
        {theme.waterline && (
          <path d="M 0 200 q 20 -5 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke={dim} strokeWidth="1.2" fill="none" opacity="0.9" />
        )}

        {/* the dungeon's own wallwork — the doorway (if any) opens through it */}
        <FarPattern kind={theme.pattern} dim={dim} v={variant} />
        {open(ahead) ? (
          <>
            <DoorFrame x={146} y={82} w={48} h={68} theme={theme} open={true} />
            <rect className="fpv-door" x="139" y="71" width="62" height="82" fill="transparent" onClick={walk(ahead)}>
              <title>Walk {GLYPH[ahead]}</title>
            </rect>
            {lockedDir === ahead && <text x="170" y="120" textAnchor="middle" fontSize="16" fill={line}>🔒</text>}
            {hostile && lockedDir !== ahead && !monsterKey && (
              <>
                <circle cx="162" cy="112" r="2.6" fill="#ff5544">
                  <animate attributeName="opacity" values="1;0.25;1" dur="2.2s" repeatCount="indefinite" />
                </circle>
                <circle cx="178" cy="112" r="2.6" fill="#ff5544">
                  <animate attributeName="opacity" values="1;0.25;1" dur="2.2s" repeatCount="indefinite" />
                </circle>
              </>
            )}
          </>
        ) : null}

        {/* left wall doorway: stone frame in perspective */}
        {open(left) && (
          <>
            <polygon points="26,26 92,52 92,152 26,188" fill={theme.jamb} stroke={theme.line} strokeWidth="0.8" />
            <line x1="30" y1="88" x2="86" y2="98" stroke={theme.dim} strokeWidth="0.7" />
            <line x1="30" y1="132" x2="86" y2="128" stroke={theme.dim} strokeWidth="0.7" />
            <polygon points="34,36 86,58 86,146 34,178" fill="#020202" />
            <polygon points="34,36 86,58 86,84 34,72" fill="url(#fpv-doorfog)" />
            <polygon className="fpv-door" points="26,26 92,52 92,152 26,188" fill="transparent" onClick={walk(left)}>
              <title>Walk {GLYPH[left]}</title>
            </polygon>
            {lockedDir === left && <text x="60" y="112" textAnchor="middle" fontSize="14" fill={line}>🔒</text>}
          </>
        )}
        {/* right wall doorway: stone frame in perspective */}
        {open(right) && (
          <>
            <polygon points="314,26 248,52 248,152 314,188" fill={theme.jamb} stroke={theme.line} strokeWidth="0.8" />
            <line x1="310" y1="88" x2="254" y2="98" stroke={theme.dim} strokeWidth="0.7" />
            <line x1="310" y1="132" x2="254" y2="128" stroke={theme.dim} strokeWidth="0.7" />
            <polygon points="306,36 254,58 254,146 306,178" fill="#020202" />
            <polygon points="306,36 254,58 254,84 306,72" fill="url(#fpv-doorfog)" />
            <polygon className="fpv-door" points="314,26 248,52 248,152 314,188" fill="transparent" onClick={walk(right)}>
              <title>Walk {GLYPH[right]}</title>
            </polygon>
            {lockedDir === right && <text x="280" y="112" textAnchor="middle" fontSize="14" fill={line}>🔒</text>}
          </>
        )}

        {/* stairs on the floor */}
        {stairs === 'down' && (
          <g stroke={line} strokeWidth="1.5" fill="none">
            <path d="M 150 176 h 40 M 155 184 h 30 M 160 192 h 20" />
            <text x="170" y="208" textAnchor="middle" fontSize="9" fill={line}>STAIRS DOWN</text>
          </g>
        )}
        {stairs === 'up' && (
          <g stroke={line} strokeWidth="1.5" fill="none">
            <path d="M 160 176 h 20 M 155 184 h 30 M 150 192 h 40" />
            <text x="170" y="208" textAnchor="middle" fontSize="9" fill={line}>STAIRS UP</text>
          </g>
        )}

        {/* chest on the floor, stage right */}
        {chest && (
          <g>
            <polygon points="238,168 274,168 280,186 232,186" fill="#241c0c" stroke={line} strokeWidth="1.5" />
            <line x1="235" y1="177" x2="277" y2="177" stroke={line} strokeWidth="1" />
          </g>
        )}
        {/* shrine candle */}
        {room.shrine && !room.shrine.used && (
          <g>
            <line x1="78" y1="188" x2="78" y2="176" stroke="#ddd" strokeWidth="2" />
            <circle cx="78" cy="172" r="3" fill="#ffb347">
              <animate attributeName="r" values="3;2.2;3" dur="1.4s" repeatCount="indefinite" />
            </circle>
          </g>
        )}

        {/* facing compass + exits readout */}
        <text x="8" y="14" fontSize="10" fill={line} className="mono">FACING {GLYPH[facing]}</text>
        <text x="332" y="14" fontSize="10" fill={dim} textAnchor="end" className="mono">
          {(['north', 'east', 'south', 'west'] as Cardinal[]).filter(open).map((c) => GLYPH[c]).join(' ')}
        </text>
        {open(behind) && !stairs && (
          <text className="fpv-door-text" x="170" y="208" textAnchor="middle" fontSize="8" fill={dim} onClick={walk(behind)}>
            · passage behind you — turn back ({GLYPH[behind]}) ·
          </text>
        )}

        {dark && (
          <>
            <rect x="0" y="0" width="340" height="214" fill="#000" opacity="0.86" pointerEvents="none" />
            <text x="170" y="100" textAnchor="middle" fontSize="12" fill="#3a2f1a">TOO DARK TO SEE</text>
            <text x="170" y="118" textAnchor="middle" fontSize="8" fill="#3a2f1a">light a torch — the walls could be anywhere</text>
          </>
        )}
      </svg>
      </div>
      {monsterKey && !dark && (
        <div className="fpv-monster" title={veteran ? MONSTERS[monsterKey].name : 'Something hostile'}>
          <MonsterPortrait templateKey={monsterKey} size={76} world={world} />
          <div className="fpv-monster-name">{veteran ? MONSTERS[monsterKey].name : '???'}</div>
        </div>
      )}
      <div className="fpv-caption small dim">
        {room.name} — {dark ? 'pitch dark. ' : hostile ? 'something moves in the dark. ' : ''}{room.description}
      </div>
    </div>
  );
}
