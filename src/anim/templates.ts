import type { AnimSpec, AttackAnimType, MoveDef } from '@/sim/types';
import { makeClip, makeClipFromPoses, poseFromEuler, type Clip, type Ease, type Pose, type PoseEuler } from './pose';
import { solveIk, type IkRequest } from './ik';
import { CROUCH, GUARD, STANCE, THROW_GRAB, THROW_LIFT, THROW_SLAM } from './poses';

type Side = 'L' | 'R';
type Height = 'high' | 'mid' | 'low';

/** A strike is three key poses; strike/follow may aim a limb with IK. */
interface StrikeKeys {
  windup: PoseEuler;
  strike: PoseEuler;
  follow: PoseEuler;
  ikStrike?: IkRequest[];
  ikFollow?: IkRequest[];
}

const sgn = (s: Side): number => (s === 'L' ? 1 : -1);
const arm = (s: Side, upper: [number, number, number], fore: [number, number, number], hand: [number, number, number] = [0, 0, 0]): PoseEuler => ({
  [`upperArm${s}`]: upper, [`forearm${s}`]: fore, [`hand${s}`]: hand,
} as PoseEuler);
const leg = (s: Side, upper: [number, number, number], lower: [number, number, number], foot: [number, number, number] = [0, 0, 0]): PoseEuler => ({
  [`upperLeg${s}`]: upper, [`lowerLeg${s}`]: lower, [`foot${s}`]: foot,
} as PoseEuler);

const PUNCH_H: Record<Height, number> = { high: 1.42, mid: 1.05, low: 0.72 };
const KICK_H: Record<Height, number> = { high: 1.38, mid: 0.95, low: 0.42 };

/** Torso twist that brings the striking shoulder forward (negative yaw = left side forward). */
function torsoDrive(s: Side, amount: number): PoseEuler {
  const y = -sgn(s) * amount;
  return { root: [0, -0.05, 0.10], hips: [0, -32 + y * 0.6, 0], spine: [12, 6 + y * 0.5, 0], chest: [10, 8 + y * 0.9, 0] };
}

const GUARD_ARMS: PoseEuler = { ...arm('L', [-60, -12, 16], [-120, 0, 10]), ...arm('R', [-60, 12, -16], [-120, 0, -10]) };
const guardOther = (s: Side): PoseEuler => (s === 'L' ? arm('R', [-60, 12, -16], [-120, 0, -10]) : arm('L', [-60, -12, 16], [-120, 0, 10]));
const armReq = (s: Side, target: [number, number, number], pole: [number, number, number]): IkRequest => ({ chain: s === 'L' ? 'armL' : 'armR', target, pole });
const legReq = (s: Side, target: [number, number, number], pole: [number, number, number]): IkRequest => ({ chain: s === 'L' ? 'legL' : 'legR', target, pole });

