import * as THREE from 'three/webgpu';
import { float, length, oneMinus, smoothstep, uv, vec3 } from 'three/tsl';
import { Instancer, type Layer, makeSpriteBatch, SPRITE_STRIDE } from './common';
import { boardTextures } from './textures';

/** Building blocks for the Desert Ruins stage: blowing sand, the ruined colonnade and the dune/mesa horizon. */

/** Wind-blown sand: fine grains plus a few large faint wisps, drifting +x and wrapping across the plateau. */
export function makeSand(count: number, rnd: () => number, box = 20, floorY = 0): Layer {
  const s = makeSpriteBatch(count, 7);
  const m = s.material;
  const r = length(uv().sub(0.5).mul(2));
  const soft = oneMinus(smoothstep(float(0.2), float(1), r));
  m.colorNode = vec3(0.86, 0.72, 0.48);
  m.opacityNode = soft.mul(s.misc.z);
  m.fog = true;
  const d = s.batch.data;
  const vel = new Float32Array(count * 2); // speed, wobble phase
  for (let i = 0; i < count; i++) {
    const o = i * SPRITE_STRIDE;
    const wisp = i % 12 === 0;
    d[o] = (rnd() * 2 - 1) * box; d[o + 1] = floorY + 0.05 + rnd() * (wisp ? 2.5 : 1.4); d[o + 2] = (rnd() * 2 - 1) * box; d[o + 3] = 0;
    d[o + 4] = wisp ? 1.5 + rnd() * 2.5 : 0.025 + rnd() * 0.045; d[o + 5] = wisp ? 0.5 : 1; d[o + 6] = wisp ? 0.06 : 0.16 + rnd() * 0.2; d[o + 7] = 0;
    vel[i * 2] = wisp ? 2 + rnd() * 2 : 4.5 + rnd() * 4; vel[i * 2 + 1] = rnd() * 6.28;
  }
  s.batch.upload(count);
  let t = 0;
  return {
    mesh: s.mesh,
    update(dtMs: number): void {
      const dt = Math.min(dtMs, 100) * 0.001;
      t += dt;
      for (let i = 0; i < count; i++) {
        const o = i * SPRITE_STRIDE, ph = vel[i * 2 + 1] as number;
        let x = (d[o] as number) + (vel[i * 2] as number) * dt;
        if (x > box) { x -= box * 2; d[o + 2] = (rnd() * 2 - 1) * box; }
        d[o] = x;
        d[o + 1] = (d[o + 1] as number) + Math.sin(t * 2.1 + ph) * dt * 0.35;
        d[o + 2] = (d[o + 2] as number) + Math.cos(t * 1.3 + ph) * dt * 0.6;
        if ((d[o + 1] as number) < floorY + 0.03) d[o + 1] = floorY + 0.03;
      }
      s.batch.upload(count);
    },
    dispose(): void { s.batch.dispose(); m.dispose(); },
  };
}

/** Broken colonnade and arches on the lower terrace around the plateau. */
export function makeRuins(terraceY: number, rnd: () => number, disposables: { dispose(): void }[]): THREE.Group {
  const group = new THREE.Group();
  const flute = boardTextures(512, 18, 77, 36, 30, 60);
  const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  if (flute.map) colMat.map = flute.map;
  if (flute.rough) colMat.roughnessMap = flute.rough;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd8b57e, roughness: 0.92 });
  const columns = new Instancer(new THREE.CylinderGeometry(0.48, 0.55, 1, 14), colMat, 48);
  const blocks = new Instancer(new THREE.BoxGeometry(1, 1, 1), stoneMat, 90);
  const arches = new Instancer(new THREE.TorusGeometry(1.9, 0.5, 8, 18, Math.PI), stoneMat, 6);
  const column = (x: number, z: number, h: number, broken: boolean): void => {
    columns.add(x, terraceY + h / 2, z, 1, h, 1, 0, rnd() * 6.28, 0, 0xe8cc98);
    if (!broken) blocks.add(x, terraceY + h + 0.18, z, 1.3, 0.36, 1.3, 0, 0, 0, 0xe2c38c);
    else blocks.add(x + (rnd() - 0.5) * 2.5, terraceY + 0.3, z + 1.2 + rnd(), 0.9 + rnd(), 0.6, 0.9 + rnd(), 0, rnd(), 0, 0xdcbb84);
  };
  // back colonnade with three arches, side colonnades, scattered fallen drums
  for (let i = 0; i < 9; i++) {
    const x = -16 + i * 4;
    column(x, -19, rnd() > 0.35 ? 5.6 : 1.5 + rnd() * 2.5, rnd() > 0.5);
  }
  for (const ax of [-10, 0, 10]) {
    blocks.add(ax - 1.9, terraceY + 2.8, -23, 1.1, 5.6, 1.1, 0, 0, 0, 0xe2c38c);
    blocks.add(ax + 1.9, terraceY + 2.8, -23, 1.1, 5.6, 1.1, 0, 0, 0, 0xe2c38c);
    arches.add(ax, terraceY + 5.6, -23, 1, 1, 1, 0, 0, 0, 0xe2c38c);
  }
  for (let i = 0; i < 6; i++) {
    const z = -12 + i * 4.4;
    column(-18.5, z, rnd() > 0.4 ? 5.2 : 1.2 + rnd() * 2, rnd() > 0.5);
    column(18.5, z, rnd() > 0.4 ? 5.2 : 1.2 + rnd() * 2, rnd() > 0.5);
  }
  for (let i = 0; i < 5; i++) {
    const x = -14 + i * 7 + rnd() * 2;
    columns.add(x, terraceY + 0.52, 12 + rnd() * 6, 1, 3 + rnd() * 2, 1, 0, 0, Math.PI / 2, 0xe4c590);
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, rr = 10 + rnd() * 11;
    blocks.add(Math.cos(a) * rr, terraceY + 0.2, Math.sin(a) * rr, 0.4 + rnd() * 0.9, 0.3 + rnd() * 0.5, 0.4 + rnd() * 0.9, 0, rnd() * 3, 0, 0xd6b47e);
  }
  group.add(columns.finish(true), blocks.finish(true), arches.finish(true));
  disposables.push(columns.mesh.geometry, blocks.mesh.geometry, arches.mesh.geometry, colMat, stoneMat);
  return group;
}

