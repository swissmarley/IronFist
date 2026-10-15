import { makeClip, mirrorEuler, type Clip } from './pose';
import * as P from './poses';

/** Locomotion / reaction clips shared by all fighters (per-character overrides later). */
export interface ClipSet {
  idle: Clip; walkF: Clip; walkB: Clip; crouch: Clip; crouchIdle: Clip; guard: Clip; crouchGuard: Clip;
  dash: Clip; backdash: Clip; run: Clip; sidestepIn: Clip; sidestepOut: Clip; sidewalk: Clip; crouchDash: Clip;
  jump: Clip; landing: Clip;
  hitLight: Clip; hitMedium: Clip; hitHeavy: Clip; hitCrouch: Clip; stagger: Clip;
  launched: Clip; lyingUp: Clip; lyingDown: Clip; getup: Clip; kipup: Clip; rollBack: Clip; rollSide: Clip;
  wallSplat: Clip; ko: Clip; intro: Clip; win: Clip; throwing: Clip;
}

export function buildClipSet(): ClipSet {
  return {
    idle: makeClip('idle', 120, [{ t: 0, pose: P.STANCE }, { t: 60, pose: P.STANCE_BREATH }, { t: 120, pose: P.STANCE }], true),
    walkF: makeClip('walkF', 32, [{ t: 0, pose: P.WALK_A }, { t: 16, pose: P.WALK_B }, { t: 32, pose: P.WALK_A }], true),
    walkB: makeClip('walkB', 36, [{ t: 0, pose: P.WALK_B }, { t: 18, pose: P.WALK_A }, { t: 36, pose: P.WALK_B }], true),
    crouch: makeClip('crouch', 4, [{ t: 0, pose: P.STANCE }, { t: 4, pose: P.CROUCH, ease: 'out' }]),
    crouchIdle: makeClip('crouchIdle', 90, [{ t: 0, pose: P.CROUCH }, { t: 45, pose: { ...P.CROUCH, root: [0, -0.44, 0.02], spine: [20, 6, 0] } }, { t: 90, pose: P.CROUCH }], true),
    guard: makeClip('guard', 3, [{ t: 0, pose: P.GUARD }, { t: 3, pose: P.GUARD }]),
    crouchGuard: makeClip('crouchGuard', 3, [{ t: 0, pose: P.CROUCH_GUARD }, { t: 3, pose: P.CROUCH_GUARD }]),
    dash: makeClip('dash', 12, [{ t: 0, pose: P.STANCE }, { t: 3, pose: P.DASH, ease: 'out' }, { t: 9, pose: P.DASH }, { t: 12, pose: P.STANCE }]),
    backdash: makeClip('backdash', 15, [{ t: 0, pose: P.STANCE }, { t: 3, pose: P.BACKDASH, ease: 'out' }, { t: 8, pose: P.BACKDASH }, { t: 15, pose: P.STANCE }]),
    run: makeClip('run', 24, [{ t: 0, pose: { ...P.DASH, ...P.WALK_A, spine: [14, 6, 0] } }, { t: 12, pose: { ...P.DASH, ...P.WALK_B, spine: [14, 6, 0] } }, { t: 24, pose: { ...P.DASH, ...P.WALK_A, spine: [14, 6, 0] } }], true),
    sidestepIn: makeClip('sidestepIn', 14, [{ t: 0, pose: P.STANCE }, { t: 4, pose: P.SIDESTEP_IN, ease: 'out' }, { t: 10, pose: P.SIDESTEP_IN }, { t: 14, pose: P.STANCE }]),
    sidestepOut: makeClip('sidestepOut', 14, [{ t: 0, pose: P.STANCE }, { t: 4, pose: P.SIDESTEP_OUT, ease: 'out' }, { t: 10, pose: P.SIDESTEP_OUT }, { t: 14, pose: P.STANCE }]),
    sidewalk: makeClip('sidewalk', 30, [{ t: 0, pose: P.SIDESTEP_IN }, { t: 15, pose: P.SIDESTEP_OUT }, { t: 30, pose: P.SIDESTEP_IN }], true),
    crouchDash: makeClip('crouchDash', 10, [{ t: 0, pose: P.STANCE }, { t: 3, pose: { ...P.CROUCH, root: [0, -0.30, 0.1], spine: [26, 6, 0] }, ease: 'out' }, { t: 10, pose: P.CROUCH }]),
    jump: makeClip('jump', 40, [{ t: 0, pose: { ...P.STANCE, root: [0, -0.15, 0] } }, { t: 6, pose: P.JUMP, ease: 'out' }, { t: 30, pose: P.JUMP }, { t: 40, pose: { ...P.STANCE, root: [0, -0.12, 0] } }]),
    landing: makeClip('landing', 4, [{ t: 0, pose: { ...P.STANCE, root: [0, -0.16, 0], lowerLegL: [40, 0, 0], lowerLegR: [40, 0, 0] } }, { t: 4, pose: P.STANCE, ease: 'out' }]),
    hitLight: makeClip('hitLight', 14, [{ t: 0, pose: P.STANCE }, { t: 2, pose: P.HIT_LIGHT, ease: 'out' }, { t: 8, pose: P.HIT_LIGHT }, { t: 14, pose: P.STANCE }]),
    hitMedium: makeClip('hitMedium', 20, [{ t: 0, pose: P.STANCE }, { t: 3, pose: P.HIT_MEDIUM, ease: 'out' }, { t: 12, pose: P.HIT_MEDIUM }, { t: 20, pose: P.STANCE }]),
    hitHeavy: makeClip('hitHeavy', 28, [{ t: 0, pose: P.STANCE }, { t: 4, pose: P.HIT_HEAVY, ease: 'out' }, { t: 18, pose: P.HIT_HEAVY }, { t: 28, pose: P.STANCE }]),
    hitCrouch: makeClip('hitCrouch', 14, [{ t: 0, pose: P.CROUCH }, { t: 2, pose: P.HIT_CROUCH, ease: 'out' }, { t: 8, pose: P.HIT_CROUCH }, { t: 14, pose: P.CROUCH }]),
    stagger: makeClip('stagger', 34, [{ t: 0, pose: P.STANCE }, { t: 4, pose: { ...P.HIT_HEAVY, root: [0, -0.2, -0.2] }, ease: 'out' }, { t: 22, pose: { ...P.HIT_HEAVY, root: [0, -0.25, -0.25], hips: [-30, -10, 0] } }, { t: 34, pose: P.STANCE }]),
    launched: makeClip('launched', 60, [{ t: 0, pose: P.HIT_HEAVY }, { t: 6, pose: P.LAUNCHED, ease: 'out' }, { t: 40, pose: { ...P.LAUNCHED, hips: [-95, 0, 0] } }, { t: 60, pose: { ...P.LAUNCHED, hips: [-110, 0, 0], upperLegL: [-30, 10, 14], upperLegR: [-10, -10, -14] } }]),
    lyingUp: makeClip('lyingUp', 8, [{ t: 0, pose: { ...P.LYING_UP, root: [0, -0.7, -0.1] } }, { t: 8, pose: P.LYING_UP, ease: 'out' }]),
    lyingDown: makeClip('lyingDown', 8, [{ t: 0, pose: { ...P.LYING_DOWN, root: [0, -0.7, -0.1] } }, { t: 8, pose: P.LYING_DOWN, ease: 'out' }]),
    getup: makeClip('getup', 24, [{ t: 0, pose: P.LYING_UP }, { t: 12, pose: P.KNEEL, ease: 'inOut' }, { t: 24, pose: P.STANCE, ease: 'out' }]),
    kipup: makeClip('kipup', 20, [{ t: 0, pose: P.LYING_UP }, { t: 6, pose: { ...P.LYING_UP, root: [0, -0.6, -0.2], upperLegL: [-110, 0, 10], upperLegR: [-110, 0, -10] }, ease: 'out' }, { t: 14, pose: { ...P.STANCE, root: [0, 0.1, 0] }, ease: 'snap' }, { t: 20, pose: P.STANCE }]),
    rollBack: makeClip('rollBack', 26, [{ t: 0, pose: P.LYING_UP }, { t: 8, pose: { ...P.LYING_UP, hips: [-200, 0, 0], root: [0, -0.6, -0.1] } }, { t: 16, pose: { ...P.KNEEL, hips: [-300, -20, 0] } }, { t: 26, pose: P.STANCE, ease: 'out' }]),
    rollSide: makeClip('rollSide', 16, [{ t: 0, pose: P.LYING_UP }, { t: 8, pose: { ...P.LYING_UP, hips: [-88, 0, 180] } }, { t: 16, pose: P.STANCE, ease: 'out' }]),
    wallSplat: makeClip('wallSplat', 32, [{ t: 0, pose: { ...P.HIT_HEAVY, root: [0, -0.1, -0.1] } }, { t: 4, pose: { ...P.LAUNCHED, root: [0, 0, -0.25], hips: [-20, 0, 0], upperArmL: [-140, -20, 60], upperArmR: [-140, 20, -60] }, ease: 'out' }, { t: 32, pose: { ...P.LAUNCHED, root: [0, -0.2, -0.25], hips: [-10, 0, 0] } }]),
    ko: makeClip('ko', 50, [{ t: 0, pose: P.HIT_HEAVY }, { t: 20, pose: { ...P.KNEEL, hips: [20, -20, 0], head: [30, 0, 0] }, ease: 'inOut' }, { t: 50, pose: P.LYING_DOWN, ease: 'in' }]),
    intro: makeClip('intro', 100, [{ t: 0, pose: P.INTRO }, { t: 50, pose: P.INTRO }, { t: 80, pose: { ...P.STANCE, root: [0, -0.1, 0] }, ease: 'inOut' }, { t: 100, pose: P.STANCE }]),
    win: makeClip('win', 150, [{ t: 0, pose: P.STANCE }, { t: 25, pose: P.WIN, ease: 'overshoot' }, { t: 90, pose: { ...P.WIN, upperArmL: [-150, -10, 40] } }, { t: 150, pose: P.WIN }]),
    throwing: makeClip('throwing', 60, [{ t: 0, pose: P.THROW_GRAB }, { t: 18, pose: P.THROW_LIFT, ease: 'out' }, { t: 36, pose: P.THROW_SLAM, ease: 'in' }, { t: 60, pose: P.STANCE, ease: 'inOut' }]),
  };
}

export const MIRRORED_STANCE = mirrorEuler(P.STANCE);
