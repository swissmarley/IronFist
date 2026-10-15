import { Quaternion, Vector3 } from 'three';
import type { FighterState } from '@/sim/fighterState';
import { FState } from '@/sim/fighterState';
import type { CharacterRuntime } from '@/sim/character';
import { GETUP_KIPUP, GETUP_ROLL_BACK, GETUP_STAND } from '@/sim/oki';
import { buildClipSet, type ClipSet } from './clips';
import { evaluateClip, Pose, type Clip } from './pose';
import { buildMoveClip, buildThrownClip } from './templates';

const BLEND_FRAMES = 4;

/**
 * Maps a fighter's sim state to an animation clip + time and produces the
 * render pose with short crossfades. Pure math; the view applies the pose.
 */
export class FighterAnimator {
  readonly pose = new Pose();
  private readonly target = new Pose();
  private readonly from = new Pose();
  private clips: ClipSet;
  private moveClips = new Map<number, Clip>();
  private current: Clip | null = null;
  private blend = 1; // 0..1 progress of the crossfade from `from` to the current clip
  private readonly rt: CharacterRuntime;
  private shudder = 0;
  private readonly tmpQ = new Quaternion();
  private readonly tmpV = new Vector3();

  constructor(rt: CharacterRuntime, clips: ClipSet = buildClipSet()) {
    this.rt = rt;
    this.clips = clips;
  }

  private moveClip(idx: number): Clip {
    let c = this.moveClips.get(idx);
    if (!c) { c = buildMoveClip(this.rt.move(idx)); this.moveClips.set(idx, c); }
    return c;
  }

  /** Select the clip and local time for the fighter's state. */
  private select(f: FighterState, alpha: number, o: FighterState | null): { clip: Clip; time: number } {
    const c = this.clips;
    const sf = f.stateFrame + alpha;
    switch (f.state) {
      case FState.Attack: {
        const clip = this.moveClip(f.moveIdx);
        return { clip, time: f.moveFrame + (f.hitstop > 0 ? 0 : alpha) };
      }
      case FState.Walk: return { clip: f.vx !== 0 || true ? (isWalkingBack(f) ? c.walkB : c.walkF) : c.idle, time: sf };
      case FState.Crouch: return f.stateFrame < 4 ? { clip: c.crouch, time: sf } : { clip: c.crouchIdle, time: sf - 4 };
      case FState.Dash: return { clip: c.dash, time: sf };
      case FState.Run: return { clip: c.run, time: sf };
      case FState.Backdash: return { clip: c.backdash, time: sf };
      case FState.Sidestep: return { clip: isStepIn(f) ? c.sidestepIn : c.sidestepOut, time: sf };
      case FState.Sidewalk: return { clip: c.sidewalk, time: sf };
      case FState.CrouchDash: return { clip: c.crouchDash, time: sf };
      case FState.Jump: return { clip: c.jump, time: sf };
      case FState.Landing: return { clip: c.landing, time: sf };
      case FState.Blockstun: return { clip: f.crouching ? c.crouchGuard : c.guard, time: 2 };
      case FState.Hitstun: {
        const clip = f.crouching ? c.hitCrouch : f.lastReaction >= 2 ? c.hitHeavy : f.lastReaction === 1 ? c.hitMedium : c.hitLight;
        return { clip, time: Math.min(sf, clip.length - 1) * 0.6 };
      }
      case FState.Stagger: return { clip: c.stagger, time: sf };
      case FState.Air: return { clip: c.launched, time: sf };
      case FState.WallSplat: return { clip: c.wallSplat, time: sf };
      case FState.Lying: return { clip: f.faceDown ? c.lyingDown : c.lyingUp, time: sf };
      case FState.Getup: return { clip: f.getupKind === GETUP_KIPUP ? c.kipup : c.getup, time: sf };
      case FState.Roll: return { clip: f.getupKind === GETUP_ROLL_BACK || f.getupKind === GETUP_STAND ? c.rollBack : c.rollSide, time: sf };
      case FState.Throw: {
        const clip = f.throwMove >= 0 ? this.moveClip(f.throwMove) : c.throwing;
        if (f.throwMove >= 0) {
          const t = this.rt.move(f.throwMove).throw;
          return { clip: throwerClip(this, f.throwMove, t?.duration ?? 60), time: f.throwFrame + alpha };
        }
        return { clip, time: f.throwFrame + alpha };
      }
      case FState.Thrown: {
        const partner = o;
        const dur = partner && partner.throwMove >= 0 ? (this.rt.move(partner.throwMove).throw?.duration ?? 60) : 60;
        return { clip: thrownClip(this, dur, f.faceDown === 1), time: f.throwFrame + alpha };
      }
      case FState.KO: return { clip: c.ko, time: sf };
      case FState.Intro: return { clip: c.intro, time: sf };
      case FState.Win: return { clip: c.win, time: sf };
      case FState.Idle:
      default:
        return { clip: c.idle, time: sf };
    }
  }

