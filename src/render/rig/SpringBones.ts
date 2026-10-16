/**
 * Spring-bone secondary motion (hair tails, belt ends, cloth flaps).
 *
 * Pure math, no `three` import, so it runs in Node unit tests. Each chain is a
 * pinned Verlet rope: particle 0 follows its anchor bone exactly, particles
 * 1..n integrate in world space (so root motion, dashes and knockback produce
 * lag for free), are pulled toward their rigidly-attached "animated rest"
 * targets by `stiffness`, keep their segment length within `maxStretch`
 * (follow-the-leader correction, root to tip) and are pushed out of capsule
 * colliders. All state lives in preallocated typed arrays: `step` allocates
 * nothing. Render-only: driven from wall-clock dt, never read by the sim.
 */

export interface SpringParams {
  /** 0..1: fraction of the way back to the rest shape per 1/60 s (0 = free rope). */
  stiffness: number;
  /** Velocity decay rate per second (0 = undamped). */
  damping: number;
  /** Multiplier on world gravity (9.8 m/s² down). */
  gravity: number;
  /** Allowed segment stretch/compression as a fraction of rest length. */
  maxStretch: number;
  /** Collision radius of each particle (m). */
  radius: number;
}

export const DEFAULT_SPRING_PARAMS: SpringParams = { stiffness: 0.15, damping: 4, gravity: 1, maxStretch: 0.05, radius: 0.02 };

const GRAVITY = 9.8;
/** Fixed sub-step target (s); a frame's dt is split into equal sub-steps no longer than this. */
const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 12;
/** Frames longer than this (tab switch, breakpoint) are clamped. */
const MAX_DT = 0.1;
/** An anchor jump larger than this (round reset, side switch) snaps the chain to rest. */
const TELEPORT_DIST = 1.5;
/** Hard cap on per-sub-step particle travel (m) so a bad frame can never explode. */
const MAX_TRAVEL = 0.25;
const EPS = 1e-6;

/** Capsule colliders in world space: segment a-b with radius r. */
export class SpringColliders {
  /** Stride 7: ax, ay, az, bx, by, bz, r. */
  readonly data: Float32Array;
  readonly capacity: number;
  constructor(capacity: number) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * 7);
  }
  set(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): void {
    const o = i * 7;
    const d = this.data;
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = bx; d[o + 4] = by; d[o + 5] = bz; d[o + 6] = r;
  }
}

export class SpringChain {
  /** Number of segments (particles = segments + 1). */
  readonly segments: number;
  readonly count: number;
  readonly segLen: number;
  readonly params: SpringParams;
  /** Bit i set = collide with collider i. */
  colliderMask: number;
  /** World positions (stride 3). */
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  /** Rest-shape target per particle this frame (filled by the caller before `step`). */
  readonly target: Float32Array;
  /** Targets of the previous frame (sub-steps interpolate between the two). */
  private readonly targetPrev: Float32Array;
  private hPrev = SUBSTEP;
  private initialised = false;

  constructor(segments: number, length: number, params: Partial<SpringParams> = {}, colliderMask = 0) {
    this.segments = Math.max(1, Math.floor(segments));
    this.count = this.segments + 1;
    this.segLen = Math.max(EPS, length / this.segments);
    this.params = { ...DEFAULT_SPRING_PARAMS, ...params };
    this.colliderMask = colliderMask;
    this.pos = new Float32Array(this.count * 3);
    this.prev = new Float32Array(this.count * 3);
    this.target = new Float32Array(this.count * 3);
    this.targetPrev = new Float32Array(this.count * 3);
  }

  /** Snap every particle to its current target with zero velocity. */
  reset(): void {
    this.pos.set(this.target);
    this.prev.set(this.target);
    this.targetPrev.set(this.target);
    this.hPrev = SUBSTEP;
    this.initialised = true;
  }

  /** Forget the current state: the next `step` snaps to that frame's targets. */
  invalidate(): void {
    this.initialised = false;
  }

  /**
   * Add a velocity (m/s) to the free particles, weighted toward the tip
   * (used for hit whips).
   */
  impulse(vx: number, vy: number, vz: number): void {
    if (!this.initialised) return;
    const h = this.hPrev;
    for (let i = 1; i < this.count; i++) {
      const w = (i / this.segments) * h;
      const o = i * 3;
      this.prev[o] = (this.prev[o] as number) - vx * w;
      this.prev[o + 1] = (this.prev[o + 1] as number) - vy * w;
      this.prev[o + 2] = (this.prev[o + 2] as number) - vz * w;
    }
  }

