import * as THREE from 'three/webgpu';

export interface BatchAttribute { name: string; size: number }

/**
 * One instanced draw: a base geometry (quad / chunk) plus a single dynamic
 * `InstancedInterleavedBuffer` holding every per-instance attribute. The CPU
 * writes into `data` and calls `upload(count)` once per frame; only the live
 * prefix is uploaded (one update range, no per-frame allocation).
 */
export class InstancedBatch {
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly buffer: THREE.InstancedInterleavedBuffer;
  readonly data: Float32Array;
  readonly stride: number;
  readonly capacity: number;
  private readonly range = { start: 0, count: 0 };

  /** `data` may be an existing array (e.g. a ParticlePool's) so no per-frame copy is needed. */
  constructor(base: THREE.BufferGeometry, capacity: number, attrs: readonly BatchAttribute[], stride: number, data?: Float32Array) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.stride = stride;
    if (data && data.length < this.capacity * stride) throw new Error('InstancedBatch: data array too small');
    this.data = data ?? new Float32Array(this.capacity * stride);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, stride, 1);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.InstancedBufferGeometry();
    const idx = base.getIndex();
    if (idx) geo.setIndex(idx);
    for (const name of ['position', 'normal', 'uv']) {
      const a = base.getAttribute(name);
      if (a) geo.setAttribute(name, a);
    }
    let offset = 0;
    for (const a of attrs) {
      geo.setAttribute(a.name, new THREE.InterleavedBufferAttribute(this.buffer, a.size, offset));
      offset += a.size;
    }
    if (offset > stride) throw new Error(`InstancedBatch: attributes (${offset}) exceed stride (${stride})`);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
    this.geometry = geo;
  }

  /** Set the instance draw count and queue the live prefix for upload. */
  upload(count: number): void {
    const n = Math.min(count, this.capacity);
    this.geometry.instanceCount = n;
    if (n === 0) return;
    this.range.start = 0;
    this.range.count = n * this.stride;
    this.buffer.updateRanges.push(this.range);
    this.buffer.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** Build a mesh around a batch with the shared VFX render settings. */
export function makeBatchMesh(batch: InstancedBatch, material: THREE.Material, renderOrder: number): THREE.Mesh {
  const mesh = new THREE.Mesh(batch.geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = renderOrder;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Unit quad shared by every billboard batch. */
let quad: THREE.PlaneGeometry | null = null;
export function unitQuad(): THREE.PlaneGeometry {
  quad ??= new THREE.PlaneGeometry(1, 1);
  return quad;
}
