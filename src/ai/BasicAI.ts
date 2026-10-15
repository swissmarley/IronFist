import { Rng } from '@/core/rng';
import { frameFromNumpad, IN_B1, IN_B2, IN_B3, IN_B4, type InputFrame } from '@/input/InputFrame';
import { ilen2 } from '@/core/fixed';
import type { MatchSim } from '@/sim/match';
import { FState } from '@/sim/fighterState';
import type { CharacterRuntime } from '@/sim/character';
import type { MoveDef } from '@/sim/types';

export interface AiDifficulty {
  /** Frames of delay before reacting to an opponent's attack. */
  reaction: number;
  /** Percent chance to block a seen attack. */
  blockPct: number;
  /** Percent chance to attempt a throw break. */
  breakPct: number;
  /** Percent chance per decision to be aggressive. */
  aggression: number;
  /** Percent chance to punish an unsafe blocked move. */
  punishPct: number;
  /** Percent chance to sidestep a linear attack. */
  stepPct: number;
  /** Percent chance, per neutral attack, to restrict the choice to moves that are safe on block. */
  safePct: number;
  /** Frames between decisions in neutral. */
  think: number;
}

export const DIFFICULTIES: AiDifficulty[] = [
  { reaction: 24, blockPct: 25, breakPct: 5, aggression: 35, punishPct: 10, stepPct: 3, safePct: 0, think: 18 },   // Beginner
  { reaction: 18, blockPct: 45, breakPct: 15, aggression: 45, punishPct: 30, stepPct: 8, safePct: 0, think: 14 },  // Easy
  { reaction: 13, blockPct: 65, breakPct: 30, aggression: 55, punishPct: 55, stepPct: 15, safePct: 15, think: 10 }, // Medium
  { reaction: 9, blockPct: 80, breakPct: 50, aggression: 65, punishPct: 75, stepPct: 22, safePct: 30, think: 7 },   // Hard
  { reaction: 4, blockPct: 95, breakPct: 80, aggression: 70, punishPct: 95, stepPct: 22, safePct: 20, think: 4 },   // Boss
];

interface Plan { frames: InputFrame[]; label: string }

/**
 * First-generation CPU opponent: range-aware move selection from the
 * character's own frame data, delayed reactions, blocking, throw breaks,
 * punishes and occasional sidesteps. Deterministic from its seed.
 */
export class BasicAI {
  readonly rng: Rng;
  private plan: Plan | null = null;
  private planIdx = 0;
  private seenAttackFrame = -1;
  private readonly diff: AiDifficulty;
  private readonly idx: number;
  private readonly pokes: { move: MoveDef; reach: number; input: number[] }[] = [];
  private readonly launchers: { move: MoveDef; reach: number; input: number[] }[] = [];
  private readonly lows: { move: MoveDef; reach: number; input: number[] }[] = [];
  private readonly throws: { move: MoveDef; reach: number; input: number[] }[] = [];
  private readonly rt: CharacterRuntime;
  private lastDecision = 0;