/**
 * Procedural noon sky: a back-facing dome with a vertex-colour gradient (deep
 * blue zenith → pale dusty horizon) and a soft halo around the sun. Values stay
 * near 1.0 so it exposes predictably and doubles as the IBL probe scene. The
 * default radius sits inside the arena camera's 500 m far plane.
 */
export function makeSkyDome(sunDir: THREE.Vector3, radius = 420): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 18);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const t = Math.pow(Math.max(0, n.y), 0.38);
    const halo = Math.pow(Math.max(0, n.dot(sunDir)), 40) * 1.4;
    const below = Math.max(0, -n.y) * 0.5;
    colors[i * 3] = 0.80 * (1 - t) + 0.12 * t + halo - below * 0.3;
    colors[i * 3 + 1] = 0.76 * (1 - t) + 0.32 * t + halo - below * 0.3;
    colors[i * 3 + 2] = 0.70 * (1 - t) + 0.74 * t + halo * 0.8 - below * 0.3;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  return new THREE.Mesh(geo, mat);
}

/** Layered horizon: two rings of dunes and a few red-rock mesas, lighter with distance. */
export function makeHorizon(groundY: number, rnd: () => number, disposables: { dispose(): void }[]): THREE.Group {
  const group = new THREE.Group();
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const dunes = new Instancer(new THREE.SphereGeometry(1, 18, 10), duneMat, 40);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.3, r = 95 + rnd() * 45;
    dunes.add(Math.cos(a) * r, groundY - 2, Math.sin(a) * r, 35 + rnd() * 35, 9 + rnd() * 7, 25 + rnd() * 25, 0, rnd(), 0, 0xd8b276);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.4, r = 210 + rnd() * 90;
    dunes.add(Math.cos(a) * r, groundY - 4, Math.sin(a) * r, 80 + rnd() * 70, 20 + rnd() * 14, 50 + rnd() * 40, 0, rnd(), 0, 0xe3c48f);
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const mesas = new Instancer(new THREE.BoxGeometry(1, 1, 1), rockMat, 12);
  const mesaAt = (x: number, z: number, w: number, h: number, ry: number): void => {
    mesas.add(x, groundY + h * 0.5, z, w, h, w * 0.7, 0, ry, 0, 0xb3673d);
    mesas.add(x, groundY + h * 0.2, z, w * 1.5, h * 0.4, w * 1.1, 0, ry, 0, 0xc07a4c);
  };
  mesaAt(10, -290, 70, 42, 0.2);
  mesaAt(-150, -250, 50, 30, -0.4);
  mesaAt(190, -230, 60, 36, 0.5);
  mesaAt(-260, 60, 55, 28, 0.9);
  mesaAt(240, 120, 48, 26, 0.3);
  group.add(dunes.finish(), mesas.finish());
  disposables.push(dunes.mesh.geometry, mesas.mesh.geometry, duneMat, rockMat);
  return group;
}
