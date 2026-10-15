import type { AnimSpec, CapsuleDef, CharacterDef, FollowupDef, HitDef, HitLevel, MoveDef, ThrowDef } from '@/sim/types';
import { STANDARD_HURTBOXES, kickBox, punchBox } from './greybox';

/*
 * Seraphine: mystical fast pokes. Long-range needles and palms (reach +10%),
 * float juggles, a high/mid parry and the Shadow Cross: a sidestep-cancel dash
 * that crosses to the opponent's other side under high- and low-crush cover.
 */

const PUNCHES = new Set<AnimSpec['type']>(['jab', 'straight', 'hook', 'uppercut', 'elbow', 'backfist', 'hammer', 'palm', 'doublePunch', 'powerCrush']);
type HitArgs = Pick<HitDef, 'frames' | 'level' | 'damage' | 'onBlock' | 'onHit' | 'reaction'> & Partial<HitDef>;
const PY = { high: 1320, mid: 1080, low: 500 } as const;
const KY = { high: 1350, mid: 980, low: 340 } as const;

/** Authored fallback capsule, 10% longer than the roster baseline. */
function box(a: AnimSpec, level: HitLevel): CapsuleDef {
  const side = (a.limb ?? 'R') === 'L' ? 100 : -100;
  const h = a.height ?? (level === 'high' ? 'high' : level === 'low' ? 'low' : 'mid');
  return PUNCHES.has(a.type) ? punchBox(side, PY[h], 1155) : kickBox(side, KY[h], 1595);
}
function S(id: string, name: string, input: string, anim: AnimSpec, total: number, hits: HitArgs | HitArgs[], m: Partial<MoveDef> = {}): MoveDef {
  const list = Array.isArray(hits) ? hits : [hits];
  return { id, name, input, anim, total, ...m, hits: list.map((h) => ({ pushback: 120, pushbackBlock: 160, capsules: [box(anim, h.level)], ...h })) };
}
const F = (moveId: string, cancelFrame: number, windowEnd: number): FollowupDef => ({ moveId, cancelFrame, windowEnd });
const CR = (end: number): NonNullable<MoveDef['pose']> => [{ frames: [0, end], pose: 'crouch' }];
/** Float launcher: high lift, gentle push, extra air lift for follow-ups. */
const FLOAT = (frames: [number, number], damage: number, onBlock: number, launchVy = 116, launchVz = 4): HitArgs =>
  ({ frames, level: 'mid', damage, onBlock, onHit: 0, reaction: 'launch', launchVy, launchVz, airLift: 58 });
function T(id: string, name: string, input: string, t: Pick<ThrowDef, 'breakButton' | 'damage' | 'result'> & Partial<ThrowDef>, m: Partial<MoveDef> = {}): MoveDef {
  return { id, name, input, total: 40, anim: { type: 'throw' }, hits: [], ...m, throw: { breakWindow: 12, duration: 60, grabFrame: 12, range: 1100, endOffset: 1300, ...t } };
}

