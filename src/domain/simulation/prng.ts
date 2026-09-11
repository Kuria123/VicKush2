/**
 * Deterministic pseudo-random source.
 *
 * The simulator needs noise — a real idle never sits at exactly 700 rpm — but
 * a diagnostic engine cannot be tested against numbers that change between
 * runs. Seeding makes every run reproducible: the same seed and the same
 * sequence of steps always produce the same telemetry, so a scenario that
 * triggers P0171 triggers it every time.
 *
 * mulberry32: small, fast, and good enough for sensor noise. Not for
 * cryptography, and never used for one.
 */
export class Prng {
  private state: number;

  constructor(seed: number) {
    // Mixed so that nearby seeds do not produce correlated streams.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Approximately standard normal, via the central limit theorem. */
  gaussian(): number {
    let sum = 0;
    for (let i = 0; i < 6; i += 1) sum += this.next();
    return (sum - 3) / 0.7071;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}
