import { Rng } from '@/core/rng';
import type { AfterMatch, MatchOutcome, MatchSetup, Mode } from './types';

/** Local 2P versus (or 1P vs CPU) with rematch. */
export class VersusMode implements Mode {
  readonly id = 'versus';
  constructor(private setup: MatchSetup) {}
  next(): MatchSetup | null { return this.setup; }
  onEnd(): AfterMatch {
    return { kind: 'results', choices: [{ id: 'rematch', label: 'REMATCH' }, { id: 'select', label: 'CHARACTER SELECT' }, { id: 'menu', label: 'MAIN MENU' }] };
  }
  onChoice(choice: string): void {
    if (choice === 'rematch') this.setup = { ...this.setup, config: { ...this.setup.config, seed: (this.setup.config.seed ?? 1) + 1 } };
  }
}

/** Endless CPU ladder; the player's HP carries over with partial regeneration. */
export class SurvivalMode implements Mode {
  readonly id = 'survival';
  wins = 0;
  private hp = 170;
  private rng: Rng;
  constructor(private readonly player: string, private readonly roster: string[], private readonly stages: string[], private readonly difficulty: number, seed: number) {
    this.rng = new Rng(seed);
  }
  next(): MatchSetup | null {
    const pool = this.roster.filter((id) => id !== 'greybox');
    const opp = pool[this.rng.nextInt(pool.length)] ?? this.player;
    const level = Math.min(4, this.difficulty + Math.floor(this.wins / 3) - 1);
    return {
      p1: this.player, p2: opp, stage: this.stages[this.wins % Math.max(1, this.stages.length)] ?? 'dojo',
      config: { roundsToWin: 1, roundTimeSec: 60, seed: 7000 + this.wins, hpOverride: 170, survivalHp: this.hp } as MatchSetup['config'],
      cpu: [null, Math.max(0, level)], label: `WINS ${this.wins}`,
    };
  }
  onEnd(outcome: MatchOutcome): AfterMatch {
    if (outcome.winner === 0) {
      this.wins++;
      this.hp = Math.min(170, outcome.hpLeft[0] + 50);
      return { kind: 'next' };
    }
    return { kind: 'results', choices: [{ id: 'menu', label: 'MAIN MENU' }] };
  }
}

/** The arcade ladder against the clock. */
export class TimeAttackMode implements Mode {
  readonly id = 'timeattack';
  totalFrames = 0;
  constructor(private readonly ladder: MatchSetup[]) {}
  private index = 0;
  next(): MatchSetup | null { return this.ladder[this.index] ?? null; }
  onEnd(outcome: MatchOutcome): AfterMatch {
    this.totalFrames += outcome.frames;
    if (outcome.winner === 0) {
      this.index++;
      if (this.index >= this.ladder.length) return { kind: 'results', choices: [{ id: 'menu', label: 'MAIN MENU' }] };
      return { kind: 'next' };
    }
    return { kind: 'results', choices: [{ id: 'rematch', label: 'RETRY STAGE' }, { id: 'menu', label: 'MAIN MENU' }] };
  }
}

/** Training room: a single endless session. */
export class PracticeMode implements Mode {
  readonly id = 'practice';
  constructor(private readonly setup: MatchSetup) {}
  next(): MatchSetup | null { return this.setup; }
  onEnd(): AfterMatch { return { kind: 'menu' }; }
}
