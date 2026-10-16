import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { ArenaDef } from '@/sim/config';
import { birdSpriteTexture, boardTextures, containerTextures, texRng } from './textures';
import { DEFAULT_GRADING, type Stage, type StageContext, type StageFactory } from './Stage';
import { Instancer, makeBirds } from './common';
import { makeBoat, makeLighthouse, waterMaterial } from './harbour.parts';

/**
 * Harbour Deck: a timber pier at dusk, open on all four sides to the sea
 * (ring-out). Animated TSL water, moored boats, a container quay with gantry
 * cranes, a cargo ship, a sweeping lighthouse beam and circling gulls.
 */
export const arena: ArenaDef = { id: 'harbour', name: 'Harbour Deck', halfX: 7000, halfZ: 7000, walls: false };
const ARENA = arena;
const WATER_Y = -1.6;

const createHarbour: StageFactory = async (ctx: StageContext): Promise<Stage> => {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const rnd = texRng(4471);
  const half = ARENA.halfX / 1000;

  // --- sky, sun and lights ------------------------------------------------
  const sky = new SkyMesh();
  sky.scale.setScalar(4000);
  sky.turbidity.value = 12;
  sky.rayleigh.value = 3.2;
  sky.mieCoefficient.value = 0.012;
  sky.mieDirectionalG.value = 0.9;
  const el = 7 * (Math.PI / 180), az = 100 * (Math.PI / 180);
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  sky.sunPosition.value.copy(sunDir);
  root.add(sky);

  const sun = new THREE.DirectionalLight(0xffb27a, 0.95);
  sun.position.copy(sunDir).multiplyScalar(45);
  sun.castShadow = ctx.shadows;
  sun.shadow.mapSize.set(ctx.shadowMapSize, ctx.shadowMapSize);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight(0x4f82a3, 0x16222c, 0.4));
  const fill = new THREE.DirectionalLight(0x6fa3cf, 0.35);
  fill.position.set(-30, 14, -10);
  root.add(fill);

  // --- deck (the arena: ends exactly at the ring-out edge) -------------------
  const boards = boardTextures(1024, 12, 23, 30, 16, 28);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.02 });
  if (boards.map) deckMat.map = boards.map;
  if (boards.rough) deckMat.roughnessMap = boards.rough;
  if (boards.bump) { deckMat.bumpMap = boards.bump; deckMat.bumpScale = 0.3; }
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  root.add(deck);
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.55, metalness: 0.7 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.2, 0.36, half * 2 + 0.2), steelMat);
  slab.position.y = -0.19;
  root.add(slab);
  disposables.push(deck.geometry, deckMat, slab.geometry, steelMat);

  const pileMat = new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 0.95 });
  const piles = new Instancer(new THREE.CylinderGeometry(0.2, 0.22, 2.6, 8), pileMat, 40);
  for (let i = 0; i < 6; i++) {
    const t = -half + 0.5 + (i / 5) * (half * 2 - 1);
    piles.add(t, -1.3, -half + 0.3, 1, 1, 1); piles.add(t, -1.3, half - 0.3, 1, 1, 1);
    piles.add(-half + 0.3, -1.3, t, 1, 1, 1); piles.add(half - 0.3, -1.3, t, 1, 1, 1);
  }
  root.add(piles.finish());
  disposables.push(piles.mesh.geometry, pileMat);

  // --- lamp posts on brackets at the corners + point lights ----------------
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.6, metalness: 0.6 });
  const dark = new Instancer(new THREE.BoxGeometry(1, 1, 1), darkMat, 140);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc070, emissiveIntensity: 3.2, roughness: 0.5 });
  const glow = new Instancer(new THREE.BoxGeometry(1, 1, 1), glowMat, 8);
  const lights: THREE.PointLight[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (half + 0.45), z = sz * (half + 0.45);
    dark.add(x, -0.25, z, 0.7, 0.3, 0.7);
    dark.add(x, 1.7, z, 0.12, 3.6, 0.12);
    dark.add(x - sx * 0.35, 3.45, z - sz * 0.35, 0.8, 0.08, 0.08, 0, Math.atan2(sz, sx));
    glow.add(x - sx * 0.6, 3.35, z - sz * 0.6, 0.42, 0.18, 0.3, 0, Math.atan2(sz, sx));
    if (lights.length < 3) {
      const pl = new THREE.PointLight(0xffb070, 4, 9, 2);
      pl.position.set(x - sx * 0.6, 3.2, z - sz * 0.6);
      root.add(pl);
      lights.push(pl);
    }
  }

  // --- quay with containers, cranes, warehouses --------------------------
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.95 });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(200, 3.2, 30), concreteMat);
  quay.position.set(0, -2.2, -64);
  root.add(quay);
  disposables.push(quay.geometry, concreteMat);
  const corr = containerTextures();
  const containerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.35 });
  if (corr.map) containerMat.map = corr.map;
  if (corr.rough) containerMat.roughnessMap = corr.rough;
  const containers = new Instancer(new THREE.BoxGeometry(2.44, 2.6, 6.1), containerMat, 60);
  const palette = [0x9a3b2a, 0x2a4f8a, 0x2f6b3a, 0xc9a227, 0x6d7278, 0xd8d8d2, 0x7a3f1f];
  for (let col = 0; col < 20; col++) {
    const x = -66 + col * 7 + rnd() * 0.8;
    const stack = 1 + Math.floor(rnd() * 3);
    for (let lvl = 0; lvl < stack; lvl++) {
      containers.add(x, -0.6 + 1.3 + lvl * 2.6, -54 - (col % 3) * 7, 1, 1, 1, 0, (rnd() - 0.5) * 0.08, 0, palette[(col + lvl) % palette.length]);
    }
  }
  root.add(containers.finish());
  disposables.push(containers.mesh.geometry, containerMat);
  for (const [cx, cz] of [[-46, -70], [48, -74]] as const) {
    for (const [lx, lz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]] as const) dark.add(cx + lx, 10.5, cz + lz, 0.9, 22, 0.9);
    dark.add(cx, 21.9, cz - 5, 16, 1.6, 1.6);
    dark.add(cx, 21.9, cz + 5, 16, 1.6, 1.6);
    dark.add(cx, 23.3, cz, 2.2, 1.4, 12);
    dark.add(cx, 30, cz + 18, 1.6, 1.6, 44, -0.42);
    dark.add(cx, 24, cz - 3, 2.6, 2.6, 2.2);
  }
  const warehouseMat = new THREE.MeshStandardMaterial({ color: 0x8b8e92, roughness: 0.7, metalness: 0.3 });
  if (corr.map) { warehouseMat.map = corr.map; }
  const warehouses = new Instancer(new THREE.BoxGeometry(1, 1, 1), warehouseMat, 6);
  warehouses.add(-82, 4.2, -78, 34, 9.6, 18, 0, 0, 0, 0x8a8d90);
  warehouses.add(88, 5.0, -82, 40, 11.2, 20, 0, 0, 0, 0x7a7577);
  warehouses.add(-82, 9.3, -78, 34.6, 0.6, 18.6, 0, 0, 0, 0x3a3c40);
  warehouses.add(88, 10.9, -82, 40.6, 0.6, 20.6, 0, 0, 0, 0x3a3c40);
  root.add(warehouses.finish());
  disposables.push(warehouses.mesh.geometry, warehouseMat);

  // --- cargo ship, headlands, lighthouse rock (far silhouettes) ------------
  dark.add(96, 1.4, -118, 80, 8, 16, 0, 0.3);
  dark.add(118, 10, -111, 12, 11, 14, 0, 0.3);
  dark.add(119, 17.5, -111, 3.5, 5, 3.5, 0, 0.3);
  dark.add(76, 7, -124, 6, 3.5, 3.5, 0, 0.3);
  for (let i = 0; i < 7; i++) dark.add(-56 - i * 7, -1.2, -118 + i * 1.5, 7.5, 1.6, 5, 0, 0.2, 0, 0x3a3d42);
  root.add(dark.finish());
  root.add(glow.finish());
  disposables.push(dark.mesh.geometry, darkMat, glow.mesh.geometry, glowMat);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x1f2d34, roughness: 1 });
  const hills = new Instancer(new THREE.SphereGeometry(1, 20, 12), hillMat, 8);
  hills.add(-150, -6, -190, 110, 26, 70);
  hills.add(-60, -8, -230, 90, 16, 60);
  hills.add(190, -6, -210, 140, 34, 80);
  hills.add(-52, -3, -124, 10, 5, 10, 0, 0, 0, 0x2c3034);
  root.add(hills.finish());
  disposables.push(hills.mesh.geometry, hillMat);
  const lighthouse = makeLighthouse(disposables);
  lighthouse.group.position.set(-52, -1.6, -124);
  root.add(lighthouse.group);

  // --- water ----------------------------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(320, 320, 128, 128);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = waterMaterial();
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  root.add(water);
  disposables.push(waterGeo, waterMat);

  // --- boats and gulls --------------------------------------------------------
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.7 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
  const boats = [
    makeBoat(0x1b3a5c, cabinMat, mastMat, 0.0, disposables),
    makeBoat(0x7a2a22, cabinMat, mastMat, 2.1, disposables),
    makeBoat(0x2f5f3a, cabinMat, mastMat, 4.4, disposables),
  ];
  const boatPlaces: [number, number, number][] = [[-17, 4, 0.35], [18, -9, -1.25], [-13, -27, 2.05]];
  boats.forEach((b, i) => {
    const p = boatPlaces[i] ?? [0, 0, 0];
    b.group.position.set(p[0], WATER_Y + 0.15, p[1]);
    b.group.rotation.y = p[2];
    b.baseY = WATER_Y + 0.15;
    root.add(b.group);
  });
  disposables.push(cabinMat, mastMat);
  const gulls = makeBirds(14, birdSpriteTexture(128, '#f2f0ea'), [[0, 5, -32], [22, 6, -10], [-24, 5, 2]], 10, 1.3, 2.6, rnd);
  root.add(gulls.sprites.mesh);
  disposables.push(gulls.sprites.batch, gulls.sprites.material);

  // --- environment (IBL) from the dusk sky ----------------------------------
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
    environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  } catch (err) {
    console.warn('IBL unavailable, using hemisphere light only', err);
  }

  let time = 0;
  return {
    id: 'harbour', name: 'Harbour Deck', theme: 'harbour', arena: ARENA, root,
    grading: { ...DEFAULT_GRADING, exposure: 0.72, contrast: 1.1, saturation: 1.0, tint: [0.92, 1.0, 1.1], vignette: 0.4, bloomStrength: 0.3, bloomThreshold: 1.1 },
    environment, background: null, fog: new THREE.Fog(0x33505f, 50, 260),
    update(dtMs: number): void {
      time += dtMs * 0.001;
      lighthouse.beam.rotation.y = time * 0.55;
      for (const b of boats) {
        b.group.rotation.z = Math.sin(time * 0.8 + b.phase) * 0.045;
        b.group.rotation.x = Math.sin(time * 0.6 + b.phase * 1.3) * 0.03;
        b.group.position.y = b.baseY + Math.sin(time * 0.9 + b.phase) * 0.09;
      }
      gulls.update(dtMs);
      lights.forEach((pl, i) => { pl.intensity = 4.2 + Math.sin(time * 9 + i * 2.1) * 0.3; });
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
      environment?.dispose();
    },
  };
};

export default createHarbour;
