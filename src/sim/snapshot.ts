import type { Rng } from '@/core/rng';
import type { FighterState } from './fighterState';
import type { RoundResult, RoundState } from './rounds';

/** Everything a MatchSim needs to resume exactly: a frame number plus one flat int buffer. */
export interface MatchSnapshot {
  frame: number;
  readonly data: Int32Array;
}

/** The parts of MatchSim the snapshot covers (kept structural to avoid an import cycle). */
export interface SnapshotTarget {
  frame: number;
  readonly fighters: readonly [FighterState, FighterState];
  readonly rng: Rng;
  readonly round: RoundState;
}

const ROUND_RESULTS: readonly RoundResult[] = ['none', 'ko', 'time', 'double', 'perfect', 'ringout'];
const HEADER = 13;
/** FighterState fields that are not per-frame state (identity / owned objects handled separately). */
const SKIP = new Set(['idx', 'input']);

type Fields = Record<string, unknown>;

/**
 * Flat integer layout of the mutable match state. Fighter fields are discovered from the
 * live instance (every own number/boolean property except identity), so new integer fields
 * added to FighterState are covered automatically; any other field type is rejected loudly
 * because it could not be restored.
 *
 * CharacterRuntime holds no per-match mutable state (moves, command trie, lastActive and
 * startup tables are derived once from the immutable CharacterDef), the hit scratch
 * (`hitA`) is rewritten before use every step, and events are render-side, so none of
 * them are part of the snapshot.
 */
export class SnapshotLayout {
  readonly nums: readonly string[];
  readonly bools: readonly string[];
  readonly size: number;
  private readonly fighterInts: number;

  constructor(probe: FighterState) {
    const nums: string[] = [], bools: string[] = [];
    for (const [k, v] of Object.entries(probe as unknown as Fields)) {
      if (SKIP.has(k)) continue;
      if (typeof v === 'number') nums.push(k);
      else if (typeof v === 'boolean') bools.push(k);
      else throw new Error(`FighterState.${k} (${typeof v}) cannot be snapshotted; use integer fields`);
    }
    this.nums = nums;
    this.bools = bools;
    this.fighterInts = nums.length + bools.length + probe.input.dirs.snapshotSize + probe.input.buttons.snapshotSize;
    this.size = HEADER + 2 * this.fighterInts;
  }

  alloc(): MatchSnapshot {
    return { frame: -1, data: new Int32Array(this.size) };
  }

  save(t: SnapshotTarget, out: MatchSnapshot = this.alloc()): MatchSnapshot {
    const d = out.data;
    out.frame = t.frame;
    d[0] = t.frame;
    t.rng.saveTo(d, 1);
    const r = t.round;
    d[5] = r.phase; d[6] = r.phaseFrame; d[7] = r.timer; d[8] = r.wins[0]; d[9] = r.wins[1];
    d[10] = r.roundNumber; d[11] = r.winner; d[12] = ROUND_RESULTS.indexOf(r.lastRoundResult);
    let o = HEADER;
    for (const f of t.fighters) {
      const rec = f as unknown as Record<string, number | boolean>;
      for (const k of this.nums) d[o++] = rec[k] as number;
      for (const k of this.bools) d[o++] = rec[k] ? 1 : 0;
      o = f.input.dirs.saveTo(d, o);
      o = f.input.buttons.saveTo(d, o);
    }
    return out;
  }

  restore(t: SnapshotTarget, s: MatchSnapshot): void {
    const d = s.data;
    if (d.length !== this.size) throw new Error('snapshot layout mismatch');
    t.frame = d[0] as number;
    t.rng.loadFrom(d, 1);
    const r = t.round;
    r.phase = d[5] as number; r.phaseFrame = d[6] as number; r.timer = d[7] as number;
    r.wins[0] = d[8] as number; r.wins[1] = d[9] as number;
    r.roundNumber = d[10] as number; r.winner = d[11] as number;
    r.lastRoundResult = ROUND_RESULTS[d[12] as number] ?? 'none';
    let o = HEADER;
    for (const f of t.fighters) {
      const rec = f as unknown as Record<string, number | boolean>;
      for (const k of this.nums) rec[k] = d[o++] as number;
      for (const k of this.bools) rec[k] = d[o++] === 1;
      o = f.input.dirs.loadFrom(d, o);
      o = f.input.buttons.loadFrom(d, o);
    }
  }
}

/** Copy one snapshot into another of the same layout (no allocation). */
export function copySnapshot(src: MatchSnapshot, dst: MatchSnapshot): void {
  dst.frame = src.frame;
  dst.data.set(src.data);
}
