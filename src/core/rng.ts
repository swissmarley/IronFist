/**
 * Seeded deterministic PRNG (xoshiro128** variant on 32-bit ints).
 * The sim must never use Math.random; every stochastic decision (AI tendencies,
 * cosmetic choices that affect state) goes through an Rng instance owned by the
 * match state so that replays reproduce exactly.
 */
export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seed: number) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    // splitmix32 to expand the seed
    let x = seed >>> 0;
    const next = (): number => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Uniform 32-bit unsigned integer. */
  nextU32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0);
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    this.s0 >>>= 0; this.s1 >>>= 0; this.s2 >>>= 0; this.s3 >>>= 0;
    return result;
  }

  /** Integer in [0, n). */
  nextInt(n: number): number {
    if (n <= 0) return 0;
    return this.nextU32() % n;
  }

  /** Integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.nextInt(hi - lo + 1);
  }

  /** True with probability pct/100 (integer percent). */
  chance(pct: number): boolean {
    return this.nextInt(100) < pct;
  }

  /** Pick one element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)] as T;
  }

  /** Pick an index weighted by integer weights. */
  pickWeighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return 0;
    let r = this.nextInt(total);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Snapshot of internal state for hashing/serialisation. */
  state(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  setState(s: readonly [number, number, number, number]): void {
    [this.s0, this.s1, this.s2, this.s3] = s;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
