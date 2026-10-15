import type { PoseEuler } from './pose';
import { resolveKeys, type EulerKey, type KeySpec, type Plant } from './plant';
import { INTRO, STANCE, WIN } from './poses';

/**
 * Per-character round-intro and win poses (render only). Each ceremony is a
 * few authored keys over an upright base; the intro then settles into the
 * fighter's stance before the sim's Intro state ends (`roundStartFrames`,
 * 100 frames), and the win pose holds its last key for the rest of the round.
 */
export interface CeremonyDef {
  length: number;
  /** Authored keys (relative to UPRIGHT). */
  keys: KeySpec[];
  /** Intro only: frame at which the stance is reached (held until `length`). */
  settle?: number;
}

/** Neutral standing pose, arms relaxed, feet under the hips. */
export const UPRIGHT: PoseEuler = {
  root: [0, -0.02, 0],
  hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  shoulderL: [0, 0, 0], upperArmL: [4, 0, 8], forearmL: [-12, 0, 0], handL: [-10, 0, 0],
  shoulderR: [0, 0, 0], upperArmR: [4, 0, -8], forearmR: [-12, 0, 0], handR: [-10, 0, 0],
  upperLegL: [0, 0, 0], lowerLegL: [0, 0, 0], footL: [0, 0, 0],
  upperLegR: [0, 0, 0], lowerLegR: [0, 0, 0], footR: [0, 0, 0],
};
const FEET_HIP: Plant = { L: { x: 0.11, z: 0.02, yaw: 8 }, R: { x: -0.11, z: 0.0, yaw: -8 } };
const FEET_TOGETHER: Plant = { L: { x: 0.07, z: 0.0, yaw: 12 }, R: { x: -0.07, z: 0.0, yaw: -12 } };
const FEET_WIDE: Plant = { L: { x: 0.24, z: 0.04, yaw: 10 }, R: { x: -0.24, z: -0.02, yaw: -10 }, knees: 0.5 };
/** Fists resting in front of the belt (karate / taekwondo ready position). */
const BELT_FISTS: KeySpec['reach'] = { L: { at: [0.14, 0.96, 0.24], pole: [1, 0, -0.3] }, R: { at: [-0.14, 0.96, 0.24], pole: [-1, 0, -0.3] } };
const ARMS_FREE: KeySpec['reach'] = {};

