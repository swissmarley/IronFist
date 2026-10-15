import { FixedStepLoop } from '@/core/loop';
import { createRenderer, type Backend } from '@/render/backend';
import { GreyBoxScene } from '@/render/GreyBoxScene';
import { ProfilerOverlay } from '@/debug/ProfilerOverlay';
import { bindDebugHotkeys } from '@/debug/DebugHotkeys';
import { debugFlags } from '@/debug/DebugFlags';
import { QUALITY_PRESETS, type QualitySettings } from '@/render/quality';
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { InputSystem } from '@/input/InputSystem';
import { Session } from './Session';
import { GREYBOX } from '@/data/characters/greybox';
import { GameAudio } from '@/audio';
import { STAGES } from '@/render/stages';
import { PostPipeline } from '@/render/PostPipeline';

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
  /** Stage id (see src/render/stages). */
  stage?: string;
  /** Disable post-processing (debug / tests). */
  noPost?: boolean;
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
  post: PostPipeline | null = null;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene = new GreyBoxScene(this.aspect());
    const q = this.opts.quality && this.opts.quality in QUALITY_PRESETS ? QUALITY_PRESETS[this.opts.quality as keyof typeof QUALITY_PRESETS] : this.quality;
    this.quality = q;
    await this.loadStage(this.opts.stage ?? 'dojo');
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

  async loadStage(id: string): Promise<void> {
    const factory = STAGES[id] ?? STAGES.greybox;
    if (!factory) return;
    const stage = await factory({ renderer: this.renderer, shadows: this.quality.shadows, shadowMapSize: this.quality.shadowMapSize });
    this.scene.setStage(stage);
    this.audio.setTheme(stage.theme as never);
    this.post?.dispose();
    this.post = this.opts.noPost ? null : new PostPipeline(this.renderer, this.scene.scene, this.scene.camera, this.quality, stage.grading);
    if (this.session) this.session.setPost(this.post);
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
      ...(this.scene.stage ? { arena: this.scene.stage.arena } : {}),
    });
    this.session.setPost(this.post);
  }

  applyQuality(q: QualitySettings): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * q.renderScale);
    this.renderer.shadowMap.enabled = q.shadows;
    this.session?.vfx.setQuality(q.particlesMax);
    this.post?.setQuality(q);
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
    this.scene.update(dt);
    if (this.session) this.session.render(alpha, dt, r);
    else if (this.post) this.post.render();
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
