import type { AnimSpec, CapsuleDef, CharacterDef, FollowupDef, HitDef, HitLevel, MoveDef, ThrowDef } from '@/sim/types';
import { STANDARD_HURTBOXES, kickBox, punchBox } from './greybox';

/*
 * Jae-Hyun Park: taekwondo. Kick-only strings that flow into the right-foot-forward
 * (`rff`) and left-foot-forward (`lff`) flamingo stances, axe kicks and spinning kicks.
 */

const PUNCHES = new Set<AnimSpec['type']>(['jab', 'straight', 'hook', 'uppercut', 'elbow', 'backfist', 'hammer', 'palm', 'doublePunch', 'powerCrush']);
type HitArgs = Pick<HitDef, 'frames' | 'level' | 'damage' | 'onBlock' | 'onHit' | 'reaction'> & Partial<HitDef>;
const PY = { high: 1350, mid: 1100, low: 500 } as const;
const KY = { high: 1380, mid: 1000, low: 350 } as const;

/** Authored fallback capsule for a hit (the baker replaces it with pose-derived capsules). */
function box(a: AnimSpec, level: HitLevel): CapsuleDef {
  const side = (a.limb ?? 'R') === 'L' ? 110 : -110;
  const h = a.height ?? (level === 'high' ? 'high' : level === 'low' ? 'low' : 'mid');
  return PUNCHES.has(a.type) ? punchBox(side, PY[h], 1050) : kickBox(side, KY[h], 1450);
}
/** Strike move: hits default their capsules from the anim spec. */
function S(id: string, name: string, input: string, anim: AnimSpec, total: number, hits: HitArgs | HitArgs[], m: Partial<MoveDef> = {}): MoveDef {
  const list = Array.isArray(hits) ? hits : [hits];
  return { id, name, input, anim, total, ...m, hits: list.map((h) => ({ pushback: 120, pushbackBlock: 160, capsules: [box(anim, h.level)], ...h })) };
}
const F = (moveId: string, cancelFrame: number, windowEnd: number): FollowupDef => ({ moveId, cancelFrame, windowEnd });
const CR = (end: number): NonNullable<MoveDef['pose']> => [{ frames: [0, end], pose: 'crouch' }];
const LAUNCH = (frames: [number, number], damage: number, onBlock: number, launchVy = 110, launchVz = 5): HitArgs =>
  ({ frames, level: 'mid', damage, onBlock, onHit: 0, reaction: 'launch', launchVy, launchVz });
function T(id: string, name: string, input: string, t: Pick<ThrowDef, 'breakButton' | 'damage' | 'result'> & Partial<ThrowDef>, m: Partial<MoveDef> = {}): MoveDef {
  return { id, name, input, total: 40, anim: { type: 'throw' }, hits: [], ...m, throw: { breakWindow: 12, duration: 60, grabFrame: 12, range: 1050, endOffset: 1300, ...t } };
}

const RFF_TREE = ['rff3', 'rff4', 'rff_d4', 'rff_f4', 'rff_34', 'rff_1'];
const LFF_TREE = ['lff3', 'lff4', 'lff_d3', 'lff_f3', 'lff_34', 'lff_2'];
const tree = (ids: string[], cancelFrame: number, windowEnd: number): FollowupDef[] => ids.map((id) => F(id, cancelFrame, windowEnd));

