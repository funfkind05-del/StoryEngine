// The corridor you're standing in — single-point-perspective wireframe,
// the way 1985 drew dungeons and the way it still looks right. Renders
// the current room from the party's facing: openings ahead/left/right,
// stairs, chest, shrine, and the thing in the doorway when the room is
// hostile. Every dungeon type has its own walls: bone niches in the
// crypts, slime in the flooded runs, rivets in the vaults.

import { useStore } from '../state/store';
import { MonsterPortrait } from './MonsterArt';
import { isDark } from '../engine/dungeon';
import { MONSTERS } from '../engine/monsters';

export type Cardinal = 'north' | 'south' | 'east' | 'west';
export const LEFT_OF: Record<Cardinal, Cardinal> = { north: 'west', west: 'south', south: 'east', east: 'north' };
export const RIGHT_OF: Record<Cardinal, Cardinal> = { north: 'east', east: 'south', south: 'west', west: 'north' };
export const BEHIND: Record<Cardinal, Cardinal> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const GLYPH: Record<Cardinal, string> = { north: 'N', south: 'S', east: 'E', west: 'W' };

// ---------- wall themes by dungeon type ----------
type PatternKind = 'bones' | 'slime' | 'brands' | 'rivets' | 'flutes' | 'cracks' | 'runes' | 'bricks';

interface WallTheme {
  line: string;
  dim: string;
  wall: string;
  pattern: PatternKind;
  /** flooded dungeons show a waterline on the floor */
  waterline?: boolean;
}

function themeFor(dungeonType: string): WallTheme {
  const t = dungeonType.toLowerCase();
  if (t.includes('crypt')) return { line: '#c9a959', dim: '#5a4a28', wall: '#0d0b08', pattern: 'bones' };
  if (t.includes('sewer') || t.includes('smuggler') || t.includes('flooded')) {
    return { line: '#6aa87f', dim: '#2e4a38', wall: '#081009', pattern: 'slime', waterline: true };
  }
  if (t.includes('temple') || t.includes('drowned')) return { line: '#7fb8a8', dim: '#35544c', wall: '#07110e', pattern: 'flutes', waterline: t.includes('drowned') };
  if (t.includes('cult')) return { line: '#c97a4a', dim: '#5a3524', wall: '#100a06', pattern: 'brands' };
  if (t.includes('vault') || t.includes('bank')) return { line: '#9fb0c4', dim: '#44505e', wall: '#0a0d11', pattern: 'rivets' };
  if (t.includes('dragon') || t.includes('undercroft')) return { line: '#d98a3d', dim: '#6b431e', wall: '#120b05', pattern: 'cracks' };
  if (t.includes('palace') || t.includes('hollow')) return { line: '#a98fd6', dim: '#4b3f66', wall: '#0c0913', pattern: 'runes' };
  return { line: '#c9a959', dim: '#5a4a28', wall: '#0d0b08', pattern: 'bricks' };
}

/** Far-wall texture when the way ahead is walled. */
function FarPattern({ kind, dim }: { kind: PatternKind; dim: string }) {
  switch (kind) {
    case 'bones':
      // burial niches, some still occupied
      return (
        <g stroke={dim} strokeWidth="0.75" fill="none">
          <rect x="132" y="76" width="20" height="26" rx="9" />
          <rect x="160" y="76" width="20" height="26" rx="9" />
          <rect x="188" y="76" width="20" height="26" rx="9" />
          <rect x="132" y="112" width="20" height="26" rx="9" />
          <rect x="188" y="112" width="20" height="26" rx="9" />
          <circle cx="170" cy="87" r="3.2" fill={dim} opacity="0.7" />
          <circle cx="142" cy="123" r="3.2" fill={dim} opacity="0.7" />
        </g>
      );
    case 'slime':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none">
          <path d="M 122 70 q 10 14 2 30 q -4 12 4 24" />
          <path d="M 150 66 q 8 20 0 36 q -6 14 3 26" />
          <path d="M 186 68 q -6 18 2 34 q 6 12 -2 26" />
          <path d="M 212 72 q 6 16 -2 30 q -5 12 3 22" />
          <circle cx="140" cy="132" r="2" fill={dim} />
          <circle cx="198" cy="120" r="2" fill={dim} />
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

/** Side-wall accents so the theme reads even with the far wall open. */
function SideAccents({ kind, dim }: { kind: PatternKind; dim: string }) {
  switch (kind) {
    case 'bones':
      return (
        <g stroke={dim} strokeWidth="0.75" fill="none" opacity="0.8">
          <rect x="16" y="70" width="12" height="24" rx="6" transform="skewY(14)" />
          <rect x="308" y="-6" width="12" height="24" rx="6" transform="skewY(-14)" />
        </g>
      );
    case 'slime':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none" opacity="0.8">
          <path d="M 30 40 q 8 40 -2 80" />
          <path d="M 310 40 q -8 40 2 80" />
        </g>
      );
    case 'cracks':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none" opacity="0.8">
          <path d="M 24 30 l 10 30 l -8 26 l 12 40" />
          <path d="M 316 30 l -10 30 l 8 26 l -12 40" />
        </g>
      );
    case 'rivets':
      return (
        <g fill={dim} opacity="0.8">
          {[46, 90, 134].map((y) => <circle key={y} cx="22" cy={y} r="1.4" />)}
          {[46, 90, 134].map((y) => <circle key={`r${y}`} cx="318" cy={y} r="1.4" />)}
        </g>
      );
    case 'runes':
      return (
        <g stroke={dim} strokeWidth="0.9" fill="none" opacity="0.8">
          <path d="M 26 60 l 5 8 l -5 8 l -5 -8 z" />
          <path d="M 314 60 l 5 8 l -5 8 l -5 -8 z" />
        </g>
      );
    default:
      return null;
  }
}

