import { FX_ONE, inorm2, ipct, isqrt } from '@/core/fixed';
import type { ArenaDef } from './config';
import { TUNING } from './config';
import { FighterState, FState } from './fighterState';
import type { CharacterRuntime } from './character';
import { isBack, isDown, isForward, isUp } from '@/input/InputFrame';
import { EvType, type EventQueue } from './events';

/** Face the opponent (Q12). Called on actionable frames and at move start. */
export function faceOpponent(f: FighterState, o: FighterState): void {
  const dx = o.x - f.x, dz = o.z - f.z;
  if (dx === 0 && dz === 0) return;
  const n = inorm2(dx, dz);
  f.fx = n.x; f.fz = n.z;
}

export function moveForward(f: FighterState, mm: number): void {
  f.x += Math.trunc((f.fx * mm) / FX_ONE);
  f.z += Math.trunc((f.fz * mm) / FX_ONE);
}

/** Sidestep direction in world space. P1 UP = fighter left, P2 UP = fighter right. */
export function sideVector(f: FighterState, up: boolean): { x: number; z: number } {
  // right = (-fz, fx)
  const rx = -f.fz, rz = f.fx;
  const sign = (up ? 1 : -1) * (f.idx === 0 ? -1 : 1);
  return { x: rx * sign, z: rz * sign };
}

function sideIsStrong(f: FighterState, rt: CharacterRuntime, sx: number, sz: number): boolean {
  const rx = -f.fz, rz = f.fx;
  const dot = rx * sx + rz * sz; // > 0 means stepping to the fighter's right
  const right = dot > 0;
  return rt.def.stats.strongSide === (right ? 'right' : 'left');
}

export function startSidestep(f: FighterState, rt: CharacterRuntime, up: boolean, ev: EventQueue): void {
  const v = sideVector(f, up);
  f.sx = v.x; f.sz = v.z;
  f.setState(FState.Sidestep, rt.def.stats.sidestepFrames);
  f.crouching = 0;
  f.stepStrong = sideIsStrong(f, rt, v.x, v.z) ? 1 : 0;
  ev.push(EvType.Step, f.idx, -1, f.x, f.y, f.z, up ? 1 : 0);
}

export function startDash(f: FighterState, rt: CharacterRuntime, ev: EventQueue): void {
  f.setState(FState.Dash, rt.def.stats.dashFrames);
  f.crouching = 0;
  ev.push(EvType.Dash, f.idx, -1, f.x, f.y, f.z, 1);
}

export function startBackdash(f: FighterState, rt: CharacterRuntime, ev: EventQueue): void {
  const s = rt.def.stats;
  f.setState(FState.Backdash, s.backdashFrames + s.backdashRecovery);
  f.crouching = 0;
  ev.push(EvType.Dash, f.idx, -1, f.x, f.y, f.z, 0);
}

export function startCrouchDash(f: FighterState, _rt: CharacterRuntime): void {
  f.setState(FState.CrouchDash, 10);
  f.crouching = 1;
}

export function startJump(f: FighterState, rt: CharacterRuntime, dir: number, ev: EventQueue): void {
  const s = rt.def.stats;
  f.setState(FState.Jump, 0);
  f.vy = s.jumpVy;
  const horiz = isForward(dir) ? 22 : isBack(dir) ? -18 : 0;
  f.vx = Math.trunc((f.fx * horiz) / FX_ONE);
  f.vz = Math.trunc((f.fz * horiz) / FX_ONE);
  f.crouching = 0;
  f.upHold = 0;
  ev.push(EvType.Jump, f.idx, -1, f.x, f.y, f.z);
}

/**
 * Per-frame movement for locomotion states. Attack root motion lives in actions.
 * Returns nothing; mutates position/state.
 */
