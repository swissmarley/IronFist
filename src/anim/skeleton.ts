import { Quaternion, Vector3 } from 'three';

/**
 * Procedural humanoid skeleton (metres). Rest pose: standing, arms hanging,
 * every limb bone points down -Y (feet point +Z = forward). Pose rotations are
 * applied in the bone's local frame on top of the rest orientation.
 */
export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'forearmL', 'handL',
  'shoulderR', 'upperArmR', 'forearmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL',
  'upperLegR', 'lowerLegR', 'footR',
] as const;
export type BoneName = (typeof BONES)[number];
export const BONE_INDEX: Record<BoneName, number> = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

export interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** Offset from parent joint in the parent's rest frame (m). */
  offset: [number, number, number];
  /** Bone length (m) along its rest axis. */
  length: number;
  /** Rest axis direction (unit) in the parent's frame. Default -Y. */
  axis: [number, number, number];
  /** Visual radius (m) used for mesh generation and hurt capsules. */
  radius: number;
}

/** Proportions for a 1.78 m fighter; scale per character with `scaleSkeleton`. */
export const HUMANOID: BoneDef[] = [
  { name: 'hips', parent: null, offset: [0, 0.96, 0], length: 0.12, axis: [0, 1, 0], radius: 0.16 },
  { name: 'spine', parent: 'hips', offset: [0, 0.10, 0], length: 0.15, axis: [0, 1, 0], radius: 0.15 },
  { name: 'chest', parent: 'spine', offset: [0, 0.15, 0], length: 0.20, axis: [0, 1, 0], radius: 0.17 },
  { name: 'neck', parent: 'chest', offset: [0, 0.22, 0], length: 0.08, axis: [0, 1, 0], radius: 0.06 },
  { name: 'head', parent: 'neck', offset: [0, 0.08, 0], length: 0.22, axis: [0, 1, 0], radius: 0.105 },
  { name: 'shoulderL', parent: 'chest', offset: [0.06, 0.18, 0], length: 0.14, axis: [1, 0, 0], radius: 0.06 },
  { name: 'upperArmL', parent: 'shoulderL', offset: [0.14, 0, 0], length: 0.29, axis: [0, -1, 0], radius: 0.055 },
  { name: 'forearmL', parent: 'upperArmL', offset: [0, -0.29, 0], length: 0.27, axis: [0, -1, 0], radius: 0.045 },
  { name: 'handL', parent: 'forearmL', offset: [0, -0.27, 0], length: 0.17, axis: [0, -1, 0], radius: 0.045 },
  { name: 'shoulderR', parent: 'chest', offset: [-0.06, 0.18, 0], length: 0.14, axis: [-1, 0, 0], radius: 0.06 },
  { name: 'upperArmR', parent: 'shoulderR', offset: [-0.14, 0, 0], length: 0.29, axis: [0, -1, 0], radius: 0.055 },
  { name: 'forearmR', parent: 'upperArmR', offset: [0, -0.29, 0], length: 0.27, axis: [0, -1, 0], radius: 0.045 },
  { name: 'handR', parent: 'forearmR', offset: [0, -0.27, 0], length: 0.17, axis: [0, -1, 0], radius: 0.045 },
  { name: 'upperLegL', parent: 'hips', offset: [0.10, -0.02, 0], length: 0.44, axis: [0, -1, 0], radius: 0.085 },
  { name: 'lowerLegL', parent: 'upperLegL', offset: [0, -0.44, 0], length: 0.43, axis: [0, -1, 0], radius: 0.06 },
  { name: 'footL', parent: 'lowerLegL', offset: [0, -0.43, 0], length: 0.24, axis: [0, 0, 1], radius: 0.05 },
  { name: 'upperLegR', parent: 'hips', offset: [-0.10, -0.02, 0], length: 0.44, axis: [0, -1, 0], radius: 0.085 },
  { name: 'lowerLegR', parent: 'upperLegR', offset: [0, -0.44, 0], length: 0.43, axis: [0, -1, 0], radius: 0.06 },
  { name: 'footR', parent: 'lowerLegR', offset: [0, -0.43, 0], length: 0.24, axis: [0, 0, 1], radius: 0.05 },
];

export function scaleSkeleton(def: BoneDef[], scale: number, bulk = 1): BoneDef[] {
  return def.map((b) => ({
    ...b,
    offset: [b.offset[0] * scale, b.offset[1] * scale, b.offset[2] * scale],
    length: b.length * scale,
    radius: b.radius * scale * bulk,
  }));
}

/** World-space result of forward kinematics for one bone. */
export interface BoneXform {
  pos: Vector3;      // joint position
  rot: Quaternion;   // world rotation (rest frame * pose)
  tip: Vector3;      // joint + rotated axis * length
}

export class Skeleton {
  readonly defs: BoneDef[];
  readonly xforms: BoneXform[];
  private readonly parentIdx: number[];
  private readonly tmpV = new Vector3();
  private readonly tmpQ = new Quaternion();

  constructor(defs: BoneDef[] = HUMANOID) {
    this.defs = defs;
    this.parentIdx = defs.map((d) => (d.parent ? BONE_INDEX[d.parent] : -1));
    this.xforms = defs.map(() => ({ pos: new Vector3(), rot: new Quaternion(), tip: new Vector3() }));
  }

  /**
   * Compute world transforms for a pose. `rots` holds one quaternion per bone
   * (local rotation applied at the joint); `rootOffset` moves the hips.
   */
  solve(rots: readonly Quaternion[], rootOffset: Vector3, rootYaw = 0): void {
    for (let i = 0; i < this.defs.length; i++) {
      const d = this.defs[i] as BoneDef;
      const x = this.xforms[i] as BoneXform;
      const p = this.parentIdx[i] as number;
      const q = rots[i] ?? this.tmpQ.identity();
      if (p < 0) {
        x.pos.set(d.offset[0], d.offset[1], d.offset[2]).add(rootOffset);
        x.rot.setFromAxisAngle(this.tmpV.set(0, 1, 0), rootYaw).multiply(q);
      } else {
        const px = this.xforms[p] as BoneXform;
        x.pos.set(d.offset[0], d.offset[1], d.offset[2]).applyQuaternion(px.rot).add(px.pos);
        x.rot.copy(px.rot).multiply(q);
      }
      x.tip.set(d.axis[0], d.axis[1], d.axis[2]).multiplyScalar(d.length).applyQuaternion(x.rot).add(x.pos);
    }
  }

  index(name: BoneName): number {
    return BONE_INDEX[name];
  }
}
