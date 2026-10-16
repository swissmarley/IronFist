/**
 * Web Audio mixer and one-shot SFX player.
 *
 * Graph:  voice -> pan -> bus(sfx|voice|music|ui) -> master -> limiter -> destination
 * The music bus passes through an extra "duck" gain that `duck()` dips for
 * big hits and KOs.
 *
 * Safe to construct and `init()` before any user gesture: the context is
 * created suspended and `attachUnlock()` resumes it on the first pointer or
 * key event. Every method is a no-op until the context exists.
 */
import { NoiseBank, renderSfx, type SfxId } from './sfx';
import { BUS_NAMES, clamp, findAudioContextCtor, type AudioCtx, type BusName, type PlayOpts } from './types';

export interface AudioEngineOptions {
  /** Supply an existing context (tests use a fake). */
  context?: AudioCtx;
  /** Factory used by `init()` when no context was supplied. */
  createContext?: () => AudioCtx | null;
  /** Polyphony cap for one-shot SFX. */
  maxVoices?: number;
  /** Horizontal distance (m) from the listener that maps to full stereo pan. */
  panWidth?: number;
}

interface ActiveVoice { end: number; gain: GainNode }

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

export class AudioEngine {
  private ctx: AudioCtx | null = null;
  private readonly createContext: () => AudioCtx | null;
  private readonly maxVoices: number;
  private readonly panWidth: number;
  private buses: Record<BusName, GainNode> | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private duckNode: GainNode | null = null;
  private noiseBank: NoiseBank | null = null;
  private readonly busGains: Record<BusName, number> = { master: 1, sfx: 1, voice: 1, music: 0.7, ui: 0.8 };
  private readonly voices: ActiveVoice[] = [];
  private listenerX = 0;
  private listenerZ = 0;
  private duckLevel = 1;
  private duckRate = 0;
  private disposed = false;
  private initPromise: Promise<void> | null = null;
  private warned = false;

  constructor(opts: AudioEngineOptions = {}) {
    this.ctx = opts.context ?? null;
    this.createContext = opts.createContext ?? defaultCreateContext;
    this.maxVoices = opts.maxVoices ?? 32;
    this.panWidth = opts.panWidth ?? 4;
  }

  /** True once a context exists and the graph is wired. */
  get ready(): boolean { return this.buses !== null; }
  get context(): AudioCtx | null { return this.ctx; }
  get noise(): NoiseBank | null { return this.noiseBank; }
  /** Context time in seconds (0 before init). */
  get now(): number { return this.ctx ? this.ctx.currentTime : 0; }
  get state(): AudioContextState | 'none' { return this.ctx ? this.ctx.state : 'none'; }

  /**
   * Create (or adopt) the context, wire the mixer and try to resume. Calling
   * before a user gesture is fine: the context stays suspended until
   * `attachUnlock` or a later `init()` call resumes it. Idempotent.
   */
  init(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise.then(() => this.resume());
  }

  private async doInit(): Promise<void> {
    if (!this.ctx) {
      try { this.ctx = this.createContext(); } catch (err) { this.warnOnce('AudioContext unavailable', err); }
    }
    if (!this.ctx) return;
    this.buildGraph(this.ctx);
  }

