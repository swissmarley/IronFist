import { isBack, isDown, isUp, relativeDir, buttonsOf, type InputFrame } from '@/input/InputFrame';
import { TUNING } from './config';
import { FighterState, FState } from './fighterState';
import { CharacterRuntime, SYS_BACKDASH, SYS_CROUCHDASH, SYS_DASH } from './character';
import type { CommandMatch } from './commands';
import { faceOpponent, startBackdash, startCrouchDash, startDash, startJump, startSidestep } from './movement';
import { EvType, type EventQueue } from './events';
import type { MoveDef } from './types';

const scratchMatches: CommandMatch[] = [];

/** Push this frame's input into the fighter's history (facing-relative). */
export function ingestInput(f: FighterState, frame: InputFrame): void {
  f.dir = relativeDir(frame, f.facingRight);
  f.buttons = buttonsOf(frame);
  f.input.push(f.dir, f.buttons);
  f.blockHeld = isBack(f.dir) ? 1 : 0;
}

function conditionsMet(f: FighterState, m: MoveDef, rt: CharacterRuntime): boolean {
  const conds = m.conditions ?? ['standing'];
  for (const c of conds) {
    switch (c) {
      case 'standing':
        if (f.state === FState.Crouch || f.crouching || f.isAirborne()) return false;
        break;
      case 'crouch':
        if (!(f.state === FState.Crouch || f.state === FState.CrouchDash || (f.crouching && f.state !== FState.Attack))) return false;
        break;
      case 'ws':
        if (!(f.wsTimer > 0 || f.state === FState.Crouch || f.state === FState.CrouchDash)) return false;
        break;
      case 'air':
        if (!f.isAirborne()) return false;
        break;
      case 'ss':
        if (f.state !== FState.Sidestep && f.state !== FState.Sidewalk) return false;
        break;
      case 'bt':
        return false;
      case 'run':
        if (f.state !== FState.Run) return false;
        break;
      case 'stance':
        if ((rt.def.stances?.[f.stanceIdx] ?? '') !== (m.stance ?? '')) return false;
        break;
    }
  }
  return true;
}

/** Begin executing a move right now. */
export function startMove(f: FighterState, o: FighterState, rt: CharacterRuntime, moveIdx: number, ev: EventQueue, jf = false): void {
  let m = rt.move(moveIdx);
  if (jf && m.justFrame !== undefined && m.cmd === undefined) {
    const alt = rt.moveIndex.get(m.id + '_jf');
    if (alt !== undefined) { moveIdx = alt; m = rt.move(alt); }
  }
  const wasAir = f.isAirborne();
  f.setState(FState.Attack, m.total);
  f.moveIdx = moveIdx;
  f.moveFrame = 0;
  f.hitMask = 0;
  f.moveContact = 0;
  f.pendingMove = -1;
  f.wsTimer = 0;
  f.upHold = 0; f.downHold = 0;
  if (!wasAir) faceOpponent(f, o);
  const poseCrouch = m.pose?.some((p) => p.pose === 'crouch' && p.frames[0] <= 0) ?? false;
  f.crouching = poseCrouch ? 1 : 0;
  if (m.motion) {
    for (const rm of m.motion) if (rm.jumpVy && rm.frames[0] <= 0) f.vy = rm.jumpVy;
  }
  ev.push(EvType.MoveStart, f.idx, o.idx, f.x, f.y, f.z, 0, moveIdx);
}

/** Resolve the first move whose conditions hold for a command id (ids are "cmd:<moveId>"). */
function resolveMove(f: FighterState, rt: CharacterRuntime, cmdId: string, followupOnly: boolean): number {
  if (!cmdId.startsWith('cmd:')) return -1;
  const first = rt.moveIndex.get(cmdId.slice(4));
  if (first === undefined) return -1;
  const notation = rt.move(first).cmd ?? rt.move(first).input;
  const candidates = rt.movesForCommand(notation);
  // If we're inside a move, follow-ups win over root moves.
  if (f.state === FState.Attack && f.moveIdx >= 0) {
    const cur = rt.move(f.moveIdx);
    for (const fu of cur.followups ?? []) {
      const idx = rt.moveIndex.get(fu.moveId);
      if (idx === undefined || !candidates.includes(idx)) continue;
      if (fu.onContact && f.moveContact === 0) continue;
      if (fu.onHitOnly && f.moveContact !== 2) continue;
      const buffer = rt.move(idx).buffer ?? TUNING.defaultBuffer;
      if (f.moveFrame >= fu.cancelFrame - buffer && f.moveFrame <= fu.windowEnd) return idx;
    }
    if (followupOnly) return -1;
  }
  // root moves: pick the most specific whose conditions hold (crouch/ws/air before standing)
  let best = -1, bestScore = -1;
  for (const idx of candidates) {
    const m = rt.move(idx);
    if (isFollowupOnly(m, rt)) continue;
    if (!conditionsMet(f, m, rt)) continue;
    const conds = m.conditions ?? ['standing'];
    const score = conds.includes('standing') ? 1 : 2 + conds.length;
    if (score > bestScore) { best = idx; bestScore = score; }
  }
  return best;
}

