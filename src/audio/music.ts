/**
 * Procedural loop-based music. Each theme is a 16-step pattern set
 * (drums, bass, chord stabs, lead) over a chord progression; everything is
 * synthesised from oscillators and the engine's noise bank and scheduled
 * ahead of the Web Audio clock from `update()` (no timers, so it is
 * deterministic under test).
 *
 * Intensity layers: 0 = pad only, 1 = + drums, 2 = + bass, 3 = + stabs/lead.
 */
import type { AudioEngine } from './AudioEngine';
import { clamp, EPS_GAIN, type AudioCtx } from './types';

export type LayerName = 'pad' | 'drums' | 'bass' | 'lead';
export const LAYERS: readonly LayerName[] = ['pad', 'drums', 'bass', 'lead'];

type Steps = readonly (number | null)[];

export interface ThemeDef {
  name: string;
  bpm: number;
  /** MIDI note of the bass root. */
  root: number;
  /** Scale as semitone offsets from the root. */
  scale: readonly number[];
  /** Chord progression, one chord (scale degrees) per bar. */
  chords: readonly (readonly number[])[];
  kick: string; snare: string; hat: string;
  /** 16 steps of scale degree (may exceed the scale length for octaves) or rest. */
  bass: Steps;
  /** 16-char stab pattern: 'x' = chord stab. */
  stabs: string;
  lead: Steps;
  padType: OscillatorType; padCutoff: number;
  bassType: OscillatorType; stabType: OscillatorType; leadType: OscillatorType;
  /** 0..0.3 delay applied to odd 16ths. */
  swing: number;
}

const R = null;
const DOR = [0, 2, 3, 5, 7, 9, 10], MIN = [0, 2, 3, 5, 7, 8, 10], PHR = [0, 1, 3, 5, 7, 8, 10];
const MIX = [0, 2, 4, 5, 7, 9, 10], LYD = [0, 2, 4, 6, 7, 9, 11], HIJ = [0, 1, 4, 5, 7, 8, 11], PENT = [0, 3, 5, 7, 10];

