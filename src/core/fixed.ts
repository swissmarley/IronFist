/**
 * Integer / fixed-point helpers for the deterministic simulation.
 *
 * Conventions:
 *  - Distances are integer millimetres (mm).
 *  - Unit vectors and fractions use Q12 fixed point (FX_ONE = 4096).
 *  - Time is integer frames at 60 Hz.
 *
 * Every function here uses only integer arithmetic plus Math.trunc/Math.floor on
 * integral intermediates, so results are bit-identical on every JS engine.
 */

export const FX_ONE = 4096;
export const FX_SHIFT = 12;

/** Multiply two Q12 values (or a Q12 value and an integer) -> Q12/integer. */
export function fxMul(a: number, b: number): number {
  return Math.trunc((a * b) / FX_ONE);
}

/** Divide Q12/int a by b producing a Q12 result. b must be non-zero. */
export function fxDiv(a: number, b: number): number {
  return Math.trunc((a * FX_ONE) / b);
}

/** Integer square root (floor) using Newton iteration on integers. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.trunc(Math.sqrt(n)); // seed from float, then correct with ints
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

/** Length of an integer 2D vector in the same unit (floor). */
export function ilen2(x: number, z: number): number {
  return isqrt(x * x + z * z);
}

/** Normalise an integer 2D vector into a Q12 unit vector. Zero vector -> (FX_ONE, 0). */
export function inorm2(x: number, z: number): { x: number; z: number } {
  const len = ilen2(x, z);
  if (len === 0) return { x: FX_ONE, z: 0 };
  return { x: Math.trunc((x * FX_ONE) / len), z: Math.trunc((z * FX_ONE) / len) };
}

export function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function iabs(v: number): number {
  return v < 0 ? -v : v;
}

export function isign(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

/** Linear interpolation of integers by a Q12 factor t (0..FX_ONE). */
export function ilerp(a: number, b: number, t: number): number {
  return a + Math.trunc(((b - a) * t) / FX_ONE);
}

/** Integer percentage: value * pct / 100, truncated toward zero. */
export function ipct(value: number, pct: number): number {
  return Math.trunc((value * pct) / 100);
}

/**
 * Deterministic integer dot product of Q12 vectors -> Q12.
 */
export function fxDot(ax: number, az: number, bx: number, bz: number): number {
  return Math.trunc((ax * bx + az * bz) / FX_ONE);
}

/** 2D cross product (z component) of Q12 vectors -> Q12. Positive = b is counter-clockwise of a. */
export function fxCross(ax: number, az: number, bx: number, bz: number): number {
  return Math.trunc((ax * bz - az * bx) / FX_ONE);
}