/** Moves with an explicit `cmd` are follow-ups only (their `input` is the full sequence). */
function isFollowupOnly(m: MoveDef, _rt: CharacterRuntime): boolean {
  return m.cmd !== undefined && m.cmd !== m.input;
}

/**
 * Process commands and movement inputs for one fighter on this frame.
 * Must run after ingestInput and before locomotion.
 */
export function processCommands(f: FighterState, o: FighterState, rt: CharacterRuntime, frame: number, ev: EventQueue): void {
  if (f.ko || f.state === FState.KO || f.state === FState.Intro || f.state === FState.Win) return;
  const matches = rt.interpreter.match(f.input, scratchMatches);
  const actionable = f.isActionable();

  // 1. Attack commands (new moves and follow-ups), with buffering.
  for (const m of matches) {
    if (!m.id.startsWith('cmd:')) continue;
    const inMove = f.state === FState.Attack;
    const idx = resolveMove(f, rt, m.id, inMove);
    if (idx < 0) continue;
    if (inMove) {
      const cur = rt.move(f.moveIdx);
      const fu = cur.followups?.find((x) => rt.moveIndex.get(x.moveId) === idx);
      if (fu && f.moveFrame >= fu.cancelFrame) { startMove(f, o, rt, idx, ev, m.justFrame); return; }
      f.pendingMove = idx; f.pendingFrame = frame; f.pendingJF = m.justFrame ? 1 : 0;
      return;
    }
    if (actionable || f.state === FState.Landing) {
      if (actionable) { startMove(f, o, rt, idx, ev, m.justFrame); return; }
    }
    // buffer while busy (stun, recovery, landing)
    f.pendingMove = idx; f.pendingFrame = frame; f.pendingJF = m.justFrame ? 1 : 0;
    return;
  }

  // 2. Execute a buffered move when we become actionable / reach the cancel frame.
  if (f.pendingMove >= 0) {
    const pm = rt.move(f.pendingMove);
    const buffer = pm.buffer ?? TUNING.defaultBuffer;
    if (frame - f.pendingFrame > buffer + 20) { f.pendingMove = -1; }
    else if (f.state === FState.Attack) {
      const cur = rt.move(f.moveIdx);
      const fu = cur.followups?.find((x) => rt.moveIndex.get(x.moveId) === f.pendingMove);
      if (fu && f.moveFrame >= fu.cancelFrame && f.moveFrame <= Math.max(fu.windowEnd, fu.cancelFrame)) {
        if (!(fu.onContact && f.moveContact === 0) && !(fu.onHitOnly && f.moveContact !== 2)) { startMove(f, o, rt, f.pendingMove, ev, f.pendingJF === 1); return; }
        f.pendingMove = -1;
      } else if (!fu) f.pendingMove = -1;
    } else if (actionable && frame - f.pendingFrame <= buffer) {
      if (conditionsMet(f, pm, rt)) { startMove(f, o, rt, f.pendingMove, ev, f.pendingJF === 1); return; }
      f.pendingMove = -1;
    } else if (actionable) f.pendingMove = -1;
  }

  if (!actionable) return;

  // 3. Movement commands.
  for (const m of matches) {
    if (m.id === SYS_DASH && f.state !== FState.Dash && f.state !== FState.Run) { startDash(f, rt, ev); return; }
    if (m.id === SYS_BACKDASH && f.state !== FState.Backdash) { startBackdash(f, rt, ev); return; }
    if (m.id === SYS_CROUCHDASH && f.state !== FState.CrouchDash) { startCrouchDash(f, rt); return; }
  }

  // 4. Tap/hold handling for up (sidestep in / jump) and down (sidestep out / crouch).
  const d = f.dir;
  const locomotive = f.state === FState.Idle || f.state === FState.Walk || f.state === FState.Dash || f.state === FState.Run;
  if (isUp(d)) {
    if (f.state === FState.Crouch) { leaveCrouch(f); }
    if (d === 8 && locomotive) {
      f.upHold++;
      if (f.upHold >= TUNING.jumpHoldFrames) startJump(f, rt, d, ev);
    } else if ((d === 7 || d === 9) && locomotive) {
      startJump(f, rt, d, ev);
    }
  } else if (f.upHold > 0) {
    if (f.upHold <= TUNING.tapWindow && locomotive) startSidestep(f, rt, true, ev);
    f.upHold = 0;
  }

  if (isDown(d)) {
    if (f.state !== FState.Crouch && (locomotive || f.state === FState.Sidewalk)) {
      f.setState(FState.Crouch);
      f.crouching = 1;
      f.downHold = 1;
    } else if (f.state === FState.Crouch) f.downHold++;
  } else if (f.state === FState.Crouch) {
    const tapped = f.downHold <= TUNING.tapWindow;
    leaveCrouch(f);
    if (tapped) startSidestep(f, rt, false, ev);
  }
}

function leaveCrouch(f: FighterState): void {
  f.setState(FState.Idle);
  f.crouching = 0;
  f.downHold = 0;
  f.wsTimer = TUNING.wsWindow;
}
