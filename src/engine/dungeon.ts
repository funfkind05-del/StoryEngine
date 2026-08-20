// Persistent dungeon generation and exploration. A dungeon is
// generated once from its stored seed and then saved forever; room
// state (enemies dead, chest opened, trap disarmed) persists across
// visits unless a simulation event changes it.

import type { Dungeon, DungeonRoom, RoomId, SimEvent, WorldState } from './types';
import { Rng } from './rng';
import { addMinutes, logEvent, nextId, partyMembers } from './world';

const ROOM_NAMES = [
  'Collapsed Gallery', 'Bone Niche', 'Flooded Chamber', 'Ossuary', 'Broken Shrine',
  'Rat Warren', 'Old Vault', 'Sunken Stair', 'Pillared Hall', 'Narrow Crawl',
  'Toppled Statuary', 'Mold Garden', 'Forgotten Cell', 'Seeping Cistern', 'Coffin Row',
  'Cracked Rotunda', 'Low Tunnel', 'Candle Room', 'Robbers’ Camp', 'Silent Chapel',
];

const ROOM_DESCS = [
  'Damp stone presses close; the air tastes of earth and old rot.',
  'Water drips somewhere in the dark, keeping its own slow time.',
  'Rubble chokes half the chamber. Something small skitters away from the light.',
  'Niches line the walls, most long since looted, a few still sealed.',
  'The ceiling sags on cracked pillars. Dust falls with every footstep.',
  'Scorch marks and melted candle wax speak of visitors who never left.',
  'A cold draft moves through here from no visible source.',
  'The floor is a shallow black pool that swallows sound.',
];

const TRAPS = ['pit trap', 'dart trap', 'snare', 'collapsing ceiling', 'poison needle'];

