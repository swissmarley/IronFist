import * as THREE from 'three/webgpu';
import { FACE, FACE_TARGET_COUNT, FACE_TARGET_NAMES } from './FaceController';
import type { Palette } from './RigMaterials';

/**
 * Stylised procedural face: eyes (sclera, iris, upper lids), brows, mouth and
 * teeth, built in the head bone's local frame (+Z forward, same coordinates
 * as the head shell in RigGeometry) and conformed onto the head surface.
 * Expressions are morph targets (relative position + normal deltas) on this
 * small, separate mesh so the merged body mesh stays morph-free.
 */

/** Material slots of the face mesh (group order). */
const SLOT = { sclera: 0, iris: 1, lid: 2, brow: 3, mouth: 4, teeth: 5 } as const;

interface Pt { x: number; y: number; h: number }
/** Map a unit-sphere vertex to face-plane coords (x, y) + height above the head surface for a target (-1 = base). */
type ShapeFn = (ux: number, uy: number, uz: number, target: number, out: Pt) => void;

interface Feature { slot: number; shape: ShapeFn; segW: number; segH: number }

// --- head surface (matches the head + jaw ellipsoids in RigGeometry.partGeometry) ---
function ellZ(x: number, y: number, rx: number, ry: number, rz: number, cy: number, cz: number): number {
  const t = 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2;
  return t <= 0 ? -1 : cz + rz * Math.sqrt(t);
}
export function headSurfaceZ(x: number, y: number): number {
  return Math.max(ellZ(x, y, 0.095, 0.115, 0.105, 0.11, 0.005), ellZ(x, y, 0.07, 0.06, 0.075, 0.05, 0.02));
}

// --- feature layout (head-local metres) ---
const EYE_X = 0.034, EYE_Y = 0.118;
const BROW_X = 0.036, BROW_Y = 0.147;
const MOUTH_Y = 0.046;

function sclera(side: number): ShapeFn {
  return (ux, uy, uz, _t, o) => { o.x = side * EYE_X + ux * 0.0155; o.y = EYE_Y + uy * 0.0105; o.h = 0.0004 + uz * 0.003; };
}
function iris(side: number): ShapeFn {
  return (ux, uy, uz, _t, o) => { o.x = side * (EYE_X - 0.001) + ux * 0.0072; o.y = EYE_Y + uy * 0.0082; o.h = 0.0031 + uz * 0.0013; };
}

/** Lid line (local y, relative to the eye centre) per target; x = signed inward offset (+ toward the nose). */
function lidLine(target: number, inward: number): number {
  const RY = 0.0125;
  switch (target) {
    case FACE.blink: case FACE.eyesClosed: return -RY * 1.05;
    case FACE.browAngry: return RY * 0.3 - inward * 0.28;
    case FACE.browPain: return RY * 0.15 + inward * 0.12;
    case FACE.mouthGrit: return RY * 0.2;
    case FACE.smile: return RY * 0.3;
    default: return RY * 0.48;
  }
}
function lid(side: number): ShapeFn {
  return (ux, uy, uz, t, o) => {
    const lx = ux * 0.0178;
    const inward = -side * lx; // + toward the nose
    const line = lidLine(t, inward);
    const droop = t === FACE.eyesClosed ? -0.0015 : 0;
    o.x = side * EYE_X + lx;
    o.y = EYE_Y + Math.max(uy * 0.0125, line) + droop;
    o.h = 0.0009 + uz * 0.0044;
  };
}

function brow(side: number): ShapeFn {
  return (ux, uy, uz, t, o) => {
    const bx = ux * 0.0195;
    const out = side * bx; // + away from the nose
    let dy = -0.12 * (out / 0.0195) ** 2 * 0.02 + 0.0006; // gentle arch
    let dx = 0;
    if (t === FACE.browAngry) { dy += -0.0035 + 0.34 * out; dx = -side * 0.0025; }
    else if (t === FACE.browPain) { dy += 0.0035 - 0.36 * out; dx = -side * 0.0012; }
    else if (t === FACE.eyesClosed) dy += -0.0022 - 0.06 * out;
    else if (t === FACE.smile) dy += 0.002;
    else if (t === FACE.mouthOpen) dy += 0.0015;
    o.x = side * BROW_X + bx + dx;
    o.y = BROW_Y + uy * 0.0036 + dy;
    o.h = 0.0006 + uz * 0.0034;
  };
}