  /** Compute the render pose for this frame. */
  update(f: FighterState, o: FighterState | null, alpha: number, dtMs: number): Pose {
    const { clip, time } = this.select(f, alpha, o);
    if (clip !== this.current) {
      this.from.copy(this.pose);
      this.current = clip;
      this.blend = 0;
    }
    evaluateClip(clip, time, this.target);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dtMs / (BLEND_FRAMES * 16.67));
      const u = this.blend * this.blend * (3 - 2 * this.blend);
      this.pose.lerpPoses(this.from, this.target, u);
    } else {
      this.pose.copy(this.target);
    }
    // hit-stop shudder on the victim
    if (f.hitstop > 0 && (f.state === FState.Hitstun || f.state === FState.Air || f.state === FState.Blockstun || f.state === FState.WallSplat)) {
      this.shudder += dtMs;
      const amp = 0.012 * Math.min(1, f.hitstop / 6);
      this.pose.root.x += Math.sin(this.shudder * 0.9) * amp;
      this.pose.root.z += Math.cos(this.shudder * 1.3) * amp * 0.6;
    } else this.shudder = 0;
    // KO: slump
    if (f.ko && f.state !== FState.KO && f.state !== FState.Lying && f.state !== FState.Air) {
      this.tmpQ.setFromAxisAngle(this.tmpV.set(1, 0, 0), 0.4);
      (this.pose.rots[1] as Quaternion).multiply(this.tmpQ);
    }
    return this.pose;
  }
}

const throwerCache = new WeakMap<FighterAnimator, Map<number, Clip>>();
function throwerClip(a: FighterAnimator, moveIdx: number, duration: number): Clip {
  let m = throwerCache.get(a);
  if (!m) { m = new Map(); throwerCache.set(a, m); }
  let c = m.get(moveIdx);
  if (!c) {
    const base = buildClipSet().throwing;
    const scale = duration / base.length;
    c = { name: `throw${moveIdx}`, length: duration, loop: false, keys: base.keys.map((k) => ({ t: k.t * scale, pose: k.pose, ease: k.ease })) };
    m.set(moveIdx, c);
  }
  return c;
}

const thrownCache = new WeakMap<FighterAnimator, Map<string, Clip>>();
function thrownClip(a: FighterAnimator, duration: number, faceDown: boolean): Clip {
  let m = thrownCache.get(a);
  if (!m) { m = new Map(); thrownCache.set(a, m); }
  const key = `${duration}:${faceDown ? 1 : 0}`;
  let c = m.get(key);
  if (!c) { c = buildThrownClip(duration, faceDown); m.set(key, c); }
  return c;
}

function isWalkingBack(f: FighterState): boolean {
  const d = f.dir;
  return d === 4 || d === 1 || d === 7;
}

function isStepIn(f: FighterState): boolean {
  // stepping toward the fighter's left (sx,sz = -right) for P1 = "in"; see movement.sideVector
  const rx = -f.fz, rz = f.fx;
  const dot = rx * f.sx + rz * f.sz;
  const right = dot > 0;
  return f.idx === 0 ? !right : right;
}
