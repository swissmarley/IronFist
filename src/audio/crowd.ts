/**
 * Crowd ambience: a looping band-passed noise bed whose level and brightness
 * follow `setExcitement(0..1)`, plus one-shot reactions (gasp/cheer/roar)
 * that temporarily lift the excitement.
 */
import type { AudioEngine } from './AudioEngine';
import { clamp } from './types';

export type CrowdReaction = 'gasp' | 'cheer' | 'roar' | 'ooh';

const REACTION_LIFT: Record<CrowdReaction, number> = { gasp: 0.25, ooh: 0.15, cheer: 0.5, roar: 0.8 };

export class CrowdAmbience {
  private readonly engine: AudioEngine;
  private bed: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private excitement = 0.2;
  private burst = 0;
  private level = 0;
  private running = false;
  private lastReaction = -1;
  /** Base loudness of the bed at full excitement. */
  volume = 0.5;

  constructor(engine: AudioEngine) { this.engine = engine; }

  get isRunning(): boolean { return this.running; }
  get currentExcitement(): number { return clamp(this.excitement + this.burst, 0, 1); }

  /** Start the ambience loop. Safe before the engine is ready (no-op until then). */
  start(): void {
    this.running = true;
    this.ensureGraph();
  }

  private ensureGraph(): boolean {
    if (this.bed) return true;
    const ctx = this.engine.context;
    const bus = this.engine.bus('sfx');
    const noise = this.engine.noise;
    if (!ctx || !bus || !noise) return false;
    const bed = ctx.createGain();
    bed.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = 500;
    tone.Q.value = 0.6;
    tone.connect(bed);
    bed.connect(bus);
    // Two detuned loops of the same buffer avoid an audible loop point.
    for (const rate of [0.93, 1.07]) {
      const src = ctx.createBufferSource();
      src.buffer = noise.get(rate < 1 ? 'brown' : 'pink');
      src.loop = true;
      src.playbackRate.value = rate;
      src.connect(tone);
      src.start(ctx.currentTime, rate < 1 ? 0 : noise.seconds * 0.5);
      this.sources.push(src);
    }
    this.bed = bed;
    this.tone = tone;
    return true;
  }

  /** Steady-state excitement 0..1 (how close/tense the match is). */
  setExcitement(e: number): void { this.excitement = clamp(e, 0, 1); }

  /** One-shot reaction; also plays the matching SFX through the engine. */
  react(kind: CrowdReaction, strength = 1): void {
    const lift = REACTION_LIFT[kind] * clamp(strength, 0, 2);
    this.burst = Math.min(1, Math.max(this.burst, lift));
    const now = this.engine.now;
    if (now - this.lastReaction < 0.25) return; // debounce rapid-fire combos
    this.lastReaction = now;
    if (kind === 'cheer' || kind === 'roar') this.engine.play('crowd_cheer', { strength: kind === 'roar' ? 3 : 1.5, gain: 0.6 });
    else this.engine.play('crowd_gasp', { gain: kind === 'ooh' ? 0.5 : 0.8 });
  }

  update(dtMs: number): void {
    if (!this.running || !this.ensureGraph()) return;
    const ctx = this.engine.context;
    if (!ctx || !this.bed || !this.tone) return;
    const dt = Math.max(0, dtMs) / 1000;
    this.burst = Math.max(0, this.burst - dt * 0.35);
    const target = this.currentExcitement;
    this.level += (target - this.level) * Math.min(1, dt * 2.5);
    const gain = this.volume * (0.08 + 0.92 * this.level * this.level);
    this.bed.gain.setTargetAtTime(gain, ctx.currentTime, 0.1);
    this.tone.frequency.setTargetAtTime(400 + 1400 * this.level, ctx.currentTime, 0.2);
  }

  stop(): void {
    this.running = false;
    const ctx = this.engine.context;
    if (this.bed && ctx) this.bed.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  dispose(): void {
    this.running = false;
    for (const s of this.sources) { try { s.stop(); } catch { /* not started */ } s.disconnect(); }
    this.sources = [];
    this.tone?.disconnect();
    this.bed?.disconnect();
    this.tone = null;
    this.bed = null;
  }
}
