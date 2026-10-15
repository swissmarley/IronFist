/** Core simulation types. Everything is integer-valued. */

export type HitLevel = 'high' | 'mid' | 'low' | 'smid' | 'unblockable' | 'throw';

export type Reaction =
  | 'light' | 'medium' | 'heavy'        // standing hit-stun reactions
  | 'crouchLight' | 'crouchMedium'      // crouching reactions
  | 'stagger'                           // long stun, recoverable
  | 'crumple'                           // slow fall, juggleable
  | 'launch' | 'launchHigh' | 'launchLow' | 'spinLaunch'
  | 'knockdown' | 'trip' | 'faceDown' | 'spin'
  | 'bound' | 'screw'
  | 'wallSplat' | 'wallBounce' | 'floorBreak';

export type MoveProperty =
  | 'homing' | 'tracksLeft' | 'tracksRight'
  | 'lowCrush' | 'highCrush' | 'powerCrush'
  | 'launcher' | 'bound' | 'screw'
  | 'wallSplat' | 'wallBounce' | 'knockdown'
  | 'hitsGrounded' | 'unblockable' | 'throw' | 'jumpAttack'
  | 'justFrame' | 'parry' | 'chainThrow' | 'tenHit';

export type MoveCondition = 'standing' | 'crouch' | 'ws' | 'air' | 'ss' | 'bt' | 'run' | 'stance' | 'lying' | 'throwing';

export interface CapsuleDef {
  /** Local-space endpoints in mm: x = fighter right, y = up, z = toward facing. */
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  r: number;
}

export interface HitDef {
  /** Active window in move frames, inclusive, 1-based. */
  frames: [number, number];
  level: HitLevel;
  damage: number;
  onBlock: number;
  onHit: number;
  /** Frame advantage on counter hit; defaults to onHit. */
  onCH?: number;
  reaction: Reaction;
  chReaction?: Reaction;
  /** Reaction when the defender is airborne (default: juggle lift derived from reaction). */
  airLift?: number;
  /** Horizontal push applied to an airborne defender (mm/frame initial). */
  airPush?: number;
  capsules: CapsuleDef[];
  /**
   * Optional per-frame capsules baked from the animation pose (tools/bake-hitboxes.ts).
   * When present for a frame, these replace `capsules` on that frame.
   */
  track?: { frame: number; capsules: CapsuleDef[] }[];
  pushback: number;
  pushbackBlock: number;
  /** Hit-stop frames applied to both fighters (defaults by reaction). */
  hitstop?: number;
  /** Hits sharing a group count as one hit (multi-capsule). Different groups = multi-hit move. */
  group?: number;
  /** Vertical launch speed (mm/frame) and horizontal push for launch reactions. */
  launchVy?: number;
  launchVz?: number;
}

export interface FollowupDef {
  moveId: string;
  /** Earliest move frame the follow-up can start on. */
  cancelFrame: number;
  /** Latest move frame the input is accepted on (inclusive). */
  windowEnd: number;
  /** Only chain if the previous hit connected (hit or block). */
  onContact?: boolean;
  /** Only chain on hit (not block). */
  onHitOnly?: boolean;
}

export interface CrushWindow {
  level: 'low' | 'high';
  frames: [number, number];
}

export interface RootMotion {
  /** Forward distance per frame (mm) over the given move frame range. */
  frames: [number, number];
  forward: number;
  /** Optional vertical motion (jumping attacks): initial vy (mm/frame) and gravity use the character gravity. */
  jumpVy?: number;
}

export interface ThrowDef {
  /** Which break input escapes: 1, 2, or 12 (1+2). */
  breakButton: 1 | 2 | 12;
  /** Frames after the grab connects during which a break is accepted. */
  breakWindow: number;
  /** Total frames of the throw animation (victim released at the end). */
  duration: number;
  damage: number;
  /** Move frame on which the grab connects (the throw's startup). */
  grabFrame: number;
  /** Frame (relative to the grab) on which damage is applied. Defaults to 60% of duration. */
  damageFrame?: number;
  /** Grabs crouching opponents too (default: whiffs on crouchers like a high). */
  grabsCrouching?: boolean;
  /** Grabs lying opponents (ground throw). */
  grabsLying?: boolean;
  /** Frames of disadvantage for the thrower when the throw is broken (default 6). */
  breakRecovery?: number;
  /** Victim ends up: 'knockdown' faceUp, 'faceDown', 'standing' (resets neutral). */
  result: 'knockdown' | 'faceDown' | 'standing' | 'backTurned';
  /** Where the victim is placed relative to the thrower at the end (mm, forward axis). */
  endOffset: number;
  /** Reach of the grab (mm from thrower centre) and max side offset. */
  range: number;
  /** Chain-throw follow-ups selectable during the throw. */
  chain?: { moveId: string; windowStart: number; windowEnd: number }[];
}

