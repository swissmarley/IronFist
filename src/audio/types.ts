/**
 * Shared audio types. The engine is written against a narrow structural
 * subset of `BaseAudioContext` so that tests can supply a fake context and
 * so the modules import cleanly under Node (no browser globals touched at
 * module scope).
 */

/** The subset of the Web Audio context the audio layer relies on. */
export interface AudioCtx {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNode;
  readonly state: AudioContextState;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBiquadFilter(): BiquadFilterNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  createDynamicsCompressor(): DynamicsCompressorNode;
  createStereoPanner(): StereoPannerNode;
}

export const BUS_NAMES = ['master', 'sfx', 'voice', 'music', 'ui'] as const;
export type BusName = (typeof BUS_NAMES)[number];

export const SFX_IDS = [
  'whoosh_light', 'whoosh_heavy',
  'hit_light', 'hit_medium', 'hit_heavy', 'hit_launch', 'hit_counter',
  'block', 'block_heavy', 'armour', 'parry',
  'throw_grab', 'throw_slam', 'throw_break',
  'wall_splat', 'land', 'land_heavy', 'step', 'dash', 'sidestep', 'jump',
  'ko', 'round_start',
  'ui_move', 'ui_confirm', 'ui_back',
  'crowd_gasp', 'crowd_cheer',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** Options accepted by `AudioEngine.play`. Positions are in metres. */
export interface PlayOpts {
  x?: number;
  z?: number;
  /** 0..3 impact strength (light .. launch). Default 1. */
  strength?: number;
  /** Playback pitch multiplier. Default 1. */
  pitch?: number;
  /** Linear gain multiplier. Default 1. */
  gain?: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smallest value we ramp gains to; exponential ramps cannot reach zero. */
export const EPS_GAIN = 0.0001;

/** Resolve a browser AudioContext constructor if one exists, else null. */
export function findAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}
