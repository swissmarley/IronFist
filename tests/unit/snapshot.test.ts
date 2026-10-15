import { describe, expect, it } from 'vitest';
import { MatchSim } from '@/sim/match';
import { FighterState } from '@/sim/fighterState';
import { newRoundState } from '@/sim/rounds';
import { CHARACTERS, getCharacter } from '@/data/characters';
import { Rng } from '@/core/rng';
import { IN_B1, IN_B2, IN_B3, IN_B4, IN_DOWN, IN_LEFT, IN_RIGHT, IN_UP } from '@/input/InputFrame';
import type { CharacterDef } from '@/sim/types';

const GREYBOX = getCharacter('greybox');
const ROSTER = Object.values(CHARACTERS).filter((c) => c.id !== 'greybox');
const DIRS = [0, IN_LEFT, IN_RIGHT, IN_UP, IN_DOWN, IN_DOWN | IN_RIGHT, IN_DOWN | IN_LEFT, IN_UP | IN_RIGHT];
const BTNS = [IN_B1, IN_B2, IN_B3, IN_B4, IN_B1 | IN_B2, IN_B3 | IN_B4, IN_B1 | IN_B3];

/** Plausible random play: held directions with occasional button presses. */
function randomInput(rng: Rng, prev: number): number {
  const dir = rng.chance(80) ? prev & 0xf : rng.pick(DIRS);
  return dir | (rng.chance(18) ? rng.pick(BTNS) : 0);
}

function makeSim(defs: [CharacterDef, CharacterDef] = [GREYBOX, GREYBOX]): MatchSim {
  return new MatchSim(defs, { seed: 7, hpOverride: 45, roundsToWin: 2, roundTimeSec: 20, startDistance: 1200 });
}

function inputs(n: number, seed: number): [number, number][] {
  const rng = new Rng(seed);
  const out: [number, number][] = [];
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) { a = randomInput(rng, a); b = randomInput(rng, b); out.push([a, b]); }
  return out;
}

describe('MatchSim snapshot / restore', () => {
  it('covers every FighterState field and the whole RoundState', () => {
    const sim = makeSim();
    const s = sim.snapshot();
    const keys = Object.keys(new FighterState(0)).filter((k) => k !== 'idx' && k !== 'input');
    expect(s.data.length).toBe(13 + 2 * (keys.length + 2 * 66));
    // RoundState fields encoded by the layout header: update the layout if this changes
    expect(Object.keys(newRoundState()).sort()).toEqual(['lastRoundResult', 'phase', 'phaseFrame', 'roundNumber', 'timer', 'winner', 'wins']);
  });

  it('restore + same inputs reproduces the identical state; different inputs diverge', () => {
    const sim = makeSim();
    const log = inputs(700, 3);
    for (let i = 0; i < 300; i++) sim.step(log[i] as [number, number]);
    const snap = sim.snapshot();
    for (let i = 300; i < 700; i++) sim.step(log[i] as [number, number]);
    const straight = sim.hash();
    const straightSnap = sim.snapshot();
    sim.restore(snap);
    expect(sim.frame).toBe(300);
    expect(sim.events.items.length).toBe(0);
    for (let i = 300; i < 700; i++) sim.step(log[i] as [number, number]);
    expect(sim.hash()).toBe(straight);
    expect(Array.from(sim.snapshot().data)).toEqual(Array.from(straightSnap.data));

    sim.restore(snap);
    const other = inputs(400, 99);
    for (let i = 0; i < 400; i++) sim.step(other[i] as [number, number]);
    expect(sim.frame).toBe(700);
    expect(sim.hash()).not.toBe(straight);
  });

  it('a 1000-frame random match with periodic rollbacks never diverges from a straight run', () => {
    for (const defs of [[GREYBOX, GREYBOX], [ROSTER[0] ?? GREYBOX, ROSTER[1] ?? GREYBOX]] as [CharacterDef, CharacterDef][]) {
      const log = inputs(1000, 11);
      const ref = makeSim(defs);
      const refHashes: number[] = [];
      for (const inp of log) { ref.step(inp); refHashes.push(ref.hash()); }

      const sim = makeSim(defs);
      const pool = Array.from({ length: 9 }, () => sim.allocSnapshot());
      const rng = new Rng(5);
      const wrong = new Rng(6);
      let rollbacks = 0;
      for (let f = 0; f < log.length; f++) {
        sim.snapshot(pool[f % pool.length]);
        sim.step(log[f] as [number, number]);
        if (f >= 8 && rng.chance(25)) {
          // rewind up to 8 frames, play mispredicted inputs, rewind again, replay the truth
          const depth = rng.range(1, 8);
          const snap = pool[(f + 1 - depth) % pool.length];
          if (!snap) throw new Error('pool');
          sim.restore(snap);
          for (let k = 0; k < depth; k++) sim.step([wrong.nextInt(256), wrong.nextInt(256)]);
          sim.restore(snap);
          for (let g = f + 1 - depth; g <= f; g++) {
            sim.step(log[g] as [number, number]);
            if (g < f) sim.snapshot(pool[(g + 1) % pool.length]);
          }
          rollbacks++;
        }
        expect(sim.hash(), `frame ${f}`).toBe(refHashes[f]);
      }
      expect(rollbacks).toBeGreaterThan(150);
      expect(ref.round.roundNumber + ref.round.wins[0] + ref.round.wins[1]).toBeGreaterThan(1); // rounds actually transitioned
    }
  });
});
