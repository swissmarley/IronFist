import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(1234), b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });
  it('differs between seeds', () => {
    const a = new Rng(1), b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.nextU32() === b.nextU32()) same++;
    expect(same).toBeLessThan(3);
  });
  it('nextInt stays in range and is roughly uniform', () => {
    const r = new Rng(99);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) buckets[r.nextInt(10)]++;
    for (const b of buckets) expect(Math.abs(b - 10000)).toBeLessThan(600);
  });
  it('state snapshot restores the sequence', () => {
    const r = new Rng(7);
    r.nextU32();
    const s = r.state();
    const x = r.nextU32();
    r.setState(s);
    expect(r.nextU32()).toBe(x);
  });
  it('pickWeighted respects weights', () => {
    const r = new Rng(5);
    let ones = 0;
    for (let i = 0; i < 10000; i++) if (r.pickWeighted([1, 3]) === 1) ones++;
    expect(ones).toBeGreaterThan(7000);
    expect(ones).toBeLessThan(8000);
  });
});
