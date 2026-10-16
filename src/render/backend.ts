import { WebGPURenderer } from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

export interface RendererInit {
  renderer: WebGPURenderer;
  backend: Backend;
}

/**
 * Create the Three.js renderer. WebGPURenderer transparently falls back to a
 * WebGL2 backend when navigator.gpu is unavailable; we also expose which one
 * was actually chosen so quality tiers can adapt (e.g. compute particles).
 */
export async function createRenderer(canvas: HTMLCanvasElement, forceWebGL = false): Promise<RendererInit> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false, // we use post-process AA
    forceWebGL,
    powerPreference: 'high-performance',
  });
  await renderer.init();
  const backendObj = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend;
  const backend: Backend = backendObj?.isWebGPUBackend ? 'webgpu' : 'webgl2';
  return { renderer, backend };
}
