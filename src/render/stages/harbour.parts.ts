import * as THREE from 'three/webgpu';
import { cos, float, normalize, sin, time, transformNormalToView, vec3, positionLocal } from 'three/tsl';

/** Building blocks for the Harbour Deck stage: water, lighthouse and boats. */

/** Deep harbour water: three summed sine waves displace the vertices (TSL) with analytic normals. */
export function waterMaterial(color = 0x0b2e3c): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  m.color.setHex(color);
  m.roughness = 0.16;
  m.metalness = 0.05;
  const p = positionLocal;
  const wave = (kx: number, kz: number, sp: number, amp: number) => {
    const phase = p.x.mul(kx).add(p.z.mul(kz)).add(time.mul(sp));
    const c = cos(phase);
    return { h: sin(phase).mul(amp), dx: c.mul(amp * kx), dz: c.mul(amp * kz) };
  };
  const a = wave(0.9, 0.35, 0.9, 0.11), b = wave(-0.5, 1.1, 1.3, 0.07), c = wave(1.7, -0.8, 2.2, 0.035);
  const h = a.h.add(b.h).add(c.h);
  const dx = a.dx.add(b.dx).add(c.dx);
  const dz = a.dz.add(b.dz).add(c.dz);
  m.positionNode = vec3(p.x, p.y.add(h), p.z);
  m.normalNode = transformNormalToView(normalize(vec3(dx.mul(-1), float(1), dz.mul(-1))));
  return m;
}

export interface Lighthouse { group: THREE.Group; beam: THREE.Mesh; lamp: THREE.Mesh }

/** A distant lighthouse tower whose beam cone is rotated by the stage update. */
export function makeLighthouse(disposables: { dispose(): void }[]): Lighthouse {
  const group = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.8 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.8 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, 16, 14), towerMat);
  tower.position.y = 8;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 3.2, 14), bandMat);
  band.position.y = 9;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.4, 14), bandMat);
  gallery.position.y = 16.2;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe8a8, emissiveIntensity: 6, roughness: 0.4 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.0, 12), lampMat);
  lamp.position.y = 17.4;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.4, 14), bandMat);
  cap.position.y = 19.1;
  // open cone, apex at the lamp; brightness baked into vertex colours (white at the apex → black at the base)
  const beamGeo = new THREE.ConeGeometry(4.5, 90, 16, 1, true);
  const pos = beamGeo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) + 45) / 90));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = t * t;
  }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  beamGeo.rotateZ(Math.PI / 2);
  beamGeo.translate(45, 0, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0, vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 17.4;
  beam.rotation.z = 0.05;
  group.add(tower, band, gallery, lamp, cap, beam);
  disposables.push(tower.geometry, band.geometry, gallery.geometry, lamp.geometry, cap.geometry, beamGeo, towerMat, bandMat, lampMat, beamMat);
  return { group, beam, lamp };
}

export interface Boat { group: THREE.Group; phase: number; baseY: number }

/** Simple moored fishing boat: extruded hull outline, wheelhouse, mast. */
export function makeBoat(hullColor: number, cabinMat: THREE.Material, mastMat: THREE.Material, phase: number, disposables: { dispose(): void }[]): Boat {
  const shape = new THREE.Shape();
  shape.moveTo(-3.2, -1.0);
  shape.quadraticCurveTo(0.5, -1.45, 3.1, -0.4);
  shape.quadraticCurveTo(4.2, 0, 3.1, 0.4);
  shape.quadraticCurveTo(0.5, 1.45, -3.2, 1.0);
  shape.lineTo(-3.2, -1.0);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 2, curveSegments: 10 });
  hullGeo.rotateX(-Math.PI / 2);
  const hullMat = new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.7, metalness: 0.1 });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.8), cabinMat);
  cabin.position.set(-1.2, 1.65, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.5, 6), mastMat);
  mast.position.set(0.8, 3.3, 0);
  const group = new THREE.Group();
  group.add(hull, cabin, mast);
  disposables.push(hullGeo, hullMat, cabin.geometry, mast.geometry);
  return { group, phase, baseY: 0 };
}
