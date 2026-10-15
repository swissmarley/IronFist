import * as THREE from 'three/webgpu';
import type { FighterState } from '@/sim/fighterState';
import { FState } from '@/sim/fighterState';
import type { CharacterRuntime } from '@/sim/character';
import { hurtCapsules } from '@/sim/hits';
import { makeWCapsule, toWorld, type WCapsule } from '@/sim/collision';
import type { HitDef } from '@/sim/types';

const MM = 0.001;
const POOL = 24;

/** F1: wireframe capsules for hurtboxes (cyan), active hitboxes (red) and pushboxes (yellow). */
export class HitboxViewer {
  readonly group = new THREE.Group();
  private pool: THREE.Mesh[] = [];
  private used = 0;
  private readonly matHurt = new THREE.MeshBasicMaterial({ color: 0x33ddff, wireframe: true, transparent: true, opacity: 0.6, depthTest: false });
  private readonly matHit = new THREE.MeshBasicMaterial({ color: 0xff3344, wireframe: true, transparent: true, opacity: 0.9, depthTest: false });
  private readonly matInactive = new THREE.MeshBasicMaterial({ color: 0xff99aa, wireframe: true, transparent: true, opacity: 0.25, depthTest: false });
  private readonly matPush = new THREE.MeshBasicMaterial({ color: 0xffdd33, wireframe: true, transparent: true, opacity: 0.4, depthTest: false });
  private readonly w: WCapsule = makeWCapsule();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor() {
    this.group.visible = false;
    this.group.renderOrder = 999;
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 4, 10), this.matHurt);
      m.visible = false;
      this.pool.push(m);
      this.group.add(m);
    }
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  private place(c: WCapsule, mat: THREE.Material): void {
    const m = this.pool[this.used++];
    if (!m) return;
    m.visible = true;
    m.material = mat;
    const ax = c.ax * MM, ay = c.ay * MM, az = c.az * MM, bx = c.bx * MM, by = c.by * MM, bz = c.bz * MM;
    this.dir.set(bx - ax, by - ay, bz - az);
    const len = this.dir.length();
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    if (len > 1e-5) { this.dir.divideScalar(len); this.q.setFromUnitVectors(this.up, this.dir); m.quaternion.copy(this.q); }
    else m.quaternion.identity();
    // CapsuleGeometry(radius=1, length=1): scale to radius r and segment length len
    const r = c.r * MM;
    m.scale.set(r, r, r);
    // geometry is unit-radius with cylinder length len/r so the uniform scale yields radius r and length len
    const geo = m.geometry as THREE.CapsuleGeometry;
    const needed = len / Math.max(1e-5, r);
    if (Math.abs(geo.parameters.height - needed) > 1e-3) {
      m.geometry.dispose();
      m.geometry = new THREE.CapsuleGeometry(1, needed, 4, 10);
    }
  }

  update(fighters: readonly FighterState[], chars: readonly CharacterRuntime[]): void {
    this.used = 0;
    for (const m of this.pool) m.visible = false;
    if (!this.group.visible) return;
    fighters.forEach((f, i) => {
      const rt = chars[i] as CharacterRuntime;
      for (const c of hurtCapsules(f, rt)) this.place(toWorld(c, f.x, f.y, f.z, f.fx, f.fz, this.w), this.matHurt);
      if (f.state === FState.Attack && f.moveIdx >= 0) {
        const mv = rt.move(f.moveIdx);
        mv.hits.forEach((h: HitDef, hi: number) => {
          const active = f.moveFrame >= h.frames[0] && f.moveFrame <= h.frames[1] && !(f.hitMask & (1 << (h.group ?? hi)));
          for (const c of h.capsules) this.place(toWorld(c, f.x, f.y, f.z, f.fx, f.fz, this.w), active ? this.matHit : this.matInactive);
        });
      }
      const pr = rt.def.stats.pushRadius;
      this.w.ax = f.x; this.w.ay = f.y + 50; this.w.az = f.z; this.w.bx = f.x; this.w.by = f.y + 60; this.w.bz = f.z; this.w.r = pr;
      this.place(this.w, this.matPush);
    });
  }
}
