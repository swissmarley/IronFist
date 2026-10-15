import { FixedStepLoop } from '@/core/loop';
import { createRenderer, type Backend } from '@/render/backend';
import { GreyBoxScene } from '@/render/GreyBoxScene';
import { ProfilerOverlay } from '@/debug/ProfilerOverlay';
import { bindDebugHotkeys } from '@/debug/DebugHotkeys';
import { debugFlags } from '@/debug/DebugFlags';
import { QUALITY_PRESETS, type QualitySettings } from '@/render/quality';
import type { WebGPURenderer } from 'three/webgpu';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  debugRoot: HTMLElement;
  forceWebGL?: boolean;
}

/**
 * Application root. Owns the renderer, loop and overlays.
 * Phase 0: grey-box scene with a placeholder sim counter.
 */
export class Game {
  readonly loop: FixedStepLoop;
  renderer!: WebGPURenderer;
  backend: Backend = 'webgl2';
  quality: QualitySettings = QUALITY_PRESETS.medium;
  scene!: GreyBoxScene;
  private profiler: ProfilerOverlay;
  private simFrame = 0;
  private readonly opts: GameOptions;
  private unbind: (() => void) | null = null;

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.profiler = new ProfilerOverlay(opts.debugRoot);
    this.loop = new FixedStepLoop({
      sampleInput: () => this.sampleInput(),
      step: () => this.step(),
      render: (alpha, dt) => this.render(alpha, dt),
    });
  }

  async init(): Promise<void> {
    const { renderer, backend } = await createRenderer(this.opts.canvas, this.opts.forceWebGL ?? false);
    this.renderer = renderer;
    this.backend = backend;
    this.renderer.shadowMap.enabled = true;
    this.scene = new GreyBoxScene(this.aspect());
    this.applyQuality(this.quality);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.unbind = bindDebugHotkeys((key, v) => {
      if (key === 'profiler') this.profiler.setVisible(v);
    });
  }

  applyQuality(q: QualitySettings): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * q.renderScale);
    this.renderer.shadowMap.enabled = q.shadows;
  }

  private aspect(): number {
    return this.opts.canvas.clientWidth / Math.max(1, this.opts.canvas.clientHeight);
  }

  private onResize(): void {
    const w = this.opts.canvas.clientWidth, h = this.opts.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.scene.resize(w / Math.max(1, h));
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.unbind?.();
    this.renderer.dispose();
  }

  private sampleInput(): void {
    // Phase 1 wires the input system here.
  }

  private step(): void {
    this.simFrame++;
  }

  private render(_alpha: number, _dt: number): void {
    const r = this.renderer;
    r.render(this.scene.scene, this.scene.camera);
    const info = r.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.profiler.update({
      loop: this.loop.stats,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      gpuMs: 0,
      backend: this.backend,
      tier: this.quality.tier,
      memoryMB: mem ? mem.usedJSHeapSize / 1048576 : 0,
      simFrame: this.simFrame,
    }, performance.now());
    if (debugFlags.profiler) this.profiler.setVisible(true);
  }

  getSimFrame(): number {
    return this.simFrame;
  }
}