  private async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    try { await ctx.resume(); } catch { /* needs a gesture; attachUnlock retries */ }
  }

  private buildGraph(ctx: AudioCtx): void {
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    const duck = ctx.createGain();
    duck.connect(master);
    const buses: Record<BusName, GainNode> = {
      master,
      sfx: ctx.createGain(),
      voice: ctx.createGain(),
      music: ctx.createGain(),
      ui: ctx.createGain(),
    };
    buses.sfx.connect(master);
    buses.voice.connect(master);
    buses.ui.connect(master);
    buses.music.connect(duck);
    for (const name of BUS_NAMES) buses[name].gain.value = this.busGains[name];
    this.limiter = limiter;
    this.duckNode = duck;
    this.buses = buses;
    this.noiseBank = new NoiseBank(ctx);
  }

  /**
   * Resume the context on the first pointer/key gesture on `target`
   * (typically `window`). Returns a function that detaches the listeners.
   */
  attachUnlock(target: EventTarget): () => void {
    const onGesture = (): void => {
      void this.init().then(() => { if (this.state === 'running') detach(); });
    };
    const detach = (): void => { for (const ev of UNLOCK_EVENTS) target.removeEventListener(ev, onGesture); };
    for (const ev of UNLOCK_EVENTS) target.addEventListener(ev, onGesture, { passive: true });
    return detach;
  }

  // ---- mixer -------------------------------------------------------------

  bus(name: BusName): GainNode | null { return this.buses ? this.buses[name] : null; }
  get limiterNode(): DynamicsCompressorNode | null { return this.limiter; }
  get musicDuckNode(): GainNode | null { return this.duckNode; }

  setBusGain(name: BusName, value: number): void {
    const v = clamp(value, 0, 1);
    this.busGains[name] = v;
    const bus = this.buses?.[name];
    if (bus && this.ctx) bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  getBusGain(name: BusName): number { return this.busGains[name]; }

  /** Listener position in metres on the XZ plane (camera focus point). */
  setListener(x: number, z: number): void { this.listenerX = x; this.listenerZ = z; }

  /** Dip the music bus by `amount` (0..1) and recover linearly over `ms`. */
  duck(amount: number, ms: number): void {
    const a = clamp(amount, 0, 1);
    const level = 1 - a;
    if (level < this.duckLevel) this.duckLevel = level;
    this.duckRate = Math.max(this.duckRate, a / Math.max(1, ms));
    this.applyDuck();
  }

  private applyDuck(): void {
    if (this.duckNode && this.ctx) this.duckNode.gain.setTargetAtTime(this.duckLevel, this.ctx.currentTime, 0.01);
  }

  // ---- playback ----------------------------------------------------------

  /** Fire a one-shot. Returns the sound's duration in seconds (0 when muted). */
  play(id: SfxId, opts: PlayOpts = {}): number {
    const ctx = this.ctx;
    const buses = this.buses;
    const noise = this.noiseBank;
    if (!ctx || !buses || !noise || this.disposed) return 0;
    const now = ctx.currentTime;
    this.pruneVoices(now);
    if (this.voices.length >= this.maxVoices) this.stealOldest();
    const busName: BusName = id.startsWith('ui_') ? 'ui' : 'sfx';
    const strength = clamp(opts.strength ?? 1, 0, 3);
    const { pan, atten } = this.spatialise(opts.x, opts.z);
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = clamp(opts.gain ?? 1, 0, 4) * atten;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    voiceGain.connect(panner);
    panner.connect(buses[busName]);
    let dur = 0;
    try {
      dur = renderSfx(id, { ctx, out: voiceGain, t: now, noise, s: strength, pitch: clamp(opts.pitch ?? 1, 0.25, 4) });
    } catch (err) {
      this.warnOnce(`sfx ${id} failed`, err);
      voiceGain.disconnect();
      return 0;
    }
    this.voices.push({ end: now + dur + 0.05, gain: voiceGain });
    return dur;
  }

  private spatialise(x: number | undefined, z: number | undefined): { pan: number; atten: number } {
    if (x === undefined) return { pan: 0, atten: 1 };
    const dx = x - this.listenerX;
    const dz = (z ?? this.listenerZ) - this.listenerZ;
    const pan = clamp(dx / this.panWidth, -1, 1) * 0.75;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const atten = 1 / (1 + dist * 0.12);
    return { pan, atten };
  }

  private pruneVoices(now: number): void {
    let w = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v && v.end > now) { this.voices[w++] = v; }
    }
    this.voices.length = w;
  }

  private stealOldest(): void {
    const v = this.voices.shift();
    if (!v || !this.ctx) return;
    v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.005);
  }

  /** Number of one-shots still sounding (by scheduled end time). */
  get activeVoices(): number { return this.voices.length; }

  // ---- per-frame ---------------------------------------------------------

  update(dtMs: number): void {
    if (this.duckLevel < 1) {
      this.duckLevel = Math.min(1, this.duckLevel + this.duckRate * dtMs);
      if (this.duckLevel >= 1) this.duckRate = 0;
      this.applyDuck();
    }
    if (this.ctx) this.pruneVoices(this.ctx.currentTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const ctx = this.ctx;
    this.buses = null;
    this.limiter = null;
    this.duckNode = null;
    this.noiseBank = null;
    this.voices.length = 0;
    this.ctx = null;
    if (ctx) ctx.close().catch(() => { /* already closed */ });
  }

  private warnOnce(msg: string, err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[audio] ${msg}`, err);
  }
}

function defaultCreateContext(): AudioCtx | null {
  const Ctor = findAudioContextCtor();
  return Ctor ? new Ctor() : null;
}
