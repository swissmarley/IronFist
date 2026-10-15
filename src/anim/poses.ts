import type { PoseEuler } from './pose';

/**
 * Hand-authored key poses (Euler degrees, XYZ). Conventions (fighter faces +Z,
 * its right side is -X): negative X on an arm/leg swings it forward; positive
 * Z abducts the left limb outward (negative for the right); hips Y < 0 turns
 * the left side forward (orthodox stance).
 */
export const STANCE: PoseEuler = {
  root: [0, -0.05, 0],
  hips: [0, -32, 0],
  spine: [4, 6, 0],
  chest: [2, 8, 0],
  neck: [0, 10, 0],
  head: [-4, 12, 0],
  shoulderL: [0, 0, -4],
  upperArmL: [-55, -10, 12],
  forearmL: [-105, 0, 10],
  handL: [-20, 0, 0],
  shoulderR: [0, 0, 4],
  upperArmR: [-40, 15, -18],
  forearmR: [-120, 0, -8],
  handR: [-20, 0, 0],
  upperLegL: [-22, 8, 6],
  lowerLegL: [24, 0, 0],
  footL: [0, 30, 0],
  upperLegR: [14, -6, -8],
  lowerLegR: [22, 0, 0],
  footR: [0, 36, 0],
};

export const STANCE_BREATH: PoseEuler = {
  root: [0, -0.07, 0],
  spine: [6, 6, 0],
  chest: [4, 8, 0],
  upperArmL: [-58, -10, 12],
  upperArmR: [-44, 15, -18],
  lowerLegL: [28, 0, 0],
  lowerLegR: [26, 0, 0],
};

export const CROUCH: PoseEuler = {
  root: [0, -0.42, 0.02],
  hips: [0, -30, 0],
  spine: [18, 6, 0],
  chest: [10, 8, 0],
  neck: [-6, 10, 0],
  head: [-14, 12, 0],
  upperArmL: [-50, -10, 14],
  forearmL: [-110, 0, 10],
  upperArmR: [-35, 15, -18],
  forearmR: [-125, 0, -8],
  upperLegL: [-95, 10, 10],
  lowerLegL: [122, 0, 0],
  footL: [-18, 30, 0],
  upperLegR: [-80, -12, -14],
  lowerLegR: [120, 0, 0],
  footR: [-18, 36, 0],
};

export const GUARD: PoseEuler = {
  ...STANCE,
  root: [0, -0.07, 0],
  spine: [8, 4, 0],
  chest: [6, 6, 0],
  head: [-2, 10, 0],
  upperArmL: [-70, -20, 16],
  forearmL: [-120, 0, 14],
  upperArmR: [-62, 18, -24],
  forearmR: [-128, 0, -12],
};

export const CROUCH_GUARD: PoseEuler = {
  ...CROUCH,
  upperArmL: [-60, -20, 16],
  forearmL: [-115, 0, 14],
  upperArmR: [-50, 18, -24],
  forearmR: [-125, 0, -12],
};

export const WALK_A: PoseEuler = {
  ...STANCE,
  root: [0, -0.04, 0],
  upperLegL: [-34, 8, 6], lowerLegL: [20, 0, 0], footL: [-6, 30, 0],
  upperLegR: [22, -6, -8], lowerLegR: [30, 0, 0], footR: [10, 36, 0],
  spine: [4, 10, 0],
};
export const WALK_B: PoseEuler = {
  ...STANCE,
  root: [0, -0.06, 0],
  upperLegL: [10, 8, 6], lowerLegL: [40, 0, 0], footL: [10, 30, 0],
  upperLegR: [-24, -6, -8], lowerLegR: [18, 0, 0], footR: [-6, 36, 0],
  spine: [4, 2, 0],
};

export const DASH: PoseEuler = {
  ...STANCE,
  root: [0, -0.10, 0],
  spine: [14, 6, 0], chest: [8, 8, 0],
  upperLegL: [-50, 8, 6], lowerLegL: [30, 0, 0],
  upperLegR: [30, -6, -8], lowerLegR: [40, 0, 0],
  upperArmL: [-40, -10, 12], upperArmR: [-70, 15, -18],
};