/** Generate the dungeon's full map from its stored seed (idempotent). */
export function generateDungeon(world: WorldState, dungeonId: string): Dungeon {
  const d = world.dungeons[dungeonId];
  if (d.generated) return d;
  const rng = new Rng(d.generationSeed);

  const grid = 4; // rooms laid on a 4x4 grid per floor, not all cells used
  let firstRoom: RoomId | null = null;
  let prevStairs: RoomId | null = null;

  for (let floor = 1; floor <= d.floors; floor++) {
    // carve a connected set of cells via random walk
    const cells = new Map<string, RoomId>();
    let cx = rng.int(0, grid - 1);
    let cy = rng.int(0, grid - 1);
    const targetRooms = rng.int(6, 9);
    const walk: { x: number; y: number }[] = [{ x: cx, y: cy }];
    let guard = 0;
    while (walk.length < targetRooms && guard++ < 200) {
      const dir = rng.pick([[0, 1], [0, -1], [1, 0], [-1, 0]] as const);
      const nx = cx + dir[0];
      const ny = cy + dir[1];
      if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
      cx = nx;
      cy = ny;
      if (!walk.some((p) => p.x === cx && p.y === cy)) walk.push({ x: cx, y: cy });
    }
    // create rooms
    for (const p of walk) {
      const id = nextId(world, 'ROOM');
      const room: DungeonRoom = {
        id,
        floor,
        x: p.x,
        y: p.y,
        name: rng.pick(ROOM_NAMES),
        description: rng.pick(ROOM_DESCS),
        explored: false,
        enemies: 'none',
        itemsRemaining: [],
        connections: {},
      };
      // populate
      if (rng.chance(0.45)) {
        room.enemies = 'alive';
        room.encounterKey = rng.pick(d.primaryEnemies);
      }
      if (rng.chance(0.25)) room.chest = { opened: false, lootSeed: rng.fork() };
      if (rng.chance(0.18)) room.trap = { kind: rng.pick(TRAPS), disarmed: false, triggered: false };
      d.rooms[id] = room;
      cells.set(`${p.x},${p.y}`, id);
    }
    // connect adjacent cells
    for (const p of walk) {
      const here = cells.get(`${p.x},${p.y}`)!;
      const north = cells.get(`${p.x},${p.y - 1}`);
      const south = cells.get(`${p.x},${p.y + 1}`);
      const east = cells.get(`${p.x + 1},${p.y}`);
      const west = cells.get(`${p.x - 1},${p.y}`);
      const r = d.rooms[here];
      if (north && rng.chance(0.85)) { r.connections.north = north; d.rooms[north].connections.south = here; }
      if (south && !r.connections.south && rng.chance(0.85)) { r.connections.south = south; d.rooms[south].connections.north = here; }
      if (east && rng.chance(0.85)) { r.connections.east = east; d.rooms[east].connections.west = here; }
      if (west && !r.connections.west && rng.chance(0.85)) { r.connections.west = west; d.rooms[west].connections.east = here; }
    }
    // ensure connectivity: link any orphaned room to a neighbor cell room
    const roomsThisFloor = walk.map((p) => cells.get(`${p.x},${p.y}`)!);
    for (const rid of roomsThisFloor) {
      const r = d.rooms[rid];
      if (Object.keys(r.connections).length === 0) {
        const other = roomsThisFloor.find((o) => o !== rid);
        if (other) { r.connections.north = other; d.rooms[other].connections.south = rid; }
      }
    }
    const entry = roomsThisFloor[0];
    if (floor === 1) {
      firstRoom = entry;
      d.rooms[entry].isStairsUp = true; // back to the surface
      d.rooms[entry].enemies = 'none';
      d.rooms[entry].encounterKey = undefined;
      d.rooms[entry].name = 'Entry Chamber';
    }
    if (prevStairs) {
      d.rooms[prevStairs].connections.down = entry;
      d.rooms[entry].connections.up = prevStairs;
      d.rooms[entry].isStairsUp = true;
    }
    const last = roomsThisFloor[roomsThisFloor.length - 1];
    if (floor < d.floors) {
      d.rooms[last].isStairsDown = true;
      prevStairs = last;
    } else {
      // boss room on the deepest floor
      d.rooms[last].isBossRoom = true;
      d.rooms[last].name = 'Warden’s Vault';
      d.rooms[last].description = 'A vaulted tomb chamber. Something old keeps its watch here.';
      d.rooms[last].enemies = 'alive';
      d.rooms[last].encounterKey = d.bossKey;
      // one secret door somewhere on the deepest floor
      const candidates = roomsThisFloor.filter((r) => r !== last);
      if (candidates.length) {
        const from = rng.pick(candidates);
        d.rooms[from].secretDoor = { discovered: false, to: last };
      }
    }
  }
  d.entryRoom = firstRoom!;
  d.generated = true;
  logEvent(world, 'dungeon.generated', { dungeon: d.id, seed: d.generationSeed }, `${d.name} mapped (seed ${d.generationSeed}).`);
  return d;
}

export function enterDungeon(world: WorldState, dungeonId: string): SimEvent {
  const d = generateDungeon(world, dungeonId);
  world.currentDungeon = d.id;
  world.currentRoom = d.entryRoom;
  world.partyLocation = d.entranceLocation;
  const entry = d.rooms[d.entryRoom];
  entry.explored = true;
  addMinutes(world, 10);
  const party = partyMembers(world);
  for (const c of party) c.activity = `exploring ${d.name}`;
  return logEvent(
    world,
    'dungeon.enter',
    { dungeon: d.id, room: d.entryRoom },
    `The party entered ${d.name}.`,
    { location: d.entranceLocation, witnesses: party.map((c) => c.id) },
  );
}

export function exitDungeon(world: WorldState): SimEvent {
  const d = world.currentDungeon ? world.dungeons[world.currentDungeon] : null;
  world.currentDungeon = null;
  world.currentRoom = null;
  addMinutes(world, 15);
  for (const c of partyMembers(world)) c.activity = 'back on the streets';
  return logEvent(world, 'dungeon.exit', { dungeon: d?.id ?? null }, `The party left ${d?.name ?? 'the dungeon'} and returned to the surface.`);
}

export type MoveDir = 'north' | 'south' | 'east' | 'west' | 'down' | 'up';

