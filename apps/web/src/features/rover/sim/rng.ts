// Seeded randomness. One stream per subsystem, so changing one model never shifts another model's noise.

/** mulberry32: a fast 32-bit generator, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, to turn a stream name into a seed offset. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class Rng {
  private u: () => number;
  private spare: number | null = null;
  constructor(seed: number) { this.u = mulberry32(seed); }
  next(): number { return this.u(); }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.u(); }
  /** Normal N(mean, sd²), Box–Muller. */
  gauss(mean = 0, sd = 1): number {
    if (this.spare !== null) { const z = this.spare; this.spare = null; return mean + sd * z; }
    let u = 0;
    while (u === 0) u = this.u();
    const v = this.u();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return mean + sd * r * Math.cos(2 * Math.PI * v);
  }
}

/** The stream for one subsystem: the same seed and name always give the same numbers. */
export const stream = (seed: number, name: string) => new Rng((seed ^ hash32(name)) >>> 0);
