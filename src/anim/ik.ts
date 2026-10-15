import { Matrix4, Quaternion, Vector3 } from 'three';
import { BONE_INDEX, HUMANOID, Skeleton, type BoneName } from './skeleton';
import type { Pose } from './pose';

export type Chain = 'armL' | 'armR' | 'legL' | 'legR';

export interface IkRequest {
  chain: Chain;
  /** Target end-joint position (wrist / ankle) in fighter space: +X left, +Y up, +Z forward (m). */
  target: [number, number, number];
  /** Direction the middle joint (elbow / knee) should point toward. */
  pole: [number, number, number];
}

const CHAINS: Record<Chain, { upper: BoneName; lower: BoneName; parent: BoneName }> = {
  armL: { upper: 'upperArmL', lower: 'forearmL', parent: 'shoulderL' },
  armR: { upper: 'upperArmR', lower: 'forearmR', parent: 'shoulderR' },
  legL: { upper: 'upperLegL', lower: 'lowerLegL', parent: 'hips' },
  legR: { upper: 'upperLegR', lower: 'lowerLegR', parent: 'hips' },
};

const skel = new Skeleton(HUMANOID);
const T = new Vector3(), D = new Vector3(), N = new Vector3(), B = new Vector3(), U = new Vector3(), E = new Vector3(), F = new Vector3();
const Z = new Vector3(), POLE = new Vector3();
const M = new Matrix4();
const R1 = new Quaternion(), R2 = new Quaternion(), INV = new Quaternion();

function basis(x: Vector3, yDir: Vector3, out: Quaternion): Quaternion {
  // bone local -Y points along the limb, so local +Y = -yDir
  const y = Z.copy(yDir).multiplyScalar(-1);
  const z = new Vector3().crossVectors(x, y).normalize();
  M.makeBasis(x, y, z);
  return out.setFromRotationMatrix(M);
}

/**
 * Two-bone IK. Solves the upper/lower bone rotations of `req.chain` so the
 * end joint lands on the target (clamped to the chain length) with the
 * middle joint bent toward the pole. Mutates `pose` in place.
 */
export function solveIk(pose: Pose, req: IkRequest): void {
  const c = CHAINS[req.chain];
  const ui = BONE_INDEX[c.upper], li = BONE_INDEX[c.lower], pi = BONE_INDEX[c.parent];
  skel.solve(pose.rots as Quaternion[], pose.root, 0);
  const upper = skel.xforms[ui], parent = skel.xforms[pi];
  if (!upper || !parent) return;
  const L1 = HUMANOID[ui]?.length ?? 0.3, L2 = HUMANOID[li]?.length ?? 0.3;
  const S = upper.pos;
  T.set(req.target[0], req.target[1], req.target[2]);
  D.subVectors(T, S);
  let dist = D.length();
  const maxLen = L1 + L2 - 0.002;
  if (dist < 0.05) dist = 0.05;
  if (dist > maxLen) { dist = maxLen; }
  D.normalize();
  POLE.set(req.pole[0], req.pole[1], req.pole[2]).normalize();
  N.crossVectors(D, POLE);
  if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
  N.normalize();
  B.crossVectors(N, D).normalize(); // in-plane direction toward the pole
  const cosA = Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)));
  const A = Math.acos(cosA);
  U.copy(D).multiplyScalar(Math.cos(A)).addScaledVector(B, Math.sin(A)).normalize();
  E.copy(S).addScaledVector(U, L1);
  F.copy(S).addScaledVector(D, dist).sub(E).normalize();
  basis(N, U, R1);
  basis(N, F, R2);
  INV.copy(parent.rot).invert();
  (pose.rots[ui] as Quaternion).copy(INV).multiply(R1);
  INV.copy(R1).invert();
  (pose.rots[li] as Quaternion).copy(INV).multiply(R2);
}

/** End-joint world position after solving (for authoring checks). */
export function endJoint(pose: Pose, chain: Chain, out: Vector3): Vector3 {
  const c = CHAINS[chain];
  skel.solve(pose.rots as Quaternion[], pose.root, 0);
  return out.copy((skel.xforms[BONE_INDEX[c.lower]] as { tip: Vector3 }).tip);
}
