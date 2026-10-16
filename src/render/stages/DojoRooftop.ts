import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { DEFAULT_ARENA, type ArenaDef } from '@/sim/config';

export const arena: ArenaDef = { ...DEFAULT_ARENA, id: 'dojo', name: 'Dojo Rooftop' };
import { plankTextures, stoneTextures, texRng, tileTextures, windowTextures } from './textures';
import { DEFAULT_GRADING, type Stage, type StageContext } from './Stage';

/**
 * Stage 1: a dojo rooftop at sunset above a dense city. Walled arena (railings).
 * Everything is procedural: plank floor, stone plinth, lantern posts, a pagoda
 * tower, parallax skyline blocks with lit windows, and an analytic sky used for IBL.
 */
export async function createDojoRooftop(ctx: StageContext): Promise<Stage> {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const rnd = texRng(2024);
  const half = DEFAULT_ARENA.halfX / 1000; // 7 m

  // --- sky + sun -----------------------------------------------------------
  const sky = new SkyMesh();
  sky.scale.setScalar(4000);
  sky.turbidity.value = 8;
  sky.rayleigh.value = 2.5;
  sky.mieCoefficient.value = 0.006;
  sky.mieDirectionalG.value = 0.85;
  const sunElev = 30 * (Math.PI / 180), sunAz = 42 * (Math.PI / 180);
  const sunDir = new THREE.Vector3(Math.cos(sunElev) * Math.sin(sunAz), Math.sin(sunElev), Math.cos(sunElev) * Math.cos(sunAz));
  sky.sunPosition.value.copy(sunDir);
  root.add(sky);

  const sun = new THREE.DirectionalLight(0xffc89a, 1.5);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.castShadow = ctx.shadows;
  sun.shadow.mapSize.set(ctx.shadowMapSize, ctx.shadowMapSize);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  root.add(sun);
  root.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xffb27a, 0x2a2430, 0.22);
  root.add(hemi);
  const fill = new THREE.DirectionalLight(0x8aa6ff, 0.35);
  fill.position.set(-sunDir.x * 30, 12, -sunDir.z * 30);
  root.add(fill);

  // --- floor ---------------------------------------------------------------
  const planks = plankTextures();
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.02 });
  if (planks.map) floorMat.map = planks.map;
  if (planks.rough) floorMat.roughnessMap = planks.rough;
  if (planks.bump) { floorMat.bumpMap = planks.bump; floorMat.bumpScale = 0.4; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 1, half * 2 + 1, 1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  disposables.push(floor.geometry, floorMat);

  // stone plinth / rooftop slab under the floor
  const stone = stoneTextures();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  if (stone.map) stoneMat.map = stone.map;
  if (stone.rough) stoneMat.roughnessMap = stone.rough;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 2.4, 1.2, half * 2 + 2.4), stoneMat);
  slab.position.y = -0.61;
  slab.receiveShadow = true;
  root.add(slab);
  disposables.push(slab.geometry, stoneMat);

  // --- railing with lantern posts -----------------------------------------
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4b2d1a, roughness: 0.8 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xff9a3c, emissiveIntensity: 1.6, roughness: 0.6 });
  const postGeo = new THREE.BoxGeometry(0.14, 1.1, 0.14);
  const railGeo = new THREE.BoxGeometry(2.0, 0.08, 0.08);
  const lanternGeo = new THREE.SphereGeometry(0.22, 16, 12);
  const lanterns: THREE.Mesh[] = [];
  const posts = new THREE.Group();
  const perSide = 7;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i <= perSide; i++) {
      const t = -half + (i / perSide) * half * 2;
      const post = new THREE.Mesh(postGeo, woodMat);
      post.castShadow = true;
      const pos = side === 0 ? [t, 0.55, -half] : side === 1 ? [t, 0.55, half] : side === 2 ? [-half, 0.55, t] : [half, 0.55, t];
      post.position.set(pos[0] as number, pos[1] as number, pos[2] as number);
      posts.add(post);
      if (i < perSide) {
        const rail = new THREE.Mesh(railGeo, woodMat);
        rail.position.copy(post.position).y = 1.0;
        if (side >= 2) rail.rotation.y = Math.PI / 2;
        rail.position.x += side < 2 ? half / perSide : 0;
        rail.position.z += side >= 2 ? half / perSide : 0;
        posts.add(rail);
      }
      if (i % 2 === 1 && side !== 1) {
        const lantern = new THREE.Mesh(lanternGeo, lanternMat);
        lantern.position.copy(post.position).y = 1.45;
        lanterns.push(lantern);
        posts.add(lantern);
      }
    }
  }
  root.add(posts);
  disposables.push(postGeo, railGeo, lanternGeo, woodMat, lanternMat);
  // a few real point lights on the lanterns nearest the fighters
  const lanternLights: THREE.PointLight[] = [];
  for (const idx of [1, 3, 5]) {
    const l = lanterns[idx];
    if (!l) continue;
    const pl = new THREE.PointLight(0xff9a3c, 6, 9, 2);
    pl.position.copy(l.position);
    posts.add(pl);
    lanternLights.push(pl);
  }

  // --- pagoda tower (background, behind the far railing) -------------------
  const tiles = tileTextures();
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  if (tiles.map) tileMat.map = tiles.map;
  const plaster = new THREE.MeshStandardMaterial({ color: 0x4a3326, roughness: 0.9 });
  const pagoda = new THREE.Group();
  for (let lvl = 0; lvl < 4; lvl++) {
    const w = 7 - lvl * 1.2, h = 2.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), plaster);
    body.position.y = lvl * 3.0 + h / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.95, 1.4, 4, 1), tileMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = lvl * 3.0 + h + 0.6;
    pagoda.add(body, roof);
    disposables.push(body.geometry, roof.geometry);
  }
  pagoda.position.set(-9, -4, -30);
  root.add(pagoda);
  disposables.push(tileMat, plaster);

  // --- city skyline rings (parallax layers) --------------------------------
  const windows = windowTextures(512, 10, 24, 11, 0.45);
  const windows2 = windowTextures(512, 8, 20, 23, 0.3);
  const cityMats = [windows, windows2].map((w) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x8a8ea0, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.7 });
    if (w.map) m.map = w.map;
    if (w.emissive) m.emissiveMap = w.emissive;
    return m;
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const city = new THREE.Group();
  for (let ring = 0; ring < 3; ring++) {
    const radius = 24 + ring * 18;
    const count = 22 + ring * 10;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.2;
      if (Math.abs(Math.sin(a)) < 0.2 && ring === 0 && Math.cos(a) < 0) continue; // leave the pagoda sightline
      const w = 4 + rnd() * 8, d = 4 + rnd() * 8, h = ring === 0 ? 4 + rnd() * 7 : 10 + rnd() * (14 + ring * 16);
      const m = new THREE.Mesh(boxGeo, cityMats[i % 2] as THREE.Material);
      m.scale.set(w, h, d);
      m.position.set(Math.sin(a) * radius, h / 2 - 7 - ring * 3, Math.cos(a) * radius);
      m.rotation.y = rnd() * 0.4;
      city.add(m);
    }
  }
  root.add(city);
  disposables.push(boxGeo, ...cityMats);

  // --- painted skyline backdrop (far cylinder, unlit, above the box skyline) --
  const backdropTex = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}stages/dojo/skyline.jpg`).catch(() => null);
  if (backdropTex) {
    backdropTex.colorSpace = THREE.SRGBColorSpace;
    backdropTex.wrapS = THREE.RepeatWrapping;
    backdropTex.anisotropy = 8;
    const R = 170, H = 150;
    const geo = new THREE.CylinderGeometry(R, R, H, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({ map: backdropTex, side: THREE.BackSide, fog: false });
    const cyl = new THREE.Mesh(geo, mat);
    // the image horizon sits at 67.5% from the top: align it with the camera eye line
    cyl.position.y = H / 2 - H * 0.675 + 1.2;
    root.add(cyl);
    disposables.push(geo, mat, backdropTex);
  }

  // --- environment (IBL) from the analytic sky -----------------------------
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
    id: 'dojo', name: 'Dojo Rooftop', theme: 'dojo', arena,
    root, grading: { ...DEFAULT_GRADING, exposure: 0.72, contrast: 1.12, tint: [1.04, 0.98, 0.92], saturation: 1.1, bloomStrength: 0.12, bloomThreshold: 1.6, vignette: 0.42 },
    environment, background: null, fog: new THREE.Fog(0x7a4a4a, 24, 95),
    update(dtMs: number): void {
      time += dtMs * 0.001;
      lanterns.forEach((l, i) => {
        l.position.x += Math.sin(time * 1.3 + i) * 0.0006;
        l.rotation.z = Math.sin(time * 1.1 + i * 0.7) * 0.08;
      });
      lanternLights.forEach((pl, i) => { pl.intensity = 5.5 + Math.sin(time * 7 + i * 2) * 0.6; });
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
      environment?.dispose();
    },
  };
}
