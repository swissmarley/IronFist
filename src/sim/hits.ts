import { FX_ONE, ipct } from '@/core/fixed';
import { isDown } from '@/input/InputFrame';
import { capsulesOverlap, contactPoint, makeWCapsule, toWorld, type WCapsule } from './collision';
import { TUNING, type ArenaDef } from './config';
import { FighterState, FState } from './fighterState';
import type { CharacterRuntime } from './character';
import { EvType, type EventQueue } from './events';
import type { CapsuleDef, HitDef, HitLevel, MoveDef, Reaction } from './types';

export type Pose = 'stand' | 'crouch' | 'air' | 'lying';

export function currentPose(f: FighterState, rt: CharacterRuntime): Pose {
  if (f.state === FState.Lying) return 'lying';
  if (f.isAirborne()) return 'air';
  if (f.state === FState.Attack && f.moveIdx >= 0) {
    const m = rt.move(f.moveIdx);
    if (m.pose) for (const p of m.pose) if (f.moveFrame >= p.frames[0] && f.moveFrame <= p.frames[1]) return p.pose;
    return f.crouching ? 'crouch' : 'stand';
  }
  if (f.state === FState.Crouch && f.stateFrame >= TUNING.crouchHurtDelay) return 'crouch';
  if (f.state === FState.CrouchDash) return 'crouch';
  if (f.crouching && (f.state === FState.Hitstun || f.state === FState.Blockstun)) return 'crouch';
  return 'stand';
}

export function hurtCapsules(f: FighterState, rt: CharacterRuntime): CapsuleDef[] {
  const hb = rt.def.hurtboxes;
  switch (currentPose(f, rt)) {
    case 'crouch': return hb.crouch;
    case 'air': return hb.air;
    case 'lying': return hb.lying;
    default: return hb.stand;
  }
}

const wA = makeWCapsule();
const wB = makeWCapsule();

export interface HitResult {
  hit: HitDef;
  hitIdx: number;
  point: [number, number, number];
}

/** Find the first active, unconsumed hit of attacker `a` overlapping defender `b`. */
export function findHit(a: FighterState, b: FighterState, rta: CharacterRuntime, rtb: CharacterRuntime): HitResult | null {
  if (a.state !== FState.Attack || a.moveIdx < 0) return null;
  const m = rta.move(a.moveIdx);
  const hurts = hurtCapsules(b, rtb);
  const bPose = currentPose(b, rtb);
  for (let i = 0; i < m.hits.length; i++) {
    const h = m.hits[i] as HitDef;
    const group = h.group ?? i;
    if (a.hitMask & (1 << group)) continue;
    if (a.moveFrame < h.frames[0] || a.moveFrame > h.frames[1]) continue;
    // highs always whiff on a crouching opponent (genre rule, independent of geometry)
    if (h.level === 'high' && bPose === 'crouch') continue;
    const tracked = h.track?.find((t) => t.frame === a.moveFrame);
    for (const c of tracked ? tracked.capsules : h.capsules) {
      toWorld(c, a.x, a.y, a.z, a.fx, a.fz, wA);
      for (const hc of hurts) {
        toWorld(hc, b.x, b.y, b.z, b.fx, b.fz, wB);
        if (capsulesOverlap(wA, wB)) return { hit: h, hitIdx: i, point: contactPoint(wA, wB) };
      }
    }
  }
  return null;
}

export function defaultHitstop(r: Reaction): number {
  switch (r) {
    case 'light': case 'crouchLight': return TUNING.hitstopLight;
    case 'medium': case 'crouchMedium': case 'trip': return TUNING.hitstopMedium;
    case 'launch': case 'launchHigh': case 'launchLow': case 'spinLaunch': case 'crumple': return TUNING.hitstopLaunch;
    case 'wallSplat': case 'wallBounce': case 'floorBreak': return TUNING.hitstopWall;
    default: return TUNING.hitstopHeavy;
  }
}

