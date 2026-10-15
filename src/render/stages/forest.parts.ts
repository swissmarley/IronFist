import * as THREE from 'three/webgpu';
import { type Part, mergeGeos } from './common';
import { bambooTexture, leafClusterTexture, rippleTexture, shaftTexture } from './texturesNature';

const _pos = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _scl = new THREE.Vector3(), _m = new THREE.Matrix4();
const _axis = new THREE.Vector3(), _up = new THREE.Vector3(), _eul = new THREE.Euler();

/**
 * Dense bamboo stalks in an annulus around the clearing, in clumps, each with 1-2
 * leaf clusters. Stalks rotate around their base with a per-instance phase; the
 * leaf sprites follow the top of their stalk.
 */
export function makeBamboo(rnd: () => number, rMin: number, rMax: number, clumps: number): Part {
  const bases: number[] = [], heights: number[] = [], phases: number[] = [], amps: number[] = [], yaws: number[] = [];
  for (let c = 0; c < clumps; c++) {
    const a = rnd() * Math.PI * 2;
    const r = rMin + Math.sqrt(rnd()) * (rMax - rMin);
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const ox = (rnd() - 0.5) * 1.1, oz = (rnd() - 0.5) * 1.1;
      bases.push(Math.sin(a) * r + ox, Math.cos(a) * r + oz);
      heights.push(8 + rnd() * 5);
      phases.push(rnd() * Math.PI * 2);
      amps.push(0.012 + rnd() * 0.02);
      yaws.push(rnd() * Math.PI * 2);
    }
  }
  const count = heights.length;
  const stalkGeo = new THREE.CylinderGeometry(0.04, 0.075, 1, 7, 1, true);
  stalkGeo.translate(0, 0.5, 0);
  const bambooTex = bambooTexture();
  if (bambooTex) bambooTex.repeat.set(1, 3);
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.02 });
  if (bambooTex) stalkMat.map = bambooTex;
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, count);
  stalks.castShadow = true; stalks.receiveShadow = true;
  stalks.frustumCulled = false;
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const dry = rnd();
    tint.setHSL(0.2 - dry * 0.09, 0.3 + rnd() * 0.3, 0.42 + rnd() * 0.3);
    stalks.setColorAt(i, tint);
  }

  // leaf clusters: one or two per stalk at a fraction of its height
  const leafOwner: number[] = [], leafFrac: number[] = [], leafYaw: number[] = [], leafScale: number[] = [];
  for (let i = 0; i < count; i++) {
    const n = 1 + (rnd() < 0.6 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      leafOwner.push(i); leafFrac.push(k === 0 ? 0.82 + rnd() * 0.15 : 0.3 + rnd() * 0.4);
      leafYaw.push(rnd() * Math.PI * 2); leafScale.push(1.6 + rnd() * 1.4);
    }
  }
  const leafTex = leafClusterTexture();
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide, alphaTest: 0.5 });
  if (leafTex) leafMat.map = leafTex;
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  const canopy = new THREE.InstancedMesh(leafGeo, leafMat, leafOwner.length);
  canopy.castShadow = true;
  canopy.frustumCulled = false;
  const group = new THREE.Group();
  group.add(stalks, canopy);

  const angles = new Float32Array(count);
  return {
    object: group,
    update(t: number): void {
      const gust = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.91 + 1.3) * 0.3;
      for (let i = 0; i < count; i++) {
        const ph = phases[i] ?? 0, amp = amps[i] ?? 0.02;
        const ang = amp * (Math.sin(t * 0.9 + ph) + 0.5 * Math.sin(t * 2.1 + ph * 1.7)) + 0.02 * gust + 0.03;
        angles[i] = ang;
        _axis.set(Math.sin(ph * 0.5) * 0.4, 0, 1).normalize();
        _q.setFromAxisAngle(_axis, ang);
        _q2.setFromAxisAngle(_up.set(0, 1, 0), yaws[i] ?? 0);
        _q.multiply(_q2);
        _pos.set(bases[i * 2] ?? 0, 0, bases[i * 2 + 1] ?? 0);
        _scl.set(1, heights[i] ?? 10, 1);
        _m.compose(_pos, _q, _scl);
        stalks.setMatrixAt(i, _m);
      }
      stalks.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < leafOwner.length; k++) {
        const i = leafOwner[k] ?? 0, h = (heights[i] ?? 10) * (leafFrac[k] ?? 0.8);
        const ph = phases[i] ?? 0, ang = angles[i] ?? 0;
        _axis.set(Math.sin(ph * 0.5) * 0.4, 0, 1).normalize();
        _q.setFromAxisAngle(_axis, ang);
        _up.set(0, h, 0).applyQuaternion(_q);
        _pos.set((bases[i * 2] ?? 0) + _up.x, _up.y, (bases[i * 2 + 1] ?? 0) + _up.z);
        _eul.set(ang * 2, leafYaw[k] ?? 0, Math.sin(t * 1.3 + ph) * 0.08);
        _q.setFromEuler(_eul);
        const s = leafScale[k] ?? 2;
        _scl.set(s, s * 0.7, 1);
        _m.compose(_pos, _q, _scl);
        canopy.setMatrixAt(k, _m);
      }
      canopy.instanceMatrix.needsUpdate = true;
    },
    dispose(): void {
      stalkGeo.dispose(); stalkMat.dispose(); leafGeo.dispose(); leafMat.dispose();
      bambooTex?.dispose(); leafTex?.dispose(); stalks.dispose(); canopy.dispose();
    },
  };
}