export function FirstPersonView() {
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
  const dk = '#050403';

  const hostile = room.enemies === 'alive';
  const chest = room.chest && !room.chest.opened;
  const stairs = room.connections.down ? 'down' : room.connections.up ? 'up' : null;
  const dark = isDark(world);
  const monsterKey = hostile && room.encounterKey && MONSTERS[room.encounterKey] ? room.encounterKey : null;
  const veteran = monsterKey ? (world.killCounts?.[monsterKey] ?? 0) >= 5 : false;
  const walk = (dir: Cardinal) => () => move(dir);

  return (
    <div className="fpv" style={{ position: 'relative' }}>
      <svg viewBox="0 0 340 214" role="img" aria-label={`First-person view of ${room.name}, facing ${facing}`}>
        <rect x="0" y="0" width="340" height="214" fill={dk} />
        {/* ceiling / floor / side walls in perspective */}
        <polygon points="0,0 340,0 220,64 120,64" fill={wall} stroke={dim} strokeWidth="1" />
        <polygon points="0,214 340,214 220,150 120,150" fill={wall} stroke={dim} strokeWidth="1" />
        <polygon points="0,0 120,64 120,150 0,214" fill={wall} stroke={dim} strokeWidth="1" />
        <polygon points="340,0 220,64 220,150 340,214" fill={wall} stroke={dim} strokeWidth="1" />
        {/* far wall */}
        <rect x="120" y="64" width="100" height="86" fill={wall} stroke={line} strokeWidth="1.5" />
        {/* perspective edge lines */}
        <line x1="0" y1="0" x2="120" y2="64" stroke={line} strokeWidth="1.5" />
        <line x1="340" y1="0" x2="220" y2="64" stroke={line} strokeWidth="1.5" />
        <line x1="0" y1="214" x2="120" y2="150" stroke={line} strokeWidth="1.5" />
        <line x1="340" y1="214" x2="220" y2="150" stroke={line} strokeWidth="1.5" />
        <SideAccents kind={theme.pattern} dim={dim} />
        {/* waterline in the flooded places */}
        {theme.waterline && (
          <path d="M 0 200 q 20 -5 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke={dim} strokeWidth="1.2" fill="none" opacity="0.9" />
        )}

        {/* opening ahead, or the dungeon's own wallwork if walled */}
        {open(ahead) ? (
          <>
            <rect className="fpv-door" x="146" y="82" width="48" height="68" fill={dk} stroke={line} strokeWidth="1.5" onClick={walk(ahead)}>
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
        ) : (
          <FarPattern kind={theme.pattern} dim={dim} />
        )}

        {/* left wall doorway */}
        {open(left) && (
          <>
            <polygon className="fpv-door" points="34,36 86,58 86,146 34,178" fill={dk} stroke={line} strokeWidth="1.5" onClick={walk(left)}>
              <title>Walk {GLYPH[left]}</title>
            </polygon>
            {lockedDir === left && <text x="60" y="112" textAnchor="middle" fontSize="14" fill={line}>🔒</text>}
          </>
        )}
        {/* right wall doorway */}
        {open(right) && (
          <>
            <polygon className="fpv-door" points="306,36 254,58 254,146 306,178" fill={dk} stroke={line} strokeWidth="1.5" onClick={walk(right)}>
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
