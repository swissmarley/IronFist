import type { ParticleSystem } from './ParticleSystem';
import type { ImpactFlash, ShockwaveRing } from './ImpactFlash';
import { makeSpawnParams, type VfxRng } from './ParticlePool';

export interface Vec3Like { x: number; y: number; z: number }

/** Everything an emitter can spawn into. */
export interface VfxTargets {
  particles: ParticleSystem;
  flashes: ImpactFlash;
  rings: ShockwaveRing;
  rng: VfxRng;
}

/** Particle counts are tuned for this budget and scaled for other tiers. */
const REFERENCE_BUDGET = 5000;
const P = makeSpawnParams();
const DIR = { x: 0, y: 0, z: 1 };

function density(t: VfxTargets): number {
  return Math.min(2, Math.max(0.15, t.particles.capacity / REFERENCE_BUDGET));
}
function count(t: VfxTargets, base: number, min = 2): number {
  return Math.max(min, Math.round(base * density(t)));
}
/** Normalise `dir` on the XZ plane into the shared DIR scratch (default +Z). */
function unitDir(dir: Vec3Like): Vec3Like {
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-6) { DIR.x = 0; DIR.z = 1; } else { DIR.x = dir.x / len; DIR.z = dir.z / len; }
  DIR.y = 0;
  return DIR;
}
function reset(point: Vec3Like): void {
  P.x = point.x; P.y = point.y; P.z = point.z;
  P.vx = 0; P.vy = 0; P.vz = 0; P.rot = 0; P.angVel = 0; P.gravity = 0; P.drag = 0; P.bounce = 0; P.growth = 1; P.stretch = 0; P.a = 1;
}

/** Sparks flying away from the attacker; colour white -> orange with strength 0..3. */
export function hitSparks(t: VfxTargets, point: Vec3Like, dir: Vec3Like, strength: number): void {
  const s = Math.min(3, Math.max(0, strength));
  const d = unitDir(dir);
  const n = count(t, 10 + s * 8, 3);
  const speed = 3 + s * 2.5;
  const r = t.rng;
  for (let i = 0; i < n; i++) {
    reset(point);
    const k = r.range(0.4, 1.2) * speed;
    P.vx = d.x * k + r.spread(speed * 0.55); P.vz = d.z * k + r.spread(speed * 0.55); P.vy = r.range(0.5, 3.5) + s;
    P.life = r.range(0.22, 0.5); P.size = r.range(0.045, 0.08) + s * 0.01;
    const hot = r.next();
    P.r = 1; P.g = 0.75 + hot * 0.25 - s * 0.08; P.b = 0.45 + hot * 0.4 - s * 0.12;
    P.gravity = 9; P.drag = 1.8; P.bounce = 0.35; P.stretch = 0.14; P.seed = r.next();
    t.particles.spawn('spark', P);
  }
  const glows = count(t, 3 + s * 2, 1);
  for (let i = 0; i < glows; i++) {
    reset(point);
    P.vx = d.x * r.range(0.2, 1) + r.spread(0.8); P.vz = d.z * r.range(0.2, 1) + r.spread(0.8); P.vy = r.range(0.2, 1.2);
    P.life = r.range(0.15, 0.3); P.size = r.range(0.12, 0.25) + s * 0.05; P.growth = 1.6; P.drag = 4;
    P.r = 1; P.g = 0.7; P.b = 0.4; P.a = 0.7; P.rot = r.range(0, 6.28); P.seed = r.next();
    t.particles.spawn('glow', P);
  }
}

/** Blue-white sparks skidding back toward the attacker (dir = attacker -> defender). */
export function blockSparks(t: VfxTargets, point: Vec3Like, dir: Vec3Like): void {
  const d = unitDir(dir);
  const n = count(t, 9, 3);
  const r = t.rng;
  for (let i = 0; i < n; i++) {
    reset(point);
    const k = r.range(1.5, 4.5);
    P.vx = -d.x * k + r.spread(2); P.vz = -d.z * k + r.spread(2); P.vy = r.range(0.5, 2.5);
    P.life = r.range(0.15, 0.32); P.size = r.range(0.035, 0.06);
    P.r = 0.7; P.g = 0.85; P.b = 1; P.gravity = 6; P.drag = 3; P.stretch = 0.1; P.seed = r.next();
    t.particles.spawn('spark', P);
  }
}

/** Yellow radial glow burst for counter-hits. */
export function counterBurst(t: VfxTargets, point: Vec3Like): void {
  const n = count(t, 12, 4);
  const r = t.rng;
  for (let i = 0; i < n; i++) {
    reset(point);
    const a = r.range(0, 6.2831853), e = r.range(-0.6, 0.9), k = r.range(1.5, 4);
    P.vx = Math.cos(a) * Math.cos(e) * k; P.vz = Math.sin(a) * Math.cos(e) * k; P.vy = Math.sin(e) * k;
    P.life = r.range(0.25, 0.45); P.size = r.range(0.1, 0.22); P.growth = 0.3; P.drag = 3.5;
    P.r = 1; P.g = 0.88; P.b = 0.3; P.rot = r.range(0, 6.28); P.seed = r.next();
    t.particles.spawn('glow', P);
  }
  for (let i = 0; i < count(t, 8, 2); i++) {
    reset(point);
    const a = r.range(0, 6.2831853), k = r.range(3, 6);
    P.vx = Math.cos(a) * k; P.vz = Math.sin(a) * k; P.vy = r.range(1, 3);
    P.life = r.range(0.2, 0.4); P.size = 0.06; P.r = 1; P.g = 0.9; P.b = 0.4; P.gravity = 8; P.drag = 2; P.stretch = 0.14; P.seed = r.next();
    t.particles.spawn('spark', P);
  }
}

