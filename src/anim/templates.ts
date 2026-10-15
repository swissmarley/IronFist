import type { AnimSpec, AttackAnimType, MoveDef } from '@/sim/types';
import { makeClip, type Clip, type Ease, type PoseEuler } from './pose';
import { CROUCH, GUARD, STANCE, THROW_GRAB, THROW_LIFT, THROW_SLAM } from './poses';

type Side = 'L' | 'R';
type Height = 'high' | 'mid' | 'low';

interface StrikeKeys {
  windup: PoseEuler;
  strike: PoseEuler;
  follow: PoseEuler;
}

const sgn = (s: Side): number => (s === 'L' ? 1 : -1);
const arm = (s: Side, upper: [number, number, number], fore: [number, number, number], hand: [number, number, number] = [0, 0, 0]): PoseEuler => ({
  [`upperArm${s}`]: upper, [`forearm${s}`]: fore, [`hand${s}`]: hand,
} as PoseEuler);
const leg = (s: Side, upper: [number, number, number], lower: [number, number, number], foot: [number, number, number] = [0, 0, 0]): PoseEuler => ({
  [`upperLeg${s}`]: upper, [`lowerLeg${s}`]: lower, [`foot${s}`]: foot,
} as PoseEuler);
const heightLift = (h: Height): number => (h === 'high' ? -14 : h === 'low' ? 22 : 0);

/** Hips/chest rotation that drives the punching shoulder forward. */
function torsoDrive(s: Side, amount: number): PoseEuler {
  const y = -sgn(s) * amount; // left strike -> rotate left side forward (negative Y)
  return { hips: [0, -32 + y * 0.6, 0], spine: [8, 6 + y * 0.5, 0], chest: [6, 8 + y * 0.7, 0] };
}

