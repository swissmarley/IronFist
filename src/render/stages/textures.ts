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

/** Weathered boards in any hue (pier decks, barn walls): colour + roughness + bump. */
export function boardTextures(size = 1024, boards = 10, seed = 21, hue = 34, sat = 14, light = 30): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  const pw = size / boards;
  for (let p = 0; p < boards; p++) {
    const base = 0.8 + rnd() * 0.25, off = rnd() * 1000;
    for (let y = 0; y < size; y++) {
      const grain = Math.sin((y + off) * 0.07 + Math.sin((y + off) * 0.011) * 5) * 0.5 + 0.5;
      cx.fillStyle = `hsl(${hue + rnd() * 4}, ${sat + grain * 8}%, ${light * base * (0.85 + grain * 0.15)}%)`;
      cx.fillRect(p * pw, y, pw, 1);
      const r = 180 + grain * 50 + rnd() * 15;
      rx.fillStyle = `rgb(${r},${r},${r})`;
      rx.fillRect(p * pw, y, pw, 1);
    }
    cx.fillStyle = 'rgba(0,0,0,0.85)'; cx.fillRect(p * pw, 0, 4, size);
    rx.fillStyle = 'rgb(240,240,240)'; rx.fillRect(p * pw, 0, 4, size);
    for (let k = 0; k < 4; k++) { cx.fillStyle = 'rgba(0,0,0,0.7)'; cx.fillRect(p * pw, Math.floor(rnd() * size), pw, 3); }
    for (let k = 0; k < 10; k++) { cx.fillStyle = 'rgba(40,30,20,0.9)'; cx.fillRect(p * pw + pw * 0.2 + rnd() * pw * 0.6, rnd() * size, 5, 5); }
  }
  return { map: finish(cc, 1, true), rough: finish(rc, 1, false), bump: finish(rc, 1, false) };
}

/** Corrugated steel (shipping containers): light base so instance colours tint it; ribs + rust. */
export function containerTextures(size = 512, seed = 31): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  for (let x = 0; x < size; x++) {
    const rib = Math.sin(x * Math.PI / 16) * 0.5 + 0.5;
    const l = 62 + rib * 28;
    cx.fillStyle = `hsl(0, 0%, ${l}%)`; cx.fillRect(x, 0, 1, size);
    rx.fillStyle = `rgb(${150 + rib * 60},${150 + rib * 60},${150 + rib * 60})`; rx.fillRect(x, 0, 1, size);
  }
  for (let i = 0; i < 700; i++) {
    const x = rnd() * size, y = rnd() * size, r = 2 + rnd() * 10;
    cx.fillStyle = `rgba(90,45,20,${0.08 + rnd() * 0.3})`;
    cx.beginPath(); cx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); cx.fill();
  }
  cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(0, 0, size, 6); cx.fillRect(0, size - 6, size, 6);
  return { map: finish(cc, 1, true), rough: finish(rc, 1, false), bump: finish(rc, 1, false) };
}

