/**
 * CPU particle pool: pure math, no `three` import, so it can be unit-tested in
 * Node. GPU-visible fields live in one interleaved Float32Array (`data`, stride
 * {@link STRIDE}) that a renderer uploads once per frame; sim-only fields live
 * in parallel typed arrays. Live particles are kept compact at the front of the
 * arrays (swap-remove on death) so `count` is also the instance draw count.
 * Nothing allocates after construction.
 */

/** Floats per particle in the GPU-visible interleaved array. */
export const STRIDE = 16;
/** Offsets into one particle's slice of `data`. */
export const F = {
  px: 0, py: 1, pz: 2, life: 3,          // vec4 iPosLife  (position, age/life 0..1)
  vx: 4, vy: 5, vz: 6, size: 7,          // vec4 iVelSize  (velocity m/s, current size m)
  r: 8, g: 9, b: 10, a: 11,              // vec4 iColor
  rot: 12, seed: 13, stretch: 14, spare: 15, // vec4 iMisc
} as const;

export interface SpawnParams {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Lifetime in seconds. */
  life: number;
  /** Base size in metres. */
  size: number;
  r: number; g: number; b: number; a: number;
  rot: number;
  /** Angular velocity, rad/s. */
  angVel: number;
  /** Downward acceleration, m/s^2. */
  gravity: number;
  /** Velocity damping per second (0 = none). */
  drag: number;
  /** Restitution on the y=0 floor; 0 disables floor collision. */
  bounce: number;
  /** Size multiplier reached at end of life (1 = constant). */
  growth: number;
  /** Style-specific scalar (sparks: motion stretch). */
  stretch: number;
  seed: number;
}

export function makeSpawnParams(): SpawnParams {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.1, r: 1, g: 1, b: 1, a: 1, rot: 0, angVel: 0, gravity: 0, drag: 0, bounce: 0, growth: 1, stretch: 0, seed: 0 };
}

export type ParticleStyle = 'spark' | 'dust' | 'debris' | 'glow';
export const PARTICLE_STYLES: readonly ParticleStyle[] = ['spark', 'dust', 'debris', 'glow'];
/** Share of the total particle budget per style. */
const BUDGET: Record<ParticleStyle, number> = { spark: 0.35, dust: 0.25, debris: 0.15, glow: 0.25 };
const MIN_PER_STYLE = 16;

/** Capacity per style for a total budget (quality tiers 500 .. 20000). */
export function splitBudget(maxParticles: number): Record<ParticleStyle, number> {
  const out = { spark: 0, dust: 0, debris: 0, glow: 0 };
  for (const s of PARTICLE_STYLES) out[s] = Math.max(MIN_PER_STYLE, Math.floor(maxParticles * BUDGET[s]));
  return out;
}

const FLOOR_FRICTION = 0.75;
const REST_SPEED = 0.25;

