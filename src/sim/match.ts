import { Hasher } from '@/core/hash';
import { Rng } from '@/core/rng';
import { FX_ONE } from '@/core/fixed';
import type { InputFrame } from '@/input/InputFrame';
import { ingestInput, processCommands } from './actions';
import { CharacterRuntime } from './character';
import { DEFAULT_MATCH, TUNING, type MatchConfig } from './config';
import { EventQueue, EvType } from './events';
import { FighterState, FState } from './fighterState';
import { applyHit, findHit, isCounterable, type HitResult, type ResolveOptions } from './hits';
import { applyPushAndBounds, faceOpponent, moveForward, separate, stepLocomotion } from './movement';
import { checkRoundEnd, newRoundState, RoundPhase, stepRoundPhase, type RoundState } from './rounds';
import { advanceThrow, beginThrow, breakInput, resolveBreak, throwConnects } from './throws';
import { stepOki } from './oki';
import type { CharacterDef } from './types';

export { RoundPhase } from './rounds';

/**
 * The deterministic match simulation. Owns both fighters, the RNG and the round
 * flow. `step` must be called exactly once per 60 Hz frame with both inputs.
 */
export class MatchSim {
  readonly fighters: [FighterState, FighterState];
  readonly chars: [CharacterRuntime, CharacterRuntime];
  readonly config: MatchConfig;
  readonly rng: Rng;
  readonly events = new EventQueue();
  readonly round: RoundState;
  frame = 0;
  readonly options: ResolveOptions;
  private readonly hitA: (HitResult | null)[] = [null, null];
  private readonly hasher = new Hasher();

  constructor(defs: [CharacterDef, CharacterDef], config: Partial<MatchConfig> = {}) {
    this.config = { ...DEFAULT_MATCH, ...config };
    this.options = { holdToBlock: [false, false], arena: this.config.arena };
    this.chars = [new CharacterRuntime(defs[0]), new CharacterRuntime(defs[1])];
    this.fighters = [new FighterState(0), new FighterState(1)];
    this.rng = new Rng(this.config.seed);
    this.round = newRoundState();
    this.resetRound();
  }

  resetRound(): void {
    const half = Math.trunc(this.config.startDistance / 2);
    const f0 = this.fighters[0], f1 = this.fighters[1];
    const hp0 = this.config.hpOverride ?? this.chars[0].def.stats.hp;
    const hp1 = this.config.hpOverride ?? this.chars[1].def.stats.hp;
    f0.resetForRound(-half, 0, FX_ONE, 0, hp0);
    f1.resetForRound(half, 0, -FX_ONE, 0, hp1);
    if (this.config.survivalHp !== undefined) f0.hp = Math.max(1, Math.min(hp0, this.config.survivalHp));
    this.round.timer = this.config.roundTimeSec > 0 ? this.config.roundTimeSec * 60 : -1;
    this.round.phase = this.config.training ? RoundPhase.Fight : RoundPhase.Intro;
    this.round.phaseFrame = 0;
    this.round.winner = -1;
    if (!this.config.training) { f0.setState(FState.Intro, TUNING.roundStartFrames); f1.setState(FState.Intro, TUNING.roundStartFrames); }
    this.events.push(EvType.RoundStart, -1, -1, 0, 0, 0, this.round.roundNumber);
  }

  /** Start a fresh match (rematch) keeping characters and config. */
  rematch(): void {
    this.round.wins = [0, 0];
    this.round.roundNumber = 1;
    this.round.lastRoundResult = 'none';
    this.resetRound();
  }

