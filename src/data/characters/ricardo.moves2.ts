import type { AnimSpec, FollowupDef, MoveDef } from '@/sim/types';
import type { HitArgs } from './ricardo';

/** Authoring helpers handed over by ricardo.ts (a factory avoids a runtime import cycle). */
export interface StanceHelpers {
  S: (id: string, name: string, input: string, anim: AnimSpec, total: number, hits: HitArgs | HitArgs[], m?: Partial<MoveDef>) => MoveDef;
  F: (moveId: string, cancelFrame: number, windowEnd: number) => FollowupDef;
  tree: (ids: string[], cancelFrame: number, windowEnd: number) => FollowupDef[];
  LAUNCH: (frames: [number, number], damage: number, onBlock: number, launchVy?: number, launchVz?: number) => HitArgs;
  CR: (end: number) => NonNullable<MoveDef['pose']>;
  trees: { iron: string[]; silk: string[]; storm: string[] };
}

/**
 * Ricardo's three stance trees. `iron` = hard punches with armour, `silk` = soft
 * palms and evasion, `storm` = spinning kicks. Each tree has a stance-cancel move
 * (3+4) that shifts into the next stance, and most pokes keep the stance.
 */
export function ricardoStanceMoves({ S, F, tree, LAUNCH, CR, trees }: StanceHelpers): MoveDef[] {
  const iron = (stance: 'iron' = 'iron'): Partial<MoveDef> => ({ conditions: ['stance'], stance });
  const silk: Partial<MoveDef> = { conditions: ['stance'], stance: 'silk' };
  const storm: Partial<MoveDef> = { conditions: ['stance'], stance: 'storm' };
  return [
    // iron
    S('iron1', 'Iron Jab', 'IRON 1', { type: 'jab', limb: 'L' }, 20, { frames: [9, 10], level: 'high', damage: 8, onBlock: 1, onHit: 8, reaction: 'light' },
      { cmd: '1', ...iron(), endStance: 'iron', followups: [F('iron1_2', 11, 20), ...tree(trees.iron, 11, 20)] }),
    S('iron1_2', 'Iron Jab, Anvil', 'IRON 1,2', { type: 'straight', limb: 'R' }, 24, { frames: [8, 9], level: 'high', damage: 12, onBlock: -2, onHit: 6, reaction: 'heavy' },
      { cmd: '2', endStance: 'iron', followups: tree(trees.iron, 10, 24) }),
    S('iron2', 'Anvil Straight', 'IRON 2', { type: 'straight', limb: 'R' }, 32, { frames: [14, 15], level: 'mid', damage: 20, onBlock: -8, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 360, pushbackBlock: 340 },
      { cmd: '2', ...iron(), armour: [4, 13] }),
    S('iron4', 'Iron Shin', 'IRON 4', { type: 'front', limb: 'R' }, 32, { frames: [13, 15], level: 'mid', damage: 16, onBlock: -8, onHit: 4, reaction: 'medium', pushback: 280 },
      { cmd: '4', ...iron(), endStance: 'iron', followups: tree(trees.iron, 16, 32) }),
    S('iron_f2', 'Forge Uppercut', 'IRON f+2', { type: 'uppercut', limb: 'R' }, 36, LAUNCH([15, 16], 17, -13, 112, 6),
      { cmd: 'f+2', ...iron(), motion: [{ frames: [1, 12], forward: 24 }], properties: ['launcher'] }),
    S('iron_d1', 'Low Iron Fist', 'IRON d+1', { type: 'jab', limb: 'L', height: 'low' }, 30, { frames: [13, 14], level: 'low', damage: 10, onBlock: -12, onHit: 2, reaction: 'crouchLight' },
      { cmd: 'd+1', ...iron(), pose: CR(29) }),
    S('iron_12', 'Anvil Drop', 'IRON 1+2', { type: 'hammer', limb: 'R' }, 38, { frames: [16, 17], level: 'mid', damage: 20, onBlock: -10, onHit: 3, reaction: 'bound' },
      { cmd: '1+2', ...iron(), properties: ['bound'] }),
    S('iron_34', 'Silk Shift', 'IRON 3+4', { type: 'hop', limb: 'L' }, 36, { frames: [14, 16], level: 'mid', damage: 14, onBlock: -9, onHit: 2, reaction: 'medium' },
      { cmd: '3+4', ...iron(), endStance: 'silk', crush: [{ level: 'low', frames: [1, 18] }], properties: ['lowCrush', 'jumpAttack'], followups: tree(trees.silk, 17, 36) }),
    // silk
    S('silk1', 'Silk Palm', 'SILK 1', { type: 'palm', limb: 'L' }, 24, { frames: [11, 12], level: 'mid', damage: 10, onBlock: -2, onHit: 6, reaction: 'light' },
      { cmd: '1', ...silk, endStance: 'silk', followups: tree(trees.silk, 13, 24) }),
    S('silk2', 'Willow Palm', 'SILK 2', { type: 'palm', limb: 'R' }, 28, { frames: [12, 13], level: 'high', damage: 14, onBlock: -4, onHit: 6, reaction: 'medium', chReaction: 'stagger', pushback: 260 },
      { cmd: '2', ...silk, endStance: 'silk', followups: tree(trees.silk, 14, 28) }),
    S('silk3', 'Silk Reap', 'SILK 3', { type: 'low', limb: 'L' }, 34, { frames: [14, 16], level: 'low', damage: 13, onBlock: -13, onHit: 1, reaction: 'crouchLight' },
      { cmd: '3', ...silk }),
    S('silk4', 'Silk Crescent', 'SILK 4', { type: 'round', limb: 'R' }, 34, { frames: [14, 16], level: 'high', damage: 18, onBlock: -8, onHit: 5, reaction: 'medium', chReaction: 'launch', launchVy: 104, launchVz: 5 },
      { cmd: '4', ...silk, properties: ['homing'] }),
    S('silk_12', 'Silk Lift', 'SILK 1+2', { type: 'doublePunch' }, 36, LAUNCH([15, 16], 16, -13, 108, 5),
      { cmd: '1+2', ...silk, motion: [{ frames: [1, 12], forward: 22 }], properties: ['launcher'] }),
    S('silk_d3', 'Silk Sweep', 'SILK d+3', { type: 'sweep', limb: 'L' }, 44, { frames: [16, 18], level: 'low', damage: 17, onBlock: -24, onHit: 0, reaction: 'trip', pushback: 200 },
      { cmd: 'd+3', ...silk, pose: CR(40) }),
    S('silk_34', 'Storm Shift', 'SILK 3+4', { type: 'hop', limb: 'R' }, 38, { frames: [14, 16], level: 'mid', damage: 15, onBlock: -10, onHit: 2, reaction: 'medium' },
      { cmd: '3+4', ...silk, endStance: 'storm', crush: [{ level: 'low', frames: [1, 18] }], properties: ['lowCrush', 'jumpAttack'], followups: tree(trees.storm, 17, 38) }),
    // storm
    S('storm1', 'Gale Backfist', 'STORM 1', { type: 'backfist', limb: 'L' }, 28, { frames: [12, 13], level: 'high', damage: 14, onBlock: -5, onHit: 5, reaction: 'medium' },
      { cmd: '1', ...storm, endStance: 'storm', followups: tree(trees.storm, 14, 28) }),
    S('storm3', 'Storm Front Kick', 'STORM 3', { type: 'front', limb: 'L' }, 30, { frames: [12, 14], level: 'mid', damage: 14, onBlock: -6, onHit: 4, reaction: 'medium', pushback: 240 },
      { cmd: '3', ...storm, endStance: 'storm', followups: [F('storm3_4', 15, 30), ...tree(trees.storm, 15, 30)] }),
    S('storm3_4', 'Storm Front, Cyclone', 'STORM 3,4', { type: 'spinBack', limb: 'R' }, 36, { frames: [14, 16], level: 'high', damage: 18, onBlock: -8, onHit: 6, reaction: 'heavy', chReaction: 'knockdown', pushback: 320 },
      { cmd: '4' }),
    S('storm4', 'Cyclone Heel', 'STORM 4', { type: 'spinBack', limb: 'R' }, 38, { frames: [17, 19], level: 'high', damage: 22, onBlock: -6, onHit: 10, reaction: 'heavy', chReaction: 'knockdown', pushback: 400, pushbackBlock: 400 },
      { cmd: '4', ...storm, properties: ['homing'] }),
    S('storm_d4', 'Storm Low', 'STORM d+4', { type: 'low', limb: 'R' }, 34, { frames: [15, 17], level: 'low', damage: 13, onBlock: -14, onHit: 1, reaction: 'crouchLight' },
      { cmd: 'd+4', ...storm }),
    S('storm_f4', 'Storm Rising', 'STORM f+4', { type: 'hop', limb: 'R' }, 42, LAUNCH([15, 17], 19, -13, 116, 5),
      { cmd: 'f+4', ...storm, crush: [{ level: 'low', frames: [1, 22] }], properties: ['launcher', 'lowCrush', 'jumpAttack'] }),
    S('storm_34', 'Iron Shift', 'STORM 3+4', { type: 'axe', limb: 'R' }, 38, { frames: [16, 18], level: 'mid', damage: 17, onBlock: -10, onHit: 3, reaction: 'heavy', chReaction: 'bound' },
      { cmd: '3+4', ...storm, endStance: 'iron', properties: ['hitsGrounded'], followups: tree(trees.iron, 19, 38) }),
    S('storm_b3', 'Storm Fade', 'STORM b+3', { type: 'round', limb: 'L' }, 36, { frames: [15, 17], level: 'high', damage: 16, onBlock: -8, onHit: 4, reaction: 'medium', chReaction: 'spinLaunch', launchVy: 96, launchVz: 5 },
      { cmd: 'b+3', ...storm, motion: [{ frames: [1, 10], forward: -18 }], crush: [{ level: 'low', frames: [1, 18] }], properties: ['lowCrush'] }),
  ];
}