export function reactionStrength(r: Reaction): number {
  switch (r) {
    case 'light': case 'crouchLight': return 0;
    case 'medium': case 'crouchMedium': case 'trip': return 1;
    case 'launch': case 'launchHigh': case 'launchLow': case 'spinLaunch': case 'crumple': case 'bound': case 'screw': return 3;
    default: return 2;
  }
}

export function isLaunchReaction(r: Reaction): boolean {
  return r === 'launch' || r === 'launchHigh' || r === 'launchLow' || r === 'spinLaunch' || r === 'screw';
}

export function isKnockdownReaction(r: Reaction): boolean {
  return r === 'knockdown' || r === 'trip' || r === 'faceDown' || r === 'spin' || r === 'bound' || r === 'crumple';
}

/** Can the defender block this level right now? Returns 'stand', 'crouch' or null. */
export function blockType(b: FighterState, level: HitLevel, holdToBlock: boolean): 'stand' | 'crouch' | null {
  if (level === 'unblockable' || level === 'throw') return null;
  const s = b.state;
  const canGuard =
    s === FState.Idle || s === FState.Walk || s === FState.Crouch || s === FState.Blockstun || s === FState.Dash || s === FState.Run ||
    s === FState.Sidewalk || (s === FState.Sidestep && b.stateFrame >= b.stateTotal - 6) ||
    (s === FState.Backdash && b.stateFrame >= b.stateTotal - 2) || (s === FState.CrouchDash && b.stateFrame >= 6);
  if (!canGuard) return null;
  const holdingBack = b.blockHeld === 1 || holdToBlock;
  if (!holdingBack) return null;
  const crouchGuard = b.crouching === 1 || isDown(b.dir) || s === FState.Crouch;
  if (crouchGuard) {
    if (level === 'low' || level === 'smid') return 'crouch';
    if (level === 'high') return 'crouch'; // highs whiff anyway; treat as guarded
    return null; // mid hits a croucher
  }
  if (level === 'high' || level === 'mid' || level === 'smid') return 'stand';
  return null; // low hits a standing guard
}

function crushes(b: FighterState, rtb: CharacterRuntime, level: HitLevel): boolean {
  if (b.state !== FState.Attack || b.moveIdx < 0) return false;
  const m = rtb.move(b.moveIdx);
  if (!m.crush) return false;
  for (const c of m.crush) {
    if (b.moveFrame < c.frames[0] || b.moveFrame > c.frames[1]) continue;
    if (c.level === level) return true;
  }
  return false;
}

function parries(b: FighterState, rtb: CharacterRuntime, level: HitLevel): boolean {
  if (b.state !== FState.Attack || b.moveIdx < 0) return false;
  const p = rtb.move(b.moveIdx).parry;
  if (!p) return false;
  return b.moveFrame >= p.frames[0] && b.moveFrame <= p.frames[1] && p.levels.includes(level);
}

function armoured(b: FighterState, rtb: CharacterRuntime, level: HitLevel): boolean {
  if (b.state !== FState.Attack || b.moveIdx < 0) return false;
  const m = rtb.move(b.moveIdx);
  if (!m.armour) return false;
  if (level !== 'high' && level !== 'mid') return false;
  return b.moveFrame >= m.armour[0] && b.moveFrame <= m.armour[1] && b.armourHits < 1;
}

export function isCounterable(b: FighterState, rtb: CharacterRuntime): boolean {
  if (b.state !== FState.Attack || b.moveIdx < 0) return false;
  return b.moveFrame <= (rtb.lastActive[b.moveIdx] ?? 0);
}

export interface ResolveOptions {
  holdToBlock: [boolean, boolean];
  arena: ArenaDef;
}

/** Distance (mm) from a point to the nearest wall; Infinity-like for open arenas. */
export function wallDistance(x: number, z: number, arena: ArenaDef): number {
  if (!arena.walls) return 1 << 30;
  return Math.min(arena.halfX - Math.abs(x), arena.halfZ - Math.abs(z));
}

/** Lift for an airborne defender hit by `h` before juggle decay. */
function baseAirLift(h: HitDef): number {
  if (h.airLift !== undefined) return h.airLift;
  if (h.launchVy !== undefined) return Math.trunc(h.launchVy / 2);
  switch (reactionStrength(h.reaction)) {
    case 0: return 34;
    case 1: return 42;
    default: return 50;
  }
}

