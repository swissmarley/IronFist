import { mirrorEuler, type PoseEuler } from './pose';
import { resolveKeys, type EulerKey, type FootPlant, type KeySpec, type Plant } from './plant';
import { STANCE, STANCE_BREATH } from './poses';

/**
 * Per-character idle stances (render only). A stance is a looping idle cycle
 * whose first key is the fighter's rest pose: attacks start from and return to
 * it, and intros settle into it. Legs are IK-planted so feet stay flat on the
 * floor; arms stay off the torso. Gameplay hurtboxes do not follow these poses
 * (see D-024): they are baked from the shared neutral STANCE / CROUCH.
 */
export interface StanceDef {
  /** Complete pose every key starts from. */
  base: PoseEuler;
  /** Foot plants for the first key (later keys inherit unless they override). */
  feet?: Plant;
  /** Loop length in frames. */
  length: number;
  /** Cycle keys; the loop closes back on the first key at `length`. */
  keys: KeySpec[];
}

const flipFoot = (f: FootPlant): FootPlant => ({ ...f, x: -f.x, yaw: -f.yaw });
const flipPlant = (p: Plant): Plant => ({ ...p, ...(p.R ? { L: flipFoot(p.R) } : {}), ...(p.L ? { R: flipFoot(p.L) } : {}) });

// --- kaede: shotokan-style kamae — narrow, tall, lead fist high and forward.
const KARATE_FEET: Plant = { L: { x: 0.06, z: 0.27, yaw: -20 }, R: { x: -0.05, z: -0.30, yaw: -45 }, knees: 0.2 };
const KARATE: StanceDef = {
  base: {
    ...STANCE, root: [0, -0.07, 0], hips: [0, -38, 0], spine: [2, 8, 0], chest: [0, 10, 0], neck: [0, 10, 0], head: [-2, 14, 0],
    handL: [-25, 0, 0], handR: [-25, 0, 0],
  },
  feet: KARATE_FEET, length: 110,
  keys: [
    { t: 0, pose: {}, reach: { L: { at: [0.10, 1.38, 0.50], pole: [0.7, -1, 0] }, R: { at: [-0.12, 1.30, 0.32], pole: [-0.8, -1, -0.2] } } },
    { t: 55, pose: { root: [0, -0.09, 0], spine: [4, 8, 0] }, reach: { L: { at: [0.10, 1.36, 0.49], pole: [0.7, -1, 0] }, R: { at: [-0.12, 1.28, 0.32], pole: [-0.8, -1, -0.2] } } },
  ],
};

// --- boris: freestyle-wrestling / sambo crouch — low, wide, square, hands open and reaching.
const GRAPPLER: StanceDef = {
  base: {
    ...STANCE, root: [0, -0.22, 0.02], hips: [0, -14, 0], spine: [20, 4, 0], chest: [12, 4, 0], neck: [-10, 2, 0], head: [-18, 4, 0],
    handL: [10, 0, 10], handR: [10, 0, -10],
  },
  feet: { L: { x: 0.30, z: 0.12, yaw: 5 }, R: { x: -0.30, z: -0.14, yaw: -30 }, knees: 0.7 },
  length: 140,
  keys: [
    { t: 0, pose: {}, reach: { L: { at: [0.36, 1.08, 0.48], pole: [1, -0.6, -0.2] }, R: { at: [-0.34, 1.04, 0.40], pole: [-1, -0.6, -0.2] } } },
    { t: 70, pose: { root: [0, -0.25, 0.02], spine: [23, 4, 0], chest: [14, 4, 0] }, reach: { L: { at: [0.33, 1.04, 0.50], pole: [1, -0.6, -0.2] }, R: { at: [-0.36, 1.02, 0.42], pole: [-1, -0.6, -0.2] } } },
  ],
};