function punchKeys(type: AttackAnimType, s: Side, h: Height): StrikeKeys {
  const o = s === 'L' ? 'R' : 'L';
  const lift = heightLift(h);
  const guardOther = arm(o, [-60, sgn(o) * -12, sgn(o) * 16], [-120, 0, sgn(o) * 10]);
  switch (type) {
    case 'hook':
      return {
        windup: { ...torsoDrive(o, 20), ...arm(s, [-40, 0, sgn(s) * 60], [-110, 0, 0]) },
        strike: { ...torsoDrive(s, 50), ...arm(s, [-95 + lift, sgn(s) * 20, sgn(s) * 55], [-95, 0, 0]), ...guardOther },
        follow: { ...torsoDrive(s, 60), ...arm(s, [-80 + lift, sgn(s) * 50, sgn(s) * 30], [-100, 0, 0]), ...guardOther },
      };
    case 'uppercut':
      return {
        windup: { root: [0, -0.16, 0], ...torsoDrive(o, 10), spine: [20, 0, 0], ...arm(s, [-10, 0, sgn(s) * 20], [-70, 0, 0]) },
        strike: { root: [0, 0.0, 0.04], ...torsoDrive(s, 40), spine: [-12, 0, 0], chest: [-10, 0, 0], ...arm(s, [-110 + lift, 0, sgn(s) * 10], [-115, 0, 0]), ...guardOther },
        follow: { root: [0, -0.02, 0.04], ...torsoDrive(s, 40), ...arm(s, [-130 + lift, 0, sgn(s) * 16], [-100, 0, 0]), ...guardOther },
      };
    case 'elbow':
      return {
        windup: { ...torsoDrive(o, 25), ...arm(s, [-30, 0, sgn(s) * 40], [-140, 0, 0]) },
        strike: { ...torsoDrive(s, 55), root: [0, -0.06, 0.06], ...arm(s, [-100 + lift, sgn(s) * 30, sgn(s) * 20], [-150, 0, 0]), ...guardOther },
        follow: { ...torsoDrive(s, 60), ...arm(s, [-90 + lift, sgn(s) * 50, 0], [-150, 0, 0]), ...guardOther },
      };
    case 'backfist':
      return {
        windup: { ...torsoDrive(s, 40), ...arm(s, [-70, 0, sgn(s) * -30], [-130, 0, 0]) },
        strike: { ...torsoDrive(o, 30), ...arm(s, [-95 + lift, 0, sgn(s) * 60], [-20, 0, 0]), ...guardOther },
        follow: { ...torsoDrive(o, 40), ...arm(s, [-80 + lift, 0, sgn(s) * 80], [-30, 0, 0]), ...guardOther },
      };
    case 'hammer':
      return {
        windup: { root: [0, 0, 0], spine: [-10, 0, 0], ...arm(s, [-175, 0, sgn(s) * 10], [-40, 0, 0]) },
        strike: { root: [0, -0.20, 0.06], spine: [24, 0, 0], chest: [10, 0, 0], ...arm(s, [-60 + lift, 0, sgn(s) * 6], [-10, 0, 0]), ...guardOther, ...CROUCHLEGS },
        follow: { root: [0, -0.22, 0.06], spine: [26, 0, 0], ...arm(s, [-40, 0, sgn(s) * 6], [-20, 0, 0]), ...guardOther, ...CROUCHLEGS },
      };
    case 'palm':
      return {
        windup: { root: [0, -0.10, 0], ...torsoDrive(o, 10), ...arm(s, [-20, 0, sgn(s) * 10], [-120, 0, 0], [40, 0, 0]) },
        strike: { root: [0, 0, 0.05], ...torsoDrive(s, 35), ...arm(s, [-105 + lift, 0, sgn(s) * 4], [-10, 0, 0], [60, 0, 0]), ...guardOther },
        follow: { root: [0, -0.02, 0.05], ...torsoDrive(s, 35), ...arm(s, [-120 + lift, 0, sgn(s) * 8], [-30, 0, 0], [40, 0, 0]), ...guardOther },
      };
    case 'doublePunch':
    case 'powerCrush':
      return {
        windup: { root: [0, -0.10, -0.04], spine: [-6, 0, 0], ...arm('L', [-30, 0, 20], [-130, 0, 10]), ...arm('R', [-30, 0, -20], [-130, 0, -10]) },
        strike: { root: [0, -0.04, 0.08], hips: [0, 0, 0], spine: [14, 0, 0], chest: [8, 0, 0], ...arm('L', [-95 + lift, 0, 6], [-8, 0, 0]), ...arm('R', [-95 + lift, 0, -6], [-8, 0, 0]) },
        follow: { root: [0, -0.06, 0.08], hips: [0, 0, 0], spine: [16, 0, 0], ...arm('L', [-100 + lift, 0, 10], [-20, 0, 0]), ...arm('R', [-100 + lift, 0, -10], [-20, 0, 0]) },
      };
    case 'straight':
    case 'jab':
    default: {
      const drive = type === 'straight' ? 45 : 28;
      return {
        windup: { ...torsoDrive(o, 6), ...arm(s, [-50, sgn(s) * -10, sgn(s) * 16], [-125, 0, sgn(s) * 8]) },
        strike: { ...torsoDrive(s, drive), ...arm(s, [-98 + lift, sgn(s) * 10, sgn(s) * 2], [-4, 0, 0]), ...guardOther },
        follow: { ...torsoDrive(s, drive), ...arm(s, [-104 + lift, sgn(s) * 10, sgn(s) * 4], [-20, 0, 0]), ...guardOther },
      };
    }
  }
}

const CROUCHLEGS: PoseEuler = {
  upperLegL: CROUCH.upperLegL ?? [0, 0, 0], lowerLegL: CROUCH.lowerLegL ?? [0, 0, 0],
  upperLegR: CROUCH.upperLegR ?? [0, 0, 0], lowerLegR: CROUCH.lowerLegR ?? [0, 0, 0],
};

