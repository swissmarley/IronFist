import type * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import type { ArenaDef } from '@/sim/config';

/** Per-stage colour grading / post parameters consumed by the PostPipeline. */
export interface StageGrading {
  exposure: number;
  contrast: number;
  saturation: number;
  /** Multiplicative tint in linear RGB. */
  tint: [number, number, number];
  vignette: number;
  bloomStrength: number;
  bloomThreshold: number;
}

export const DEFAULT_GRADING: StageGrading = { exposure: 1, contrast: 1.05, saturation: 1.05, tint: [1, 1, 1], vignette: 0.35, bloomStrength: 0.35, bloomThreshold: 0.85 };

export interface Stage {
  id: string;
  name: string;
  /** Music theme id (see src/audio/music.ts THEMES). */
  theme: string;
  arena: ArenaDef;
  root: THREE.Group;
  grading: StageGrading;
  /** Environment map for IBL (set on scene.environment). */
  environment: THREE.Texture | null;
  background: THREE.Texture | THREE.Color | null;
  fog: THREE.Fog | null;
  /** Per-frame dynamic background update. */
  update(dtMs: number): void;
  dispose(): void;
}

export interface StageContext {
  renderer: WebGPURenderer;
  shadows: boolean;
  shadowMapSize: number;
}

export type StageFactory = (ctx: StageContext) => Promise<Stage>;