/** Animation template selection for a move (render-side data, ignored by the sim). */
export type AttackAnimType =
  | 'jab' | 'straight' | 'hook' | 'uppercut' | 'elbow' | 'backfist' | 'hammer' | 'palm' | 'doublePunch'
  | 'front' | 'round' | 'low' | 'sweep' | 'hop' | 'knee' | 'spinBack' | 'axe' | 'side' | 'rising' | 'ground'
  | 'throw' | 'parry' | 'powerCrush';

export interface AnimSpec {
  type: AttackAnimType;
  /** Striking limb side. Default: 'R' for punches/kicks. */
  limb?: 'L' | 'R';
  /** Target height; defaults from the hit level. */
  height?: 'high' | 'mid' | 'low';
  /** Extra strikes for multi-hit moves: [frame, type, limb] (frame = hit frame). */
  extra?: [number, AttackAnimType, 'L' | 'R'][];
}

export interface MoveDef {
  id: string;
  /** Animation template (render only). */
  anim?: AnimSpec;
  name: string;
  /** Display notation of the full sequence, e.g. "1,2" or "f,f+2". */
  input: string;
  /**
   * Trigger notation parsed by the command interpreter. Defaults to `input`.
   * Setting `cmd` (different from `input`) marks the move as a follow-up that is
   * only reachable through another move's `followups`.
   */
  cmd?: string;
  conditions?: MoveCondition[];
  /** Required stance id when conditions include 'stance'. */
  stance?: string;
  /** Total frames until the fighter is actionable (recovery included). */
  total: number;
  hits: HitDef[];
  followups?: FollowupDef[];
  motion?: RootMotion[];
  properties?: MoveProperty[];
  crush?: CrushWindow[];
  /** Power-crush armour window (absorbs one high/mid). */
  armour?: [number, number];
  /** Hurtbox pose per frame range ('crouch' makes highs whiff). */
  pose?: { frames: [number, number]; pose: 'stand' | 'crouch' | 'air' }[];
  /** Stance the fighter is in after the move completes. */
  endStance?: string;
  /** For throws. */
  throw?: ThrowDef;
  /** Just-frame window: tokens must land within this many frames of the ideal (1 = exact). */
  justFrame?: number;
  /** Input buffer window in frames (default 8). */
  buffer?: number;
  /** Fully recoverable while in the air at `landFrame` (jump attacks). */
  landFrame?: number;
  /** Parry window: incoming attacks of these levels are parried during the frames. */
  parry?: { frames: [number, number]; levels: HitLevel[]; stagger: number };
}

export interface CharacterStats {
  hp: number;
  height: number;
  walkF: number;       // mm per frame
  walkB: number;
  dashSpeed: number;   // mm per frame at start
  dashFrames: number;
  backdashSpeed: number;
  backdashFrames: number;   // moving frames
  backdashRecovery: number; // vulnerable, non-blocking frames after movement
  sidestepDist: number;     // total mm over sidestepFrames
  sidestepFrames: number;
  sidestepWeakScale: number; // percent of sidestep distance on the weak side
  strongSide: 'left' | 'right';
  pushRadius: number;
  weight: number;     // 100 = normal; heavier falls faster
  jumpVy: number;
  gravity: number;    // mm/frame^2
}

/** Render-only appearance data (ignored by the sim). */
export interface CharacterLook {
  palette: { skin: number; top: number; pants: number; belt: number; gloves: number; boots: number; hair: number };
  hair: 'none' | 'short' | 'spiky' | 'long' | 'bun';
  /** Height multiplier (1 = 1.78 m). */
  heightScale: number;
  /** Muscle bulk multiplier. */
  bulk: number;
  heavy?: boolean;
  /** Which material each body part uses; omitted parts use the default mapping. */
  parts?: Partial<Record<string, 'skin' | 'top' | 'pants' | 'belt' | 'gloves' | 'boots' | 'hair'>>;
}

/** Named pose sets a character animates with (see src/anim/stances.ts and ceremonies.ts). Ignored by the sim. */
export interface CharacterAnimSpec {
  stance?: string;
  intro?: string;
  win?: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  archetype: string;
  /** Short bio / fighting-style line for the select screen. */
  tagline?: string;
  look?: CharacterLook;
  /** Render-only choice of idle stance / intro / win pose sets (ids from src/anim; unknown ids fall back to the greybox default). */
  anim?: CharacterAnimSpec;
  stats: CharacterStats;
  hurtboxes: { stand: CapsuleDef[]; crouch: CapsuleDef[]; air: CapsuleDef[]; lying: CapsuleDef[] };
  moves: MoveDef[];
  /** Stance ids (first = default). */
  stances?: string[];
  /** 10-hit string root move id. */
  tenHit?: string;
}
