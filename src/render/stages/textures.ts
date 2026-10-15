import * as THREE from 'three/webgpu';

/** Deterministic LCG for procedural textures (render-only, never the sim). */
export function texRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

function finish(c: HTMLCanvasElement, repeat: number, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TexSet { map: THREE.Texture | null; rough: THREE.Texture | null; bump: THREE.Texture | null }

/** Warm wooden planks with grain; returns colour + roughness + bump maps. */
export function plankTextures(size = 1024, planks = 8, seed = 7): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  const pw = size / planks;
  for (let p = 0; p < planks; p++) {
    const base = 0.78 + rnd() * 0.2;
    const hue = 26 + rnd() * 10;
    const offset = Math.floor(rnd() * size);
    for (let y = 0; y < size; y++) {
      const grain = Math.sin((y + offset) * 0.09 + Math.sin((y + offset) * 0.013) * 4) * 0.5 + 0.5;
      const v = base * (0.82 + grain * 0.18);
      cx.fillStyle = `hsl(${hue}, ${40 + grain * 15}%, ${v * 38}%)`;
      cx.fillRect(p * pw, y, pw, 1);
      const r = 150 + grain * 60 + rnd() * 20;
      rx.fillStyle = `rgb(${r},${r},${r})`;
      rx.fillRect(p * pw, y, pw, 1);
    }
    // plank seams and nail heads
    cx.fillStyle = 'rgba(20,10,5,0.9)';
    cx.fillRect(p * pw, 0, 3, size);
    rx.fillStyle = 'rgb(230,230,230)';
    rx.fillRect(p * pw, 0, 3, size);
    for (let k = 0; k < 6; k++) {
      const yy = Math.floor(rnd() * size);
      cx.fillStyle = 'rgba(10,8,6,0.8)';
      cx.fillRect(p * pw, yy, pw, 2);
    }
  }
  const bump = rx.getImageData(0, 0, size, size);
  const bc = canvas(size);
  if (bc) bc[1].putImageData(bump, 0, 0);
  return { map: finish(cc, 1, true), rough: finish(rc, 1, false), bump: bc ? finish(bc[0], 1, false) : null };
}

/** Grey stone blocks (walls / plinths). */
export function stoneTextures(size = 512, seed = 3): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#4a4a4c'; cx.fillRect(0, 0, size, size);
  rx.fillStyle = '#c8c8c8'; rx.fillRect(0, 0, size, size);
  const rows = 6, bw = size / 4, bh = size / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let b = -1; b < 5; b++) {
      const l = 52 + rnd() * 14;
      cx.fillStyle = `hsl(${30 + rnd() * 20}, ${4 + rnd() * 6}%, ${l * 0.55}%)`;
      cx.fillRect(b * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
      const rr = 170 + rnd() * 50;
      rx.fillStyle = `rgb(${rr},${rr},${rr})`;
      rx.fillRect(b * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
    }
  }
  // speckle
  for (let i = 0; i < 4000; i++) {
    const x = rnd() * size, y = rnd() * size;
    cx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
    cx.fillRect(x, y, 2, 2);
  }
  return { map: finish(cc, 2, true), rough: finish(rc, 2, false), bump: finish(rc, 2, false) };
}

/** Night-city facade: dark building with lit windows (emissive map). */
export function windowTextures(size = 256, cols = 6, rows = 12, seed = 11, litChance = 0.55): { map: THREE.Texture | null; emissive: THREE.Texture | null } {
  const col = canvas(size), em = canvas(size);
  if (!col || !em) return { map: null, emissive: null };
  const [cc, cx] = col, [ec, ex] = em;
  const rnd = texRng(seed);
  cx.fillStyle = '#23252e'; cx.fillRect(0, 0, size, size);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, size, size);
  const w = size / cols, h = size / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lit = rnd() < litChance;
    cx.fillStyle = lit ? '#3a3528' : '#101216';
    cx.fillRect(c * w + w * 0.2, r * h + h * 0.22, w * 0.6, h * 0.56);
    if (lit) {
      const warm = rnd();
      ex.fillStyle = warm > 0.3 ? `rgb(${255},${190 + rnd() * 50},${120 + rnd() * 80})` : `rgb(${150 + rnd() * 60},${200},${255})`;
      ex.fillRect(c * w + w * 0.2, r * h + h * 0.22, w * 0.6, h * 0.56);
    }
  }
  return { map: finish(cc, 1, true), emissive: finish(ec, 1, true) };
}

/** Dark roof tiles with a ridged pattern. */
export function tileTextures(size = 256, seed = 5): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#23262c'; cx.fillRect(0, 0, size, size);
  rx.fillStyle = '#b0b0b0'; rx.fillRect(0, 0, size, size);
  const tw = size / 8, th = size / 6;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
    const l = 16 + rnd() * 8;
    cx.fillStyle = `hsl(215, 12%, ${l}%)`;
    cx.beginPath(); cx.ellipse(c * tw + tw / 2 + (r % 2) * tw * 0.5, r * th + th * 0.6, tw * 0.48, th * 0.55, 0, Math.PI, 0); cx.fill();
    cx.fillStyle = 'rgba(0,0,0,0.5)'; cx.fillRect(c * tw, r * th + th - 2, tw, 2);
  }
  return { map: finish(cc, 3, true), rough: finish(rc, 3, false), bump: finish(rc, 3, false) };
}
