import type { AnimSpec, CapsuleDef, CharacterDef, FollowupDef, HitDef, HitLevel, MoveDef, ThrowDef } from '@/sim/types';
import { STANDARD_HURTBOXES, kickBox, punchBox } from './greybox';
import { ricardoStanceMoves } from './ricardo.moves2';

/*
 * Ricardo Vale: stance-switch fighter. Three stances with distinct trees:
 * `iron` (hard punches, armour), `silk` (soft palms, evasion) and `storm`
 * (spinning kicks). Stance-cancel moves hop between the trees.
 */

const PUNCHES = new Set<AnimSpec['type']>(['jab', 'straight', 'hook', 'uppercut', 'elbow', 'backfist', 'hammer', 'palm', 'doublePunch', 'powerCrush']);
export type HitArgs = Pick<HitDef, 'frames' | 'level' | 'damage' | 'onBlock' | 'onHit' | 'reaction'> & Partial<HitDef>;
const PY = { high: 1350, mid: 1100, low: 500 } as const;
const KY = { high: 1380, mid: 1000, low: 350 } as const;

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
const IRON_TREE = ['iron1', 'iron2', 'iron4', 'iron_f2', 'iron_d1', 'iron_12', 'iron_34'];
const SILK_TREE = ['silk1', 'silk2', 'silk3', 'silk4', 'silk_12', 'silk_d3', 'silk_34'];
const STORM_TREE = ['storm1', 'storm3', 'storm4', 'storm_d4', 'storm_f4', 'storm_34', 'storm_b3'];
const tree = (ids: string[], cancelFrame: number, windowEnd: number): FollowupDef[] => ids.map((id) => F(id, cancelFrame, windowEnd));

