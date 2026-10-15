import { Rng } from '@/core/rng';
import { ilen2 } from '@/core/fixed';
import { frameFromNumpad, IN_B1, IN_B2, IN_B3, IN_B4, type InputFrame } from '@/input/InputFrame';
import type { MatchSim } from '@/sim/match';
import { FState } from '@/sim/fighterState';
import { Playbook } from './Playbook';
import { DIFFICULTIES, type AiDifficulty } from './BasicAI';

export interface LayeredOptions {
  level: number;
  seed: number;
  /** Subtle adaptive assistance (default off). */
  rubberBand?: boolean;
  /** Archetype spacing preference: 0 = rushdown … 1 = keep-away. */
  range?: number;
}

type Tendency = { high: number; mid: number; low: number; throw: number };

/**
 * Layered CPU opponent:
 *  1. frame-data layer: block punishes, whiff punishes, safe pressure
 *  2. spacing layer: approach/retreat to the archetype's preferred range
 *  3. mix-up generator: seeded high/mid/low/throw tendencies that adapt to what gets blocked
 *  4. defensive layer: delayed reactions, level reads, sidesteps, throw breaks, wake-up choices
 *  5. playbook: the character's own moves and juggle follow-ups
 *  6. difficulty: reaction time, execution accuracy, read quality (never stat cheats)
 */
export class LayeredAI {
  readonly rng: Rng;
  readonly book: Playbook;
  private readonly diff: AiDifficulty;
  private readonly idx: number;
  private plan: InputFrame[] = [];
  private planLabel = '';
  private seenAttackAt = -1;
  private lastDecision = -1000;
  private tendency: Tendency = { high: 25, mid: 40, low: 25, throw: 10 };
  private blockedLast: 'high' | 'mid' | 'low' | 'throw' | null = null;
  private opponentWasAttacking = false;
  private readonly rangePref: number;
  private readonly rubber: boolean;
  private lastHpSelf = 0;
  private lastHpOpp = 0;

