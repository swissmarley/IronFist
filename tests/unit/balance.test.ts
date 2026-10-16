import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@/data/characters';
import { levelReport, runMatch } from '@/ai/batch';
import { LayeredAI } from '@/ai/LayeredAI';
import { MatchSim } from '@/sim/match';

const roster = Object.values(CHARACTERS).filter((c) => c.id !== 'greybox');

describe('LayeredAI balance (reduced batch; tools/balance.ts runs the full 1000)', () => {
  it('matches finish without stalls at every difficulty', () => {
    for (let level = 0; level < 5; level++) {
      const rep = levelReport(roster, level, 10, 1000 + level * 50, { roundsToWin: 1, roundTimeSec: 30 });
      expect(rep.stalls, `level ${level} stalls`).toBe(0);
      expect(rep.avgFrames).toBeLessThan(60 * 30 * 1.6 + 600);
    }
  }, 120000);
  it('each level beats the level below most of the time', () => {
    for (let level = 1; level < 5; level++) {
      const rep = levelReport(roster, level, 48, 2000 + level * 100, { roundsToWin: 1, roundTimeSec: 30 });
      expect(rep.winRateVsLower, `level ${level} vs ${level - 1}`).toBeGreaterThanOrEqual(0.5);
    }
  }, 180000);
  it('is deterministic per seed and uses its playbook', () => {
    const a = runMatch(roster[0]!, roster[1]!, 3, 3, 77, { roundsToWin: 1, roundTimeSec: 20 });
    const b = runMatch(roster[0]!, roster[1]!, 3, 3, 77, { roundsToWin: 1, roundTimeSec: 20 });
    expect(a.winner).toBe(b.winner);
    expect(a.frames).toBe(b.frames);
    const sim = new MatchSim([roster[0]!, roster[1]!], { roundsToWin: 1 });
    const ai = new LayeredAI(sim, 0, { level: 2, seed: 1 });
    expect(ai.book.all.length).toBeGreaterThan(20);
    expect(ai.book.launchers.length).toBeGreaterThan(0);
    expect(ai.book.throws.length).toBeGreaterThan(0);
  });
});