const ROOT: MoveDef[] = [
  S('jab', 'Quick Jab', '1', { type: 'jab', limb: 'L' }, 20, { frames: [10, 11], level: 'high', damage: 7, onBlock: 1, onHit: 8, reaction: 'light' },
    { followups: [F('jab_2', 12, 18)] }),
  S('straight', 'Straight Right', '2', { type: 'straight', limb: 'R' }, 23, { frames: [11, 12], level: 'high', damage: 10, onBlock: -1, onHit: 6, reaction: 'light' },
    { followups: [F('straight_4', 13, 20)] }),
  S('k3', 'Lead Front Kick', '3', { type: 'front', limb: 'L' }, 32, { frames: [14, 16], level: 'mid', damage: 15, onBlock: -9, onHit: 2, reaction: 'medium', pushback: 260, pushbackBlock: 300 }),
  S('k4', 'Rear Round Kick', '4', { type: 'round', limb: 'R' }, 31, { frames: [12, 14], level: 'high', damage: 16, onBlock: -9, onHit: 3, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5, pushback: 220 },
    { followups: [F('k4_3', 15, 28)] }),
  S('f2', 'Iron Entry', 'f+2', { type: 'straight', limb: 'R' }, 30, { frames: [14, 15], level: 'mid', damage: 14, onBlock: -4, onHit: 6, reaction: 'medium', chReaction: 'stagger', pushback: 240 },
    { motion: [{ frames: [1, 10], forward: 20 }], endStance: 'iron', followups: tree(IRON_TREE, 16, 30) }),
  S('f3', 'Silk Entry', 'f+3', { type: 'front', limb: 'L' }, 30, { frames: [13, 15], level: 'mid', damage: 13, onBlock: -6, onHit: 4, reaction: 'medium' },
    { endStance: 'silk', followups: tree(SILK_TREE, 16, 30) }),
  S('f4', 'Storm Entry', 'f+4', { type: 'round', limb: 'R' }, 34, { frames: [15, 17], level: 'mid', damage: 16, onBlock: -8, onHit: 3, reaction: 'medium', pushback: 260 },
    { endStance: 'storm', followups: tree(STORM_TREE, 18, 34) }),
  S('f1', 'Iron Switch Hook', 'f+1', { type: 'hook', limb: 'L' }, 28, { frames: [13, 14], level: 'high', damage: 12, onBlock: -3, onHit: 6, reaction: 'medium' },
    { endStance: 'iron', followups: tree(IRON_TREE, 15, 28) }),
  S('df1', 'Mid Jab', 'd/f+1', { type: 'jab', limb: 'L' }, 26, { frames: [13, 14], level: 'mid', damage: 10, onBlock: -2, onHit: 7, reaction: 'light' },
    { followups: [F('df1_2', 15, 22)] }),
  S('df2', 'Vale Uppercut', 'd/f+2', { type: 'uppercut', limb: 'R' }, 35, LAUNCH([15, 16], 17, -13, 110, 5),
    { motion: [{ frames: [1, 14], forward: 34 }], properties: ['launcher'] }),
  S('df3', 'Thrust Kick', 'd/f+3', { type: 'side', limb: 'L' }, 30, { frames: [14, 16], level: 'mid', damage: 14, onBlock: -7, onHit: 4, reaction: 'medium', pushback: 260 }),
  S('df4', 'Lifting Knee Kick', 'd/f+4', { type: 'rising', limb: 'R' }, 32, { frames: [14, 16], level: 'mid', damage: 14, onBlock: -8, onHit: 3, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 }),
  S('d1', 'Crouch Jab', 'd+1', { type: 'jab', limb: 'L' }, 22, { frames: [11, 12], level: 'smid', damage: 5, onBlock: -5, onHit: 6, reaction: 'crouchLight' }, { pose: CR(21) }),
  S('d2', 'Hammer Drop', 'd+2', { type: 'hammer', limb: 'R' }, 34, { frames: [15, 16], level: 'mid', damage: 14, onBlock: -6, onHit: 3, reaction: 'bound' }, { pose: CR(33), properties: ['bound'] }),
  S('d3', 'Low Jab Kick', 'd+3', { type: 'low', limb: 'L' }, 28, { frames: [12, 14], level: 'low', damage: 9, onBlock: -12, onHit: 2, reaction: 'crouchLight' }, { pose: CR(27) }),
  S('d4', 'Shin Kick', 'd+4', { type: 'low', limb: 'R' }, 28, { frames: [12, 14], level: 'low', damage: 10, onBlock: -13, onHit: 1, reaction: 'crouchLight' }, { pose: CR(27) }),
  S('db3', 'Vale Sweep', 'd/b+3', { type: 'sweep', limb: 'L' }, 46, { frames: [16, 18], level: 'low', damage: 18, onBlock: -26, onHit: 0, reaction: 'trip', pushback: 200 }, { pose: CR(41) }),
  S('db4', 'Heel Hook Low', 'd/b+4', { type: 'low', limb: 'R' }, 40, { frames: [17, 19], level: 'low', damage: 15, onBlock: -16, onHit: 3, reaction: 'crouchMedium', chReaction: 'trip' }, { pose: CR(38) }),
  S('b1', 'Turning Backfist', 'b+1', { type: 'backfist', limb: 'L' }, 30, { frames: [14, 15], level: 'high', damage: 14, onBlock: -5, onHit: 5, reaction: 'medium', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5 },
    { properties: ['homing'] }),
  S('b2', 'Silk Switch Palm', 'b+2', { type: 'palm', limb: 'R' }, 30, { frames: [14, 15], level: 'mid', damage: 13, onBlock: -4, onHit: 5, reaction: 'medium', pushback: 280 },
    { endStance: 'silk', followups: tree(SILK_TREE, 16, 30) }),
  S('b3', 'Storm Switch Kick', 'b+3', { type: 'spinBack', limb: 'L' }, 38, { frames: [18, 20], level: 'mid', damage: 20, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 360 },
    { endStance: 'storm', followups: tree(STORM_TREE, 21, 38) }),
  S('b4', 'Gale Hook Kick', 'b+4', { type: 'spinBack', limb: 'R' }, 40, { frames: [20, 22], level: 'high', damage: 22, onBlock: -4, onHit: 14, reaction: 'heavy', chReaction: 'knockdown', pushback: 420, pushbackBlock: 420 },
    { properties: ['homing'] }),
  S('b12', 'Iron Wall Crush', 'b+1+2', { type: 'powerCrush' }, 44, { frames: [19, 20], level: 'mid', damage: 24, onBlock: -14, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 380, pushbackBlock: 400 },
    { armour: [6, 18], properties: ['powerCrush'] }),
  S('p12', 'Twin Palm Push', '1+2', { type: 'doublePunch' }, 34, { frames: [15, 16], level: 'mid', damage: 18, onBlock: -7, onHit: 6, reaction: 'heavy', chReaction: 'stagger', pushback: 320, pushbackBlock: 320 }),
  S('k34', 'Iron Stamp', '3+4', { type: 'axe', limb: 'R' }, 38, { frames: [16, 18], level: 'mid', damage: 18, onBlock: -10, onHit: 3, reaction: 'heavy', chReaction: 'bound' },
    { endStance: 'iron', properties: ['hitsGrounded'], followups: tree(IRON_TREE, 19, 38) }),
  S('f34', 'Silk Hop', 'f+3+4', { type: 'hop', limb: 'L' }, 40, { frames: [14, 16], level: 'mid', damage: 16, onBlock: -10, onHit: 2, reaction: 'medium' },
    { crush: [{ level: 'low', frames: [1, 20] }], endStance: 'silk', properties: ['lowCrush', 'jumpAttack'], followups: tree(SILK_TREE, 17, 40) }),
  S('uf4', 'Rising Gale', 'u/f+4', { type: 'hop', limb: 'R' }, 40, LAUNCH([15, 17], 20, -13, 120, 5),
    { motion: [{ frames: [1, 18], forward: 18 }], crush: [{ level: 'low', frames: [1, 24] }], properties: ['launcher', 'jumpAttack', 'lowCrush'] }),
  S('uf3', 'Storm Vault', 'u/f+3', { type: 'hop', limb: 'L' }, 42, { frames: [16, 18], level: 'mid', damage: 20, onBlock: -11, onHit: 4, reaction: 'heavy', chReaction: 'knockdown' },
    { crush: [{ level: 'low', frames: [1, 22] }], endStance: 'storm', properties: ['lowCrush', 'jumpAttack'], followups: tree(STORM_TREE, 19, 42) }),
  S('ff2', 'Charging Iron', 'f,f+2', { type: 'straight', limb: 'R' }, 36, { frames: [16, 17], level: 'mid', damage: 25, onBlock: -8, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', pushback: 400, pushbackBlock: 350 },
    { motion: [{ frames: [1, 12], forward: 36 }], properties: ['wallSplat'] }),
  S('ff3', 'Silk Glide Kick', 'f,f+3', { type: 'side', limb: 'L' }, 36, { frames: [15, 17], level: 'mid', damage: 22, onBlock: -9, onHit: 6, reaction: 'heavy', pushback: 360, pushbackBlock: 340 },
    { motion: [{ frames: [1, 12], forward: 28 }], endStance: 'silk', followups: tree(SILK_TREE, 18, 36) }),
  S('ff4', 'Storm Twister', 'f,f+4', { type: 'spinBack', limb: 'R' }, 42, { frames: [18, 20], level: 'mid', damage: 24, onBlock: -12, onHit: 4, reaction: 'screw', pushback: 300 },
    { motion: [{ frames: [1, 12], forward: 26 }], properties: ['screw'] }),
  S('qcf1', 'Rising Silk Palm', 'qcf+1', { type: 'palm', limb: 'L' }, 36, { frames: [13, 14], level: 'mid', damage: 18, onBlock: -10, onHit: 4, reaction: 'medium', chReaction: 'launch', launchVy: 100, launchVz: 5 },
    { motion: [{ frames: [1, 8], forward: 18 }] }),
  S('ub4', 'Retreating Gale', 'u/b+4', { type: 'round', limb: 'R' }, 38, { frames: [16, 18], level: 'high', damage: 18, onBlock: -9, onHit: 5, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 },
    { motion: [{ frames: [1, 10], forward: -20 }], crush: [{ level: 'low', frames: [1, 20] }], properties: ['lowCrush'] }),
  T('throw13', 'Shoulder Wheel', '1+3', { breakButton: 1, damage: 35, result: 'knockdown', breakWindow: 14, endOffset: 1400 }),
  T('throw24', 'Collar Drag', '2+4', { breakButton: 2, damage: 35, result: 'faceDown', breakWindow: 14, duration: 56 }),
  T('throw12', 'Vale Spine Drop', 'd/f+1+2', { breakButton: 12, damage: 40, result: 'knockdown', duration: 70, endOffset: 900, grabsCrouching: true }, { total: 42 }),
  T('throwff13', 'Charging Clinch', 'f,f+1+3', { breakButton: 1, damage: 38, result: 'knockdown', duration: 64, grabFrame: 14, range: 1100, endOffset: 1600 },
    { total: 46, motion: [{ frames: [1, 13], forward: 60 }] }),
];

const EXTRA: MoveDef[] = [
  S('jab_2', 'Jab, Straight', '1,2', { type: 'straight', limb: 'R' }, 22, { frames: [8, 9], level: 'high', damage: 10, onBlock: -1, onHit: 7, reaction: 'medium' },
    { cmd: '2', followups: [F('jab_2_1', 10, 19), F('jab_2_4', 10, 19)] }),
  S('jab_2_1', 'Jab, Straight, Iron Hook', '1,2,1', { type: 'hook', limb: 'L' }, 30, { frames: [12, 13], level: 'mid', damage: 14, onBlock: -8, onHit: 4, reaction: 'heavy', chReaction: 'stagger' },
    { cmd: '1', endStance: 'iron', followups: tree(IRON_TREE, 14, 30) }),
  S('jab_2_4', 'Jab, Straight, Storm Kick', '1,2,4', { type: 'round', limb: 'R' }, 34, { frames: [14, 16], level: 'high', damage: 17, onBlock: -8, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 260 },
    { cmd: '4', endStance: 'storm', followups: tree(STORM_TREE, 17, 34) }),
  S('straight_4', 'Straight, Low Cut', '2,4', { type: 'low', limb: 'R' }, 34, { frames: [14, 16], level: 'low', damage: 12, onBlock: -13, onHit: 1, reaction: 'crouchLight' }, { cmd: '4' }),
  S('k4_3', 'Round, Silk Sweep', '4,3', { type: 'low', limb: 'L' }, 36, { frames: [15, 17], level: 'low', damage: 14, onBlock: -14, onHit: 0, reaction: 'crouchMedium' },
    { cmd: '3', endStance: 'silk', followups: tree(SILK_TREE, 18, 36) }),
  S('df1_2', 'Mid Jab, Uppercut', 'd/f+1,2', { type: 'uppercut', limb: 'R' }, 32, { frames: [12, 13], level: 'mid', damage: 14, onBlock: -9, onHit: 4, reaction: 'medium', chReaction: 'launch', launchVy: 100, launchVz: 5 },
    { cmd: '2', motion: [{ frames: [1, 8], forward: 20 }] }),
  S('ws2', 'Rising Iron', 'WS 2', { type: 'uppercut', limb: 'R' }, 36, LAUNCH([15, 16], 14, -12, 104, 5),
    { cmd: '2', conditions: ['ws'], motion: [{ frames: [1, 14], forward: 28 }], properties: ['launcher'] }),
  S('ws3', 'Rising Silk Kick', 'WS 3', { type: 'rising', limb: 'L' }, 30, { frames: [11, 13], level: 'mid', damage: 13, onBlock: -6, onHit: 5, reaction: 'medium' }, { cmd: '3', conditions: ['ws'] }),
  S('ws4', 'Rising Storm Kick', 'WS 4', { type: 'rising', limb: 'R' }, 32, { frames: [12, 14], level: 'mid', damage: 15, onBlock: -7, onHit: 4, reaction: 'medium', chReaction: 'stagger' }, { cmd: '4', conditions: ['ws'] }),
  S('fc1', 'Crouch Poke', 'FC 1', { type: 'jab', limb: 'L' }, 22, { frames: [11, 12], level: 'smid', damage: 5, onBlock: -5, onHit: 6, reaction: 'crouchLight' }, { cmd: '1', conditions: ['crouch'], pose: CR(21) }),
  S('fc3', 'Crouch Shin Kick', 'FC 3', { type: 'low', limb: 'L' }, 30, { frames: [12, 14], level: 'low', damage: 9, onBlock: -11, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['crouch'], pose: CR(29) }),
  S('fc_df4', 'Crouch Ankle Hook', 'FC d/f+4', { type: 'low', limb: 'R' }, 36, { frames: [15, 17], level: 'low', damage: 16, onBlock: -14, onHit: 3, reaction: 'crouchMedium', chReaction: 'trip' },
    { cmd: 'd/f+4', conditions: ['crouch'], pose: CR(35) }),
  S('ground3', 'Floor Sweep', 'lying 3', { type: 'ground', limb: 'L' }, 40, { frames: [14, 17], level: 'low', damage: 12, onBlock: -16, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['lying'], pose: CR(20) }),
  S('ground4', 'Floor Spring Kick', 'lying 4', { type: 'ground', limb: 'R' }, 42, { frames: [16, 19], level: 'mid', damage: 16, onBlock: -14, onHit: 4, reaction: 'medium' }, { cmd: '4', conditions: ['lying'], pose: CR(20) }),
  S('ss2', 'Step Iron Hook', 'SS 2', { type: 'hook', limb: 'R' }, 34, { frames: [15, 16], level: 'high', damage: 20, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5 },
    { cmd: '2', conditions: ['ss'], properties: ['homing'], endStance: 'iron', followups: tree(IRON_TREE, 17, 34) }),
  S('ss3', 'Step Silk Low', 'SS 3', { type: 'low', limb: 'L' }, 34, { frames: [14, 16], level: 'low', damage: 14, onBlock: -14, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['ss'], endStance: 'silk' }),
  S('air3', 'Falling Kick', 'u 3', { type: 'front', limb: 'L' }, 30, { frames: [8, 14], level: 'mid', damage: 14, onBlock: -4, onHit: 6, reaction: 'medium' }, { cmd: '3', conditions: ['air'], landFrame: 20 }),
  S('wr2', 'Running Iron Ram', 'WR 2', { type: 'straight', limb: 'R' }, 38, { frames: [13, 14], level: 'mid', damage: 26, onBlock: -8, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', pushback: 420, pushbackBlock: 400 },
    { cmd: '2', conditions: ['run'], properties: ['wallSplat'] }),
];

/** Ten-hit string: Three Winds Cascade (f,f+1 then 2,1,2,3,4,3,4,1+2,2). */
const TEN: MoveDef[] = (() => {
  const links: [string, AnimSpec, number, HitArgs][] = [
    ['1', { type: 'jab', limb: 'L' }, 24, { frames: [11, 12], level: 'high', damage: 9, onBlock: 0, onHit: 7, reaction: 'light' }],
    ['2', { type: 'straight', limb: 'R' }, 24, { frames: [9, 10], level: 'high', damage: 10, onBlock: -2, onHit: 6, reaction: 'light' }],
    ['1', { type: 'hook', limb: 'L' }, 28, { frames: [11, 12], level: 'mid', damage: 11, onBlock: -4, onHit: 4, reaction: 'medium' }],
    ['2', { type: 'uppercut', limb: 'R' }, 30, { frames: [12, 13], level: 'mid', damage: 12, onBlock: -6, onHit: 3, reaction: 'medium' }],
    ['3', { type: 'low', limb: 'L' }, 32, { frames: [13, 15], level: 'low', damage: 10, onBlock: -12, onHit: 0, reaction: 'crouchLight' }],
    ['4', { type: 'round', limb: 'R' }, 32, { frames: [13, 15], level: 'high', damage: 13, onBlock: -7, onHit: 3, reaction: 'medium' }],
    ['3', { type: 'front', limb: 'L' }, 32, { frames: [13, 15], level: 'mid', damage: 12, onBlock: -8, onHit: 2, reaction: 'medium' }],
    ['4', { type: 'spinBack', limb: 'R' }, 36, { frames: [16, 18], level: 'mid', damage: 14, onBlock: -9, onHit: 3, reaction: 'heavy' }],
    ['1+2', { type: 'doublePunch' }, 36, { frames: [15, 16], level: 'mid', damage: 16, onBlock: -8, onHit: 4, reaction: 'heavy' }],
    ['2', { type: 'straight', limb: 'R' }, 44, { frames: [16, 17], level: 'mid', damage: 24, onBlock: -14, onHit: 8, reaction: 'knockdown', pushback: 420, pushbackBlock: 420 }],
  ];
  const names = ['Three Winds Cascade', 'Second Wind', 'Third Wind', 'Fourth Wind', 'Fifth Wind', 'Sixth Wind', 'Seventh Wind', 'Eighth Wind', 'Ninth Wind', 'Tenth Wind: Tempest'];
  let seq = 'f,f+1';
  return links.map(([btn, anim, total, h], i) => {
    if (i > 0) seq += `,${btn}`;
    const m = S(`ten${i + 1}`, names[i] ?? '', seq, anim, total, h, { properties: ['tenHit'] });
    if (i > 0) m.cmd = btn;
    if (i < links.length - 1) m.followups = [F(`ten${i + 2}`, h.frames[1] + 1, total - 2)];
    return m;
  });
})();

export const RICARDO: CharacterDef = {
  id: 'ricardo',
  name: 'Ricardo Vale',
  archetype: 'stance-switch',
  tagline: 'Iron, silk and storm: three arts in one body.',
  stances: ['default', 'iron', 'silk', 'storm'],
  tenHit: 'ten1',
  look: {
    palette: { skin: 0xb9825a, top: 0x1f2230, pants: 0x6b6e73, belt: 0x2b2b2b, gloves: 0x3a2a1a, boots: 0x222222, hair: 0x2a1a10 },
    hair: 'short', heightScale: 1.0, bulk: 1.0,
  },
  stats: {
    hp: 170, height: 1780,
    walkF: 26, walkB: 21,
    dashSpeed: 62, dashFrames: 12,
    backdashSpeed: 70, backdashFrames: 7, backdashRecovery: 8,
    sidestepDist: 760, sidestepFrames: 14, sidestepWeakScale: 75, strongSide: 'left',
    pushRadius: 340, weight: 100, jumpVy: 62, gravity: 5,
  },
  hurtboxes: STANDARD_HURTBOXES,
  moves: [...ROOT, ...EXTRA, ...ricardoStanceMoves({ S, F, tree, LAUNCH, CR, trees: { iron: IRON_TREE, silk: SILK_TREE, storm: STORM_TREE } }), ...TEN],
};
