import { Euler, Quaternion } from 'three';
import { BONE_INDEX, BONES, HUMANOID, Skeleton } from './skeleton';
import { solveIk } from './ik';
import { poseFromEuler, type Ease, type Pose, type PoseEuler } from './pose';

/**
 * Authoring helper for stance / ceremony poses: legs are placed by two-bone IK
 * so the feet rest flat on the floor wherever the hips are, then the resolved
 * pose is converted back to Euler degrees so it composes with every other
 * Euler-authored clip (partial-key inheritance, move templates).
 */

/** Ankle height (m) when the foot rests flat on the floor in the rest skeleton. */
export const ANKLE_Y = 0.07;

/**
 * Ankle placement in fighter space (+X = fighter left, +Z = forward), metres.
 * `yaw` turns the toe toward +X (degrees); `lift` raises the ankle; `pitch`
 * points the toe down (positive) for heel-up / on-the-ball feet.
 */
export interface FootPlant { x: number; z: number; yaw: number; lift?: number; pitch?: number }
export interface Plant {
  L?: FootPlant;
  R?: FootPlant;
  /** Outward knee bias (0 = knees follow the toes, 1 = strongly bowed out). */
  knees?: number;
}

/** Wrist target (fighter space, m) and the direction the elbow should point. */
export interface Reach { at: [number, number, number]; pole: [number, number, number] }

/** A key as authored: Euler overrides, optional foot plants / wrist targets, easing into it. */
export interface KeySpec { t: number; pose: PoseEuler; feet?: Plant; reach?: { L?: Reach; R?: Reach }; ease?: Ease }
/** A key ready for `makeClip`. */
export interface EulerKey { t: number; pose: PoseEuler; ease?: Ease }

const DEG = Math.PI / 180;
/** Ankle-to-ball distance: a toe-down foot pivots here, so the ankle rises by this * sin(pitch). */
const BALL = 0.2;
const skel = new Skeleton(HUMANOID);
const qW = new Quaternion(), qD = new Quaternion();
const eTmp = new Euler();

function plantFoot(p: Pose, side: 'L' | 'R', f: FootPlant, knees: number): void {
  const sgn = side === 'L' ? 1 : -1;
  const yaw = f.yaw * DEG;
  solveIk(p, {
    chain: side === 'L' ? 'legL' : 'legR',
    target: [f.x, ANKLE_Y + (f.lift ?? 0) + BALL * Math.sin(Math.max(0, f.pitch ?? 0) * DEG), f.z],
    pole: [Math.sin(yaw) + sgn * knees, 0.05, Math.cos(yaw)],
  });
  // Flatten the foot: world rotation = yaw then toe pitch, independent of the shin.
  skel.solve(p.rots as Quaternion[], p.root, 0);
  const shin = skel.xforms[BONE_INDEX[`lowerLeg${side}`]];
  if (!shin) return;
  qW.copy(shin.rot).invert();
  qD.setFromEuler(eTmp.set((f.pitch ?? 0) * DEG, yaw, 0, 'YXZ'));
  (p.rots[BONE_INDEX[`foot${side}`]] as Quaternion).copy(qW.multiply(qD));
}

/** Resolve an Euler pose with planted feet / placed wrists into a runtime Pose. */
export function plantPose(e: PoseEuler, feet?: Plant, reach?: KeySpec['reach']): Pose {
  const p = poseFromEuler(e);
  if (feet) {
    const knees = feet.knees ?? 0.25;
    if (feet.L) plantFoot(p, 'L', feet.L, knees);
    if (feet.R) plantFoot(p, 'R', feet.R, knees);
  }
  if (reach?.L) solveIk(p, { chain: 'armL', target: reach.L.at, pole: reach.L.pole });
  if (reach?.R) solveIk(p, { chain: 'armR', target: reach.R.at, pole: reach.R.pole });
  return p;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Convert a runtime Pose back to Euler degrees (every bone + root). */
export function poseToEuler(p: Pose): PoseEuler {
  const out: PoseEuler = { root: [p.root.x, p.root.y, p.root.z] };
  BONES.forEach((name, i) => {
    eTmp.setFromQuaternion(p.rots[i] as Quaternion, 'XYZ');
    out[name] = [r1(eTmp.x / DEG), r1(eTmp.y / DEG), r1(eTmp.z / DEG)];
  });
  return out;
}

/**
 * Resolve authored keys into full Euler keys. Each key starts from `base`
 * (a complete pose) so nothing snaps to the rest pose, and feet default to
 * the previous key's plant (and wrist targets) so a breathing key only needs
 * to move the root; pass `reach: {}` to release the arms back to Euler.
 */
export function resolveKeys(base: PoseEuler, keys: KeySpec[], basePlant?: Plant): EulerKey[] {
  let plant = basePlant;
  let reach: KeySpec['reach'];
  return keys.map((k) => {
    plant = k.feet ?? plant;
    reach = k.reach ?? reach;
    const pose = poseToEuler(plantPose({ ...base, ...k.pose }, plant, reach));
    return k.ease ? { t: k.t, pose, ease: k.ease } : { t: k.t, pose };
  });
}
