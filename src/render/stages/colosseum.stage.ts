import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { ArenaDef } from '@/sim/config';
import { texRng } from './textures';
import { arcadeTexture, sandstoneTextures, sandTextures } from './texturesNature';
import { makeBanners, makeColumns, makeCrowd, makeTorches, octPoints, octRing, podiumGeometry, seatPositions, tiersGeometry, type TierLayout } from './colosseum.parts';
import type { Part } from './common';
import { DEFAULT_GRADING, type Stage, type StageContext, type StageFactory } from './Stage';

export const arena: ArenaDef = { id: 'colosseum', name: 'Arena Colosseum', halfX: 6200, halfZ: 6200, walls: true };
const ARENA = arena;

/**
 * Arena Colosseum: a sand pit at late afternoon, walled by a sandstone podium
 * (the arena boundary) under octagonal tiers of instanced, cheering low-poly
 * spectators, a ring of arcades with fluttering banners, a column gallery
 * against the sky, and four flickering torches. Everything is procedural.
 */
const createColosseum: StageFactory = async (ctx: StageContext): Promise<Stage> => {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const parts: Part[] = [];
  const rnd = texRng(4242);
  const half = ARENA.halfX / 1000;
  const wallHalf = half + 0.3;
  const tiers: TierLayout = { apothem0: 9.3, depth: 1.2, riser: 0.55, count: 6, baseY: 1.5 };
  const outerA = tiers.apothem0 + tiers.depth * tiers.count;
  const wallH = 6.8;

  // --- sky + low warm sun ----------------------------------------------------
  const sky = new SkyMesh();
  sky.scale.setScalar(4000);
  sky.turbidity.value = 6;
  sky.rayleigh.value = 2.2;
  sky.mieCoefficient.value = 0.008;
  sky.mieDirectionalG.value = 0.85;
  const sunElev = 26 * (Math.PI / 180), sunAz = 300 * (Math.PI / 180);
  const sunDir = new THREE.Vector3(Math.cos(sunElev) * Math.sin(sunAz), Math.sin(sunElev), Math.cos(sunElev) * Math.cos(sunAz));
  sky.sunPosition.value.copy(sunDir);
  root.add(sky);

  const sun = new THREE.DirectionalLight(0xffd2a0, 1.7);
  sun.position.copy(sunDir).multiplyScalar(50);
  sun.castShadow = ctx.shadows;
  sun.shadow.mapSize.set(ctx.shadowMapSize, ctx.shadowMapSize);
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.updateProjectionMatrix();
  root.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x4a3524, 0.25);
  root.add(hemi);
  const fill = new THREE.DirectionalLight(0x9fb4e0, 0.3);
  fill.position.set(-sunDir.x * 30, 14, -sunDir.z * 30);
  root.add(fill);

  // --- materials --------------------------------------------------------------
  const sandstone = sandstoneTextures();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  if (sandstone.map) { sandstone.map.repeat.set(0.5, 0.5); stoneMat.map = sandstone.map; }
  if (sandstone.rough) { sandstone.rough.repeat.set(0.5, 0.5); stoneMat.roughnessMap = sandstone.rough; }
  if (sandstone.bump) { sandstone.bump.repeat.set(0.5, 0.5); stoneMat.bumpMap = sandstone.bump; stoneMat.bumpScale = 0.4; }
  const plainStone = new THREE.MeshStandardMaterial({ color: 0x9c8259, roughness: 0.85 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x5e4a33, roughness: 0.95 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x5a4e44, roughness: 0.55, metalness: 0.6 });
  disposables.push(stoneMat, plainStone, darkStone, iron);
  for (const t of [sandstone.map, sandstone.rough, sandstone.bump]) if (t) disposables.push(t);

  // --- sand floor -------------------------------------------------------------
  const sand = sandTextures();
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  if (sand.map) { sand.map.repeat.set(4, 4); sandMat.map = sand.map; }
  if (sand.rough) { sand.rough.repeat.set(4, 4); sandMat.roughnessMap = sand.rough; }
  if (sand.bump) { sand.bump.repeat.set(4, 4); sandMat.bumpMap = sand.bump; sandMat.bumpScale = 0.35; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(wallHalf * 2 + 0.1, wallHalf * 2 + 0.1), sandMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  disposables.push(floor.geometry, sandMat);
  for (const t of [sand.map, sand.rough, sand.bump]) if (t) disposables.push(t);

  // --- podium (its inner face is the arena wall), parapet, gate ---------------
  const podium = new THREE.Mesh(podiumGeometry(wallHalf, tiers.apothem0 + 0.02, tiers.baseY), stoneMat);
  podium.castShadow = true; podium.receiveShadow = true;
  root.add(podium);
  disposables.push(podium.geometry);
  const parapetX = new THREE.BoxGeometry(wallHalf * 2 + 0.5, 0.75, 0.25), parapetZ = new THREE.BoxGeometry(0.25, 0.75, wallHalf * 2 + 0.5);
  const copingX = new THREE.BoxGeometry(wallHalf * 2 + 0.7, 0.1, 0.4), copingZ = new THREE.BoxGeometry(0.4, 0.1, wallHalf * 2 + 0.7);
  for (let s = 0; s < 4; s++) {
    const sign = s % 2 === 0 ? -1 : 1, d = wallHalf + 0.125;
    const wall = new THREE.Mesh(s < 2 ? parapetX : parapetZ, darkStone);
    wall.position.set(s < 2 ? 0 : sign * d, tiers.baseY + 0.375, s < 2 ? sign * d : 0);
    const cap = new THREE.Mesh(s < 2 ? copingX : copingZ, plainStone);
    cap.position.set(wall.position.x, tiers.baseY + 0.8, wall.position.z);
    wall.castShadow = true; wall.receiveShadow = true; cap.castShadow = true;
    root.add(wall, cap);
  }
  disposables.push(parapetX, parapetZ, copingX, copingZ);
  const gateShape = new THREE.Shape();
  gateShape.moveTo(-0.9, 0); gateShape.lineTo(0.9, 0); gateShape.lineTo(0.9, 0.7); gateShape.absarc(0, 0.7, 0.9, 0, Math.PI, false); gateShape.lineTo(-0.9, 0);
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 });
  const gate = new THREE.Mesh(new THREE.ShapeGeometry(gateShape), gateMat);
  gate.position.set(0, 0.01, -wallHalf + 0.012);
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-1.2, 0); frameShape.lineTo(1.2, 0); frameShape.lineTo(1.2, 0.7); frameShape.absarc(0, 0.7, 1.2, 0, Math.PI, false); frameShape.lineTo(-1.2, 0);
  frameShape.holes.push(new THREE.Path().moveTo(-0.9, 0).lineTo(0.9, 0).lineTo(0.9, 0.7).absarc(0, 0.7, 0.9, 0, Math.PI, false).lineTo(-0.9, 0));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.12, bevelEnabled: false, curveSegments: 10 }), plainStone);
  frame.position.set(0, 0.01, -wallHalf - 0.1);
  frame.castShadow = true;
  const barGeo = new THREE.BoxGeometry(0.05, 1.55, 0.05);
  const bars = new THREE.InstancedMesh(barGeo, iron, 5);
  const bm = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) { bm.makeTranslation(-0.6 + i * 0.3, 0.78, -wallHalf + 0.05); bars.setMatrixAt(i, bm); }
  root.add(gate, frame, bars);
  disposables.push(gate.geometry, gateMat, frame.geometry, barGeo, bars);

  // --- tiers, crowd -----------------------------------------------------------
  const tierMesh = new THREE.Mesh(tiersGeometry(tiers), stoneMat);
  tierMesh.castShadow = true; tierMesh.receiveShadow = true;
  root.add(tierMesh);
  disposables.push(tierMesh.geometry);
  parts.push(makeCrowd(rnd, seatPositions(rnd, tiers, 0.5, 0.82)));

  // --- outer arcade wall, cornice, column gallery -----------------------------
  const arcade = arcadeTexture();
  const arcadeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  if (arcade) { arcade.repeat.set(1 / 2.4, 2 / wallH); arcadeMat.map = arcade; disposables.push(arcade); }
  const outerWall = new THREE.Mesh(octRing(outerA, outerA + 1.0, 0, wallH), arcadeMat);
  outerWall.castShadow = true; outerWall.receiveShadow = true;
  root.add(outerWall);
  disposables.push(outerWall.geometry, arcadeMat);
  const cornice = new THREE.Mesh(octRing(outerA - 0.15, outerA + 1.15, wallH, 0.4), stoneMat);
  cornice.castShadow = true;
  root.add(cornice);
  disposables.push(cornice.geometry);
  const columns = makeColumns(outerA + 0.5, wallH + 0.4, 2.3, 5, plainStone);
  root.add(columns);
  disposables.push(columns.geometry, columns);
  const entablature = new THREE.Mesh(octRing(outerA - 0.05, outerA + 1.05, wallH + 2.7, 0.45), stoneMat);
  entablature.castShadow = true;
  root.add(entablature);
  disposables.push(entablature.geometry);

  // --- banners on the arcade wall, torches on the parapet corners -------------
  parts.push(makeBanners(rnd, octPoints(outerA - 0.06, 1, wallH - 0.1)));
  const tc = wallHalf + 0.125, ty = tiers.baseY + 0.85;
  parts.push(makeTorches([[-tc, ty, -tc], [tc, ty, -tc], [-tc, ty, tc], [tc, ty, tc]], iron));
  for (const p of parts) root.add(p.object);

  // --- environment (IBL) from the analytic sky --------------------------------
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
    // a lower, dimmer sun for the IBL keeps the warm ambient from washing out the sandstone
    envSky.sunPosition.value.set(sunDir.x, Math.tan(9 * (Math.PI / 180)) * Math.hypot(sunDir.x, sunDir.z), sunDir.z).normalize();
    envScene.add(envSky);
    const rt = pmrem.fromScene(envScene, 0.04);
    environment = rt.texture;
    pmrem.dispose();
  } catch (err) {
    console.warn('IBL unavailable, using hemisphere light only', err);
  }

  let time = 0;
  return {
    id: 'colosseum', name: 'Arena Colosseum', theme: 'colosseum', arena: ARENA,
    root,
    grading: { ...DEFAULT_GRADING, exposure: 0.66, contrast: 1.16, saturation: 1.0, tint: [1.04, 0.98, 0.9], bloomStrength: 0.25, bloomThreshold: 1.3, vignette: 0.5 },
    environment, background: null, fog: new THREE.Fog(0xd9b48c, 26, 110),
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

export default createColosseum;
