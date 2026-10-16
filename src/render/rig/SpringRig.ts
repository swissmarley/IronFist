import * as THREE from 'three/webgpu';
import { BONE_INDEX, type BoneDef } from '@/anim/skeleton';
import { addSkin, alignToAxis, ellipsoid, restJointPositions, taperedCapsule, type ExtraRigPart } from './RigGeometry';
import { SpringChain, SpringColliders } from './SpringBones';
import { colliderMaskOf, paramsOf, SPRING_COLLIDERS, type SpringChainSpec, type SpringSetup } from './springPresets';

interface ChainRuntime {
  spec: SpringChainSpec;
  chain: SpringChain;
  parent: number;
  /** One bone per segment; bones[0] is parented to the rig bone. */
  bones: THREE.Bone[];
  restDir: THREE.Vector3;
  /** Rest position of every particle in the parent bone's frame (stride 3). */
  local: Float32Array;
  whip: number;
}

export interface SpringUpdate {
  /** < 1 slows the chains (hit-stop). */
  timeScale: number;
  /** Small world-space breeze (m/s²) for idle life. */
  windX: number;
  windZ: number;
}

/** Collider radii/extents (m) relative to the rig bones (the head/hip shells are not height-scaled). */
const HEAD_R = 0.09;
const CHEST_R = 0.12;
const HIPS_R = 0.1;
const LEG_COLLIDERS = [[3, 'upperLegL'], [4, 'upperLegR']] as const;

/**
 * Render-side owner of a fighter's spring chains: builds the extra bones that
 * are appended to the rig skeleton and their skinned geometry, then each frame
 * reads the posed rig bones, steps the solver in world space and writes the
 * chain bones' local rotations. Allocation-free per frame.
 */
export class SpringRig {
  readonly chains: ChainRuntime[] = [];
  /** All chain bones in skinning order (appended after the humanoid bones). */
  readonly bones: THREE.Bone[] = [];
  readonly parts: ExtraRigPart[] = [];
  private readonly colliders = new SpringColliders(SPRING_COLLIDERS.length);
  private readonly defs: BoneDef[];
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly wq = new THREE.Quaternion();
  private readonly inv = new THREE.Quaternion();
  private readonly q = new THREE.Quaternion();
  private readonly sc = new THREE.Vector3();

