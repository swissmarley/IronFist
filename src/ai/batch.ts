import { MatchSim } from '@/sim/match';
import type { CharacterDef } from '@/sim/types';
import { LayeredAI } from './LayeredAI';

export interface BatchMatchResult {
  p1: string; p2: string; level1: number; level2: number; seed: number;
  winner: number; frames: number; stalled: boolean; damage: [number, number]; maxCombo: [number, number];
}

export interface BatchOptions {
  roundsToWin?: number;
  roundTimeSec?: number;
  /** Frames without any damage before the match is flagged as stalled. */
  stallFrames?: number;
  maxFrames?: number;
}

/** Run one headless AI-vs-AI match. Deterministic for its seed. */
export function runMatch(a: CharacterDef, b: CharacterDef, level1: number, level2: number, seed: number, o: BatchOptions = {}): BatchMatchResult {
  const sim = new MatchSim([a, b], { roundsToWin: o.roundsToWin ?? 2, roundTimeSec: o.roundTimeSec ?? 40, seed });
  const ai1 = new LayeredAI(sim, 0, { level: level1, seed: seed * 3 + 1 });
  const ai2 = new LayeredAI(sim, 1, { level: level2, seed: seed * 3 + 2 });
  const maxFrames = o.maxFrames ?? 60 * 60 * 6;
  const stallLimit = o.stallFrames ?? 60 * 25;
  let lastDamageFrame = 0, lastHp = sim.fighters[0].hp + sim.fighters[1].hp, stalled = false;
  const damage: [number, number] = [0, 0];
  const maxCombo: [number, number] = [0, 0];
  let prevHp: [number, number] = [sim.fighters[0].hp, sim.fighters[1].hp];
  while (!sim.isMatchOver() && sim.frame < maxFrames) {
    sim.step([ai1.decide(sim), ai2.decide(sim)]);
    const hp: [number, number] = [sim.fighters[0].hp, sim.fighters[1].hp];
    if (hp[1] < prevHp[1]) damage[0] += prevHp[1] - hp[1];
    if (hp[0] < prevHp[0]) damage[1] += prevHp[0] - hp[0];
    maxCombo[0] = Math.max(maxCombo[0], sim.fighters[1].comboHits);
    maxCombo[1] = Math.max(maxCombo[1], sim.fighters[0].comboHits);
    prevHp = hp;
    const total = hp[0] + hp[1];
    if (total !== lastHp) { lastHp = total; lastDamageFrame = sim.frame; }
    else if (sim.frame - lastDamageFrame > stallLimit && sim.round.phase === 1) { stalled = true; }
  }
  return { p1: a.id, p2: b.id, level1, level2, seed, winner: sim.round.winner, frames: sim.frame, stalled: stalled || !sim.isMatchOver(), damage, maxCombo };
}

export interface LevelReport { level: number; matches: number; winRateVsLower: number; stalls: number; avgFrames: number }

/** Win rate of `level` against `level - 1` (mirror matches over the roster), plus stall count. */
export function levelReport(roster: CharacterDef[], level: number, matches: number, seedBase = 1, o: BatchOptions = {}): LevelReport {
  let wins = 0, decided = 0, stalls = 0, frames = 0;
  const lower = Math.max(0, level - 1);
  for (let i = 0; i < matches; i++) {
    const a = roster[i % roster.length] as CharacterDef;
    const b = roster[(i * 7 + 3) % roster.length] as CharacterDef;
    const swap = i % 2 === 1;
    const r = swap ? runMatch(a, b, lower, level, seedBase + i, o) : runMatch(a, b, level, lower, seedBase + i, o);
    const strongerIdx = swap ? 1 : 0;
    if (r.winner === strongerIdx) wins++;
    if (r.winner === 0 || r.winner === 1) decided++;
    if (r.stalled) stalls++;
    frames += r.frames;
  }
  return { level, matches, winRateVsLower: decided ? wins / decided : 0.5, stalls, avgFrames: frames / Math.max(1, matches) };
}

export interface MatchupCell { p1: string; p2: string; p1WinRate: number; n: number }

/** Mirror-level matchup table (level vs level) across the roster. */
export function matchupTable(roster: CharacterDef[], level: number, perPair: number, seedBase = 100, o: BatchOptions = {}): MatchupCell[] {
  const out: MatchupCell[] = [];
  for (const a of roster) for (const b of roster) {
    if (a.id === b.id) continue;
    let w = 0, n = 0;
    for (let i = 0; i < perPair; i++) {
      const r = runMatch(a, b, level, level, seedBase + i + out.length * 31, o);
      if (r.winner === 0) w++;
      if (r.winner === 0 || r.winner === 1) n++;
    }
    out.push({ p1: a.id, p2: b.id, p1WinRate: n ? w / n : 0.5, n });
  }
  return out;
}