export class ParticlePool {
  readonly capacity: number;
  readonly data: Float32Array;
  private readonly age: Float32Array;
  private readonly lifeInv: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly angVel: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly bounce: Float32Array;
  private readonly growth: Float32Array;
  private _count = 0;
  private cursor = 0;
  /** Spawns dropped or recycled because the pool was full (diagnostics). */
  overflow = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.data = new Float32Array(this.capacity * STRIDE);
    const n = this.capacity;
    this.age = new Float32Array(n);
    this.lifeInv = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    this.angVel = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.bounce = new Float32Array(n);
    this.growth = new Float32Array(n);
  }

  get count(): number { return this._count; }

  /** Spawn one particle. When full, the oldest-by-cursor slot is recycled (O(1), no growth). */
  spawn(p: SpawnParams): number {
    let i: number;
    if (this._count < this.capacity) {
      i = this._count++;
    } else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      this.overflow++;
    }
    const d = this.data;
    const o = i * STRIDE;
    d[o + F.px] = p.x; d[o + F.py] = p.y; d[o + F.pz] = p.z; d[o + F.life] = 0;
    d[o + F.vx] = p.vx; d[o + F.vy] = p.vy; d[o + F.vz] = p.vz; d[o + F.size] = p.size;
    d[o + F.r] = p.r; d[o + F.g] = p.g; d[o + F.b] = p.b; d[o + F.a] = p.a;
    d[o + F.rot] = p.rot; d[o + F.seed] = p.seed; d[o + F.stretch] = p.stretch; d[o + F.spare] = 0;
    this.age[i] = 0;
    this.lifeInv[i] = 1 / Math.max(1e-4, p.life);
    this.baseSize[i] = p.size;
    this.angVel[i] = p.angVel;
    this.gravity[i] = p.gravity;
    this.drag[i] = p.drag;
    this.bounce[i] = p.bounce;
    this.growth[i] = p.growth;
    return i;
  }

  /** Integrate all live particles by `dt` seconds. Dead ones are swap-removed. */
  update(dt: number): void {
    const d = this.data;
    let i = 0;
    while (i < this._count) {
      const t = (this.age[i] as number) + dt;
      if (t * (this.lifeInv[i] as number) >= 1) { this.remove(i); continue; }
      this.age[i] = t;
      const life = t * (this.lifeInv[i] as number);
      const o = i * STRIDE;
      let vx = d[o + F.vx] as number, vy = d[o + F.vy] as number, vz = d[o + F.vz] as number;
      vy -= (this.gravity[i] as number) * dt;
      const damp = 1 / (1 + (this.drag[i] as number) * dt);
      vx *= damp; vy *= damp; vz *= damp;
      const x = (d[o + F.px] as number) + vx * dt;
      let y = (d[o + F.py] as number) + vy * dt;
      const z = (d[o + F.pz] as number) + vz * dt;
      const bounce = this.bounce[i] as number;
      if (bounce > 0 && y < 0) {
        y = -y * bounce;
        if (vy < 0) vy = -vy * bounce;
        vx *= FLOOR_FRICTION; vz *= FLOOR_FRICTION;
        if (vy < REST_SPEED) { vy = 0; y = 0; }
      }
      d[o + F.px] = x; d[o + F.py] = y; d[o + F.pz] = z; d[o + F.life] = life;
      d[o + F.vx] = vx; d[o + F.vy] = vy; d[o + F.vz] = vz;
      d[o + F.size] = (this.baseSize[i] as number) * (1 + ((this.growth[i] as number) - 1) * life);
      d[o + F.rot] = (d[o + F.rot] as number) + (this.angVel[i] as number) * dt;
      i++;
    }
  }

  /** Kill every particle. */
  clear(): void { this._count = 0; this.cursor = 0; }

  /** Read a particle field (tests / debugging). */
  get(i: number, field: number): number { return this.data[i * STRIDE + field] as number; }

  private remove(i: number): void {
    const last = --this._count;
    if (i !== last) {
      const d = this.data;
      d.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
      this.age[i] = this.age[last] as number;
      this.lifeInv[i] = this.lifeInv[last] as number;
      this.baseSize[i] = this.baseSize[last] as number;
      this.angVel[i] = this.angVel[last] as number;
      this.gravity[i] = this.gravity[last] as number;
      this.drag[i] = this.drag[last] as number;
      this.bounce[i] = this.bounce[last] as number;
      this.growth[i] = this.growth[last] as number;
    }
    if (this.cursor >= this._count) this.cursor = 0;
  }
}

/** Tiny deterministic RNG (mulberry32) so VFX screenshots are reproducible. */
export class VfxRng {
  private s: number;
  constructor(seed = 0x9e3779b9) { this.s = seed >>> 0; }
  reseed(seed: number): void { this.s = seed >>> 0; }
  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  /** Symmetric float in [-s, s). */
  spread(s: number): number { return (this.next() * 2 - 1) * s; }
}
