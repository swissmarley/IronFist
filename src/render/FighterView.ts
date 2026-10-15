import * as THREE from 'three/webgpu';
import type { FighterState } from '@/sim/fighterState';
import { FState } from '@/sim/fighterState';
import { FX_ONE } from '@/core/fixed';

const MM = 0.001;

/**
 * Grey-box fighter visual. Reads the interpolated sim state each render frame.
 * The capsule squashes for crouch, tilts for hit-stun and lies flat when grounded.
 */
export class FighterView {
  readonly group: THREE.Group;
  private readonly body: THREE.Mesh;
  private readonly nose: THREE.Mesh;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly baseColor: THREE.Color;
  private flash = 0;
  private yaw = 0;

  constructor(group: THREE.Group, color: number) {
    this.group = group;
    this.body = group.children[0] as THREE.Mesh;
    this.nose = group.children[1] as THREE.Mesh;
    this.mat = this.body.material as THREE.MeshStandardMaterial;
    this.baseColor = new THREE.Color(color);
  }

  /** Called from the sim event consumer to flash on hit. */
  triggerFlash(strength: number): void {
    this.flash = Math.max(this.flash, 0.5 + strength * 0.2);
  }

  update(f: FighterState, alpha: number, dtMs: number): void {
    const x = (f.px + (f.x - f.px) * alpha) * MM;
    const y = (f.py + (f.y - f.py) * alpha) * MM;
    const z = (f.pz + (f.z - f.pz) * alpha) * MM;
    this.group.position.set(x, y, z);
    const fx = f.pfx + (f.fx - f.pfx) * alpha;
    const fz = f.pfz + (f.fz - f.pfz) * alpha;
    const targetYaw = Math.atan2(fx / FX_ONE, fz / FX_ONE);
    // shortest-path smoothing so quick realigns don't spin the mesh
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dtMs / 40);
    this.group.rotation.y = this.yaw;

    // pose
    const crouch = f.crouching === 1 || f.state === FState.Crouch || f.state === FState.CrouchDash;
    const lying = f.state === FState.Lying || f.state === FState.Getup;
    const targetScaleY = lying ? 0.35 : crouch ? 0.66 : 1;
    this.body.scale.y += (targetScaleY - this.body.scale.y) * Math.min(1, dtMs / 50);
    this.body.position.y = 0.95 * this.body.scale.y;
    this.nose.visible = !lying;
    this.nose.position.y = 1.45 * this.body.scale.y;
    // lean: attacking leans forward, hit-stun leans back
    let lean = 0;
    if (f.state === FState.Attack) lean = 0.12;
    else if (f.state === FState.Hitstun || f.state === FState.Stagger) lean = -0.22;
    else if (f.state === FState.Blockstun) lean = -0.08;
    else if (f.state === FState.Air) lean = -0.9;
    this.body.rotation.x += (lean - this.body.rotation.x) * Math.min(1, dtMs / 40);

    // colour: flash on hit, dim when KO
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dtMs / 120);
    const c = this.mat.color;
    c.copy(this.baseColor);
    if (f.state === FState.Blockstun) c.lerp(new THREE.Color(0xffffff), 0.25);
    if (this.flash > 0) c.lerp(new THREE.Color(0xffffff), Math.min(1, this.flash));
    if (f.ko) c.multiplyScalar(0.5);
    this.mat.emissive.setRGB(this.flash * 0.6, this.flash * 0.6, this.flash * 0.6);
  }
}
