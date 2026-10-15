import { FixedStepLoop } from '@/core/loop';
import { createRenderer, type Backend } from '@/render/backend';
import { GreyBoxScene } from '@/render/GreyBoxScene';
import { ProfilerOverlay } from '@/debug/ProfilerOverlay';
import { bindDebugHotkeys } from '@/debug/DebugHotkeys';
import { debugFlags } from '@/debug/DebugFlags';
import { QUALITY_PRESETS, type QualitySettings, type QualityTier } from '@/render/quality';
import { AdaptiveQuality } from '@/render/AdaptiveQuality';
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { InputSystem } from '@/input/InputSystem';
import { Session } from './Session';
import { GameAudio } from '@/audio';
import { STAGES } from '@/render/stages';
import { PostPipeline } from '@/render/PostPipeline';
import { SettingsStore, type Settings } from './settings';
import type { CharacterDef } from '@/sim/types';
import type { MatchConfig } from '@/sim/config';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  debugRoot: HTMLElement;
  forceWebGL?: boolean;
  quality?: string;
  noPost?: boolean;
}

/** Renderer/loop/input/audio owner. The App drives what is on screen through the loop hooks. */
export interface LoopDriver {
  sampleInput(): void;
  step(): void;
  render(alpha: number, dtMs: number): void;
  /** Monotonic step counter (sim frame during a match, menu ticks otherwise). */
  frame(): number;
}

