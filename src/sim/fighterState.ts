import { Hasher } from '@/core/hash';
import { FX_ONE } from '@/core/fixed';
import { InputHistory } from './commands';

export enum FState {
  Idle = 0, Walk = 1, Crouch = 2, Jump = 3, Dash = 4, Backdash = 5, Sidestep = 6, Sidewalk = 7,
  CrouchDash = 8, Run = 9, Attack = 10, Hitstun = 11, Blockstun = 12, Air = 13, Lying = 14,
  Getup = 15, Throw = 16, Thrown = 17, KO = 18, Intro = 19, Win = 20, Landing = 21, Stagger = 22, Crumple = 23,
}

export const STATE_NAMES: readonly string[] = [
  'Idle', 'Walk', 'Crouch', 'Jump', 'Dash', 'Backdash', 'Sidestep', 'Sidewalk', 'CrouchDash', 'Run',
  'Attack', 'Hitstun', 'Blockstun', 'Air', 'Lying', 'Getup', 'Throw', 'Thrown', 'KO', 'Intro', 'Win', 'Landing', 'Stagger', 'Crumple',
];

/**
 * All mutable per-fighter simulation state. Plain integer fields so that the
 * whole thing can be hashed and copied field-by-field with no allocation.
 */
export class FighterState {
  readonly idx: number;
  // transform (mm, Q12)
  x = 0; y = 0; z = 0;
  px = 0; py = 0; pz = 0;
  fx = FX_ONE; fz = 0;
  pfx = FX_ONE; pfz = 0;
  // health
  hp = 170; maxHp = 170;
  // state machine
  state: FState = FState.Idle;
  stateFrame = 0;
  stateTotal = 0;
  moveIdx = -1;
  moveFrame = 0;
  hitMask = 0;
  moveContact = 0; // 0 none, 1 blocked, 2 hit
  stunFrames = 0;
  hitstop = 0;
  crouching = 0;
  blockHeld = 0;
  wsTimer = 0;
  upHold = 0;
  downHold = 0;
  // velocities (mm/frame)
  vx = 0; vy = 0; vz = 0;
  pushX = 0; pushZ = 0; pushFrames = 0;
  // sidestep direction (world Q12)
  sx = 0; sz = 0;
  // buffered command
  pendingMove = -1;
  pendingFrame = -1000;
  pendingJF = 0;
  // combo / juggle
  comboHits = 0;
  comboDamage = 0;
  juggleLift = 100; // percent lift remaining for subsequent air hits
  boundUsed = 0;
  screwUsed = 0;
  lastHitMove = -1;
  lastReaction = 0;
  // oki
  lyingFrames = 0;
  faceDown = 0;
  techWindow = 0;
  wallTouch = 0;
  // throw
  throwPartner = -1;
  throwFrame = 0;
  throwBreakWindow = 0;
  throwMove = -1;
  // stance
  stanceIdx = 0;
  // misc flags
  ko = 0;
  counterable = 0;
  armourHits = 0;
  // input
  readonly input = new InputHistory(64);
  facingRight: boolean;
  dir = 5;
  buttons = 0;

  constructor(idx: number) {
    this.idx = idx;
    this.facingRight = idx === 0;
  }

  resetForRound(x: number, z: number, fx: number, fz: number, hp: number): void {
    this.x = x; this.z = z; this.y = 0;
    this.px = x; this.pz = z; this.py = 0;
    this.fx = fx; this.fz = fz; this.pfx = fx; this.pfz = fz;
    this.hp = hp; this.maxHp = hp;
    this.state = FState.Idle; this.stateFrame = 0; this.stateTotal = 0;
    this.moveIdx = -1; this.moveFrame = 0; this.hitMask = 0; this.moveContact = 0;
    this.stunFrames = 0; this.hitstop = 0; this.crouching = 0; this.blockHeld = 0; this.wsTimer = 0;
    this.upHold = 0; this.downHold = 0;
    this.vx = 0; this.vy = 0; this.vz = 0; this.pushX = 0; this.pushZ = 0; this.pushFrames = 0;
    this.sx = 0; this.sz = 0;
    this.pendingMove = -1; this.pendingFrame = -1000; this.pendingJF = 0;
    this.comboHits = 0; this.comboDamage = 0; this.juggleLift = 100; this.boundUsed = 0; this.screwUsed = 0;
    this.lastHitMove = -1; this.lastReaction = 0;
    this.lyingFrames = 0; this.faceDown = 0; this.techWindow = 0; this.wallTouch = 0;
    this.throwPartner = -1; this.throwFrame = 0; this.throwBreakWindow = 0; this.throwMove = -1;
    this.stanceIdx = 0; this.ko = 0; this.counterable = 0; this.armourHits = 0;
    this.input.clear();
    this.dir = 5; this.buttons = 0;
  }

  setState(s: FState, total = 0): void {
    this.state = s;
    this.stateFrame = 0;
    this.stateTotal = total;
    if (s !== FState.Attack) { this.moveIdx = -1; this.moveFrame = 0; this.hitMask = 0; this.moveContact = 0; }
  }

  isActionable(): boolean {
    switch (this.state) {
      case FState.Idle: case FState.Walk: case FState.Crouch: case FState.Dash: case FState.Sidewalk: case FState.Run:
        return true;
      case FState.Sidestep: return this.stateFrame >= 2;
      case FState.Backdash: return this.stateFrame >= 1 && this.stateFrame < this.stateTotal;
      case FState.CrouchDash: return this.stateFrame >= 1;
      default: return false;
    }
  }

  isAirborne(): boolean {
    return this.state === FState.Air || this.state === FState.Jump || this.y > 0;
  }

  isGroundedLying(): boolean {
    return this.state === FState.Lying;
  }

  hash(h: Hasher): void {
    h.int(this.x).int(this.y).int(this.z).int(this.fx).int(this.fz).int(this.hp)
      .int(this.state).int(this.stateFrame).int(this.stateTotal).int(this.moveIdx).int(this.moveFrame)
      .int(this.hitMask).int(this.moveContact).int(this.stunFrames).int(this.hitstop).int(this.crouching)
      .int(this.blockHeld).int(this.wsTimer).int(this.upHold).int(this.downHold)
      .int(this.vx).int(this.vy).int(this.vz).int(this.pushX).int(this.pushZ).int(this.pushFrames)
      .int(this.sx).int(this.sz).int(this.pendingMove).int(this.pendingFrame).int(this.pendingJF)
      .int(this.comboHits).int(this.comboDamage).int(this.juggleLift).int(this.boundUsed).int(this.screwUsed)
      .int(this.lastHitMove).int(this.lastReaction).int(this.lyingFrames).int(this.faceDown).int(this.techWindow)
      .int(this.wallTouch).int(this.throwPartner).int(this.throwFrame).int(this.throwBreakWindow).int(this.throwMove)
      .int(this.stanceIdx).int(this.ko).int(this.counterable).int(this.armourHits).int(this.dir).int(this.buttons);
  }
}
