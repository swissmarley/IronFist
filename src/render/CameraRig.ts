import * as THREE from 'three/webgpu';
import type { FighterState } from '@/sim/fighterState';

const MM = 0.001;

/**
 * Side-on fighting camera. Keeps P1 on screen-left by always sitting on the
 * same side of the line between the fighters, zooms with their separation and
 * adds punch/shake impulses from hit events.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3(0, 1.6, 7);
  private target = new THREE.Vector3(0, 1, 0);
  private shake = 0;
  private punch = 0;
  private seed = 0;
  reduceMotion = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  addShake(amount: number): void {
    if (this.reduceMotion) amount *= 0.25;
    this.shake = Math.min(1, this.shake + amount);
  }

  addPunch(amount: number): void {
    this.punch = Math.min(1, this.punch + amount);
  }

  update(a: FighterState, b: FighterState, alpha: number, dtMs: number, slowmo = false): void {
    const ax = (a.px + (a.x - a.px) * alpha) * MM, az = (a.pz + (a.z - a.pz) * alpha) * MM;
    const bx = (b.px + (b.x - b.px) * alpha) * MM, bz = (b.pz + (b.z - b.pz) * alpha) * MM;
    const ay = (a.py + (a.y - a.py) * alpha) * MM, by = (b.py + (b.y - b.py) * alpha) * MM;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    let lx = bx - ax, lz = bz - az;
    const len = Math.hypot(lx, lz);
    if (len < 1e-4) { lx = 1; lz = 0; } else { lx /= len; lz /= len; }
    // camera normal N = (-Lz, Lx): P1 ends up on screen-left
    const nx = -lz, nz = lx;
    const dist = 5.8 + Math.max(0, len - 1.6) * 0.95 - this.punch * 0.5;
    const height = 1.25 + Math.max(ay, by) * 0.35 + Math.max(0, len - 2.5) * 0.12;
    const desired = new THREE.Vector3(mx + nx * dist, height, mz + nz * dist);
    const desiredTarget = new THREE.Vector3(mx, 1.12 + Math.max(ay, by) * 0.4, mz);
    const k = slowmo ? 0.08 : 1 - Math.exp(-dtMs / 110);
    this.pos.lerp(desired, k);
    this.target.lerp(desiredTarget, k * 1.2);

    // shake / punch decay
    this.shake *= Math.exp(-dtMs / 90);
    this.punch *= Math.exp(-dtMs / 140);
    this.seed += dtMs * 0.05;
    const sx = Math.sin(this.seed * 1.7) * this.shake * 0.06;
    const sy = Math.cos(this.seed * 2.3) * this.shake * 0.045;

    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.target.x + sx, this.target.y + sy, this.target.z);
    const fovTarget = 30 - this.punch * 4;
    this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dtMs / 60);
    this.camera.updateProjectionMatrix();
  }
}
