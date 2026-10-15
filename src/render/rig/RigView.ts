import * as THREE from 'three/webgpu';
import { HUMANOID, scaleSkeleton, type BoneDef } from '@/anim/skeleton';
import type { Pose } from '@/anim/pose';
import { buildBones, buildRigGeometry, DEFAULT_STYLE, type RigStyle } from './RigGeometry';
import { makeRigMaterials, PALETTES, type Palette } from './RigMaterials';

export interface RigOptions {
  heightScale?: number;
  style?: RigStyle;
  palette?: Palette;
}

/**
 * A skinned procedural fighter. `applyPose` writes a Pose into the bones;
 * the parent group carries the sim transform (position + facing yaw).
 */
export class RigView {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[];
  readonly defs: BoneDef[];
  readonly materials: THREE.Material[];
  private flash = 0;
  private readonly baseColors: THREE.Color[];
  private readonly baseEmissive: THREE.Color[];
  private readonly white = new THREE.Color(0xffffff);

  constructor(opts: RigOptions = {}) {
    this.defs = scaleSkeleton(HUMANOID, opts.heightScale ?? 1, opts.style?.bulk ?? 1);
    const style = opts.style ?? DEFAULT_STYLE;
    const { geometry, groups } = buildRigGeometry(this.defs, style);
    this.materials = makeRigMaterials(groups, opts.palette ?? (PALETTES.karate as Palette));
    this.bones = buildBones(this.defs);
    const skeleton = new THREE.Skeleton(this.bones);
    this.mesh = new THREE.SkinnedMesh(geometry, this.materials);
    this.mesh.add(this.bones[0] as THREE.Bone);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.baseColors = this.materials.map((m) => (m as THREE.MeshStandardMaterial).color.clone());
    this.baseEmissive = this.materials.map((m) => (m as THREE.MeshStandardMaterial).emissive.clone());
  }

  applyPose(pose: Pose): void {
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i] as THREE.Bone;
      const d = this.defs[i] as BoneDef;
      b.quaternion.copy(pose.rots[i] as THREE.Quaternion);
      if (i === 0) b.position.set(d.offset[0] + pose.root.x, d.offset[1] + pose.root.y, d.offset[2] + pose.root.z);
    }
  }

  triggerFlash(strength: number): void {
    this.flash = Math.max(this.flash, 0.45 + strength * 0.2);
  }

  /** Per-frame material effects: hit flash, KO dim, guard tint. */
  updateEffects(dtMs: number, dim: boolean, guard: boolean): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dtMs / 110);
    for (let i = 0; i < this.materials.length; i++) {
      const m = this.materials[i] as THREE.MeshStandardMaterial;
      m.color.copy(this.baseColors[i] as THREE.Color);
      if (guard) m.color.lerp(this.white, 0.12);
      if (dim) m.color.multiplyScalar(0.6);
      m.emissive.copy(this.baseEmissive[i] as THREE.Color);
      if (this.flash > 0) m.emissive.lerp(this.white, Math.min(1, this.flash) * 0.8);
    }
  }

  /** World position of a bone joint (for VFX attachment). */
  bonePosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    return (this.bones[index] as THREE.Bone).getWorldPosition(out);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
