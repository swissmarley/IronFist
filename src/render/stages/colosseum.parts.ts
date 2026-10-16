import * as THREE from 'three/webgpu';
import { mergeGeos, type Part } from './common';
import { bannerTexture, flameTexture } from './texturesNature';

const TAN22 = Math.tan(Math.PI / 8);
const _pos = new THREE.Vector3(), _q = new THREE.Quaternion(), _scl = new THREE.Vector3(), _m = new THREE.Matrix4();

/** Regular octagon path with the given apothem (sides face ±x, ±z and the diagonals). */
function octagon(apothem: number): THREE.Shape {
  const s = new THREE.Shape();
  const r = apothem / Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function squarePath(half: number): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(-half, -half); p.lineTo(half, -half); p.lineTo(half, half); p.lineTo(-half, half); p.closePath();
  return p;
}

/** Extrude a shape (x,z plane, world-mapped UVs) upward from y0 by height. */
function extrudeUp(shape: THREE.Shape, y0: number, height: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Octagonal ring (apothem aIn..aOut) extruded from y0 by height. */
export function octRing(aIn: number, aOut: number, y0: number, height: number): THREE.BufferGeometry {
  const shape = octagon(aOut);
  shape.holes.push(octagon(aIn));
  return extrudeUp(shape, y0, height);
}

/** The podium: octagon with a square hole; its inner face is the arena wall. */
export function podiumGeometry(squareHalf: number, apothem: number, height: number): THREE.BufferGeometry {
  const shape = octagon(apothem);
  shape.holes.push(squarePath(squareHalf));
  return extrudeUp(shape, 0, height);
}

export interface TierLayout { apothem0: number; depth: number; riser: number; count: number; baseY: number }

/** All seating tiers merged into one geometry (stepped octagonal rings). */
export function tiersGeometry(t: TierLayout): THREE.BufferGeometry {
  const rings: THREE.BufferGeometry[] = [];
  for (let k = 0; k < t.count; k++) {
    const aIn = t.apothem0 + k * t.depth;
    rings.push(octRing(aIn, aIn + t.depth + 0.02, 0, t.baseY + (k + 1) * t.riser));
  }
  const merged = mergeGeos(rings);
  for (const r of rings) r.dispose();
  return merged;
}

/** Seat positions on the tiers: one row per tier per side, with gaps. Returns xyz triples and seat angles. */
export function seatPositions(rnd: () => number, t: TierLayout, spacing: number, fill: number): { xyz: number[]; angle: number[] } {
  const xyz: number[] = [], angle: number[] = [];
  for (let k = 0; k < t.count; k++) {
    const a = t.apothem0 + k * t.depth + t.depth * 0.6;
    const y = t.baseY + (k + 1) * t.riser;
    const L = 2 * a * TAN22 - 0.8;
    for (let side = 0; side < 8; side++) {
      const th = (side * Math.PI) / 4;
      const nx = Math.sin(th), nz = Math.cos(th), tx = Math.cos(th), tz = -Math.sin(th);
      for (let s = -L / 2; s <= L / 2; s += spacing) {
        if (rnd() > fill) continue;
        const j = (rnd() - 0.5) * spacing * 0.5;
        xyz.push(nx * a + tx * (s + j), y, nz * a + tz * (s + j));
        angle.push(th);
      }
    }
  }
  return { xyz, angle };
}

/**
 * Low-poly crowd: instanced bodies (tunic colours) and heads (skin tones). Each
 * figure bobs with its own phase and a travelling wave runs around the stands.
 * The update rewrites only the y translation of each instance matrix.
 */
export function makeCrowd(rnd: () => number, seats: { xyz: number[]; angle: number[] }): Part {
  const n = seats.angle.length;
  const bodyGeo = new THREE.CylinderGeometry(0.16, 0.24, 0.82, 5, 1);
  bodyGeo.translate(0, 0.41, 0);
  const headGeo = new THREE.SphereGeometry(0.13, 6, 4);
  headGeo.translate(0, 0.96, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, n);
  const heads = new THREE.InstancedMesh(headGeo, mat, n);
  bodies.frustumCulled = false; heads.frustumCulled = false;
  bodies.receiveShadow = true; heads.receiveShadow = true;
  const baseY = new Float32Array(n), phase = new Float32Array(n), amp = new Float32Array(n), ang = new Float32Array(n);
  const col = new THREE.Color();
  const tunics: [number, number][] = [[0.0, 0.6], [0.05, 0.7], [0.1, 0.55], [0.58, 0.45], [0.62, 0.35], [0.08, 0.08], [0.1, 0.05], [0.07, 0.35]];
  for (let i = 0; i < n; i++) {
    const x = seats.xyz[i * 3] ?? 0, y = seats.xyz[i * 3 + 1] ?? 0, z = seats.xyz[i * 3 + 2] ?? 0;
    const h = 0.85 + rnd() * 0.3;
    _pos.set(x, y, z); _q.identity(); _scl.set(h, h, h);
    _m.compose(_pos, _q, _scl);
    bodies.setMatrixAt(i, _m); heads.setMatrixAt(i, _m);
    baseY[i] = y; phase[i] = rnd() * Math.PI * 2; amp[i] = 0.015 + rnd() * 0.05; ang[i] = Math.atan2(x, z);
    const tn = tunics[Math.floor(rnd() * tunics.length)] ?? [0, 0.5];
    col.setHSL(tn[0], tn[1], 0.13 + rnd() * 0.36);
    bodies.setColorAt(i, col);
    col.setHSL(0.07 + rnd() * 0.03, 0.35 + rnd() * 0.2, 0.2 + rnd() * 0.38);
    heads.setColorAt(i, col);
  }
  const group = new THREE.Group();
  group.add(bodies, heads);
  const bArr = bodies.instanceMatrix.array as Float32Array, hArr = heads.instanceMatrix.array as Float32Array;
  return {
    object: group,
    update(t: number): void {
      for (let i = 0; i < n; i++) {
        const wave = Math.sin(t * 1.1 - (ang[i] ?? 0) * 2);
        const lift = (wave > 0.6 ? (wave - 0.6) * 2.5 : 0) * 0.3;
        const y = (baseY[i] ?? 0) + Math.abs(Math.sin(t * 2.6 + (phase[i] ?? 0))) * (amp[i] ?? 0.03) + lift;
        bArr[i * 16 + 13] = y; hArr[i * 16 + 13] = y;
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    },
    dispose(): void { bodyGeo.dispose(); headGeo.dispose(); mat.dispose(); bodies.dispose(); heads.dispose(); },
  };
}

/** Hanging banners that flutter with a vertex sine (top edge pinned). */
export function makeBanners(rnd: () => number, anchors: { x: number; y: number; z: number; yaw: number }[]): Part {
  const w = 1.1, h = 2.4, geo = new THREE.PlaneGeometry(w, h, 4, 12);
  geo.translate(0, -h / 2, 0);
  const texA = bannerTexture(355), texB = bannerTexture(42);
  const mats = [texA, texB].map((tex) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    if (tex) m.map = tex;
    return m;
  });
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [], geos: THREE.BufferGeometry[] = [], phases: number[] = [];
  anchors.forEach((a, i) => {
    const g = geo.clone();
    const m = new THREE.Mesh(g, mats[i % 2] as THREE.Material);
    m.position.set(a.x, a.y, a.z); m.rotation.y = a.yaw;
    m.castShadow = true; m.frustumCulled = false;
    group.add(m); meshes.push(m); geos.push(g); phases.push(rnd() * 6);
  });
  const rest = geo.getAttribute('position').array as Float32Array;
  return {
    object: group,
    update(t: number): void {
      for (let b = 0; b < geos.length; b++) {
        const g = geos[b];
        if (!g) continue;
        const attr = g.getAttribute('position'), arr = attr.array as Float32Array, ph = phases[b] ?? 0;
        for (let v = 0; v < attr.count; v++) {
          const x = rest[v * 3] ?? 0, y = rest[v * 3 + 1] ?? 0;
          const f = -y / h;
          arr[v * 3 + 2] = Math.sin(t * 3.2 + y * 2.4 + x * 1.5 + ph) * 0.16 * f + Math.sin(t * 1.3 + ph) * 0.1 * f * f;
          arr[v * 3] = x + Math.sin(t * 2.1 + y * 1.2 + ph) * 0.05 * f;
        }
        attr.needsUpdate = true;
      }
    },
    dispose(): void { geo.dispose(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); texA?.dispose(); texB?.dispose(); },
  };
}

/** Torches: instanced poles and bowls, additive flame cards and up to four flickering point lights. */
export function makeTorches(positions: [number, number, number][], metalMat: THREE.Material): Part {
  const n = positions.length;
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.6, 7);
  poleGeo.translate(0, 0.8, 0);
  const bowlGeo = new THREE.CylinderGeometry(0.26, 0.1, 0.32, 8, 1);
  bowlGeo.translate(0, 1.72, 0);
  const poles = new THREE.InstancedMesh(poleGeo, metalMat, n), bowls = new THREE.InstancedMesh(bowlGeo, metalMat, n);
  poles.castShadow = true; bowls.castShadow = true;
  const quad = new THREE.PlaneGeometry(0.7, 1.2), quad2 = quad.clone().rotateY(Math.PI / 2);
  const flameGeo = mergeGeos([quad, quad2]);
  quad.dispose(); quad2.dispose();
  flameGeo.translate(0, 0.5, 0);
  const flameTex = flameTexture();
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  if (flameTex) flameMat.map = flameTex;
  const group = new THREE.Group();
  group.add(poles, bowls);
  const flames: THREE.Mesh[] = [], lights: THREE.PointLight[] = [];
  positions.forEach(([x, y, z], i) => {
    _pos.set(x, y, z); _q.identity(); _scl.set(1, 1, 1); _m.compose(_pos, _q, _scl);
    poles.setMatrixAt(i, _m); bowls.setMatrixAt(i, _m);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(x, y + 1.78, z);
    group.add(flame); flames.push(flame);
    if (i < 4) {
      const pl = new THREE.PointLight(0xff9240, 9, 14, 2);
      pl.position.set(x, y + 2.1, z);
      group.add(pl); lights.push(pl);
    }
  });
  return {
    object: group,
    update(t: number): void {
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i], k = i * 1.7;
        if (!f) continue;
        f.scale.set(1 + Math.sin(t * 11 + k) * 0.12, 1 + Math.sin(t * 15 + k * 2) * 0.18 + Math.sin(t * 37 + k) * 0.06, 1 + Math.cos(t * 13 + k) * 0.12);
        f.rotation.y = Math.sin(t * 2 + k) * 0.3;
      }
      for (let i = 0; i < lights.length; i++) {
        const pl = lights[i];
        if (pl) pl.intensity = 8.5 + Math.sin(t * 13 + i * 1.7) * 1.3 + Math.sin(t * 31 + i * 2.3) * 0.7;
      }
    },
    dispose(): void { poleGeo.dispose(); bowlGeo.dispose(); flameGeo.dispose(); flameMat.dispose(); flameTex?.dispose(); poles.dispose(); bowls.dispose(); },
  };
}