  /**
   * @param firstBone skin index of the first chain bone (= humanoid bone count)
   * @param maxSegments per-chain segment cap (quality tier; potato = 1)
   */
  constructor(defs: BoneDef[], setup: SpringSetup, firstBone: number, maxSegments = 8) {
    this.defs = defs;
    const rest = restJointPositions(defs);
    let boneIdx = firstBone;
    for (const spec of setup.chains) {
      const segments = Math.max(1, Math.min(spec.segments, maxSegments));
      const chain = new SpringChain(segments, spec.length, paramsOf(spec), colliderMaskOf(spec));
      const restDir = new THREE.Vector3(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
      const local = new Float32Array((segments + 1) * 3);
      for (let i = 0; i <= segments; i++) {
        local[i * 3] = spec.offset[0] + restDir.x * chain.segLen * i;
        local[i * 3 + 1] = spec.offset[1] + restDir.y * chain.segLen * i;
        local[i * 3 + 2] = spec.offset[2] + restDir.z * chain.segLen * i;
      }
      const parent = BONE_INDEX[spec.parent];
      const p = rest[parent] as [number, number, number];
      const bones: THREE.Bone[] = [];
      for (let i = 0; i < segments; i++) {
        const b = new THREE.Bone();
        b.name = `${spec.name}${i}`;
        if (i === 0) b.position.set(spec.offset[0], spec.offset[1], spec.offset[2]);
        else { b.position.copy(restDir).multiplyScalar(chain.segLen); (bones[i - 1] as THREE.Bone).add(b); }
        bones.push(b);
        this.bones.push(b);
        this.parts.push({ slot: spec.material, geometry: segmentGeometry(spec, i, segments, chain.segLen, restDir, p, local, boneIdx) });
        boneIdx++;
      }
      this.chains.push({ spec, chain, parent, bones, restDir, local, whip: spec.whip ?? 1 });
    }
    if (setup.dressing.beltBand) this.parts.push(...beltDressing(setup.chains, rest[BONE_INDEX.hips] as [number, number, number]));
  }

  /** Parent each chain's first bone to its rig bone (call before binding the skeleton). */
  attach(rigBones: readonly THREE.Bone[]): void {
    for (const c of this.chains) (rigBones[c.parent] as THREE.Bone).add(c.bones[0] as THREE.Bone);
  }

  /** Snap all chains to rest on the next update. */
  reset(): void {
    for (const c of this.chains) c.chain.invalidate();
  }

  /** Fling the chains (m/s, world space); hair whips harder than cloth. */
  impulse(x: number, y: number, z: number): void {
    for (const c of this.chains) c.chain.impulse(x * c.whip, y * c.whip, z * c.whip);
  }

  /** Step the chains. Rig bone world matrices must already reflect this frame's pose. */
  update(dtMs: number, rigBones: readonly THREE.Bone[], u: SpringUpdate): void {
    if (this.chains.length === 0) return;
    this.updateColliders(rigBones);
    const dt = dtMs / 1000;
    for (const c of this.chains) {
      const m = (rigBones[c.parent] as THREE.Bone).matrixWorld;
      const t = c.chain.target;
      for (let i = 0; i < c.chain.count; i++) {
        this.v.set(c.local[i * 3] as number, c.local[i * 3 + 1] as number, c.local[i * 3 + 2] as number).applyMatrix4(m);
        t[i * 3] = this.v.x; t[i * 3 + 1] = this.v.y; t[i * 3 + 2] = this.v.z;
      }
      c.chain.step(dt, this.colliders, u.windX, 0, u.windZ, u.timeScale);
      this.writeBones(c, m);
    }
  }

  private writeBones(c: ChainRuntime, parentWorld: THREE.Matrix4): void {
    parentWorld.decompose(this.w, this.wq, this.sc);
    const P = c.chain.pos;
    for (let i = 0; i < c.bones.length; i++) {
      const o = i * 3;
      this.d.set((P[o + 3] as number) - (P[o] as number), (P[o + 4] as number) - (P[o + 1] as number), (P[o + 5] as number) - (P[o + 2] as number));
      const bone = c.bones[i] as THREE.Bone;
      if (this.d.lengthSq() < 1e-12) { bone.quaternion.identity(); continue; }
      this.d.normalize().applyQuaternion(this.inv.copy(this.wq).invert());
      this.q.setFromUnitVectors(c.restDir, this.d);
      bone.quaternion.copy(this.q);
      this.wq.multiply(this.q);
    }
  }

  private updateColliders(bones: readonly THREE.Bone[]): void {
    const defs = this.defs;
    const head = (bones[BONE_INDEX.head] as THREE.Bone).matrixWorld;
    this.capsule(0, head, 0, 0.075, -0.005, 0, 0.145, -0.005, HEAD_R);
    const chest = (bones[BONE_INDEX.chest] as THREE.Bone).matrixWorld;
    const neckY = (defs[BONE_INDEX.neck] as BoneDef).offset[1];
    this.capsule(1, chest, 0, 0.06, -0.01, 0, neckY - 0.03, -0.01, CHEST_R);
    const hips = (bones[BONE_INDEX.hips] as THREE.Bone).matrixWorld;
    this.capsule(2, hips, 0, -0.03, 0, 0, 0.09, 0, HIPS_R);
    for (const [slot, name] of LEG_COLLIDERS) {
      const d = defs[BONE_INDEX[name]] as BoneDef;
      const m = (bones[BONE_INDEX[name]] as THREE.Bone).matrixWorld;
      this.capsule(slot, m, 0, 0, 0, d.axis[0] * d.length, d.axis[1] * d.length, d.axis[2] * d.length, d.radius * 0.95);
    }
  }

  private capsule(i: number, m: THREE.Matrix4, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): void {
    this.v.set(ax, ay, az).applyMatrix4(m);
    this.w.set(bx, by, bz).applyMatrix4(m);
    this.colliders.set(i, this.v.x, this.v.y, this.v.z, this.w.x, this.w.y, this.w.z, r);
  }
}

/** One chain segment at its rest pose, rigidly skinned to its bone. */
function segmentGeometry(spec: SpringChainSpec, i: number, segments: number, segLen: number, dir: THREE.Vector3,
  parentRest: [number, number, number], local: Float32Array, boneIdx: number): THREE.BufferGeometry {
  const tip = spec.tipRadius ?? spec.radius * 0.45;
  const r0 = spec.radius + (tip - spec.radius) * (i / segments);
  const r1 = spec.radius + (tip - spec.radius) * ((i + 1) / segments);
  const g = taperedCapsule(segLen, r0, r1, spec.shape === 'ribbon' ? 10 : 8);
  if (spec.shape === 'ribbon') { g.scale(1, 1, spec.flat ?? 0.22); g.computeVertexNormals(); }
  alignToAxis(g, [dir.x, dir.y, dir.z]);
  g.translate(parentRest[0] + (local[i * 3] as number), parentRest[1] + (local[i * 3 + 1] as number), parentRest[2] + (local[i * 3 + 2] as number));
  addSkin(g, boneIdx);
  return g;
}

/** Belt band around the waist plus a knot where the belt tails start (skinned to the hips). */
function beltDressing(chains: readonly SpringChainSpec[], hipsRest: [number, number, number]): ExtraRigPart[] {
  const hipsIdx = BONE_INDEX.hips;
  const band = new THREE.TorusGeometry(1, 0.12, 6, 36);
  band.rotateX(Math.PI / 2);
  band.scale(0.172, 0.22, 0.124);
  band.translate(hipsRest[0], hipsRest[1] + 0.05, hipsRest[2] + 0.005);
  band.computeVertexNormals();
  addSkin(band, hipsIdx);
  const parts: ExtraRigPart[] = [{ slot: 'belt', geometry: band }];
  const tails = chains.filter((c) => c.parent === 'hips' && c.name.startsWith('belt'));
  if (tails.length > 0) {
    let x = 0, y = 0, z = 0;
    for (const t of tails) { x += t.offset[0]; y += t.offset[1]; z += t.offset[2]; }
    const knot = ellipsoid(0.03, 0.022, 0.016, 0, 0);
    knot.translate(hipsRest[0] + x / tails.length, hipsRest[1] + y / tails.length, hipsRest[2] + z / tails.length + 0.004);
    addSkin(knot, hipsIdx);
    parts.push({ slot: 'belt', geometry: knot });
  }
  return parts;
}