/** Drifting leaves: a small instanced particle layer that falls, flutters and respawns. */
export function makeLeaves(rnd: () => number, count: number, range: number): Part {
  const geo = new THREE.PlaneGeometry(0.16, 0.1);
  const tex = leafClusterTexture(64, 97, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, alphaTest: 0.4 });
  if (tex) mat.map = tex;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const p = new Float32Array(count * 3), ph = new Float32Array(count), vy = new Float32Array(count);
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    p[i * 3] = (rnd() - 0.5) * range * 2; p[i * 3 + 1] = rnd() * 9; p[i * 3 + 2] = (rnd() - 0.5) * range * 2;
    ph[i] = rnd() * Math.PI * 2; vy[i] = 0.35 + rnd() * 0.4;
    col.setHSL(0.17 + rnd() * 0.1, 0.5 + rnd() * 0.3, 0.3 + rnd() * 0.25);
    mesh.setColorAt(i, col);
  }
  return {
    object: mesh,
    update(t: number, dt: number): void {
      for (let i = 0; i < count; i++) {
        const k = ph[i] ?? 0;
        let y = (p[i * 3 + 1] ?? 0) - (vy[i] ?? 0.4) * dt;
        let x = (p[i * 3] ?? 0) + (0.25 + Math.sin(t * 0.8 + k) * 0.4) * dt;
        const z = (p[i * 3 + 2] ?? 0) + Math.cos(t * 0.6 + k * 1.3) * 0.3 * dt;
        if (y < 0.05) { y = 8 + (k / (Math.PI * 2)) * 3; x -= 6; }
        if (x > range) x -= range * 2;
        p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
        _pos.set(x, y, z);
        _eul.set(t * 2.2 + k, k * 2, Math.sin(t * 3 + k) * 0.9);
        _q.setFromEuler(_eul);
        _scl.set(1, 1, 1);
        _m.compose(_pos, _q, _scl);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose(): void { geo.dispose(); mat.dispose(); tex?.dispose(); mesh.dispose(); },
  };
}

/** God-ray-like shafts: additive crossed quads aligned with the sun direction, slowly breathing. */
export function makeShafts(rnd: () => number, sunDir: THREE.Vector3, count: number, rMin: number, rMax: number): Part {
  const quad = new THREE.PlaneGeometry(1, 1);
  const quad2 = quad.clone().rotateY(Math.PI / 2);
  const geo = mergeGeos([quad, quad2]);
  quad.dispose(); quad2.dispose();
  const tex = shaftTexture();
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  if (tex) mat.map = tex;
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [], phases: number[] = [];
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir.clone().normalize());
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.5, r = rMin + rnd() * (rMax - rMin);
    const m = new THREE.Mesh(geo, mat);
    const w = 2 + rnd() * 3.5, h = 14 + rnd() * 6;
    m.scale.set(w, h, w);
    m.quaternion.copy(q);
    m.position.set(Math.sin(a) * r, h * 0.5 * sunDir.y - 0.5, Math.cos(a) * r);
    m.position.x += sunDir.x * h * 0.5; m.position.z += sunDir.z * h * 0.5;
    group.add(m); meshes.push(m); phases.push(rnd() * 6);
  }
  return {
    object: group,
    update(t: number): void {
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        if (!m) continue;
        const s = 1 + Math.sin(t * 0.5 + (phases[i] ?? 0)) * 0.12;
        m.scale.x = (2 + ((phases[i] ?? 0) / 6) * 3.5) * s;
      }
      mat.opacity = 0.36 + Math.sin(t * 0.3) * 0.06;
    },
    dispose(): void { geo.dispose(); mat.dispose(); tex?.dispose(); },
  };
}