export const INTROS: Record<string, CeremonyDef> = {
  // kaede: formal standing bow, then fists to the belt (yoi) before taking guard
  bow: {
    length: 100, settle: 84,
    keys: [
      { t: 0, pose: {}, feet: FEET_TOGETHER, reach: { L: { at: [0.20, 0.86, 0.04], pole: [1, 0, -0.5] }, R: { at: [-0.20, 0.86, 0.04], pole: [-1, 0, -0.5] } } },
      { t: 26, pose: { root: [0, -0.02, -0.03], hips: [14, 0, 0], spine: [12, 0, 0], chest: [8, 0, 0], neck: [6, 0, 0] }, reach: { L: { at: [0.17, 0.80, 0.22], pole: [1, 0, -0.5] }, R: { at: [-0.17, 0.80, 0.22], pole: [-1, 0, -0.5] } } },
      { t: 44, pose: {}, reach: { L: { at: [0.20, 0.86, 0.04], pole: [1, 0, -0.5] }, R: { at: [-0.20, 0.86, 0.04], pole: [-1, 0, -0.5] } } },
      { t: 62, pose: { root: [0, -0.04, 0], chest: [-3, 0, 0] }, feet: FEET_HIP, reach: BELT_FISTS, ease: 'out' },
    ],
  },
  // boris: neck crack with arms hanging, then a double-biceps flex
  flex: {
    length: 100, settle: 86,
    keys: [
      { t: 0, pose: { neck: [8, 0, -14], head: [10, 0, -16], spine: [6, 0, 0] }, feet: FEET_WIDE, reach: { L: { at: [0.34, 0.90, 0.10], pole: [1, 0, -0.5] }, R: { at: [-0.34, 0.90, 0.10], pole: [-1, 0, -0.5] } } },
      { t: 20, pose: { neck: [8, 0, 14], head: [10, 0, 16], spine: [6, 0, 0] } },
      { t: 42, pose: { root: [0, -0.06, 0], spine: [-6, 0, 0], chest: [-8, 0, 0], head: [-8, 0, 0] }, reach: { L: { at: [0.52, 1.54, 0.10], pole: [0.3, -1, -0.3] }, R: { at: [-0.52, 1.54, 0.10], pole: [-0.3, -1, -0.3] } }, ease: 'overshoot' },
      { t: 66, pose: { root: [0, -0.07, 0], spine: [-8, 0, 0], chest: [-10, 0, 0], head: [-10, 0, 0] }, reach: { L: { at: [0.52, 1.57, 0.08], pole: [0.3, -1, -0.3] }, R: { at: [-0.52, 1.57, 0.08], pole: [-0.3, -1, -0.3] } } },
    ],
  },
  // luiz: cocorinha (deep capoeira squat, arm guarding the face), rising into the ginga
  cocorinha: {
    length: 100, settle: 86,
    keys: [
      { t: 0, pose: { root: [0, -0.46, -0.06], spine: [26, 0, 0], chest: [12, 0, 0], head: [-20, 0, 0] }, feet: { L: { x: 0.18, z: 0.04, yaw: 20 }, R: { x: -0.18, z: 0.0, yaw: -20 }, knees: 0.8 }, reach: { L: { at: [-0.02, 1.02, 0.40], pole: [1, -0.4, 0] }, R: { at: [-0.30, 0.42, 0.24], pole: [-1, 0, 0] } } },
      { t: 40, pose: { root: [0, -0.42, -0.06], spine: [24, -8, 0], chest: [12, -6, 0], head: [-18, 8, 0] } },
      { t: 66, pose: { root: [0, -0.18, 0], spine: [12, 0, 0] }, feet: { L: { x: 0.26, z: 0.04, yaw: 5 }, R: { x: -0.26, z: -0.02, yaw: -5 }, knees: 0.4 }, reach: { L: { at: [0.42, 1.30, 0.14], pole: [1, -0.6, -0.4] }, R: { at: [-0.42, 1.30, 0.14], pole: [-1, -0.6, -0.4] } }, ease: 'out' },
    ],
  },
  // meiling: bao quan (fist-in-palm salute) with a small bow
  baoquan: {
    length: 100, settle: 86,
    keys: [
      { t: 0, pose: { handL: [-80, 0, 0] }, feet: FEET_TOGETHER, reach: { L: { at: [0.04, 1.30, 0.42], pole: [1, -0.4, -0.2] }, R: { at: [-0.04, 1.28, 0.40], pole: [-1, -0.4, -0.2] } } },
      { t: 30, pose: { handL: [-80, 0, 0], spine: [10, 0, 0], chest: [6, 0, 0], neck: [6, 0, 0] }, reach: { L: { at: [0.04, 1.24, 0.46], pole: [1, -0.4, -0.2] }, R: { at: [-0.04, 1.22, 0.44], pole: [-1, -0.4, -0.2] } } },
      { t: 52, pose: { handL: [-80, 0, 0] }, reach: { L: { at: [0.04, 1.30, 0.42], pole: [1, -0.4, -0.2] }, R: { at: [-0.04, 1.28, 0.40], pole: [-1, -0.4, -0.2] } } },
      // half step: the lead foot slides out on its ball while the palms part
      { t: 70, pose: { root: [0, -0.07, 0], hips: [0, -24, 0], handL: [-60, 0, 0] }, feet: { L: { x: 0.06, z: 0.12, yaw: -5, pitch: 14 }, R: { x: -0.08, z: -0.10, yaw: -40 } }, reach: { L: { at: [0.06, 1.28, 0.50], pole: [0.6, -1, 0] }, R: { at: [-0.06, 1.20, 0.38], pole: [-1, -0.5, 0] } } },
    ],
  },
  // jaehyun: taekwondo bow (charyeot, kyeongnye) then joonbi
  tkdbow: {
    length: 100, settle: 84,
    keys: [
      { t: 0, pose: {}, feet: FEET_TOGETHER, reach: { L: { at: [0.21, 0.84, 0.02], pole: [1, 0, -0.5] }, R: { at: [-0.21, 0.84, 0.02], pole: [-1, 0, -0.5] } } },
      { t: 24, pose: { hips: [10, 0, 0], spine: [10, 0, 0], chest: [6, 0, 0], neck: [4, 0, 0] } },
      { t: 40, pose: {} },
      { t: 60, pose: { root: [0, -0.03, 0] }, feet: FEET_HIP, reach: BELT_FISTS, ease: 'snap' },
    ],
  },
  // seraphine: fencer's salute — guard raised before the face, swept down and out
  salute: {
    length: 100, settle: 86,
    keys: [
      { t: 0, pose: { hips: [0, -40, 0], neck: [0, 18, 0], head: [-4, 20, 0], handL: [-30, 0, 0] }, feet: { L: { x: 0.04, z: 0.18, yaw: -5 }, R: { x: -0.06, z: -0.06, yaw: -80 } }, reach: { L: { at: [0.06, 1.56, 0.26], pole: [0.8, -1, 0] }, R: { at: [-0.31, 1.00, -0.14], pole: [-1, 0, -0.3] } } },
      { t: 34, pose: { hips: [0, -40, 0], neck: [0, 18, 0], head: [-6, 20, 0], handL: [10, 0, 0] }, reach: { L: { at: [0.40, 1.00, 0.46], pole: [1, -0.4, 0] }, R: { at: [-0.31, 1.00, -0.14], pole: [-1, 0, -0.3] } }, ease: 'out' },
      { t: 60, pose: { hips: [0, -40, 0], neck: [0, 18, 0], head: [-6, 20, 0], handL: [10, 0, 0] } },
    ],
  },
  // ricardo: knuckle bump, then a loose shoulder shake
  gloves: {
    length: 100, settle: 86,
    keys: [
      { t: 0, pose: { spine: [6, 0, 0], head: [6, 0, 0] }, feet: FEET_HIP, reach: { L: { at: [0.18, 1.26, 0.34], pole: [1, -0.5, 0] }, R: { at: [-0.18, 1.26, 0.34], pole: [-1, -0.5, 0] } } },
      { t: 14, pose: { spine: [8, 0, 0], head: [8, 0, 0] }, reach: { L: { at: [0.03, 1.28, 0.36], pole: [1, -0.5, 0] }, R: { at: [-0.03, 1.28, 0.36], pole: [-1, -0.5, 0] } }, ease: 'snap' },
      { t: 30, pose: { spine: [6, 0, 0], head: [6, 0, 0] }, reach: { L: { at: [0.18, 1.26, 0.34], pole: [1, -0.5, 0] }, R: { at: [-0.18, 1.26, 0.34], pole: [-1, -0.5, 0] } } },
      { t: 42, pose: { spine: [8, 0, 0], head: [8, 0, 0] }, reach: { L: { at: [0.03, 1.28, 0.36], pole: [1, -0.5, 0] }, R: { at: [-0.03, 1.28, 0.36], pole: [-1, -0.5, 0] } }, ease: 'snap' },
      { t: 64, pose: { root: [0, -0.05, 0], chest: [0, 0, 6], neck: [0, 0, -10], head: [4, 0, -12] }, reach: ARMS_FREE },
    ],
  },
  // golem: dormant and slumped, then it wakes — head lifts, arms spread
  awaken: {
    length: 100, settle: 90,
    keys: [
      { t: 0, pose: { root: [0, -0.14, -0.04], spine: [30, 0, 0], chest: [18, 0, 0], neck: [20, 0, 0], head: [16, 0, 0], upperArmL: [-14, 0, 6], upperArmR: [-14, 0, -6], forearmL: [-6, 0, 0], forearmR: [-6, 0, 0] }, feet: FEET_WIDE },
      { t: 40, pose: { root: [0, -0.12, -0.04], spine: [26, 0, 0], chest: [14, 0, 0], neck: [0, 0, 0], head: [-6, 0, 0], upperArmL: [-14, 0, 6], upperArmR: [-14, 0, -6], forearmL: [-6, 0, 0], forearmR: [-6, 0, 0] } },
      { t: 68, pose: { root: [0, -0.06, 0], spine: [-4, 0, 0], chest: [-8, 0, 0], head: [-10, 0, 0] }, reach: { L: { at: [0.78, 1.16, 0.10], pole: [0.2, -1, -0.4] }, R: { at: [-0.78, 1.16, 0.10], pole: [-0.2, -1, -0.4] } }, ease: 'inOut' },
    ],
  },
};

