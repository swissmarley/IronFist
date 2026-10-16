import * as THREE from 'three/webgpu';
import type { Stage } from './stages/Stage';

/**
 * The arena scene: camera, the two fighter groups and the current Stage.
 * Pure rendering; positions are pushed in from the interpolated sim state.
 */
export class GreyBoxScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly fighters: THREE.Group[] = [];
  stage: Stage | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 500);
    this.camera.position.set(0, 1.6, 7.5);
    this.camera.lookAt(0, 1, 0);
    this.scene.background = new THREE.Color(0x0e1116);

    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      g.position.set(i === 0 ? -0.9 : 0.9, 0, 0);
      this.fighters.push(g);
      this.scene.add(g);
    }
  }

  /** Swap the stage (lights, geometry, environment, fog). */
  setStage(stage: Stage): void {
    if (this.stage) { this.scene.remove(this.stage.root); this.stage.dispose(); }
    this.stage = stage;
    this.scene.add(stage.root);
    this.scene.environment = stage.environment;
    this.scene.environmentIntensity = 0.5;
    this.scene.background = stage.background;
    this.scene.fog = stage.fog;
  }

  update(dtMs: number): void {
    this.stage?.update(dtMs);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
