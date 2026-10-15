import { describe, expect, it } from 'vitest';
import { SpringChain, SpringColliders } from '@/render/rig/SpringBones';
import { defaultSprings, springsFor } from '@/render/rig/springPresets';
import { CHARACTERS, ROSTER_IDS } from '@/data/characters';

const DT = 1 / 60;

/** Lay a chain's targets out from an anchor along a direction (the rigid rest shape). */
function setTargets(c: SpringChain, ax: number, ay: number, az: number, dx = 0, dy = -1, dz = 0): void {
  for (let i = 0; i < c.count; i++) {
    c.target[i * 3] = ax + dx * c.segLen * i;
    c.target[i * 3 + 1] = ay + dy * c.segLen * i;
    c.target[i * 3 + 2] = az + dz * c.segLen * i;
  }
}

function tip(c: SpringChain): [number, number, number] {
  const o = (c.count - 1) * 3;
  return [c.pos[o] as number, c.pos[o + 1] as number, c.pos[o + 2] as number];
}

function allFinite(c: SpringChain): boolean {
  return [...c.pos, ...c.prev].every((v) => Number.isFinite(v));
}

describe('SpringChain', () => {
  it('hangs straight down under gravity with no stiffness', () => {
    const c = new SpringChain(4, 0.4, { stiffness: 0, damping: 3, gravity: 1, maxStretch: 0.02 });
    // rest shape sticks out horizontally; gravity must pull it down
    setTargets(c, 0, 1.6, 0, 0, 0, -1);
    for (let f = 0; f < 600; f++) c.step(DT);
    const [x, y, z] = tip(c);
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(Math.abs(z)).toBeLessThan(0.02);
    expect(y).toBeLessThan(1.6 - 0.4 * 0.97);
    expect(y).toBeGreaterThan(1.6 - 0.4 * 1.03);
    // root stays pinned to its anchor
    expect(c.pos[0]).toBeCloseTo(0, 6);
    expect(c.pos[1]).toBeCloseTo(1.6, 6);
  });

  it('keeps its segment lengths within maxStretch', () => {
    const c = new SpringChain(3, 0.3, { stiffness: 0.05, damping: 2, maxStretch: 0.05 });
    setTargets(c, 0, 1, 0);
    c.step(DT);
    for (let f = 0; f < 120; f++) {
      setTargets(c, Math.sin(f * 0.3) * 0.2, 1, 0);
      c.step(DT);
      for (let i = 1; i < c.count; i++) {
        const o = i * 3, q = o - 3;
        const d = Math.hypot((c.pos[o] as number) - (c.pos[q] as number), (c.pos[o + 1] as number) - (c.pos[q + 1] as number), (c.pos[o + 2] as number) - (c.pos[q + 2] as number));
        expect(d).toBeLessThanOrEqual(c.segLen * 1.05 + 1e-5);
        expect(d).toBeGreaterThanOrEqual(c.segLen * 0.95 - 1e-5);
      }
    }
  });

  it('lags behind a moving root, then settles back to its rest offset', () => {
    const c = new SpringChain(3, 0.3, { stiffness: 0.12, damping: 4, gravity: 1 });
    setTargets(c, 0, 1.5, 0);
    for (let f = 0; f < 240; f++) c.step(DT);
    const restDx = tip(c)[0] - (c.pos[0] as number);
    expect(Math.abs(restDx)).toBeLessThan(1e-3);
    // dash +X at 4 m/s for 8 frames
    let x = 0;
    let maxLag = 0;
    for (let f = 0; f < 8; f++) {
      x += 4 * DT;
      setTargets(c, x, 1.5, 0);
      c.step(DT);
      maxLag = Math.max(maxLag, x - tip(c)[0]);
    }
    expect(maxLag).toBeGreaterThan(0.05); // the tip trails the root
    for (let f = 0; f < 300; f++) c.step(DT);
    expect(tip(c)[0] - (c.pos[0] as number)).toBeCloseTo(restDx, 2);
    expect(allFinite(c)).toBe(true);
  });

  it('an impulse whips the tip, slowed (not frozen) by a time scale', () => {
    const a = new SpringChain(3, 0.3, { stiffness: 0.1 });
    const b = new SpringChain(3, 0.3, { stiffness: 0.1 });
    for (const c of [a, b]) { setTargets(c, 0, 1.5, 0); for (let f = 0; f < 120; f++) c.step(DT); c.impulse(0, 0, -3); }
    a.step(DT, null, 0, 0, 0, 1);
    b.step(DT, null, 0, 0, 0, 0.3);
    expect(tip(a)[2]).toBeLessThan(-0.02);
    expect(tip(b)[2]).toBeLessThan(0);
    expect(tip(b)[2]).toBeGreaterThan(tip(a)[2]);
  });

  it('is pushed out of capsule colliders', () => {
    const col = new SpringColliders(1);
    // vertical capsule right under the anchor, offset slightly in -Z
    col.set(0, 0, 0.9, -0.02, 0, 1.45, -0.02, 0.1);
    const c = new SpringChain(4, 0.4, { stiffness: 0, radius: 0.02 }, 1);
    setTargets(c, 0, 1.5, 0.0);
    for (let f = 0; f < 300; f++) c.step(DT, col);
    for (let i = 1; i < c.count; i++) {
      const o = i * 3;
      const y = c.pos[o + 1] as number;
      if (y > 1.45 || y < 0.9) continue;
      expect(Math.hypot(c.pos[o] as number, (c.pos[o + 2] as number) + 0.02)).toBeGreaterThanOrEqual(0.12 - 1e-4);
    }
  });

  it('never produces NaN on degenerate input and snaps on teleports', () => {
    const c = new SpringChain(4, 0.4);
    c.step(DT); // all targets coincident at the origin
    expect(allFinite(c)).toBe(true);
    c.step(0);
    c.step(5); // huge frame, clamped
    c.step(Number.NaN);
    c.impulse(1e6, -1e6, 1e6);
    c.step(DT);
    expect(allFinite(c)).toBe(true);
    setTargets(c, 10, 1, 10);
    c.step(DT);
    expect(c.pos[0]).toBeCloseTo(10, 5);
    expect(tip(c)[1]).toBeCloseTo(1 - 0.4, 5);
    const one = new SpringChain(0, 0); // clamped to 1 segment, tiny length
    one.step(DT);
    expect(allFinite(one)).toBe(true);
  });

  it('allocates no new arrays per step', () => {
    const c = new SpringChain(3, 0.3);
    const refs = [c.pos, c.prev, c.target];
    setTargets(c, 0, 1, 0);
    for (let f = 0; f < 10; f++) c.step(DT);
    expect(refs.every((r, i) => r === [c.pos, c.prev, c.target][i])).toBe(true);
  });
});

describe('spring presets', () => {
  it('every roster fighter gets at least one chain, and every hair style but none gets a hair chain', () => {
    for (const id of ROSTER_IDS) {
      const def = CHARACTERS[id];
      expect(def?.look, id).toBeDefined();
      if (!def) continue;
      if (!def.look) continue;
      const s = springsFor(def.id, def.look);
      expect(s.chains.length, def.id).toBeGreaterThan(0);
      for (const ch of s.chains) {
        expect(ch.segments).toBeGreaterThan(0);
        expect(ch.length).toBeGreaterThan(0);
      }
    }
    for (const hair of ['short', 'spiky', 'long', 'bun'] as const) {
      expect(defaultSprings({ hair }).chains.some((c) => c.material === 'hair'), hair).toBe(true);
    }
  });
});