export const WINS: Record<string, CeremonyDef> = {
  // kaede: kiai — a reverse punch from a horse stance, then yoi
  kiai: {
    length: 140,
    keys: [
      { t: 18, pose: { root: [0, -0.16, 0], hips: [0, 10, 0], chest: [0, 8, 0], head: [-4, -14, 0] }, feet: { L: { x: 0.30, z: 0.0, yaw: 10 }, R: { x: -0.30, z: 0.0, yaw: -10 }, knees: 0.6 }, reach: { L: { at: [0.28, 1.02, -0.06], pole: [0.6, 0, -1] }, R: { at: [-0.04, 1.34, 0.70], pole: [-0.6, -1, 0] } }, ease: 'snap' },
      { t: 64, pose: { root: [0, -0.17, 0], hips: [0, 10, 0], chest: [0, 8, 0], head: [-4, -14, 0] } },
      { t: 100, pose: { root: [0, -0.03, 0] }, feet: FEET_HIP, reach: BELT_FISTS, ease: 'inOut' },
    ],
  },
  // boris: roar with arms flung wide, then the double biceps
  roar: {
    length: 150,
    keys: [
      { t: 20, pose: { root: [0, -0.10, 0], spine: [-6, 0, 0], chest: [-12, 0, 0], neck: [-8, 0, 0], head: [-22, 0, 0] }, feet: FEET_WIDE, reach: { L: { at: [0.80, 1.00, 0.20], pole: [0.2, -1, -0.4] }, R: { at: [-0.80, 1.00, 0.20], pole: [-0.2, -1, -0.4] } }, ease: 'overshoot' },
      { t: 70, pose: { root: [0, -0.10, 0], spine: [-6, 0, 0], chest: [-12, 0, 0], neck: [-8, 0, 0], head: [-26, 0, 0] } },
      { t: 96, pose: { root: [0, -0.07, 0], spine: [-8, 0, 0], chest: [-10, 0, 0], head: [-6, 0, 0] }, reach: { L: { at: [0.46, 1.70, 0.06], pole: [1, -0.6, -0.2] }, R: { at: [-0.46, 1.70, 0.06], pole: [-1, -0.6, -0.2] } }, ease: 'overshoot' },
    ],
  },
  // luiz: clap overhead in time with the roda, arms thrown open
  roda: {
    length: 150,
    keys: [
      { t: 22, pose: { root: [0, -0.06, 0], spine: [-6, 0, 0], head: [-10, 0, 0] }, feet: { L: { x: 0.18, z: 0.12, yaw: 10 }, R: { x: -0.16, z: -0.14, yaw: -25 } }, reach: { L: { at: [0.05, 1.98, 0.14], pole: [1, 0, 0] }, R: { at: [-0.05, 1.98, 0.14], pole: [-1, 0, 0] } }, ease: 'out' },
      { t: 48, pose: { root: [0, -0.08, 0], spine: [-4, 0, 0], head: [-8, 0, 0] }, reach: { L: { at: [0.62, 1.82, 0.10], pole: [1, -0.4, 0] }, R: { at: [-0.62, 1.82, 0.10], pole: [-1, -0.4, 0] } } },
      { t: 74, pose: { root: [0, -0.06, 0], spine: [-6, 0, 0], head: [-10, 0, 0] }, reach: { L: { at: [0.05, 1.98, 0.14], pole: [1, 0, 0] }, R: { at: [-0.05, 1.98, 0.14], pole: [-1, 0, 0] } } },
      { t: 104, pose: { root: [0, -0.08, 0], spine: [-8, 0, 0], head: [-14, 0, 0] }, reach: { L: { at: [0.66, 1.80, 0.12], pole: [1, -0.4, 0] }, R: { at: [-0.66, 1.80, 0.12], pole: [-1, -0.4, 0] } } },
    ],
  },
  // meiling: crane on one leg, arms spread as wings
  crane: {
    length: 150,
    keys: [
      { t: 24, pose: { root: [0, -0.03, 0], hips: [0, -10, 0], spine: [2, 6, 0], head: [-4, 4, 0], upperLegL: [-96, 0, 6], lowerLegL: [104, 0, 0], footL: [40, 0, 0], handL: [40, 0, 0], handR: [40, 0, 0] }, feet: { R: { x: -0.06, z: 0.0, yaw: -10 }, knees: 0.1 }, reach: { L: { at: [0.70, 1.48, -0.04], pole: [0.2, -1, -0.3] }, R: { at: [-0.70, 1.48, -0.04], pole: [-0.2, -1, -0.3] } }, ease: 'out' },
      { t: 80, pose: { root: [0, -0.02, 0], hips: [0, -10, 0], spine: [0, 6, 0], head: [-6, 4, 0], upperLegL: [-100, 0, 6], lowerLegL: [108, 0, 0], footL: [40, 0, 0], handL: [50, 0, 0], handR: [50, 0, 0] }, reach: { L: { at: [0.66, 1.62, -0.06], pole: [0.2, -1, -0.3] }, R: { at: [-0.66, 1.62, -0.06], pole: [-0.2, -1, -0.3] } } },
    ],
  },
  // jaehyun: a vertical axe-kick chamber held high, then back to joonbi
  axe: {
    length: 140,
    keys: [
      { t: 20, pose: { root: [0, -0.02, -0.04], hips: [-10, -30, 0], spine: [-10, 10, 0], chest: [-4, 10, 0], neck: [0, 10, 0], upperLegL: [-150, 0, 4], lowerLegL: [8, 0, 0], footL: [30, 0, 0] }, feet: { R: { x: -0.08, z: -0.04, yaw: -40 }, knees: 0.1 }, reach: { L: { at: [0.26, 1.30, 0.30], pole: [1, -0.6, 0] }, R: { at: [-0.20, 1.28, 0.22], pole: [-1, -0.6, 0] } }, ease: 'snap' },
      { t: 54, pose: { root: [0, -0.02, -0.04], hips: [-10, -30, 0], spine: [-10, 10, 0], chest: [-4, 10, 0], neck: [0, 10, 0], upperLegL: [-154, 0, 4], lowerLegL: [6, 0, 0], footL: [30, 0, 0] } },
      { t: 90, pose: { root: [0, -0.03, 0] }, feet: FEET_HIP, reach: BELT_FISTS, ease: 'inOut' },
    ],
  },
  // seraphine: a deep reverence, then one arm raised in a slow flourish
  reverence: {
    length: 150,
    keys: [
      { t: 30, pose: { root: [0, -0.12, 0], hips: [8, -10, 0], spine: [16, 0, 0], chest: [8, 0, 0], neck: [8, 0, 0], handL: [20, 0, 0] }, feet: { L: { x: 0.06, z: 0.10, yaw: 0 }, R: { x: -0.02, z: -0.22, yaw: -40, pitch: 20 }, knees: 0.4 }, reach: { L: { at: [0.62, 0.94, 0.28], pole: [0.4, -1, -0.2] }, R: { at: [-0.04, 1.00, 0.36], pole: [-1, -0.4, -0.2] } }, ease: 'inOut' },
      { t: 70, pose: { root: [0, -0.13, 0], hips: [8, -10, 0], spine: [18, 0, 0], chest: [8, 0, 0], neck: [8, 0, 0], handL: [20, 0, 0] } },
      { t: 112, pose: { root: [0, -0.03, 0], hips: [0, -14, 0], spine: [-4, 4, 0], head: [-10, 8, 0], handL: [30, 0, 0] }, feet: { L: { x: 0.08, z: 0.10, yaw: 0 }, R: { x: -0.06, z: -0.14, yaw: -40 } }, reach: { L: { at: [0.28, 2.00, 0.18], pole: [1, 0, 0] }, R: { at: [-0.10, 1.04, 0.38], pole: [-1, -0.4, -0.2] } }, ease: 'inOut' },
    ],
  },
  // ricardo: both fists up, then points down at the fallen opponent
  victory: {
    length: 140,
    keys: [
      { t: 18, pose: { root: [0, -0.02, 0], spine: [-6, 0, 0], head: [-14, 0, 0] }, feet: FEET_HIP, reach: { L: { at: [0.36, 1.96, 0.06], pole: [1, 0, 0] }, R: { at: [-0.36, 1.96, 0.06], pole: [-1, 0, 0] } }, ease: 'overshoot' },
      { t: 70, pose: { root: [0, -0.02, 0], spine: [-6, 0, 0], head: [-16, 0, 0] } },
      { t: 100, pose: { root: [0, -0.04, 0], spine: [8, -10, 0], head: [12, -10, 0] }, feet: { L: { x: 0.14, z: 0.14, yaw: -10 }, R: { x: -0.14, z: -0.16, yaw: -30 } }, reach: { L: { at: [0.34, 1.96, 0.04], pole: [1, 0, 0] }, R: { at: [-0.22, 0.96, 0.58], pole: [-1, 0, 0] } }, ease: 'inOut' },
    ],
  },
  // golem: hammer both fists overhead, slam, rise with arms spread
  slam: {
    length: 150,
    keys: [
      { t: 30, pose: { root: [0, -0.04, -0.04], spine: [-10, 0, 0], chest: [-10, 0, 0], head: [-14, 0, 0] }, feet: FEET_WIDE, reach: { L: { at: [0.06, 2.04, 0.04], pole: [1, 0, 0] }, R: { at: [-0.06, 2.04, 0.04], pole: [-1, 0, 0] } }, ease: 'inOut' },
      { t: 52, pose: { root: [0, -0.30, 0.04], spine: [32, 0, 0], chest: [14, 0, 0], head: [-18, 0, 0] }, reach: { L: { at: [0.10, 0.60, 0.74], pole: [1, 0.4, 0] }, R: { at: [-0.10, 0.60, 0.74], pole: [-1, 0.4, 0] } }, ease: 'in' },
      { t: 76, pose: { root: [0, -0.30, 0.04], spine: [32, 0, 0], chest: [14, 0, 0], head: [-18, 0, 0] } },
      { t: 116, pose: { root: [0, -0.06, 0], spine: [-6, 0, 0], chest: [-8, 0, 0], head: [-10, 0, 0] }, reach: { L: { at: [0.80, 1.18, 0.12], pole: [0.2, -1, -0.4] }, R: { at: [-0.80, 1.18, 0.12], pole: [-0.2, -1, -0.4] } }, ease: 'inOut' },
    ],
  },
};

