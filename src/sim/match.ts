import { Hasher } from '@/core/hash';
import { Rng } from '@/core/rng';
import { FX_ONE } from '@/core/fixed';
import type { InputFrame } from '@/input/InputFrame';
import { ingestInput, processCommands } from './actions';
import { CharacterRuntime } from './character';
import { DEFAULT_MATCH, TUNING, type MatchConfig } from './config';
import { EventQueue, EvType } from './events';
import { FighterState, FState } from './fighterState';
import { applyHit, findHit, isCounterable, Outcome, type HitResult, type ResolveOptions } from './hits';
import { applyPushAndBounds, faceOpponent, moveForward, separate, stepLocomotion } from './movement';
import type { CharacterDef } from './types';

export enum RoundPhase { Intro = 0, Fight = 1, KO = 2, End = 3, MatchOver = 4 }

export interface RoundState {
  phase: RoundPhase;
  phaseFrame: number;
  timer: number;        // frames remaining (or -1 for infinite)
  wins: [number, number];
  roundNumber: number;
  winner: number;       // -1 none, 0/1 fighter, 2 draw
  lastRoundResult: 'ko' | 'time' | 'double' | 'perfect' | 'ringout' | 'none';
}

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
  readonly options: ResolveOptions = { holdToBlock: [false, false] };
  private readonly hitA: (HitResult | null)[] = [null, null];
  private readonly counterable: boolean[] = [false, false];
  private readonly airHit: boolean[] = [false, false];
  private readonly hasher = new Hasher();

  constructor(defs: [CharacterDef, CharacterDef], config: Partial<MatchConfig> = {}) {
    this.config = { ...DEFAULT_MATCH, ...config };
    this.chars = [new CharacterRuntime(defs[0]), new CharacterRuntime(defs[1])];
    this.fighters = [new FighterState(0), new FighterState(1)];
    this.rng = new Rng(this.config.seed);
    this.round = { phase: RoundPhase.Intro, phaseFrame: 0, timer: 0, wins: [0, 0], roundNumber: 1, winner: -1, lastRoundResult: 'none' };
    this.resetRound();
    if (this.config.training) { this.round.phase = RoundPhase.Fight; }
  }

  resetRound(): void {
    const half = Math.trunc(this.config.startDistance / 2);
    const f0 = this.fighters[0], f1 = this.fighters[1];
    f0.resetForRound(-half, 0, FX_ONE, 0, this.chars[0].def.stats.hp);
    f1.resetForRound(half, 0, -FX_ONE, 0, this.chars[1].def.stats.hp);
    this.round.timer = this.config.roundTimeSec > 0 ? this.config.roundTimeSec * 60 : -1;
    this.round.phase = this.config.training ? RoundPhase.Fight : RoundPhase.Intro;
    this.round.phaseFrame = 0;
    this.round.winner = -1;
    if (!this.config.training) { f0.setState(FState.Intro, TUNING.roundStartFrames); f1.setState(FState.Intro, TUNING.roundStartFrames); }
    this.events.push(EvType.RoundStart, -1, -1, 0, 0, 0, this.round.roundNumber);
  }

  /** Advance one frame. inputs[0] is P1's absolute InputFrame, inputs[1] P2's. */
  step(inputs: readonly [InputFrame, InputFrame]): void {
    const [a, b] = this.fighters;
    const [ra, rb] = this.chars;
    this.events.clear();
    a.px = a.x; a.py = a.y; a.pz = a.z; a.pfx = a.fx; a.pfz = a.fz;
    b.px = b.x; b.py = b.y; b.pz = b.z; b.pfx = b.fx; b.pfz = b.fz;

    this.stepRoundPhase();
    const fighting = this.round.phase === RoundPhase.Fight;

    ingestInput(a, inputs[0]);
    ingestInput(b, inputs[1]);

    // 1. hit-stop countdown; frozen fighters skip state advance & movement
    const frozenA = a.hitstop > 0, frozenB = b.hitstop > 0;
    if (frozenA) a.hitstop--;
    if (frozenB) b.hitstop--;

    // 2. advance timers / move frames
    if (!frozenA) this.advanceState(a, b, ra);
    if (!frozenB) this.advanceState(b, a, rb);

    // 3. commands (also allowed during hit-stop so buffered inputs register)
    if (fighting) {
      processCommands(a, b, ra, this.frame, this.events);
      processCommands(b, a, rb, this.frame, this.events);
    }

    // 4. locomotion + attack root motion
    if (!frozenA) { stepLocomotion(a, ra, b, this.events); this.attackMotion(a, ra); this.airPhysics(a, ra); }
    if (!frozenB) { stepLocomotion(b, rb, a, this.events); this.attackMotion(b, rb); this.airPhysics(b, rb); }
    applyPushAndBounds(a, this.config.arena);
    applyPushAndBounds(b, this.config.arena);
    separate(a, b, ra.def.stats.pushRadius, rb.def.stats.pushRadius, this.config.arena);

    // 5. hit resolution (symmetric: both evaluated on the same state, then applied)
    if (fighting) {
      this.hitA[0] = frozenA ? null : findHit(a, b, ra, rb);
      this.hitA[1] = frozenB ? null : findHit(b, a, rb, ra);
      this.counterable[0] = isCounterable(b, rb);
      this.counterable[1] = isCounterable(a, ra);
      this.airHit[0] = b.isAirborne();
      this.airHit[1] = a.isAirborne();
      const h0 = this.hitA[0], h1 = this.hitA[1];
      if (h0) this.resolve(a, b, ra, rb, h0, this.counterable[0] as boolean, this.airHit[0] as boolean);
      if (h1) this.resolve(b, a, rb, ra, h1, this.counterable[1] as boolean, this.airHit[1] as boolean);
      this.checkKO();
    }

    // 6. training-mode regen
    if (this.config.training) {
      for (const f of this.fighters) {
        if (f.hp < f.maxHp && f.state === FState.Idle && f.comboHits === 0 && f.stateFrame > 60) f.hp = Math.min(f.maxHp, f.hp + 2);
        if (f.hp <= 0) f.hp = f.maxHp;
      }
    }

    this.frame++;
  }

  private resolve(a: FighterState, b: FighterState, ra: CharacterRuntime, rb: CharacterRuntime, h: HitResult, counterable: boolean, air: boolean): void {
    const out = applyHit(a, b, ra, rb, h, counterable, this.options, this.events, air);
    if (out === Outcome.Hit || out === Outcome.Counter) {
      // being hit cancels the defender's pending inputs
      b.pendingMove = -1;
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
          f.comboHits = 0; f.comboDamage = 0; f.juggleLift = 100;
          f.setState(f.crouching ? FState.Crouch : FState.Idle);
        }
        break;
      }
      case FState.Lying: {
        f.lyingFrames++;
        if (f.lyingFrames >= TUNING.lyingFrames || f.buttons !== 0 || f.dir !== 5) {
          f.setState(FState.Getup, TUNING.getupFrames);
          f.comboHits = 0; f.comboDamage = 0; f.juggleLift = 100; f.boundUsed = 0; f.screwUsed = 0;
        }
        break;
      }
      case FState.Getup: {
        if (f.stateFrame >= f.stateTotal) { faceOpponent(f, o); f.setState(FState.Idle); }
        break;
      }
      case FState.Intro: case FState.Win: case FState.KO:
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
    if (f.state === FState.Air || (f.state === FState.Attack && f.y > 0 && f.vy !== 0)) {
      f.x += f.vx; f.z += f.vz; f.y += f.vy;
      f.vy -= Math.trunc((g * rt.def.stats.weight) / 100);
      if (f.y <= 0) {
        f.y = 0; f.vx = 0; f.vz = 0; f.vy = 0;
        if (f.state === FState.Air) {
          f.setState(FState.Lying, 0);
          f.lyingFrames = 0;
          f.techWindow = TUNING.techWindow;
          this.events.push(EvType.Land, f.idx, -1, f.x, 0, f.z, 1);
        } else {
          f.setState(FState.Landing, TUNING.landingFrames);
        }
      }
    }
  }

  private checkKO(): void {
    if (this.config.training) return;
    const [a, b] = this.fighters;
    if (a.hp <= 0 || b.hp <= 0) {
      if (a.hp <= 0) { a.ko = 1; }
      if (b.hp <= 0) { b.ko = 1; }
      this.round.phase = RoundPhase.KO;
      this.round.phaseFrame = 0;
      const winner = a.hp <= 0 && b.hp <= 0 ? 2 : a.hp <= 0 ? 1 : 0;
      this.round.winner = winner;
      this.round.lastRoundResult = winner === 2 ? 'double' : (this.fighters[winner]?.hp === this.fighters[winner]?.maxHp ? 'perfect' : 'ko');
      const loser = winner === 0 ? b : a;
      this.events.push(EvType.KO, loser.idx, winner, loser.x, loser.y, loser.z, 0);
    }
  }

  private stepRoundPhase(): void {
    const r = this.round;
    r.phaseFrame++;
    const [a, b] = this.fighters;
    switch (r.phase) {
      case RoundPhase.Intro:
        if (r.phaseFrame >= TUNING.roundStartFrames) {
          r.phase = RoundPhase.Fight; r.phaseFrame = 0;
          a.setState(FState.Idle); b.setState(FState.Idle);
        }
        break;
      case RoundPhase.Fight:
        if (r.timer > 0) {
          r.timer--;
          if (r.timer === 0) {
            r.phase = RoundPhase.KO; r.phaseFrame = 0;
            r.winner = a.hp === b.hp ? 2 : a.hp > b.hp ? 0 : 1;
            r.lastRoundResult = 'time';
            this.events.push(EvType.KO, -1, r.winner, 0, 0, 0, 1);
          }
        }
        break;
      case RoundPhase.KO:
        if (r.phaseFrame >= TUNING.koSlowmoFrames) {
          r.phase = RoundPhase.End; r.phaseFrame = 0;
          if (r.winner === 0 || r.winner === 1) r.wins[r.winner]++;
          else { r.wins[0]++; r.wins[1]++; }
          const w = r.winner === 0 || r.winner === 1 ? this.fighters[r.winner] : null;
          if (w) w.setState(FState.Win, 0);
          this.events.push(EvType.RoundEnd, r.winner, -1, 0, 0, 0, r.winner);
        }
        break;
      case RoundPhase.End:
        if (r.phaseFrame >= TUNING.roundEndFrames) {
          if ((r.wins[0] >= this.config.roundsToWin) || (r.wins[1] >= this.config.roundsToWin)) {
            r.phase = RoundPhase.MatchOver; r.phaseFrame = 0;
          } else {
            r.roundNumber++;
            this.resetRound();
          }
        }
        break;
      case RoundPhase.MatchOver:
        break;
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
