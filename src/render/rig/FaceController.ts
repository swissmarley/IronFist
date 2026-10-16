import { FState } from '@/sim/fighterState';
import type { MoveDef } from '@/sim/types';

/**
 * Facial expression logic (render-only, pure: no `three`, no allocation per
 * frame). Maps the sim's FighterState to morph-target weights for the face
 * mesh built in FaceRig.ts. Wall-clock easing; hit-stop freezes the face.
 */

/** Morph target indices (order matches FaceRig's morphAttributes). */
export const FACE = { blink: 0, browAngry: 1, browPain: 2, mouthOpen: 3, mouthGrit: 4, eyesClosed: 5, smile: 6 } as const;
export const FACE_TARGET_COUNT = 7;
export const FACE_TARGET_NAMES: readonly string[] = ['blink', 'browAngry', 'browPain', 'mouthOpen', 'mouthGrit', 'eyesClosed', 'smile'];

/** Attack phase of the current move. */
export const ATTACK = { none: 0, startup: 1, active: 2, recovery: 3 } as const;

/** The few sim facts the face reacts to (filled from FighterState by `readFaceSignals`). */
export interface FaceSignals {
  state: FState;
  stateFrame: number;
  stateTotal: number;
  hitstop: number;
  ko: number;
  /** ATTACK.* for the current move (none outside Attack). */
  attackPhase: number;
  /** Current move (or throw) is a launcher / throw: shout instead of grit. */
  shout: boolean;
  /** Last hit reaction strength 0 (light) .. 3 (launch). */
  hitStrength: number;
}

export function emptyFaceSignals(): FaceSignals {
  return { state: FState.Idle, stateFrame: 0, stateTotal: 0, hitstop: 0, ko: 0, attackPhase: ATTACK.none, shout: false, hitStrength: 0 };
}

/** Per-move lookups precomputed once per character. */
export interface MoveFaceInfo {
  startup: readonly number[];
  lastActive: readonly number[];
  /** 1 when the move is a launcher or a throw. */
  shout: Uint8Array;
}

const LAUNCH_REACTIONS: ReadonlySet<string> = new Set(['launch', 'launchHigh', 'launchLow', 'spinLaunch', 'screw']);

/** Shout moves: throws, 'launcher' moves and hits that launch on normal hit (counter-hit-only launchers grit). */
export function moveFaceInfo(moves: readonly MoveDef[], startup: readonly number[], lastActive: readonly number[]): MoveFaceInfo {
  const shout = new Uint8Array(moves.length);
  moves.forEach((m, i) => {
    const props = m.properties ?? [];
    const launches = m.hits.some((h) => LAUNCH_REACTIONS.has(h.reaction));
    if (m.throw || props.includes('throw') || props.includes('launcher') || launches) shout[i] = 1;
  });
  return { startup, lastActive, shout };
}

/** The FighterState fields the face reads (structural, so tests can pass plain objects). */
export interface FaceSource {
  state: FState; stateFrame: number; stateTotal: number; hitstop: number; ko: number;
  moveIdx: number; moveFrame: number; throwMove: number; lastReaction: number;
}

export function readFaceSignals(f: FaceSource, info: MoveFaceInfo, out: FaceSignals): FaceSignals {
  out.state = f.state;
  out.stateFrame = f.stateFrame;
  out.stateTotal = f.stateTotal;
  out.hitstop = f.hitstop;
  out.ko = f.ko;
  out.hitStrength = f.lastReaction;
  out.attackPhase = ATTACK.none;
  out.shout = false;
  if (f.state === FState.Attack && f.moveIdx >= 0) {
    const first = info.startup[f.moveIdx] ?? 9999;
    const last = info.lastActive[f.moveIdx] ?? 0;
    out.attackPhase = f.moveFrame < first ? ATTACK.startup : f.moveFrame <= last ? ATTACK.active : ATTACK.recovery;
    out.shout = info.shout[f.moveIdx] === 1;
  } else if (f.state === FState.Throw) {
    out.shout = true;
  }
  return out;
}

/** Eased face state for one fighter; `out` holds the morph influences. */
export class FaceState {
  /** Eased expression channels (blink channel unused here). */
  readonly eased = new Float32Array(FACE_TARGET_COUNT);
  /** Raw targets for the current signals. */
  readonly target = new Float32Array(FACE_TARGET_COUNT);
  /** Final morph influences after blink and channel exclusivity. */
  readonly out = new Float32Array(FACE_TARGET_COUNT);
  /** Blink clock (ms of non-frozen wall time). */
  clockMs = 0;
  prevHitstop = 0;
  readonly phaseMs: number;

  constructor(phaseMs = 0) {
    this.phaseMs = phaseMs;
  }

  reset(): void {
    this.eased.fill(0); this.target.fill(0); this.out.fill(0);
    this.clockMs = 0; this.prevHitstop = 0;
  }
}

/** Gaps between blinks (ms); the short one is a double blink. Deterministic, phase-shifted per fighter. */
const BLINK_GAPS: readonly number[] = [3400, 260, 4100, 2900, 3700, 2500];
const BLINK_CYCLE = BLINK_GAPS.reduce((a, b) => a + b, 0);
const BLINK_CLOSE = 60, BLINK_HOLD = 40, BLINK_OPEN = 100;