  /** Advance one frame. inputs[0] is P1's absolute InputFrame, inputs[1] P2's. */
  step(inputs: readonly [InputFrame, InputFrame]): void {
    const [a, b] = this.fighters;
    const [ra, rb] = this.chars;
    this.events.clear();
    a.px = a.x; a.py = a.y; a.pz = a.z; a.pfx = a.fx; a.pfz = a.fz;
    b.px = b.x; b.py = b.y; b.pz = b.z; b.pfx = b.fx; b.pfz = b.fz;

    if (!this.config.training) stepRoundPhase(this.round, this.fighters, { resetRound: () => this.resetRound(), roundsToWin: this.config.roundsToWin }, this.events);
    const fighting = this.round.phase === RoundPhase.Fight;

    ingestInput(a, inputs[0]);
    ingestInput(b, inputs[1]);

    // 1. hit-stop countdown; frozen fighters skip state advance & movement
    const frozenA = a.hitstop > 0, frozenB = b.hitstop > 0;
    if (frozenA) a.hitstop--;
    if (frozenB) b.hitstop--;

    // 2. advance timers / move frames / throws
    if (!frozenA) this.advanceState(a, b, ra);
    if (!frozenB) this.advanceState(b, a, rb);
    if (fighting) this.throwBreaks();

    // 3. commands (also during hit-stop so buffered inputs register)
    if (fighting) {
      processCommands(a, b, ra, this.frame, this.events);
      processCommands(b, a, rb, this.frame, this.events);
      stepOki(a, ra, b, this.events);
      stepOki(b, rb, a, this.events);
    }

    // 4. locomotion + attack root motion + air physics + walls
    if (!frozenA) { stepLocomotion(a, ra, b, this.events); this.attackMotion(a, ra); this.airPhysics(a, ra); }
    if (!frozenB) { stepLocomotion(b, rb, a, this.events); this.attackMotion(b, rb); this.airPhysics(b, rb); }
    this.wallsAndEdges(a, frozenA);
    this.wallsAndEdges(b, frozenB);
    separate(a, b, ra.def.stats.pushRadius, rb.def.stats.pushRadius, this.config.arena);

    // 5. hit resolution (symmetric: both evaluated on the same state, then applied)
    if (fighting) {
      const t0 = frozenA ? null : throwConnects(a, b, ra);
      const t1 = frozenB ? null : throwConnects(b, a, rb);
      this.hitA[0] = frozenA || t0 ? null : findHit(a, b, ra, rb);
      this.hitA[1] = frozenB || t1 ? null : findHit(b, a, rb, ra);
      const cA = isCounterable(b, rb), cB = isCounterable(a, ra);
      const airA = b.isAirborne(), airB = a.isAirborne();
      const h0 = this.hitA[0], h1 = this.hitA[1];
      if (t0 && !t1) beginThrow(a, b, t0, this.events);
      else if (t1 && !t0) beginThrow(b, a, t1, this.events);
      else if (t0 && t1) {
        // simultaneous throws: the lower-index fighter wins the grab (deterministic tie-break)
        beginThrow(a, b, t0, this.events);
      }
      if (h0 && a.state === FState.Attack) applyHit(a, b, ra, rb, h0, cA, this.options, this.events, airA);
      if (h1 && b.state === FState.Attack) applyHit(b, a, rb, ra, h1, cB, this.options, this.events, airB);
      if (!this.config.training) checkRoundEnd(this.round, this.fighters, this.events);
    }

    // 6. training-mode regen
    if (this.config.training) {
      for (const f of this.fighters) {
        if (this.config.trainingRegen !== false && f.hp < f.maxHp && f.state === FState.Idle && f.comboHits === 0 && f.stateFrame > 60) f.hp = Math.min(f.maxHp, f.hp + 2);
        if (f.hp <= 0) f.hp = f.maxHp;
        if (f.ringOut) { f.ringOut = 0; f.x = Math.trunc(f.x / 2); f.z = Math.trunc(f.z / 2); f.y = 0; f.setState(FState.Idle); }
      }
    }

    this.frame++;
  }