/** Squarish profile for open mouths (superellipse in y). */
function sq(v: number, p: number): number {
  return Math.sign(v) * Math.abs(v) ** p;
}
function mouth(): ShapeFn {
  return (ux, uy, uz, t, o) => {
    let rx = 0.0185, ry = 0.0022, cy = 0, curve = -0.0025, py = uy;
    switch (t) {
      case FACE.mouthOpen: rx = 0.0165; ry = 0.0145; cy = -0.0055; curve = 0; break;
      case FACE.mouthGrit: rx = 0.0235; ry = 0.0062; cy = -0.0005; curve = -0.0045; py = sq(uy, 0.55); break;
      case FACE.smile: rx = 0.021; ry = 0.0032; cy = 0.0005; curve = 0.0075; break;
      case FACE.eyesClosed: rx = 0.0165; ry = 0.0045; cy = -0.0015; curve = -0.002; break;
      default: break;
    }
    o.x = ux * rx;
    o.y = MOUTH_Y + cy + py * ry + curve * ux * ux;
    o.h = 0.0004 + uz * 0.0026;
  };
}
function teeth(): ShapeFn {
  return (ux, uy, uz, t, o) => {
    let rx = 0.014, ry = 0.0006, cy = 0, h = -0.0035, rz = 0.001, curve = 0, py = uy;
    switch (t) {
      case FACE.mouthGrit: rx = 0.021; ry = 0.0043; cy = -0.0005; h = 0.0022; rz = 0.0012; curve = -0.0035; py = sq(uy, 0.6); break;
      case FACE.mouthOpen: rx = 0.0125; ry = 0.0024; cy = 0.0058; h = 0.0026; rz = 0.001; curve = 0.004; break;
      case FACE.smile: rx = 0.015; ry = 0.0012; cy = 0.0012; h = 0.0012; rz = 0.001; curve = 0.006; break;
      default: break;
    }
    o.x = ux * rx;
    o.y = MOUTH_Y + cy + py * ry + curve * ux * ux;
    o.h = h + uz * rz;
  };
}

const FEATURES: readonly Feature[] = [
  { slot: SLOT.sclera, shape: sclera(1), segW: 14, segH: 8 }, { slot: SLOT.sclera, shape: sclera(-1), segW: 14, segH: 8 },
  { slot: SLOT.iris, shape: iris(1), segW: 10, segH: 6 }, { slot: SLOT.iris, shape: iris(-1), segW: 10, segH: 6 },
  { slot: SLOT.lid, shape: lid(1), segW: 14, segH: 12 }, { slot: SLOT.lid, shape: lid(-1), segW: 14, segH: 12 },
  { slot: SLOT.brow, shape: brow(1), segW: 12, segH: 6 }, { slot: SLOT.brow, shape: brow(-1), segW: 12, segH: 6 },
  { slot: SLOT.mouth, shape: mouth(), segW: 16, segH: 10 },
  { slot: SLOT.teeth, shape: teeth(), segW: 12, segH: 6 },
];

/** Positions of one feature for a target, conformed to the head. */
function shapePositions(unit: Float32Array, shape: ShapeFn, target: number, p: Pt): Float32Array {
  const n = unit.length / 3;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    shape(unit[i * 3] as number, unit[i * 3 + 1] as number, unit[i * 3 + 2] as number, target, p);
    out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = headSurfaceZ(p.x, p.y) + p.h;
  }
  return out;
}

function normalsFor(pos: Float32Array, index: THREE.BufferAttribute): Float32Array {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = (g.attributes.normal as THREE.BufferAttribute).array as Float32Array;
  g.dispose();
  return n;
}

