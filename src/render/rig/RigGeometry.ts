import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONES, type BoneDef, type BoneName } from '@/anim/skeleton';

/** Material slot per body part. */
export type PartMaterial = 'skin' | 'top' | 'pants' | 'belt' | 'gloves' | 'boots' | 'hair';
export const PART_MATERIALS: readonly PartMaterial[] = ['skin', 'top', 'pants', 'belt', 'gloves', 'boots', 'hair'];

export interface RigStyle {
  /** Which material each bone's shell uses. */
  parts: Partial<Record<BoneName, PartMaterial>>;
  /** Muscle bulk multiplier. */
  bulk: number;
  /** Hair style: 'none' | 'short' | 'spiky' | 'long' | 'bun' | 'bald'. */
  hair: 'none' | 'short' | 'spiky' | 'long' | 'bun';
  /** Shoulder pads / bulky torso (wrestler). */
  heavy?: boolean;
}

export const DEFAULT_STYLE: RigStyle = {
  parts: {
    hips: 'pants', spine: 'top', chest: 'top', neck: 'skin', head: 'skin',
    shoulderL: 'top', shoulderR: 'top', upperArmL: 'top', upperArmR: 'top', forearmL: 'skin', forearmR: 'skin', handL: 'gloves', handR: 'gloves',
    upperLegL: 'pants', upperLegR: 'pants', lowerLegL: 'pants', lowerLegR: 'pants', footL: 'boots', footR: 'boots',
  },
  bulk: 1,
  hair: 'short',
};

function alignToAxis(geo: THREE.BufferGeometry, axis: [number, number, number]): THREE.BufferGeometry {
  const from = new THREE.Vector3(0, 1, 0);
  const to = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(from, to);
  geo.applyQuaternion(q);
  return geo;
}

/** Tapered capsule along +Y from 0 to length with radii r0 (joint) and r1 (tip). */
function taperedCapsule(length: number, r0: number, r1: number, segs = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const capSegs = 6;
  for (let i = capSegs; i >= 0; i--) {
    const a = (i / capSegs) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r0, -Math.sin(a) * r0 * 0.8));
  }
  const mid = 4;
  for (let i = 1; i < mid; i++) {
    const t = i / mid;
    const r = r0 + (r1 - r0) * (t * t * (3 - 2 * t));
    pts.push(new THREE.Vector2(r * (1 + 0.08 * Math.sin(t * Math.PI)), t * length));
  }
  for (let i = 0; i <= capSegs; i++) {
    const a = (i / capSegs) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, length + Math.sin(a) * r1 * 0.9));
  }
  const g = new THREE.LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(rx: number, ry: number, rz: number, cy: number, cz = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 18, 14);
  g.scale(rx, ry, rz);
  g.translate(0, cy, cz);
  return g;
}

function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  // cheap rounded box: box with normals smoothed by a sphere blend
  const g = new THREE.BoxGeometry(w - r, h - r, d - r, 2, 2, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    v.add(n.multiplyScalar(r / 2));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function partGeometry(d: BoneDef, style: RigStyle): THREE.BufferGeometry[] {
  const r = d.radius;
  const L = d.length;
  const heavy = style.heavy ? 1.18 : 1;
  switch (d.name) {
    case 'hips': return [ellipsoid(0.17 * heavy, 0.11, 0.12, 0.03)];
    case 'spine': return [ellipsoid(0.15 * heavy, 0.12, 0.11, 0.08)];
    case 'chest': return [ellipsoid(0.205 * heavy, 0.15, 0.125, 0.11), ellipsoid(0.17 * heavy, 0.09, 0.10, 0.22, 0)];
    case 'neck': return [alignToAxis(taperedCapsule(L + 0.02, 0.055, 0.05), d.axis)];
    case 'head': {
      const parts = [ellipsoid(0.095, 0.115, 0.105, 0.11, 0.005)];
      // jaw / chin
      parts.push(ellipsoid(0.07, 0.06, 0.075, 0.05, 0.02));
      // nose
      const nose = ellipsoid(0.018, 0.028, 0.025, 0.09, 0.105);
      parts.push(nose);
      // ears
      parts.push(ellipsoid(0.012, 0.03, 0.022, 0.1, 0.0).translate(0.095, 0, 0));
      parts.push(ellipsoid(0.012, 0.03, 0.022, 0.1, 0.0).translate(-0.095, 0, 0));
      return parts;
    }
    case 'shoulderL': case 'shoulderR': return [ellipsoid(0.085 * heavy, 0.07, 0.075, 0, 0).translate(d.axis[0] * 0.10, 0.01, 0)];
    case 'upperArmL': case 'upperArmR': return [alignToAxis(taperedCapsule(L, r * 1.15 * heavy, r * 0.85), d.axis)];
    case 'forearmL': case 'forearmR': return [alignToAxis(taperedCapsule(L, r * 1.1, r * 0.7), d.axis)];
    case 'handL': case 'handR': return [roundedBox(0.075, 0.08, 0.1, 0.03).translate(0, -0.08, 0.01)];
    case 'upperLegL': case 'upperLegR': return [alignToAxis(taperedCapsule(L, r * 1.1 * heavy, r * 0.7), d.axis)];
    case 'lowerLegL': case 'lowerLegR': return [alignToAxis(taperedCapsule(L, r * 1.2, r * 0.65), d.axis)];
    case 'footL': case 'footR': return [roundedBox(0.09, 0.07, 0.25, 0.03).translate(0, -0.02, 0.07)];
    default: return [];
  }
}

function hairGeometry(style: RigStyle): THREE.BufferGeometry | null {
  switch (style.hair) {
    case 'short': return ellipsoid(0.1, 0.1, 0.108, 0.15, -0.01).translate(0, 0, 0);
    case 'spiky': {
      const g = ellipsoid(0.105, 0.12, 0.11, 0.16, -0.01);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.y > 0.2) { const k = 1 + Math.abs(Math.sin(v.x * 70) * Math.cos(v.z * 60)) * 0.35; v.y = 0.2 + (v.y - 0.2) * k; }
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    }
    case 'long': return mergeGeometries([ellipsoid(0.105, 0.11, 0.115, 0.15, -0.01), ellipsoid(0.07, 0.16, 0.05, 0.0, -0.09)]);
    case 'bun': return mergeGeometries([ellipsoid(0.1, 0.1, 0.108, 0.15, -0.01), ellipsoid(0.05, 0.05, 0.05, 0.2, -0.09)]);
    default: return null;
  }
}

