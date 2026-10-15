import * as THREE from 'three/webgpu';
import type { FighterState } from '@/sim/fighterState';
import { FState } from '@/sim/fighterState';
import type { CharacterRuntime } from '@/sim/character';
import { FX_ONE } from '@/core/fixed';
import { FighterAnimator } from '@/anim/FighterAnimator';
import { RigView, type RigOptions } from './rig/RigView';
import { emptyFaceSignals, FaceState, faceWeights, moveFaceInfo, readFaceSignals, type MoveFaceInfo } from './rig/FaceController';

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
  private lastHitstop = 0;
  /** Expression state; null when the tier disables expressions or the rig has no face. */
  private readonly face: FaceState | null;
  private readonly faceInfo: MoveFaceInfo | null;
  private readonly faceSignals = emptyFaceSignals();

  constructor(group: THREE.Group, rt: CharacterRuntime, rigOpts: RigOptions = {}) {
    this.group = group;
    this.rig = new RigView(rigOpts);
    this.animator = new FighterAnimator(rt);
    group.add(this.rig.group);
    const expressive = this.rig.face !== null && rigOpts.faceExpressions !== false;
    this.face = expressive ? new FaceState(rigOpts.facePhaseMs ?? 0) : null;
    this.faceInfo = expressive ? moveFaceInfo(rt.moves, rt.startup, rt.lastActive) : null;
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
    this.updateSprings(f, o, x, z, dtMs);
    if (this.face && this.faceInfo) this.rig.setFaceWeights(faceWeights(readFaceSignals(f, this.faceInfo, this.faceSignals), this.face, dtMs));
    this.rig.updateEffects(dtMs, f.ko === 1, f.state === FState.Blockstun);
  }

  /**
   * Spring chains integrate in world space, so root velocity (walks, dashes,
   * knockback, juggles) drags them for free. A fresh hit-stop on the victim
   * flings them away from the attacker; during hit-stop they run slowed so the
   * whip plays out as the freeze releases.
   */
  private updateSprings(f: FighterState, o: FighterState | null, x: number, z: number, dtMs: number): void {
    if (f.hitstop > this.lastHitstop && isReacting(f.state)) {
      let dx = -Math.sin(this.yaw), dz = -Math.cos(this.yaw);
      if (o) {
        const ax = x - o.x * MM, az = z - o.z * MM;
        const len = Math.hypot(ax, az);
        if (len > 1e-3) { dx = ax / len; dz = az / len; }
      }
      const blocked = f.state === FState.Blockstun;
      const s = blocked ? 0.8 : 1.8 + 0.8 * Math.min(2, f.lastReaction);
      const up = f.state === FState.Air ? 1.8 : blocked ? 0.2 : 0.6;
      this.rig.springImpulse(dx * s, up, dz * s);
    }
    this.lastHitstop = f.hitstop;
    this.rig.updateSprings(dtMs, f.hitstop > 0 ? 0.3 : 1);
  }

  /** Snap hair/cloth chains to rest (round resets, rematches). */
  resetSprings(): void {
    this.rig.springs.reset();
    this.face?.reset();
  }

  /** World position of the head joint (for camera focus / VFX). */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.bonePosition(4, out);
  }
}

function isReacting(s: FState): boolean {
  return s === FState.Hitstun || s === FState.Blockstun || s === FState.Air || s === FState.WallSplat
    || s === FState.Stagger || s === FState.Crumple || s === FState.KO;
}