const ROOT: MoveDef[] = [
  S('jab', 'Needle Jab', '1', { type: 'jab', limb: 'L' }, 19, { frames: [10, 11], level: 'high', damage: 6, onBlock: 1, onHit: 8, reaction: 'light' },
    { followups: [F('jab_1', 12, 17)] }),
  S('straight', 'Veil Straight', '2', { type: 'straight', limb: 'R' }, 22, { frames: [11, 12], level: 'high', damage: 9, onBlock: -1, onHit: 6, reaction: 'light' },
    { followups: [F('straight_2', 13, 20)] }),
  S('k3', 'Wisp Kick', '3', { type: 'front', limb: 'L' }, 28, { frames: [12, 14], level: 'mid', damage: 12, onBlock: -5, onHit: 4, reaction: 'light', pushback: 220 },
    { followups: [F('k3_4', 15, 25)] }),
  S('k4', 'Wing Kick', '4', { type: 'round', limb: 'R' }, 30, { frames: [12, 14], level: 'high', damage: 15, onBlock: -8, onHit: 4, reaction: 'medium', chReaction: 'launch', launchVy: 108, launchVz: 4, pushback: 220 },
    { followups: [F('k4_4', 15, 27)] }),
  S('f1', 'Spirit Palm', 'f+1', { type: 'palm', limb: 'L' }, 28, { frames: [13, 14], level: 'mid', damage: 13, onBlock: -3, onHit: 6, reaction: 'medium', pushback: 300, pushbackBlock: 300 },
    { followups: [F('f1_2', 15, 26)] }),
  S('f2', 'Veil Pierce', 'f+2', { type: 'straight', limb: 'R' }, 30, { frames: [14, 15], level: 'mid', damage: 15, onBlock: -6, onHit: 5, reaction: 'medium', chReaction: 'stagger', pushback: 260 },
    { motion: [{ frames: [1, 10], forward: 16 }] }),
  S('f3', 'Drifting Thrust', 'f+3', { type: 'side', limb: 'L' }, 32, { frames: [14, 16], level: 'mid', damage: 16, onBlock: -8, onHit: 4, reaction: 'medium', pushback: 320, pushbackBlock: 320 }),
  S('f4', 'Halo Spin', 'f+4', { type: 'spinBack', limb: 'R' }, 38, { frames: [18, 20], level: 'high', damage: 20, onBlock: -4, onHit: 12, reaction: 'heavy', chReaction: 'knockdown', pushback: 400, pushbackBlock: 400 },
    { properties: ['homing'] }),
  S('df1', 'Glass Jab', 'd/f+1', { type: 'jab', limb: 'L' }, 24, { frames: [12, 13], level: 'mid', damage: 9, onBlock: -2, onHit: 7, reaction: 'light' },
    { followups: [F('df1_2', 14, 22)] }),
  S('df2', 'Ascension', 'd/f+2', { type: 'uppercut', limb: 'R' }, 34, FLOAT([14, 15], 14, -13, 118, 5),
    { motion: [{ frames: [1, 12], forward: 26 }], properties: ['launcher'] }),
  S('df3', 'Lotus Thrust', 'd/f+3', { type: 'side', limb: 'L' }, 30, { frames: [13, 15], level: 'mid', damage: 13, onBlock: -6, onHit: 4, reaction: 'medium', pushback: 260 }),
  S('df4', 'Feather Lift', 'd/f+4', { type: 'rising', limb: 'R' }, 36, FLOAT([15, 16], 15, -13, 116, 4),
    { motion: [{ frames: [1, 12], forward: 20 }], properties: ['launcher'] }),
  S('d1', 'Low Needle', 'd+1', { type: 'jab', limb: 'L' }, 20, { frames: [10, 11], level: 'smid', damage: 5, onBlock: -4, onHit: 6, reaction: 'crouchLight' }, { pose: CR(19) }),
  S('d2', 'Falling Star', 'd+2', { type: 'hammer', limb: 'R' }, 34, { frames: [15, 16], level: 'mid', damage: 13, onBlock: -6, onHit: 3, reaction: 'bound' }, { pose: CR(33), properties: ['bound'] }),
  S('d3', 'Ankle Wisp', 'd+3', { type: 'low', limb: 'L' }, 28, { frames: [12, 14], level: 'low', damage: 8, onBlock: -12, onHit: 2, reaction: 'crouchLight' }, { pose: CR(27) }),
  S('d4', 'Shin Wisp', 'd+4', { type: 'low', limb: 'R' }, 30, { frames: [13, 15], level: 'low', damage: 10, onBlock: -13, onHit: 1, reaction: 'crouchLight' }, { pose: CR(29) }),
  S('db3', 'Mist Sweep', 'd/b+3', { type: 'sweep', limb: 'L' }, 46, { frames: [16, 18], level: 'low', damage: 17, onBlock: -26, onHit: 0, reaction: 'trip', pushback: 200 }, { pose: CR(41) }),
  S('db4', 'Ghost Trip', 'd/b+4', { type: 'low', limb: 'R' }, 40, { frames: [17, 19], level: 'low', damage: 14, onBlock: -16, onHit: 3, reaction: 'crouchMedium', chReaction: 'trip' }, { pose: CR(38) }),
  S('b2', 'Mirror Backfist', 'b+2', { type: 'backfist', limb: 'R' }, 28, { frames: [13, 14], level: 'high', damage: 14, onBlock: -5, onHit: 5, reaction: 'medium', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5 }),
  S('b3', 'Fading Wisp', 'b+3', { type: 'round', limb: 'L' }, 36, { frames: [15, 17], level: 'high', damage: 16, onBlock: -8, onHit: 4, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 },
    { motion: [{ frames: [1, 10], forward: -18 }], crush: [{ level: 'low', frames: [1, 18] }], properties: ['lowCrush'] }),
  S('b4', 'Halo Heel', 'b+4', { type: 'spinBack', limb: 'R' }, 42, { frames: [19, 21], level: 'mid', damage: 22, onBlock: -10, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 380, pushbackBlock: 380 },
    { properties: ['homing'] }),
  S('b12', 'Aegis Crush', 'b+1+2', { type: 'powerCrush' }, 44, { frames: [19, 20], level: 'mid', damage: 22, onBlock: -14, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 380, pushbackBlock: 400 },
    { armour: [6, 18], properties: ['powerCrush'] }),
  { id: 'b13', name: 'Mirror Veil', input: 'b+1+3', anim: { type: 'parry' }, total: 30, hits: [],
    parry: { frames: [2, 14], levels: ['high', 'mid'], stagger: 24 }, properties: ['parry'] },
  S('p12', 'Spirit Lance', '1+2', { type: 'doublePunch' }, 34, { frames: [15, 16], level: 'mid', damage: 18, onBlock: -7, onHit: 6, reaction: 'heavy', chReaction: 'stagger', pushback: 360, pushbackBlock: 360 }),
  S('f12', 'Veil Burst', 'f+1+2', { type: 'doublePunch' }, 40, { frames: [17, 18], level: 'mid', damage: 24, onBlock: -9, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 420, pushbackBlock: 400 },
    { motion: [{ frames: [1, 10], forward: 14 }], properties: ['wallSplat'] }),
  S('uf3', 'Skyward Wisp', 'u/f+3', { type: 'hop', limb: 'L' }, 42, FLOAT([14, 16], 18, -13, 122, 4),
    { motion: [{ frames: [1, 16], forward: 12 }], crush: [{ level: 'low', frames: [1, 22] }], properties: ['launcher', 'lowCrush', 'jumpAttack'] }),
  S('uf4', 'Comet Heel', 'u/f+4', { type: 'hop', limb: 'R' }, 42, { frames: [16, 18], level: 'mid', damage: 20, onBlock: -12, onHit: 4, reaction: 'heavy', chReaction: 'knockdown', pushback: 300 },
    { motion: [{ frames: [1, 16], forward: 12 }], crush: [{ level: 'low', frames: [1, 22] }], properties: ['lowCrush', 'jumpAttack'] }),
  S('ub4', 'Backflip Halo', 'u/b+4', { type: 'hop', limb: 'R' }, 42, { frames: [13, 15], level: 'mid', damage: 16, onBlock: -12, onHit: 0, reaction: 'launchHigh', launchVy: 116, launchVz: 4, airLift: 56 },
    { motion: [{ frames: [1, 10], forward: -16 }], crush: [{ level: 'low', frames: [1, 20] }], properties: ['launcher', 'lowCrush', 'jumpAttack'] }),
  S('ff2', 'Phantom Pierce', 'f,f+2', { type: 'straight', limb: 'R' }, 36, { frames: [15, 16], level: 'mid', damage: 24, onBlock: -8, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', pushback: 400, pushbackBlock: 350 },
    { motion: [{ frames: [1, 12], forward: 32 }], properties: ['wallSplat'] }),
  S('ff3', 'Gliding Thrust', 'f,f+3', { type: 'side', limb: 'L' }, 36, { frames: [15, 17], level: 'mid', damage: 20, onBlock: -9, onHit: 6, reaction: 'heavy', pushback: 380, pushbackBlock: 340 },
    { motion: [{ frames: [1, 12], forward: 28 }] }),
  S('ff4', 'Comet Twist', 'f,f+4', { type: 'spinBack', limb: 'R' }, 40, { frames: [17, 19], level: 'mid', damage: 20, onBlock: -12, onHit: 4, reaction: 'screw', pushback: 300 },
    { motion: [{ frames: [1, 12], forward: 24 }], properties: ['screw'] }),
  S('qcf2', 'Comet Thrust', 'qcf+2', { type: 'palm', limb: 'R' }, 36, { frames: [13, 14], level: 'mid', damage: 18, onBlock: -10, onHit: 4, reaction: 'medium', chReaction: 'launch', launchVy: 100, launchVz: 5 },
    { motion: [{ frames: [1, 8], forward: 18 }] }),
  S('df34', 'Twin Wisp Low', 'd/f+3+4', { type: 'low', limb: 'R' }, 38, { frames: [15, 17], level: 'low', damage: 15, onBlock: -15, onHit: 1, reaction: 'crouchMedium', chReaction: 'trip' }, { pose: CR(36) }),
  T('throw13', 'Veil Snare', '1+3', { breakButton: 1, damage: 35, result: 'knockdown', breakWindow: 14, endOffset: 1400 }),
  T('throw24', 'Spirit Yank', '2+4', { breakButton: 2, damage: 35, result: 'faceDown', breakWindow: 14, duration: 56 }),
  T('throw12', 'Lotus Bind', 'd/f+1+2', { breakButton: 12, damage: 40, result: 'knockdown', duration: 70, endOffset: 900, grabsCrouching: true }, { total: 42 }),
  T('throwff24', 'Phantom Pull', 'f,f+2+4', { breakButton: 2, damage: 38, result: 'faceDown', duration: 64, grabFrame: 14, range: 1150, endOffset: 1500 },
    { total: 46, motion: [{ frames: [1, 13], forward: 60 }] }),
];

const EXTRA: MoveDef[] = [
  S('jab_1', 'Twin Needles', '1,1', { type: 'jab', limb: 'L' }, 20, { frames: [7, 8], level: 'high', damage: 6, onBlock: 0, onHit: 7, reaction: 'light' },
    { cmd: '1', followups: [F('jab_1_2', 9, 18)] }),
  S('jab_1_2', 'Needle Thread', '1,1,2', { type: 'straight', limb: 'R' }, 26, { frames: [10, 11], level: 'mid', damage: 12, onBlock: -4, onHit: 5, reaction: 'medium', chReaction: 'stagger' }, { cmd: '2' }),
  S('straight_2', 'Veil Double', '2,2', { type: 'straight', limb: 'R' }, 26, { frames: [9, 10], level: 'mid', damage: 11, onBlock: -5, onHit: 4, reaction: 'medium' }, { cmd: '2' }),
  S('k3_4', 'Wisp, Wing', '3,4', { type: 'round', limb: 'R' }, 32, { frames: [12, 14], level: 'high', damage: 16, onBlock: -8, onHit: 5, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 }, { cmd: '4' }),
  S('k4_4', 'Wing, Halo', '4,4', { type: 'spinBack', limb: 'R' }, 36, { frames: [14, 16], level: 'high', damage: 18, onBlock: -8, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 320 }, { cmd: '4' }),
  S('f1_2', 'Spirit Palm, Pierce', 'f+1,2', { type: 'straight', limb: 'R' }, 28, { frames: [10, 11], level: 'mid', damage: 13, onBlock: -6, onHit: 4, reaction: 'medium', chReaction: 'stagger', pushback: 260 }, { cmd: '2' }),
  S('df1_2', 'Glass Jab, Lift', 'd/f+1,2', { type: 'uppercut', limb: 'R' }, 30, { frames: [11, 12], level: 'mid', damage: 12, onBlock: -9, onHit: 4, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 },
    { cmd: '2', motion: [{ frames: [1, 8], forward: 18 }] }),
  S('ws1', 'Rising Needle', 'WS 1', { type: 'jab', limb: 'L' }, 24, { frames: [11, 12], level: 'mid', damage: 9, onBlock: -2, onHit: 6, reaction: 'light' }, { cmd: '1', conditions: ['ws'] }),
  S('ws2', 'Rising Ascension', 'WS 2', { type: 'uppercut', limb: 'R' }, 36, FLOAT([15, 16], 13, -12, 110, 5),
    { cmd: '2', conditions: ['ws'], motion: [{ frames: [1, 14], forward: 26 }], properties: ['launcher'] }),
  S('ws4', 'Rising Wing', 'WS 4', { type: 'rising', limb: 'R' }, 30, { frames: [12, 14], level: 'mid', damage: 13, onBlock: -6, onHit: 5, reaction: 'medium' }, { cmd: '4', conditions: ['ws'] }),
  S('fc1', 'Crouch Needle', 'FC 1', { type: 'jab', limb: 'L' }, 20, { frames: [10, 11], level: 'smid', damage: 5, onBlock: -4, onHit: 6, reaction: 'crouchLight' }, { cmd: '1', conditions: ['crouch'], pose: CR(19) }),
  S('fc3', 'Crouch Wisp', 'FC 3', { type: 'low', limb: 'L' }, 30, { frames: [12, 14], level: 'low', damage: 9, onBlock: -11, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['crouch'], pose: CR(29) }),
  S('fc_df4', 'Crouch Ghost Trip', 'FC d/f+4', { type: 'low', limb: 'R' }, 36, { frames: [15, 17], level: 'low', damage: 15, onBlock: -14, onHit: 3, reaction: 'crouchMedium', chReaction: 'trip' },
    { cmd: 'd/f+4', conditions: ['crouch'], pose: CR(35) }),
  S('ground3', 'Floor Mist Sweep', 'lying 3', { type: 'ground', limb: 'L' }, 40, { frames: [14, 17], level: 'low', damage: 12, onBlock: -16, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['lying'], pose: CR(20) }),
  S('ground4', 'Floor Wisp Kick', 'lying 4', { type: 'ground', limb: 'R' }, 42, { frames: [16, 19], level: 'mid', damage: 15, onBlock: -14, onHit: 4, reaction: 'medium' }, { cmd: '4', conditions: ['lying'], pose: CR(20) }),
  // Shadow Cross: sidestep-cancel dash through the opponent under high/low crush, finishing with a turning backfist.
  S('ss34', 'Shadow Cross', 'SS 3+4', { type: 'backfist', limb: 'R' }, 32, { frames: [13, 14], level: 'high', damage: 10, onBlock: -3, onHit: 6, reaction: 'light' },
    { cmd: '3+4', conditions: ['ss'], motion: [{ frames: [1, 8], forward: 170 }], crush: [{ level: 'low', frames: [1, 12] }, { level: 'high', frames: [1, 12] }], properties: ['lowCrush', 'highCrush'] }),
  S('ss2', 'Veil Hook', 'SS 2', { type: 'hook', limb: 'R' }, 34, { frames: [15, 16], level: 'high', damage: 18, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5 },
    { cmd: '2', conditions: ['ss'], properties: ['homing'] }),
  S('ss3', 'Step Wisp Low', 'SS 3', { type: 'low', limb: 'L' }, 34, { frames: [14, 16], level: 'low', damage: 13, onBlock: -14, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['ss'] }),
  S('air3', 'Falling Wisp', 'u 3', { type: 'front', limb: 'L' }, 30, { frames: [8, 14], level: 'mid', damage: 13, onBlock: -4, onHit: 6, reaction: 'medium' }, { cmd: '3', conditions: ['air'], landFrame: 20 }),
  S('wr2', 'Running Pierce', 'WR 2', { type: 'straight', limb: 'R' }, 38, { frames: [13, 14], level: 'mid', damage: 25, onBlock: -8, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', pushback: 420, pushbackBlock: 400 },
    { cmd: '2', conditions: ['run'], properties: ['wallSplat'] }),
];

/** Ten-hit string: Ten Veils (b+1 then 2,1,2,3,4,3,4,1+2,2). */
const TEN: MoveDef[] = (() => {
  const links: [string, AnimSpec, number, HitArgs][] = [
    ['1', { type: 'jab', limb: 'L' }, 22, { frames: [10, 11], level: 'high', damage: 7, onBlock: 0, onHit: 7, reaction: 'light' }],
    ['2', { type: 'straight', limb: 'R' }, 24, { frames: [9, 10], level: 'high', damage: 9, onBlock: -2, onHit: 6, reaction: 'light' }],
    ['1', { type: 'palm', limb: 'L' }, 26, { frames: [11, 12], level: 'mid', damage: 10, onBlock: -4, onHit: 4, reaction: 'medium' }],
    ['2', { type: 'backfist', limb: 'R' }, 28, { frames: [12, 13], level: 'high', damage: 12, onBlock: -5, onHit: 4, reaction: 'medium' }],
    ['3', { type: 'low', limb: 'L' }, 32, { frames: [13, 15], level: 'low', damage: 10, onBlock: -12, onHit: 0, reaction: 'crouchLight' }],
    ['4', { type: 'round', limb: 'R' }, 32, { frames: [13, 15], level: 'high', damage: 13, onBlock: -7, onHit: 3, reaction: 'medium' }],
    ['3', { type: 'front', limb: 'L' }, 32, { frames: [13, 15], level: 'mid', damage: 12, onBlock: -8, onHit: 2, reaction: 'medium' }],
    ['4', { type: 'axe', limb: 'R' }, 36, { frames: [16, 18], level: 'mid', damage: 14, onBlock: -9, onHit: 3, reaction: 'heavy' }],
    ['1+2', { type: 'doublePunch' }, 36, { frames: [15, 16], level: 'mid', damage: 16, onBlock: -8, onHit: 4, reaction: 'heavy' }],
    ['2', { type: 'uppercut', limb: 'R' }, 42, FLOAT([15, 16], 22, -14, 114, 5)],
  ];
  const names = ['Ten Veils', 'Second Veil', 'Third Veil', 'Fourth Veil', 'Fifth Veil', 'Sixth Veil', 'Seventh Veil', 'Eighth Veil', 'Ninth Veil', 'Tenth Veil: Ascension'];
  let seq = 'b+1';
  return links.map(([btn, anim, total, h], i) => {
    if (i > 0) seq += `,${btn}`;
    const m = S(`ten${i + 1}`, names[i] ?? '', seq, anim, total, h, { properties: ['tenHit'] });
    if (i > 0) m.cmd = btn;
    if (i < links.length - 1) m.followups = [F(`ten${i + 2}`, h.frames[1] + 1, total - 2)];
    return m;
  });
})();

export const SERAPHINE: CharacterDef = {
  id: 'seraphine',
  name: 'Seraphine',
  archetype: 'mystical fast-poke',
  tagline: 'Needles, veils and a step that leaves you facing the wrong way.',
  stances: ['default'],
  tenHit: 'ten1',
  look: {
    palette: { skin: 0xe8c9b0, top: 0x6a2c91, pants: 0x1b1530, belt: 0xc9a7ff, gloves: 0x4b1f6e, boots: 0x1b1530, hair: 0xd8d0ff },
    hair: 'long', heightScale: 0.97, bulk: 0.85,
  },
  stats: {
    hp: 170, height: 1727,
    walkF: 28, walkB: 24,
    dashSpeed: 66, dashFrames: 11,
    backdashSpeed: 74, backdashFrames: 7, backdashRecovery: 7,
    sidestepDist: 800, sidestepFrames: 13, sidestepWeakScale: 75, strongSide: 'right',
    pushRadius: 320, weight: 90, jumpVy: 62, gravity: 5,
  },
  hurtboxes: STANDARD_HURTBOXES,
  moves: [...ROOT, ...EXTRA, ...TEN],
};
