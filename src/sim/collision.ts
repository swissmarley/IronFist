import { FX_ONE } from '@/core/fixed';
import type { CapsuleDef } from './types';

/** World-space capsule (mm). */
export interface WCapsule {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  r: number;
}

export function makeWCapsule(): WCapsule {
  return { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 };
}

/**
 * Transform a local capsule (x = right, y = up, z = forward) to world space.
 * right = (-fz, fx), forward = (fx, fz) for a Q12 facing vector.
 */
export function toWorld(c: CapsuleDef, x: number, y: number, z: number, fx: number, fz: number, out: WCapsule): WCapsule {
  out.ax = x + Math.trunc((-fz * c.ax + fx * c.az) / FX_ONE);
  out.az = z + Math.trunc((fx * c.ax + fz * c.az) / FX_ONE);
  out.ay = y + c.ay;
  out.bx = x + Math.trunc((-fz * c.bx + fx * c.bz) / FX_ONE);
  out.bz = z + Math.trunc((fx * c.bx + fz * c.bz) / FX_ONE);
  out.by = y + c.by;
  out.r = c.r;
  return out;
}

/** Squared distance from point p to segment ab (integer mm). */
export function pointSegDist2(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let cx = ax, cy = ay, cz = az;
  if (len2 > 0) {
    let t = Math.trunc(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) * FX_ONE / len2);
    if (t < 0) t = 0; else if (t > FX_ONE) t = FX_ONE;
    cx = ax + Math.trunc((dx * t) / FX_ONE);
    cy = ay + Math.trunc((dy * t) / FX_ONE);
    cz = az + Math.trunc((dz * t) / FX_ONE);
  }
  const ex = px - cx, ey = py - cy, ez = pz - cz;
  return ex * ex + ey * ey + ez * ez;
}

const SAMPLES = 8;

/** Approximate squared distance between two segments by sampling (deterministic). */
export function segSegDist2(a: WCapsule, b: WCapsule): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = Math.trunc((i * FX_ONE) / SAMPLES);
    const px = a.ax + Math.trunc(((a.bx - a.ax) * t) / FX_ONE);
    const py = a.ay + Math.trunc(((a.by - a.ay) * t) / FX_ONE);
    const pz = a.az + Math.trunc(((a.bz - a.az) * t) / FX_ONE);
    const d = pointSegDist2(px, py, pz, b.ax, b.ay, b.az, b.bx, b.by, b.bz);
    if (d < best) best = d;
    const qx = b.ax + Math.trunc(((b.bx - b.ax) * t) / FX_ONE);
    const qy = b.ay + Math.trunc(((b.by - b.ay) * t) / FX_ONE);
    const qz = b.az + Math.trunc(((b.bz - b.az) * t) / FX_ONE);
    const e = pointSegDist2(qx, qy, qz, a.ax, a.ay, a.az, a.bx, a.by, a.bz);
    if (e < best) best = e;
  }
  return best;
}

export function capsulesOverlap(a: WCapsule, b: WCapsule): boolean {
  const r = a.r + b.r;
  return segSegDist2(a, b) <= r * r;
}

/** Midpoint between the two capsule centres (used as the impact point for VFX). */
export function contactPoint(a: WCapsule, b: WCapsule): [number, number, number] {
  return [
    Math.trunc((a.ax + a.bx + b.ax + b.bx) / 4),
    Math.trunc((a.ay + a.by + b.ay + b.by) / 4),
    Math.trunc((a.az + a.bz + b.az + b.bz) / 4),
  ];
}
