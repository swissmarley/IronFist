import * as THREE from 'three/webgpu';
import { DEFAULT_ARENA } from '@/sim/config';
import { DEFAULT_GRADING, type Stage, type StageContext } from './Stage';

/** The grey-box test arena (training/debug). */
export async function createGreyBoxStage(ctx: StageContext): Promise<Stage> {
  const root = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xcfd8ff, 0x1a1510, 0.9);
  root.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1dd, 2.2);
  key.position.set(4, 8, 5);
  key.castShadow = ctx.shadows;
  key.shadow.mapSize.set(ctx.shadowMapSize, ctx.shadowMapSize);
  key.shadow.camera.left = -10; key.shadow.camera.right = 10;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0005;
  key.shadow.camera.updateProjectionMatrix();
  root.add(key);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.85, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  const grid = new THREE.GridHelper(24, 24, 0x3d4652, 0x242a32);
  grid.position.y = 0.002;
  root.add(grid);
  return {
    id: 'greybox', name: 'Grey Box', theme: 'menu', arena: DEFAULT_ARENA, root,
    grading: { ...DEFAULT_GRADING, bloomStrength: 0.2 }, environment: null, background: new THREE.Color(0x0e1116), fog: new THREE.Fog(0x0e1116, 18, 60),
    update(): void { /* static */ },
    dispose(): void { floor.geometry.dispose(); floorMat.dispose(); },
  };
}