function kickKeys(type: AttackAnimType, s: Side, h: Height): StrikeKeys {
  const o = s === 'L' ? 'R' : 'L';
  const guard: PoseEuler = { ...arm('L', [-60, -12, 16], [-120, 0, 10]), ...arm('R', [-60, 12, -16], [-120, 0, -10]) };
  const support = leg(o, [8, 0, sgn(o) * 6], [14, 0, 0], [0, 0, 0]);
  const hipTurn: PoseEuler = { hips: [0, sgn(s) * 25, 0] };
  const lean = (x: number): PoseEuler => ({ spine: [x, 0, 0], chest: [x * 0.6, 0, 0] });
  switch (type) {
    case 'round':
      return {
        windup: { ...guard, ...hipTurn, ...lean(-6), ...leg(s, [-60, 0, sgn(s) * 50], [110, 0, 0]), ...support },
        strike: { ...guard, hips: [0, sgn(s) * 60, 0], ...lean(-16), ...leg(s, [-80 + (h === 'high' ? -20 : h === 'low' ? 40 : 0), 0, sgn(s) * 60], [8, 0, 0]), ...support },
        follow: { ...guard, hips: [0, sgn(s) * 75, 0], ...lean(-10), ...leg(s, [-60, 0, sgn(s) * 70], [50, 0, 0]), ...support },
      };
    case 'low':
      return {
        windup: { ...guard, ...hipTurn, ...lean(6), ...leg(s, [-20, 0, sgn(s) * 20], [60, 0, 0]), ...support },
        strike: { ...guard, hips: [0, sgn(s) * 50, 0], ...lean(10), root: [0, -0.10, 0], ...leg(s, [-36, 0, sgn(s) * 30], [6, 0, 0]), ...support },
        follow: { ...guard, hips: [0, sgn(s) * 60, 0], ...lean(8), root: [0, -0.10, 0], ...leg(s, [-20, 0, sgn(s) * 40], [30, 0, 0]), ...support },
      };
    case 'sweep':
      return {
        windup: { ...CROUCH, ...guard, hips: [0, sgn(s) * 20, 0], ...leg(s, [-60, 0, sgn(s) * 40], [100, 0, 0]) },
        strike: { ...CROUCH, ...guard, root: [0, -0.55, 0], hips: [0, sgn(s) * 110, 0], ...leg(s, [-40, 0, sgn(s) * 20], [0, 0, 0]) },
        follow: { ...CROUCH, ...guard, root: [0, -0.55, 0], hips: [0, sgn(s) * 150, 0], ...leg(s, [-30, 0, sgn(s) * 30], [20, 0, 0]) },
      };
    case 'hop':
      return {
        windup: { ...guard, root: [0, -0.18, 0], ...lean(14), ...leg(s, [-50, 0, sgn(s) * 8], [90, 0, 0]), ...leg(o, [-40, 0, sgn(o) * 8], [80, 0, 0]) },
        strike: { ...guard, root: [0, 0.35, 0.05], ...lean(-14), ...leg(s, [-110, 0, sgn(s) * 10], [6, 0, 0]), ...leg(o, [-50, 0, sgn(o) * 10], [100, 0, 0]) },
        follow: { ...guard, root: [0, 0.15, 0.05], ...lean(-6), ...leg(s, [-80, 0, sgn(s) * 10], [40, 0, 0]), ...leg(o, [-40, 0, sgn(o) * 10], [90, 0, 0]) },
      };
    case 'knee':
      return {
        windup: { ...guard, ...lean(4), ...leg(s, [-30, 0, 0], [60, 0, 0]), ...support },
        strike: { ...guard, root: [0, -0.02, 0.06], hips: [0, sgn(s) * 20, 0], ...lean(-8), ...leg(s, [-115, 0, sgn(s) * 6], [125, 0, 0]), ...support },
        follow: { ...guard, root: [0, -0.04, 0.06], ...leg(s, [-90, 0, sgn(s) * 6], [110, 0, 0]), ...support },
      };
    case 'spinBack':
      return {
        windup: { ...guard, hips: [0, sgn(s) * -40, 0], ...lean(6), ...leg(s, [-20, 0, 0], [60, 0, 0]), ...support },
        strike: { ...guard, hips: [0, sgn(s) * 160, 0], ...lean(-20), ...leg(s, [-95 + heightLift(h), 0, sgn(s) * 10], [4, 0, 0]), ...support },
        follow: { ...guard, hips: [0, sgn(s) * 200, 0], ...lean(-10), ...leg(s, [-60, 0, sgn(s) * 20], [40, 0, 0]), ...support },
      };
    case 'axe':
      return {
        windup: { ...guard, ...lean(-10), ...leg(s, [-140, 0, sgn(s) * 6], [10, 0, 0]), ...support },
        strike: { ...guard, root: [0, -0.06, 0.04], ...lean(16), ...leg(s, [-60, 0, sgn(s) * 6], [4, 0, 0]), ...support },
        follow: { ...guard, root: [0, -0.10, 0.04], ...lean(20), ...leg(s, [-30, 0, sgn(s) * 6], [10, 0, 0]), ...support },
      };
    case 'side':
      return {
        windup: { ...guard, hips: [0, sgn(s) * 50, 0], ...lean(-6), ...leg(s, [-70, 0, sgn(s) * 30], [100, 0, 0]), ...support },
        strike: { ...guard, hips: [0, sgn(s) * 80, 0], ...lean(-22), ...leg(s, [-95 + heightLift(h), 0, sgn(s) * 40], [2, 0, 0], [20, 0, 0]), ...support },
        follow: { ...guard, hips: [0, sgn(s) * 80, 0], ...lean(-12), ...leg(s, [-70, 0, sgn(s) * 40], [40, 0, 0]), ...support },
      };
    case 'rising':
      return {
        windup: { ...CROUCH, ...guard, ...leg(s, [-70, 0, sgn(s) * 10], [110, 0, 0]) },
        strike: { ...guard, root: [0, -0.06, 0.04], ...lean(-10), ...leg(s, [-100 + heightLift(h), 0, sgn(s) * 10], [4, 0, 0]), ...support },
        follow: { ...guard, root: [0, -0.06, 0.04], ...leg(s, [-70, 0, sgn(s) * 10], [40, 0, 0]), ...support },
      };
    case 'ground':
      return {
        windup: { root: [0, -0.75, -0.1], hips: [-80, 0, 0], ...guard, ...leg(s, [-50, 0, sgn(s) * 10], [100, 0, 0]), ...leg(o, [-20, 0, sgn(o) * 10], [30, 0, 0]) },
        strike: { root: [0, -0.60, 0], hips: [-60, 0, 0], ...guard, ...leg(s, [-120 + heightLift(h), 0, sgn(s) * 10], [4, 0, 0]), ...leg(o, [-40, 0, sgn(o) * 10], [60, 0, 0]) },
        follow: { root: [0, -0.40, 0.05], hips: [-30, 0, 0], ...guard, ...leg(s, [-80, 0, sgn(s) * 10], [60, 0, 0]), ...leg(o, [-60, 0, sgn(o) * 10], [100, 0, 0]) },
      };
    case 'front':
    default:
      return {
        windup: { ...guard, ...lean(4), ...leg(s, [-80, 0, sgn(s) * 6], [115, 0, 0]), ...support },
        strike: { ...guard, root: [0, -0.02, 0.05], hips: [0, sgn(s) * 12, 0], ...lean(-12), ...leg(s, [-100 + heightLift(h), 0, sgn(s) * 6], [4, 0, 0], [30, 0, 0]), ...support },
        follow: { ...guard, root: [0, -0.04, 0.05], ...lean(-6), ...leg(s, [-80, 0, sgn(s) * 6], [50, 0, 0]), ...support },
      };
  }
}

