import type { CapsuleDef, CharacterDef, HitDef, MoveDef } from '@/sim/types';

/** Shared capsule helpers for data authoring (mm). */
export const cap = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): CapsuleDef => ({ ax, ay, az, bx, by, bz, r });

export const STANDARD_HURTBOXES: CharacterDef['hurtboxes'] = {
  stand: [cap(0, 300, 0, 0, 1480, 0, 280)],
  crouch: [cap(0, 250, 50, 0, 880, 50, 280)],
  air: [cap(0, 300, 0, 0, 1480, 0, 280)],
  lying: [cap(0, 150, -500, 0, 150, 500, 220)],
};

/** Standard fist / foot hit capsule generators (right-handed fighter, forward = +z). */
export const punchBox = (side: number, y: number, reach: number, r = 150): CapsuleDef => cap(side, y, 250, side, y, reach, r);
export const kickBox = (side: number, y: number, reach: number, r = 170): CapsuleDef => cap(side, y, 300, side, y + 50, reach, r);

export function hit(partial: Partial<HitDef> & Pick<HitDef, 'frames' | 'level' | 'damage' | 'onBlock' | 'onHit' | 'reaction' | 'capsules'>): HitDef {
  return { pushback: 120, pushbackBlock: 160, ...partial };
}

/**
 * The grey-box test fighter: a generic, well-rounded move list used for the
 * combat-core phases and as the baseline for the real roster.
 */
