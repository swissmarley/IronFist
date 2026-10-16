import * as THREE from 'three/webgpu';
import { ParticlePool, PARTICLE_STYLES, STRIDE, splitBudget, type ParticleStyle, type SpawnParams } from './ParticlePool';
import { InstancedBatch, makeBatchMesh, unitQuad } from './InstancedBatch';
import { PARTICLE_ATTRIBUTES, debrisGeometry, debrisMaterial, dustMaterial, glowMaterial, sparkMaterial } from './ParticleMaterials';

export { PARTICLE_STYLES, splitBudget, type ParticleStyle } from './ParticlePool';

const RENDER_ORDER: Record<ParticleStyle, number> = { debris: 0, dust: 10, spark: 20, glow: 21 };

interface StyleBatch {
  pool: ParticlePool;
  batch: InstancedBatch;
  mesh: THREE.Mesh;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
}

/**
 * Pooled particle renderer: one instanced draw per style, CPU-integrated,
 * uploaded once per frame. Zero allocations after construction (until
 * `setCapacity` rebuilds the buffers).
 */
export class ParticleSystem {
  readonly group = new THREE.Group();
  private batches!: Record<ParticleStyle, StyleBatch>;
  private dustCameraPos!: THREE.Vector3;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, maxParticles: number) {
    this.scene = scene;
    this.group.name = 'vfx-particles';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this.build(maxParticles);
  }

  private build(maxParticles: number): void {
    const caps = splitBudget(maxParticles);
    const dust = dustMaterial();
    this.dustCameraPos = dust.cameraPos;
    const debrisGeo = debrisGeometry();
    const make = (style: ParticleStyle, geometry: THREE.BufferGeometry, material: THREE.Material): StyleBatch => {
      const pool = new ParticlePool(caps[style]);
      // the batch uploads straight out of the pool's array: no per-frame copy
      const batch = new InstancedBatch(geometry, pool.capacity, PARTICLE_ATTRIBUTES, STRIDE, pool.data);
      const mesh = makeBatchMesh(batch, material, RENDER_ORDER[style]);
      mesh.name = `vfx-${style}`;
      this.group.add(mesh);
      return { pool, batch, mesh, material, geometry };
    };
    this.batches = {
      spark: make('spark', unitQuad(), sparkMaterial()),
      dust: make('dust', unitQuad(), dust.material),
      debris: make('debris', debrisGeo, debrisMaterial()),
      glow: make('glow', unitQuad(), glowMaterial()),
    };
  }

  pool(style: ParticleStyle): ParticlePool { return this.batches[style].pool; }

  spawn(style: ParticleStyle, p: SpawnParams): void { this.batches[style].pool.spawn(p); }

  /** Total live particles across styles. */
  get liveCount(): number {
    let n = 0;
    for (const s of PARTICLE_STYLES) n += this.batches[s].pool.count;
    return n;
  }

  /** Sum of per-style capacities. */
  get capacity(): number {
    let n = 0;
    for (const s of PARTICLE_STYLES) n += this.batches[s].pool.capacity;
    return n;
  }

  /** Integrate and upload. `dtMs` is clamped so a stalled tab cannot explode velocities. */
  update(dtMs: number, cameraPosition: THREE.Vector3): void {
    const dt = Math.min(0.1, Math.max(0, dtMs) * 0.001);
    this.dustCameraPos.copy(cameraPosition);
    for (const s of PARTICLE_STYLES) {
      const b = this.batches[s];
      b.pool.update(dt);
      b.batch.upload(b.pool.count);
    }
  }

  /** Kill all particles immediately (round transitions). */
  clear(): void {
    for (const s of PARTICLE_STYLES) { this.batches[s].pool.clear(); this.batches[s].batch.upload(0); }
  }

  /** Rebuild pools and GPU buffers for a new quality budget. Live particles are dropped. */
  setCapacity(maxParticles: number): void {
    this.destroyBatches();
    this.build(maxParticles);
  }

  dispose(): void {
    this.destroyBatches();
    this.scene.remove(this.group);
  }

  private destroyBatches(): void {
    for (const s of PARTICLE_STYLES) {
      const b = this.batches[s];
      this.group.remove(b.mesh);
      b.batch.dispose();
      b.material.dispose();
      if (s === 'debris') b.geometry.dispose();
    }
  }
}