/**
 * Soft dust puff on the floor. `size` ~ 0.3 (footstep) .. 1.5 (hard knockdown).
 * With `dir` the puff is kicked out behind the mover (dashes/sidesteps).
 */
export function dustPuff(t: VfxTargets, point: Vec3Like, size: number, dir?: Vec3Like): void {
  const n = count(t, 6 + size * 8, 3);
  const r = t.rng;
  const d = dir ? unitDir(dir) : null;
  for (let i = 0; i < n; i++) {
    reset(point);
    P.y = point.y + 0.04 + r.range(0, 0.08) * size;
    const a = r.range(0, 6.2831853), k = r.range(0.4, 1.4) * size;
    P.vx = Math.cos(a) * k; P.vz = Math.sin(a) * k; P.vy = r.range(0.25, 0.8) * size;
    if (d) { P.vx -= d.x * k * 1.5; P.vz -= d.z * k * 1.5; }
    P.life = r.range(0.4, 0.85); P.size = r.range(0.14, 0.28) * size; P.growth = 2.6; P.drag = 3;
    const tint = r.range(0.85, 1);
    P.r = 0.58 * tint; P.g = 0.53 * tint; P.b = 0.47 * tint; P.a = r.range(0.35, 0.6);
    P.rot = r.range(0, 6.28); P.angVel = r.spread(1.2); P.seed = r.next();
    t.particles.spawn('dust', P);
  }
}

/** Wall splat: lit chunks with gravity and floor bounce, plus dust and a few sparks. */
export function debrisBurst(t: VfxTargets, point: Vec3Like, dir: Vec3Like): void {
  const d = unitDir(dir);
  const r = t.rng;
  for (let i = 0; i < count(t, 12, 4); i++) {
    reset(point);
    const k = r.range(1.5, 4.5);
    P.vx = -d.x * k + r.spread(2.5); P.vz = -d.z * k + r.spread(2.5); P.vy = r.range(1.5, 5);
    P.life = r.range(0.9, 1.6); P.size = r.range(0.035, 0.09); P.growth = 0.05;
    const tint = r.range(0.7, 1.1);
    P.r = 0.45 * tint; P.g = 0.42 * tint; P.b = 0.4 * tint;
    P.gravity = 12; P.drag = 0.4; P.bounce = 0.4; P.rot = r.range(0, 6.28); P.angVel = r.spread(14); P.seed = r.range(0, 6.28);
    t.particles.spawn('debris', P);
  }
  for (let i = 0; i < count(t, 8, 2); i++) {
    reset(point);
    const k = r.range(2, 6);
    P.vx = -d.x * k + r.spread(3); P.vz = -d.z * k + r.spread(3); P.vy = r.range(0, 3);
    P.life = r.range(0.2, 0.4); P.size = 0.05; P.r = 1; P.g = 0.8; P.b = 0.5; P.gravity = 9; P.drag = 2; P.bounce = 0.3; P.stretch = 0.12; P.seed = r.next();
    t.particles.spawn('spark', P);
  }
  dustPuff(t, { x: point.x, y: Math.max(0, point.y - 0.3), z: point.z }, 1.1, dir);
}

/** KO: a large omnidirectional spark/glow burst plus a floor ring. */
export function koBurst(t: VfxTargets, point: Vec3Like): void {
  const r = t.rng;
  for (let i = 0; i < count(t, 40, 10); i++) {
    reset(point);
    const a = r.range(0, 6.2831853), e = r.range(-0.2, 1.2), k = r.range(3, 9);
    P.vx = Math.cos(a) * Math.cos(e) * k; P.vz = Math.sin(a) * Math.cos(e) * k; P.vy = Math.sin(e) * k;
    P.life = r.range(0.4, 0.9); P.size = r.range(0.05, 0.1);
    const hot = r.next();
    P.r = 1; P.g = 0.35 + hot * 0.5; P.b = 0.15 + hot * 0.2;
    P.gravity = 9; P.drag = 1.2; P.bounce = 0.4; P.stretch = 0.16; P.seed = r.next();
    t.particles.spawn('spark', P);
  }
  for (let i = 0; i < count(t, 18, 5); i++) {
    reset(point);
    const a = r.range(0, 6.2831853), k = r.range(0.5, 2.5);
    P.vx = Math.cos(a) * k; P.vz = Math.sin(a) * k; P.vy = r.range(0.5, 2.5);
    P.life = r.range(0.4, 0.8); P.size = r.range(0.2, 0.45); P.growth = 1.8; P.drag = 2.5;
    P.r = 1; P.g = 0.3; P.b = 0.2; P.a = 0.8; P.rot = r.range(0, 6.28); P.seed = r.next();
    t.particles.spawn('glow', P);
  }
  dustPuff(t, { x: point.x, y: 0, z: point.z }, 1.6);
  t.rings.spawn(point.x, 0, point.z, 'ko');
}

/** Launch: floor ring plus rising motes. */
export function launchRing(t: VfxTargets, point: Vec3Like): void {
  t.rings.spawn(point.x, 0, point.z, 'launch');
  const r = t.rng;
  for (let i = 0; i < count(t, 10, 3); i++) {
    reset(point);
    P.y = point.y + r.range(0, 0.4);
    P.vx = r.spread(0.6); P.vz = r.spread(0.6); P.vy = r.range(1.5, 3.5);
    P.life = r.range(0.3, 0.6); P.size = r.range(0.08, 0.18); P.growth = 0.4; P.drag = 1.5;
    P.r = 0.7; P.g = 0.85; P.b = 1; P.rot = r.range(0, 6.28); P.seed = r.next();
    t.particles.spawn('glow', P);
  }
  dustPuff(t, { x: point.x, y: 0, z: point.z }, 0.9);
}