export const GREYBOX_MOVES: MoveDef[] = [
  { id: 'jab', name: 'Jab', input: '1', total: 20,
    hits: [hit({ frames: [10, 11], level: 'high', damage: 7, onBlock: 1, onHit: 8, reaction: 'light', capsules: [punchBox(120, 1350, 1000)] })],
    followups: [{ moveId: 'jab_2', cancelFrame: 12, windowEnd: 18 }] },
  { id: 'jab_2', name: 'Jab, Straight', input: '1,2', cmd: '2', total: 22,
    hits: [hit({ frames: [8, 9], level: 'high', damage: 10, onBlock: -1, onHit: 7, reaction: 'medium', capsules: [punchBox(-120, 1350, 1080)] })],
    followups: [{ moveId: 'jab_2_3', cancelFrame: 10, windowEnd: 19 }] },
  { id: 'jab_2_3', name: 'Jab, Straight, Kick', input: '1,2,3', cmd: '3', total: 34,
    hits: [hit({ frames: [14, 16], level: 'mid', damage: 17, onBlock: -8, onHit: 12, reaction: 'heavy', chReaction: 'knockdown', capsules: [kickBox(100, 1000, 1350)], pushback: 240 })] },
  { id: 'straight', name: 'Straight', input: '2', total: 23,
    hits: [hit({ frames: [11, 12], level: 'high', damage: 10, onBlock: -1, onHit: 6, reaction: 'light', capsules: [punchBox(-120, 1350, 1080)] })],
    followups: [{ moveId: 'straight_1', cancelFrame: 13, windowEnd: 20 }] },
  { id: 'straight_1', name: 'Straight, Hook', input: '2,1', cmd: '1', total: 26,
    hits: [hit({ frames: [10, 11], level: 'high', damage: 12, onBlock: -3, onHit: 5, reaction: 'medium', capsules: [punchBox(160, 1380, 1000)] })] },
  { id: 'd1', name: 'Crouch Jab', input: 'd+1', conditions: ['crouch'], total: 20, pose: [{ frames: [0, 19], pose: 'crouch' }],
    hits: [hit({ frames: [10, 11], level: 'smid', damage: 5, onBlock: -5, onHit: 6, reaction: 'crouchLight', capsules: [punchBox(120, 900, 950)] })] },
  { id: 'd1s', name: 'Low Jab', input: 'd+1', total: 22, pose: [{ frames: [0, 21], pose: 'crouch' }],
    hits: [hit({ frames: [11, 12], level: 'smid', damage: 5, onBlock: -5, onHit: 6, reaction: 'crouchLight', capsules: [punchBox(120, 900, 950)] })] },
  { id: 'd4', name: 'Low Kick', input: 'd+4', total: 28, pose: [{ frames: [0, 27], pose: 'crouch' }],
    hits: [hit({ frames: [12, 14], level: 'low', damage: 10, onBlock: -13, onHit: 1, reaction: 'crouchLight', capsules: [kickBox(-80, 350, 1450)] })] },
  { id: 'd4fc', name: 'Low Kick', input: 'd+4', conditions: ['crouch'], total: 28, pose: [{ frames: [0, 27], pose: 'crouch' }],
    hits: [hit({ frames: [12, 14], level: 'low', damage: 10, onBlock: -13, onHit: 1, reaction: 'crouchLight', capsules: [kickBox(-80, 350, 1450)] })] },
  { id: 'db3', name: 'Sweep', input: 'd/b+3', total: 46, pose: [{ frames: [0, 41], pose: 'crouch' }],
    hits: [hit({ frames: [16, 18], level: 'low', damage: 18, onBlock: -26, onHit: 0, reaction: 'trip', capsules: [kickBox(80, 300, 1550)], pushback: 200 })] },
  { id: 'f2', name: 'Elbow', input: 'f+2', total: 30,
    hits: [hit({ frames: [14, 15], level: 'mid', damage: 14, onBlock: -3, onHit: 6, onCH: 10, reaction: 'medium', chReaction: 'stagger', capsules: [punchBox(-100, 1150, 1000, 170)] })] },
  { id: 'df1', name: 'Mid Poke', input: 'd/f+1', total: 26,
    hits: [hit({ frames: [13, 14], level: 'mid', damage: 10, onBlock: -2, onHit: 7, reaction: 'light', capsules: [punchBox(120, 1100, 1050)] })],
    followups: [{ moveId: 'df1_2', cancelFrame: 15, windowEnd: 22 }] },
  { id: 'df1_2', name: 'Mid Poke, Uppercut', input: 'd/f+1,2', cmd: '2', total: 32,
    hits: [hit({ frames: [12, 13], level: 'mid', damage: 14, onBlock: -9, onHit: 4, reaction: 'medium', chReaction: 'launch', capsules: [punchBox(-120, 1200, 1050)], launchVy: 100, launchVz: 6 })] },
  { id: 'df2', name: 'Launcher', input: 'd/f+2', total: 35,
    hits: [hit({ frames: [15, 16], level: 'mid', damage: 15, onBlock: -13, onHit: 0, reaction: 'launch', capsules: [punchBox(-130, 1250, 1100, 170)], launchVy: 110, launchVz: 7 })] },
  { id: 'k3', name: 'Front Kick', input: '3', total: 32,
    hits: [hit({ frames: [14, 16], level: 'mid', damage: 15, onBlock: -9, onHit: 2, reaction: 'medium', capsules: [kickBox(90, 1050, 1500)], pushback: 260, pushbackBlock: 300 })] },
  { id: 'k4', name: 'High Kick', input: '4', total: 31,
    hits: [hit({ frames: [12, 14], level: 'high', damage: 16, onBlock: -9, onHit: 3, reaction: 'medium', chReaction: 'launch', capsules: [kickBox(-90, 1400, 1550)], pushback: 220, launchVy: 104, launchVz: 6 })] },
  { id: 'uf4', name: 'Hop Kick', input: 'u/f+4', total: 42, crush: [{ level: 'low', frames: [1, 24] }],
    motion: [{ frames: [1, 18], forward: 12 }],
    hits: [hit({ frames: [15, 17], level: 'mid', damage: 20, onBlock: -13, onHit: 0, reaction: 'launch', capsules: [kickBox(-90, 1300, 1450)], launchVy: 120, launchVz: 8 })],
    properties: ['launcher', 'jumpAttack', 'lowCrush'] },
  { id: 'ff2', name: 'Dash Punch', input: 'f,f+2', total: 38, motion: [{ frames: [1, 12], forward: 30 }],
    hits: [hit({ frames: [16, 17], level: 'mid', damage: 25, onBlock: -8, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', capsules: [punchBox(-120, 1200, 1150, 180)], pushback: 400, pushbackBlock: 350 })],
    properties: ['wallSplat'] },
  { id: 'qcf1', name: 'Rising Palm', input: 'qcf+1', total: 36, motion: [{ frames: [1, 8], forward: 18 }],
    hits: [hit({ frames: [13, 14], level: 'mid', damage: 18, onBlock: -10, onHit: 4, reaction: 'medium', chReaction: 'launch', capsules: [punchBox(120, 1250, 1050, 180)], launchVy: 100, launchVz: 6 })] },
  { id: 'cd2', name: 'Thunder Fist', input: 'f,n,d,d/f+2', total: 40, justFrame: 1, motion: [{ frames: [1, 6], forward: 25 }],
    hits: [hit({ frames: [14, 15], level: 'mid', damage: 20, onBlock: -12, onHit: 0, reaction: 'launch', capsules: [punchBox(-120, 1300, 1100, 180)], launchVy: 114, launchVz: 7 })],
    properties: ['launcher', 'justFrame'] },
  { id: 'cd2_jf', name: 'Thunder Fist (JF)', input: 'f,n,d,d/f+2', cmd: 'f,n,d,d/f+2', total: 36, motion: [{ frames: [1, 6], forward: 25 }],
    hits: [hit({ frames: [11, 12], level: 'mid', damage: 24, onBlock: 5, onHit: 0, reaction: 'launchHigh', capsules: [punchBox(-120, 1300, 1150, 200)], launchVy: 124, launchVz: 8, pushbackBlock: 500 })],
    properties: ['launcher', 'justFrame'] },
  { id: 'b12', name: 'Power Crush', input: 'b+1+2', total: 44, armour: [6, 18],
    hits: [hit({ frames: [19, 20], level: 'mid', damage: 24, onBlock: -14, onHit: 8, reaction: 'heavy', chReaction: 'knockdown', capsules: [punchBox(0, 1200, 1100, 220)], pushback: 380, pushbackBlock: 400 })],
    properties: ['powerCrush'] },
  { id: 'ws2', name: 'Rising Uppercut', input: 'WS 2', cmd: '2', conditions: ['ws'], total: 36,
    hits: [hit({ frames: [15, 16], level: 'mid', damage: 14, onBlock: -12, onHit: 0, reaction: 'launch', capsules: [punchBox(-120, 1250, 1050, 170)], launchVy: 104, launchVz: 6 })],
    properties: ['launcher'] },
  { id: 'ws4', name: 'Rising Kick', input: 'WS 4', cmd: '4', conditions: ['ws'], total: 30,
    hits: [hit({ frames: [11, 13], level: 'mid', damage: 14, onBlock: -6, onHit: 5, reaction: 'medium', capsules: [kickBox(-90, 1100, 1400)] })] },
  { id: 'ss2', name: 'Step Hook', input: 'SS 2', cmd: '2', conditions: ['ss'], total: 34,
    hits: [hit({ frames: [15, 16], level: 'high', damage: 20, onBlock: -9, onHit: 6, reaction: 'heavy', chReaction: 'spinLaunch', capsules: [punchBox(-130, 1350, 1150, 180)], launchVy: 96, launchVz: 8 })],
    properties: ['homing'] },
  { id: 'air3', name: 'Jump Kick', input: 'u 3', cmd: '3', conditions: ['air'], total: 30, landFrame: 20,
    hits: [hit({ frames: [8, 14], level: 'mid', damage: 14, onBlock: -4, onHit: 6, reaction: 'medium', capsules: [kickBox(60, 700, 1200)] })] },
  { id: 'fc3', name: 'Crouch Kick', input: 'FC 3', cmd: '3', conditions: ['crouch'], total: 30, pose: [{ frames: [0, 29], pose: 'crouch' }],
    hits: [hit({ frames: [12, 14], level: 'low', damage: 9, onBlock: -11, onHit: 2, reaction: 'crouchLight', capsules: [kickBox(90, 350, 1400)] })] },
  { id: 'd2', name: 'Hammer Fist', input: 'd+2', total: 34, pose: [{ frames: [0, 33], pose: 'crouch' }],
    hits: [hit({ frames: [15, 16], level: 'mid', damage: 14, onBlock: -6, onHit: 3, reaction: 'bound', capsules: [punchBox(-100, 950, 1000, 180)] })],
    properties: ['bound'] },
  { id: 'f4', name: 'Spin Kick', input: 'f+4', total: 36,
    hits: [hit({ frames: [15, 17], level: 'mid', damage: 18, onBlock: -9, onHit: 4, reaction: 'screw', capsules: [kickBox(-100, 1100, 1500, 180)], pushback: 300 })],
    properties: ['screw'] },
  { id: 'parry', name: 'Parry', input: 'b+1+3', total: 30, hits: [],
    parry: { frames: [2, 14], levels: ['high', 'mid'], stagger: 24 }, properties: ['parry'] },
  { id: 'throw13', name: 'Shoulder Toss', input: '1+3', total: 40, hits: [],
    throw: { breakButton: 1, breakWindow: 14, duration: 60, damage: 35, grabFrame: 12, range: 1050, result: 'knockdown', endOffset: 1400 } },
  { id: 'throw24', name: 'Neck Snap', input: '2+4', total: 40, hits: [],
    throw: { breakButton: 2, breakWindow: 14, duration: 56, damage: 35, grabFrame: 12, range: 1050, result: 'faceDown', endOffset: 1300 } },
  { id: 'throw12', name: 'Spine Buster', input: 'd/f+1+2', total: 42, hits: [],
    throw: { breakButton: 12, breakWindow: 12, duration: 70, damage: 42, grabFrame: 12, range: 1050, result: 'knockdown', endOffset: 900, grabsCrouching: true } },
  { id: 'throwff13', name: 'Running Tackle', input: 'f,f+1+3', total: 46, hits: [], motion: [{ frames: [1, 13], forward: 60 }],
    throw: { breakButton: 1, breakWindow: 12, duration: 64, damage: 38, grabFrame: 14, range: 1100, result: 'knockdown', endOffset: 1600 } },
  { id: 'ground3', name: 'Rising Sweep', input: 'lying 3', cmd: '3', conditions: ['lying'], total: 40, pose: [{ frames: [0, 20], pose: 'crouch' }],
    hits: [hit({ frames: [14, 17], level: 'low', damage: 12, onBlock: -16, onHit: 2, reaction: 'crouchLight', capsules: [kickBox(80, 300, 1500)] })] },
  { id: 'ground4', name: 'Rising Kick', input: 'lying 4', cmd: '4', conditions: ['lying'], total: 42, pose: [{ frames: [0, 20], pose: 'crouch' }],
    hits: [hit({ frames: [16, 19], level: 'mid', damage: 16, onBlock: -14, onHit: 4, reaction: 'medium', capsules: [kickBox(-80, 1000, 1450)] })] },
  { id: 'b4', name: 'Homing Kick', input: 'b+4', total: 40,
    hits: [hit({ frames: [20, 22], level: 'high', damage: 22, onBlock: -4, onHit: 14, reaction: 'heavy', chReaction: 'knockdown', capsules: [kickBox(-100, 1400, 1600, 190)], pushback: 420, pushbackBlock: 420 })],
    properties: ['homing'] },
];

export const GREYBOX: CharacterDef = {
  id: 'greybox',
  name: 'Grey Box',
  archetype: 'all-rounder',
  stats: {
    hp: 170, height: 1780,
    walkF: 24, walkB: 20,
    dashSpeed: 62, dashFrames: 12,
    backdashSpeed: 70, backdashFrames: 7, backdashRecovery: 8,
    sidestepDist: 520, sidestepFrames: 14, sidestepWeakScale: 75, strongSide: 'left',
    pushRadius: 340, weight: 100, jumpVy: 62, gravity: 5,
  },
  hurtboxes: STANDARD_HURTBOXES,
  moves: GREYBOX_MOVES,
};