export const BACKDASH: PoseEuler = {
  ...STANCE,
  root: [0, -0.08, 0],
  spine: [-8, 6, 0], chest: [-6, 8, 0],
  upperLegL: [8, 8, 6], lowerLegL: [36, 0, 0],
  upperLegR: [38, -6, -8], lowerLegR: [48, 0, 0],
};

export const SIDESTEP_IN: PoseEuler = {
  ...STANCE,
  root: [0, -0.08, 0],
  hips: [0, -32, 10], spine: [4, 6, -8], chest: [2, 8, -6],
  upperLegL: [-22, 8, 26], lowerLegL: [30, 0, 0],
  upperLegR: [14, -6, 12], lowerLegR: [34, 0, 0],
};
export const SIDESTEP_OUT: PoseEuler = {
  ...STANCE,
  root: [0, -0.08, 0],
  hips: [0, -32, -10], spine: [4, 6, 8], chest: [2, 8, 6],
  upperLegL: [-22, 8, -12], lowerLegL: [30, 0, 0],
  upperLegR: [14, -6, -28], lowerLegR: [34, 0, 0],
};

export const JUMP: PoseEuler = {
  ...STANCE,
  root: [0, 0, 0],
  spine: [-6, 6, 0],
  upperArmL: [-30, -10, 30], upperArmR: [-20, 15, -34],
  forearmL: [-60, 0, 10], forearmR: [-70, 0, -8],
  upperLegL: [-60, 8, 6], lowerLegL: [90, 0, 0],
  upperLegR: [-40, -6, -8], lowerLegR: [80, 0, 0],
};

export const HIT_LIGHT: PoseEuler = {
  ...STANCE,
  spine: [-10, 10, 0], chest: [-14, 12, 0], neck: [-10, 8, 0], head: [-22, 14, 0],
  upperArmL: [-40, -10, 18], upperArmR: [-30, 15, -22],
};
export const HIT_MEDIUM: PoseEuler = {
  ...STANCE,
  root: [0, -0.08, -0.05],
  hips: [-8, -20, 0], spine: [-18, 10, 0], chest: [-20, 12, 0], neck: [-12, 8, 0], head: [-28, 14, 0],
  upperArmL: [-20, -10, 40], forearmL: [-60, 0, 10],
  upperArmR: [-10, 15, -46], forearmR: [-70, 0, -8],
  upperLegL: [-30, 8, 6], lowerLegL: [34, 0, 0],
  upperLegR: [20, -6, -8], lowerLegR: [40, 0, 0],
};
export const HIT_HEAVY: PoseEuler = {
  ...STANCE,
  root: [0, -0.12, -0.12],
  hips: [-20, -10, 0], spine: [-24, 8, 0], chest: [-26, 10, 0], neck: [-14, 6, 0], head: [-32, 10, 0],
  upperArmL: [10, -10, 60], forearmL: [-40, 0, 10],
  upperArmR: [20, 15, -64], forearmR: [-50, 0, -8],
  upperLegL: [-40, 8, 6], lowerLegL: [50, 0, 0],
  upperLegR: [30, -6, -8], lowerLegR: [60, 0, 0],
};
export const HIT_CROUCH: PoseEuler = {
  ...CROUCH,
  spine: [6, 6, 0], chest: [-4, 8, 0], head: [-24, 12, 0],
};

