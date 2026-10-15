import { describe, expect, it } from 'vitest';
import { Hasher, hashInts } from '@/core/hash';

describe('Hasher', () => {
  it('same input same hash, different input different hash', () => {
    expect(hashInts([1, 2, 3])).toBe(hashInts([1, 2, 3]));
    expect(hashInts([1, 2, 3])).not.toBe(hashInts([1, 2, 4]));
    expect(hashInts([1, 2, 3])).not.toBe(hashInts([3, 2, 1]));
  });
  it('handles negatives and strings', () => {
    expect(new Hasher().int(-1).value()).not.toBe(new Hasher().int(1).value());
    expect(new Hasher().str('abc').hex()).toHaveLength(8);
  });
});
