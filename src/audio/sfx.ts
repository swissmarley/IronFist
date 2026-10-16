/**
 * Fully procedural sound effects. Every sound is built from oscillators and
 * pre-generated noise buffers with short envelopes; nothing is loaded from
 * disk. Recipes return their total duration in seconds so the engine can
 * track voice lifetimes without listening for `ended`.
 */
import { clamp, EPS_GAIN, SFX_IDS, type AudioCtx, type SfxId } from './types';

export { SFX_IDS, type SfxId };

export type NoiseKind = 'white' | 'pink' | 'brown';

/** Noise buffers generated once per context and shared by every voice. */
export class NoiseBank {
  private readonly buffers: Record<NoiseKind, AudioBuffer>;
  readonly seconds: number;

  constructor(ctx: AudioCtx, seconds = 1.5) {
    this.seconds = seconds;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    this.buffers = {
      white: fill(ctx.createBuffer(1, len, ctx.sampleRate), 'white'),
      pink: fill(ctx.createBuffer(1, len, ctx.sampleRate), 'pink'),
      brown: fill(ctx.createBuffer(1, len, ctx.sampleRate), 'brown'),
    };
  }

  get(kind: NoiseKind): AudioBuffer { return this.buffers[kind]; }
}

/** Deterministic xorshift so buffers are identical across sessions. */
function fill(buf: AudioBuffer, kind: NoiseKind): AudioBuffer {
  const d = buf.getChannelData(0);
  let seed = 0x9e3779b9 >>> 0;
  const rnd = (): number => {
    seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return (seed / 0xffffffff) * 2 - 1;
  };
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = rnd();
    if (kind === 'white') { d[i] = w; continue; }
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; continue; }
    // Paul Kellet's economy pink-noise filter.
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/** Per-play context handed to every recipe. */
export interface SfxVoice {
  ctx: AudioCtx;
  out: AudioNode;
  /** Context time at which the sound starts. */
  t: number;
  noise: NoiseBank;
  /** Impact strength 0..3. */
  s: number;
  /** Pitch multiplier. */
  pitch: number;
}

interface ToneSpec {
  type?: OscillatorType; f0: number; f1?: number; slide?: number;
  dur: number; g: number; a?: number; delay?: number;
}
interface NoiseSpec {
  kind?: NoiseKind; filter?: BiquadFilterType; fc: number; fc1?: number; q?: number;
  dur: number; g: number; a?: number; delay?: number; rate?: number;
}

function env(p: AudioParam, t: number, peak: number, a: number, dur: number): void {
  p.setValueAtTime(EPS_GAIN, t);
  p.linearRampToValueAtTime(Math.max(EPS_GAIN, peak), t + a);
  p.exponentialRampToValueAtTime(EPS_GAIN, t + dur);
}

function tone(v: SfxVoice, s: ToneSpec): void {
  const t = v.t + (s.delay ?? 0);
  const o = v.ctx.createOscillator();
  const g = v.ctx.createGain();
  o.type = s.type ?? 'sine';
  o.frequency.setValueAtTime(Math.max(1, s.f0 * v.pitch), t);
  if (s.f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, s.f1 * v.pitch), t + (s.slide ?? s.dur));
  env(g.gain, t, s.g, s.a ?? 0.003, s.dur);
  o.connect(g); g.connect(v.out);
  o.start(t); o.stop(t + s.dur + 0.02);
}

function burst(v: SfxVoice, s: NoiseSpec): void {
  const t = v.t + (s.delay ?? 0);
  const src = v.ctx.createBufferSource();
  const buf = v.noise.get(s.kind ?? 'white');
  src.buffer = buf;
  src.playbackRate.value = (s.rate ?? 1) * Math.sqrt(v.pitch);
  const f = v.ctx.createBiquadFilter();
  f.type = s.filter ?? 'bandpass';
  f.frequency.setValueAtTime(Math.max(20, s.fc * Math.sqrt(v.pitch)), t);
  if (s.fc1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, s.fc1 * Math.sqrt(v.pitch)), t + s.dur);
  f.Q.value = s.q ?? 1;
  const g = v.ctx.createGain();
  env(g.gain, t, s.g, s.a ?? 0.002, s.dur);
  src.connect(f); f.connect(g); g.connect(v.out);
  const room = Math.max(0, v.noise.seconds - s.dur - 0.1);
  src.start(t, Math.random() * room);
  src.stop(t + s.dur + 0.02);
}

