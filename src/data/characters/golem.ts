import type { AnimSpec, CapsuleDef, CharacterDef, FollowupDef, HitDef, HitLevel, MoveDef, ThrowDef } from '@/sim/types';
import { STANDARD_HURTBOXES, cap, kickBox, punchBox } from './greybox';

/*
 * Golem: the giant boss. Slow, telegraphed unblockables, armour on big swings,
 * enormous reach, ground-pound stomps that hit grounded opponents. Weight 150 keeps
 * it from being launched high.
 */

const PUNCHES = new Set<AnimSpec['type']>(['jab', 'straight', 'hook', 'uppercut', 'elbow', 'backfist', 'hammer', 'palm', 'doublePunch', 'powerCrush']);
type HitArgs = Pick<HitDef, 'frames' | 'level' | 'damage' | 'onBlock' | 'onHit' | 'reaction'> & Partial<HitDef>;
const PY = { high: 1650, mid: 1300, low: 550 } as const;
const KY = { high: 1600, mid: 1150, low: 400 } as const;

/** Authored fallback capsule (giant proportions); the baker replaces it with pose capsules. */
function box(a: AnimSpec, level: HitLevel): CapsuleDef {
  const side = (a.limb ?? 'R') === 'L' ? 140 : -140;
  const h = a.height ?? (level === 'high' ? 'high' : level === 'low' ? 'low' : 'mid');
  return PUNCHES.has(a.type) ? punchBox(side, PY[h], 1300, 190) : kickBox(side, KY[h], 1750, 210);
}
function S(id: string, name: string, input: string, anim: AnimSpec, total: number, hits: HitArgs | HitArgs[], m: Partial<MoveDef> = {}): MoveDef {
  const list = Array.isArray(hits) ? hits : [hits];
  return { id, name, input, anim, total, ...m, hits: list.map((h) => ({ pushback: 160, pushbackBlock: 200, capsules: [box(anim, h.level)], ...h })) };
}
const F = (moveId: string, cancelFrame: number, windowEnd: number): FollowupDef => ({ moveId, cancelFrame, windowEnd });
const CR = (end: number): NonNullable<MoveDef['pose']> => [{ frames: [0, end], pose: 'crouch' }];
const LAUNCH = (frames: [number, number], damage: number, onBlock: number, launchVy = 108, launchVz = 6): HitArgs =>
  ({ frames, level: 'mid', damage, onBlock, onHit: 0, reaction: 'launch', launchVy, launchVz });
function T(id: string, name: string, input: string, t: Pick<ThrowDef, 'breakButton' | 'damage' | 'result'> & Partial<ThrowDef>, m: Partial<MoveDef> = {}): MoveDef {
  return { id, name, input, total: 42, anim: { type: 'throw' }, hits: [], ...m, throw: { breakWindow: 12, duration: 64, grabFrame: 12, range: 1200, endOffset: 1500, ...t } };
}
/** Unblockable: startup >= 40, telegraphed, big damage. */
const UNBLOCK = (frames: [number, number], damage: number, onBlock: number, onHit: number, reaction: HitDef['reaction']): HitArgs =>
  ({ frames, level: 'unblockable', damage, onBlock, onHit, reaction, pushback: 400, pushbackBlock: 400, hitstop: 14 });
/** Ground-pound capsule: a wide low slab in front of the feet, so stomps cover a lying body. */
const STOMP = cap(0, 150, 300, 0, 250, 1500, 320);

