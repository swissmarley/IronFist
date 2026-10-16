import * as THREE from 'three/webgpu';
import { abs, attribute, float, length, mix, oneMinus, positionGeometry, saturate, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl';
import { InstancedBatch, makeBatchMesh, unitQuad } from './InstancedBatch';

export type FlashKind = 'hit' | 'block' | 'counter' | 'ko';
export type RingKind = 'heavy' | 'launch' | 'wall' | 'ko';

/** Flash colours: hit lerps white -> orange with strength; others fixed. */
const FLASH_COLOR: Record<FlashKind, [number, number, number]> = {
  hit: [1, 0.95, 0.85], block: [0.6, 0.8, 1], counter: [1, 0.9, 0.3], ko: [1, 0.25, 0.15],
};
const HIT_HEAVY: [number, number, number] = [1, 0.55, 0.2];
const REDUCED_DIM = 0.35;

const FLASH_STRIDE = 12; // fPosSize(4) fColorT(4) fMisc(4: rot, intensity, -, -)
const FLASH_ATTRS = [{ name: 'fPosSize', size: 4 }, { name: 'fColorT', size: 4 }, { name: 'fMisc', size: 4 }];

function additive(m: THREE.NodeMaterial): void {
  m.transparent = true; m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.fog = false; m.side = THREE.DoubleSide;
}

/**
 * Short-lived additive billboard flashes (80-150 ms, scaled by hit strength 0..3).
 * A bright core plus a 4-point star, expanding slightly while it fades.
 */
export class ImpactFlash {
  readonly mesh: THREE.Mesh;
  private readonly batch: InstancedBatch;
  private readonly material: THREE.SpriteNodeMaterial;
  private readonly dim = uniform(1);
  private readonly age: Float32Array;
  private readonly lifeInv: Float32Array;
  private readonly baseSize: Float32Array;
  private count = 0;
  private cursor = 0;

  constructor(scene: THREE.Scene, capacity = 16) {
    this.batch = new InstancedBatch(unitQuad(), capacity, FLASH_ATTRS, FLASH_STRIDE);
    this.age = new Float32Array(this.batch.capacity);
    this.lifeInv = new Float32Array(this.batch.capacity);
    this.baseSize = new Float32Array(this.batch.capacity);
    this.material = this.makeMaterial();
    this.mesh = makeBatchMesh(this.batch, this.material, 30);
    this.mesh.name = 'vfx-flash';
    scene.add(this.mesh);
  }

  private makeMaterial(): THREE.SpriteNodeMaterial {
    const posSize = attribute('fPosSize', 'vec4');
    const colorT = attribute('fColorT', 'vec4');
    const misc = attribute('fMisc', 'vec4');
    const m = new THREE.SpriteNodeMaterial();
    additive(m);
    const t = colorT.w;
    m.positionNode = posSize.xyz;
    m.rotationNode = misc.x;
    const s = posSize.w.mul(t.mul(0.6).add(1));
    m.scaleNode = vec2(s, s);
    const p = uv().sub(0.5).mul(2);
    const d = length(p);
    const core = saturate(oneMinus(d.mul(1.5)));
    const sx = saturate(oneMinus(abs(p.y).mul(7))).mul(saturate(oneMinus(abs(p.x))));
    const sy = saturate(oneMinus(abs(p.x).mul(7))).mul(saturate(oneMinus(abs(p.y))));
    const star = sx.mul(sx).add(sy.mul(sy)).mul(0.8);
    const fadeT = oneMinus(t);
    const intensity = core.mul(core).mul(2).add(star).mul(fadeT.mul(fadeT)).mul(misc.y).mul(this.dim);
    m.colorNode = colorT.xyz.mul(intensity);
    m.opacityNode = saturate(intensity);
    return m;
  }

  /** Accessibility: dim all flashes. */
  setReduced(reduced: boolean): void { this.dim.value = reduced ? REDUCED_DIM : 1; }

  get live(): number { return this.count; }

  /** Spawn a flash at a world position (metres). `strength` 0..3. */
  spawn(x: number, y: number, z: number, strength: number, kind: FlashKind, seed = 0): void {
    const s = Math.min(3, Math.max(0, strength));
    let i: number;
    if (this.count < this.batch.capacity) i = this.count++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.batch.capacity; }
    const d = this.batch.data;
    const o = i * FLASH_STRIDE;
    const base = FLASH_COLOR[kind];
    const k = kind === 'hit' ? s / 3 : 0;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = 0.22 + s * 0.18;
    d[o + 4] = base[0] + (HIT_HEAVY[0] - base[0]) * k;
    d[o + 5] = base[1] + (HIT_HEAVY[1] - base[1]) * k;
    d[o + 6] = base[2] + (HIT_HEAVY[2] - base[2]) * k;
    d[o + 7] = 0;
    d[o + 8] = seed * 6.2831853; d[o + 9] = 0.8 + s * 0.4; d[o + 10] = 0; d[o + 11] = 0;
    this.age[i] = 0;
    this.lifeInv[i] = 1 / (0.08 + s * 0.0233); // 80..150 ms
    this.baseSize[i] = d[o + 3] as number;
  }

  update(dtMs: number): void {
    const dt = Math.min(0.1, Math.max(0, dtMs) * 0.001);
    const d = this.batch.data;
    let i = 0;
    while (i < this.count) {
      const t = ((this.age[i] as number) + dt);
      const life = t * (this.lifeInv[i] as number);
      if (life >= 1) {
        const last = --this.count;
        if (i !== last) {
          d.copyWithin(i * FLASH_STRIDE, last * FLASH_STRIDE, last * FLASH_STRIDE + FLASH_STRIDE);
          this.age[i] = this.age[last] as number; this.lifeInv[i] = this.lifeInv[last] as number; this.baseSize[i] = this.baseSize[last] as number;
        }
        if (this.cursor >= this.count) this.cursor = 0;
        continue;
      }
      this.age[i] = t;
      d[i * FLASH_STRIDE + 7] = life;
      i++;
    }
    this.batch.upload(this.count);
  }

  clear(): void { this.count = 0; this.cursor = 0; this.batch.upload(0); }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.batch.dispose();
    this.material.dispose();
  }
}