export interface RigGeometryResult {
  geometry: THREE.BufferGeometry;
  /** Material index per group corresponds to PART_MATERIALS order. */
  groups: PartMaterial[];
}

/** Build one merged skinned geometry (rigid weights) for the skeleton. */
export function buildRigGeometry(defs: BoneDef[], style: RigStyle): RigGeometryResult {
  const perMaterial: THREE.BufferGeometry[][] = PART_MATERIALS.map(() => []);
  // rest-pose world position of every joint (rest rotations are identity)
  const world = restJointPositions(defs);
  defs.forEach((d, boneIdx) => {
    const mat = style.parts[d.name] ?? 'skin';
    const slot = PART_MATERIALS.indexOf(mat);
    const w = world[boneIdx] as [number, number, number];
    for (const g of partGeometry(d, style)) {
      g.translate(w[0], w[1], w[2]);
      addSkin(g, boneIdx);
      (perMaterial[slot] as THREE.BufferGeometry[]).push(g);
    }
    if (d.name === 'head') {
      const h = hairGeometry(style);
      if (h) { h.translate(w[0], w[1], w[2]); addSkin(h, boneIdx); (perMaterial[PART_MATERIALS.indexOf('hair')] as THREE.BufferGeometry[]).push(h); }
    }
  });
  const merged: THREE.BufferGeometry[] = [];
  const groups: PartMaterial[] = [];
  perMaterial.forEach((list, i) => {
    if (list.length === 0) return;
    const g = mergeGeometries(list, false);
    merged.push(g);
    groups.push(PART_MATERIALS[i] as PartMaterial);
  });
  const geometry = mergeGeometries(merged, true);
  for (const g of merged) g.dispose();
  return { geometry, groups };
}

export function restJointPositions(defs: BoneDef[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  defs.forEach((d, i) => {
    const p: [number, number, number] = d.parent ? (out[BONES.indexOf(d.parent)] ?? [0, 0, 0]) : [0, 0, 0];
    out[i] = [p[0] + d.offset[0], p[1] + d.offset[1], p[2] + d.offset[2]];
  });
  return out;
}

function addSkin(g: THREE.BufferGeometry, boneIdx: number): void {
  const n = (g.attributes.position as THREE.BufferAttribute).count;
  const idx = new Uint16Array(n * 4);
  const w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { idx[i * 4] = boneIdx; w[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
}

/** Create THREE bones mirroring the BoneDef hierarchy (rest pose). */
export function buildBones(defs: BoneDef[]): THREE.Bone[] {
  const bones = defs.map((d) => { const b = new THREE.Bone(); b.name = d.name; b.position.set(d.offset[0], d.offset[1], d.offset[2]); return b; });
  defs.forEach((d, i) => { if (d.parent) (bones[BONES.indexOf(d.parent)] as THREE.Bone).add(bones[i] as THREE.Bone); });
  return bones;
}