/** Standing root moves. */
const ROOT: MoveDef[] = [
  S('jab', 'Snap Jab', '1', { type: 'jab', limb: 'L' }, 20, { frames: [10, 11], level: 'high', damage: 7, onBlock: 1, onHit: 8, reaction: 'light' },
    { followups: [F('jab_2', 12, 18)] }),
  S('straight', 'Lead Cross', '2', { type: 'straight', limb: 'R' }, 23, { frames: [11, 12], level: 'high', damage: 10, onBlock: -1, onHit: 6, reaction: 'light' },
    { followups: [F('straight_3', 13, 20)] }),
  S('k3', 'Lead Snap Kick', '3', { type: 'front', limb: 'L', height: 'high' }, 28, { frames: [12, 14], level: 'high', damage: 12, onBlock: -3, onHit: 6, reaction: 'light' },
    { followups: [F('k3_3', 15, 24)] }),
  S('k4', 'Rear Whip Kick', '4', { type: 'round', limb: 'R' }, 30, { frames: [12, 14], level: 'high', damage: 16, onBlock: -8, onHit: 4, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5, pushback: 220 },
    { followups: [F('k4_4', 15, 26), F('k4_3', 15, 26)] }),
  S('f1', 'Ridge Hand', 'f+1', { type: 'backfist', limb: 'L' }, 28, { frames: [13, 14], level: 'high', damage: 12, onBlock: -4, onHit: 5, reaction: 'medium' }),
  S('f3', 'Flamingo Rise', 'f+3', { type: 'front', limb: 'L' }, 30, { frames: [15, 17], level: 'mid', damage: 15, onBlock: -8, onHit: 2, reaction: 'medium', pushback: 240 },
    { endStance: 'rff', followups: tree(RFF_TREE, 18, 30) }),
  S('f4', 'Rear Axe Stamp', 'f+4', { type: 'axe', limb: 'R' }, 36, { frames: [16, 18], level: 'mid', damage: 20, onBlock: -10, onHit: 3, reaction: 'heavy', chReaction: 'bound', pushback: 200 },
    { properties: ['hitsGrounded'] }),
  S('df1', 'Mid Jab', 'd/f+1', { type: 'jab', limb: 'L' }, 26, { frames: [13, 14], level: 'mid', damage: 10, onBlock: -2, onHit: 7, reaction: 'light' }),
  S('df2', 'Palm Thrust', 'd/f+2', { type: 'palm', limb: 'R' }, 27, { frames: [13, 14], level: 'mid', damage: 11, onBlock: -3, onHit: 6, reaction: 'light' }),
  S('df3', 'Spear Thrust', 'd/f+3', { type: 'side', limb: 'L' }, 30, { frames: [14, 16], level: 'mid', damage: 14, onBlock: -7, onHit: 4, reaction: 'medium', pushback: 260, pushbackBlock: 300 }),
  S('df4', 'Rising Crescent', 'd/f+4', { type: 'rising', limb: 'R' }, 36, LAUNCH([15, 16], 15, -13, 110, 5),
    { motion: [{ frames: [1, 14], forward: 24 }], properties: ['launcher'] }),
  S('d2', 'Dropping Hammer', 'd+2', { type: 'hammer', limb: 'R' }, 34, { frames: [15, 16], level: 'mid', damage: 14, onBlock: -6, onHit: 3, reaction: 'bound' },
    { pose: CR(33), properties: ['bound'] }),
  S('d3', 'Low Snap', 'd+3', { type: 'low', limb: 'L' }, 29, { frames: [13, 15], level: 'low', damage: 9, onBlock: -12, onHit: 2, reaction: 'crouchLight' }, { pose: CR(28) }),
  S('d4', 'Shin Cutter', 'd+4', { type: 'low', limb: 'R' }, 28, { frames: [12, 14], level: 'low', damage: 10, onBlock: -13, onHit: 1, reaction: 'crouchLight' }, { pose: CR(27) }),
  S('db3', 'Reaping Sweep', 'd/b+3', { type: 'sweep', limb: 'L' }, 46, { frames: [16, 18], level: 'low', damage: 18, onBlock: -26, onHit: 0, reaction: 'trip', pushback: 200 }, { pose: CR(41) }),
  S('db4', 'Heel Trip', 'd/b+4', { type: 'low', limb: 'R' }, 42, { frames: [18, 20], level: 'low', damage: 16, onBlock: -18, onHit: 3, reaction: 'crouchMedium', chReaction: 'trip' }, { pose: CR(40) }),
  S('b3', 'Spinning Heel', 'b+3', { type: 'spinBack', limb: 'L' }, 40, { frames: [20, 22], level: 'high', damage: 22, onBlock: -4, onHit: 14, reaction: 'heavy', chReaction: 'knockdown', pushback: 420, pushbackBlock: 420 },
    { properties: ['homing'] }),
  S('b4', 'Backfoot Hook', 'b+4', { type: 'round', limb: 'R' }, 34, { frames: [16, 18], level: 'high', damage: 17, onBlock: -8, onHit: 4, reaction: 'medium', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5 },
    { endStance: 'lff', followups: tree(LFF_TREE, 19, 34) }),
  S('ff3', 'Charging Spear', 'f,f+3', { type: 'side', limb: 'L' }, 38, { frames: [16, 18], level: 'mid', damage: 24, onBlock: -8, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 400, pushbackBlock: 350 },
    { motion: [{ frames: [1, 12], forward: 30 }], properties: ['wallSplat'] }),
  S('ff4', 'Flying Twist', 'f,f+4', { type: 'hop', limb: 'R' }, 44, { frames: [18, 20], level: 'mid', damage: 22, onBlock: -12, onHit: 5, reaction: 'screw', pushback: 300 },
    { motion: [{ frames: [1, 14], forward: 20 }], crush: [{ level: 'low', frames: [4, 22] }], properties: ['screw', 'jumpAttack', 'lowCrush'] }),
  S('uf3', 'Tornado Heel', 'u/f+3', { type: 'spinBack', limb: 'L' }, 42, { frames: [19, 21], level: 'high', damage: 24, onBlock: -10, onHit: 8, reaction: 'heavy', chReaction: 'spinLaunch', launchVy: 100, launchVz: 5, pushback: 360 },
    { crush: [{ level: 'low', frames: [1, 20] }], properties: ['lowCrush', 'tracksLeft'] }),
  S('uf4', 'Hop Crescent', 'u/f+4', { type: 'hop', limb: 'R' }, 42, LAUNCH([15, 17], 20, -13, 120, 5),
    { motion: [{ frames: [1, 18], forward: 12 }], crush: [{ level: 'low', frames: [1, 24] }], properties: ['launcher', 'jumpAttack', 'lowCrush'] }),
  S('ub3', 'Backflip Kick', 'u/b+3', { type: 'hop', limb: 'L' }, 44, { frames: [14, 16], level: 'mid', damage: 18, onBlock: -12, onHit: 0, reaction: 'launchHigh', launchVy: 118, launchVz: 4 },
    { motion: [{ frames: [1, 10], forward: -18 }], crush: [{ level: 'low', frames: [1, 22] }], properties: ['launcher', 'lowCrush', 'jumpAttack'] }),
  S('ub4', 'Fading Crescent', 'u/b+4', { type: 'round', limb: 'R' }, 38, { frames: [16, 18], level: 'high', damage: 18, onBlock: -9, onHit: 5, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 },
    { motion: [{ frames: [1, 10], forward: -20 }], crush: [{ level: 'low', frames: [1, 20] }], properties: ['lowCrush'] }),
  S('qcf3', 'Storm Crescent', 'qcf+3', { type: 'round', limb: 'L' }, 40, { frames: [16, 18], level: 'mid', damage: 20, onBlock: -13, onHit: 0, reaction: 'spinLaunch', launchVy: 112, launchVz: 6 },
    { motion: [{ frames: [1, 14], forward: 26 }], properties: ['launcher'] }),
  S('f12', 'Twin Palms', 'f+1+2', { type: 'doublePunch' }, 34, { frames: [15, 16], level: 'mid', damage: 20, onBlock: -8, onHit: 6, reaction: 'heavy', chReaction: 'stagger', pushback: 300, pushbackBlock: 300 }),
  S('b34', 'Iron Shin Guard', 'b+3+4', { type: 'front', limb: 'R' }, 44, { frames: [20, 21], level: 'mid', damage: 24, onBlock: -14, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 380, pushbackBlock: 400 },
    { armour: [6, 19], properties: ['powerCrush'] }),
  S('k34', 'Flamingo Switch', '3+4', { type: 'hop', limb: 'R' }, 36, { frames: [14, 16], level: 'mid', damage: 14, onBlock: -9, onHit: 2, reaction: 'medium' },
    { endStance: 'rff', followups: tree(RFF_TREE, 17, 36) }),
  S('uf34', 'Thunder Stamp', 'u/f+3+4', { type: 'axe', limb: 'R' }, 44, { frames: [18, 20], level: 'mid', damage: 22, onBlock: -12, onHit: 3, reaction: 'heavy', chReaction: 'bound', pushback: 220 },
    { crush: [{ level: 'low', frames: [3, 18] }], properties: ['hitsGrounded', 'lowCrush'] }),
  S('df34', 'Shin Splitter', 'd/f+3+4', { type: 'low', limb: 'R' }, 40, { frames: [16, 18], level: 'low', damage: 16, onBlock: -16, onHit: 1, reaction: 'crouchMedium', chReaction: 'trip' }, { pose: CR(38) }),
  T('throw13', 'Hip Wheel', '1+3', { breakButton: 1, damage: 35, result: 'knockdown', breakWindow: 14, endOffset: 1400 }),
  T('throw24', 'Neck Hook Toss', '2+4', { breakButton: 2, damage: 35, result: 'faceDown', breakWindow: 14, duration: 56 }),
  T('throw12', 'Spine Lever', 'd/f+1+2', { breakButton: 12, damage: 40, result: 'knockdown', duration: 70, endOffset: 900, grabsCrouching: true }, { total: 42 }),
  T('throwff24', 'Running Clinch Drop', 'f,f+2+4', { breakButton: 2, damage: 38, result: 'knockdown', duration: 64, grabFrame: 14, range: 1100, endOffset: 1600 },
    { total: 46, motion: [{ frames: [1, 13], forward: 60 }] }),
  T('throwuf12', 'Scissor Takedown', 'u/f+1+2', { breakButton: 12, damage: 42, result: 'faceDown', duration: 72, grabFrame: 14, endOffset: 1100 }, { total: 44 }),
];

