// Deterministic seeded RNG (mulberry32). Every generated event stores
// its seed so encounters/combat/loot can be replayed exactly or
// resimulated with a fresh seed.

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** current internal state, for persisting mid-stream */
  getState(): number {
    return this.state;
  }

  setState(s: number) {
    this.state = s >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state = this.state >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** d20 etc. */
  die(sides: number): number {
    return this.int(1, sides);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** roll dice notation like '1d8+2' or '2d6' */
  roll(notation: string): number {
    const m = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!m) return 0;
    const count = parseInt(m[1], 10);
    const sides = parseInt(m[2], 10);
    const mod = m[3] ? parseInt(m[3], 10) : 0;
    let total = mod;
    for (let i = 0; i < count; i++) total += this.die(sides);
    return Math.max(0, total);
  }

  /** derive a fresh child seed */
  fork(): number {
    return Math.floor(this.next() * 0xffffffff);
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}