export class Game {
  readonly loop: FixedStepLoop;
  readonly input = new InputSystem();
  readonly audio = new GameAudio({ theme: 'menu' });
  readonly settings = new SettingsStore();
  renderer!: WebGPURenderer;
  backend: Backend = 'webgl2';
  quality: QualitySettings = QUALITY_PRESETS.medium;
  /** Start-up tier probe + dynamic render scale (disabled when the tier is forced by a query param). */
  private adaptive: AdaptiveQuality | null = null;
  private dynamicScale = 1;
  scene!: GreyBoxScene;
  post: PostPipeline | null = null;
  driver: LoopDriver | null = null;
  stageId = '';
  private profiler: ProfilerOverlay;
  private readonly opts: GameOptions;
  private unbind: (() => void) | null = null;
  private simFrameProbe: () => number = () => 0;

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.profiler = new ProfilerOverlay(opts.debugRoot);
    this.loop = new FixedStepLoop({
      sampleInput: () => this.driver?.sampleInput(),
      step: () => this.driver?.step(),
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
    await this.settings.load();
    const s = this.settings.get();
    const forced = this.opts.quality && this.opts.quality in QUALITY_PRESETS ? (this.opts.quality as QualityTier) : null;
    this.quality = QUALITY_PRESETS[forced ?? this.resolveTier(s.quality)];
    if (!forced) this.adaptive = new AdaptiveQuality({ backend: this.backend, probe: s.quality === 'auto' });
    this.applySettings(s);
    this.settings.subscribe((ns) => this.applySettings(ns));
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.input.attach();
    this.audio.attachUnlock(window);
    void this.audio.init();
    this.unbind = bindDebugHotkeys((key, v) => { if (key === 'profiler') this.profiler.setVisible(v); });
  }

  private probedTier: QualityTier | null = null;

  private resolveTier(q: Settings['quality']): QualityTier {
    if (q !== 'auto') return q;
    return this.probedTier ?? (this.backend === 'webgpu' ? 'high' : 'medium');
  }

  /** Frame-time feedback: one-shot tier probe, then dynamic resolution. */
  private adapt(frameMs: number): void {
    if (!this.adaptive) return;
    const d = this.adaptive.sample(frameMs, this.quality.dynamicResolution);
    if (!d) return;
    if (d.tier && d.tier !== this.quality.tier && this.settings.get().quality === 'auto') {
      this.probedTier = d.tier;
      this.applySettings(this.settings.get());
    }
    if (d.scale !== undefined) { this.dynamicScale = d.scale; this.applyQuality(this.quality); }
  }

  private applySettings(s: Settings): void {
    const v = s.volumes;
    this.audio.engine.setBusGain('master', v.master);
    this.audio.engine.setBusGain('sfx', v.sfx);
    this.audio.engine.setBusGain('voice', v.voice);
    this.audio.engine.setBusGain('music', v.music);
    this.audio.engine.setBusGain('ui', v.ui);
    this.input.setKeyBindings(0, s.keys[0]);
    this.input.setKeyBindings(1, s.keys[1]);
    this.input.setPadBindings(0, s.pads[0]);
    this.input.setPadBindings(1, s.pads[1]);
    const tier = this.opts.quality && this.opts.quality in QUALITY_PRESETS ? (this.opts.quality as QualityTier) : this.resolveTier(s.quality);
    const q = { ...QUALITY_PRESETS[tier], renderScale: QUALITY_PRESETS[tier].renderScale * s.renderScale };
    this.applyQuality(q);
  }

  async loadStage(id: string): Promise<void> {
    if (this.stageId === id && this.scene.stage) return;
    const factory = STAGES[id] ?? STAGES.greybox;
    if (!factory) return;
    const stage = await factory({ renderer: this.renderer, shadows: this.quality.shadows, shadowMapSize: this.quality.shadowMapSize });
    this.scene.setStage(stage);
    this.stageId = id;
    this.audio.setTheme(stage.theme as never);
    this.post?.dispose();
    this.post = this.opts.noPost ? null : new PostPipeline(this.renderer, this.scene.scene, this.scene.camera, this.quality, stage.grading);
  }

  /** Build a match session on the current stage (does not start it). */
  createSession(chars: [CharacterDef, CharacterDef], config: Partial<MatchConfig>): Session {
    const session = new Session({
      chars, match: config, scene: this.scene, uiRoot: this.opts.uiRoot, debugRoot: this.opts.debugRoot, input: this.input, audio: this.audio,
      maxParticles: this.quality.particlesMax,
      soundCues: this.settings.get().accessibility.soundCues,
      ...(this.scene.stage ? { arena: this.scene.stage.arena } : {}),
    });
    session.setPost(this.post);
    const acc = this.settings.get().accessibility;
    session.hud.setColourBlind(acc.colourBlindHud);
    session.camera.reduceMotion = acc.reducedShake;
    session.vfx.setReducedFlash(acc.reducedFlash);
    this.simFrameProbe = () => session.sim.frame;
    return session;
  }

  applyQuality(q: QualitySettings): void {
    this.quality = q;
    if (!this.renderer) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * q.renderScale * this.dynamicScale);
    this.renderer.shadowMap.enabled = q.shadows;
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

  start(): void { this.loop.start(); }

  dispose(): void {
    this.loop.stop();
    this.unbind?.();
    this.input.detach();
    this.audio.dispose();
    this.renderer.dispose();
  }

  /** Render the bare scene (menus without a match). */
  renderScene(): void {
    if (this.post) this.post.render(); else this.renderer.render(this.scene.scene, this.scene.camera);
  }

  private render(alpha: number, dt: number): void {
    this.scene.update(dt);
    if (this.driver) this.driver.render(alpha, dt); else this.renderScene();
    if (!this.loop.isPaused()) this.adapt(dt);
    const info = this.renderer.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.profiler.update({
      loop: this.loop.stats, drawCalls: info.render.calls, triangles: info.render.triangles, gpuMs: 0,
      backend: this.backend, tier: this.quality.tier, memoryMB: mem ? mem.usedJSHeapSize / 1048576 : 0, simFrame: this.getSimFrame(),
    }, performance.now());
    if (debugFlags.profiler) this.profiler.setVisible(true);
  }

  getSimFrame(): number { return this.driver ? this.driver.frame() : this.simFrameProbe(); }
}