/** Build the merged face geometry with FACE_TARGET_COUNT relative morph targets. */
export function buildFaceGeometry(): THREE.BufferGeometry {
  const p: Pt = { x: 0, y: 0, h: 0 };
  const slots = Object.keys(SLOT).length;
  const bySlot: Feature[][] = Array.from({ length: slots }, () => []);
  for (const f of FEATURES) (bySlot[f.slot] as Feature[]).push(f);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const mPos: number[][] = Array.from({ length: FACE_TARGET_COUNT }, () => []);
  const mNrm: number[][] = Array.from({ length: FACE_TARGET_COUNT }, () => []);
  const groups: { start: number; count: number; slot: number }[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const start = idx.length;
    for (const f of bySlot[slot] as Feature[]) {
      const sphere = new THREE.SphereGeometry(1, f.segW, f.segH);
      const unit = (sphere.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const index = sphere.index as THREE.BufferAttribute;
      const base = shapePositions(unit, f.shape, -1, p);
      const baseN = normalsFor(base, index);
      const offset = pos.length / 3;
      for (let i = 0; i < base.length; i++) { pos.push(base[i] as number); nrm.push(baseN[i] as number); }
      const suv = (sphere.attributes.uv as THREE.BufferAttribute).array;
      for (let i = 0; i < suv.length; i++) uv.push(suv[i] as number);
      for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + offset);
      for (let t = 0; t < FACE_TARGET_COUNT; t++) {
        const tp = shapePositions(unit, f.shape, t, p);
        const tn = normalsFor(tp, index);
        const dp = mPos[t] as number[], dn = mNrm[t] as number[];
        for (let i = 0; i < tp.length; i++) { dp.push((tp[i] as number) - (base[i] as number)); dn.push((tn[i] as number) - (baseN[i] as number)); }
      }
      sphere.dispose();
    }
    groups.push({ start, count: idx.length - start, slot });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.slot);
  g.morphAttributes.position = mPos.map((a) => new THREE.Float32BufferAttribute(a, 3));
  g.morphAttributes.normal = mNrm.map((a) => new THREE.Float32BufferAttribute(a, 3));
  g.morphTargetsRelative = true;
  g.computeBoundingSphere();
  return g;
}

function mix(a: number, b: number, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** Face materials derived from the palette; the lids reuse the head's own material. */
export function makeFaceMaterials(palette: Palette, lidMaterial: THREE.Material): { all: THREE.Material[]; own: THREE.MeshStandardMaterial[] } {
  const sclera = new THREE.MeshStandardMaterial({ color: mix(palette.skin, 0xf4efe4, 0.78), roughness: 0.3, metalness: 0 });
  const iris = new THREE.MeshPhysicalMaterial({ color: mix(palette.hair, 0x140c08, 0.45), roughness: 0.45, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.1 });
  const brow = new THREE.MeshStandardMaterial({ color: palette.hair, roughness: 1, metalness: 0 });
  const mouth = new THREE.MeshStandardMaterial({ color: mix(palette.skin, 0x1e0504, 0.93), roughness: 0.9, metalness: 0 });
  const teeth = new THREE.MeshStandardMaterial({ color: mix(palette.skin, 0xeee8da, 0.85), roughness: 0.35, metalness: 0 });
  const own = [sclera, iris, brow, mouth, teeth];
  return { all: [sclera, iris, lidMaterial, brow, mouth, teeth], own };
}

/** The face mesh (child of the head bone) and its morph influences. */
export class FaceRig {
  readonly mesh: THREE.Mesh;
  readonly ownMaterials: THREE.MeshStandardMaterial[];
  private readonly influences: number[];

  constructor(palette: Palette, lidMaterial: THREE.Material) {
    const geo = buildFaceGeometry();
    const mats = makeFaceMaterials(palette, lidMaterial);
    this.ownMaterials = mats.own;
    this.mesh = new THREE.Mesh(geo, mats.all);
    this.mesh.name = 'face';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.morphTargetDictionary = Object.fromEntries(FACE_TARGET_NAMES.map((n, i) => [n, i]));
    this.mesh.morphTargetInfluences = new Array<number>(FACE_TARGET_COUNT).fill(0);
    this.influences = this.mesh.morphTargetInfluences;
  }

  /** Copy morph weights (no allocation). */
  setWeights(w: ArrayLike<number>): void {
    for (let i = 0; i < FACE_TARGET_COUNT; i++) this.influences[i] = w[i] ?? 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const m of this.ownMaterials) m.dispose();
  }
}
