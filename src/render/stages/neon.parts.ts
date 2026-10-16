import * as THREE from 'three/webgpu';
import { float, length, oneMinus, smoothstep, uv, vec3 } from 'three/tsl';
import { type Layer, makeSpriteBatch, SPRITE_STRIDE } from './common';

/** Building blocks for the Neon Street stage: rain, steam vents, neon signs and the reflection probe scene. */

/** Falling rain streaks: pooled billboards that wrap from the bottom of the box back to the top. */
export function makeRain(count: number, rnd: () => number, box = 15, height = 13): Layer {
  const s = makeSpriteBatch(count, 8);
  const m = s.material;
  m.blending = THREE.AdditiveBlending;
  const v = uv().y;
  const tip = smoothstep(float(0), float(0.3), v).mul(oneMinus(smoothstep(float(0.7), float(1), v)));
  m.colorNode = vec3(0.55, 0.68, 0.85).mul(tip);
  m.opacityNode = tip.mul(s.misc.z);
  m.fog = true;
  const d = s.batch.data;
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * SPRITE_STRIDE;
    d[o] = (rnd() * 2 - 1) * box; d[o + 1] = rnd() * height; d[o + 2] = (rnd() * 2 - 1) * box; d[o + 3] = 0;
    d[o + 4] = 0.012 + rnd() * 0.008; d[o + 5] = 24 + rnd() * 14; d[o + 6] = 0.25 + rnd() * 0.3; d[o + 7] = 0;
    speed[i] = 8 + rnd() * 4;
  }
  s.batch.upload(count);
  return {
    mesh: s.mesh,
    update(dtMs: number): void {
      const dt = Math.min(dtMs, 100) * 0.001;
      for (let i = 0; i < count; i++) {
        const o = i * SPRITE_STRIDE;
        let y = (d[o + 1] as number) - (speed[i] as number) * dt;
        let x = (d[o] as number) + dt * 0.8;
        if (y < 0) { y += height; x = (rnd() * 2 - 1) * box; d[o + 2] = (rnd() * 2 - 1) * box; }
        if (x > box) x -= box * 2;
        d[o] = x; d[o + 1] = y;
      }
      s.batch.upload(count);
    },
    dispose(): void { s.batch.dispose(); m.dispose(); },
  };
}

/** Soft steam puffs rising from a vent: each puff grows, drifts and fades, then respawns at the vent. */
export function makeSteam(count: number, vent: [number, number, number], rnd: () => number): Layer {
  const s = makeSpriteBatch(count, 7);
  const m = s.material;
  const r = length(uv().sub(0.5).mul(2));
  const soft = oneMinus(smoothstep(float(0.15), float(1), r));
  m.colorNode = vec3(0.82, 0.84, 0.92);
  m.opacityNode = soft.mul(soft).mul(s.misc.z);
  m.fog = true;
  const d = s.batch.data;
  const life = new Float32Array(count * 3); // age, duration, drift x
  const spawn = (i: number): void => {
    const o = i * SPRITE_STRIDE;
    d[o] = vent[0] + (rnd() - 0.5) * 0.4; d[o + 1] = vent[1]; d[o + 2] = vent[2] + (rnd() - 0.5) * 0.4; d[o + 3] = 0;
    d[o + 4] = 0.3; d[o + 5] = 1; d[o + 6] = 0; d[o + 7] = 0;
    life[i * 3] = 0; life[i * 3 + 1] = 1.8 + rnd() * 1.6; life[i * 3 + 2] = (rnd() - 0.5) * 0.5;
  };
  for (let i = 0; i < count; i++) { spawn(i); life[i * 3] = rnd() * (life[i * 3 + 1] as number); }
  s.batch.upload(count);
  return {
    mesh: s.mesh,
    update(dtMs: number): void {
      const dt = Math.min(dtMs, 100) * 0.001;
      for (let i = 0; i < count; i++) {
        const o = i * SPRITE_STRIDE;
        const age = (life[i * 3] as number) + dt, dur = life[i * 3 + 1] as number;
        if (age > dur) { spawn(i); continue; }
        life[i * 3] = age;
        const k = age / dur;
        d[o] = (d[o] as number) + (life[i * 3 + 2] as number) * dt;
        d[o + 1] = (d[o + 1] as number) + (1.1 - k * 0.6) * dt;
        d[o + 4] = 0.35 + k * 1.4;
        d[o + 6] = Math.sin(k * Math.PI) * 0.5;
      }
      s.batch.upload(count);
    },
    dispose(): void { s.batch.dispose(); m.dispose(); },
  };
}

export interface NeonSign { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; base: [number, number, number]; seed: number }

/** An emissive glyph panel; `color` is linear RGB scaled up for bloom. */
export function makeSign(map: THREE.Texture | null, color: number, w: number, h: number, seed: number, disposables: { dispose(): void }[]): NeonSign {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  if (map) material.map = map;
  const c = new THREE.Color(color);
  const base: [number, number, number] = [c.r * 1.7, c.g * 1.7, c.b * 1.7];
  material.color.setRGB(base[0], base[1], base[2]);
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, material);
  disposables.push(geo, material);
  return { mesh, material, base, seed };
}

/** Deterministic flicker curve for a sign: subtle buzz plus occasional dropouts. */
export function signFlicker(t: number, seed: number): number {
  const buzz = 1 + Math.sin(t * 23 + seed * 3.1) * 0.08 + Math.sin(t * 7.3 + seed) * 0.05;
  const gate = Math.sin(t * 1.7 + seed * 5.3) * Math.sin(t * 0.37 + seed);
  return gate > 0.93 ? buzz * 0.15 : buzz;
}

/**
 * Reflection probe scene for the wet asphalt: a near-black sphere with a few
 * bright coloured panels where the neon and the street lamps sit, so puddles
 * and the clearcoat pick up magenta/cyan highlights without a sky.
 */
export function makeNeonEnvironment(renderer: THREE.WebGPURenderer): THREE.Texture | null {
  try {
    const scene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: 0x07070d, side: THREE.BackSide }));
    scene.add(dome);
    const panel = (color: number, x: number, y: number, z: number, w: number, h: number, ry: number, boost = 3): void => {
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      mat.color.multiplyScalar(boost);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      scene.add(mesh);
    };
    panel(0xff2fb8, -14, 5, -4, 6, 4, Math.PI / 2);
    panel(0xff2fb8, -14, 9, 12, 3, 6, Math.PI / 2);
    panel(0x30e0ff, 14, 5, 4, 6, 4, -Math.PI / 2);
    panel(0x30e0ff, 14, 10, -14, 3, 7, -Math.PI / 2);
    panel(0xffb060, 0, 12, -30, 10, 4, 0);
    panel(0x8090ff, 4, 20, 0, 6, 6, 0);
    panel(0x303a60, 0, 40, 0, 50, 50, 0, 1);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(scene, 0.02).texture;
    pmrem.dispose();
    scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    return tex;
  } catch (err) {
    console.warn('neon reflection probe unavailable', err);
    return null;
  }
}
