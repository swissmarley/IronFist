import * as THREE from 'three/webgpu';
import type { FighterState } from '@/sim/fighterState';
import { FState } from '@/sim/fighterState';
import type { CharacterRuntime } from '@/sim/character';
import { FX_ONE } from '@/core/fixed';
import { FighterAnimator } from '@/anim/FighterAnimator';
import { RigView, type RigOptions } from './rig/RigView';

const MM = 0.001;

/**
 * Fighter visual: a procedural skinned rig driven by the FighterAnimator.
 * Reads the interpolated sim state each render frame; never writes to the sim.
 */
export class FighterView {
  readonly group: THREE.Group;
  readonly rig: RigView;
  readonly animator: FighterAnimator;
  private yaw = 0;
  private initialised = false;

  constructor(group: THREE.Group, rt: CharacterRuntime, rigOpts: RigOptions = {}) {
    this.group = group;
    this.rig = new RigView(rigOpts);
    this.animator = new FighterAnimator(rt);
    group.add(this.rig.group);
  }

  triggerFlash(strength: number): void {
    this.rig.triggerFlash(strength);
  }

  update(f: FighterState, o: FighterState | null, alpha: number, dtMs: number): void {
    const x = (f.px + (f.x - f.px) * alpha) * MM;
    const y = (f.py + (f.y - f.py) * alpha) * MM;
    const z = (f.pz + (f.z - f.pz) * alpha) * MM;
    this.group.position.set(x, y, z);
    const fx = f.pfx + (f.fx - f.pfx) * alpha;
    const fz = f.pfz + (f.fz - f.pfz) * alpha;
    const targetYaw = Math.atan2(fx / FX_ONE, fz / FX_ONE);
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += this.initialised ? d * Math.min(1, dtMs / 45) : d;
    this.initialised = true;
    this.group.rotation.y = this.yaw;

    const pose = this.animator.update(f, o, alpha, dtMs);
    this.rig.applyPose(pose);
    this.rig.updateEffects(dtMs, f.ko === 1, f.state === FState.Blockstun);
  }

  /** World position of the head joint (for camera focus / VFX). */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.bonePosition(4, out);
  }
}
