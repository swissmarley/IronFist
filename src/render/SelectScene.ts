import * as THREE from 'three/webgpu';
import type { GreyBoxScene } from './GreyBoxScene';
import { RigView } from './rig/RigView';
import { rigOptionsFor } from './rig/look';
import { buildClipSet } from '@/anim/clips';
import { evaluateClip, Pose } from '@/anim/pose';
import type { CharacterDef } from '@/sim/types';

/**
 * Character-select turntable: the two highlighted fighters stand on the stage
 * facing the camera and rotate slowly; the DOM grid is drawn over them.
 */
export class SelectScene {
  private rigs: [RigView | null, RigView | null] = [null, null];
  private ids: [string, string] = ['', ''];
  private readonly clips = buildClipSet();
  private readonly pose = new Pose();
  private t = 0;
  private active = false;
  private players = 2;

  constructor(private readonly scene: GreyBoxScene) {}

  setFighter(slot: number, def: CharacterDef): void {
    const s = slot as 0 | 1;
    if (s === 1 && this.players === 1) { this.clearSlot(1); return; }
    if (this.ids[s] === def.id && this.rigs[s]) return;
    this.clearSlot(s);
    const rig = new RigView(rigOptionsFor(def, s));
    const group = this.scene.fighters[s] as THREE.Group;
    group.add(rig.group);
    group.position.set(s === 0 ? -1.35 : 1.35, 0, 0.6);
    this.rigs[s] = rig;
    this.ids[s] = def.id;
  }

  private clearSlot(s: 0 | 1): void {
    const rig = this.rigs[s];
    if (rig) { rig.group.parent?.remove(rig.group); rig.dispose(); }
    this.rigs[s] = null;
    this.ids[s] = '';
  }

  enter(players = 2): void {
    this.active = true;
    this.players = players;
    this.scene.camera.position.set(0, 1.4, 6.4);
    this.scene.camera.lookAt(0, 1.05, 0.6);
    this.scene.camera.fov = 32;
    this.scene.camera.updateProjectionMatrix();
  }

  exit(): void {
    this.active = false;
    this.clearSlot(0);
    this.clearSlot(1);
    for (const g of this.scene.fighters) g.position.set(0, 0, 0);
  }

  update(dtMs: number): void {
    if (!this.active) return;
    this.t += dtMs;
    evaluateClip(this.clips.idle, (this.t / 16.67) % 120, this.pose);
    this.rigs.forEach((rig, i) => {
      if (!rig) return;
      const g = this.scene.fighters[i] as THREE.Group;
      g.rotation.y = Math.PI * (i === 0 ? 0.08 : -0.08) + Math.sin(this.t * 0.0006 + i) * 0.35;
      rig.applyPose(this.pose);
      rig.updateEffects(dtMs, false, false);
    });
  }
}
