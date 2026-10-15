import { describe, expect, it } from 'vitest';
import { MatchSim } from '@/sim/match';
import { getCharacter } from '@/data/characters';
import { BasicAI, DIFFICULTIES, notationToFrames } from '@/ai/BasicAI';
import { frameFromNumpad, IN_B2 } from '@/input/InputFrame';

const G = getCharacter('greybox');

describe('BasicAI', () => {
  it('converts notation into frame scripts', () => {
    expect(notationToFrames('d/f+2', true)).toEqual([frameFromNumpad(3, IN_B2, true), frameFromNumpad(3, 0, true)]);
    expect(notationToFrames('f,f+2', true)?.length).toBe(5);
    expect(notationToFrames('WS 2', true)).toBeNull();
  });
  it('plays a full match against an idle opponent and wins', () => {
    const sim = new MatchSim([G, G], { roundsToWin: 1, roundTimeSec: 60, seed: 3 });
    const ai = new BasicAI(sim, 0, 2, 3);
    let frames = 0;
    while (!sim.isMatchOver() && frames < 60 * 90) { sim.step([ai.decide(sim), 0]); frames++; }
    expect(sim.isMatchOver()).toBe(true);
    expect(sim.round.wins[0]).toBe(1);
  });
  it('AI vs AI matches finish and are deterministic for a seed', () => {
    const run = (seed: number): { hash: number; frames: number; winner: number } => {
      const sim = new MatchSim([G, G], { roundsToWin: 1, roundTimeSec: 40, seed });
      const a = new BasicAI(sim, 0, 3, seed), b = new BasicAI(sim, 1, 3, seed + 1);
      let frames = 0;
      while (!sim.isMatchOver() && frames < 60 * 120) { sim.step([a.decide(sim), b.decide(sim)]); frames++; }
      return { hash: sim.hash(), frames, winner: sim.round.winner };
    };
    const x = run(11), y = run(11);
    expect(x.hash).toBe(y.hash);
    expect(x.frames).toBeLessThan(60 * 120);
    expect([0, 1, 2]).toContain(x.winner);
  });
  it('higher difficulty wins more often against lower difficulty', () => {
    let hardWins = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const sim = new MatchSim([G, G], { roundsToWin: 1, roundTimeSec: 40, seed: 100 + i });
      const easy = new BasicAI(sim, 0, 0, 500 + i), hard = new BasicAI(sim, 1, 4, 900 + i);
      let frames = 0;
      while (!sim.isMatchOver() && frames < 60 * 120) { sim.step([easy.decide(sim), hard.decide(sim)]); frames++; }
      if (sim.round.winner === 1) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(Math.ceil(N * 0.6));
    expect(DIFFICULTIES).toHaveLength(5);
  });
});

describe('BasicAI across the roster', () => {
  it('drives every character against every other without throwing', async () => {
    const { CHARACTERS } = await import('@/data/characters');
    const ids = Object.keys(CHARACTERS);
    for (const a of ids) for (const b of ids) {
      const sim = new MatchSim([CHARACTERS[a]!, CHARACTERS[b]!], { roundsToWin: 1, roundTimeSec: 20, seed: 5 });
      const x = new BasicAI(sim, 0, 3, 1), y = new BasicAI(sim, 1, 3, 2);
      for (let i = 0; i < 400; i++) sim.step([x.decide(sim), y.decide(sim)]);
      expect(sim.frame).toBe(400);
    }
  });
});