  constructor(sim: MatchSim, idx: number, o: LayeredOptions) {
    this.idx = idx;
    this.diff = DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, o.level))] as AiDifficulty;
    this.rng = new Rng((o.seed ^ 0xa17e) + idx * 7919);
    this.book = new Playbook(sim.chars[idx as 0 | 1], idx === 0);
    this.rangePref = o.range ?? defaultRange(sim.chars[idx as 0 | 1].def.archetype);
    this.rubber = o.rubberBand ?? false;
  }

  get label(): string { return this.planLabel; }

  decide(sim: MatchSim): InputFrame {
    const me = sim.fighters[this.idx as 0 | 1], op = sim.fighters[(1 - this.idx) as 0 | 1];
    const facingRight = this.idx === 0;
    const F = (dir: number, b = 0): InputFrame => frameFromNumpad(dir, b, facingRight);
    const frame = sim.frame;
    if (me.ko || me.state === FState.Intro || me.state === FState.Win || me.state === FState.KO) return 0;
    this.observe(sim);

    if (this.plan.length > 0) return this.plan.shift() as InputFrame;

    const dist = ilen2(op.x - me.x, op.z - me.z);
    const opAttacking = op.state === FState.Attack && op.moveIdx >= 0;
    const opMove = opAttacking ? sim.chars[op.idx as 0 | 1].move(op.moveIdx) : null;
    const opHit = opMove?.hits[0] ?? null;

    // --- throw break -------------------------------------------------------
    if (me.state === FState.Thrown) {
      if (me.throwBreakWindow > 0 && op.throwMove >= 0) {
        const t = sim.chars[op.idx as 0 | 1].move(op.throwMove).throw;
        if (t && this.rng.chance(this.diff.breakPct)) {
          const correct = this.rng.chance(50 + this.diff.punishPct / 2);
          const btn = !correct ? (this.rng.chance(50) ? IN_B1 : IN_B2) : t.breakButton === 1 ? IN_B1 : t.breakButton === 2 ? IN_B2 : IN_B1 | IN_B2;
          return this.run([F(5, btn)], 'break');
        }
      }
      return 0;
    }
    // --- wake-up -----------------------------------------------------------
    if (me.state === FState.Lying) {
      if (me.techWindow > 0 && this.rng.chance(40 + this.diff.punishPct / 2)) return F(5, IN_B4);
      if (me.lyingFrames > 8) {
        const r = this.rng.nextInt(100);
        if (dist < 1300 && r < 25) return this.run([F(5, IN_B3)], 'floor-kick');
        if (r < 55) return F(4);           // roll back
        if (r < 80) return F(8);           // kip-up
        return F(2);                       // stay down a moment
      }
      return 0;
    }
    if (!me.isActionable()) return me.blockHeld ? F(me.crouching ? 1 : 4) : 0;

    // --- defensive layer ---------------------------------------------------
    if (opAttacking && opMove && opHit) {
      if (this.seenAttackAt < 0) this.seenAttackAt = frame;
      const reacted = frame - this.seenAttackAt >= this.diff.reaction;
      const incoming = dist < 2200;
      if (reacted && incoming) {
        if (opMove.throw) {
          if (this.rng.chance(this.diff.stepPct * 2)) return this.run([F(2), F(2), F(2)], 'duck-throw');
          if (this.rng.chance(this.diff.blockPct / 2)) return this.run([F(8), F(8), F(5), F(5)], 'step-throw');
        } else if (this.rng.chance(this.diff.blockPct)) {
          const readsLevel = this.rng.chance(40 + this.diff.punishPct * 0.6);
          const level = readsLevel ? opHit.level : (this.rng.chance(70) ? 'mid' : 'low');
          const homing = opMove.properties?.includes('homing');
          if (!homing && this.rng.chance(this.diff.stepPct) && opHit.frames[0] >= 14) return this.run([F(8), F(8), F(5), F(5), F(5)], 'sidestep');
          if (level === 'high' && this.rng.chance(this.diff.stepPct * 2)) { const ws = this.book.launchers[0]; return this.run([F(2), F(2), F(2), F(2), ...(ws ? [F(5, IN_B2)] : [])], 'duck-high'); }
          const pc = this.book.powerCrush[0];
          if (pc && (opHit.level === 'mid' || opHit.level === 'high') && this.rng.chance(this.diff.stepPct / 2)) return this.run(pc.input, 'power-crush');
          return level === 'low' ? F(1) : F(4);
        }
      }
    } else {
      this.seenAttackAt = -1;
    }

    // --- frame-data layer: block punish ------------------------------------
    if (me.state === FState.Blockstun && opAttacking && opHit && me.stunFrames <= 1) {
      const opFree = opMove ? opMove.total - op.moveFrame : 0;
      const window = opFree - me.stunFrames;
      if (opHit.onBlock <= -10 && this.rng.chance(this.diff.punishPct)) {
        const p = this.book.punisher(Math.max(10, window + 1), dist);
        if (p) return this.run(this.execute(p.input), `punish:${p.move.id}`);
      }
    }
    // whiff punish: opponent recovering in reach, not threatening
    if (opAttacking && opMove && op.moveFrame > (sim.chars[op.idx as 0 | 1].lastActive[op.moveIdx] ?? 0) && opMove.total - op.moveFrame >= 12 && dist < 1700 && this.rng.chance(this.diff.punishPct)) {
      const wp = this.book.inReach(this.book.whiffPunishers, dist + 200)[0];
      if (wp) return this.run(this.execute(wp.input), `whiff:${wp.move.id}`);
    }

    if (frame - this.lastDecision < this.diff.think) return this.hold(dist, F);
    this.lastDecision = frame;

    // --- juggle / oki --------------------------------------------------------
    if (op.isAirborne() && op.y > 200 && dist < 1400) {
      const j = this.book.inReach(this.book.pokes.concat(this.book.mids), dist + 300).filter((p) => p.startup <= 14)[0];
      if (j) return this.run(this.execute(j.input), `juggle:${j.move.id}`);
      return F(6);
    }
    if (op.state === FState.Lying) {
      if (dist < 1250 && this.rng.chance(45)) { const g = this.book.inReach(this.book.groundHits, dist + 150)[0]; if (g) return this.run(this.execute(g.input), `oki:${g.move.id}`); }
      return dist > 1000 ? F(6) : (this.rng.chance(50) ? F(4) : F(5));
    }

    // --- spacing layer ---------------------------------------------------------
    const ideal = 900 + this.rangePref * 900;
    const aggression = this.diff.aggression + (this.rubber ? this.rubberAdjust(me.hp, op.hp) : 0);
    if (dist > ideal + 600) return this.rng.chance(35) ? this.run([F(6), F(5), F(6), F(6), F(6), F(6), F(6)], 'dash-in') : F(6);
    if (dist < ideal - 500 && this.rng.chance(100 - aggression)) return this.run([F(4), F(5), F(4), F(5), F(4)], 'backdash');

    // --- mix-up generator ----------------------------------------------------
    if (!this.rng.chance(aggression)) {
      const r = this.rng.nextInt(100);
      if (r < 30) return this.run([F(4), F(4), F(4)], 'walk-back');
      if (r < 45) return this.run([F(2), F(2), F(5), F(5)], 'ss-out');
      if (r < 60) return this.run([F(8), F(8), F(5), F(5)], 'ss-in');
      return F(4);
    }
    const choice = this.pickCategory(dist);
    const pool = choice === 'throw' ? this.book.throws : choice === 'low' ? this.book.lows : choice === 'high' ? this.book.pokes.filter((p) => p.level === 'high') : (dist > 1500 ? this.book.launchers.concat(this.book.mids) : this.book.pokes.concat(this.book.mids, this.book.launchers));
    let candidates = this.book.inReach(pool, dist);
    // skilled players prefer safe pokes in neutral; launchers only when the range makes them a whiff-punish
    if (this.rng.chance(this.diff.safePct)) { const safe = candidates.filter((p) => p.safe || p.isThrow || (p.launcher && dist > 1300)); if (safe.length > 0) candidates = safe; }
    const pick = candidates[this.rng.nextInt(Math.max(1, candidates.length))] ?? this.book.inReach(this.book.pokes, dist)[0] ?? this.book.inReach(this.book.homing, dist + 200)[0];
    if (!pick) return dist > 1200 ? F(6) : F(4);
    return this.run(this.execute(pick.input), `attack:${pick.move.id}`);
  }

  /** Between decisions: close distance, or stand guard with a probability tied to the level's discipline. */
  private hold(dist: number, F: (d: number, b?: number) => InputFrame): InputFrame {
    if (dist > 1500) return F(6);
    return this.rng.chance(this.diff.blockPct * 0.6) ? F(4) : F(5);
  }

  private pickCategory(dist: number): 'high' | 'mid' | 'low' | 'throw' {
    const t = { ...this.tendency };
    if (dist > 1100) t.throw = 0;
    const total = t.high + t.mid + t.low + t.throw;
    let r = this.rng.nextInt(Math.max(1, total));
    for (const k of ['high', 'mid', 'low', 'throw'] as const) { r -= t[k]; if (r < 0) return k; }
    return 'mid';
  }

  /** Adapt tendencies from what the opponent blocked last: blocked lows -> more mids, etc. */
  private observe(sim: MatchSim): void {
    const me = sim.fighters[this.idx as 0 | 1], op = sim.fighters[(1 - this.idx) as 0 | 1];
    if (me.state === FState.Attack && me.moveContact === 1 && me.moveIdx >= 0) {
      const h = sim.chars[this.idx as 0 | 1].move(me.moveIdx).hits[0];
      const lvl = h ? (h.level === 'high' ? 'high' : h.level === 'low' ? 'low' : 'mid') : null;
      if (lvl && lvl !== this.blockedLast) {
        this.blockedLast = lvl;
        if (lvl === 'low') { this.tendency.low = Math.max(10, this.tendency.low - 6); this.tendency.mid += 4; this.tendency.throw += 2; }
        if (lvl === 'mid') { this.tendency.mid = Math.max(15, this.tendency.mid - 6); this.tendency.low += 4; this.tendency.throw += 2; }
        if (lvl === 'high') { this.tendency.high = Math.max(8, this.tendency.high - 5); this.tendency.mid += 5; }
      }
    }
    this.opponentWasAttacking = op.state === FState.Attack;
    this.lastHpSelf = me.hp; this.lastHpOpp = op.hp;
  }

  private rubberAdjust(selfHp: number, oppHp: number): number {
    const d = (oppHp - selfHp) / 170;
    return Math.round(Math.max(-8, Math.min(8, d * 10)));
  }

  /** Execution accuracy: lower levels sometimes flub a motion (drop a direction). */
  private execute(input: number[]): InputFrame[] {
    const accuracy = 40 + this.diff.punishPct * 0.6;
    if (input.length > 2 && !this.rng.chance(accuracy)) return input.slice(input.length - 2);
    return input;
  }

  private run(frames: InputFrame[], label: string): InputFrame {
    this.planLabel = label;
    this.plan = frames.slice(1).concat([0, 0]);
    return frames[0] ?? 0;
  }

  /** For tests/telemetry. */
  get wasOpponentAttacking(): boolean { return this.opponentWasAttacking; }
  get hp(): [number, number] { return [this.lastHpSelf, this.lastHpOpp]; }
}

function defaultRange(archetype: string): number {
  const a = archetype.toLowerCase();
  if (a.includes('rush') || a.includes('wrest') || a.includes('brawl')) return 0.1;
  if (a.includes('boss') || a.includes('giant')) return 0.3;
  if (a.includes('mystic') || a.includes('poke') || a.includes('evasive') || a.includes('capoeira')) return 0.7;
  return 0.4;
}

export const AI_LEVEL_NAMES = ['Beginner', 'Easy', 'Medium', 'Hard', 'Boss'] as const;