export function moveInDungeon(world: WorldState, dir: MoveDir): { event: SimEvent; room: DungeonRoom } | { error: string } {
  if (!world.currentDungeon || !world.currentRoom) return { error: 'Not inside a dungeon.' };
  const d = world.dungeons[world.currentDungeon];
  const here = d.rooms[world.currentRoom];
  const destId = here.connections[dir];
  if (!destId) return { error: `No passage ${dir} from ${here.name}.` };
  const dest = d.rooms[destId];
  world.currentRoom = destId;
  const firstVisit = !dest.explored;
  dest.explored = true;
  addMinutes(world, 5);
  // trap check on entering
  let trapNote = '';
  if (dest.trap && !dest.trap.disarmed && !dest.trap.triggered) {
    trapNote = ` A ${dest.trap.kind} waits here, not yet sprung.`;
  }
  const event = logEvent(
    world,
    'dungeon.move',
    { dungeon: d.id, from: here.id, to: destId, dir },
    `The party moved ${dir} into ${dest.name} (floor ${dest.floor}).${firstVisit ? ' First time explored.' : ''}${trapNote}`,
    { witnesses: partyMembers(world).map((c) => c.id) },
  );
  return { event, room: dest };
}

export function searchRoom(world: WorldState): SimEvent | { error: string } {
  if (!world.currentDungeon || !world.currentRoom) return { error: 'Not inside a dungeon.' };
  const d = world.dungeons[world.currentDungeon];
  const room = d.rooms[world.currentRoom];
  addMinutes(world, 10);
  const finds: string[] = [];
  if (room.secretDoor && !room.secretDoor.discovered) {
    const mc = world.characters[world.mcId];
    const rng = new Rng((d.generationSeed ^ room.id.length ^ world.time.minute) >>> 0);
    if (rng.die(20) + mc.skills.tracking + Math.floor(mc.attributes.wisdom / 3) >= 14) {
      room.secretDoor.discovered = true;
      const to = d.rooms[room.secretDoor.to];
      // open the passage both ways
      room.connections.east = room.connections.east ?? room.secretDoor.to;
      to.connections.west = to.connections.west ?? room.id;
      finds.push(`a secret door leading toward the ${to.name}`);
    }
  }
  if (room.trap && !room.trap.disarmed && !room.trap.triggered) {
    finds.push(`the mechanism of the ${room.trap.kind}`);
  }
  const summary = finds.length
    ? `The party searched ${room.name} and found ${finds.join(' and ')}.`
    : `The party searched ${room.name} and found nothing new.`;
  return logEvent(world, 'dungeon.search', { room: room.id, finds }, summary, { witnesses: partyMembers(world).map((c) => c.id) });
}

export function disarmTrap(world: WorldState): SimEvent | { error: string } {
  if (!world.currentDungeon || !world.currentRoom) return { error: 'Not inside a dungeon.' };
  const d = world.dungeons[world.currentDungeon];
  const room = d.rooms[world.currentRoom];
  if (!room.trap || room.trap.disarmed || room.trap.triggered) return { error: 'No live trap here.' };
  const mc = world.characters[world.mcId];
  const rng = new Rng((d.generationSeed ^ world.time.day * 7919 + world.time.minute) >>> 0);
  addMinutes(world, 5);
  const roll = rng.die(20) + mc.skills.lockpicking + Math.floor(mc.attributes.dexterity / 3);
  if (roll >= 13) {
    room.trap.disarmed = true;
    return logEvent(world, 'dungeon.trap', { room: room.id, kind: room.trap.kind, result: 'disarmed', roll }, `${mc.name} disarmed the ${room.trap.kind} in ${room.name}. (roll ${roll})`, { witnesses: partyMembers(world).map((c) => c.id) });
  }
  room.trap.triggered = true;
  const dmg = rng.roll('1d6');
  mc.hp.current = Math.max(0, mc.hp.current - dmg);
  const died = mc.hp.current === 0 ? ' It nearly killed him.' : '';
  return logEvent(world, 'dungeon.trap', { room: room.id, kind: room.trap.kind, result: 'triggered', roll, damage: dmg }, `${mc.name} triggered the ${room.trap.kind} while trying to disarm it and took ${dmg} damage. (roll ${roll})${died}`, { witnesses: partyMembers(world).map((c) => c.id) });
}
