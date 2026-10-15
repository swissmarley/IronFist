import { FX_ONE } from '@/core/fixed';
import { isBack, isDown, isForward, isUp } from '@/input/InputFrame';
import { TUNING } from './config';
import { EvType, type EventQueue } from './events';
import { FighterState, FState } from './fighterState';
import type { CharacterRuntime } from './character';
import { faceOpponent, moveForward, sideVector } from './movement';

/** Get-up kinds (FighterState.getupKind). */
export const GETUP_STAND = 0, GETUP_KIPUP = 1, GETUP_ROLL_BACK = 2, GETUP_ROLL_SIDE = 3, GETUP_TECH = 4, GETUP_ROLL_FWD = 5;

const KIPUP_FRAMES = 20;
const ROLL_FRAMES = 26;
const TECH_FRAMES = 16;

/**
 * Knockdown / wake-up handling: tech roll on landing, lying options and the
 * roll / get-up state progression. Runs after processCommands so floor attacks
 * (moves with condition 'lying') take precedence.
 */
export function stepOki(f: FighterState, rt: CharacterRuntime, o: FighterState, ev: EventQueue): void {
  const s = f.state;
  if (s === FState.Lying) {
    if (f.hitstop > 0) return;
    f.lyingFrames++;
    if (f.techWindow > 0) f.techWindow--;
    const pressed = f.input.pressed(0);
    // tech roll: any button during the landing window
    if (f.techWindow > 0 && pressed !== 0) {
      startGetup(f, GETUP_TECH, TECH_FRAMES, ev);
      const v = sideVector(f, (f.idx === 0) !== (f.lyingFrames % 2 === 0));
      f.sx = v.x; f.sz = v.z;
      return;
    }
    if (f.lyingFrames < 6) return; // minimum floor time
    const d = f.dir;
    if (isUp(d)) { startGetup(f, GETUP_KIPUP, KIPUP_FRAMES, ev); return; }
    if (isBack(d)) { startGetup(f, GETUP_ROLL_BACK, ROLL_FRAMES, ev); return; }
    if (isForward(d)) { startGetup(f, GETUP_ROLL_FWD, ROLL_FRAMES, ev); return; }
    if (isDown(d)) { f.lyingFrames = Math.min(f.lyingFrames, TUNING.lyingFrames - 2); return; } // stay down
    if (f.lyingFrames >= TUNING.lyingFrames) startGetup(f, GETUP_STAND, TUNING.getupFrames, ev);
    return;
  }
  if (s === FState.Getup || s === FState.Roll) {
    const t = f.stateFrame;
    switch (f.getupKind) {
      case GETUP_ROLL_BACK: moveForward(f, t < 16 ? -38 : 0); break;
      case GETUP_ROLL_FWD: moveForward(f, t < 16 ? 34 : 0); break;
      case GETUP_TECH:
      case GETUP_ROLL_SIDE:
        if (t < 10) { f.x += Math.trunc((f.sx * 40) / FX_ONE); f.z += Math.trunc((f.sz * 40) / FX_ONE); }
        break;
      default: break;
    }
    if (f.stateFrame >= f.stateTotal) {
      faceOpponent(f, o);
      f.comboHits = 0; f.comboDamage = 0; f.juggleLift = 100; f.boundUsed = 0; f.screwUsed = 0; f.wallHits = 0;
      f.setState(FState.Idle);
      f.getupKind = GETUP_STAND;
    }
  }
  void rt;
}

function startGetup(f: FighterState, kind: number, frames: number, ev: EventQueue): void {
  f.getupKind = kind;
  f.setState(kind === GETUP_ROLL_BACK || kind === GETUP_ROLL_FWD || kind === GETUP_ROLL_SIDE || kind === GETUP_TECH ? FState.Roll : FState.Getup, frames);
  f.comboHits = 0; f.comboDamage = 0; f.juggleLift = 100; f.boundUsed = 0; f.screwUsed = 0;
  f.lyingFrames = 0;
  f.techWindow = 0;
  ev.push(EvType.Land, f.idx, -1, f.x, 0, f.z, 3 + kind);
}
