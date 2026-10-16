import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { ArenaDef } from '@/sim/config';
import { texRng } from './textures';
import { distantForestTexture, forestFloorTexture, mossStoneTextures } from './texturesNature';
import type { Part } from './common';
import { makeBamboo, makeLanterns, makeLeaves, makeShafts, makeStream } from './forest.parts';
import { DEFAULT_GRADING, type Stage, type StageContext, type StageFactory } from './Stage';

export const arena: ArenaDef = { id: 'forest', name: 'Bamboo Forest', halfX: 6500, halfZ: 6500, walls: true };
const ARENA = arena;

/**
 * Bamboo Forest: a mossy flagstone clearing at morning, ringed by a low stone
 * kerb and enclosed by dense swaying bamboo. Light shafts, drifting leaves, stone
 * lanterns and a shallow stream behind the clearing. Everything is procedural.
 */
const createForest: StageFactory = async (ctx: StageContext): Promise<Stage> => {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const parts: Part[] = [];
  const rnd = texRng(7331);
  const half = ARENA.halfX / 1000;

  // --- sky + sun (morning, low haze) ---------------------------------------
  const sky = new SkyMesh();
  sky.scale.setScalar(4000);
  sky.turbidity.value = 4;
  sky.rayleigh.value = 1.6;
  sky.mieCoefficient.value = 0.004;
  sky.mieDirectionalG.value = 0.8;
  const sunElev = 36 * (Math.PI / 180), sunAz = 128 * (Math.PI / 180);
  const sunDir = new THREE.Vector3(Math.cos(sunElev) * Math.sin(sunAz), Math.sin(sunElev), Math.cos(sunElev) * Math.cos(sunAz));
  sky.sunPosition.value.copy(sunDir);
  root.add(sky);

  const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
  sun.position.copy(sunDir).multiplyScalar(45);
  sun.castShadow = ctx.shadows;
  sun.shadow.mapSize.set(ctx.shadowMapSize, ctx.shadowMapSize);
  sun.shadow.camera.left = -11; sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  root.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x2e3d1c, 0.4);
  root.add(hemi);
  const fill = new THREE.DirectionalLight(0xa8c8a0, 0.3);
  fill.position.set(-sunDir.x * 30, 10, -sunDir.z * 30);
  root.add(fill);

  // --- clearing floor: mossy flagstones; forest floor outside ----------------
  const moss = mossStoneTextures();
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8c9186, roughness: 0.95, metalness: 0.0 });
  if (moss.map) floorMat.map = moss.map;
  if (moss.rough) floorMat.roughnessMap = moss.rough;
  if (moss.bump) { floorMat.bumpMap = moss.bump; floorMat.bumpScale = 0.5; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 0.6, half * 2 + 0.6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.0;
  floor.receiveShadow = true;
  root.add(floor);
  disposables.push(floor.geometry, floorMat);

  const groundTex = forestFloorTexture();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  if (groundTex) groundMat.map = groundTex;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  root.add(ground);
  disposables.push(ground.geometry, groundMat);

  // --- arena boundary: low mossy stone kerb ring ----------------------------
  const kmoss = mossStoneTextures(512, 3, 97);
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xcfd2c4, roughness: 0.9 });
  if (kmoss.map) { kmoss.map.repeat.set(12, 0.5); kerbMat.map = kmoss.map; }
  if (kmoss.bump) { kmoss.bump.repeat.set(12, 0.5); kerbMat.bumpMap = kmoss.bump; kerbMat.bumpScale = 0.3; }
  const kr = half + 0.3;
  const kerbGeoX = new THREE.BoxGeometry(kr * 2 + 0.5, 0.42, 0.5), kerbGeoZ = new THREE.BoxGeometry(0.5, 0.42, kr * 2 + 0.5);
  for (let s = 0; s < 4; s++) {
    const sign = s % 2 === 0 ? -1 : 1;
    const kerb = new THREE.Mesh(s < 2 ? kerbGeoX : kerbGeoZ, kerbMat);
    kerb.position.set(s < 2 ? 0 : sign * kr, 0.19, s < 2 ? sign * kr : 0);
    kerb.castShadow = true; kerb.receiveShadow = true;
    root.add(kerb);
  }
  disposables.push(kerbGeoX, kerbGeoZ, kerbMat);
  for (const t of [kmoss.map, kmoss.rough, kmoss.bump]) if (t) disposables.push(t);

  // --- bamboo, canopy, light shafts, leaves ---------------------------------
  parts.push(makeBamboo(rnd, half + 1.6, 34, 260));
  parts.push(makeShafts(rnd, sunDir, 12, half + 0.5, half + 8));
  parts.push(makeLeaves(rnd, 140, half + 6));

  // --- stone lanterns at the corners, stream behind the far edge ------------
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e9388, roughness: 0.95 });
  const c = half + 1.1;
  parts.push(makeLanterns([[-c, -c], [c, -c], [-c, c], [c, c]], stoneMat));
  parts.push(makeStream(rnd, -(half + 3.4), 70, 2.4, stoneMat));
  disposables.push(stoneMat);
  for (const p of parts) root.add(p.object);

  // --- distant forest wall (fog blends it) ----------------------------------
  const distTex = distantForestTexture();
  const distMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
  if (distTex) distMat.map = distTex;
  const dist = new THREE.Mesh(new THREE.CylinderGeometry(44, 44, 46, 48, 1, true), distMat);
  dist.position.y = 14;
  root.add(dist);
  disposables.push(dist.geometry, distMat);
  if (distTex) disposables.push(distTex);
  if (groundTex) disposables.push(groundTex);
  for (const t of [moss.map, moss.rough, moss.bump]) if (t) disposables.push(t);

  // --- environment (IBL) from the analytic sky ------------------------------
  let environment: THREE.Texture | null = null;
  try {
    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    const envScene = new THREE.Scene();
    const envSky = new SkyMesh();
    envSky.scale.setScalar(4000);
    envSky.turbidity.value = sky.turbidity.value;
    envSky.rayleigh.value = sky.rayleigh.value;
    envSky.mieCoefficient.value = sky.mieCoefficient.value;
    envSky.mieDirectionalG.value = sky.mieDirectionalG.value;
    envSky.sunPosition.value.copy(sunDir);
    envScene.add(envSky);
    const rt = pmrem.fromScene(envScene, 0.04);
    environment = rt.texture;
    pmrem.dispose();
  } catch (err) {
    console.warn('IBL unavailable, using hemisphere light only', err);
  }

  let time = 0;
  return {
    id: 'forest', name: 'Bamboo Forest', theme: 'forest', arena: ARENA,
    root,
    grading: { ...DEFAULT_GRADING, exposure: 0.82, contrast: 1.06, saturation: 1.12, tint: [0.97, 1.03, 0.9], bloomStrength: 0.22, bloomThreshold: 1.25, vignette: 0.4 },
    environment, background: null, fog: new THREE.Fog(0x93a98a, 15, 58),
    update(dtMs: number): void {
      const dt = Math.min(dtMs, 50) * 0.001;
      time += dt;
      for (const p of parts) p.update(time, dt);
    },
    dispose(): void {
      for (const p of parts) p.dispose();
      for (const d of disposables) d.dispose();
      environment?.dispose();
    },
  };
};

export default createForest;