/** Strength 0..3 → amplitude multiplier and a pitch drop for heavier hits. */
function weight(v: SfxVoice): { amp: number; drop: number } {
  const k = clamp(v.s, 0, 3);
  return { amp: 0.8 + 0.2 * k, drop: 1 - 0.07 * k };
}

/** Layered impact: flesh thump + crack + body + whoosh tail. */
function hit(v: SfxVoice, lvl: number): number {
  const { amp, drop } = weight(v);
  const w: SfxVoice = { ...v, pitch: v.pitch * drop };
  tone(w, { f0: 170 - lvl * 28, f1: 42, slide: 0.05, dur: 0.09 + lvl * 0.04, g: (0.55 + lvl * 0.15) * amp });
  burst(w, { kind: 'white', fc: 2700 - lvl * 420, q: 0.8, dur: 0.028 + lvl * 0.014, g: (0.45 + lvl * 0.12) * amp });
  burst(w, { kind: 'brown', filter: 'lowpass', fc: 520 + lvl * 160, fc1: 110, dur: 0.12 + lvl * 0.05, g: (0.5 + lvl * 0.2) * amp });
  burst(w, { kind: 'pink', fc: 900, fc1: 280, q: 0.7, dur: 0.18 + lvl * 0.06, g: (0.14 + lvl * 0.05) * amp, a: 0.02 });
  if (lvl >= 3) {
    tone(w, { f0: 64, f1: 28, dur: 0.34, g: 0.7 * amp, a: 0.01 });
    burst(w, { kind: 'pink', fc: 300, fc1: 2400, q: 1.5, dur: 0.3, g: 0.2 * amp, a: 0.05, delay: 0.03 });
  }
  return 0.26 + lvl * 0.09;
}

function block(v: SfxVoice, heavy: boolean): number {
  const { amp } = weight(v);
  const k = heavy ? 1 : 0;
  tone(v, { type: 'triangle', f0: 430 - k * 120, f1: 170 - k * 50, slide: 0.03, dur: 0.07 + k * 0.05, g: 0.5 * amp });
  burst(v, { kind: 'white', fc: 1300 - k * 300, q: 1.2, dur: 0.035 + k * 0.02, g: 0.35 * amp });
  burst(v, { kind: 'brown', filter: 'lowpass', fc: 400, fc1: 90, dur: 0.1 + k * 0.08, g: (0.4 + k * 0.25) * amp });
  if (heavy) tone(v, { type: 'square', f0: 310, f1: 280, dur: 0.16, g: 0.08 * amp, a: 0.005 });
  return 0.2 + k * 0.1;
}

function footfall(v: SfxVoice, g: number, dur: number): void {
  burst(v, { kind: 'brown', filter: 'lowpass', fc: 900, fc1: 200, dur, g });
  burst(v, { kind: 'white', filter: 'highpass', fc: 2500, q: 0.5, dur: dur * 0.5, g: g * 0.25 });
}

function whoosh(v: SfxVoice, lo: number, hi: number, dur: number, g: number, kind: NoiseKind = 'pink'): void {
  const { amp } = weight(v);
  burst(v, { kind, fc: lo, fc1: hi, q: 1.3, dur, g: g * amp, a: dur * 0.35 });
}

