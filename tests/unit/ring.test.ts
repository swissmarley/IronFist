import { describe, expect, it } from 'vitest';
import { IntRing } from '@/core/ring';

describe('IntRing', () => {
  it('returns most recent first and wraps', () => {
    const r = new IntRing(4);
    for (let i = 1; i <= 6; i++) r.push(i);
    expect(r.back(0)).toBe(6);
    expect(r.back(3)).toBe(3);
    expect(r.back(4)).toBe(0);
    expect(r.length).toBe(4);
  });
});
