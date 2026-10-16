import * as THREE from 'three/webgpu';
import { attribute, atan, float, length, modelViewMatrix, normalLocal, oneMinus, positionGeometry, rotate, saturate, smoothstep, transformNormalToView, uniform, uv, vec2, vec3, vec4, mix } from 'three/tsl';
import type { BatchAttribute } from './InstancedBatch';

/**
 * Node materials for the particle styles. Every style reads the same four
 * per-instance vec4 attributes (see ParticlePool.F for the field layout), so
 * one interleaved buffer serves all of them. Billboarding comes from
 * SpriteNodeMaterial; debris is a real lit mesh (MeshStandardNodeMaterial).
 * TSL compiles to WGSL on WebGPU and GLSL on the WebGL2 fallback.
 */
export const PARTICLE_ATTRIBUTES: readonly BatchAttribute[] = [
  { name: 'iPosLife', size: 4 },
  { name: 'iVelSize', size: 4 },
  { name: 'iColor', size: 4 },
  { name: 'iMisc', size: 4 },
];

function inputs() {
  const posLife = attribute('iPosLife', 'vec4');
  const velSize = attribute('iVelSize', 'vec4');
  const color = attribute('iColor', 'vec4');
  const misc = attribute('iMisc', 'vec4');
  // centred quad coords in [-1, 1] and radial distance
  const p = uv().sub(0.5).mul(2);
  const d = length(p);
  return { posLife, velSize, color, misc, p, d, life: posLife.w, size: velSize.w };
}

function additive(m: THREE.NodeMaterial): void {
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.depthTest = true;
  m.fog = false;
  m.side = THREE.DoubleSide;
}

/** Bright elongated additive quads, stretched along the view-space velocity. */
export function sparkMaterial(): THREE.SpriteNodeMaterial {
  const i = inputs();
  const m = new THREE.SpriteNodeMaterial();
  additive(m);
  const vView = modelViewMatrix.mul(vec4(i.velSize.xyz, 0)).xy;
  const speed = length(vView);
  const len = i.size.mul(speed.mul(i.misc.z).add(1));
  m.positionNode = i.posLife.xyz;
  m.rotationNode = atan(vView.y, vView.x);
  m.scaleNode = vec2(len, i.size);
  const g = oneMinus(saturate(i.d));
  const core = g.mul(g).mul(g);
  const fade = saturate(oneMinus(i.life).mul(1.6));
  m.colorNode = i.color.xyz.mul(g.mul(0.7).add(core.mul(1.6))).mul(fade);
  m.opacityNode = g.mul(fade).mul(i.color.w);
  return m;
}

/** Additive round sprites with a hot core. */
export function glowMaterial(): THREE.SpriteNodeMaterial {
  const i = inputs();
  const m = new THREE.SpriteNodeMaterial();
  additive(m);
  m.positionNode = i.posLife.xyz;
  m.rotationNode = i.misc.x;
  m.scaleNode = vec2(i.size, i.size);
  const g = oneMinus(saturate(i.d));
  const glow = g.mul(g);
  const core = oneMinus(saturate(i.d.mul(2.2)));
  const fade = oneMinus(i.life).mul(oneMinus(i.life));
  m.colorNode = i.color.xyz.mul(glow.add(core.mul(core).mul(1.5))).mul(fade);
  m.opacityNode = glow.mul(fade).mul(i.color.w);
  return m;
}

export interface DustMaterial { material: THREE.SpriteNodeMaterial; cameraPos: THREE.Vector3 }

/** Soft alpha-blended puffs; size growth/fade come from the pool. Fades out near the camera. */
export function dustMaterial(): DustMaterial {
  const i = inputs();
  const m = new THREE.SpriteNodeMaterial();
  m.transparent = true;
  m.blending = THREE.NormalBlending;
  m.depthWrite = false;
  m.fog = true;
  const cameraPos = new THREE.Vector3();
  const camPos = uniform(cameraPos);
  m.positionNode = i.posLife.xyz;
  m.rotationNode = i.misc.x;
  m.scaleNode = vec2(i.size, i.size);
  const soft = oneMinus(smoothstep(float(0.1), float(1), i.d));
  const fade = saturate(i.life.mul(5)).mul(oneMinus(i.life));
  const nearFade = smoothstep(float(0.4), float(1.3), length(i.posLife.xyz.sub(camPos)));
  m.colorNode = i.color.xyz.mul(mix(float(0.8), float(1), uv().y));
  m.opacityNode = soft.mul(soft).mul(fade).mul(nearFade).mul(i.color.w);
  return { material: m, cameraPos };
}

/** Small lit chunks: per-instance position, scale and tumble applied to a real mesh. */
export function debrisMaterial(): THREE.MeshStandardNodeMaterial {
  const i = inputs();
  const m = new THREE.MeshStandardNodeMaterial();
  m.roughness = 0.85;
  m.metalness = 0.05;
  m.fog = true;
  const euler = vec3(i.misc.x, i.misc.x.mul(0.61).add(i.misc.y), i.misc.x.mul(0.37));
  m.positionNode = rotate(positionGeometry.mul(i.size), euler).add(i.posLife.xyz);
  m.normalNode = transformNormalToView(rotate(normalLocal, euler));
  m.colorNode = i.color.xyz;
  return m;
}

/** Base geometry for debris chunks (irregular box, ~unit size before per-instance scale). */
export function debrisGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 0.55, 0.8);
}
