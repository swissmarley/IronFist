import type * as THREE from 'three/webgpu';
import { EvType, type SimEvent } from '@/sim/events';
import { ParticleSystem } from './ParticleSystem';
import { ImpactFlash, ShockwaveRing } from './ImpactFlash';
import { VfxRng } from './ParticlePool';
import { blockSparks, counterBurst, debrisBurst, dustPuff, hitSparks, koBurst, launchRing, type VfxTargets } from './Emitters';

export interface VfxManagerOptions {
  /** Total particle budget (quality tier: 500 .. 20000). */
  maxParticles: number;
  /** Accessibility: dim impact flashes and rings. */
  reducedFlash?: boolean;
}

const MM = 0.001;

/**
 * Owns the particle system, flashes and rings for one scene and maps sim
 * events (integer millimetres) onto VFX presets (metres). `dirX/dirZ` is the
 * attacker -> defender direction for the event (Q12 or any scale; only the
 * direction is used).
 */
export class VfxManager {
  readonly particles: ParticleSystem;
  readonly flashes: ImpactFlash;
  readonly rings: ShockwaveRing;
  readonly rng = new VfxRng();
  private readonly t: VfxTargets;
  private readonly point = { x: 0, y: 0, z: 0 };
  private readonly dir = { x: 0, y: 0, z: 1 };
  private reduced: boolean;
  private maxParticles: number;

  constructor(scene: THREE.Scene, opts: VfxManagerOptions) {
    this.maxParticles = opts.maxParticles;
    this.reduced = opts.reducedFlash === true;
    this.particles = new ParticleSystem(scene, opts.maxParticles);
    this.flashes = new ImpactFlash(scene);
    this.rings = new ShockwaveRing(scene);
    this.flashes.setReduced(this.reduced);
    this.rings.setReduced(this.reduced);
    this.t = { particles: this.particles, flashes: this.flashes, rings: this.rings, rng: this.rng };
  }

  get reducedFlash(): boolean { return this.reduced; }
  get budget(): number { return this.maxParticles; }

  /** Deterministic sequences for screenshots / tests. */
  reseed(seed: number): void { this.rng.reseed(seed); }

  onSimEvent(e: SimEvent, dirX: number, dirZ: number): void {
    const p = this.point;
    p.x = e.x * MM; p.y = e.y * MM; p.z = e.z * MM;
    const d = this.dir;
    d.x = dirX; d.z = dirZ;
    const t = this.t;
    switch (e.type) {
      case EvType.Hit:
        hitSparks(t, p, d, e.strength);
        this.flashes.spawn(p.x, p.y, p.z, e.strength, 'hit', this.rng.next());
        if (e.strength >= 2) this.rings.spawn(p.x, p.y, p.z, 'heavy', d.x, d.z, 0.6 + e.strength * 0.2);
        break;
      case EvType.Counter:
        hitSparks(t, p, d, Math.max(1, e.strength));
        counterBurst(t, p);
        this.flashes.spawn(p.x, p.y, p.z, Math.max(2, e.strength), 'counter', this.rng.next());
        this.rings.spawn(p.x, p.y, p.z, 'heavy', d.x, d.z, 1);
        break;
      case EvType.Block:
        blockSparks(t, p, d);
        this.flashes.spawn(p.x, p.y, p.z, 0.5 + e.strength * 0.4, 'block', this.rng.next());
        break;
      case EvType.Parry:
        blockSparks(t, p, d);
        counterBurst(t, p);
        this.flashes.spawn(p.x, p.y, p.z, 2.5, 'block', this.rng.next());
        break;
      case EvType.Armour:
        blockSparks(t, p, d);
        this.flashes.spawn(p.x, p.y, p.z, 1.5, 'hit', this.rng.next());
        break;
      case EvType.Launch:
        launchRing(t, p);
        break;
      case EvType.Land:
        // strength: 0 jump landing, 1-2 knockdown, 3+ oki variants
        dustPuff(t, p, e.strength <= 0 ? 0.5 : 0.7 + Math.min(3, e.strength) * 0.3);
        break;
      case EvType.Jump:
        dustPuff(t, p, 0.45);
        break;
      case EvType.Step:
        dustPuff(t, p, 0.35, d);
        break;
      case EvType.Dash:
        dustPuff(t, p, 0.55, d);
        break;
      case EvType.Wall:
        debrisBurst(t, p, d);
        this.flashes.spawn(p.x, p.y, p.z, 1 + e.strength * 0.5, 'hit', this.rng.next());
        this.rings.spawn(p.x, p.y, p.z, 'wall', d.x, d.z, 0.7 + e.strength * 0.3);
        break;
      case EvType.Throw:
        dustPuff(t, { x: p.x, y: 0, z: p.z }, 0.8);
        this.flashes.spawn(p.x, p.y, p.z, 1.5, 'hit', this.rng.next());
        break;
      case EvType.ThrowBreak:
        this.flashes.spawn(p.x, p.y, p.z, 1.5, 'block', this.rng.next());
        blockSparks(t, p, d);
        break;
      case EvType.KO:
        koBurst(t, p);
        this.flashes.spawn(p.x, Math.max(0.6, p.y), p.z, 3, 'ko', this.rng.next());
        break;
      case EvType.RingOut:
        dustPuff(t, { x: p.x, y: 0, z: p.z }, 1.2);
        this.rings.spawn(p.x, 0, p.z, 'launch');
        break;
      case EvType.RoundStart:
        this.clear();
        break;
      default:
        break;
    }
  }

  /** Advance every effect; call once per rendered frame before `renderer.render`. */
  update(dtMs: number, cameraPosition: THREE.Vector3): void {
    this.particles.update(dtMs, cameraPosition);
    this.flashes.update(dtMs);
    this.rings.update(dtMs);
  }

  /** Change the particle budget (quality tier). Live particles are dropped. */
  setQuality(maxParticles: number): void {
    if (maxParticles === this.maxParticles) return;
    this.maxParticles = maxParticles;
    this.particles.setCapacity(maxParticles);
  }

  setReducedFlash(reduced: boolean): void {
    this.reduced = reduced;
    this.flashes.setReduced(reduced);
    this.rings.setReduced(reduced);
  }

  /** Kill everything immediately (round transitions, mode changes). */
  clear(): void {
    this.particles.clear();
    this.flashes.clear();
    this.rings.clear();
  }

  dispose(): void {
    this.particles.dispose();
    this.flashes.dispose();
    this.rings.dispose();
  }
}
