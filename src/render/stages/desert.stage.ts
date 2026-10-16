import * as THREE from 'three/webgpu';
import type { ArenaDef } from '@/sim/config';
import { birdSpriteTexture, sandstoneTextures, sandTextures, texRng } from './textures';
import { DEFAULT_GRADING, type Stage, type StageContext, type StageFactory } from './Stage';
import { makeBirds } from './common';
import { makeHorizon, makeRuins, makeSand, makeSkyDome } from './desert.parts';

/**
 * Desert Ruins: a sandstone plateau at high noon, open on every side (ring-out)
 * with a drop to a lower terrace of broken columns and arches, then the sand
 * plain. Hard sun shadows, blowing sand, layered dunes and mesas, circling
 * buzzards.
 */
export const arena: ArenaDef = { id: 'desert', name: 'Desert Ruins', halfX: 7500, halfZ: 7500, walls: false };
const ARENA = arena;
const TERRACE_Y = -3.2;
const GROUND_Y = -9;

const createDesert: StageFactory = async (ctx: StageContext): Promise<Stage> => {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const rnd = texRng(6107);
  const half = ARENA.halfX / 1000;

  // --- sky, sun --------------------------------------------------------------
  const el = 62 * (Math.PI / 180), az = 140 * (Math.PI / 180);
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const sky = makeSkyDome(sunDir);
  root.add(sky);
  disposables.push(sky.geometry, sky.material as THREE.Material);

  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.position.copy(sunDir).multiplyScalar(50);
  sun.castShadow = ctx.shadows;
  sun.shadow.mapSize.set(ctx.shadowMapSize, ctx.shadowMapSize);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight(0x8fbcff, 0xc8a06a, 0.3));

  // --- plateau (the arena) and its cliffs -------------------------------------
  const flag = sandstoneTextures(1024, 71, 6);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc9b89c, roughness: 0.95 });
  if (flag.map) floorMat.map = flag.map;
  if (flag.rough) floorMat.roughnessMap = flag.rough;
  if (flag.bump) { floorMat.bumpMap = flag.bump; floorMat.bumpScale = 0.25; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  disposables.push(floor.geometry, floorMat);

  const strata = sandTextures(512, 83, true);
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  if (strata.map) cliffMat.map = strata.map;
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.1, 0 - TERRACE_Y, half * 2 + 0.1), cliffMat);
  cliff.position.y = TERRACE_Y / 2 - 0.01;
  cliff.receiveShadow = true;
  root.add(cliff);
  const terraceMat = new THREE.MeshStandardMaterial({ color: 0xd2ad74, roughness: 1 });
  if (flag.map) terraceMat.map = flag.map;
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(46, 0.8, 46), terraceMat);
  terrace.position.y = TERRACE_Y - 0.4;
  terrace.receiveShadow = true;
  root.add(terrace);
  const lowerCliff = new THREE.Mesh(new THREE.BoxGeometry(46.2, TERRACE_Y - GROUND_Y, 46.2), cliffMat);
  lowerCliff.position.y = (TERRACE_Y + GROUND_Y) / 2 - 0.4;
  root.add(lowerCliff);
  disposables.push(cliff.geometry, cliffMat, terrace.geometry, terraceMat, lowerCliff.geometry);

  // --- sand plain and horizon --------------------------------------------------
  const sand = sandTextures(512, 85, false);
  if (sand.map) sand.map.repeat.set(48, 48);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  if (sand.map) sandMat.map = sand.map;
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), sandMat);
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = GROUND_Y;
  root.add(plain);
  disposables.push(plain.geometry, sandMat);
  root.add(makeHorizon(GROUND_Y, rnd, disposables));
  root.add(makeRuins(TERRACE_Y, rnd, disposables));

  // --- blowing sand and buzzards ------------------------------------------------
  const grains = makeSand(ctx.shadowMapSize >= 2048 ? 720 : ctx.shadowMapSize >= 1024 ? 400 : 200, rnd, 20);
  root.add(grains.mesh);
  disposables.push(grains);
  const buzzards = makeBirds(5, birdSpriteTexture(128, '#241c14'), [[0, 7, -34], [-26, 8, -8]], 12, 1.7, 0.9, rnd);
  root.add(buzzards.sprites.mesh);
  disposables.push(buzzards.sprites.batch, buzzards.sprites.material);

  // --- environment (IBL) from the noon sky --------------------------------------
  let environment: THREE.Texture | null = null;
  try {
    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    const envScene = new THREE.Scene();
    const envSky = makeSkyDome(sunDir, 100);
    envScene.add(envSky);
    environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
    envSky.geometry.dispose();
    (envSky.material as THREE.Material).dispose();
  } catch (err) {
    console.warn('IBL unavailable, using hemisphere light only', err);
  }

  return {
    id: 'desert', name: 'Desert Ruins', theme: 'desert', arena: ARENA, root,
    grading: { ...DEFAULT_GRADING, exposure: 0.8, contrast: 1.18, saturation: 1.12, tint: [1.06, 0.98, 0.88], vignette: 0.3, bloomStrength: 0.12, bloomThreshold: 1.8 },
    environment, background: null, fog: new THREE.Fog(0xd6c3a0, 110, 480),
    update(dtMs: number): void {
      grains.update(dtMs);
      buzzards.update(dtMs);
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
      environment?.dispose();
    },
  };
};

export default createDesert;
