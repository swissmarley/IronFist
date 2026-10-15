import * as THREE from 'three/webgpu';

let blobTexture: THREE.Texture | null = null;

/** Radial soft-edged blob, generated once (procedural, no asset). */
function getBlobTexture(): THREE.Texture | null {
  if (blobTexture) return blobTexture;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  blobTexture = new THREE.CanvasTexture(canvas);
  blobTexture.colorSpace = THREE.NoColorSpace;
  return blobTexture;
}

/**
 * Soft contact shadow under a fighter: an alpha-blended dark blob on the floor that
 * stays legible whatever the stage's sun direction or IBL fill does to the
 * shadow map. Shrinks and fades as the fighter leaves the ground.
 */
export class ContactShadow {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, private readonly baseSize = 1.35, private readonly baseOpacity = 0.75) {
    // black with a radial alpha falloff: normal blending darkens the floor by the blob's alpha, which reads as a soft shadow
    this.material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: baseOpacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const map = getBlobTexture();
    if (map) this.material.map = map;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  /** `pos` is the fighter root in metres; the blob sits on the floor beneath it. */
  update(pos: THREE.Vector3, floorY = 0): void {
    const h = Math.max(0, pos.y - floorY);
    const k = 1 / (1 + h * 1.4);
    this.mesh.position.set(pos.x, floorY + 0.012, pos.z);
    const s = this.baseSize * (0.75 + 0.25 * k);
    this.mesh.scale.set(s, s, 1);
    this.material.opacity = this.baseOpacity * k;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
