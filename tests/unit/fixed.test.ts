import { describe, expect, it } from 'vitest';
import { FX_ONE, fxDiv, fxMul, ilen2, inorm2, isqrt, ilerp, ipct, clampInt } from '@/core/fixed';

describe('fixed-point helpers', () => {
  it('isqrt is exact floor sqrt for a range of ints', () => {
    for (let n = 0; n < 5000; n++) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
    expect(isqrt(1_000_000_000_000)).toBe(1_000_000);
  });
  it('fxMul / fxDiv round-trip', () => {
    expect(fxMul(FX_ONE, FX_ONE)).toBe(FX_ONE);
    expect(fxMul(2048, 1000)).toBe(500);
    expect(fxDiv(1, 2)).toBe(2048);
    expect(fxMul(fxDiv(300, 7), 7)).toBeLessThanOrEqual(300);
  });
  it('inorm2 produces ~unit vectors in Q12', () => {
    const v = inorm2(3000, 4000);
    expect(v.x).toBe(Math.trunc((3000 * FX_ONE) / 5000));
    expect(v.z).toBe(Math.trunc((4000 * FX_ONE) / 5000));
    const len = ilen2(v.x, v.z);
    expect(Math.abs(len - FX_ONE)).toBeLessThanOrEqual(2);
    expect(inorm2(0, 0)).toEqual({ x: FX_ONE, z: 0 });
  });
  it('ilerp, ipct, clamp', () => {
    expect(ilerp(0, 100, FX_ONE / 2)).toBe(50);
    expect(ilerp(100, 0, FX_ONE)).toBe(0);
    expect(ipct(150, 50)).toBe(75);
    expect(clampInt(5, 0, 3)).toBe(3);
    expect(clampInt(-5, 0, 3)).toBe(0);
  });
  it('is purely integral (no fractional output)', () => {
    for (let i = -100; i < 100; i++) {
      expect(Number.isInteger(fxMul(i * 37, 1234))).toBe(true);
      expect(Number.isInteger(fxDiv(i * 37, 13))).toBe(true);
    }
  });
});
