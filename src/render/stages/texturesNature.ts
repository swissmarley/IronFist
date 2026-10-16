import * as THREE from 'three/webgpu';
import { texRng, type TexSet } from './textures';

/**
 * Procedural canvas textures for the bamboo-forest and colosseum stages.
 * (Kept separate from textures.ts, which is being extended elsewhere.)
 */

type Ctx2D = CanvasRenderingContext2D;

function canvas2(w: number, h = w): [HTMLCanvasElement, Ctx2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

function finish2(c: HTMLCanvasElement, repeatX: number, repeatY: number, srgb: boolean, wrap = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(cx: Ctx2D, rnd: () => number, size: number, n: number, light: string, dark: string, dot = 2): void {
  for (let i = 0; i < n; i++) {
    cx.fillStyle = rnd() > 0.5 ? light : dark;
    cx.fillRect(rnd() * size, rnd() * size, dot, dot);
  }
}

function blotches(cx: Ctx2D, rnd: () => number, size: number, n: number, color: (r: number) => string, rMin: number, rMax: number): void {
  for (let i = 0; i < n; i++) {
    const r = rMin + rnd() * (rMax - rMin);
    cx.fillStyle = color(rnd());
    cx.beginPath(); cx.ellipse(rnd() * size, rnd() * size, r, r * (0.5 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2); cx.fill();
  }
}

/** Mossy flagstones for the forest clearing: irregular grey slabs with green moss in the joints. */
export function mossStoneTextures(size = 1024, cells = 6, seed = 41): TexSet {
  const col = canvas2(size), rgh = canvas2(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#2b3322'; cx.fillRect(0, 0, size, size);
  rx.fillStyle = '#e0e0e0'; rx.fillRect(0, 0, size, size);
  const cw = size / cells;
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
    const jx = (rnd() - 0.5) * cw * 0.25, jy = (rnd() - 0.5) * cw * 0.25;
    const w = cw * (0.7 + rnd() * 0.22), h = cw * (0.7 + rnd() * 0.22);
    const l = 24 + rnd() * 13;
    cx.fillStyle = `hsl(${70 + rnd() * 40}, ${5 + rnd() * 6}%, ${l}%)`;
    cx.beginPath(); cx.roundRect(c * cw + jx + (cw - w) / 2, r * cw + jy + (cw - h) / 2, w, h, cw * (0.04 + rnd() * 0.08)); cx.fill();
    const rr = 150 + rnd() * 50;
    rx.fillStyle = `rgb(${rr},${rr},${rr})`;
    rx.beginPath(); rx.roundRect(c * cw + jx + (cw - w) / 2, r * cw + jy + (cw - h) / 2, w, h, cw * 0.12); rx.fill();
  }
  blotches(cx, rnd, size, 140, (v) => `hsla(${90 + v * 30}, 40%, ${20 + v * 12}%, 0.4)`, 6, 30);
  blotches(cx, rnd, size, 600, (v) => `hsla(${85 + v * 30}, 35%, ${18 + v * 14}%, 0.35)`, 2, 6);
  speckle(cx, rnd, size, 8000, 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.16)');
  const bump = canvas2(size);
  if (bump) bump[1].drawImage(rc, 0, 0);
  return { map: finish2(cc, 2, 2, true), rough: finish2(rc, 2, 2, false), bump: bump ? finish2(bump[0], 2, 2, false) : null };
}

/** Forest floor: dark earth with leaf litter and moss. */
export function forestFloorTexture(size = 512, seed = 43): THREE.Texture | null {
  const col = canvas2(size);
  if (!col) return null;
  const [cc, cx] = col;
  const rnd = texRng(seed);
  cx.fillStyle = '#2a2418'; cx.fillRect(0, 0, size, size);
  blotches(cx, rnd, size, 120, (v) => `hsla(${90 + v * 40}, 35%, ${18 + v * 14}%, 0.6)`, 10, 60);
  blotches(cx, rnd, size, 500, (v) => `hsla(${30 + v * 30}, 40%, ${22 + v * 18}%, 0.7)`, 2, 7);
  speckle(cx, rnd, size, 3000, 'rgba(200,180,120,0.12)', 'rgba(0,0,0,0.2)');
  return finish2(cc, 12, 12, true);
}

/** Bamboo culm: green gradient with dark node rings; v runs along the stalk. */
export function bambooTexture(size = 256, seed = 47): THREE.Texture | null {
  const col = canvas2(size, size * 2);
  if (!col) return null;
  const [cc, cx] = col;
  const rnd = texRng(seed);
  const h = size * 2;
  const grad = cx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, '#4a6a32'); grad.addColorStop(0.35, '#7d9c52'); grad.addColorStop(0.7, '#5f7e3c'); grad.addColorStop(1, '#3a5428');
  cx.fillStyle = grad; cx.fillRect(0, 0, size, h);
  for (let y = 0; y < h; y++) {
    if (rnd() < 0.3) { cx.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 40},0,0.05)`; cx.fillRect(0, y, size, 1); }
  }
  for (let n = 0; n < 4; n++) {
    const y = n * (h / 4) + h / 8;
    cx.fillStyle = 'rgba(40,50,20,0.7)'; cx.fillRect(0, y - 3, size, 5);
    cx.fillStyle = 'rgba(220,210,150,0.4)'; cx.fillRect(0, y - 5, size, 2);
    cx.fillStyle = 'rgba(0,0,0,0.18)'; cx.fillRect(0, y + 2, size, 8);
  }
  return finish2(cc, 1, 1, true);
}

/** Leaf cluster (alpha cut-out) for bamboo canopy sprites and drifting leaves. */
export function leafClusterTexture(size = 256, seed = 53, single = false): THREE.Texture | null {
  const col = canvas2(size);
  if (!col) return null;
  const [cc, cx] = col;
  const rnd = texRng(seed);
  cx.clearRect(0, 0, size, size);
  const n = single ? 1 : 14;
  for (let i = 0; i < n; i++) {
    const x = single ? size / 2 : size * (0.2 + rnd() * 0.6), y = single ? size / 2 : size * (0.2 + rnd() * 0.6);
    const len = single ? size * 0.42 : size * (0.18 + rnd() * 0.16), wid = len * 0.22;
    const a = single ? 0 : rnd() * Math.PI;
    cx.fillStyle = `hsl(${85 + rnd() * 30}, ${45 + rnd() * 20}%, ${single ? 48 : 30 + rnd() * 18}%)`;
    cx.save(); cx.translate(x, y); cx.rotate(a);
    cx.beginPath(); cx.moveTo(-len, 0); cx.quadraticCurveTo(0, -wid, len, 0); cx.quadraticCurveTo(0, wid, -len, 0); cx.fill();
    cx.strokeStyle = 'rgba(30,50,15,0.6)'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(-len, 0); cx.lineTo(len, 0); cx.stroke();
    cx.restore();
  }
  return finish2(cc, 1, 1, true, false);
}

/** Soft vertical light-shaft gradient (additive): bright core fading to the sides and the bottom. */
export function shaftTexture(size = 256): THREE.Texture | null {
  const col = canvas2(size);
  if (!col) return null;
  const [cc, cx] = col;
  const img = cx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * 2 - 1, v = y / size;
    const side = Math.max(0, 1 - u * u) ** 2;
    const fall = (1 - v) ** 1.6 * Math.min(1, v * 6);
    const a = Math.round(255 * side * fall);
    const i = (y * size + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 245; img.data[i + 2] = 215; img.data[i + 3] = a;
  }
  cx.putImageData(img, 0, 0);
  return finish2(cc, 1, 1, true, false);
}

/** Water ripple bump map (tiled) for the forest stream. */
export function rippleTexture(size = 256, seed = 59): THREE.Texture | null {
  const col = canvas2(size);
  if (!col) return null;
  const [cc, cx] = col;
  const rnd = texRng(seed);
  const img = cx.createImageData(size, size);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * Math.PI * 2, fy = (y / size) * Math.PI * 2;
    const v = Math.sin(fx * 3 + (ph[0] ?? 0) + Math.sin(fy * 2)) * 0.5 + Math.sin(fy * 5 + fx * 2 + (ph[1] ?? 0)) * 0.3 + Math.sin((fx + fy) * 7 + (ph[2] ?? 0)) * 0.2;
    const g = Math.round(128 + v * 90);
    const i = (y * size + x) * 4;
    img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return finish2(cc, 6, 1, false);
}

/** Distant forest wall: dark misty verticals (unlit backdrop cylinder). */
export function distantForestTexture(size = 512, seed = 61): THREE.Texture | null {
  const col = canvas2(size);
  if (!col) return null;
  const [cc, cx] = col;
  const rnd = texRng(seed);
  const grad = cx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#8aa284'); grad.addColorStop(0.45, '#56704c'); grad.addColorStop(1, '#25361e');
  cx.fillStyle = grad; cx.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * size, w = 2 + rnd() * 5, top = rnd() * size * 0.5;
    cx.fillStyle = `hsla(${95 + rnd() * 25}, 25%, ${22 + rnd() * 18}%, ${0.35 + rnd() * 0.4})`;
    cx.fillRect(x, top, w, size - top);
  }
  blotches(cx, rnd, size, 90, (v) => `hsla(${100 + v * 20}, 30%, ${30 + v * 20}%, 0.35)`, 15, 45);
  return finish2(cc, 4, 1, true);
}

/** Arena sand: warm, with darker worn patches and drag lines. */
export function sandTextures(size = 1024, seed = 71): TexSet {
  const col = canvas2(size), rgh = canvas2(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#b8956a'; cx.fillRect(0, 0, size, size);
  rx.fillStyle = '#d8d8d8'; rx.fillRect(0, 0, size, size);
  blotches(cx, rnd, size, 60, (v) => `hsla(${28 + v * 10}, 35%, ${38 + v * 14}%, 0.35)`, 30, 140);
  blotches(cx, rnd, size, 40, (v) => `hsla(${35 + v * 10}, 45%, ${66 + v * 10}%, 0.35)`, 20, 90);
  for (let i = 0; i < 70; i++) {
    cx.strokeStyle = `rgba(90,60,30,${0.12 + rnd() * 0.18})`; cx.lineWidth = 1 + rnd() * 3;
    const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI, l = 40 + rnd() * 200;
    cx.beginPath(); cx.moveTo(x, y); cx.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); cx.stroke();
  }
  speckle(cx, rnd, size, 9000, 'rgba(255,240,200,0.14)', 'rgba(60,40,20,0.14)', 2);
  speckle(rx, rnd, size, 4000, 'rgb(240,240,240)', 'rgb(170,170,170)', 3);
  return { map: finish2(cc, 2, 2, true), rough: finish2(rc, 2, 2, false), bump: finish2(rc, 2, 2, false) };
}

/** Warm sandstone ashlar blocks for the colosseum walls and tiers. */
export function sandstoneTextures(size = 512, rows = 5, seed = 73): TexSet {
  const col = canvas2(size), rgh = canvas2(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#4f3d28'; cx.fillRect(0, 0, size, size);
  rx.fillStyle = '#c0c0c0'; rx.fillRect(0, 0, size, size);
  const bh = size / rows, bw = size / 3;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let b = -1; b < 4; b++) {
      cx.fillStyle = `hsl(${30 + rnd() * 10}, ${26 + rnd() * 12}%, ${28 + rnd() * 12}%)`;
      cx.fillRect(b * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
      const rr = 180 + rnd() * 40;
      rx.fillStyle = `rgb(${rr},${rr},${rr})`;
      rx.fillRect(b * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
    }
  }
  blotches(cx, rnd, size, 50, (v) => `hsla(${25 + v * 15}, 30%, ${30 + v * 20}%, 0.25)`, 10, 50);
  speckle(cx, rnd, size, 5000, 'rgba(255,240,210,0.1)', 'rgba(40,20,0,0.14)');
  return { map: finish2(cc, 2, 2, true), rough: finish2(rc, 2, 2, false), bump: finish2(rc, 2, 2, false) };
}

/** Arcade facade: a row of dark arches in sandstone, with a cornice. One tile = one arch. */
export function arcadeTexture(size = 256, seed = 79): THREE.Texture | null {
  const col = canvas2(size, size * 2);
  if (!col) return null;
  const [cc, cx] = col;
  const rnd = texRng(seed);
  const h = size * 2;
  cx.fillStyle = '#a88a5e'; cx.fillRect(0, 0, size, h);
  for (let y = 0; y < h; y += 24) { cx.fillStyle = 'rgba(0,0,0,0.18)'; cx.fillRect(0, y, size, 2); }
  for (let i = 0; i < 40; i++) { cx.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 230 : 0},0,0.05)`; cx.fillRect(rnd() * size, rnd() * h, 30, 24); }
  // arch opening (dark, with a warm inner glow at the bottom)
  const aw = size * 0.46, ah = h * 0.62, ax = size / 2, ay = h * 0.86;
  cx.fillStyle = '#1d1410';
  cx.beginPath(); cx.moveTo(ax - aw / 2, ay); cx.lineTo(ax - aw / 2, ay - ah + aw / 2); cx.arc(ax, ay - ah + aw / 2, aw / 2, Math.PI, 0); cx.lineTo(ax + aw / 2, ay); cx.closePath(); cx.fill();
  const g = cx.createLinearGradient(0, ay - ah * 0.4, 0, ay);
  g.addColorStop(0, 'rgba(255,140,60,0)'); g.addColorStop(1, 'rgba(255,140,60,0.28)');
  cx.fillStyle = g; cx.fillRect(ax - aw / 2, ay - ah * 0.4, aw, ah * 0.4);
  // keystone + voussoirs
  cx.strokeStyle = 'rgba(70,45,20,0.8)'; cx.lineWidth = 6;
  cx.beginPath(); cx.arc(ax, ay - ah + aw / 2, aw / 2 + 4, Math.PI, 0); cx.stroke();
  cx.fillStyle = '#c7ab7a'; cx.fillRect(ax - 10, ay - ah - 14, 20, 26);
  // cornice at the top
  cx.fillStyle = '#5a4428'; cx.fillRect(0, 0, size, 10);
  cx.fillStyle = '#c2a470'; cx.fillRect(0, 10, size, 8);
  return finish2(cc, 1, 1, true);
}

/** Hanging banner: coloured field, gold trim and an original ring-and-bar emblem. */
export function bannerTexture(hue: number, size = 128): THREE.Texture | null {
  const col = canvas2(size, size * 2);
  if (!col) return null;
  const [cc, cx] = col;
  const h = size * 2;
  cx.fillStyle = `hsl(${hue}, 60%, 32%)`; cx.fillRect(0, 0, size, h);
  cx.fillStyle = `hsl(${hue}, 55%, 26%)`;
  for (let y = 0; y < h; y += 6) if ((y / 6) % 3 === 0) cx.fillRect(0, y, size, 2);
  cx.strokeStyle = '#d9b457'; cx.lineWidth = 6; cx.strokeRect(8, 8, size - 16, h - 16);
  cx.fillStyle = '#e8c86a';
  cx.beginPath(); cx.arc(size / 2, h * 0.42, size * 0.26, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = `hsl(${hue}, 60%, 32%)`;
  cx.beginPath(); cx.arc(size / 2, h * 0.42, size * 0.17, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#e8c86a'; cx.fillRect(size * 0.2, h * 0.62, size * 0.6, 10); cx.fillRect(size * 0.3, h * 0.7, size * 0.4, 8);
  return finish2(cc, 1, 1, true, false);
}

/** Flame billboard: additive teardrop gradient. */
export function flameTexture(size = 128): THREE.Texture | null {
  const col = canvas2(size);
  if (!col) return null;
  const [cc, cx] = col;
  const img = cx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * 2 - 1, v = 1 - y / size;
    const w = 0.55 * (1 - v * 0.75) + 0.1;
    const core = Math.max(0, 1 - (u / w) ** 2) * Math.max(0, 1 - Math.abs(v - 0.35) / 0.65);
    const a = Math.round(255 * Math.min(1, core * 1.4) ** 1.5);
    const i = (y * size + x) * 4;
    img.data[i] = 255; img.data[i + 1] = Math.round(120 + 135 * core); img.data[i + 2] = Math.round(30 + 120 * core * core); img.data[i + 3] = a;
  }
  cx.putImageData(img, 0, 0);
  return finish2(cc, 1, 1, true, false);
}