const RING_STRIDE = 12; // rPosR(4: pos, radius) rColorT(4) rOrient(4: dirX, dirZ, vertical, thickness)
const RING_ATTRS = [{ name: 'rPosR', size: 4 }, { name: 'rColorT', size: 4 }, { name: 'rOrient', size: 4 }];

interface RingPreset { r0: number; r1: number; lifeMs: number; vertical: boolean; color: [number, number, number]; thickness: number }
const RING_PRESETS: Record<RingKind, RingPreset> = {
  heavy: { r0: 0.1, r1: 0.9, lifeMs: 220, vertical: true, color: [1, 0.8, 0.5], thickness: 0.25 },
  launch: { r0: 0.2, r1: 1.6, lifeMs: 380, vertical: false, color: [0.7, 0.85, 1], thickness: 0.22 },
  wall: { r0: 0.15, r1: 1.4, lifeMs: 300, vertical: true, color: [1, 0.7, 0.4], thickness: 0.2 },
  ko: { r0: 0.3, r1: 3.5, lifeMs: 700, vertical: false, color: [1, 0.35, 0.25], thickness: 0.18 },
};

/**
 * Expanding ring quads with fading alpha. Horizontal rings lie on the floor
 * (launches, KO); vertical rings face a direction (heavy hits, wall splats).
 */
export class ShockwaveRing {
  readonly mesh: THREE.Mesh;
  private readonly batch: InstancedBatch;
  private readonly material: THREE.MeshBasicNodeMaterial;
  private readonly age: Float32Array;
  private readonly lifeInv: Float32Array;
  private readonly r0: Float32Array;
  private readonly r1: Float32Array;
  private readonly dim = uniform(1);
  private count = 0;
  private cursor = 0;

  constructor(scene: THREE.Scene, capacity = 16) {
    this.batch = new InstancedBatch(unitQuad(), capacity, RING_ATTRS, RING_STRIDE);
    const n = this.batch.capacity;
    this.age = new Float32Array(n); this.lifeInv = new Float32Array(n); this.r0 = new Float32Array(n); this.r1 = new Float32Array(n);
    this.material = this.makeMaterial();
    this.mesh = makeBatchMesh(this.batch, this.material, 15);
    this.mesh.name = 'vfx-ring';
    scene.add(this.mesh);
  }