  /**
   * Advance by `dt` seconds under a constant external acceleration (wind) on
   * top of gravity. `timeScale` < 1 slows the chain (hit-stop) without
   * changing the anchor.
   */
  step(dt: number, colliders: SpringColliders | null = null, ax = 0, ay = 0, az = 0, timeScale = 1): void {
    const t = this.target, tp = this.targetPrev;
    if (!this.initialised || !(dt >= 0)) { this.reset(); return; }
    const jx = (t[0] as number) - (tp[0] as number), jy = (t[1] as number) - (tp[1] as number), jz = (t[2] as number) - (tp[2] as number);
    if (jx * jx + jy * jy + jz * jz > TELEPORT_DIST * TELEPORT_DIST) { this.reset(); return; }
    const total = Math.min(dt, MAX_DT) * Math.max(0, timeScale);
    if (total <= 0) {
      // frozen: keep the root glued to its anchor and the rest of the chain where it is
      this.pinRoot(1);
      this.solveConstraints(colliders);
      tp.set(t);
      return;
    }
    const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(total / SUBSTEP)));
    const h = total / n;
    const p = this.params;
    const keep = Math.exp(-p.damping * h);
    const pull = 1 - Math.pow(1 - Math.min(0.999, Math.max(0, p.stiffness)), h * 60);
    const gx = ax * h * h, gy = (ay - GRAVITY * p.gravity) * h * h, gz = az * h * h;
    for (let s = 1; s <= n; s++) {
      const u = s / n;
      const ratio = (h / this.hPrev) * keep;
      this.pinRoot(u);
      for (let i = 1; i < this.count; i++) {
        const o = i * 3;
        for (let k = 0; k < 3; k++) {
          const c = this.pos[o + k] as number;
          let v = (c - (this.prev[o + k] as number)) * ratio;
          if (v > MAX_TRAVEL) v = MAX_TRAVEL; else if (v < -MAX_TRAVEL) v = -MAX_TRAVEL;
          const g = k === 0 ? gx : k === 1 ? gy : gz;
          let nxt = c + v + g;
          const tgt = (tp[o + k] as number) + ((t[o + k] as number) - (tp[o + k] as number)) * u;
          nxt += (tgt - nxt) * pull;
          this.prev[o + k] = c;
          this.pos[o + k] = nxt;
        }
      }
      this.solveConstraints(colliders);
      this.hPrev = h;
    }
    tp.set(t);
    if (!this.finite()) this.reset();
  }

  /** Particle 0 = interpolated anchor (u = 0 previous frame, 1 = this frame). */
  private pinRoot(u: number): void {
    const t = this.target, tp = this.targetPrev;
    for (let k = 0; k < 3; k++) {
      const v = (tp[k] as number) + ((t[k] as number) - (tp[k] as number)) * u;
      this.prev[k] = this.pos[k] as number;
      this.pos[k] = v;
    }
  }

  private solveConstraints(colliders: SpringColliders | null): void {
    const L = this.segLen;
    const s = Math.max(0, this.params.maxStretch);
    const lo = L * (1 - s), hi = L * (1 + s);
    for (let i = 1; i < this.count; i++) {
      const o = i * 3, q = o - 3;
      this.lengthFix(q, o, lo, hi, L);
      if (colliders && this.colliderMask !== 0) this.collide(o, colliders);
      // collision may have stretched the segment: re-clamp toward the parent without undoing the push-out direction
      this.lengthFix(q, o, lo, hi, L);
    }
  }

  private lengthFix(q: number, o: number, lo: number, hi: number, L: number): void {
    const P = this.pos;
    let dx = (P[o] as number) - (P[q] as number);
    let dy = (P[o + 1] as number) - (P[q + 1] as number);
    let dz = (P[o + 2] as number) - (P[q + 2] as number);
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < EPS) {
      // coincident: fall back to the rest-shape direction, else straight down
      dx = (this.target[o] as number) - (this.target[q] as number);
      dy = (this.target[o + 1] as number) - (this.target[q + 1] as number);
      dz = (this.target[o + 2] as number) - (this.target[q + 2] as number);
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < EPS) { dx = 0; dy = -1; dz = 0; d = 1; }
      const k = L / d;
      P[o] = (P[q] as number) + dx * k; P[o + 1] = (P[q + 1] as number) + dy * k; P[o + 2] = (P[q + 2] as number) + dz * k;
      return;
    }
    const want = d < lo ? lo : d > hi ? hi : d;
    if (want === d) return;
    const k = want / d;
    P[o] = (P[q] as number) + dx * k; P[o + 1] = (P[q + 1] as number) + dy * k; P[o + 2] = (P[q + 2] as number) + dz * k;
  }

  private collide(o: number, c: SpringColliders): void {
    const P = this.pos, D = c.data;
    const pr = this.params.radius;
    for (let j = 0; j < c.capacity; j++) {
      if ((this.colliderMask & (1 << j)) === 0) continue;
      const b = j * 7;
      const ax = D[b] as number, ay = D[b + 1] as number, az = D[b + 2] as number;
      const ex = (D[b + 3] as number) - ax, ey = (D[b + 4] as number) - ay, ez = (D[b + 5] as number) - az;
      const r = (D[b + 6] as number) + pr;
      const px = (P[o] as number) - ax, py = (P[o + 1] as number) - ay, pz = (P[o + 2] as number) - az;
      const ee = ex * ex + ey * ey + ez * ez;
      let u = ee > EPS ? (px * ex + py * ey + pz * ez) / ee : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const dx = px - ex * u, dy = py - ey * u, dz = pz - ez * u;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r || d2 < EPS * EPS) continue;
      const d = Math.sqrt(d2);
      const k = (r - d) / d;
      P[o] = (P[o] as number) + dx * k; P[o + 1] = (P[o + 1] as number) + dy * k; P[o + 2] = (P[o + 2] as number) + dz * k;
    }
  }

  private finite(): boolean {
    for (let i = 0; i < this.pos.length; i++) if (!Number.isFinite(this.pos[i] as number) || !Number.isFinite(this.prev[i] as number)) return false;
    return true;
  }
}