/** Blink amount 0..1 at a clock time (pure). */
export function blinkAmount(clockMs: number, phaseMs: number): number {
  let c = (clockMs + phaseMs) % BLINK_CYCLE;
  if (c < 0) c += BLINK_CYCLE;
  for (const gap of BLINK_GAPS) {
    if (c < gap) break;
    c -= gap;
  }
  // c = time since the most recent blink started
  if (c < BLINK_CLOSE) return c / BLINK_CLOSE;
  if (c < BLINK_CLOSE + BLINK_HOLD) return 1;
  if (c < BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN) return 1 - (c - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
  return 0;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Expression targets (all channels except blink) for a set of signals. */
export function faceTargets(s: FaceSignals, out: Float32Array): Float32Array {
  out.fill(0);
  if (s.ko) {
    if (s.hitstop > 0) { out[FACE.browPain] = 1; out[FACE.mouthOpen] = 0.6; }
    else { out[FACE.eyesClosed] = 1; out[FACE.browPain] = 0.25; out[FACE.mouthOpen] = 0.2; }
    return out;
  }
  const str = clamp01(s.hitStrength / 3);
  switch (s.state) {
    case FState.Attack:
      if (s.attackPhase === ATTACK.startup) { out[FACE.browAngry] = s.shout ? 0.8 : 0.6; out[FACE.mouthGrit] = s.shout ? 0.5 : 0.35; }
      else if (s.attackPhase === ATTACK.active) { out[FACE.browAngry] = 1; out[s.shout ? FACE.mouthOpen : FACE.mouthGrit] = 1; }
      else { out[FACE.browAngry] = 0.5; out[FACE.mouthGrit] = 0.2; }
      break;
    case FState.Throw:
      out[FACE.browAngry] = 1;
      if (s.stateTotal > 0 && s.stateFrame > s.stateTotal * 0.6) out[FACE.mouthGrit] = 0.8; else out[FACE.mouthOpen] = 1;
      break;
    case FState.Thrown: out[FACE.browPain] = 0.9; out[FACE.mouthOpen] = 0.45; break;
    case FState.Hitstun:
      out[FACE.browPain] = 0.45 + 0.55 * str;
      out[FACE.mouthOpen] = 0.15 + 0.6 * str;
      out[FACE.mouthGrit] = 0.5 * (1 - str);
      break;
    case FState.Blockstun: {
      const b = clamp01(s.stateTotal / 18);
      out[FACE.mouthGrit] = 0.5 + 0.4 * b;
      out[FACE.browPain] = 0.25 + 0.45 * b;
      out[FACE.browAngry] = 0.2;
      break;
    }
    case FState.Air: out[FACE.browPain] = 0.9; out[FACE.mouthOpen] = 0.55; break;
    case FState.WallSplat: out[FACE.browPain] = 1; out[FACE.mouthOpen] = 0.7; break;
    case FState.Stagger: case FState.Crumple: out[FACE.browPain] = 0.85; out[FACE.mouthOpen] = 0.35; out[FACE.eyesClosed] = 0.25; break;
    case FState.Lying: out[FACE.browPain] = 0.5; out[FACE.mouthGrit] = 0.3; out[FACE.eyesClosed] = 0.15; break;
    case FState.Getup: case FState.Roll: out[FACE.browAngry] = 0.4; out[FACE.mouthGrit] = 0.4; break;
    case FState.Win:
      if (s.stateFrame < 30) { out[FACE.mouthGrit] = 0.8; out[FACE.browAngry] = 0.4; } else out[FACE.smile] = 1;
      break;
    case FState.Intro: out[FACE.browAngry] = 0.35; break;
    case FState.Dash: case FState.Run: case FState.CrouchDash: out[FACE.browAngry] = 0.3; out[FACE.mouthGrit] = 0.2; break;
    default: out[FACE.browAngry] = 0.15; break;
  }
  return out;
}

const TAU_IN = 55, TAU_OUT = 130, TAU_EYES = 220;

/**
 * Advance one fighter's face by `dtMs` of wall time and return the morph
 * influences (`face.out`). A fresh hit-stop snaps the expression to its
 * target (the impact face reads during the freeze); the rest of the hit-stop
 * holds it, blink clock included.
 */
export function faceWeights(s: FaceSignals, face: FaceState, dtMs: number): Float32Array {
  const target = faceTargets(s, face.target);
  const e = face.eased;
  const fresh = s.hitstop > face.prevHitstop;
  face.prevHitstop = s.hitstop;
  if (s.hitstop > 0) {
    if (fresh) for (let i = 1; i < FACE_TARGET_COUNT; i++) e[i] = target[i] as number;
  } else {
    face.clockMs += dtMs;
    for (let i = 1; i < FACE_TARGET_COUNT; i++) {
      const t = target[i] as number, w = e[i] as number;
      const tau = i === FACE.eyesClosed ? TAU_EYES : t > w ? TAU_IN : TAU_OUT;
      e[i] = w + (t - w) * (1 - Math.exp(-dtMs / tau));
    }
  }
  const o = face.out;
  // channel groups share geometry: keep each group's sum <= 1 so deltas never overshoot
  const eyes = e[FACE.eyesClosed] as number;
  o[FACE.eyesClosed] = eyes;
  o[FACE.blink] = blinkAmount(face.clockMs, face.phaseMs) * (1 - eyes);
  normaliseGroup(e, o, FACE.browAngry, FACE.browPain, -1);
  normaliseGroup(e, o, FACE.mouthOpen, FACE.mouthGrit, FACE.smile);
  return o;
}

function normaliseGroup(src: Float32Array, dst: Float32Array, a: number, b: number, c: number): void {
  const va = src[a] as number, vb = src[b] as number, vc = c >= 0 ? (src[c] as number) : 0;
  const sum = va + vb + vc;
  const k = sum > 1 ? 1 / sum : 1;
  dst[a] = va * k; dst[b] = vb * k;
  if (c >= 0) dst[c] = vc * k;
}
