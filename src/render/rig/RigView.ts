import * as THREE from 'three/webgpu';
import { BONE_INDEX, HUMANOID, scaleSkeleton, type BoneDef } from '@/anim/skeleton';
import type { Pose } from '@/anim/pose';
import { buildBones, buildRigGeometry, DEFAULT_STYLE, type RigStyle } from './RigGeometry';
import { makeRigMaterials, PALETTES, type Palette } from './RigMaterials';
import { SpringRig } from './SpringRig';
import { FaceRig } from './FaceRig';
import type { SpringSetup } from './springPresets';

export interface RigOptions {
  heightScale?: number;
  style?: RigStyle;
  palette?: Palette;
  /** Spring chains (hair, belt ends, cloth); none when omitted. */
  springs?: SpringSetup;
  /** Per-chain segment cap from the quality tier (potato = 1). */
  springMaxSegments?: number;
  /** Deterministic per-fighter phase for the idle breeze (radians). */
  springPhase?: number;
  /** Facial features (eyes, brows, mouth); default true. */
  face?: boolean;
  /** Drive expressions/blinks from fighter state (FighterView); false on the potato tier. */
  faceExpressions?: boolean;
  /** Deterministic per-fighter blink phase (ms). */
  facePhaseMs?: number;
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
  readonly springs: SpringRig;
  /** Face mesh parented to the head bone (null when disabled). */
  readonly face: FaceRig | null;
  /** Every material the hit flash / KO dim / guard tint touches (body + face). */
  private readonly fxMaterials: THREE.MeshStandardMaterial[];
  private readonly springPhase: number;
  private springTime = 0;
  private readonly springUpdate = { timeScale: 1, windX: 0, windZ: 0 };
  private flash = 0;
  private readonly baseColors: THREE.Color[];
  private readonly baseEmissive: THREE.Color[];
  private readonly white = new THREE.Color(0xffffff);

  constructor(opts: RigOptions = {}) {
    this.defs = scaleSkeleton(HUMANOID, opts.heightScale ?? 1, opts.style?.bulk ?? 1);
    const style = opts.style ?? DEFAULT_STYLE;
    this.springs = new SpringRig(this.defs, opts.springs ?? { chains: [], dressing: {} }, this.defs.length, opts.springMaxSegments);
    this.springPhase = opts.springPhase ?? 0;
    const { geometry, groups } = buildRigGeometry(this.defs, style, this.springs.parts);
    const palette = opts.palette ?? (PALETTES.karate as Palette);
    this.materials = makeRigMaterials(groups, palette);
    this.bones = buildBones(this.defs);
    this.springs.attach(this.bones);
    const skeleton = new THREE.Skeleton([...this.bones, ...this.springs.bones]);
    this.mesh = new THREE.SkinnedMesh(geometry, this.materials);
    this.mesh.add(this.bones[0] as THREE.Bone);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    const headMat = this.materials[groups.indexOf(style.parts.head ?? 'skin')];
    this.face = opts.face !== false && headMat ? new FaceRig(palette, headMat) : null;
    if (this.face) (this.bones[BONE_INDEX.head] as THREE.Bone).add(this.face.mesh);
    this.fxMaterials = [...this.materials as THREE.MeshStandardMaterial[], ...(this.face?.ownMaterials ?? [])];
    this.baseColors = this.fxMaterials.map((m) => m.color.clone());
    this.baseEmissive = this.fxMaterials.map((m) => m.emissive.clone());
  }

  applyPose(pose: Pose): void {
    for (let i = 0; i < this.defs.length; i++) {
      const b = this.bones[i] as THREE.Bone;
      const d = this.defs[i] as BoneDef;
      b.quaternion.copy(pose.rots[i] as THREE.Quaternion);
      if (i === 0) b.position.set(d.offset[0] + pose.root.x, d.offset[1] + pose.root.y, d.offset[2] + pose.root.z);
    }
  }

  /**
   * Step the spring chains after `applyPose` (and after the parent group's
   * transform is set). `timeScale` < 1 slows them during hit-stop.
   */
  updateSprings(dtMs: number, timeScale = 1, holdBreeze = false): void {
    if (this.springs.chains.length === 0) return;
    if (!holdBreeze) this.springTime += dtMs;
    const t = this.springTime * 0.001;
    const u = this.springUpdate;
    u.timeScale = timeScale;
    u.windX = 0.35 * Math.sin(t * 1.1 + this.springPhase);
    u.windZ = 0.25 * Math.sin(t * 1.7 + this.springPhase * 1.3);
    this.group.updateWorldMatrix(true, true);
    this.springs.update(dtMs, this.bones, u);
  }

  /** Fling the spring chains (world-space m/s), e.g. on a hit. */
  springImpulse(x: number, y: number, z: number): void {
    this.springs.impulse(x, y, z);
  }

  triggerFlash(strength: number): void {
    this.flash = Math.max(this.flash, 0.45 + strength * 0.2);
  }

  /** Per-frame material effects: hit flash, KO dim, guard tint. */
  updateEffects(dtMs: number, dim: boolean, guard: boolean): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dtMs / 110);
    for (let i = 0; i < this.fxMaterials.length; i++) {
      const m = this.fxMaterials[i] as THREE.MeshStandardMaterial;
      m.color.copy(this.baseColors[i] as THREE.Color);
      if (guard) m.color.lerp(this.white, 0.12);
      if (dim) m.color.multiplyScalar(0.6);
      m.emissive.copy(this.baseEmissive[i] as THREE.Color);
      if (this.flash > 0) m.emissive.lerp(this.white, Math.min(1, this.flash) * 0.8);
    }
  }

  /** Morph influences for the face (see FaceController.FACE); no-op without a face. */
  setFaceWeights(w: ArrayLike<number>): void {
    this.face?.setWeights(w);
  }

  /** World position of a bone joint (for VFX attachment). */
  bonePosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    return (this.bones[index] as THREE.Bone).getWorldPosition(out);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.face?.dispose();
  }
}