/** Outcome kinds for one attacker's hit check on a frame. */
export enum Outcome { None = 0, Hit = 1, Block = 2, Counter = 3, Armour = 4, Whiff = 5 }

export function pushVector(fx: number, fz: number, mm: number): [number, number] {
  const perFrame = Math.trunc(mm / 3);
  return [Math.trunc((fx * perFrame) / FX_ONE), Math.trunc((fz * perFrame) / FX_ONE)];
}

function scaledDamage(base: number, comboHits: number, ch: boolean): number {
  let d = base;
  if (ch) d = ipct(d, TUNING.chDamagePct);
  const idx = Math.min(comboHits, TUNING.scaling.length - 1);
  const pct = Math.max(TUNING.scaling[idx] as number, TUNING.scalingFloor);
  d = ipct(d, pct);
  return Math.max(1, d);
}

/**
 * Apply the consequences of attacker `a`'s hit `r` on defender `b`.
 * `bStateAtFrameStart` lets trades be evaluated symmetrically (both resolved on pre-step state).
 */
export function applyHit(
  a: FighterState, b: FighterState, rta: CharacterRuntime, rtb: CharacterRuntime,
  r: HitResult, counterable: boolean, opts: ResolveOptions, ev: EventQueue, isAirHit: boolean,
): Outcome {
  const m: MoveDef = rta.move(a.moveIdx);
  const h = r.hit;
  const group = h.group ?? r.hitIdx;
  a.hitMask |= 1 << group;
  const [px, py, pz] = r.point;

  // parry / crush / armour
  if (parries(b, rtb, h.level)) {
    const pm = rtb.move(b.moveIdx);
    const stagger = pm.parry?.stagger ?? 20;
    a.setState(FState.Stagger, stagger);
    a.stunFrames = stagger;
    a.parriedBy = b.idx;
    a.hitstop = 8; b.hitstop = 8;
    b.setState(FState.Idle);
    ev.push(EvType.Parry, b.idx, a.idx, px, py, pz, 1, a.moveIdx);
    return Outcome.Whiff;
  }
  if (crushes(b, rtb, h.level)) { ev.push(EvType.Whiff, a.idx, b.idx, px, py, pz); return Outcome.Whiff; }
  if (armoured(b, rtb, h.level)) {
    b.armourHits++;
    const dmg = Math.max(1, ipct(h.damage, 50));
    b.hp = Math.max(0, b.hp - dmg);
    a.hitstop = TUNING.hitstopMedium; b.hitstop = TUNING.hitstopMedium;
    a.moveContact = 1;
    ev.push(EvType.Armour, b.idx, a.idx, px, py, pz, 1, a.moveIdx, dmg);
    return Outcome.Armour;
  }

  const remaining = Math.max(0, m.total - a.moveFrame);

  // block
  const bt = isAirHit || b.state === FState.Hitstun || b.state === FState.Air || b.state === FState.Lying ? null : blockType(b, h.level, opts.holdToBlock[b.idx] ?? false);
  if (bt) {
    const stun = Math.max(1, remaining + h.onBlock);
    b.setState(FState.Blockstun, stun);
    b.stunFrames = stun;
    b.crouching = bt === 'crouch' ? 1 : 0;
    const hs = Math.max(2, Math.trunc((h.hitstop ?? defaultHitstop(h.reaction)) * 2 / 3));
    a.hitstop = hs; b.hitstop = hs;
    a.moveContact = 1;
    // defender slides back a little, attacker is pushed more (as in the reference genre)
    const def = pushVector(a.fx, a.fz, ipct(h.pushbackBlock, 40));
    b.pushX = def[0]; b.pushZ = def[1]; b.pushFrames = TUNING.pushFrames;
    const att = pushVector(a.fx, a.fz, -ipct(h.pushbackBlock, 60));
    if (b.wallTouch) { att[0] = Math.trunc(att[0] * 2); att[1] = Math.trunc(att[1] * 2); }
    a.pushX = att[0]; a.pushZ = att[1]; a.pushFrames = TUNING.pushFrames;
    ev.push(EvType.Block, a.idx, b.idx, px, py, pz, reactionStrength(h.reaction), a.moveIdx, 0);
    return Outcome.Block;
  }

  // hit
  const ch = counterable && !isAirHit && b.comboHits === 0;
  const grounded = b.state === FState.Lying;
  let dmg = scaledDamage(h.damage, b.comboHits, ch);
  if (grounded) dmg = Math.max(1, ipct(dmg, TUNING.groundHitPct));
  b.hp = Math.max(0, b.hp - dmg);
  b.comboHits++;
  b.comboDamage += dmg;
  b.lastHitMove = a.moveIdx;
  a.moveContact = 2;
  const reaction: Reaction = ch && h.chReaction ? h.chReaction : h.reaction;
  const hs = h.hitstop ?? defaultHitstop(reaction);
  a.hitstop = hs; b.hitstop = hs;
  b.lastReaction = reactionStrength(reaction);
  b.pendingMove = -1;

  if (grounded) {
    // ground hit: a small bounce, stays down, tech window closed
    b.lyingFrames = Math.max(0, b.lyingFrames - 10);
    b.techWindow = 0;
    b.vy = 0;
    ev.push(EvType.Hit, a.idx, b.idx, px, py, pz, 0, a.moveIdx, dmg);
    return Outcome.Hit;
  }

  const nearWall = wallDistance(b.x, b.z, opts.arena) < 1400;
  const props = m.properties ?? [];

  // wall splat: standing defender knocked into a nearby wall by a splatting move
  if (b.state === FState.WallSplat) {
    b.wallHits++;
    b.stateFrame = Math.max(0, b.stateTotal - 14);
    const bounce = b.wallHits >= 2;
    if (bounce) { b.setState(FState.Air, 0); b.vy = 10; b.vx = Math.trunc((-a.fx * 6) / FX_ONE); b.vz = Math.trunc((-a.fz * 6) / FX_ONE); }
    ev.push(EvType.Hit, a.idx, b.idx, px, py, pz, 2, a.moveIdx, dmg);
    return Outcome.Hit;
  }
  if (nearWall && !isAirHit && !b.isAirborne() && (props.includes('wallSplat') || reactionStrength(reaction) >= 2 || isKnockdownReaction(reaction))) {
    b.setState(FState.Hitstun, 6);
    b.stunFrames = 6;
    b.lastReaction = 2;
    const pb = pushVector(a.fx, a.fz, 900);
    b.pushX = pb[0]; b.pushZ = pb[1]; b.pushFrames = 6;
    b.wallHits = 0;
    b.juggleLift = 100;
    b.wallPending = 1;
    ev.push(ch ? EvType.Counter : EvType.Hit, a.idx, b.idx, px, py, pz, 2, a.moveIdx, dmg);
    return ch ? Outcome.Counter : Outcome.Hit;
  }
  if (b.isAirborne() && props.includes('wallBounce') && nearWall) {
    b.setState(FState.Air, 0);
    b.vy = 26;
    const push = 30;
    b.vx = Math.trunc((a.fx * push) / FX_ONE); b.vz = Math.trunc((a.fz * push) / FX_ONE);
    b.wallHits = 9; // marks: on wall contact, bounce back instead of splat
    ev.push(EvType.Hit, a.idx, b.idx, px, py, pz, 3, a.moveIdx, dmg);
    return Outcome.Hit;
  }

  // bound / screw: one each per combo, only on an airborne defender
  if (b.isAirborne() && (reaction === 'bound' || props.includes('bound')) && !b.boundUsed) {
    b.boundUsed = 1;
    b.setState(FState.Air, 0);
    b.vy = -60; // slam down; the ground contact in airPhysics bounces them back up
    b.vx = Math.trunc((a.fx * 8) / FX_ONE); b.vz = Math.trunc((a.fz * 8) / FX_ONE);
    b.faceDown = 2; // 2 = bound pending
    ev.push(EvType.Hit, a.idx, b.idx, px, py, pz, 3, a.moveIdx, dmg);
    return Outcome.Hit;
  }
  if (b.isAirborne() && (reaction === 'screw' || props.includes('screw')) && !b.screwUsed) {
    b.screwUsed = 1;
    b.setState(FState.Air, 0);
    b.vy = 22;
    b.vx = Math.trunc((a.fx * 34) / FX_ONE); b.vz = Math.trunc((a.fz * 34) / FX_ONE);
    b.faceDown = 3; // 3 = screw: longer floor time, no tech
    ev.push(EvType.Hit, a.idx, b.idx, px, py, pz, 3, a.moveIdx, dmg);
    return Outcome.Hit;
  }

  if (isAirHit || isLaunchReaction(reaction) || b.isAirborne()) {
    // juggle: lift decays per hit
    let lift = h.launchVy ?? 90;
    const wasAir = isAirHit || b.isAirborne();
    if (wasAir) {
      lift = Math.max(TUNING.airMinLift, ipct(baseAirLift(h), b.juggleLift));
      b.juggleLift = ipct(b.juggleLift, TUNING.liftDecayPct);
    } else {
      b.juggleLift = 100;
    }
    b.setState(FState.Air, 0);
    b.vy = lift;
    const push = wasAir ? (h.airPush ?? Math.trunc(h.pushback / 10)) : (h.launchVz ?? Math.trunc(h.pushback / 10));
    b.vx = Math.trunc((a.fx * push) / FX_ONE);
    b.vz = Math.trunc((a.fz * push) / FX_ONE);
    if (b.y <= 0) b.y = 1;
    b.faceDown = reaction === 'spinLaunch' || reaction === 'faceDown' ? 1 : 0;
    ev.push(ch ? EvType.Counter : EvType.Hit, a.idx, b.idx, px, py, pz, 3, a.moveIdx, dmg);
    if (!isAirHit) ev.push(EvType.Launch, b.idx, a.idx, b.x, b.y, b.z, lift, a.moveIdx);
    return ch ? Outcome.Counter : Outcome.Hit;
  }

  if (isKnockdownReaction(reaction)) {
    b.setState(FState.Air, 0);
    b.vy = reaction === 'crumple' ? 10 : 26;
    const push = Math.trunc(h.pushback / 3);
    b.vx = Math.trunc((a.fx * push) / FX_ONE);
    b.vz = Math.trunc((a.fz * push) / FX_ONE);
    b.y = 1;
    b.faceDown = reaction === 'faceDown' || reaction === 'spin' ? 1 : 0;
    b.juggleLift = reaction === 'crumple' ? 100 : 60;
    ev.push(ch ? EvType.Counter : EvType.Hit, a.idx, b.idx, px, py, pz, 2, a.moveIdx, dmg);
    return ch ? Outcome.Counter : Outcome.Hit;
  }

  // standing / crouching stun
  const adv = ch && h.onCH !== undefined ? h.onCH : h.onHit;
  const stun = Math.max(1, remaining + adv + (reaction === 'stagger' ? 10 : 0));
  b.setState(reaction === 'stagger' ? FState.Stagger : FState.Hitstun, stun);
  b.stunFrames = stun;
  b.crouching = reaction === 'crouchLight' || reaction === 'crouchMedium' || b.crouching ? 1 : 0;
  const pb = pushVector(a.fx, a.fz, h.pushback);
  b.pushX = pb[0]; b.pushZ = pb[1]; b.pushFrames = TUNING.pushFrames;
  if (b.wallTouch) {
    const att = pushVector(a.fx, a.fz, -ipct(h.pushback, 50));
    a.pushX = att[0]; a.pushZ = att[1]; a.pushFrames = TUNING.pushFrames;
  }
  ev.push(ch ? EvType.Counter : EvType.Hit, a.idx, b.idx, px, py, pz, reactionStrength(reaction), a.moveIdx, dmg);
  return ch ? Outcome.Counter : Outcome.Hit;
}

export function worldCapsule(c: CapsuleDef, f: FighterState, out: WCapsule): WCapsule {
  return toWorld(c, f.x, f.y, f.z, f.fx, f.fz, out);
}