/** Horizontal alpha ramp (opaque at u=0 → transparent at u=1); for light beams and glows. */
export function alphaRampTexture(size = 256, power = 1.6): THREE.CanvasTexture | null {
  const c = canvas(size);
  if (!c) return null;
  const [cc, cx] = c;
  for (let x = 0; x < size; x++) {
    const a = Math.pow(1 - x / (size - 1), power);
    cx.fillStyle = `rgba(255,255,255,${a})`; cx.fillRect(x, 0, 1, size);
  }
  const t = new THREE.CanvasTexture(cc);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Two-frame bird silhouette sprite sheet (wings up | wings down) in a flat colour. */
export function birdSpriteTexture(size = 128, color = '#f4f4f0'): THREE.CanvasTexture | null {
  const c = canvas(size);
  if (!c) return null;
  const [cc, cx] = c;
  cx.clearRect(0, 0, size, size);
  const w = size / 2;
  for (let f = 0; f < 2; f++) {
    const ox = f * w, cy = size * 0.5, lift = f === 0 ? -w * 0.28 : w * 0.22;
    cx.strokeStyle = color; cx.lineWidth = w * 0.09; cx.lineCap = 'round';
    cx.beginPath();
    cx.moveTo(ox + w * 0.06, cy + lift);
    cx.quadraticCurveTo(ox + w * 0.3, cy - lift * 0.3, ox + w * 0.5, cy + w * 0.04);
    cx.quadraticCurveTo(ox + w * 0.7, cy - lift * 0.3, ox + w * 0.94, cy + lift);
    cx.stroke();
    cx.fillStyle = color;
    cx.beginPath(); cx.ellipse(ox + w * 0.5, cy + w * 0.06, w * 0.1, w * 0.045, 0, 0, Math.PI * 2); cx.fill();
  }
  const t = new THREE.CanvasTexture(cc);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wet asphalt: dark tarmac with lane paint and drain grates; roughness map carries the puddles. */
export function wetAsphaltTextures(size = 1024, seed = 41): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#2a2c33'; cx.fillRect(0, 0, size, size);
  for (let i = 0; i < 30000; i++) {
    const v = 26 + rnd() * 34;
    cx.fillStyle = `rgba(${v},${v},${v + 4},0.6)`; cx.fillRect(rnd() * size, rnd() * size, 2, 2);
  }
  cx.fillStyle = 'rgba(200,190,150,0.55)';
  for (let y = 0; y < size; y += size / 8) cx.fillRect(size * 0.49, y + size * 0.02, size * 0.02, size / 8 * 0.5);
  cx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 40; i++) { const x = rnd() * size, y = rnd() * size; cx.fillRect(x, y, 2 + rnd() * 60, 2); }
  rx.fillStyle = '#b4b4b4'; rx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size, y = rnd() * size, r = 20 + rnd() * 70;
    const g = rx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, 'rgba(40,40,40,1)'); g.addColorStop(0.8, 'rgba(60,60,60,0.9)'); g.addColorStop(1, 'rgba(180,180,180,0)');
    rx.fillStyle = g; rx.beginPath(); rx.ellipse(x, y, r * (1.2 + rnd()), r * 0.6, rnd() * 3, 0, Math.PI * 2); rx.fill();
  }
  for (let i = 0; i < 6000; i++) { const v = 120 + rnd() * 80; rx.fillStyle = `rgba(${v},${v},${v},0.5)`; rx.fillRect(rnd() * size, rnd() * size, 3, 3); }
  return { map: finish(cc, 2, true), rough: finish(rc, 2, false), bump: finish(rc, 2, false) };
}

/** Glyph-like neon strokes on a transparent background with a soft glow; vertical column layout. */
export function neonGlyphTexture(size = 256, color = '#ff40c0', seed = 51, glyphs = 4): THREE.CanvasTexture | null {
  const c = canvas(size);
  if (!c) return null;
  const [cc, cx] = c;
  const rnd = texRng(seed);
  cx.clearRect(0, 0, size, size);
  const cell = size / glyphs, pad = cell * 0.18;
  cx.strokeStyle = color; cx.lineCap = 'round'; cx.lineJoin = 'round';
  cx.shadowColor = color; cx.shadowBlur = cell * 0.12;
  const w = size, gx = (w - cell) / 2;
  for (let g = 0; g < glyphs; g++) {
    const top = g * cell + pad, left = gx + pad, span = cell - pad * 2;
    const strokes = 3 + Math.floor(rnd() * 4);
    cx.lineWidth = cell * 0.07;
    for (let s = 0; s < strokes; s++) {
      const horiz = rnd() > 0.45;
      const a = rnd(), b = rnd();
      cx.beginPath();
      if (horiz) { cx.moveTo(left + span * (0.05 + a * 0.25), top + span * b); cx.lineTo(left + span * (0.7 + rnd() * 0.3), top + span * b); }
      else { cx.moveTo(left + span * a, top + span * (0.05 + b * 0.25)); cx.lineTo(left + span * a, top + span * (0.7 + rnd() * 0.3)); }
      cx.stroke();
    }
    if (rnd() > 0.5) { cx.beginPath(); cx.moveTo(left + span * 0.2, top + span * 0.8); cx.lineTo(left + span * 0.8, top + span * 0.35); cx.stroke(); }
  }
  cx.shadowBlur = 0;
  const t = new THREE.CanvasTexture(cc);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Concrete with optional diagonal hazard stripes along the top band (jersey barriers). */
export function concreteTextures(size = 512, seed = 61, hazard = false): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#8c8a86'; cx.fillRect(0, 0, size, size);
  rx.fillStyle = '#d2d2d2'; rx.fillRect(0, 0, size, size);
  for (let i = 0; i < 12000; i++) { const v = 110 + rnd() * 60; cx.fillStyle = `rgba(${v},${v - 4},${v - 8},0.5)`; cx.fillRect(rnd() * size, rnd() * size, 3, 3); }
  for (let i = 0; i < 24; i++) { cx.fillStyle = 'rgba(40,36,30,0.55)'; const y = rnd() * size; cx.fillRect(rnd() * size, y, 2, 10 + rnd() * 60); cx.fillRect(0, size - 2 - rnd() * 3, size, 1); }
  if (hazard) {
    cx.save(); cx.beginPath(); cx.rect(0, 0, size, size * 0.3); cx.clip();
    for (let x = -size; x < size * 2; x += size / 6) {
      cx.fillStyle = ((x / (size / 6)) & 1) ? '#e8b400' : '#151515';
      cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x + size / 6, 0); cx.lineTo(x + size / 6 + size * 0.3, size * 0.3); cx.lineTo(x + size * 0.3, size * 0.3); cx.closePath(); cx.fill();
    }
    cx.restore();
  }
  return { map: finish(cc, 1, true), rough: finish(rc, 1, false), bump: finish(rc, 1, false) };
}

