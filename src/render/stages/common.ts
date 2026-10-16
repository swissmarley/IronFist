import * as THREE from 'three/webgpu';
import { attribute, fract, step, texture, time, uv, vec2 } from 'three/tsl';
import { InstancedBatch, makeBatchMesh, unitQuad } from '@/render/vfx/InstancedBatch';

/**
 * Shared stage building blocks: `Instancer` (one draw call per prop family),
 * CPU-driven `SpriteBatch` billboard layers, orbiting bird sprites and the
 * `Layer` interface for animated, disposable scene parts.
 */

export interface Layer { mesh: THREE.Mesh; update(dtMs: number): void; dispose(): void }

/** Fills an InstancedMesh from a list of placements; one draw call per family. */
export class Instancer {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly o = new THREE.Object3D();
  private readonly c = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly capacity: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
  }

  /** Position, scale, Euler rotation (radians) and an optional per-instance colour (`boost` > 1 pushes unlit props into HDR for bloom). */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, color?: number, boost = 1): number {
    if (this.n >= this.capacity) return -1;
    this.o.position.set(x, y, z);
    this.o.scale.set(sx, sy, sz);
    this.o.rotation.set(rx, ry, rz);
    this.o.updateMatrix();
    this.mesh.setMatrixAt(this.n, this.o.matrix);
    if (color !== undefined) this.mesh.setColorAt(this.n, this.c.setHex(color).multiplyScalar(boost));
    return this.n++;
  }

  /** Upload the instance buffers (call once after the last add). */
  finish(shadows = false): THREE.InstancedMesh {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = shadows;
    return this.mesh;
  }
}

/** Per-instance layout of a SpriteBatch: iPos = (x, y, z, phase), iMisc = (size, aspect, alpha, spare). */
export const SPRITE_STRIDE = 8;

function attr4(name: string) { return attribute(name, 'vec4'); }
export type Vec4Attribute = ReturnType<typeof attr4>;

export interface SpriteBatch {
  batch: InstancedBatch;
  mesh: THREE.Mesh;
  material: THREE.SpriteNodeMaterial;
  pos: Vec4Attribute;
  misc: Vec4Attribute;
}

/**
 * A CPU-driven billboard layer: the caller writes `batch.data` (SPRITE_STRIDE
 * floats per sprite) in update() and calls `batch.upload(n)`. The material's
 * colour/opacity nodes are left to the caller.
 */
export function makeSpriteBatch(capacity: number, renderOrder = 5): SpriteBatch {
  const batch = new InstancedBatch(unitQuad(), capacity, [{ name: 'iPos', size: 4 }, { name: 'iMisc', size: 4 }], SPRITE_STRIDE);
  const pos = attr4('iPos');
  const misc = attr4('iMisc');
  const material = new THREE.SpriteNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.positionNode = pos.xyz;
  material.scaleNode = vec2(misc.x, misc.x.mul(misc.y));
  const mesh = makeBatchMesh(batch, material, renderOrder);
  return { batch, mesh, material, pos, misc };
}

export interface Gulls { sprites: SpriteBatch; update(dtMs: number): void }

/** Gulls (or buzzards): billboards on slow elliptical orbits with a two-frame flap. */
export function makeBirds(count: number, sheet: THREE.Texture | null, centres: [number, number, number][], radius: number, size: number, flapHz: number, rnd: () => number): Gulls {
  const sprites = makeSpriteBatch(count, 6);
  const m = sprites.material;
  const frame = step(0.5, fract(time.mul(flapHz).add(sprites.pos.w)));
  const u = vec2(uv().x.mul(0.5).add(frame.mul(0.5)), uv().y);
  if (sheet) {
    const tex = texture(sheet, u);
    m.colorNode = tex.rgb;
    m.opacityNode = tex.a.mul(sprites.misc.z);
  }
  m.alphaTest = 0.15;
  m.fog = true;
  const d = sprites.batch.data;
  const state = new Float32Array(count * 4); // angle, speed, radius, bob phase
  for (let i = 0; i < count; i++) {
    state[i * 4] = rnd() * Math.PI * 2;
    state[i * 4 + 1] = (0.12 + rnd() * 0.14) * (rnd() > 0.5 ? 1 : -1);
    state[i * 4 + 2] = radius * (0.6 + rnd() * 0.8);
    state[i * 4 + 3] = rnd() * 7;
    d[i * SPRITE_STRIDE + 3] = rnd();
    d[i * SPRITE_STRIDE + 4] = size * (0.8 + rnd() * 0.5);
    d[i * SPRITE_STRIDE + 5] = 0.55;
    d[i * SPRITE_STRIDE + 6] = 1;
  }
  let t = 0;
  return {
    sprites,
    update(dtMs: number): void {
      t += dtMs * 0.001;
      for (let i = 0; i < count; i++) {
        const c = centres[i % centres.length] ?? [0, 10, 0];
        const a = state[i * 4] as number + t * (state[i * 4 + 1] as number);
        const r = state[i * 4 + 2] as number;
        const o = i * SPRITE_STRIDE;
        d[o] = c[0] + Math.cos(a) * r;
        d[o + 1] = c[1] + Math.sin(t * 0.5 + (state[i * 4 + 3] as number)) * 0.6;
        d[o + 2] = c[2] + Math.sin(a) * r * 0.7;
      }
      sprites.batch.upload(count);
    },
  };
}

/** A stage part with a per-frame update (t in seconds) and cleanup. */
export interface Part {
  object: THREE.Object3D;
  update(t: number, dt: number): void;
  dispose(): void;
}

/** Concatenate non-indexed geometries (position/normal/uv) into one BufferGeometry. */
export function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const attrs = ['position', 'normal', 'uv'] as const;
  const out = new THREE.BufferGeometry();
  for (const name of attrs) {
    const size = name === 'uv' ? 2 : 3;
    let total = 0;
    for (const p of parts) total += p.getAttribute(name).count;
    const data = new Float32Array(total * size);
    let off = 0;
    for (const p of parts) {
      const a = p.getAttribute(name);
      data.set(a.array as Float32Array, off);
      off += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  for (const p of parts) if (!geos.includes(p)) p.dispose();
  return out;
}