const ROOT: MoveDef[] = [
  S('jab', 'Pebble Jab', '1', { type: 'jab', limb: 'L' }, 22, { frames: [10, 11], level: 'high', damage: 8, onBlock: 1, onHit: 8, reaction: 'light' },
    { followups: [F('jab_2', 12, 20)] }),
  S('straight', 'Boulder Fist', '2', { type: 'straight', limb: 'R' }, 26, { frames: [12, 13], level: 'high', damage: 14, onBlock: -2, onHit: 6, reaction: 'medium' },
    { followups: [F('straight_2', 14, 24)] }),
  S('k3', 'Slab Kick', '3', { type: 'front', limb: 'L' }, 34, { frames: [15, 17], level: 'mid', damage: 18, onBlock: -9, onHit: 3, reaction: 'heavy', pushback: 320, pushbackBlock: 340 }),
  S('k4', 'Quarry Boot', '4', { type: 'front', limb: 'R' }, 36, { frames: [16, 18], level: 'mid', damage: 20, onBlock: -10, onHit: 4, reaction: 'heavy', chReaction: 'knockdown', pushback: 360, pushbackBlock: 360 },
    { properties: ['wallSplat'], followups: [F('k4_4', 19, 34)] }),
  S('f1', 'Rockfall Cascade', 'f+1', { type: 'jab', limb: 'L' }, 24, { frames: [11, 12], level: 'high', damage: 9, onBlock: 0, onHit: 7, reaction: 'light' },
    { properties: ['tenHit'], followups: [F('ten2', 13, 22)] }),
  S('f2', 'Granite Ram', 'f+2', { type: 'straight', limb: 'R' }, 36, { frames: [16, 17], level: 'mid', damage: 22, onBlock: -8, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 380, pushbackBlock: 360 },
    { armour: [4, 15], motion: [{ frames: [1, 12], forward: 18 }] }),
  S('f3', 'Battering Shin', 'f+3', { type: 'front', limb: 'L' }, 32, { frames: [14, 16], level: 'mid', damage: 16, onBlock: -7, onHit: 4, reaction: 'medium', pushback: 280 }),
  S('f4', 'Tremor Kick', 'f+4', { type: 'round', limb: 'R' }, 38, { frames: [16, 18], level: 'mid', damage: 22, onBlock: -9, onHit: 5, reaction: 'heavy', chReaction: 'knockdown', pushback: 380, pushbackBlock: 380 }),
  S('df1', 'Rubble Jab', 'd/f+1', { type: 'jab', limb: 'L' }, 28, { frames: [14, 15], level: 'mid', damage: 12, onBlock: -3, onHit: 6, reaction: 'light' },
    { followups: [F('df1_2', 16, 26)] }),
  S('df2', 'Mountain Uppercut', 'd/f+2', { type: 'uppercut', limb: 'R' }, 40, LAUNCH([16, 17], 18, -14, 108, 6),
    { motion: [{ frames: [1, 14], forward: 22 }], properties: ['launcher'] }),
  S('df3', 'Crag Thrust', 'd/f+3', { type: 'side', limb: 'L' }, 34, { frames: [15, 17], level: 'mid', damage: 17, onBlock: -8, onHit: 4, reaction: 'medium', pushback: 300, pushbackBlock: 320 }),
  S('df4', 'Landslide Boot', 'd/f+4', { type: 'side', limb: 'R' }, 40, { frames: [17, 19], level: 'mid', damage: 22, onBlock: -11, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 400, pushbackBlock: 400 }),
  S('d1', 'Low Pebble', 'd+1', { type: 'jab', limb: 'L' }, 22, { frames: [11, 12], level: 'smid', damage: 6, onBlock: -5, onHit: 6, reaction: 'crouchLight' }, { pose: CR(21) }),
  S('d2', 'Stone Hammer', 'd+2', { type: 'hammer', limb: 'R' }, 38, { frames: [16, 17], level: 'mid', damage: 18, onBlock: -8, onHit: 3, reaction: 'bound', capsules: [STOMP] },
    { pose: CR(37), properties: ['bound', 'hitsGrounded'] }),
  S('d3', 'Ankle Crusher', 'd+3', { type: 'low', limb: 'L' }, 32, { frames: [14, 16], level: 'low', damage: 12, onBlock: -14, onHit: 1, reaction: 'crouchLight' }, { pose: CR(31) }),
  S('d4', 'Shin Breaker', 'd+4', { type: 'low', limb: 'R' }, 36, { frames: [16, 18], level: 'low', damage: 15, onBlock: -15, onHit: 2, reaction: 'crouchMedium', chReaction: 'trip' }, { pose: CR(35) }),
  S('db3', 'Foundation Sweep', 'd/b+3', { type: 'sweep', limb: 'L' }, 50, { frames: [18, 20], level: 'low', damage: 22, onBlock: -26, onHit: 0, reaction: 'trip', pushback: 240 }, { pose: CR(45) }),
  S('db4', 'Heel Quake', 'd/b+4', { type: 'low', limb: 'R' }, 48, { frames: [20, 22], level: 'low', damage: 24, onBlock: -20, onHit: 4, reaction: 'crouchMedium', chReaction: 'trip' }, { pose: CR(46) }),
  S('b1', 'Backhand Boulder', 'b+1', { type: 'backfist', limb: 'L' }, 32, { frames: [14, 15], level: 'high', damage: 18, onBlock: -6, onHit: 6, reaction: 'heavy', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5, pushback: 300 },
    { properties: ['homing'], followups: [F('b1_2', 16, 30)] }),
  S('b2', 'Stone Palm', 'b+2', { type: 'palm', limb: 'R' }, 34, { frames: [15, 16], level: 'mid', damage: 20, onBlock: -7, onHit: 5, reaction: 'heavy', chReaction: 'stagger', pushback: 380, pushbackBlock: 380 }),
  S('b3', 'Mill Wheel', 'b+3', { type: 'spinBack', limb: 'L' }, 44, { frames: [20, 22], level: 'mid', damage: 26, onBlock: -10, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 440, pushbackBlock: 440 },
    { properties: ['homing'] }),
  S('b4', 'Thunder Stomp', 'b+4', { type: 'axe', limb: 'R' }, 46, { frames: [20, 22], level: 'mid', damage: 24, onBlock: -12, onHit: 4, reaction: 'heavy', chReaction: 'bound', capsules: [STOMP] },
    { properties: ['hitsGrounded'] }),
  S('b12', 'Monolith Crush', 'b+1+2', { type: 'powerCrush' }, 48, { frames: [20, 21], level: 'mid', damage: 28, onBlock: -14, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', pushback: 400, pushbackBlock: 420 },
    { armour: [6, 19], properties: ['powerCrush'] }),
  S('f12', 'Earthbreaker', 'f+1+2', { type: 'hammer', limb: 'R' }, 70, UNBLOCK([44, 46], 40, -20, 10, 'knockdown'),
    { armour: [10, 40], properties: ['unblockable', 'hitsGrounded'], motion: [{ frames: [20, 40], forward: 10 }] }),
  S('db12', 'Grave Digger', 'd/b+1+2', { type: 'hammer', limb: 'L' }, 66, { ...UNBLOCK([42, 44], 36, -18, 8, 'trip'), capsules: [STOMP] },
    { pose: CR(64), properties: ['unblockable', 'hitsGrounded'] }),
  S('uf12', 'Sky Hammer', 'u/f+1+2', { type: 'hammer', limb: 'R' }, 64, UNBLOCK([40, 42], 35, -18, 12, 'crumple'),
    { crush: [{ level: 'low', frames: [1, 30] }], motion: [{ frames: [8, 30], forward: 16 }], properties: ['unblockable', 'lowCrush', 'jumpAttack'] }),
  S('ff2', 'Avalanche Charge', 'f,f+2', { type: 'straight', limb: 'R' }, 42, { frames: [18, 19], level: 'mid', damage: 27, onBlock: -12, onHit: 12, reaction: 'heavy', chReaction: 'knockdown', pushback: 450, pushbackBlock: 400 },
    { armour: [4, 16], motion: [{ frames: [1, 14], forward: 40 }], properties: ['wallSplat'] }),
  S('ff3', 'Rolling Boulder', 'f,f+3', { type: 'hop', limb: 'L' }, 46, { frames: [17, 19], level: 'mid', damage: 26, onBlock: -12, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 380 },
    { crush: [{ level: 'low', frames: [3, 20] }], motion: [{ frames: [1, 16], forward: 26 }], properties: ['lowCrush', 'jumpAttack'] }),
  S('ff4', 'Colossus Stomp', 'f,f+4', { type: 'axe', limb: 'R' }, 50, { frames: [22, 24], level: 'mid', damage: 28, onBlock: -13, onHit: 5, reaction: 'bound', capsules: [STOMP] },
    { motion: [{ frames: [1, 12], forward: 30 }], properties: ['bound', 'hitsGrounded'] }),
  S('uf3', 'Quarry Leap', 'u/f+3', { type: 'hop', limb: 'L' }, 46, LAUNCH([16, 18], 20, -13, 100, 6),
    { crush: [{ level: 'low', frames: [1, 26] }], motion: [{ frames: [1, 16], forward: 14 }], properties: ['launcher', 'lowCrush', 'jumpAttack'] }),
  S('uf4', 'Meteor Drop', 'u/f+4', { type: 'hop', limb: 'R' }, 52, { frames: [20, 22], level: 'mid', damage: 30, onBlock: -14, onHit: 4, reaction: 'knockdown', pushback: 300 },
    { crush: [{ level: 'low', frames: [1, 30] }], motion: [{ frames: [1, 20], forward: 14 }], properties: ['hitsGrounded', 'lowCrush', 'jumpAttack', 'knockdown'] }),
  S('qcf2', 'Fault Line', 'qcf+2', { type: 'uppercut', limb: 'R' }, 40, LAUNCH([15, 16], 20, -13, 104, 7),
    { motion: [{ frames: [1, 13], forward: 26 }], properties: ['launcher'] }),
  S('p12', 'Twin Slabs', '1+2', { type: 'doublePunch' }, 38, { frames: [16, 17], level: 'mid', damage: 24, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'stagger', pushback: 400, pushbackBlock: 400 }),
  S('k34', 'Seismic Hop', '3+4', { type: 'hop', limb: 'R' }, 50, { frames: [18, 20], level: 'mid', damage: 24, onBlock: -12, onHit: 2, reaction: 'screw', pushback: 320 },
    { crush: [{ level: 'low', frames: [1, 24] }], properties: ['screw', 'lowCrush', 'jumpAttack'] }),
  S('df34', 'Low Quake', 'd/f+3+4', { type: 'low', limb: 'R' }, 44, { frames: [18, 20], level: 'low', damage: 20, onBlock: -17, onHit: 3, reaction: 'crouchMedium', chReaction: 'trip' },
    { pose: CR(42), properties: ['hitsGrounded'] }),
  S('b34', 'Rampart Knee Drop', 'b+3+4', { type: 'axe', limb: 'L' }, 48, { frames: [21, 23], level: 'mid', damage: 26, onBlock: -13, onHit: 6, reaction: 'heavy', chReaction: 'crumple', capsules: [STOMP] },
    { armour: [6, 20], properties: ['hitsGrounded'] }),
  T('throw13', 'Boulder Toss', '1+3', { breakButton: 1, damage: 40, result: 'knockdown', breakWindow: 14, endOffset: 1700 }),
  T('throw24', 'Gravel Slam', '2+4', { breakButton: 2, damage: 40, result: 'faceDown', breakWindow: 14, duration: 60 }),
  T('throw12', 'Mountain Press', 'd/f+1+2', { breakButton: 12, damage: 45, result: 'knockdown', duration: 76, endOffset: 1000, grabsCrouching: true }, { total: 44 }),
  T('throwff13', 'Landslide Tackle', 'f,f+1+3', { breakButton: 1, damage: 42, result: 'knockdown', grabFrame: 14, range: 1300, endOffset: 1900 },
    { total: 48, motion: [{ frames: [1, 13], forward: 50 }] }),
  T('throwdb13', 'Grave Lift', 'd/b+1+3', { breakButton: 1, damage: 30, result: 'faceDown', duration: 58, grabFrame: 16, range: 1100, endOffset: 1200, grabsLying: true, grabsCrouching: true },
    { total: 46, pose: CR(44) }),
];

const EXTRA: MoveDef[] = [
  S('jab_2', 'Pebble, Boulder', '1,2', { type: 'straight', limb: 'R' }, 26, { frames: [10, 11], level: 'high', damage: 14, onBlock: -3, onHit: 6, reaction: 'heavy' },
    { cmd: '2', followups: [F('jab_2_1', 12, 24)] }),
  S('jab_2_1', 'Rockslide Hook', '1,2,1', { type: 'hook', limb: 'L' }, 34, { frames: [12, 13], level: 'mid', damage: 20, onBlock: -10, onHit: 4, reaction: 'heavy', chReaction: 'knockdown', pushback: 300 }, { cmd: '1' }),
  S('straight_2', 'Twin Boulders', '2,2', { type: 'hammer', limb: 'R' }, 36, { frames: [14, 15], level: 'mid', damage: 18, onBlock: -8, onHit: 4, reaction: 'heavy', chReaction: 'bound', capsules: [STOMP] },
    { cmd: '2', properties: ['hitsGrounded'] }),
  S('k4_4', 'Quarry Boot, Shin Split', '4,4', { type: 'low', limb: 'R' }, 38, { frames: [16, 18], level: 'low', damage: 16, onBlock: -15, onHit: 2, reaction: 'crouchMedium' }, { cmd: '4' }),
  S('df1_2', 'Rubble, Boulder', 'd/f+1,2', { type: 'straight', limb: 'R' }, 32, { frames: [12, 13], level: 'mid', damage: 16, onBlock: -8, onHit: 4, reaction: 'heavy', chReaction: 'stagger', pushback: 300 }, { cmd: '2' }),
  S('b1_2', 'Backhand, Crush', 'b+1,2', { type: 'hammer', limb: 'R' }, 40, { frames: [16, 17], level: 'mid', damage: 20, onBlock: -10, onHit: 3, reaction: 'bound', capsules: [STOMP] },
    { cmd: '2', properties: ['bound', 'hitsGrounded'] }),
  S('ws1', 'Rising Rubble', 'WS 1', { type: 'jab', limb: 'L' }, 28, { frames: [13, 14], level: 'mid', damage: 12, onBlock: -3, onHit: 6, reaction: 'light' }, { cmd: '1', conditions: ['ws'] }),
  S('ws2', 'Rising Monolith', 'WS 2', { type: 'uppercut', limb: 'R' }, 40, LAUNCH([16, 17], 16, -13, 104, 6),
    { cmd: '2', conditions: ['ws'], motion: [{ frames: [1, 14], forward: 22 }], properties: ['launcher'] }),
  S('ws4', 'Rising Slab', 'WS 4', { type: 'rising', limb: 'R' }, 34, { frames: [13, 15], level: 'mid', damage: 18, onBlock: -8, onHit: 4, reaction: 'medium', pushback: 300 }, { cmd: '4', conditions: ['ws'] }),
  S('fc1', 'Crouch Pebble', 'FC 1', { type: 'jab', limb: 'L' }, 22, { frames: [11, 12], level: 'smid', damage: 6, onBlock: -5, onHit: 6, reaction: 'crouchLight' }, { cmd: '1', conditions: ['crouch'], pose: CR(21) }),
  S('fc3', 'Crouch Ankle Crusher', 'FC 3', { type: 'low', limb: 'L' }, 32, { frames: [14, 16], level: 'low', damage: 12, onBlock: -14, onHit: 1, reaction: 'crouchLight' }, { cmd: '3', conditions: ['crouch'], pose: CR(31) }),
  S('fc_df2', 'Crouching Fault', 'FC d/f+2', { type: 'uppercut', limb: 'R' }, 40, LAUNCH([15, 16], 16, -14, 100, 6),
    { cmd: 'd/f+2', conditions: ['crouch'], pose: CR(14), properties: ['launcher'] }),
  S('ground3', 'Floor Rubble Sweep', 'lying 3', { type: 'ground', limb: 'L' }, 42, { frames: [15, 18], level: 'low', damage: 14, onBlock: -16, onHit: 2, reaction: 'crouchLight' }, { cmd: '3', conditions: ['lying'], pose: CR(20) }),
  S('ground4', 'Floor Boulder Kick', 'lying 4', { type: 'ground', limb: 'R' }, 44, { frames: [17, 20], level: 'mid', damage: 18, onBlock: -14, onHit: 4, reaction: 'medium', pushback: 300 }, { cmd: '4', conditions: ['lying'], pose: CR(20) }),
  S('ss2', 'Side Boulder', 'SS 2', { type: 'hook', limb: 'R' }, 38, { frames: [16, 17], level: 'high', damage: 24, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 380 },
    { cmd: '2', conditions: ['ss'], properties: ['homing'] }),
  S('ss4', 'Side Stomp', 'SS 4', { type: 'axe', limb: 'R' }, 44, { frames: [18, 20], level: 'mid', damage: 22, onBlock: -12, onHit: 3, reaction: 'heavy', chReaction: 'bound', capsules: [STOMP] },
    { cmd: '4', conditions: ['ss'], properties: ['hitsGrounded'] }),
  S('air4', 'Falling Boulder', 'u 4', { type: 'front', limb: 'R' }, 34, { frames: [10, 16], level: 'mid', damage: 20, onBlock: -6, onHit: 6, reaction: 'medium', pushback: 300 }, { cmd: '4', conditions: ['air'], landFrame: 22 }),
  S('wr2', 'Running Avalanche', 'WR 2', { type: 'straight', limb: 'R' }, 40, { frames: [14, 15], level: 'mid', damage: 30, onBlock: -8, onHit: 12, reaction: 'heavy', chReaction: 'knockdown', pushback: 460, pushbackBlock: 420 },
    { cmd: '2', conditions: ['run'], armour: [1, 13], properties: ['wallSplat'] }),
];

/** Ten-hit string: Rockfall Cascade (f+1, 2, 1, 2, 3, 4, 1, 2, 4, 1+2). Link 1 is `f1` in ROOT. */
const TEN: MoveDef[] = (() => {
  const links: [string, AnimSpec, number, HitArgs][] = [
    ['2', { type: 'straight', limb: 'R' }, 26, { frames: [10, 11], level: 'high', damage: 12, onBlock: -2, onHit: 6, reaction: 'medium' }],
    ['1', { type: 'hook', limb: 'L' }, 28, { frames: [11, 12], level: 'mid', damage: 12, onBlock: -4, onHit: 4, reaction: 'medium' }],
    ['2', { type: 'uppercut', limb: 'R' }, 30, { frames: [12, 13], level: 'mid', damage: 14, onBlock: -6, onHit: 3, reaction: 'medium' }],
    ['3', { type: 'low', limb: 'L' }, 32, { frames: [13, 15], level: 'low', damage: 12, onBlock: -12, onHit: 0, reaction: 'crouchLight' }],
    ['4', { type: 'front', limb: 'R' }, 34, { frames: [14, 16], level: 'mid', damage: 16, onBlock: -8, onHit: 2, reaction: 'heavy' }],
    ['1', { type: 'backfist', limb: 'L' }, 30, { frames: [12, 13], level: 'high', damage: 14, onBlock: -5, onHit: 4, reaction: 'medium' }],
    ['2', { type: 'palm', limb: 'R' }, 32, { frames: [13, 14], level: 'mid', damage: 16, onBlock: -7, onHit: 3, reaction: 'heavy' }],
    ['4', { type: 'axe', limb: 'R' }, 38, { frames: [16, 18], level: 'mid', damage: 18, onBlock: -10, onHit: 2, reaction: 'heavy' }],
    ['1+2', { type: 'doublePunch' }, 50, { frames: [20, 21], level: 'mid', damage: 30, onBlock: -14, onHit: 8, reaction: 'knockdown', pushback: 420, pushbackBlock: 420 }],
  ];
  const names = ['Second Rock', 'Third Rock', 'Fourth Rock', 'Fifth Rock', 'Sixth Rock', 'Seventh Rock', 'Eighth Rock', 'Ninth Rock', 'Tenth Rock: Cascade'];
  let seq = 'f+1';
  return links.map(([btn, anim, total, h], i) => {
    seq += `,${btn}`;
    const m = S(`ten${i + 2}`, names[i] ?? '', seq, anim, total, h, { cmd: btn, properties: ['tenHit'] });
    if (i < links.length - 1) m.followups = [F(`ten${i + 3}`, h.frames[1] + 1, total - 2)];
    return m;
  });
})();

export const GOLEM: CharacterDef = {
  id: 'golem',
  name: 'Golem',
  archetype: 'giant boss',
  tagline: 'A walking landslide. Nothing it swings can be blocked forever.',
  stances: ['default'],
  tenHit: 'f1',
  look: {
    palette: { skin: 0x6f6f6f, top: 0x5c5c5c, pants: 0x4a4a4a, belt: 0x3a3a3a, gloves: 0x6f6f6f, boots: 0x505050, hair: 0x6f6f6f },
    hair: 'none', heightScale: 1.25, bulk: 1.3, heavy: true,
  },
  anim: { stance: 'golem', intro: 'awaken', win: 'slam' },
  stats: {
    hp: 170, height: 2225,
    walkF: 16, walkB: 14,
    dashSpeed: 50, dashFrames: 14,
    backdashSpeed: 52, backdashFrames: 8, backdashRecovery: 10,
    sidestepDist: 500, sidestepFrames: 16, sidestepWeakScale: 70, strongSide: 'right',
    pushRadius: 460, weight: 150, jumpVy: 60, gravity: 5,
  },
  hurtboxes: STANDARD_HURTBOXES,
  moves: [...ROOT, ...EXTRA, ...TEN],
};