const PUNCHES = new Set<AttackAnimType>(['jab', 'straight', 'hook', 'uppercut', 'elbow', 'backfist', 'hammer', 'palm', 'doublePunch', 'powerCrush']);

export function strikeKeys(type: AttackAnimType, s: Side, h: Height): StrikeKeys {
  return PUNCHES.has(type) ? punchKeys(type, s, h) : kickKeys(type, s, h);
}

function defaultHeight(m: MoveDef): Height {
  const lvl = m.hits[0]?.level;
  return lvl === 'high' ? 'high' : lvl === 'low' ? 'low' : 'mid';
}

export function defaultAnim(m: MoveDef): AnimSpec {
  if (m.throw) return { type: 'throw' };
  if (m.parry) return { type: 'parry' };
  const input = m.cmd ?? m.input;
  const btn = input.replace(/[^1-4]/g, '').slice(-1);
  const kick = btn === '3' || btn === '4';
  const limb: Side = btn === '1' || btn === '3' ? 'L' : 'R';
  if (m.conditions?.includes('lying')) return { type: 'ground', limb };
  if (kick) return { type: m.hits[0]?.level === 'low' ? 'low' : 'front', limb };
  return { type: limb === 'L' ? 'jab' : 'straight', limb };
}

/** Build the animation clip for a move from its frame data and template. */
export function buildMoveClip(m: MoveDef): Clip {
  const spec = m.anim ?? defaultAnim(m);
  const base = STANCE;
  if (spec.type === 'throw') {
    const t = m.throw;
    const grab = t?.grabFrame ?? 12;
    return makeClip(m.id, m.total, [
      { t: 0, pose: base },
      { t: grab, pose: THROW_GRAB, ease: 'out' },
      { t: grab + 4, pose: THROW_GRAB },
      { t: m.total, pose: base, ease: 'inOut' },
    ]);
  }
  if (spec.type === 'parry') {
    return makeClip(m.id, m.total, [
      { t: 0, pose: base },
      { t: 3, pose: { ...GUARD, upperArmL: [-90, -20, 30], forearmL: [-60, 0, 40] }, ease: 'out' },
      { t: Math.max(8, m.total - 8), pose: { ...GUARD, upperArmL: [-90, -20, 30], forearmL: [-60, 0, 40] } },
      { t: m.total, pose: base },
    ]);
  }
  const limb = spec.limb ?? 'R';
  const height = spec.height ?? defaultHeight(m);
  const crouched = m.pose?.some((p) => p.pose === 'crouch' && p.frames[0] <= 0) ?? false;
  const stanceBase: PoseEuler = crouched ? { ...STANCE, ...CROUCH, root: [0, -0.36, 0.02] } : STANCE;
  const startup = m.hits.reduce((a, h) => Math.min(a, h.frames[0]), m.total);
  const lastActive = m.hits.reduce((a, h) => Math.max(a, h.frames[1]), startup);
  const k = strikeKeys(spec.type, limb, height);
  const windT = Math.max(2, Math.round(startup * 0.55));
  const keys: { t: number; pose: PoseEuler; ease?: Ease }[] = [
    { t: 0, pose: stanceBase },
    { t: windT, pose: { ...stanceBase, ...k.windup }, ease: 'out' },
    { t: startup, pose: { ...stanceBase, ...k.strike }, ease: 'snap' },
    { t: lastActive + 2, pose: { ...stanceBase, ...k.follow }, ease: 'out' },
  ];
  let tCursor = lastActive + 2;
  for (const [hf, type2, limb2] of spec.extra ?? []) {
    const k2 = strikeKeys(type2, limb2, height);
    const w2 = Math.max(tCursor + 2, hf - 5);
    keys.push({ t: w2, pose: { ...stanceBase, ...k2.windup }, ease: 'inOut' });
    keys.push({ t: hf, pose: { ...stanceBase, ...k2.strike }, ease: 'snap' });
    keys.push({ t: hf + 3, pose: { ...stanceBase, ...k2.follow }, ease: 'out' });
    tCursor = hf + 3;
  }
  keys.push({ t: m.total, pose: stanceBase, ease: 'inOut' });
  return makeClip(m.id, m.total, keys);
}

/** Build the throw-victim clip for a throw of `duration` frames. */
export function buildThrownClip(duration: number, faceDown: boolean): Clip {
  return makeClip('thrown', duration, [
    { t: 0, pose: { ...STANCE, spine: [-10, 0, 0] } },
    { t: Math.round(duration * 0.3), pose: THROW_LIFT, ease: 'out' },
    { t: Math.round(duration * 0.6), pose: THROW_SLAM, ease: 'in' },
    { t: duration, pose: faceDown ? { root: [0, -0.8, 0], hips: [88, 0, 0] } : { root: [0, -0.8, 0], hips: [-88, 0, 0] }, ease: 'out' },
  ]);
}
