import { describe, expect, it } from 'vitest';
import { F, ParticlePool, STRIDE, VfxRng, makeSpawnParams, splitBudget, PARTICLE_STYLES } from '@/render/vfx/ParticlePool';
import { blockSparks, counterBurst, debrisBurst, dustPuff, hitSparks, koBurst, launchRing, type VfxTargets } from '@/render/vfx/Emitters';
import type { ParticleSystem } from '@/render/vfx/ParticleSystem';
import type { ImpactFlash, ShockwaveRing } from '@/render/vfx/ImpactFlash';

const DT = 1 / 60;

function spawnOne(pool: ParticlePool, over: Partial<ReturnType<typeof makeSpawnParams>> = {}): number {
  const p = { ...makeSpawnParams(), ...over };
  return pool.spawn(p);
}

describe('ParticlePool', () => {
  it('spawns, ages and recycles without growing', () => {
    const pool = new ParticlePool(8);
    const dataLen = pool.data.length;
    for (let i = 0; i < 5; i++) spawnOne(pool, { life: 0.1 * (i + 1) });
    expect(pool.count).toBe(5);
    // 0.1 s: the first particle dies
    for (let f = 0; f < 7; f++) pool.update(DT);
    expect(pool.count).toBe(4);
    for (let f = 0; f < 60; f++) pool.update(DT);
    expect(pool.count).toBe(0);
    expect(pool.data.length).toBe(dataLen);
    expect(pool.overflow).toBe(0);
  });

  it('recycles slots when full instead of dropping or growing', () => {
    const pool = new ParticlePool(4);
    for (let i = 0; i < 10; i++) spawnOne(pool, { x: i });
    expect(pool.count).toBe(4);
    expect(pool.capacity).toBe(4);
    expect(pool.overflow).toBe(6);
    // the four most recent survivors are present (round-robin overwrite)
    const xs = [0, 1, 2, 3].map((i) => pool.get(i, F.px)).sort((a, b) => a - b);
    expect(xs).toEqual([6, 7, 8, 9]);
  });

  it('keeps live particles compact after swap-remove', () => {
    const pool = new ParticlePool(8);
    spawnOne(pool, { x: 1, life: 10 });
    spawnOne(pool, { x: 2, life: 0.05 });
    spawnOne(pool, { x: 3, life: 10 });
    pool.update(0.1);
    expect(pool.count).toBe(2);
    const xs = [pool.get(0, F.px), pool.get(1, F.px)].sort();
    expect(xs).toEqual([1, 3]);
    // life fraction written for the renderer
    expect(pool.get(0, F.life)).toBeCloseTo(0.01, 3);
  });

  it('integrates gravity and drag', () => {
    const pool = new ParticlePool(2);
    spawnOne(pool, { y: 5, vy: 0, gravity: 10, life: 10 });
    for (let f = 0; f < 60; f++) pool.update(DT);
    // semi-implicit Euler: v = -10, y ~ 5 - 0.5*10*1 - small step bias
    expect(pool.get(0, F.vy)).toBeCloseTo(-10, 5);
    expect(pool.get(0, F.py)).toBeLessThan(0.1);
    expect(pool.get(0, F.py)).toBeGreaterThan(-0.2);
    spawnOne(pool, { vx: 4, drag: 2, life: 10 });
    for (let f = 0; f < 60; f++) pool.update(DT);
    const vx = pool.get(1, F.vx);
    expect(vx).toBeGreaterThan(0.5);
    expect(vx).toBeLessThan(4 / 3 + 0.05);
  });

  it('bounces on the floor and comes to rest', () => {
    const pool = new ParticlePool(1);
    spawnOne(pool, { y: 1, vy: 0, gravity: 10, bounce: 0.5, life: 30 });
    let minY = Infinity;
    let bounced = false;
    for (let f = 0; f < 60; f++) {
      pool.update(DT);
      minY = Math.min(minY, pool.get(0, F.py));
      if (pool.get(0, F.vy) > 0) bounced = true;
    }
    expect(minY).toBeGreaterThanOrEqual(0);
    expect(bounced).toBe(true);
    for (let f = 0; f < 600; f++) pool.update(DT);
    expect(pool.get(0, F.py)).toBe(0);
    expect(pool.get(0, F.vy)).toBe(0);
  });

  it('grows size and spins by the requested rates', () => {
    const pool = new ParticlePool(1);
    spawnOne(pool, { size: 1, growth: 3, angVel: 2, life: 1 });
    pool.update(0.5);
    expect(pool.get(0, F.size)).toBeCloseTo(2, 5);
    expect(pool.get(0, F.rot)).toBeCloseTo(1, 5);
  });

  it('clamps spawn params into the interleaved layout', () => {
    const pool = new ParticlePool(1);
    const i = spawnOne(pool, { x: 1, y: 2, z: 3, r: 0.1, g: 0.2, b: 0.3, a: 0.4, stretch: 0.5, seed: 0.6 });
    expect(i).toBe(0);
    expect(Array.from(pool.data.subarray(0, STRIDE))).toEqual([1, 2, 3, 0, 0, 0, 0, 0.1, 0.1, 0.2, 0.3, 0.4, 0, 0.6, 0.5, 0].map((v) => Math.fround(v)));
  });
});