export const LAUNCHED: PoseEuler = {
  root: [0, 0.1, 0],
  hips: [-70, 0, 0], spine: [-20, 0, 0], chest: [-16, 0, 0], neck: [-10, 0, 0], head: [-20, 0, 0],
  upperArmL: [-110, -20, 50], forearmL: [-40, 0, 20],
  upperArmR: [-100, 20, -60], forearmR: [-50, 0, -20],
  upperLegL: [-60, 10, 14], lowerLegL: [70, 0, 0],
  upperLegR: [-30, -10, -14], lowerLegR: [50, 0, 0],
};
export const LYING_UP: PoseEuler = {
  root: [0, -0.80, -0.2],
  hips: [-88, 0, 0], spine: [-6, 0, 0], chest: [-4, 0, 0], neck: [0, 0, 0], head: [-8, 0, 0],
  upperArmL: [-20, 0, 40], forearmL: [-20, 0, 0],
  upperArmR: [-20, 0, -40], forearmR: [-20, 0, 0],
  upperLegL: [-10, 0, 10], lowerLegL: [12, 0, 0], footL: [-30, 0, 0],
  upperLegR: [-6, 0, -10], lowerLegR: [10, 0, 0], footR: [-30, 0, 0],
};
export const LYING_DOWN: PoseEuler = {
  root: [0, -0.80, -0.2],
  hips: [88, 0, 0], spine: [4, 0, 0], chest: [4, 0, 0], neck: [0, 0, 0], head: [20, 0, 0],
  upperArmL: [-60, 0, 30], forearmL: [-80, 0, 0],
  upperArmR: [-60, 0, -30], forearmR: [-80, 0, 0],
  upperLegL: [8, 0, 10], lowerLegL: [10, 0, 0], footL: [30, 0, 0],
  upperLegR: [4, 0, -10], lowerLegR: [8, 0, 0], footR: [30, 0, 0],
};
export const KNEEL: PoseEuler = {
  root: [0, -0.5, 0],
  hips: [0, -20, 0], spine: [20, 4, 0], chest: [10, 4, 0], head: [-10, 8, 0],
  upperArmL: [-60, 0, 20], forearmL: [-60, 0, 0], upperArmR: [-30, 0, -20], forearmR: [-80, 0, 0],
  upperLegL: [-100, 6, 8], lowerLegL: [110, 0, 0], footL: [-20, 20, 0],
  upperLegR: [10, -6, -8], lowerLegR: [120, 0, 0], footR: [60, 30, 0],
};
export const THROW_GRAB: PoseEuler = {
  ...STANCE,
  root: [0, -0.08, 0.05],
  hips: [0, -10, 0], spine: [12, 0, 0], chest: [8, 0, 0],
  upperArmL: [-95, -10, -10], forearmL: [-40, 0, 20], upperArmR: [-95, 10, 10], forearmR: [-40, 0, -20],
};
export const THROW_LIFT: PoseEuler = {
  ...STANCE,
  root: [0, -0.02, 0],
  hips: [0, 20, 0], spine: [-14, 20, 0], chest: [-10, 20, 0],
  upperArmL: [-150, -10, -10], forearmL: [-30, 0, 20], upperArmR: [-150, 10, 10], forearmR: [-30, 0, -20],
};
export const THROW_SLAM: PoseEuler = {
  ...STANCE,
  root: [0, -0.3, 0.1],
  hips: [10, -30, 0], spine: [30, -10, 0], chest: [20, -10, 0],
  upperArmL: [-50, -10, 20], forearmL: [-10, 0, 20], upperArmR: [-50, 10, -20], forearmR: [-10, 0, -20],
  upperLegL: [-70, 8, 6], lowerLegL: [80, 0, 0], upperLegR: [-50, -6, -8], lowerLegR: [70, 0, 0],
};
export const WIN: PoseEuler = {
  root: [0, 0, 0],
  hips: [0, 0, 0], spine: [-6, 0, 0], chest: [-6, 0, 0], head: [-10, 0, 0],
  upperArmL: [-160, -10, 30], forearmL: [-40, 0, 10], upperArmR: [-20, 10, -20], forearmR: [-60, 0, -10],
  upperLegL: [-4, 0, 8], upperLegR: [-4, 0, -8], lowerLegL: [6, 0, 0], lowerLegR: [6, 0, 0],
};
export const INTRO: PoseEuler = {
  root: [0, -0.02, 0],
  hips: [0, -10, 0], spine: [10, 4, 0], chest: [6, 4, 0], head: [-12, 6, 0],
  upperArmL: [-70, 0, 10], forearmL: [-90, 0, 30], upperArmR: [-70, 0, -10], forearmR: [-90, 0, -30],
  upperLegL: [-6, 4, 8], upperLegR: [-6, -4, -8], lowerLegL: [10, 0, 0], lowerLegR: [10, 0, 0],
};