  constructor(sim: MatchSim, idx: number, level: number, seed: number) {
    this.idx = idx;
    this.diff = DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, level))] as AiDifficulty;
    this.rng = new Rng(seed ^ 0x51a7);
    this.rt = sim.chars[idx as 0 | 1];
    this.buildPlaybook();
  }

  private buildPlaybook(): void {
    const facingRight = this.idx === 0;
    for (const m of this.rt.moves) {
      if (m.cmd !== undefined && m.cmd !== m.input) continue; // follow-ups are triggered by strings
      const conds = m.conditions ?? ['standing'];
      if (!conds.includes('standing')) continue;
      const input = notationToFrames(m.input, facingRight);
      if (!input) continue;
      const h = m.hits[0];
      if (m.throw) { this.throws.push({ move: m, reach: m.throw.range, input }); continue; }
      if (!h) continue;
      const caps = h.track?.[0]?.capsules ?? h.capsules;
      const reach = Math.max(...caps.map((c) => Math.max(c.az, c.bz) + c.r)) + (m.motion?.reduce((a, r) => a + r.forward * (r.frames[1] - r.frames[0] + 1), 0) ?? 0);
      const entry = { move: m, reach, input };
      if (h.reaction.includes('launch') || h.reaction === 'spinLaunch') this.launchers.push(entry);
      else if (h.level === 'low') this.lows.push(entry);
      else if (h.frames[0] <= 16 && h.onBlock >= -9) this.pokes.push(entry);
    }
  }

  /** Produce this frame's input. Call once per sim step before stepping. */
  decide(sim: MatchSim): InputFrame {
    const me = sim.fighters[this.idx as 0 | 1], op = sim.fighters[(1 - this.idx) as 0 | 1];
    const facingRight = this.idx === 0;
    const F = (dir: number, b = 0): InputFrame => frameFromNumpad(dir, b, facingRight);
    const frame = sim.frame;
    if (me.ko || me.state === FState.Intro || me.state === FState.Win || me.state === FState.KO) return 0;

    // continue an in-flight plan
    if (this.plan) {
      const f = this.plan.frames[this.planIdx++];
      if (this.planIdx >= this.plan.frames.length) this.plan = null;
      if (f !== undefined) return f;
    }

    // throw break
    if (me.state === FState.Thrown && me.throwBreakWindow > 0) {
      const t = op.throwMove >= 0 ? sim.chars[op.idx as 0 | 1].move(op.throwMove).throw : undefined;
      if (t && this.rng.chance(this.diff.breakPct)) {
        const btn = t.breakButton === 1 ? IN_B1 : t.breakButton === 2 ? IN_B2 : IN_B1 | IN_B2;
        this.plan = { frames: [F(5, btn)], label: 'break' }; this.planIdx = 0;
        return F(5, btn);
      }
      return 0;
    }
    // get-up options
    if (me.state === FState.Lying) {
      if (me.techWindow > 0 && this.rng.chance(60)) return F(5, IN_B4);
      if (me.lyingFrames > 10) { const r = this.rng.nextInt(100); return r < 40 ? F(8) : r < 70 ? F(4) : r < 85 ? F(5, IN_B3) : F(2); }
      return 0;
    }
    if (!me.isActionable()) return me.blockHeld ? F(4) : 0;

    const dist = ilen2(op.x - me.x, op.z - me.z);
    const opAttacking = op.state === FState.Attack && op.moveIdx >= 0;
    const opMove = opAttacking ? sim.chars[op.idx as 0 | 1].move(op.moveIdx) : null;

    // defence: react to an incoming attack after the reaction delay
    if (opAttacking && opMove) {
      if (this.seenAttackFrame < 0) this.seenAttackFrame = frame;
      if (frame - this.seenAttackFrame >= this.diff.reaction && dist < 2000) {
        const hit = opMove.hits[0];
        if (opMove.throw) {
          if (this.rng.chance(this.diff.stepPct * 2)) return this.start([F(8), F(8), F(5), F(5)], 'step-throw', F(8));
          if (this.rng.chance(40)) return F(2); // duck the throw
        }
        if (hit && this.rng.chance(this.diff.blockPct)) {
          const low = hit.level === 'low';
          const homing = opMove.properties?.includes('homing');
          if (!homing && !low && this.rng.chance(this.diff.stepPct)) return this.start([F(8), F(8), F(5), F(5), F(5)], 'sidestep', F(8));
          return low ? F(1) : F(4);
        }
      }
    } else this.seenAttackFrame = -1;

    // punish a blocked unsafe move
    if (me.state === FState.Blockstun && me.stunFrames <= 2 && opAttacking && opMove) {
      const h = opMove.hits[0];
      if (h && h.onBlock <= -10 && this.rng.chance(this.diff.punishPct)) {
        const pick = this.rng.chance(60) ? this.pickReach(this.launchers, dist + 200) : this.pickReach(this.pokes, dist + 200);
        if (pick) return this.start(pick.input.map((d) => d), 'punish', pick.input[0] ?? 0);
      }
    }

    if (frame - this.lastDecision < this.diff.think) {
      // keep approaching or hold guard between decisions
      return dist > 1400 ? F(6) : (this.rng.chance(50) ? F(4) : F(5));
    }
    this.lastDecision = frame;

    const aggressive = this.rng.chance(this.diff.aggression);
    if (op.state === FState.Lying) {
      if (dist < 1200 && this.rng.chance(35)) { const low = this.pickReach(this.lows, dist + 150); if (low) return this.start(low.input, 'ground', low.input[0] ?? 0); }
      return dist > 900 ? F(6) : F(5);
    }
    if (op.isAirborne() && dist < 1300 && this.rng.chance(70)) {
      const poke = this.pickReach(this.pokes, dist + 300);
      if (poke) return this.start(poke.input, 'juggle', poke.input[0] ?? 0);
    }
    if (dist > 2200) return this.rng.chance(30) ? this.start([F(6), F(5), F(6), F(6), F(6), F(6)], 'dash', F(6)) : F(6);
    if (dist > 1500) return aggressive ? F(6) : (this.rng.chance(20) ? this.start([F(4), F(5), F(4), F(5)], 'backdash', F(4)) : F(6));
    if (!aggressive) {
      const r = this.rng.nextInt(100);
      if (r < 25) return this.start([F(4), F(4), F(4), F(4)], 'walkback', F(4));
      if (r < 40) return this.start([F(2), F(2), F(5), F(5), F(5)], 'ss-out', F(2));
      return F(4);
    }
    const r = this.rng.nextInt(100);
    const pool = r < 15 && dist < 1100 ? this.throws : r < 40 ? this.lows : r < 62 ? this.launchers : this.pokes;
    const pick = this.pickReach(pool, dist + 120) ?? this.pickReach(this.pokes, dist + 120);
    if (!pick) return F(6);
    return this.start(pick.input, pick.move.id, pick.input[0] ?? 0);
  }

  private pickReach(list: { move: MoveDef; reach: number; input: number[] }[], dist: number): { move: MoveDef; reach: number; input: number[] } | null {
    const ok = list.filter((e) => e.reach + 300 >= dist);
    if (ok.length === 0) return null;
    return ok[this.rng.nextInt(ok.length)] ?? null;
  }

  private start(frames: InputFrame[], label: string, first: InputFrame): InputFrame {
    this.plan = { frames: frames.slice(1).concat([0, 0]), label };
    this.planIdx = 0;
    return first;
  }

  get currentPlan(): string { return this.plan?.label ?? ''; }
}