  private throwBreaks(): void {
    for (const v of this.fighters) {
      if (v.state !== FState.Thrown || v.throwBreakWindow <= 0 || v.throwPartner < 0) continue;
      const t = this.fighters[v.throwPartner as 0 | 1];
      if (!t || t.throwMove < 0) continue;
      const def = this.chars[t.idx as 0 | 1]?.move(t.throwMove).throw;
      if (!def) continue;
      if (breakInput(v.input.pressed(0), def.breakButton)) resolveBreak(t, v, def, this.events);
    }
  }

  private advanceState(f: FighterState, o: FighterState, rt: CharacterRuntime): void {
    f.stateFrame++;
    if (f.wsTimer > 0) f.wsTimer--;
    switch (f.state) {
      case FState.Attack: {
        f.moveFrame++;
        const m = rt.move(f.moveIdx);
        if (m.properties?.includes('homing') && f.moveFrame < (rt.startup[f.moveIdx] ?? 0)) faceOpponent(f, o);
        if (f.y > 0 && m.landFrame !== undefined) break;
        if (f.moveFrame >= m.total) {
          if (m.endStance && rt.def.stances) {
            const si = rt.def.stances.indexOf(m.endStance);
            f.stanceIdx = si >= 0 ? si : 0;
          } else f.stanceIdx = 0;
          const endCrouch = m.pose?.some((p) => p.pose === 'crouch' && p.frames[1] >= m.total - 1) ?? false;
          f.setState(endCrouch ? FState.Crouch : FState.Idle);
          f.crouching = endCrouch ? 1 : 0;
          if (f.y > 0) f.setState(FState.Jump, 0);
        }
        break;
      }
      case FState.Hitstun:
      case FState.Blockstun:
      case FState.Stagger: {
        f.stunFrames--;
        if (f.stunFrames <= 0) {
          f.comboHits = 0; f.comboDamage = 0; f.juggleLift = 100; f.parriedBy = -1;
          f.setState(f.crouching ? FState.Crouch : FState.Idle);
        }
        break;
      }
      case FState.Throw: {
        if (f.throwPartner >= 0) advanceThrow(f, o, rt, this.events);
        else f.setState(FState.Idle);
        break;
      }
      case FState.WallSplat: {
        if (f.stateFrame >= f.stateTotal) {
          f.setState(FState.Air, 0); f.vy = 0; f.vx = 0; f.vz = 0; f.y = Math.max(f.y, 1);
          f.faceDown = 0;
        }
        break;
      }
      case FState.Intro: case FState.Win: case FState.KO: case FState.Thrown: case FState.Lying: case FState.Getup: case FState.Roll:
        break;
      default:
        break;
    }
  }

  private attackMotion(f: FighterState, rt: CharacterRuntime): void {
    if (f.state !== FState.Attack || f.moveIdx < 0) return;
    const m = rt.move(f.moveIdx);
    if (!m.motion) return;
    for (const rm of m.motion) {
      if (f.moveFrame >= rm.frames[0] && f.moveFrame <= rm.frames[1] && rm.forward !== 0) moveForward(f, rm.forward);
    }
  }

  private airPhysics(f: FighterState, rt: CharacterRuntime): void {
    const g = rt.def.stats.gravity;
    if (f.state === FState.WallSplat) return;
    if (f.state === FState.Air || (f.state === FState.Attack && f.y > 0)) {
      f.x += f.vx; f.z += f.vz; f.y += f.vy;
      f.vy -= Math.trunc((g * rt.def.stats.weight) / 100);
      if (f.y <= 0) {
        f.y = 0;
        if (f.state === FState.Air) {
          if (f.faceDown === 2) {
            // bound: slam and pop back up for a re-pickup
            f.faceDown = 0;
            f.vy = 38; f.vx = Math.trunc(f.vx / 2); f.vz = Math.trunc(f.vz / 2); f.y = 1;
            this.events.push(EvType.Land, f.idx, -1, f.x, 0, f.z, 2);
            return;
          }
          f.vx = 0; f.vz = 0; f.vy = 0;
          f.setState(FState.Lying, 0);
          f.lyingFrames = f.faceDown === 3 ? -20 : 0;
          f.techWindow = f.faceDown === 3 ? 0 : TUNING.techWindow;
          if (f.faceDown === 3) f.faceDown = 1;
          this.events.push(EvType.Land, f.idx, -1, f.x, 0, f.z, 1);
        } else {
          f.vx = 0; f.vz = 0; f.vy = 0;
          f.setState(FState.Landing, TUNING.landingFrames);
        }
      }
    }
  }