/** Clip-ready keys of a ceremony (`rest` = the character's stance rest pose). */
export interface CeremonyClip { length: number; keys: EulerKey[] }

/** Default greybox intro (unchanged from the original shared clip). */
function defaultIntro(): CeremonyClip {
  return { length: 100, keys: [{ t: 0, pose: INTRO }, { t: 50, pose: INTRO }, { t: 80, pose: { ...STANCE, root: [0, -0.1, 0] }, ease: 'inOut' }, { t: 100, pose: STANCE }] };
}
function defaultWin(): CeremonyClip {
  return { length: 150, keys: [{ t: 0, pose: STANCE }, { t: 25, pose: WIN, ease: 'overshoot' }, { t: 90, pose: { ...WIN, upperArmL: [-150, -10, 40] } }, { t: 150, pose: WIN }] };
}

/** Intro clip keys: authored keys, then settle into the stance and hold it. */
export function resolveIntro(id: string | undefined, rest: PoseEuler): CeremonyClip {
  const def = id ? INTROS[id] : undefined;
  if (!def) return defaultIntro();
  const keys = resolveKeys(UPRIGHT, def.keys);
  const settle = def.settle ?? def.length - 16;
  return { length: def.length, keys: [...keys, { t: settle, pose: rest, ease: 'inOut' }, { t: def.length, pose: rest }] };
}

/** Win clip keys: start from the stance, play the authored keys, hold the last. */
export function resolveWin(id: string | undefined, rest: PoseEuler): CeremonyClip {
  const def = id ? WINS[id] : undefined;
  if (!def) return defaultWin();
  const keys = resolveKeys(UPRIGHT, def.keys);
  const last = keys[keys.length - 1] as EulerKey;
  return { length: def.length, keys: [{ t: 0, pose: rest }, ...keys, { t: def.length, pose: last.pose }] };
}