// --- luiz: capoeira ginga — square and low, rocking a foot back each side, arm across the face.
const GINGA_BASE: PoseEuler = {
  ...STANCE, root: [0, -0.20, 0], hips: [0, -12, 0], spine: [16, 0, 0], chest: [8, 0, 0], neck: [-6, 0, 0], head: [-10, 6, 0],
  handL: [-10, 0, 0], handR: [-10, 0, 0],
};
const GINGA_A_FEET: Plant = { L: { x: 0.26, z: 0.14, yaw: 0 }, R: { x: -0.22, z: -0.36, yaw: -35, pitch: 18 }, knees: 0.4 };
const GINGA_MID_FEET: Plant = { L: { x: 0.27, z: 0.0, yaw: 5 }, R: { x: -0.27, z: 0.0, yaw: -5 }, knees: 0.4 };
const GINGA_A: KeySpec = {
  t: 0, pose: { root: [0.02, -0.22, 0], hips: [0, -22, 0], spine: [18, -4, 0] }, feet: GINGA_A_FEET,
  reach: { L: { at: [-0.02, 1.32, 0.40], pole: [1, -0.4, 0] }, R: { at: [-0.40, 0.92, -0.14], pole: [-0.4, 0, -1] } },
};
const GINGA_MID: KeySpec = {
  t: 30, pose: { root: [0, -0.18, 0], hips: [0, 0, 0], spine: [14, 0, 0] }, feet: GINGA_MID_FEET,
  reach: { L: { at: [0.30, 1.22, 0.30], pole: [1, -0.6, -0.2] }, R: { at: [-0.30, 1.22, 0.30], pole: [-1, -0.6, -0.2] } },
};
const mirrorKey = (k: KeySpec, t: number): KeySpec => ({
  t, pose: mirrorEuler(k.pose), ...(k.feet ? { feet: flipPlant(k.feet) } : {}),
  ...(k.reach ? { reach: {
    ...(k.reach.R ? { L: { at: [-k.reach.R.at[0], k.reach.R.at[1], k.reach.R.at[2]], pole: [-k.reach.R.pole[0], k.reach.R.pole[1], k.reach.R.pole[2]] } } : {}),
    ...(k.reach.L ? { R: { at: [-k.reach.L.at[0], k.reach.L.at[1], k.reach.L.at[2]], pole: [-k.reach.L.pole[0], k.reach.L.pole[1], k.reach.L.pole[2]] } } : {}),
  } } : {}),
});
const GINGA: StanceDef = {
  base: GINGA_BASE, length: 120,
  keys: [GINGA_A, GINGA_MID, mirrorKey(GINGA_A, 60), { ...GINGA_MID, t: 90 }],
};

// --- meiling: wushu cat stance — weight on the back leg, lead foot on its ball, open palm forward.
const WUSHU: StanceDef = {
  base: {
    ...STANCE, root: [0, -0.12, -0.02], hips: [0, -40, 0], spine: [0, 10, 0], chest: [2, 12, 0], neck: [0, 8, 0], head: [-2, 10, 0],
    handL: [-70, 0, 0], handR: [-60, 0, 0],
  },
  feet: { L: { x: 0.05, z: 0.24, yaw: -10, pitch: 28 }, R: { x: -0.08, z: -0.20, yaw: -55 }, knees: 0.3 },
  length: 150,
  keys: [
    { t: 0, pose: {}, reach: { L: { at: [0.04, 1.30, 0.58], pole: [0.6, -1, 0] }, R: { at: [-0.06, 1.18, 0.36], pole: [-1, -0.5, 0] } } },
    { t: 75, pose: { root: [0, -0.14, -0.03], spine: [2, 10, 0] }, reach: { L: { at: [0.06, 1.24, 0.56], pole: [0.6, -1, 0] }, R: { at: [-0.08, 1.24, 0.38], pole: [-1, -0.5, 0] } } },
  ],
};

// --- jaehyun: taekwondo — side-on, hands low, bouncing on the balls of the feet.
const TKD_FEET: Plant = { L: { x: 0.03, z: 0.30, yaw: -40 }, R: { x: -0.05, z: -0.26, yaw: -80 }, knees: 0.2 };
const TKD_UP: Plant = { L: { ...TKD_FEET.L as FootPlant, pitch: 14 }, R: { ...TKD_FEET.R as FootPlant, pitch: 14 }, knees: 0.2 };
const TAEKWONDO: StanceDef = {
  base: {
    ...STANCE, root: [0, -0.10, 0], hips: [0, -60, 0], spine: [4, 6, 0], chest: [2, 6, 0], neck: [0, 22, 0], head: [-4, 24, 0],
    handL: [-15, 0, 0], handR: [-15, 0, 0],
  },
  feet: TKD_FEET, length: 36,
  keys: [
    { t: 0, pose: {}, reach: { L: { at: [0.12, 1.16, 0.36], pole: [1, -0.6, -0.2] }, R: { at: [-0.12, 1.22, 0.36], pole: [-0.8, -1, -0.2] } } },
    { t: 18, pose: { root: [0, -0.05, 0] }, feet: TKD_UP, ease: 'out' },
    { t: 30, pose: { root: [0, -0.09, 0] }, feet: TKD_FEET, ease: 'in' },
  ],
};

