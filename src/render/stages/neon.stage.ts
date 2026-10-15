import * as THREE from 'three/webgpu';
import type { ArenaDef } from '@/sim/config';
import { concreteTextures, neonGlyphTexture, texRng, wetAsphaltTextures, windowTextures } from './textures';
import { DEFAULT_GRADING, type Stage, type StageContext, type StageFactory } from './Stage';
import { Instancer, type Layer } from './common';
import { makeNeonEnvironment, makeRain, makeSign, makeSteam, signFlicker, type NeonSign } from './neon.parts';

/**
 * Neon Street: a rain-soaked night street walled by low concrete barriers.
 * Wet asphalt (clearcoat + puddle roughness map reflecting a neon probe),
 * flickering glyph signs, CPU-pooled rain streaks, steam vents, parked cars
 * and facades with lit windows running off to a foggy vanishing point.
 */
export const arena: ArenaDef = { id: 'neon', name: 'Neon Street', halfX: 6500, halfZ: 6500, walls: true };
const ARENA = arena;

const createNeon: StageFactory = async (ctx: StageContext): Promise<Stage> => {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const rnd = texRng(9173);
  const half = ARENA.halfX / 1000;
  const kerb = half + 1.2;          // sidewalk starts here
  const facade = half + 3.6;        // building fronts

  // --- lights -----------------------------------------------------------------
  const moon = new THREE.DirectionalLight(0x9fb4ff, 1.3);
  moon.position.set(-14, 30, 12);
  moon.castShadow = ctx.shadows;
  moon.shadow.mapSize.set(ctx.shadowMapSize, ctx.shadowMapSize);
  moon.shadow.camera.left = -9; moon.shadow.camera.right = 9;
  moon.shadow.camera.top = 9; moon.shadow.camera.bottom = -9;
  moon.shadow.camera.near = 8; moon.shadow.camera.far = 70;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.02;
  moon.shadow.camera.updateProjectionMatrix();
  root.add(moon, moon.target);
  root.add(new THREE.HemisphereLight(0x3a4270, 0x14121c, 0.8));
  const magenta = new THREE.PointLight(0xff2fb8, 220, 24, 2);
  magenta.position.set(-6.5, 4.6, -3);
  const cyan = new THREE.PointLight(0x30e0ff, 220, 24, 2);
  cyan.position.set(6.5, 4.6, 3);
  const sodium = new THREE.PointLight(0xffb060, 160, 26, 2);
  sodium.position.set(0.5, 6.8, -10);
  root.add(magenta, cyan, sodium);

  // --- wet street + sidewalks -------------------------------------------------
  const asphalt = wetAsphaltTextures(1024, 43);
  const roadMat = new THREE.MeshPhysicalMaterial({ color: 0xe6e8f0, roughness: 1, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  if (asphalt.map) roadMat.map = asphalt.map;
  if (asphalt.rough) roadMat.roughnessMap = asphalt.rough;
  if (asphalt.bump) { roadMat.bumpMap = asphalt.bump; roadMat.bumpScale = 0.015; }
  const road = new THREE.Mesh(new THREE.PlaneGeometry(kerb * 2, 170, 1, 8), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -20;
  road.receiveShadow = true;
  root.add(road);
  disposables.push(road.geometry, roadMat);
  const concrete = concreteTextures(512, 63, false);
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.9 });
  if (concrete.map) walkMat.map = concrete.map;
  const walks = new Instancer(new THREE.BoxGeometry(1, 1, 1), walkMat, 4);
  walks.add(-(kerb + 1.3), 0.07, -20, 2.6, 0.14, 170);
  walks.add(kerb + 1.3, 0.07, -20, 2.6, 0.14, 170);
  root.add(walks.finish(true));
  disposables.push(walks.mesh.geometry, walkMat);

  // --- barriers (the walls) ---------------------------------------------------
  const barrierGeo = new THREE.BoxGeometry(2.0, 0.85, 0.5);
  const barrierSets = [concreteTextures(512, 65, false), concreteTextures(512, 66, true)].map((tex) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    if (tex.map) m.map = tex.map;
    if (tex.rough) m.roughnessMap = tex.rough;
    disposables.push(m);
    return new Instancer(barrierGeo, m, 16);
  });
  const per = Math.ceil((half * 2) / 2.05);
  for (let i = 0; i < per; i++) {
    const t = -half + 1.0 + i * 2.05;
    barrierSets[0]?.add(t, 0.425, -half - 0.26, 1, 1, 1, 0, 0, 0, 0xb9b6b0);
    barrierSets[0]?.add(t, 0.425, half + 0.26, 1, 1, 1, 0, 0, 0, 0xb9b6b0);
    barrierSets[1]?.add(-half - 0.26, 0.425, t, 1, 1, 1, 0, Math.PI / 2, 0, 0xb0ada8);
    barrierSets[1]?.add(half + 0.26, 0.425, t, 1, 1, 1, 0, Math.PI / 2, 0, 0xb0ada8);
  }
  for (const b of barrierSets) root.add(b.finish(true));
  disposables.push(barrierGeo);

  // --- facades, far towers, street furniture ----------------------------------
  const win = [windowTextures(512, 8, 18, 13, 0.3), windowTextures(512, 6, 14, 29, 0.2)];
  const facadeMats = win.map((w) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x4a4c58, roughness: 0.75, emissive: 0xffffff, emissiveIntensity: 0.55 });
    if (w.map) m.map = w.map;
    if (w.emissive) m.emissiveMap = w.emissive;
    return m;
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildings = facadeMats.map((m) => new Instancer(boxGeo, m, 60));
  let bi = 0;
  const groundFloors: [number, number, number][] = [];
  for (const side of [-1, 1]) {
    for (let z = 34; z > -96;) {
      const w = 7 + rnd() * 8, d = 10 + rnd() * 8, h = 11 + rnd() * 19;
      (buildings[bi++ % 2] as Instancer).add(side * (facade + d / 2), h / 2, z - w / 2, d, h, w);
      groundFloors.push([side * (facade - 0.12), z - w / 2, w]);
      z -= w + 0.4;
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = -70 + i * 9.5 + rnd() * 3, h = 36 + rnd() * 50;
    (buildings[i % 2] as Instancer).add(x, h / 2 - 2, -118 - rnd() * 24, 9 + rnd() * 6, h, 12);
  }
  for (const b of buildings) root.add(b.finish());
  disposables.push(boxGeo, ...facadeMats);

  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1d22, roughness: 0.6, metalness: 0.5 });
  const dark = new Instancer(boxGeo, darkMat, 160);
  for (const [x, z, w] of groundFloors) dark.add(x, 2.1, z, 0.25, 4.2, w, 0, 0, 0, 0x2a2730);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glow = new Instancer(boxGeo, glowMat, 60);
  for (let z = 26; z > -80; z -= 14) {
    for (const side of [-1, 1]) {
      dark.add(side * (kerb + 0.4), 3.4, z, 0.14, 6.8, 0.14);
      dark.add(side * (kerb - 0.3), 6.7, z, 1.5, 0.08, 0.1);
      glow.add(side * (kerb - 0.95), 6.6, z, 0.5, 0.14, 0.26, 0, 0, 0, 0xcfe4ff, 2.5);
    }
    dark.add(0, 8.2 + rnd(), z - 6, kerb * 2 + 6, 0.04, 0.04, 0, 0, 0.012);
  }
  // shop fronts: lit panels at ground level set into the facades
  const shopColors = [0xffb060, 0x60ffd0, 0xff6090, 0x80a0ff, 0xfff0a0];
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? -1 : 1, z = 20 - i * 9 - rnd() * 4;
    dark.add(side * (facade - 0.15), 1.6, z, 0.2, 3.2, 3.6);
    glow.add(side * (facade - 0.28), 1.3, z, 0.06, 1.7, 3.0, 0, 0, 0, shopColors[i % shopColors.length], 0.55);
  }
  // parked cars along the kerbs (body + cabin + tail lights)
  const carColors = [0x24262c, 0x3a2a2a, 0x202a3a, 0x2c2c2c, 0x33261c];
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1, z = 14 - i * 11 - rnd() * 3, x = side * (kerb + 0.3);
    dark.add(x, 0.8, z, 1.9, 1.1, 4.5, 0, 0, 0, carColors[i]);
    dark.add(x, 1.6, z - 0.2, 1.7, 0.6, 2.3, 0, 0, 0, carColors[i]);
    glow.add(x, 0.95, z + 2.26, 1.6, 0.14, 0.04, 0, 0, 0, 0xff2020, 2);
    glow.add(x, 0.95, z - 2.26, 1.6, 0.14, 0.04, 0, 0, 0, 0xfff0d0, 1.5);
  }
  for (const [x, z] of [[-5.2, 4.2], [kerb + 0.6, -3.5]] as const) dark.add(x, 0.03, z, 0.9, 0.06, 0.9);
  // --- neon signs ---------------------------------------------------------------
  const signs: NeonSign[] = [];
  const signDefs: [number, number, number, number, number, number, boolean][] = [
    [-1, 4.4, -14, 1.4, 5.2, 0xff2fb8, true], [1, 4.8, -17, 1.4, 5.4, 0x30e0ff, true],
    [-1, 5.6, -26, 4.2, 1.3, 0xff8a30, false], [1, 3.6, -30, 4.0, 1.2, 0x50ff90, false],
    [-1, 4.8, -38, 1.4, 5.0, 0x30e0ff, true], [1, 5.2, -46, 1.4, 5.4, 0xff2fb8, true],
    [-1, 6.0, -56, 4.4, 1.4, 0xffe040, false], [1, 4.2, 4, 1.4, 4.8, 0xff6090, true],
    [-1, 5.0, 16, 1.4, 5.0, 0x30e0ff, true], [0, 11.5, -78, 12, 4.2, 0x30e0ff, false],
  ];
  signDefs.forEach(([side, y, z, w, h, color, vertical], i) => {
    const sign = makeSign(neonGlyphTexture(256, '#ffffff', 300 + i * 7, vertical ? 4 : 1), color, w, h, i, disposables);
    sign.mesh.position.set(side * (facade - 0.35), y, z);
    sign.mesh.rotation.y = side * Math.PI / 2;
    if (side === 0) dark.add(0, y, z - 0.3, w + 0.6, h + 0.6, 0.3);
    signs.push(sign);
    root.add(sign.mesh);
  });
  // a lit intersection at the vanishing point: traffic lights and a hanging lamp cluster
  for (const x of [-9, -3, 3, 9]) glow.add(x, 7.5, -76, 0.5, 0.5, 0.2, 0, 0, 0, x < 0 ? 0xff3030 : 0x30ff60, 2.5);
  glow.add(0, 9, -80, 5, 0.4, 0.4, 0, 0, 0, 0xffc070, 1.8);
  root.add(dark.finish(true), glow.finish());
  disposables.push(darkMat, glowMat);

  // --- rain and steam -----------------------------------------------------------
  const rainCount = ctx.shadowMapSize >= 2048 ? 900 : ctx.shadowMapSize >= 1024 ? 500 : 250;
  const layers: Layer[] = [makeRain(rainCount, rnd), makeSteam(26, [-5.2, 0.05, 4.2], rnd), makeSteam(22, [kerb + 0.6, 0.15, -3.5], rnd)];
  for (const l of layers) { root.add(l.mesh); disposables.push(l); }

  const environment = makeNeonEnvironment(ctx.renderer);
  let time = 0;
  return {
    id: 'neon', name: 'Neon Street', theme: 'neon', arena: ARENA, root,
    grading: { ...DEFAULT_GRADING, exposure: 1.0, contrast: 1.12, saturation: 1.2, tint: [1.04, 0.94, 1.12], vignette: 0.5, bloomStrength: 0.55, bloomThreshold: 0.8 },
    environment, background: new THREE.Color(0x120e22), fog: new THREE.Fog(0x1a1430, 20, 115),
    update(dtMs: number): void {
      time += dtMs * 0.001;
      for (const s of signs) {
        const f = signFlicker(time, s.seed);
        s.material.color.setRGB(s.base[0] * f, s.base[1] * f, s.base[2] * f);
      }
      magenta.intensity = 210 + Math.sin(time * 11) * 16;
      cyan.intensity = 210 + Math.sin(time * 9 + 2) * 16;
      for (const l of layers) l.update(dtMs);
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
      environment?.dispose();
    },
  };
};

export default createNeon;
