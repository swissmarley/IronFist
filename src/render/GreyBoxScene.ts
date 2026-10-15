import * as THREE from 'three/webgpu';

/**
 * Grey-box arena used during Phases 0-2 and as the fallback stage.
 * Pure rendering; positions are pushed in from the interpolated sim state.
 */
export class GreyBoxScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly fighters: THREE.Group[] = [];
  private readonly floor: THREE.Mesh;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 200);
    this.camera.position.set(0, 1.6, 7.5);
    this.camera.lookAt(0, 1, 0);

    this.scene.background = new THREE.Color(0x0e1116);
    this.scene.fog = new THREE.Fog(0x0e1116, 18, 60);

    const hemi = new THREE.HemisphereLight(0xcfd8ff, 0x1a1510, 0.9);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1dd, 2.2);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10; key.shadow.camera.right = 10;
    key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
    key.shadow.camera.near = 1; key.shadow.camera.far = 30;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.85, metalness: 0.05 });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    const grid = new THREE.GridHelper(24, 24, 0x3d4652, 0x242a32);
    grid.position.y = 0.002;
    this.scene.add(grid);

    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      g.position.set(i === 0 ? -0.9 : 0.9, 0, 0);
      this.fighters.push(g);
      this.scene.add(g);
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