// --- seraphine: fencer's en garde — side-on, lead arm extended like a blade, rear arm curved overhead.
const FENCER: StanceDef = {
  base: {
    ...STANCE, root: [0, -0.13, 0], hips: [0, -70, 0], spine: [-2, 6, 0], chest: [-2, 6, 0], neck: [0, 26, 0], head: [-6, 30, 0],
    handL: [-8, 0, 0], handR: [-50, 0, 20],
  },
  feet: { L: { x: 0.0, z: 0.34, yaw: -5 }, R: { x: -0.03, z: -0.24, yaw: -90 }, knees: 0.35 },
  length: 130,
  keys: [
    { t: 0, pose: {}, reach: { L: { at: [0.02, 1.26, 0.70], pole: [0.6, -1, 0] }, R: { at: [-0.16, 1.64, -0.16], pole: [-1, -0.2, -0.8] } } },
    { t: 65, pose: { root: [0, -0.15, -0.01] }, reach: { L: { at: [0.03, 1.22, 0.68], pole: [0.6, -1, 0] }, R: { at: [-0.18, 1.61, -0.17], pole: [-1, -0.2, -0.8] } } },
  ],
};

// --- ricardo: vale tudo / MMA — crouched orthodox, fists at the temples, chin tucked, shoulders rolling.
const MMA_FEET: Plant = { L: { x: 0.15, z: 0.24, yaw: -25 }, R: { x: -0.16, z: -0.28, yaw: -50, pitch: 10 }, knees: 0.3 };
const MMA: StanceDef = {
  base: {
    ...STANCE, root: [0, -0.15, 0], hips: [0, -26, 0], spine: [12, 6, 0], chest: [8, 8, 0], neck: [6, 6, 0], head: [8, 8, 0],
    handL: [-30, 0, 0], handR: [-30, 0, 0],
  },
  feet: MMA_FEET, length: 80,
  keys: [
    { t: 0, pose: {}, reach: { L: { at: [0.14, 1.36, 0.32], pole: [0.5, -1, 0] }, R: { at: [-0.15, 1.34, 0.30], pole: [-0.5, -1, 0] } } },
    { t: 40, pose: { root: [0.03, -0.16, 0.01], hips: [0, -32, 0], chest: [8, 12, 0] }, reach: { L: { at: [0.16, 1.34, 0.30], pole: [0.5, -1, 0] }, R: { at: [-0.13, 1.36, 0.32], pole: [-0.5, -1, 0] } } },
  ],
};

// --- golem: dead-weight stone — hunched, wide, arms hanging heavy in front, slow chest heave.
const GOLEM: StanceDef = {
  base: {
    ...STANCE, root: [0, -0.12, 0], hips: [0, -16, 0], spine: [14, 4, 0], chest: [14, 4, 0], neck: [-12, 2, 0], head: [-6, 6, 0],
    handL: [-20, 0, 0], handR: [-20, 0, 0],
  },
  feet: { L: { x: 0.26, z: 0.14, yaw: -5 }, R: { x: -0.26, z: -0.16, yaw: -25 }, knees: 0.5 },
  length: 180,
  keys: [
    { t: 0, pose: {}, reach: { L: { at: [0.40, 0.86, 0.36], pole: [1, 0, -0.4] }, R: { at: [-0.38, 0.84, 0.30], pole: [-1, 0, -0.4] } } },
    { t: 90, pose: { root: [0, -0.15, 0], spine: [17, 4, 0], chest: [10, 4, 0], head: [-2, 6, 0] }, reach: { L: { at: [0.41, 0.82, 0.37], pole: [1, 0, -0.4] }, R: { at: [-0.39, 0.80, 0.31], pole: [-1, 0, -0.4] } } },
  ],
};

export const STANCES: Record<string, StanceDef> = {
  karate: KARATE, grappler: GRAPPLER, ginga: GINGA, wushu: WUSHU, taekwondo: TAEKWONDO, fencer: FENCER, mma: MMA, golem: GOLEM,
};

/** Resolved idle cycle of a stance. */
export interface StanceClipKeys { length: number; keys: EulerKey[]; rest: PoseEuler }

/** The greybox default: the hand-authored STANCE / STANCE_BREATH loop, unchanged. */
const DEFAULT_STANCE: StanceClipKeys = {
  length: 120, rest: STANCE,
  keys: [{ t: 0, pose: STANCE }, { t: 60, pose: STANCE_BREATH }],
};

const cache = new Map<string, StanceClipKeys>();

/** Resolve a stance id (unknown / missing ids fall back to the greybox default). */
export function resolveStance(id?: string): StanceClipKeys {
  const def = id ? STANCES[id] : undefined;
  if (!id || !def) return DEFAULT_STANCE;
  let r = cache.get(id);
  if (!r) {
    const keys = resolveKeys(def.base, def.keys, def.feet);
    r = { length: def.length, keys, rest: (keys[0] as EulerKey).pose };
    cache.set(id, r);
  }
  return r;
}