  private makeMaterial(): THREE.MeshBasicNodeMaterial {
    const posR = attribute('rPosR', 'vec4');
    const colorT = attribute('rColorT', 'vec4');
    const orient = attribute('rOrient', 'vec4');
    const m = new THREE.MeshBasicNodeMaterial();
    additive(m);
    const q = positionGeometry.xy.mul(posR.w.mul(2));
    const horizontal = vec3(q.x, 0, q.y);
    const right = vec3(orient.y, 0, orient.x.negate());
    const vertical = right.mul(q.x).add(vec3(0, q.y, 0));
    m.positionNode = mix(horizontal, vertical, orient.z).add(posR.xyz);
    const p = uv().sub(0.5).mul(2);
    const d = length(p);
    const band = oneMinus(smoothstep(float(0), orient.w, abs(d.sub(0.82))));
    const inner = saturate(d.div(0.82));
    const innerGlow = inner.mul(inner).mul(inner).mul(inner).mul(0.3).mul(oneMinus(smoothstep(float(0.82), float(1), d)));
    const fadeT = oneMinus(colorT.w);
    const a = band.add(innerGlow).mul(fadeT).mul(fadeT).mul(this.dim);
    m.colorNode = colorT.xyz.mul(a);
    m.opacityNode = saturate(a);
    return m;
  }

  setReduced(reduced: boolean): void { this.dim.value = reduced ? 0.5 : 1; }

  get live(): number { return this.count; }

  /** Spawn a ring. `dir` is the facing for vertical rings (XZ, need not be unit). */
  spawn(x: number, y: number, z: number, kind: RingKind, dirX = 0, dirZ = 1, scale = 1): void {
    const pr = RING_PRESETS[kind];
    let i: number;
    if (this.count < this.batch.capacity) i = this.count++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.batch.capacity; }
    const len = Math.hypot(dirX, dirZ) || 1;
    const d = this.batch.data;
    const o = i * RING_STRIDE;
    d[o] = x; d[o + 1] = pr.vertical ? y : y + 0.02; d[o + 2] = z; d[o + 3] = pr.r0 * scale;
    d[o + 4] = pr.color[0]; d[o + 5] = pr.color[1]; d[o + 6] = pr.color[2]; d[o + 7] = 0;
    d[o + 8] = dirX / len; d[o + 9] = dirZ / len; d[o + 10] = pr.vertical ? 1 : 0; d[o + 11] = pr.thickness;
    this.age[i] = 0; this.lifeInv[i] = 1000 / pr.lifeMs; this.r0[i] = pr.r0 * scale; this.r1[i] = pr.r1 * scale;
  }

  update(dtMs: number): void {
    const dt = Math.min(0.1, Math.max(0, dtMs) * 0.001);
    const d = this.batch.data;
    let i = 0;
    while (i < this.count) {
      const t = (this.age[i] as number) + dt;
      const life = t * (this.lifeInv[i] as number);
      if (life >= 1) {
        const last = --this.count;
        if (i !== last) {
          d.copyWithin(i * RING_STRIDE, last * RING_STRIDE, last * RING_STRIDE + RING_STRIDE);
          this.age[i] = this.age[last] as number; this.lifeInv[i] = this.lifeInv[last] as number;
          this.r0[i] = this.r0[last] as number; this.r1[i] = this.r1[last] as number;
        }
        if (this.cursor >= this.count) this.cursor = 0;
        continue;
      }
      this.age[i] = t;
      const e = 1 - (1 - life) * (1 - life); // ease-out expansion
      d[i * RING_STRIDE + 3] = (this.r0[i] as number) + ((this.r1[i] as number) - (this.r0[i] as number)) * e;
      d[i * RING_STRIDE + 7] = life;
      i++;
    }
    this.batch.upload(this.count);
  }

  clear(): void { this.count = 0; this.cursor = 0; this.batch.upload(0); }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.batch.dispose();
    this.material.dispose();
  }
}