/** Four stone lanterns (instanced parts) with two warm point lights that flicker softly. */
export function makeLanterns(positions: [number, number][], stoneMat: THREE.Material): Part {
  const n = positions.length;
  const parts: { geo: THREE.BufferGeometry; y: number; mat: THREE.Material }[] = [];
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffa84a, emissiveIntensity: 1.2, roughness: 0.5 });
  parts.push({ geo: new THREE.BoxGeometry(0.7, 0.25, 0.7), y: 0.125, mat: stoneMat });
  parts.push({ geo: new THREE.CylinderGeometry(0.12, 0.15, 1.0, 8), y: 0.75, mat: stoneMat });
  parts.push({ geo: new THREE.BoxGeometry(0.55, 0.12, 0.55), y: 1.3, mat: stoneMat });
  parts.push({ geo: new THREE.BoxGeometry(0.4, 0.42, 0.4), y: 1.57, mat: glowMat });
  parts.push({ geo: new THREE.ConeGeometry(0.62, 0.4, 4, 1), y: 1.98, mat: stoneMat });
  parts.push({ geo: new THREE.SphereGeometry(0.1, 8, 6), y: 2.25, mat: stoneMat });
  const group = new THREE.Group();
  const meshes: THREE.InstancedMesh[] = [];
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, n);
    im.castShadow = true; im.receiveShadow = true;
    positions.forEach(([x, z], i) => {
      _pos.set(x, part.y, z); _q.setFromAxisAngle(_up.set(0, 1, 0), part.geo instanceof THREE.ConeGeometry ? Math.PI / 4 : 0); _scl.set(1, 1, 1);
      _m.compose(_pos, _q, _scl); im.setMatrixAt(i, _m);
    });
    group.add(im); meshes.push(im);
  }
  const lights: THREE.PointLight[] = [];
  positions.slice(0, 2).forEach(([x, z]) => {
    const pl = new THREE.PointLight(0xffa84a, 2.5, 7, 2);
    pl.position.set(x, 1.6, z);
    group.add(pl); lights.push(pl);
  });
  return {
    object: group,
    update(t: number): void {
      for (let i = 0; i < lights.length; i++) {
        const pl = lights[i];
        if (pl) pl.intensity = 2.4 + Math.sin(t * 9 + i * 2.1) * 0.3 + Math.sin(t * 23 + i) * 0.15;
      }
    },
    dispose(): void { for (const p of parts) p.geo.dispose(); glowMat.dispose(); for (const m of meshes) m.dispose(); },
  };
}

/** A shallow stream behind the clearing with animated ripples and instanced bank stones. */
export function makeStream(rnd: () => number, z: number, length: number, width: number, stoneMat: THREE.Material): Part {
  const group = new THREE.Group();
  const bedGeo = new THREE.PlaneGeometry(length, width + 1.6);
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 0.95 });
  const bed = new THREE.Mesh(bedGeo, bedMat);
  bed.rotation.x = -Math.PI / 2; bed.position.set(0, -0.3, z); bed.receiveShadow = true;
  const ripple = rippleTexture();
  const waterGeo = new THREE.PlaneGeometry(length, width);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x6f9c8f, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.8 });
  if (ripple) { waterMat.bumpMap = ripple; waterMat.bumpScale = 0.03; }
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.12, z);
  const stoneGeo = new THREE.DodecahedronGeometry(0.3, 0);
  const nStones = 90;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, nStones);
  stones.castShadow = true; stones.receiveShadow = true;
  for (let i = 0; i < nStones; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    _pos.set((rnd() - 0.5) * length, -0.15 + rnd() * 0.1, z + side * (width * 0.5 + 0.1 + rnd() * 0.5));
    _eul.set(rnd() * 3, rnd() * 3, rnd() * 3); _q.setFromEuler(_eul);
    const s = 0.5 + rnd() * 0.9; _scl.set(s, s * 0.6, s);
    _m.compose(_pos, _q, _scl); stones.setMatrixAt(i, _m);
  }
  group.add(bed, water, stones);
  return {
    object: group,
    update(t: number): void { if (ripple) { ripple.offset.x = t * 0.06; ripple.offset.y = Math.sin(t * 0.4) * 0.05; } },
    dispose(): void { bedGeo.dispose(); bedMat.dispose(); waterGeo.dispose(); waterMat.dispose(); ripple?.dispose(); stoneGeo.dispose(); stones.dispose(); },
  };
}