/** String follow-ups, conditional moves and flamingo stance trees. */
const EXTRA: MoveDef[] = [
  S('jab_2', 'Snap Jab, Cross', '1,2', { type: 'straight', limb: 'R' }, 22, { frames: [8, 9], level: 'high', damage: 10, onBlock: -1, onHit: 7, reaction: 'medium' },
    { cmd: '2', followups: [F('jab_2_4', 10, 19)] }),
  S('jab_2_4', 'Snap Jab, Cross, Whip', '1,2,4', { type: 'round', limb: 'R' }, 34, { frames: [14, 16], level: 'high', damage: 18, onBlock: -6, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', pushback: 260 },
    { cmd: '4', endStance: 'lff', followups: tree(LFF_TREE, 17, 34) }),
  S('straight_3', 'Cross, Rising Heel', '2,3', { type: 'rising', limb: 'L' }, 32, { frames: [13, 15], level: 'mid', damage: 14, onBlock: -8, onHit: 3, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 },
    { cmd: '3' }),
  S('k3_3', 'Double Snap', '3,3', { type: 'front', limb: 'L' }, 30, { frames: [11, 13], level: 'mid', damage: 12, onBlock: -6, onHit: 4, reaction: 'medium' },
    { cmd: '3', followups: [F('k3_3_4', 14, 26), F('k3_3_d3', 14, 26)] }),
  S('k3_3_4', 'Triple Snap', '3,3,4', { type: 'round', limb: 'R' }, 34, { frames: [12, 14], level: 'high', damage: 18, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 260 },
    { cmd: '4', endStance: 'rff', followups: tree(RFF_TREE, 15, 34) }),
  S('k3_3_d3', 'Double Snap, Ankle Cut', '3,3,d+3', { type: 'low', limb: 'L' }, 34, { frames: [14, 16], level: 'low', damage: 12, onBlock: -13, onHit: 1, reaction: 'crouchLight' }, { cmd: 'd+3' }),
  S('k4_4', 'Whip, Hook Kick', '4,4', { type: 'round', limb: 'R', height: 'high' }, 34, { frames: [13, 15], level: 'high', damage: 18, onBlock: -7, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 280 },
    { cmd: '4', endStance: 'lff', followups: tree(LFF_TREE, 16, 34) }),
  S('k4_3', 'Whip, Low Reap', '4,3', { type: 'low', limb: 'L' }, 36, { frames: [15, 17], level: 'low', damage: 14, onBlock: -14, onHit: 0, reaction: 'crouchMedium' }, { cmd: '3' }),
  // while standing / full crouch / floor / sidestep / air / running
  S('ws3', 'Rising Snap', 'WS 3', { type: 'rising', limb: 'L' }, 30, { frames: [11, 13], level: 'mid', damage: 14, onBlock: -6, onHit: 5, reaction: 'medium' }, { cmd: '3', conditions: ['ws'] }),
  S('ws4', 'Rising Moon Kick', 'WS 4', { type: 'rising', limb: 'R' }, 36, LAUNCH([15, 16], 14, -12, 104, 5),
    { cmd: '4', conditions: ['ws'], motion: [{ frames: [1, 14], forward: 26 }], properties: ['launcher'] }),
  S('ws2', 'Rising Palm', 'WS 2', { type: 'palm', limb: 'R' }, 28, { frames: [12, 13], level: 'mid', damage: 12, onBlock: -4, onHit: 6, reaction: 'light' }, { cmd: '2', conditions: ['ws'] }),
  S('fc3', 'Crouch Snap', 'FC 3', { type: 'low', limb: 'L' }, 30, { frames: [12, 14], level: 'low', damage: 9, onBlock: -11, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['crouch'], pose: CR(29) }),
  S('fc4', 'Crouch Reap', 'FC 4', { type: 'low', limb: 'R' }, 32, { frames: [13, 15], level: 'low', damage: 11, onBlock: -13, onHit: 1, reaction: 'crouchLight' }, { cmd: '4', conditions: ['crouch'], pose: CR(31) }),
  S('fc_df4', 'Ankle Trip', 'FC d/f+4', { type: 'low', limb: 'R' }, 36, { frames: [15, 17], level: 'low', damage: 16, onBlock: -14, onHit: 3, reaction: 'crouchMedium', chReaction: 'trip' },
    { cmd: 'd/f+4', conditions: ['crouch'], pose: CR(35) }),
  S('ground3', 'Floor Reap', 'lying 3', { type: 'ground', limb: 'L' }, 40, { frames: [14, 17], level: 'low', damage: 12, onBlock: -16, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['lying'], pose: CR(20) }),
  S('ground4', 'Floor Spring Kick', 'lying 4', { type: 'ground', limb: 'R' }, 42, { frames: [16, 19], level: 'mid', damage: 16, onBlock: -14, onHit: 4, reaction: 'medium' }, { cmd: '4', conditions: ['lying'], pose: CR(20) }),
  S('ss3', 'Step Low', 'SS 3', { type: 'low', limb: 'L' }, 34, { frames: [14, 16], level: 'low', damage: 14, onBlock: -14, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['ss'] }),
  S('ss4', 'Side Whip', 'SS 4', { type: 'round', limb: 'R' }, 34, { frames: [15, 17], level: 'high', damage: 20, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5 },
    { cmd: '4', conditions: ['ss'], properties: ['homing'] }),
  S('air3', 'Falling Snap', 'u 3', { type: 'front', limb: 'L' }, 30, { frames: [8, 14], level: 'mid', damage: 14, onBlock: -4, onHit: 6, reaction: 'medium' }, { cmd: '3', conditions: ['air'], landFrame: 20 }),
  S('wr3', 'Flying Spear', 'WR 3', { type: 'hop', limb: 'L' }, 40, { frames: [12, 14], level: 'mid', damage: 25, onBlock: -10, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', pushback: 420, pushbackBlock: 400 },
    { cmd: '3', conditions: ['run'], properties: ['wallSplat', 'jumpAttack'] }),
  // right-foot-forward flamingo
  S('rff3', 'Flamingo Snap', 'RFF 3', { type: 'front', limb: 'L' }, 26, { frames: [10, 12], level: 'mid', damage: 12, onBlock: -4, onHit: 6, reaction: 'light' },
    { cmd: '3', conditions: ['stance'], stance: 'rff', endStance: 'rff', followups: tree(RFF_TREE, 13, 26) }),
  S('rff4', 'Flamingo Roundhouse', 'RFF 4', { type: 'round', limb: 'R' }, 32, { frames: [13, 15], level: 'high', damage: 18, onBlock: -8, onHit: 5, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 },
    { cmd: '4', conditions: ['stance'], stance: 'rff', endStance: 'lff', followups: [F('rff4_4', 16, 32), ...tree(LFF_TREE, 16, 32)] }),
  S('rff4_4', 'Flamingo Double Roundhouse', 'RFF 4,4', { type: 'round', limb: 'R' }, 34, { frames: [12, 14], level: 'mid', damage: 16, onBlock: -9, onHit: 4, reaction: 'medium', pushback: 260 },
    { cmd: '4', endStance: 'rff', followups: tree(RFF_TREE, 15, 34) }),
  S('rff_d4', 'Flamingo Shin Cut', 'RFF d+4', { type: 'low', limb: 'R' }, 32, { frames: [14, 16], level: 'low', damage: 12, onBlock: -13, onHit: 1, reaction: 'crouchLight' },
    { cmd: 'd+4', conditions: ['stance'], stance: 'rff' }),
  S('rff_f4', 'Flamingo Thrust', 'RFF f+4', { type: 'side', limb: 'R' }, 36, LAUNCH([14, 16], 18, -13, 112, 6),
    { cmd: 'f+4', conditions: ['stance'], stance: 'rff', motion: [{ frames: [1, 12], forward: 24 }], properties: ['launcher'] }),
  S('rff_34', 'Flamingo Hop', 'RFF 3+4', { type: 'hop', limb: 'R' }, 40, { frames: [15, 17], level: 'mid', damage: 20, onBlock: -12, onHit: 3, reaction: 'heavy', chReaction: 'knockdown' },
    { cmd: '3+4', conditions: ['stance'], stance: 'rff', crush: [{ level: 'low', frames: [1, 20] }], properties: ['lowCrush', 'jumpAttack'] }),
  S('rff_1', 'Flamingo Backfist', 'RFF 1', { type: 'backfist', limb: 'L' }, 28, { frames: [12, 13], level: 'high', damage: 14, onBlock: -5, onHit: 5, reaction: 'medium' },
    { cmd: '1', conditions: ['stance'], stance: 'rff', endStance: 'rff', followups: tree(RFF_TREE, 14, 28) }),
  // left-foot-forward flamingo
  S('lff3', 'Crane Snap', 'LFF 3', { type: 'front', limb: 'L' }, 28, { frames: [11, 13], level: 'mid', damage: 13, onBlock: -5, onHit: 5, reaction: 'light', chReaction: 'stagger' },
    { cmd: '3', conditions: ['stance'], stance: 'lff', followups: [F('lff3_3', 14, 28)] }),
  S('lff3_3', 'Crane Double Snap', 'LFF 3,3', { type: 'front', limb: 'L', height: 'high' }, 28, { frames: [10, 12], level: 'high', damage: 12, onBlock: -4, onHit: 6, reaction: 'medium' },
    { cmd: '3', endStance: 'lff', followups: tree(LFF_TREE, 13, 28) }),
  S('lff4', 'Crane Spin', 'LFF 4', { type: 'spinBack', limb: 'R' }, 36, { frames: [16, 18], level: 'high', damage: 20, onBlock: -8, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 360 },
    { cmd: '4', conditions: ['stance'], stance: 'lff', properties: ['homing'] }),
  S('lff_d3', 'Crane Low', 'LFF d+3', { type: 'low', limb: 'L' }, 30, { frames: [13, 15], level: 'low', damage: 11, onBlock: -12, onHit: 2, reaction: 'crouchLight' },
    { cmd: 'd+3', conditions: ['stance'], stance: 'lff', endStance: 'lff', followups: tree(LFF_TREE, 16, 30) }),
  S('lff_f3', 'Crane Lift', 'LFF f+3', { type: 'rising', limb: 'L' }, 36, LAUNCH([14, 15], 17, -13, 110, 5),
    { cmd: 'f+3', conditions: ['stance'], stance: 'lff', motion: [{ frames: [1, 12], forward: 24 }], properties: ['launcher'] }),
  S('lff_34', 'Crane Hop', 'LFF 3+4', { type: 'hop', limb: 'L' }, 40, { frames: [14, 16], level: 'mid', damage: 19, onBlock: -12, onHit: 3, reaction: 'heavy', chReaction: 'knockdown' },
    { cmd: '3+4', conditions: ['stance'], stance: 'lff', endStance: 'rff', crush: [{ level: 'low', frames: [1, 20] }], properties: ['lowCrush', 'jumpAttack'], followups: tree(RFF_TREE, 17, 40) }),
  S('lff_2', 'Crane Palm', 'LFF 2', { type: 'palm', limb: 'R' }, 28, { frames: [12, 13], level: 'mid', damage: 12, onBlock: -4, onHit: 6, reaction: 'light' },
    { cmd: '2', conditions: ['stance'], stance: 'lff' }),
];

/** Ten-hit string: Ten Heavens Storm (b+2, 1, 3, 4, 3, 4, 3, 4, 3, 4). */
const TEN: MoveDef[] = (() => {
  const links: [string, AnimSpec, number, HitArgs][] = [
    ['2', { type: 'straight', limb: 'R' }, 26, { frames: [12, 13], level: 'high', damage: 10, onBlock: -2, onHit: 6, reaction: 'light' }],
    ['1', { type: 'jab', limb: 'L' }, 22, { frames: [8, 9], level: 'high', damage: 8, onBlock: -1, onHit: 6, reaction: 'light' }],
    ['3', { type: 'front', limb: 'L' }, 30, { frames: [12, 14], level: 'mid', damage: 10, onBlock: -6, onHit: 3, reaction: 'medium' }],
    ['4', { type: 'round', limb: 'R' }, 30, { frames: [12, 14], level: 'high', damage: 12, onBlock: -6, onHit: 4, reaction: 'medium' }],
    ['3', { type: 'low', limb: 'L' }, 32, { frames: [13, 15], level: 'low', damage: 10, onBlock: -12, onHit: 0, reaction: 'crouchLight' }],
    ['4', { type: 'low', limb: 'R' }, 32, { frames: [12, 14], level: 'low', damage: 10, onBlock: -12, onHit: 0, reaction: 'crouchLight' }],
    ['3', { type: 'round', limb: 'L' }, 32, { frames: [13, 15], level: 'mid', damage: 12, onBlock: -8, onHit: 2, reaction: 'medium' }],
    ['4', { type: 'axe', limb: 'R' }, 34, { frames: [15, 17], level: 'mid', damage: 14, onBlock: -9, onHit: 3, reaction: 'medium' }],
    ['3', { type: 'spinBack', limb: 'L' }, 34, { frames: [15, 17], level: 'high', damage: 14, onBlock: -8, onHit: 4, reaction: 'heavy' }],
    ['4', { type: 'hop', limb: 'R' }, 44, LAUNCH([16, 18], 24, -14, 110, 5)],
  ];
  const names = ['Ten Heavens Storm', 'Second Heaven', 'Third Heaven', 'Fourth Heaven', 'Fifth Heaven', 'Sixth Heaven', 'Seventh Heaven', 'Eighth Heaven', 'Ninth Heaven', 'Tenth Heaven'];
  let seq = 'b+2';
  return links.map(([btn, anim, total, h], i) => {
    if (i > 0) seq += `,${btn}`;
    const last = h.frames[1];
    const m = S(`ten${i + 1}`, names[i] ?? '', seq, anim, total, h, { properties: ['tenHit'] });
    if (i > 0) m.cmd = btn;
    if (i < links.length - 1) m.followups = [F(`ten${i + 2}`, last + 1, total - 2)];
    return m;
  });
})();

export const JAEHYUN: CharacterDef = {
  id: 'jaehyun',
  name: 'Jae-Hyun Park',
  archetype: 'taekwondo',
  tagline: 'Flamingo footwork and a storm of spinning kicks.',
  stances: ['default', 'rff', 'lff'],
  tenHit: 'ten1',
  look: {
    palette: { skin: 0xd9a97c, top: 0xf4f4f4, pants: 0xf0f0f0, belt: 0x141414, gloves: 0xd9a97c, boots: 0xd9a97c, hair: 0x151515 },
    hair: 'spiky', heightScale: 1.02, bulk: 0.95,
  },
  stats: {
    hp: 170, height: 1815,
    walkF: 26, walkB: 22,
    dashSpeed: 64, dashFrames: 12,
    backdashSpeed: 72, backdashFrames: 7, backdashRecovery: 8,
    sidestepDist: 780, sidestepFrames: 14, sidestepWeakScale: 75, strongSide: 'left',
    pushRadius: 330, weight: 95, jumpVy: 62, gravity: 5,
  },
  hurtboxes: STANDARD_HURTBOXES,
  moves: [...ROOT, ...EXTRA, ...TEN],
};