const RECIPES: Record<SfxId, (v: SfxVoice) => number> = {
  whoosh_light: (v) => { whoosh(v, 450, 2200, 0.15, 0.35); return 0.16; },
  whoosh_heavy: (v) => {
    whoosh(v, 180, 1000, 0.27, 0.5);
    burst(v, { kind: 'brown', filter: 'lowpass', fc: 220, fc1: 600, dur: 0.27, g: 0.3, a: 0.1 });
    return 0.28;
  },
  hit_light: (v) => hit(v, 0),
  hit_medium: (v) => hit(v, 1),
  hit_heavy: (v) => hit(v, 2),
  hit_launch: (v) => hit(v, 3),
  hit_counter: (v) => {
    const d = hit(v, 2);
    tone(v, { type: 'triangle', f0: 1850, f1: 1400, dur: 0.22, g: 0.25, a: 0.002 });
    tone(v, { f0: 2800, f1: 2200, dur: 0.12, g: 0.12, delay: 0.015 });
    return Math.max(d, 0.24);
  },
  block: (v) => block(v, false),
  block_heavy: (v) => block(v, true),
  armour: (v) => {
    const { amp } = weight(v);
    tone(v, { type: 'square', f0: 520, f1: 500, dur: 0.28, g: 0.18 * amp });
    tone(v, { type: 'sawtooth', f0: 782, f1: 760, dur: 0.22, g: 0.1 * amp });
    tone(v, { f0: 140, f1: 50, slide: 0.04, dur: 0.12, g: 0.5 * amp });
    burst(v, { kind: 'white', filter: 'highpass', fc: 3000, dur: 0.05, g: 0.3 * amp });
    return 0.3;
  },
  parry: (v) => {
    burst(v, { kind: 'white', fc: 1500, fc1: 6500, q: 2, dur: 0.13, g: 0.45, a: 0.01 });
    tone(v, { f0: 1400, f1: 2900, slide: 0.08, dur: 0.16, g: 0.25 });
    tone(v, { f0: 180, f1: 60, slide: 0.03, dur: 0.07, g: 0.35 });
    return 0.17;
  },
  throw_grab: (v) => {
    burst(v, { kind: 'pink', filter: 'lowpass', fc: 1400, fc1: 300, dur: 0.13, g: 0.45, a: 0.015 });
    tone(v, { f0: 110, f1: 55, slide: 0.03, dur: 0.07, g: 0.35 });
    return 0.14;
  },
  throw_slam: (v) => {
    const d = hit(v, 3);
    burst(v, { kind: 'brown', filter: 'lowpass', fc: 160, fc1: 60, dur: 0.45, g: 0.6, a: 0.01 });
    return Math.max(d, 0.46);
  },
  throw_break: (v) => {
    tone(v, { type: 'triangle', f0: 2400, f1: 2000, dur: 0.1, g: 0.3 });
    tone(v, { type: 'triangle', f0: 2400, f1: 2000, dur: 0.1, g: 0.3, delay: 0.06 });
    burst(v, { kind: 'white', fc: 3200, q: 1, dur: 0.03, g: 0.3 });
    whoosh(v, 600, 1800, 0.14, 0.25);
    return 0.2;
  },
  wall_splat: (v) => {
    const { amp } = weight(v);
    tone(v, { f0: 95, f1: 34, slide: 0.08, dur: 0.26, g: 0.7 * amp });
    burst(v, { kind: 'brown', filter: 'lowpass', fc: 500, fc1: 80, dur: 0.22, g: 0.65 * amp });
    burst(v, { kind: 'white', fc: 1800, q: 0.5, dur: 0.06, g: 0.4 * amp });
    burst(v, { kind: 'pink', filter: 'lowpass', fc: 450, fc1: 150, dur: 0.42, g: 0.2 * amp, a: 0.03 });
    return 0.44;
  },
  land: (v) => {
    footfall(v, 0.45, 0.08);
    tone(v, { f0: 75, f1: 45, dur: 0.07, g: 0.3 });
    return 0.1;
  },
  land_heavy: (v) => {
    footfall(v, 0.7, 0.14);
    tone(v, { f0: 80, f1: 30, slide: 0.06, dur: 0.2, g: 0.6 });
    burst(v, { kind: 'brown', filter: 'lowpass', fc: 200, fc1: 60, dur: 0.3, g: 0.45 });
    return 0.32;
  },
  step: (v) => { footfall(v, 0.3, 0.05); return 0.06; },
  sidestep: (v) => {
    footfall(v, 0.3, 0.05);
    burst(v, { kind: 'pink', fc: 700, fc1: 1600, q: 1.2, dur: 0.12, g: 0.18, a: 0.03, delay: 0.01 });
    return 0.14;
  },
  dash: (v) => {
    whoosh(v, 350, 1600, 0.16, 0.3);
    footfall(v, 0.3, 0.05);
    return 0.17;
  },
  jump: (v) => {
    burst(v, { kind: 'pink', fc: 400, fc1: 1400, q: 1, dur: 0.16, g: 0.25, a: 0.04 });
    footfall(v, 0.25, 0.05);
    return 0.17;
  },
  ko: (v) => {
    tone(v, { f0: 72, f1: 26, slide: 0.4, dur: 0.65, g: 0.8, a: 0.005 });
    burst(v, { kind: 'brown', filter: 'lowpass', fc: 180, fc1: 50, dur: 0.6, g: 0.7, a: 0.005 });
    burst(v, { kind: 'white', fc: 2200, q: 0.6, dur: 0.06, g: 0.5 });
    tone(v, { type: 'sawtooth', f0: 420, f1: 55, slide: 0.45, dur: 0.5, g: 0.12, a: 0.02, delay: 0.04 });
    tone(v, { type: 'triangle', f0: 220, f1: 215, dur: 1.0, g: 0.14, a: 0.01, delay: 0.05 });
    tone(v, { type: 'triangle', f0: 331, f1: 325, dur: 0.9, g: 0.08, a: 0.01, delay: 0.05 });
    return 1.1;
  },
  round_start: (v) => {
    tone(v, { f0: 440, f1: 436, dur: 0.6, g: 0.3 });
    tone(v, { f0: 660, f1: 655, dur: 0.5, g: 0.18 });
    tone(v, { f0: 880, f1: 872, dur: 0.4, g: 0.1 });
    burst(v, { kind: 'white', filter: 'highpass', fc: 4000, dur: 0.08, g: 0.15 });
    burst(v, { kind: 'brown', filter: 'lowpass', fc: 250, fc1: 80, dur: 0.3, g: 0.4 });
    return 0.65;
  },
  ui_move: (v) => { tone(v, { type: 'triangle', f0: 900, f1: 850, dur: 0.035, g: 0.25 }); return 0.04; },
  ui_confirm: (v) => {
    tone(v, { f0: 660, f1: 655, dur: 0.1, g: 0.25 });
    tone(v, { f0: 990, f1: 985, dur: 0.14, g: 0.25, delay: 0.07 });
    return 0.22;
  },
  ui_back: (v) => { tone(v, { f0: 700, f1: 440, slide: 0.08, dur: 0.11, g: 0.22 }); return 0.12; },
  crowd_gasp: (v) => {
    burst(v, { kind: 'pink', fc: 500, fc1: 950, q: 0.8, dur: 0.55, g: 0.4, a: 0.08 });
    burst(v, { kind: 'white', filter: 'highpass', fc: 3000, dur: 0.45, g: 0.08, a: 0.1 });
    return 0.56;
  },
  crowd_cheer: (v) => {
    const { amp } = weight(v);
    burst(v, { kind: 'pink', fc: 1200, q: 0.5, dur: 1.2, g: 0.45 * amp, a: 0.12 });
    burst(v, { kind: 'pink', fc: 800, fc1: 1500, q: 0.7, dur: 0.9, g: 0.3 * amp, a: 0.2, delay: 0.25 });
    burst(v, { kind: 'white', filter: 'highpass', fc: 2500, dur: 1.0, g: 0.1 * amp, a: 0.15, delay: 0.1 });
    return 1.5;
  },
};

/** Render one sound into `v.out`; returns its duration in seconds. */
export function renderSfx(id: SfxId, v: SfxVoice): number {
  return RECIPES[id](v);
}

export function isSfxId(id: string): id is SfxId {
  return (SFX_IDS as readonly string[]).includes(id);
}