describe('VfxRng', () => {
  it('is deterministic and in range', () => {
    const a = new VfxRng(42), b = new VfxRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(Math.abs(a.spread(2))).toBeLessThanOrEqual(2);
  });
});

describe('splitBudget', () => {
  it('scales with the budget and never starves a style', () => {
    for (const total of [500, 2000, 5000, 20000]) {
      const b = splitBudget(total);
      let sum = 0;
      for (const s of PARTICLE_STYLES) { expect(b[s]).toBeGreaterThanOrEqual(16); sum += b[s]; }
      expect(sum).toBeLessThanOrEqual(total);
    }
  });
});

/** Emitters only need `spawn` and `capacity`; back them with real pools in Node. */
function fakeTargets(budget: number): { t: VfxTargets; pools: Record<string, ParticlePool>; flashes: number; rings: number; counts(): number } {
  const caps = splitBudget(budget);
  const pools: Record<string, ParticlePool> = {};
  for (const s of PARTICLE_STYLES) pools[s] = new ParticlePool(caps[s]);
  const state = { flashes: 0, rings: 0 };
  const particles = { capacity: budget, spawn: (style: string, p: ReturnType<typeof makeSpawnParams>) => pools[style]?.spawn(p) } as unknown as ParticleSystem;
  const flashes = { spawn: () => { state.flashes++; } } as unknown as ImpactFlash;
  const rings = { spawn: () => { state.rings++; } } as unknown as ShockwaveRing;
  return {
    t: { particles, flashes, rings, rng: new VfxRng(1) },
    pools,
    get flashes() { return state.flashes; },
    get rings() { return state.rings; },
    counts() { let n = 0; for (const s of PARTICLE_STYLES) n += pools[s]?.count ?? 0; return n; },
  };
}

describe('Emitters', () => {
  const origin = { x: 0, y: 1, z: 0 };
  const dir = { x: 1, y: 0, z: 0 };

  it('every preset spawns particles and stays within the budget', () => {
    for (const budget of [500, 5000, 20000]) {
      const f = fakeTargets(budget);
      hitSparks(f.t, origin, dir, 3);
      blockSparks(f.t, origin, dir);
      counterBurst(f.t, origin);
      dustPuff(f.t, origin, 1, dir);
      debrisBurst(f.t, origin, dir);
      koBurst(f.t, origin);
      launchRing(f.t, origin);
      expect(f.counts()).toBeGreaterThan(20);
      for (const s of PARTICLE_STYLES) expect(f.pools[s]?.count ?? 0).toBeLessThanOrEqual(f.pools[s]?.capacity ?? 0);
      expect(f.rings).toBe(2);
    }
  });

  it('hit sparks fly away from the attacker', () => {
    const f = fakeTargets(5000);
    hitSparks(f.t, origin, dir, 1);
    const pool = f.pools['spark'] as ParticlePool;
    let along = 0;
    for (let i = 0; i < pool.count; i++) along += pool.get(i, F.vx);
    expect(along / pool.count).toBeGreaterThan(1);
  });

  it('block sparks and debris go back toward the attacker', () => {
    const f = fakeTargets(5000);
    blockSparks(f.t, origin, dir);
    debrisBurst(f.t, origin, dir);
    for (const style of ['spark', 'debris']) {
      const pool = f.pools[style] as ParticlePool;
      let along = 0;
      for (let i = 0; i < pool.count; i++) along += pool.get(i, F.vx);
      expect(along / pool.count).toBeLessThan(-0.5);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = fakeTargets(5000), b = fakeTargets(5000);
    koBurst(a.t, origin); koBurst(b.t, origin);
    const pa = a.pools['spark'] as ParticlePool, pb = b.pools['spark'] as ParticlePool;
    expect(Array.from(pa.data.subarray(0, pa.count * STRIDE))).toEqual(Array.from(pb.data.subarray(0, pb.count * STRIDE)));
  });
});