  /** Wall splat / bounce on contact, and ring-out detection on open stages. */
  private wallsAndEdges(f: FighterState, frozen: boolean): void {
    const arena = this.config.arena;
    const outside = Math.abs(f.x) > arena.halfX || Math.abs(f.z) > arena.halfZ;
    if (!arena.walls) {
      if (outside && (f.state === FState.Air || f.state === FState.Lying || (f.pushFrames > 0 && f.y === 0))) {
        if (!f.ringOut) {
          f.ringOut = 1;
          f.setState(FState.Air, 0);
          f.vy = Math.min(f.vy, 0);
          this.events.push(EvType.RingOut, f.idx, -1, f.x, f.y, f.z);
        }
      }
      applyPushAndBounds(f, arena, !frozen);
      return;
    }
    const before = { x: f.x, z: f.z };
    applyPushAndBounds(f, arena, !frozen);
    if (frozen) return;
    const hitWall = (before.x !== f.x || before.z !== f.z) && (Math.abs(before.x) > arena.halfX || Math.abs(before.z) > arena.halfZ);
    if (!hitWall && !(f.wallTouch && f.wallPending)) return;
    if (f.state === FState.Air && f.wallHits === 9) {
      // wall bounce: reverse horizontal velocity back toward the centre
      f.wallHits = 0;
      f.vx = -Math.trunc(f.vx * 7 / 10); f.vz = -Math.trunc(f.vz * 7 / 10); f.vy = Math.max(f.vy, 30);
      this.events.push(EvType.Wall, f.idx, -1, f.x, f.y, f.z, 2);
      return;
    }
    if (f.state === FState.Air && f.y > 150 && f.wallHits < 2) {
      f.setState(FState.WallSplat, TUNING.wallSplatFrames);
      f.vx = 0; f.vz = 0; f.vy = 0;
      f.y = Math.min(f.y, 900);
      f.wallHits = 0;
      f.juggleLift = 100;
      f.hitstop = TUNING.hitstopWall;
      this.events.push(EvType.Wall, f.idx, -1, f.x, f.y, f.z, 1);
      return;
    }
    if (f.wallPending && (f.state === FState.Hitstun || f.pushFrames > 0)) {
      f.wallPending = 0;
      f.pushX = 0; f.pushZ = 0; f.pushFrames = 0;
      f.setState(FState.WallSplat, TUNING.wallSplatFrames);
      f.y = 400;
      f.vx = 0; f.vz = 0; f.vy = 0;
      f.hitstop = TUNING.hitstopWall;
      this.events.push(EvType.Wall, f.idx, -1, f.x, f.y, f.z, 1);
    }
  }

  /** FNV hash of the full integer state (for replay/determinism tests). */
  hash(): number {
    const h = this.hasher.reset();
    h.int(this.frame);
    this.fighters[0].hash(h);
    this.fighters[1].hash(h);
    const s = this.rng.state();
    h.int(s[0]).int(s[1]).int(s[2]).int(s[3]);
    h.int(this.round.phase).int(this.round.phaseFrame).int(this.round.timer).int(this.round.wins[0]).int(this.round.wins[1]).int(this.round.roundNumber).int(this.round.winner);
    return h.value();
  }

  isMatchOver(): boolean {
    return this.round.phase === RoundPhase.MatchOver;
  }
}