const DIRS: Record<string, number> = { n: 5, f: 6, b: 4, u: 8, d: 2, 'u/f': 9, 'u/b': 7, 'd/f': 3, 'd/b': 1, uf: 9, ub: 7, df: 3, db: 1 };
const BTN: Record<string, number> = { '1': IN_B1, '2': IN_B2, '3': IN_B3, '4': IN_B4 };

/** Convert simple notation ("d/f+2", "f,f+1+3", "qcf+1") into a frame script. Returns null for stance/WS notations. */
export function notationToFrames(input: string, facingRight: boolean): number[] | null {
  let s = input.trim();
  if (/^(ws|fc|ss|bt|wr|lying|u)\s/i.test(s)) return null;
  s = s.replace(/\bqcf\b/gi, 'd,d/f,f').replace(/\bqcb\b/gi, 'd,d/b,b').replace(/\bhcf\b/gi, 'b,d/b,d,d/f,f').replace(/\bcd\b/gi, 'f,n,d,d/f');
  const segs = s.split(/[,~]/);
  const frames: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = (segs[i] as string).trim();
    const parts = seg.split('+').map((p) => p.trim()).filter(Boolean);
    let dir = 5, buttons = 0;
    for (const p of parts) {
      if (BTN[p] !== undefined) buttons |= BTN[p] as number;
      else if (DIRS[p.toLowerCase()] !== undefined) dir = DIRS[p.toLowerCase()] as number;
      else return null;
    }
    // one frame per token with a release frame between tokens (so repeated directions register as
    // edges); the final token holds its direction one extra frame. Motion inputs (cd, qcf) thus cost
    // ~2 frames per token instead of 3, which is what keeps them usable as neutral tools.
    const last = i === segs.length - 1;
    frames.push(frameFromNumpad(dir, buttons, facingRight));
    if (last) frames.push(frameFromNumpad(dir, 0, facingRight));
    else if (dir !== 5) frames.push(0);
  }
  return frames;
}
