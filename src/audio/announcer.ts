/**
 * Match announcer. `SpeechAnnouncer` uses the browser's speech synthesis
 * when it exists; `SynthAnnouncer` is a PLACEHOLDER tonal cue (a short
 * two-note sting per line) used until recorded voice lines exist and as the
 * fallback wherever speech synthesis is unavailable.
 */
import type { AudioEngine } from './AudioEngine';
import { EPS_GAIN } from './types';

export const ANNOUNCER_LINES = [
  'round1', 'round2', 'round3', 'finalRound', 'fight', 'ko', 'perfect', 'timeOver',
  'ringOut', 'draw', 'youWin', 'youLose', 'excellent', 'great',
] as const;
export type AnnouncerLine = (typeof ANNOUNCER_LINES)[number];

export interface Announcer {
  say(line: AnnouncerLine): void;
  /** Human-readable name of the backend. */
  readonly kind: 'speech' | 'synth' | 'silent';
  dispose?(): void;
}

/** Spoken text for each line. */
export const LINE_TEXT: Record<AnnouncerLine, string> = {
  round1: 'Round one', round2: 'Round two', round3: 'Round three', finalRound: 'Final round',
  fight: 'Fight!', ko: 'K.O.!', perfect: 'Perfect!', timeOver: 'Time over', ringOut: 'Ring out!',
  draw: 'Draw', youWin: 'You win', youLose: 'You lose', excellent: 'Excellent!', great: 'Great!',
};

/** Placeholder sting per line: [first midi, second midi, duration s]. */
const STING: Record<AnnouncerLine, readonly [number, number, number]> = {
  round1: [62, 69, 0.5], round2: [64, 71, 0.5], round3: [66, 73, 0.5], finalRound: [60, 72, 0.7],
  fight: [69, 81, 0.35], ko: [67, 55, 0.9], perfect: [72, 84, 0.8], timeOver: [64, 57, 0.7],
  ringOut: [71, 59, 0.7], draw: [65, 65, 0.6], youWin: [67, 79, 0.9], youLose: [62, 50, 0.9],
  excellent: [74, 86, 0.6], great: [71, 78, 0.5],
};

function midiHz(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

/** PLACEHOLDER: tonal cue standing in for recorded announcer lines. */
export class SynthAnnouncer implements Announcer {
  readonly kind = 'synth' as const;
  private readonly engine: AudioEngine;
  constructor(engine: AudioEngine) { this.engine = engine; }

  say(line: AnnouncerLine): void {
    const ctx = this.engine.context;
    const bus = this.engine.bus('voice');
    if (!ctx || !bus) return;
    const [a, b, dur] = STING[line];
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS_GAIN, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.01);
    g.gain.setValueAtTime(0.35, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(EPS_GAIN, t + dur);
    g.connect(bus);
    for (const [i, midi] of [a, b].entries()) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'square' : 'sawtooth';
      o.frequency.setValueAtTime(midiHz(midi), t);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1800; f.Q.value = 1;
      const og = ctx.createGain();
      og.gain.setValueAtTime(i === 0 ? 1 : EPS_GAIN, t);
      og.gain.setValueAtTime(i === 0 ? EPS_GAIN : 1, t + dur * 0.4);
      o.connect(f); f.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.02);
    }
  }
}

interface SpeechLike {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
}

/** Find the speech synthesis API when the host provides it. */
export function findSpeechSynthesis(): SpeechLike | null {
  const g = globalThis as { speechSynthesis?: SpeechLike; SpeechSynthesisUtterance?: unknown };
  if (!g.speechSynthesis || typeof g.SpeechSynthesisUtterance !== 'function') return null;
  return g.speechSynthesis;
}

export class SpeechAnnouncer implements Announcer {
  readonly kind = 'speech' as const;
  private readonly synth: SpeechLike;
  private readonly fallback: Announcer | null;
  rate = 1.05;
  pitch = 0.8;
  volume = 1;

  constructor(synth: SpeechLike, fallback: Announcer | null = null) {
    this.synth = synth;
    this.fallback = fallback;
  }

  say(line: AnnouncerLine): void {
    try {
      const Utter = (globalThis as { SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
      if (!Utter) throw new Error('no SpeechSynthesisUtterance');
      const u = new Utter(LINE_TEXT[line]);
      u.rate = this.rate; u.pitch = this.pitch; u.volume = this.volume;
      this.synth.cancel();
      this.synth.speak(u);
    } catch (err) {
      console.warn('[audio] speech synthesis failed, using synth announcer', err);
      this.fallback?.say(line);
    }
  }

  dispose(): void { try { this.synth.cancel(); } catch { /* ignore */ } }
}

export class SilentAnnouncer implements Announcer {
  readonly kind = 'silent' as const;
  say(): void { /* intentionally silent */ }
}

/**
 * Build an announcer. 'speech' uses speechSynthesis when the host has it and
 * otherwise falls back to the synth placeholder; 'synth' always uses it.
 */
export function createAnnouncer(prefer: 'speech' | 'synth', engine: AudioEngine): Announcer {
  const synth = new SynthAnnouncer(engine);
  if (prefer === 'synth') return synth;
  const speech = findSpeechSynthesis();
  return speech ? new SpeechAnnouncer(speech, synth) : synth;
}
