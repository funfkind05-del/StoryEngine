// Always-visible minimap (bottom of the manuscript sidebar).
// Above ground: the city as a street graph — nodes are locations,
// edges are travel connections, gold ring marks the party. Clicking
// an adjacent location travels there.
// Underground: an automap of the current dungeon floor — only rooms
// the party has explored are drawn; passages into darkness show as
// "?" stubs, the classic way.

import { useStore } from '../state/store';
import type { DungeonRoom } from '../engine/types';

const TYPE_GLYPH: Record<string, string> = {
  'dungeon-entrance': '▾',
  temple: '✝',
  guildhall: '⚔',
  shop: '◇',
  market: '◈',
  tavern: '◆',
  residence: '⌂',
};

function CityMap() {
  const world = useStore((s) => s.world);
  const travel = useStore((s) => s.travel);
  const setToast = useStore((s) => s.setToast);
  const here = world.locations[world.partyLocation];
  const nodes = Object.values(world.locations).filter((l) => l.mapPos);
  const drawn = new Set(nodes.map((n) => n.id));
  const edges: { a: string; b: string }[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    for (const c of n.connections) {
      if (!drawn.has(c)) continue;
      const key = [n.id, c].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: n.id, b: c });
    }
  }
  const pos = (id: string) => world.locations[id].mapPos!;
  const click = (id: string) => {
    if (id === world.partyLocation) return;
    if (world.combat || world.currentDungeon) return;
    if (here?.connections.includes(id)) travel(id);
    else setToast(`No direct way to ${world.locations[id].name} from here — travel via the connections.`);
  };
  return (
    <svg viewBox="0 0 100 104" className="minimap-svg">
      <text x={4} y={6} className="mm-district">Highcourt</text>
      <text x={30} y={30} className="mm-district">Ironmarket</text>
      <text x={68} y={26} className="mm-district">Old Quarter</text>
      <text x={4} y={58} className="mm-district">Dock Ward</text>
      {edges.map((e) => {
        const a = pos(e.a);
        const b = pos(e.b);
        return <line key={`${e.a}-${e.b}`} x1={a.x} y1={a.y + 4} x2={b.x} y2={b.y + 4} className="mm-edge" />;
      })}
      {nodes.map((n) => {
        const p = n.mapPos!;
        const isHere = n.id === world.partyLocation;
        const reachable = here?.connections.includes(n.id);
        return (
          <g key={n.id} onClick={() => click(n.id)} style={{ cursor: reachable ? 'pointer' : 'default' }}>
            <circle cx={p.x} cy={p.y + 4} r={isHere ? 3.4 : 2.4} className={`mm-node${isHere ? ' here' : ''}${n.dungeonId ? ' danger' : ''}${reachable ? ' reachable' : ''}`} />
            {TYPE_GLYPH[n.type] && <text x={p.x} y={p.y + 5.4} className="mm-glyph">{TYPE_GLYPH[n.type]}</text>}
            <title>{n.name}{n.dungeonId ? ` — ${world.dungeons[n.dungeonId].name}` : ''}{reachable ? ' (click to travel)' : ''}</title>
          </g>
        );
      })}
      {here?.mapPos && <circle cx={here.mapPos.x} cy={here.mapPos.y + 4} r={5} className="mm-pulse" />}
    </svg>
  );
}

function DungeonMap() {
  const world = useStore((s) => s.world);
  const d = world.dungeons[world.currentDungeon!];
  const current = d.rooms[world.currentRoom!];
  const floorRooms = Object.values(d.rooms).filter((r) => r.floor === current.floor);
  const cell = 24;
  const P = (r: DungeonRoom) => ({ x: r.x * cell + 14, y: r.y * cell + 14 });
  const explored = floorRooms.filter((r) => r.explored);
  // passages: explored↔explored solid; explored→unexplored gets a "?" stub
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const stubs: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  for (const r of explored) {
    for (const dest of Object.values(r.connections)) {
      const o = d.rooms[dest!];
      if (!o || o.floor !== r.floor) continue;
      const key = [r.id, o.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const a = P(r);
      const b = P(o);
      if (o.explored) lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      else stubs.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }
  const glyph = (r: DungeonRoom) =>
    r.isBossRoom && r.enemies === 'alive' ? '☠' : r.enemies === 'alive' ? '!' : r.chest && !r.chest.opened ? '▣' : r.isStairsDown ? '▼' : r.isStairsUp ? '▲' : '';
  return (
    <svg viewBox="0 0 100 104" className="minimap-svg">
      <text x={4} y={7} className="mm-district">{d.name} — floor {current.floor}/{d.floors}</text>
      {lines.map((l, i) => <line key={i} {...l} className="mm-edge" />)}
      {explored.map((r) => {
        const p = P(r);
        const isHere = r.id === current.id;
        return (
          <g key={r.id}>
            <rect x={p.x - 8} y={p.y - 8} width={16} height={16} rx={2} className={`mm-room${isHere ? ' here' : ''}${r.enemies === 'alive' ? ' danger' : ''}`} />
            {glyph(r) && <text x={p.x} y={p.y + 3} className="mm-roomglyph">{glyph(r)}</text>}
            <title>{r.name}</title>
          </g>
        );
      })}
      {stubs.map((s, i) => <text key={i} x={s.x} y={s.y + 3} className="mm-unknown">?</text>)}
    </svg>
  );
}

export function MiniMap() {
  const inDungeon = useStore((s) => !!s.world.currentDungeon && !!s.world.currentRoom);
  const name = useStore((s) => s.world.locations[s.world.partyLocation]?.name);
  return (
    <div className="minimap">
      <h3>{inDungeon ? 'Automap' : 'Blackwall'}</h3>
      {inDungeon ? <DungeonMap /> : <CityMap />}
      {!inDungeon && <div className="dim" style={{ fontSize: 10.5 }}>◉ {name} — click a linked place to travel</div>}
    </div>
  );
}
