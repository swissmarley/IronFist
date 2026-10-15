import { FixedStepLoop } from '@/core/loop';
import { createRenderer, type Backend } from '@/render/backend';
import { GreyBoxScene } from '@/render/GreyBoxScene';
import { ProfilerOverlay } from '@/debug/ProfilerOverlay';
import { bindDebugHotkeys } from '@/debug/DebugHotkeys';
import { debugFlags } from '@/debug/DebugFlags';
import { QUALITY_PRESETS, type QualitySettings } from '@/render/quality';
import type { WebGPURenderer } from 'three/webgpu';
import { InputSystem } from '@/input/InputSystem';
import { Session } from './Session';
import { GREYBOX } from '@/data/characters/greybox';
import { GameAudio } from '@/audio';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  debugRoot: HTMLElement;
  forceWebGL?: boolean;
  /** 'training' (default) or 'versus'. */
  mode?: string;
  /** Initial quality tier override. */
  quality?: string;
  /** Round HP override (tests). */
  hp?: number;
  /** Open-edge arena for ring-outs. */
  ringout?: boolean;
}

/** Application root. Owns the renderer, loop, input and the active session. */
export class Game {
  readonly loop: FixedStepLoop;
  readonly input = new InputSystem();
  readonly audio = new GameAudio({ theme: 'dojo' });
  renderer!: WebGPURenderer;
  backend: Backend = 'webgl2';
  quality: QualitySettings = QUALITY_PRESETS.medium;
  scene!: GreyBoxScene;
  session: Session | null = null;
  private profiler: ProfilerOverlay;
  private readonly opts: GameOptions;
  private unbind: (() => void) | null = null;

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.profiler = new ProfilerOverlay(opts.debugRoot);
    this.loop = new FixedStepLoop({
      sampleInput: () => this.session?.sampleInput(),
      step: () => this.session?.step(),
      render: (alpha, dt) => this.render(alpha, dt),
    });
  }

  async init(): Promise<void> {
    const { renderer, backend } = await createRenderer(this.opts.canvas, this.opts.forceWebGL ?? false);
    this.renderer = renderer;
    this.backend = backend;
    this.renderer.shadowMap.enabled = true;
    this.scene = new GreyBoxScene(this.aspect());
    const q = this.opts.quality && this.opts.quality in QUALITY_PRESETS ? QUALITY_PRESETS[this.opts.quality as keyof typeof QUALITY_PRESETS] : this.quality;
    this.applyQuality(q);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.input.attach();
    this.audio.attachUnlock(window);
    void this.audio.init();
    this.unbind = bindDebugHotkeys((key, v) => {
      if (key === 'profiler') this.profiler.setVisible(v);
    });
    this.startSession(this.opts.mode ?? 'training');
  }

  startSession(mode: string): void {
    this.session?.dispose();
    const training = mode !== 'versus';
    this.session = new Session({
      chars: [GREYBOX, GREYBOX],
      match: {
        training, roundsToWin: 2, roundTimeSec: 60,
        ...(this.opts.hp ? { hpOverride: this.opts.hp } : {}),
        ...(this.opts.ringout ? { arena: { id: 'open', name: 'Open Edge', halfX: 4000, halfZ: 4000, walls: false } } : {}),
      },
      scene: this.scene,
      uiRoot: this.opts.uiRoot,
      debugRoot: this.opts.debugRoot,
      input: this.input,
      audio: this.audio,
      maxParticles: this.quality.particlesMax,
    });
  }

  applyQuality(q: QualitySettings): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * q.renderScale);
    this.renderer.shadowMap.enabled = q.shadows;
    this.session?.vfx.setQuality(q.particlesMax);
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
    this.input.detach();
    this.session?.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }

  private render(alpha: number, dt: number): void {
    const r = this.renderer;
    if (this.session) this.session.render(alpha, dt, r);
    else r.render(this.scene.scene, this.scene.camera);
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
      simFrame: this.getSimFrame(),
    }, performance.now());
    if (debugFlags.profiler) this.profiler.setVisible(true);
  }

  getSimFrame(): number {
    return this.session?.sim.frame ?? 0;
  }
}