export const THEMES = {
  menu: {
    name: 'menu', bpm: 92, root: 45, scale: DOR,
    chords: [[0, 2, 4], [3, 5, 7], [5, 7, 9], [4, 6, 8]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    bass: [0, R, R, 0, R, R, 0, R, 7, R, R, 7, R, 5, R, R], stabs: '......x.......x.',
    lead: [R, R, R, R, R, R, R, R, 4, R, 2, R, R, R, R, R],
    padType: 'triangle', padCutoff: 900, bassType: 'triangle', stabType: 'triangle', leadType: 'sine', swing: 0,
  },
  dojo: {
    name: 'dojo', bpm: 100, root: 43, scale: PENT,
    chords: [[0, 2, 4], [0, 2, 4], [1, 3, 5], [0, 2, 4]],
    kick: 'x..x..x...x.x...', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.x.',
    bass: [0, R, R, 0, R, R, 2, R, R, R, 0, R, 3, R, R, R], stabs: '..x.......x.....',
    lead: [R, R, R, R, R, R, R, R, R, R, R, R, 4, R, 3, R],
    padType: 'triangle', padCutoff: 700, bassType: 'square', stabType: 'triangle', leadType: 'triangle', swing: 0,
  },
  harbour: {
    name: 'harbour', bpm: 108, root: 41, scale: MIX,
    chords: [[0, 2, 4], [6, 1, 3], [3, 5, 7], [4, 6, 8]],
    kick: 'x...x...x..x..x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx',
    bass: [0, R, 7, R, 0, R, 6, R, 3, R, 3, R, 4, R, 4, 5], stabs: '..x...x.....x...',
    lead: [R, R, R, R, 7, R, 9, R, R, R, R, R, 6, R, 4, R],
    padType: 'sawtooth', padCutoff: 600, bassType: 'sawtooth', stabType: 'square', leadType: 'triangle', swing: 0.15,
  },
  neon: {
    name: 'neon', bpm: 128, root: 40, scale: PHR,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [5, 7, 9]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...xx',
    bass: [0, 0, 7, 0, 0, 7, 0, 0, 1, 1, 8, 1, 1, 8, 1, 1], stabs: '..x...x.....x...',
    lead: [7, R, R, 9, R, R, 7, R, 8, R, R, 9, R, 8, R, 7],
    padType: 'sawtooth', padCutoff: 1100, bassType: 'sawtooth', stabType: 'sawtooth', leadType: 'square', swing: 0,
  },
  desert: {
    name: 'desert', bpm: 96, root: 38, scale: HIJ,
    chords: [[0, 2, 4], [0, 2, 4], [1, 3, 5], [6, 1, 3]],
    kick: 'x..x....x..x..x.', snare: '....x.......x...', hat: 'x.xx.x.xx.x.xx.x',
    bass: [0, R, R, 0, R, 0, R, R, 0, R, R, 1, R, 0, R, R], stabs: '....x.....x.....',
    lead: [R, R, 7, R, 8, R, R, 10, R, 8, R, 7, R, R, R, R],
    padType: 'triangle', padCutoff: 800, bassType: 'triangle', stabType: 'sawtooth', leadType: 'sawtooth', swing: 0.08,
  },
  forest: {
    name: 'forest', bpm: 84, root: 48, scale: LYD,
    chords: [[0, 2, 4, 6], [3, 5, 7], [1, 3, 5], [4, 6, 8]],
    kick: 'x.......x...x...', snare: '........x.......', hat: '..x..x..x..x..x.',
    bass: [0, R, R, R, R, R, R, R, 4, R, R, R, 2, R, R, R], stabs: '........x.......',
    lead: [R, R, R, R, 6, R, R, R, R, R, 4, R, R, 2, R, R],
    padType: 'sine', padCutoff: 1400, bassType: 'triangle', stabType: 'triangle', leadType: 'sine', swing: 0.1,
  },
  colosseum: {
    name: 'colosseum', bpm: 140, root: 36, scale: MIN,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
    kick: 'x.x.x.x.x.x.x.x.', snare: '....x..x....x...', hat: 'xxxxxxxxxxxxxxxx',
    bass: [0, R, 0, R, 0, R, 7, R, 0, R, 0, R, 5, R, 4, R], stabs: 'x...x...x...x.x.',
    lead: [7, R, R, R, 9, R, R, R, 7, R, R, R, 5, R, 4, R],
    padType: 'sawtooth', padCutoff: 500, bassType: 'square', stabType: 'sawtooth', leadType: 'sawtooth', swing: 0,
  },
} as const satisfies Record<string, ThemeDef>;

export type ThemeName = keyof typeof THEMES;
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export interface NoteTrace { time: number; step: number; layer: LayerName; midi: number }

const STEPS = 16;

function midiHz(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

function degreeMidi(theme: ThemeDef, degree: number, octave: number): number {
  const n = theme.scale.length;
  const oct = Math.floor(degree / n);
  const off = theme.scale[((degree % n) + n) % n] ?? 0;
  return theme.root + off + (oct + octave) * 12;
}

export class MusicPlayer {
  private readonly engine: AudioEngine;
  private readonly lookahead: number;
  private layers: Record<LayerName, GainNode> | null = null;
  private filter: BiquadFilterNode | null = null;
  private theme: ThemeDef | null = null;
  private playing = false;
  private step = 0;
  private nextTime = 0;
  private intensity = 1;
  private tempoScale = 1;
  private stepsScheduled = 0;
  /** Test/debug hook invoked for every scheduled note. */
  onNote: ((n: NoteTrace) => void) | null = null;

  constructor(engine: AudioEngine, opts: { lookahead?: number } = {}) {
    this.engine = engine;
    this.lookahead = opts.lookahead ?? 0.2;
  }

  get isPlaying(): boolean { return this.playing; }
  get currentTheme(): string | null { return this.theme?.name ?? null; }
  get scheduledSteps(): number { return this.stepsScheduled; }
  get currentIntensity(): number { return this.intensity; }
  layerGain(layer: LayerName): GainNode | null { return this.layers?.[layer] ?? null; }

  private ensureGraph(): boolean {
    if (this.layers) return true;
    const ctx = this.engine.context;
    const bus = this.engine.bus('music');
    if (!ctx || !bus) return false;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    filter.Q.value = 0.5;
    filter.connect(bus);
    const mk = (): GainNode => { const g = ctx.createGain(); g.gain.value = 0; g.connect(filter); return g; };
    this.layers = { pad: mk(), drums: mk(), bass: mk(), lead: mk() };
    this.filter = filter;
    return true;
  }

  /** Start a theme (restarts if already playing). Safe before the engine is ready. */
  play(theme: ThemeName | ThemeDef): void {
    this.theme = typeof theme === 'string' ? THEMES[theme] : theme;
    this.playing = true;
    this.step = 0;
    this.nextTime = -1;
    this.applyIntensity(0.4);
  }

  stop(fadeMs = 600): void {
    this.playing = false;
    const ctx = this.engine.context;
    if (!this.layers || !ctx) return;
    const tc = Math.max(0.01, fadeMs / 1000 / 3);
    for (const name of LAYERS) this.layers[name].gain.setTargetAtTime(0, ctx.currentTime, tc);
  }

  /** 0 = pad, 1 = + drums, 2 = + bass, 3 = + stabs and lead. Crossfades. */
  setIntensity(level: number): void {
    const l = clamp(Math.round(level), 0, 3);
    if (l === this.intensity) return;
    this.intensity = l;
    this.applyIntensity(0.6);
  }

  private applyIntensity(seconds: number): void {
    const ctx = this.engine.context;
    if (!this.ensureGraph() || !this.layers || !ctx || !this.playing) return;
    LAYERS.forEach((name, i) => {
      const target = i <= this.intensity ? 1 : 0;
      this.layers?.[name].gain.setTargetAtTime(target, ctx.currentTime, seconds / 3);
    });
  }

  /** Slow-motion: 0.5 halves the tempo and darkens the mix. */
  setTempoScale(scale: number): void {
    this.tempoScale = clamp(scale, 0.1, 2);
    const ctx = this.engine.context;
    if (this.filter && ctx) {
      const cutoff = this.tempoScale >= 1 ? 18000 : 400 + 17600 * this.tempoScale * this.tempoScale;
      this.filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.08);
    }
  }

  get currentTempoScale(): number { return this.tempoScale; }

  private stepSeconds(theme: ThemeDef): number { return 60 / theme.bpm / 4 / this.tempoScale; }

  /** Schedule any steps falling within the lookahead window. */
  update(_dtMs: number): void {
    const theme = this.theme;
    const ctx = this.engine.context;
    if (!this.playing || !theme || !ctx || !this.ensureGraph()) return;
    const now = ctx.currentTime;
    if (this.nextTime < 0) { this.nextTime = now + 0.05; this.applyIntensity(0.4); }
    const dur = this.stepSeconds(theme);
    let guard = 0;
    while (this.nextTime < now + this.lookahead && guard++ < 64) {
      const swing = (this.step & 1) ? theme.swing * dur : 0;
      this.scheduleStep(ctx, theme, this.step, this.nextTime + swing, dur);
      this.step++;
      this.nextTime += dur;
      this.stepsScheduled++;
    }
  }

  private scheduleStep(ctx: AudioCtx, theme: ThemeDef, step: number, t: number, dur: number): void {
    const layers = this.layers;
    if (!layers) return;
    const s = step % STEPS;
    const bar = Math.floor(step / STEPS);
    const chord = theme.chords[bar % theme.chords.length] ?? theme.chords[0] ?? [0];
    if (s === 0) this.pad(ctx, theme, chord, t, dur * STEPS, layers.pad, step);
    if (this.intensity >= 1) this.drums(ctx, theme, s, t, layers.drums, step);
    const b = theme.bass[s];
    if (this.intensity >= 2 && b !== null && b !== undefined) {
      const midi = degreeMidi(theme, b, -1);
      this.note(ctx, layers.bass, theme.bassType, midi, t, dur * 0.9, 0.35, 90 + midiHz(midi) * 3, 'bass', step);
    }
    if (this.intensity < 3) return;
    if (theme.stabs[s] === 'x') {
      for (const d of chord) {
        const midi = degreeMidi(theme, d, 1);
        this.note(ctx, layers.lead, theme.stabType, midi, t, dur * 1.2, 0.09, 2600, 'lead', step);
      }
    }
    const l = theme.lead[s];
    if (l !== null && l !== undefined) {
      const midi = degreeMidi(theme, l, 2);
      this.note(ctx, layers.lead, theme.leadType, midi, t, dur * 1.8, 0.12, 5000, 'lead', step);
    }
  }

  private pad(ctx: AudioCtx, theme: ThemeDef, chord: readonly number[], t: number, barLen: number, out: GainNode, step: number): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(theme.padCutoff, t);
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS_GAIN, t);
    g.gain.linearRampToValueAtTime(0.11, t + barLen * 0.25);
    g.gain.setValueAtTime(0.11, t + barLen);
    g.gain.exponentialRampToValueAtTime(EPS_GAIN, t + barLen * 1.3);
    filter.connect(g); g.connect(out);
    for (const d of chord) {
      const midi = degreeMidi(theme, d, 0);
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = theme.padType;
        o.frequency.value = midiHz(midi);
        o.detune.value = det;
        o.connect(filter);
        o.start(t); o.stop(t + barLen * 1.3);
      }
      this.onNote?.({ time: t, step, layer: 'pad', midi });
    }
  }

  private drums(ctx: AudioCtx, theme: ThemeDef, s: number, t: number, out: GainNode, step: number): void {
    const noise = this.engine.noise;
    if (theme.kick[s] === 'x') {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(EPS_GAIN, t + 0.2);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.22);
      this.onNote?.({ time: t, step, layer: 'drums', midi: 36 });
    }
    if (noise && theme.snare[s] === 'x') {
      this.noiseHit(ctx, noise.get('white'), 'bandpass', 1900, 0.9, t, 0.16, 0.45, out);
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(EPS_GAIN, t + 0.1);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.12);
      this.onNote?.({ time: t, step, layer: 'drums', midi: 38 });
    }
    if (noise && theme.hat[s] === 'x') {
      this.noiseHit(ctx, noise.get('white'), 'highpass', 7000, 0.7, t, s % 4 === 2 ? 0.08 : 0.035, 0.18, out);
      this.onNote?.({ time: t, step, layer: 'drums', midi: 42 });
    }
  }

  private noiseHit(ctx: AudioCtx, buf: AudioBuffer, type: BiquadFilterType, fc: number, q: number, t: number, dur: number, gain: number, out: GainNode): void {
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = fc; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(EPS_GAIN, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * Math.max(0, buf.duration - dur - 0.05)); src.stop(t + dur + 0.01);
  }

  private note(ctx: AudioCtx, out: GainNode, type: OscillatorType, midi: number, t: number, dur: number, gain: number, cutoff: number, layer: LayerName, step: number): void {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = midiHz(midi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.25), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS_GAIN, t); g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(EPS_GAIN, t + dur);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
    this.onNote?.({ time: t, step, layer, midi });
  }

  dispose(): void {
    this.stop(50);
    if (this.layers) for (const name of LAYERS) this.layers[name].disconnect();
    this.filter?.disconnect();
    this.layers = null;
    this.filter = null;
    this.theme = null;
  }
}