export function stepLocomotion(f: FighterState, rt: CharacterRuntime, o: FighterState, ev: EventQueue): void {
  const s = rt.def.stats;
  const d = f.dir;
  switch (f.state) {
    case FState.Idle:
    case FState.Walk: {
      faceOpponent(f, o);
      if (isForward(d) && !isDown(d) && !isUp(d)) { moveForward(f, s.walkF); if (f.state !== FState.Walk) f.setState(FState.Walk); }
      else if (isBack(d) && !isDown(d) && !isUp(d)) { moveForward(f, -s.walkB); if (f.state !== FState.Walk) f.setState(FState.Walk); }
      else if (f.state === FState.Walk) f.setState(FState.Idle);
      break;
    }
    case FState.Crouch: {
      faceOpponent(f, o);
      f.crouching = 1;
      break;
    }
    case FState.Dash: {
      faceOpponent(f, o);
      const t = f.stateFrame;
      const speed = s.dashSpeed - Math.trunc((s.dashSpeed * t) / (s.dashFrames + 2));
      moveForward(f, speed);
      if (f.stateFrame >= f.stateTotal - 1) {
        if (isForward(d)) f.setState(FState.Run, 0); else f.setState(FState.Idle);
      }
      break;
    }
    case FState.Run: {
      faceOpponent(f, o);
      if (!isForward(d)) { f.setState(FState.Idle); break; }
      moveForward(f, s.dashSpeed + 6);
      break;
    }
    case FState.Backdash: {
      const t = f.stateFrame;
      if (t < s.backdashFrames) {
        const speed = s.backdashSpeed - Math.trunc((s.backdashSpeed * t) / (s.backdashFrames + 3));
        moveForward(f, -speed);
      } else if (isDown(d)) {
        // backdash cancel into crouch
        f.setState(FState.Crouch);
        f.crouching = 1;
      }
      if (f.stateFrame >= f.stateTotal - 1) f.setState(FState.Idle);
      break;
    }
    case FState.Sidestep: {
      const t = f.stateFrame;
      let dist = s.sidestepDist;
      if (!f.stepStrong) dist = ipct(dist, s.sidestepWeakScale);
      // ease-out: front-loaded movement
      const per = Math.trunc((dist * 2 * (s.sidestepFrames - t)) / (s.sidestepFrames * (s.sidestepFrames + 1)));
      f.x += Math.trunc((f.sx * per) / FX_ONE);
      f.z += Math.trunc((f.sz * per) / FX_ONE);
      if (f.stateFrame >= f.stateTotal - 1) {
        const stillHeld = (isUp(d) && f.sx !== 0 && sameSide(f, true)) || (isDown(d) && sameSide(f, false));
        if (stillHeld) { f.setState(FState.Sidewalk, 0); }
        else { faceOpponent(f, o); f.setState(FState.Idle); }
      }
      break;
    }
    case FState.Sidewalk: {
      faceOpponent(f, o);
      const up = isUp(d), down = isDown(d);
      if (!up && !down) { f.setState(FState.Idle); break; }
      const v = sideVector(f, up);
      const speed = 14;
      f.x += Math.trunc((v.x * speed) / FX_ONE);
      f.z += Math.trunc((v.z * speed) / FX_ONE);
      if (down) f.crouching = 0; // sidewalking down is not a crouch
      break;
    }
    case FState.CrouchDash: {
      const t = f.stateFrame;
      moveForward(f, 38 - t * 2);
      f.crouching = 1;
      if (f.stateFrame >= f.stateTotal - 1) {
        if (isDown(d)) f.setState(FState.Crouch); else { f.setState(FState.Idle); f.crouching = 0; f.wsTimer = TUNING.wsWindow; }
      }
      break;
    }
    case FState.Jump: {
      f.x += f.vx; f.z += f.vz; f.y += f.vy;
      f.vy -= s.gravity;
      if (f.y <= 0) {
        f.y = 0; f.vx = 0; f.vz = 0; f.vy = 0;
        f.setState(FState.Landing, TUNING.landingFrames);
        ev.push(EvType.Land, f.idx, -1, f.x, 0, f.z);
      }
      break;
    }
    case FState.Landing: {
      if (f.stateFrame >= f.stateTotal - 1) f.setState(FState.Idle);
      break;
    }
    default:
      break;
  }
}

function sameSide(f: FighterState, up: boolean): boolean {
  const v = sideVector(f, up);
  return v.x === f.sx && v.z === f.sz;
}

/** Apply hit pushback velocity, then clamp to the arena. */
export function applyPushAndBounds(f: FighterState, arena: ArenaDef, applyPush = true): void {
  if (applyPush && f.pushFrames > 0) {
    f.x += f.pushX; f.z += f.pushZ;
    f.pushFrames--;
    // decay
    f.pushX -= Math.trunc(f.pushX / 4); f.pushZ -= Math.trunc(f.pushZ / 4);
    if (f.pushFrames === 0) { f.pushX = 0; f.pushZ = 0; }
  }
  // Walls clamp everyone; open edges clamp only fighters who are on their feet
  // (airborne / knocked-down fighters can leave the floor = ring-out).
  const grounded = !f.isAirborne() && f.state !== FState.Lying && f.state !== FState.Thrown && f.pushFrames === 0;
  if (arena.walls || grounded) {
    let touched = 0;
    if (f.x < -arena.halfX) { f.x = -arena.halfX; touched = 1; }
    if (f.x > arena.halfX) { f.x = arena.halfX; touched = 1; }
    if (f.z < -arena.halfZ) { f.z = -arena.halfZ; touched = 1; }
    if (f.z > arena.halfZ) { f.z = arena.halfZ; touched = 1; }
    f.wallTouch = arena.walls ? touched : 0;
  }
}

/** Keep grounded fighters from overlapping (pushbox separation). */
export function separate(a: FighterState, b: FighterState, ra: number, rb: number, arena: ArenaDef): void {
  if (a.isAirborne() || b.isAirborne()) return;
  if (a.state === FState.Lying || b.state === FState.Lying) return;
  if (a.state === FState.Thrown || b.state === FState.Thrown) return;
  const dx = b.x - a.x, dz = b.z - a.z;
  const minSep = ra + rb;
  const dist2 = dx * dx + dz * dz;
  if (dist2 >= minSep * minSep) return;
  const n = inorm2(dx === 0 && dz === 0 ? a.fx : dx, dx === 0 && dz === 0 ? a.fz : dz);
  const dist = isqrt(dist2);
  const overlap = minSep - dist;
  const half = Math.trunc(overlap / 2);
  const aWall = arena.walls && (Math.abs(a.x) >= arena.halfX || Math.abs(a.z) >= arena.halfZ) ? 1 : 0;
  const bWall = arena.walls && (Math.abs(b.x) >= arena.halfX || Math.abs(b.z) >= arena.halfZ) ? 1 : 0;
  const aShare = bWall && !aWall ? overlap : aWall && !bWall ? 0 : half;
  const bShare = overlap - aShare;
  a.x -= Math.trunc((n.x * aShare) / FX_ONE); a.z -= Math.trunc((n.z * aShare) / FX_ONE);
  b.x += Math.trunc((n.x * bShare) / FX_ONE); b.z += Math.trunc((n.z * bShare) / FX_ONE);
}
