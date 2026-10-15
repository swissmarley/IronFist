import { Rng } from '@/core/rng';
import { BOSS_ID, BOSS_INTRO, endingFor, SUBBOSS_ID, SUBBOSS_INTRO } from '@/data/story';
import type { AfterMatch, MatchOutcome, MatchSetup, Mode } from './types';

export interface LadderOptions {
  player: string;
  roster: string[];
  stages: string[];
  difficulty: number;
  rounds: number;
  roundTime: number;
  seed: number;
}

/** Builds the 8-fight arcade ladder: 6 roster opponents, the sub-boss, then the boss. */
export function buildLadder(o: LadderOptions): MatchSetup[] {
  const rng = new Rng(o.seed);
  const pool = o.roster.filter((id) => id !== o.player && id !== SUBBOSS_ID && id !== BOSS_ID && id !== 'greybox');
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.nextInt(i + 1); const t = pool[i] as string; pool[i] = pool[j] as string; pool[j] = t; }
  const opponents = pool.slice(0, 6);
  while (opponents.length < 6 && pool.length > 0) opponents.push(pool[opponents.length % pool.length] as string);
  const sub = o.roster.includes(SUBBOSS_ID) ? SUBBOSS_ID : (pool[0] ?? o.player);
  const boss = o.roster.includes(BOSS_ID) ? BOSS_ID : (pool[1] ?? o.player);
  const all = [...opponents, sub, boss];
  const stages = o.stages.length ? o.stages : ['dojo'];
  return all.map((opp, i) => {
    const level = Math.min(4, o.difficulty + (i >= 7 ? 1 : i >= 5 ? 0 : i >= 2 ? 0 : -1));
    const setup: MatchSetup = {
      p1: o.player, p2: opp, stage: stages[i % stages.length] as string,
      config: { roundsToWin: o.rounds, roundTimeSec: o.roundTime, seed: o.seed + i * 977 },
      cpu: [null, Math.max(0, level)],
      label: `STAGE ${i + 1} / ${all.length}`,
    };
    if (i === 6) setup.intro = SUBBOSS_INTRO;
    if (i === 7) setup.intro = BOSS_INTRO;
    return setup;
  });
}

export class ArcadeMode implements Mode {
  readonly id = 'arcade';
  private ladder: MatchSetup[];
  private index = 0;
  private lost = false;
  continues = 0;
  constructor(private readonly opts: LadderOptions) {
    this.ladder = buildLadder(opts);
  }
  get stageIndex(): number { return this.index; }
  next(): MatchSetup | null {
    return this.ladder[this.index] ?? null;
  }
  onEnd(outcome: MatchOutcome): AfterMatch {
    if (outcome.winner === 0) {
      this.index++;
      if (this.index >= this.ladder.length) return { kind: 'ending', lines: endingFor(this.opts.player) };
      return { kind: 'next' };
    }
    this.lost = true;
    return { kind: 'results', choices: [{ id: 'rematch', label: 'CONTINUE' }, { id: 'menu', label: 'GIVE UP' }] };
  }
  onChoice(choice: string): void {
    if (choice === 'rematch' && this.lost) { this.continues++; this.lost = false; }
  }
}