function punchKeys(type: AttackAnimType, s: Side, h: Height): StrikeKeys {
  const o = s === 'L' ? 'R' : 'L';
  const H = PUNCH_H[h];
  const g = guardOther(s);
  const fist: PoseEuler = { [`hand${s}`]: [-10, 0, 0] } as PoseEuler;
  const back = torsoDrive(o, 8);
  const poleDown: [number, number, number] = [sgn(s) * 0.6, -1, 0.15];
  switch (type) {
    case 'hook':
      return {
        windup: { ...back, ...arm(s, [-40, 0, sgn(s) * 60], [-110, 0, 0]) },
        strike: { ...torsoDrive(s, 36), ...g, ...fist }, ikStrike: [armReq(s, [-sgn(s) * 0.12, H, 0.66], [sgn(s) * 1, 0.1, 0.25])],
        follow: { ...torsoDrive(s, 44), ...g, ...fist }, ikFollow: [armReq(s, [-sgn(s) * 0.32, H, 0.5], [sgn(s) * 1, 0.1, 0.0])],
      };
    case 'uppercut':
      return {
        windup: { root: [0, -0.16, 0], ...back, spine: [20, 0, 0], ...arm(s, [-10, 0, sgn(s) * 20], [-70, 0, 0]) },
        strike: { ...torsoDrive(s, 26), root: [0, 0.0, 0.14], spine: [2, 0, 0], chest: [-4, 0, 0], ...g, ...fist }, ikStrike: [armReq(s, [sgn(s) * 0.04, H + 0.1, 0.74], [sgn(s) * 0.3, -1, -0.4])],
        follow: { ...torsoDrive(s, 26), root: [0, -0.02, 0.14], ...g, ...fist }, ikFollow: [armReq(s, [sgn(s) * 0.04, H + 0.42, 0.6], [sgn(s) * 0.3, -0.6, -0.8])],
      };
    case 'elbow':
      return {
        windup: { ...back, ...arm(s, [-30, 0, sgn(s) * 40], [-140, 0, 0]) },
        strike: { ...torsoDrive(s, 40), root: [0, -0.06, 0.16], ...arm(s, [-100 + (h === 'high' ? -20 : h === 'low' ? 25 : 0), sgn(s) * -30, sgn(s) * 10], [-150, 0, 0]), ...g },
        follow: { ...torsoDrive(s, 46), root: [0, -0.06, 0.16], ...arm(s, [-95, sgn(s) * -40, 0], [-150, 0, 0]), ...g },
      };
    case 'backfist':
      return {
        windup: { ...torsoDrive(s, 24), ...arm(s, [-70, 0, sgn(s) * -30], [-130, 0, 0]) },
        strike: { ...torsoDrive(o, 18), ...g, ...fist }, ikStrike: [armReq(s, [-sgn(s) * 0.05, H, 0.9], [sgn(s) * 0.8, 0.6, 0])],
        follow: { ...torsoDrive(o, 22), ...g, ...fist }, ikFollow: [armReq(s, [-sgn(s) * 0.3, H, 0.8], [sgn(s) * 0.8, 0.6, 0])],
      };
    case 'hammer':
      return {
        windup: { root: [0, 0, 0], spine: [-10, 0, 0], ...arm(s, [-175, 0, sgn(s) * 10], [-40, 0, 0]) },
        strike: { ...torsoDrive(s, 10), root: [0, -0.20, 0.10], spine: [24, 0, 0], chest: [10, 0, 0], ...g, ...fist, ...CROUCHLEGS }, ikStrike: [armReq(s, [sgn(s) * 0.05, 0.78, 0.66], [sgn(s) * 0.5, 0.7, 0.5])],
        follow: { ...torsoDrive(s, 10), root: [0, -0.22, 0.10], spine: [26, 0, 0], ...g, ...fist, ...CROUCHLEGS }, ikFollow: [armReq(s, [sgn(s) * 0.05, 0.62, 0.6], [sgn(s) * 0.5, 0.7, 0.5])],
      };
    case 'palm':
      return {
        windup: { root: [0, -0.10, 0], ...back, ...arm(s, [-20, 0, sgn(s) * 10], [-120, 0, 0], [40, 0, 0]) },
        strike: { ...torsoDrive(s, 24), ...g, [`hand${s}`]: [60, 0, 0] } as PoseEuler, ikStrike: [armReq(s, [sgn(s) * 0.04, H, 0.96], poleDown)],
        follow: { ...torsoDrive(s, 24), ...g, [`hand${s}`]: [40, 0, 0] } as PoseEuler, ikFollow: [armReq(s, [sgn(s) * 0.04, H, 0.9], poleDown)],
      };
    case 'doublePunch':
    case 'powerCrush':
      return {
        windup: { root: [0, -0.10, -0.04], spine: [-6, 0, 0], ...arm('L', [-30, 0, 20], [-130, 0, 10]), ...arm('R', [-30, 0, -20], [-130, 0, -10]) },
        strike: { root: [0, -0.04, 0.14], hips: [0, 0, 0], spine: [14, 0, 0], chest: [8, 0, 0], handL: [-10, 0, 0], handR: [-10, 0, 0] },
        ikStrike: [armReq('L', [0.14, H, 0.98], [0.6, -1, 0.1]), armReq('R', [-0.14, H, 0.98], [-0.6, -1, 0.1])],
        follow: { root: [0, -0.06, 0.14], hips: [0, 0, 0], spine: [16, 0, 0], handL: [-10, 0, 0], handR: [-10, 0, 0] },
        ikFollow: [armReq('L', [0.14, H, 0.92], [0.6, -1, 0.1]), armReq('R', [-0.14, H, 0.92], [-0.6, -1, 0.1])],
      };
    case 'straight':
    case 'jab':
    default: {
      const reach = type === 'straight' ? 1.04 : 0.98;
      const drive = type === 'straight' ? 26 : 16;
      return {
        windup: { ...back, ...arm(s, [-50, sgn(s) * -10, sgn(s) * 16], [-125, 0, sgn(s) * 8]) },
        strike: { ...torsoDrive(s, drive), ...g, ...fist }, ikStrike: [armReq(s, [sgn(s) * 0.05, H, reach], poleDown)],
        follow: { ...torsoDrive(s, drive), ...g, ...fist }, ikFollow: [armReq(s, [sgn(s) * 0.05, H - 0.02, reach - 0.06], poleDown)],
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
  const H = KICK_H[h];
  const support = leg(o, [8, 0, sgn(o) * 6], [14, 0, 0], [0, 0, 0]);
  const hipTurn: PoseEuler = { hips: [0, -sgn(s) * 25, 0] };
  const lean = (x: number): PoseEuler => ({ spine: [x, 0, 0], chest: [x * 0.6, 0, 0] });
  const pointed: PoseEuler = { [`foot${s}`]: [30, 0, 0] } as PoseEuler;
  const kneeUp: [number, number, number] = [sgn(s) * 0.15, 0.8, 0.55];
  const kneeOut: [number, number, number] = [sgn(s) * 1, 0.35, 0.25];
  switch (type) {
    case 'round':
      return {
        windup: { ...GUARD_ARMS, ...hipTurn, ...lean(-6), ...leg(s, [-60, 0, sgn(s) * 50], [110, 0, 0]), ...support },
        strike: { ...GUARD_ARMS, hips: [0, -sgn(s) * 55, 0], root: [0, -0.04, 0.06], ...lean(-16), ...support, ...pointed }, ikStrike: [legReq(s, [-sgn(s) * 0.22, H, 1.06], kneeOut)],
        follow: { ...GUARD_ARMS, hips: [0, -sgn(s) * 70, 0], root: [0, -0.04, 0.06], ...lean(-10), ...support, ...pointed }, ikFollow: [legReq(s, [-sgn(s) * 0.45, H, 0.85], kneeOut)],
      };
    case 'low':
      return {
        windup: { ...GUARD_ARMS, ...hipTurn, ...lean(6), ...leg(s, [-40, 0, sgn(s) * 10], [70, 0, 0]), ...support },
        strike: { ...GUARD_ARMS, hips: [0, -sgn(s) * 30, 0], ...lean(12), root: [0, -0.10, 0.08], ...support, ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.05, 0.4, 1.1], kneeUp)],
        follow: { ...GUARD_ARMS, hips: [0, -sgn(s) * 36, 0], ...lean(10), root: [0, -0.10, 0.08], ...support, ...pointed }, ikFollow: [legReq(s, [sgn(s) * 0.05, 0.42, 1.0], kneeUp)],
      };
    case 'sweep':
      return {
        windup: { ...CROUCH, ...GUARD_ARMS, hips: [0, -sgn(s) * 20, 0], ...leg(s, [-60, 0, sgn(s) * 40], [100, 0, 0]) },
        strike: { ...CROUCH, ...GUARD_ARMS, root: [0, -0.64, 0.18], hips: [0, -sgn(s) * 40, 0], ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.08, 0.12, 1.15], [sgn(s) * 0.2, 1, 0.3])],
        follow: { ...CROUCH, ...GUARD_ARMS, root: [0, -0.64, 0.18], hips: [0, -sgn(s) * 100, 0], ...pointed }, ikFollow: [legReq(s, [-sgn(s) * 0.3, 0.12, 0.95], [sgn(s) * 0.2, 1, 0.3])],
      };
    case 'hop':
      return {
        windup: { ...GUARD_ARMS, root: [0, -0.18, 0], ...lean(14), ...leg(s, [-50, 0, sgn(s) * 8], [90, 0, 0]), ...leg(o, [-40, 0, sgn(o) * 8], [80, 0, 0]) },
        strike: { ...GUARD_ARMS, root: [0, 0.35, 0.05], ...lean(-14), ...leg(o, [-50, 0, sgn(o) * 10], [100, 0, 0]), ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.04, 1.2, 1.12], kneeUp)],
        follow: { ...GUARD_ARMS, root: [0, 0.15, 0.05], ...lean(-6), ...leg(o, [-40, 0, sgn(o) * 10], [90, 0, 0]), ...pointed }, ikFollow: [legReq(s, [sgn(s) * 0.04, 1.0, 0.95], kneeUp)],
      };
    case 'knee':
      return {
        windup: { ...GUARD_ARMS, ...lean(4), ...leg(s, [-30, 0, 0], [60, 0, 0]), ...support },
        strike: { ...GUARD_ARMS, root: [0, -0.02, 0.06], hips: [0, -sgn(s) * 20, 0], ...lean(-8), ...leg(s, [-115, 0, sgn(s) * 6], [125, 0, 0]), ...support },
        follow: { ...GUARD_ARMS, root: [0, -0.04, 0.06], ...leg(s, [-90, 0, sgn(s) * 6], [110, 0, 0]), ...support },
      };
    case 'spinBack':
      return {
        windup: { ...GUARD_ARMS, hips: [0, sgn(s) * 40, 0], ...lean(6), ...leg(s, [-20, 0, 0], [60, 0, 0]), ...support },
        strike: { ...GUARD_ARMS, hips: [0, -sgn(s) * 20, 0], root: [0, -0.02, 0.1], ...lean(-22), ...support, ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.02, H, 1.22], [sgn(s) * 0.3, 0.6, 0.6])],
        follow: { ...GUARD_ARMS, hips: [0, -sgn(s) * 40, 0], root: [0, -0.02, 0.1], ...lean(-10), ...support, ...pointed }, ikFollow: [legReq(s, [sgn(s) * 0.02, H - 0.1, 1.0], [sgn(s) * 0.3, 0.6, 0.6])],
      };
    case 'axe':
      return {
        windup: { ...GUARD_ARMS, ...lean(-10), ...leg(s, [-140, 0, sgn(s) * 6], [10, 0, 0]), ...support },
        strike: { ...GUARD_ARMS, root: [0, -0.06, 0.04], ...lean(16), ...support, ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.04, 0.55, 0.95], [sgn(s) * 0.1, 1, 0.3])],
        follow: { ...GUARD_ARMS, root: [0, -0.10, 0.04], ...lean(20), ...support, ...pointed }, ikFollow: [legReq(s, [sgn(s) * 0.04, 0.3, 0.9], [sgn(s) * 0.1, 1, 0.3])],
      };
    case 'side':
      return {
        windup: { ...GUARD_ARMS, hips: [0, -sgn(s) * 50, 0], ...lean(-6), ...leg(s, [-70, 0, sgn(s) * 30], [100, 0, 0]), ...support },
        strike: { ...GUARD_ARMS, hips: [0, -sgn(s) * 70, 0], ...lean(-22), ...support, [`foot${s}`]: [20, 0, 0] } as PoseEuler, ikStrike: [legReq(s, [0, H, 1.2], kneeOut)],
        follow: { ...GUARD_ARMS, hips: [0, -sgn(s) * 70, 0], ...lean(-12), ...support, ...pointed }, ikFollow: [legReq(s, [0, H, 1.0], kneeOut)],
      };
    case 'rising':
      return {
        windup: { ...CROUCH, ...GUARD_ARMS, ...leg(s, [-70, 0, sgn(s) * 10], [110, 0, 0]) },
        strike: { ...GUARD_ARMS, root: [0, -0.06, 0.04], ...lean(-10), ...support, ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.04, H + 0.05, 1.08], kneeUp)],
        follow: { ...GUARD_ARMS, root: [0, -0.06, 0.04], ...support, ...pointed }, ikFollow: [legReq(s, [sgn(s) * 0.04, H, 0.9], kneeUp)],
      };
    case 'ground':
      return {
        windup: { root: [0, -0.75, -0.1], hips: [-80, 0, 0], ...GUARD_ARMS, ...leg(s, [-50, 0, sgn(s) * 10], [100, 0, 0]), ...leg(o, [-20, 0, sgn(o) * 10], [30, 0, 0]) },
        strike: { root: [0, -0.60, 0], hips: [-60, 0, 0], ...GUARD_ARMS, ...leg(o, [-40, 0, sgn(o) * 10], [60, 0, 0]), ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.05, h === 'low' ? 0.25 : 0.7, 1.15], [sgn(s) * 0.2, 1, 0.3])],
        follow: { root: [0, -0.40, 0.05], hips: [-30, 0, 0], ...GUARD_ARMS, ...leg(o, [-60, 0, sgn(o) * 10], [100, 0, 0]), ...pointed }, ikFollow: [legReq(s, [sgn(s) * 0.05, h === 'low' ? 0.2 : 0.5, 1.0], [sgn(s) * 0.2, 1, 0.3])],
      };
    case 'front':
    default:
      return {
        windup: { ...GUARD_ARMS, ...lean(4), ...leg(s, [-80, 0, sgn(s) * 6], [115, 0, 0]), ...support },
        strike: { ...GUARD_ARMS, root: [0, -0.02, 0.05], hips: [0, -sgn(s) * 12, 0], ...lean(-12), ...support, ...pointed }, ikStrike: [legReq(s, [sgn(s) * 0.04, H, 1.18], kneeUp)],
        follow: { ...GUARD_ARMS, root: [0, -0.04, 0.05], ...lean(-6), ...support, ...pointed }, ikFollow: [legReq(s, [sgn(s) * 0.04, H - 0.05, 1.0], kneeUp)],
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

/** Resolve an Euler key plus optional IK requests into a Pose. */
function resolve(e: PoseEuler, ik?: IkRequest[]): Pose {
  const p = poseFromEuler(e);
  if (ik) for (const r of ik) solveIk(p, r);
  return p;
}

/**
 * Build the animation clip for a move from its frame data and template.
 * `rest` is the character's stance: only the first and last keys use it, so
 * the active frames (and therefore the baked hit capsules) never depend on it.
 */
export function buildMoveClip(m: MoveDef, rest: PoseEuler = STANCE): Clip {
  const spec = m.anim ?? defaultAnim(m);
  const base = rest;
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
  const stanceBase: PoseEuler = crouched ? { ...STANCE, ...CROUCH, root: [0, -0.50, 0.02] } : STANCE;
  const startup = m.hits.reduce((a, h) => Math.min(a, h.frames[0]), m.total);
  const lastActive = m.hits.reduce((a, h) => Math.max(a, h.frames[1]), startup);
  const k = strikeKeys(spec.type, limb, height);
  const windT = Math.max(2, Math.round(startup * 0.55));
  const fix = (p: PoseEuler): PoseEuler => {
    if (!crouched) return p;
    const r = p.root ?? [0, 0, 0];
    return { ...p, root: [r[0], Math.min(r[1], -0.50), r[2] + 0.06], spine: [22, p.spine?.[1] ?? 6, 0] };
  };
  const restPose = resolve(crouched ? stanceBase : rest);
  const keys: { t: number; pose: Pose; ease?: Ease }[] = [
    { t: 0, pose: restPose },
    { t: windT, pose: resolve(fix({ ...stanceBase, ...k.windup })), ease: 'out' },
    { t: startup, pose: resolve(fix({ ...stanceBase, ...k.strike }), k.ikStrike), ease: 'snap' },
    { t: lastActive + 2, pose: resolve(fix({ ...stanceBase, ...k.follow }), k.ikFollow), ease: 'out' },
  ];
  let tCursor = lastActive + 2;
  for (const [hf, type2, limb2] of spec.extra ?? []) {
    const k2 = strikeKeys(type2, limb2, height);
    const w2 = Math.max(tCursor + 2, hf - 5);
    keys.push({ t: w2, pose: resolve(fix({ ...stanceBase, ...k2.windup })), ease: 'inOut' });
    keys.push({ t: hf, pose: resolve(fix({ ...stanceBase, ...k2.strike }), k2.ikStrike), ease: 'snap' });
    keys.push({ t: hf + 3, pose: resolve(fix({ ...stanceBase, ...k2.follow }), k2.ikFollow), ease: 'out' });
    tCursor = hf + 3;
  }
  keys.push({ t: m.total, pose: crouched ? resolve(stanceBase) : restPose, ease: 'inOut' });
  return makeClipFromPoses(m.id, m.total, keys);
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
