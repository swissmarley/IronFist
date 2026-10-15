import { FX_ONE, ilen2 } from '@/core/fixed';
import { FighterState, FState } from './fighterState';
import type { CharacterRuntime } from './character';
import { EvType, type EventQueue } from './events';
import { TUNING } from './config';
import { faceOpponent } from './movement';
import type { ThrowDef } from './types';

/** Does the throw move of `a` connect with `b` on this frame? */
export function throwConnects(a: FighterState, b: FighterState, rta: CharacterRuntime): ThrowDef | null {
  if (a.state !== FState.Attack || a.moveIdx < 0) return null;
  const m = rta.move(a.moveIdx);
  const t = m.throw;
  if (!t) return null;
  if (a.moveFrame !== t.grabFrame) return null;
  if (a.hitMask & 1) return null;
  if (b.state === FState.Lying ? !t.grabsLying : !b.isThrowable()) return null;
  if (b.state !== FState.Lying && (b.crouching === 1 || b.state === FState.Crouch) && !t.grabsCrouching) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  // must be roughly in front: dot(facing, d) > 0 and within range
  const dot = (a.fx * dx + a.fz * dz) / FX_ONE;
  if (dot <= 0) return null;
  const dist = ilen2(dx, dz);
  if (dist > t.range) return null;
  const side = Math.abs((-a.fz * dx + a.fx * dz) / FX_ONE);
  if (side > 450) return null;
  return t;
}

/** Start the throw animation for both fighters. */
export function beginThrow(a: FighterState, b: FighterState, t: ThrowDef, ev: EventQueue): void {
  a.hitMask |= 1;
  const throwMove = a.moveIdx;
  a.setState(FState.Throw, t.duration);
  a.throwMove = throwMove;
  a.throwPartner = b.idx;
  a.throwFrame = 0;
  faceOpponent(a, b);
  b.setState(FState.Thrown, t.duration);
  b.throwPartner = a.idx;
  b.throwFrame = 0;
  b.throwBreakWindow = t.breakWindow;
  b.throwBroken = 0;
  b.pendingMove = -1;
  b.vx = 0; b.vy = 0; b.vz = 0; b.y = 0;
  b.crouching = 0;
  // face each other
  b.fx = -a.fx; b.fz = -a.fz;
  a.hitstop = 3; b.hitstop = 3;
  ev.push(EvType.Throw, a.idx, b.idx, b.x, 1200, b.z, 1, a.throwMove);
}

/** Does the victim's input this frame break the throw? Buttons are the pressed-edge mask. */
export function breakInput(pressed: number, breakButton: 1 | 2 | 12): boolean {
  const b1 = (pressed & 1) !== 0, b2 = (pressed & 2) !== 0;
  if (breakButton === 1) return b1 && !b2;
  if (breakButton === 2) return b2 && !b1;
  return b1 && b2;
}

export function resolveBreak(a: FighterState, b: FighterState, t: ThrowDef, ev: EventQueue): void {
  const rec = t.breakRecovery ?? 6;
  a.setState(FState.Hitstun, rec + 4);
  a.stunFrames = rec + 4;
  b.setState(FState.Hitstun, 4);
  b.stunFrames = 4;
  b.throwBroken = 1;
  a.throwPartner = -1; b.throwPartner = -1;
  // push apart
  const px = Math.trunc((a.fx * 60) / FX_ONE), pz = Math.trunc((a.fz * 60) / FX_ONE);
  a.pushX = -px; a.pushZ = -pz; a.pushFrames = 6;
  b.pushX = px; b.pushZ = pz; b.pushFrames = 6;
  a.hitstop = 6; b.hitstop = 6;
  ev.push(EvType.ThrowBreak, b.idx, a.idx, b.x, 1200, b.z);
}

/**
 * Advance the thrower/victim pair by one frame. Called for the thrower; the
 * victim is positioned relative to the thrower. Returns true when finished.
 */
export function advanceThrow(a: FighterState, b: FighterState, rta: CharacterRuntime, ev: EventQueue): boolean {
  if (a.throwMove < 0) return true;
  const t = rta.move(a.throwMove).throw;
  if (!t) return true;
  a.throwFrame++;
  b.throwFrame = a.throwFrame;
  if (b.throwBreakWindow > 0) b.throwBreakWindow--;
  // victim locked in front of the thrower, drifting to the end offset
  const prog = Math.min(FX_ONE, Math.trunc((a.throwFrame * FX_ONE) / Math.max(1, t.duration)));
  const dist = 700 + Math.trunc(((t.endOffset - 700) * prog) / FX_ONE);
  b.x = a.x + Math.trunc((a.fx * dist) / FX_ONE);
  b.z = a.z + Math.trunc((a.fz * dist) / FX_ONE);
  const lift = Math.trunc((800 * Math.max(0, Math.min(prog, FX_ONE - prog)) * 2) / FX_ONE);
  b.y = t.result === 'standing' || t.result === 'backTurned' ? 0 : lift;
  const dmgFrame = t.damageFrame ?? Math.trunc((t.duration * 60) / 100);
  if (a.throwFrame === dmgFrame) {
    b.hp = Math.max(0, b.hp - t.damage);
    b.comboHits++;
    b.comboDamage += t.damage;
    b.lastHitMove = a.throwMove;
    ev.push(EvType.Hit, a.idx, b.idx, b.x, 1000, b.z, 2, a.throwMove, t.damage);
    a.hitstop = TUNING.hitstopHeavy; b.hitstop = TUNING.hitstopHeavy;
  }
  if (a.throwFrame >= t.duration) {
    a.throwPartner = -1; b.throwPartner = -1;
    a.setState(FState.Idle);
    a.throwMove = -1;
    b.y = 0;
    switch (t.result) {
      case 'standing':
        b.setState(FState.Hitstun, 8); b.stunFrames = 8; b.comboHits = 0; b.comboDamage = 0; break;
      case 'backTurned':
        b.setState(FState.Hitstun, 10); b.stunFrames = 10; b.fx = a.fx; b.fz = a.fz; b.comboHits = 0; b.comboDamage = 0; break;
      case 'faceDown':
        b.setState(FState.Lying, 0); b.lyingFrames = 0; b.faceDown = 1; b.techWindow = 0; break;
      default:
        b.setState(FState.Lying, 0); b.lyingFrames = 0; b.faceDown = 0; b.techWindow = 0; break;
    }
    return true;
  }
  return false;
}
