// The corridor you're standing in — single-point-perspective wireframe,
// the way 1985 drew dungeons and the way it still looks right. Renders
// the current room from the party's facing: openings ahead/left/right,
// stairs, chest, shrine, and red eyes in the dark when something lives.

import { useStore } from '../state/store';

type Cardinal = 'north' | 'south' | 'east' | 'west';
const LEFT_OF: Record<Cardinal, Cardinal> = { north: 'west', west: 'south', south: 'east', east: 'north' };
const RIGHT_OF: Record<Cardinal, Cardinal> = { north: 'east', east: 'south', south: 'west', west: 'north' };
const BEHIND: Record<Cardinal, Cardinal> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const GLYPH: Record<Cardinal, string> = { north: 'N', south: 'S', east: 'E', west: 'W' };

export function FirstPersonView() {
  const world = useStore((s) => s.world);
  const facing = useStore((s) => s.facing);
  if (!world.currentDungeon || !world.currentRoom) return null;
  const d = world.dungeons[world.currentDungeon];
  const room = d.rooms[world.currentRoom];
  const open = (dir: Cardinal) => !!room.connections[dir];
  const lockedDir = room.lockedDoor && !room.lockedDoor.opened ? room.lockedDoor.dir : null;

  const ahead = facing;
  const left = LEFT_OF[facing];
  const right = RIGHT_OF[facing];
  const behind = BEHIND[facing];

  const line = 'var(--accent)';
  const dim = '#5a4a28';
  const wall = '#0d0b08';
  const dark = '#050403';

  const hostile = room.enemies === 'alive';
  const chest = room.chest && !room.chest.opened;
  const stairs = room.connections.down ? 'down' : room.connections.up ? 'up' : null;

  return (
    <div className="fpv">
      <svg viewBox="0 0 340 214" role="img" aria-label={`First-person view of ${room.name}, facing ${facing}`}>
        <rect x="0" y="0" width="340" height="214" fill={dark} />
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

        {/* opening ahead, or brickwork if walled */}
        {open(ahead) ? (
          <>
            <rect x="146" y="82" width="48" height="68" fill={dark} stroke={line} strokeWidth="1.5" />
            {lockedDir === ahead && <text x="170" y="120" textAnchor="middle" fontSize="16" fill="var(--accent)">🔒</text>}
            {hostile && lockedDir !== ahead && (
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
        )}

        {/* left wall doorway */}
        {open(left) && (
          <>
            <polygon points="34,36 86,58 86,146 34,178" fill={dark} stroke={line} strokeWidth="1.5" />
            {lockedDir === left && <text x="60" y="112" textAnchor="middle" fontSize="14" fill="var(--accent)">🔒</text>}
          </>
        )}
        {/* right wall doorway */}
        {open(right) && (
          <>
            <polygon points="306,36 254,58 254,146 306,178" fill={dark} stroke={line} strokeWidth="1.5" />
            {lockedDir === right && <text x="280" y="112" textAnchor="middle" fontSize="14" fill="var(--accent)">🔒</text>}
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
            <polygon points="238,168 274,168 280,186 232,186" fill="#241c0c" stroke="var(--accent)" strokeWidth="1.5" />
            <line x1="235" y1="177" x2="277" y2="177" stroke="var(--accent)" strokeWidth="1" />
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
        {open(behind) && !stairs && <text x="170" y="208" textAnchor="middle" fontSize="8" fill={dim}>· passage behind you ·</text>}
      </svg>
      <div className="fpv-caption small dim">
        {room.name} — {hostile ? 'something moves in the dark. ' : ''}{room.description}
      </div>
    </div>
  );
}