/** Sun-bleached sandstone flagstones with cracks and sand in the joints. */
export function sandstoneTextures(size = 1024, seed = 71, cells = 6): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  cx.fillStyle = '#b8955e'; cx.fillRect(0, 0, size, size);
  rx.fillStyle = '#c0c0c0'; rx.fillRect(0, 0, size, size);
  const cw = size / cells;
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
    const l = 56 + rnd() * 14, h = 32 + rnd() * 8, s = 28 + rnd() * 16;
    cx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
    const jx = rnd() * 6, jy = rnd() * 6;
    cx.fillRect(c * cw + 4 + jx, r * cw + 4 + jy, cw - 10, cw - 10);
    const rr = 160 + rnd() * 50; rx.fillStyle = `rgb(${rr},${rr},${rr})`;
    rx.fillRect(c * cw + 4 + jx, r * cw + 4 + jy, cw - 10, cw - 10);
  }
  for (let i = 0; i < 9000; i++) { const v = rnd(); cx.fillStyle = v > 0.5 ? 'rgba(255,240,200,0.12)' : 'rgba(80,50,20,0.14)'; cx.fillRect(rnd() * size, rnd() * size, 3, 3); }
  cx.strokeStyle = 'rgba(60,40,20,0.7)'; cx.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    let x = rnd() * size, y = rnd() * size;
    cx.beginPath(); cx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; cx.lineTo(x, y); }
    cx.stroke();
  }
  return { map: finish(cc, 2, true), rough: finish(rc, 2, false), bump: finish(rc, 2, false) };
}

/** Wind-rippled sand (large ground planes) and banded cliff strata (vertical faces). */
export function sandTextures(size = 512, seed = 81, strata = false): TexSet {
  const col = canvas(size), rgh = canvas(size);
  if (!col || !rgh) return { map: null, rough: null, bump: null };
  const [cc, cx] = col, [rc, rx] = rgh;
  const rnd = texRng(seed);
  rx.fillStyle = '#e0e0e0'; rx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const band = strata ? Math.sin(y * 0.09 + Math.sin(y * 0.021) * 3) * 0.5 + 0.5 : Math.sin(y * 0.25 + Math.sin(y * 0.03) * 6) * 0.5 + 0.5;
    const l = strata ? 34 + band * 18 : 62 + band * 10;
    cx.fillStyle = `hsl(${strata ? 22 + band * 8 : 38}, ${strata ? 45 : 42}%, ${l}%)`;
    cx.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 8000; i++) { cx.fillStyle = rnd() > 0.5 ? 'rgba(255,230,180,0.1)' : 'rgba(90,50,20,0.12)'; cx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 3, 2); }
  if (strata) for (let i = 0; i < 40; i++) { cx.fillStyle = 'rgba(30,15,5,0.5)'; cx.fillRect(rnd() * size, rnd() * size, 2, 20 + rnd() * 80); }
  return { map: finish(cc, strata ? 2 : 8, true), rough: finish(rc, 2, false), bump: finish(rc, 2, false) };
}