/** Columns along the top gallery of the outer wall (instanced). */
export function makeColumns(apothem: number, y: number, height: number, perSide: number, mat: THREE.Material): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(0.22, 0.26, height, 8, 1);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, perSide * 8);
  mesh.castShadow = true;
  const L = 2 * apothem * TAN22;
  let i = 0;
  for (let side = 0; side < 8; side++) {
    const th = (side * Math.PI) / 4;
    const nx = Math.sin(th), nz = Math.cos(th), tx = Math.cos(th), tz = -Math.sin(th);
    for (let k = 0; k < perSide; k++) {
      const s = -L / 2 + ((k + 0.5) / perSide) * L;
      _pos.set(nx * apothem + tx * s, y, nz * apothem + tz * s); _q.identity(); _scl.set(1, 1, 1);
      _m.compose(_pos, _q, _scl);
      mesh.setMatrixAt(i++, _m);
    }
  }
  return mesh;
}

/** Points on an octagon at the given apothem: side centres (with yaw facing the centre), n per side. */
export function octPoints(apothem: number, perSide: number, y: number): { x: number; y: number; z: number; yaw: number }[] {
  const out: { x: number; y: number; z: number; yaw: number }[] = [];
  const L = 2 * apothem * TAN22;
  for (let side = 0; side < 8; side++) {
    const th = (side * Math.PI) / 4;
    const nx = Math.sin(th), nz = Math.cos(th), tx = Math.cos(th), tz = -Math.sin(th);
    for (let k = 0; k < perSide; k++) {
      const s = -L / 2 + ((k + 0.5) / perSide) * L;
      out.push({ x: nx * apothem + tx * s, y, z: nz * apothem + tz * s, yaw: th });
    }
  }
  return out;
}
