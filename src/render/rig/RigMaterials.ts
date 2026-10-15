import * as THREE from 'three/webgpu';
import type { PartMaterial } from './RigGeometry';

export interface Palette {
  skin: number; top: number; pants: number; belt: number; gloves: number; boots: number; hair: number;
}

export const PALETTES = {
  karate: { skin: 0xd9a884, top: 0xf2efe6, pants: 0xe9e4d8, belt: 0x1a1a1a, gloves: 0xc23b2a, boots: 0xd9a884, hair: 0x1b1410 },
  greybox: { skin: 0x9aa3ad, top: 0x6f7a86, pants: 0x4b545e, belt: 0x2a2f36, gloves: 0x3a4049, boots: 0x2e333a, hair: 0x3a3f46 },
  p2: { skin: 0xc48f6c, top: 0x2a5aa8, pants: 0x1b2c4f, belt: 0xe0c060, gloves: 0x1f1f24, boots: 0x1f1f24, hair: 0x2b1a12 },
} satisfies Record<string, Palette>;

let noiseTex: THREE.CanvasTexture | null = null;

/** Procedural grey noise texture used for roughness/bump variation (CC0, generated). */
export function getNoiseTexture(): THREE.CanvasTexture | null {
  if (noiseTex) return noiseTex;
  if (typeof document === 'undefined') return null;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  let seed = 12345;
  const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < size * size; i++) {
    const v = 180 + rnd() * 60;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.repeat.set(6, 6);
  return noiseTex;
}

export function makeRigMaterials(groups: PartMaterial[], palette: Palette): THREE.Material[] {
  const noise = getNoiseTexture();
  return groups.map((slot) => {
    const color = palette[slot];
    switch (slot) {
      case 'skin': {
        const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, sheen: 0.35, sheenRoughness: 0.9, sheenColor: new THREE.Color(0xffb08a), clearcoat: 0.08, clearcoatRoughness: 0.6 });
        if (noise) { m.roughnessMap = noise; }
        return m;
      }
      case 'hair': return new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.05, sheen: 0.6, sheenColor: new THREE.Color(0x443322), clearcoat: 0.3, clearcoatRoughness: 0.35 });
      case 'top': case 'pants': {
        const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.92, metalness: 0, sheen: 0.8, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) });
        if (noise) m.roughnessMap = noise;
        return m;
      }
      case 'belt': return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
      case 'gloves': return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4 });
      case 'boots': default: return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
    }
  });
}
