import { TUNING } from './config';
import { EvType, type EventQueue } from './events';
import { FighterState, FState } from './fighterState';

export enum RoundPhase { Intro = 0, Fight = 1, KO = 2, End = 3, MatchOver = 4 }

export type RoundResult = 'ko' | 'time' | 'double' | 'perfect' | 'ringout' | 'none';

export interface RoundState {
  phase: RoundPhase;
  phaseFrame: number;
  timer: number;        // frames remaining (or -1 for infinite)
  wins: [number, number];
  roundNumber: number;
  winner: number;       // -1 none, 0/1 fighter, 2 draw
  lastRoundResult: RoundResult;
}

export function newRoundState(): RoundState {
  return { phase: RoundPhase.Intro, phaseFrame: 0, timer: 0, wins: [0, 0], roundNumber: 1, winner: -1, lastRoundResult: 'none' };
}

/** End the round with a winner (0, 1 or 2 for draw) and a result label. */
export function endRound(r: RoundState, fighters: readonly [FighterState, FighterState], winner: number, result: RoundResult, ev: EventQueue): void {
  if (r.phase !== RoundPhase.Fight) return;
  r.phase = RoundPhase.KO;
  r.phaseFrame = 0;
  r.winner = winner;
  const w = winner === 0 || winner === 1 ? fighters[winner] : null;
  r.lastRoundResult = result === 'ko' && w && w.hp === w.maxHp ? 'perfect' : result;
  const loser = winner === 0 ? fighters[1] : winner === 1 ? fighters[0] : fighters[0];
  if (winner === 2) { fighters[0].ko = 1; fighters[1].ko = 1; }
  else loser.ko = 1;
  ev.push(EvType.KO, loser.idx, winner, loser.x, loser.y, loser.z, result === 'time' ? 1 : result === 'ringout' ? 2 : 0);
}

/** Check HP / ring-out conditions. */
export function checkRoundEnd(r: RoundState, fighters: readonly [FighterState, FighterState], ev: EventQueue): void {
  const [a, b] = fighters;
  if (a.ringOut || b.ringOut) {
    const winner = a.ringOut && b.ringOut ? 2 : a.ringOut ? 1 : 0;
    endRound(r, fighters, winner, 'ringout', ev);
    return;
  }
  if (a.hp <= 0 || b.hp <= 0) {
    const winner = a.hp <= 0 && b.hp <= 0 ? 2 : a.hp <= 0 ? 1 : 0;
    endRound(r, fighters, winner, winner === 2 ? 'double' : 'ko', ev);
  }
}

export interface RoundFlowHooks {
  resetRound(): void;
  roundsToWin: number;
}

/** Advance the round phase machine by one frame. */
export function stepRoundPhase(r: RoundState, fighters: readonly [FighterState, FighterState], hooks: RoundFlowHooks, ev: EventQueue): void {
  r.phaseFrame++;
  const [a, b] = fighters;
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
          const winner = a.hp === b.hp ? 2 : a.hp > b.hp ? 0 : 1;
          endRound(r, fighters, winner, 'time', ev);
        }
      }
      break;
    case RoundPhase.KO:
      if (r.phaseFrame >= TUNING.koSlowmoFrames) {
        r.phase = RoundPhase.End; r.phaseFrame = 0;
        if (r.winner === 0 || r.winner === 1) r.wins[r.winner]++;
        else { r.wins[0]++; r.wins[1]++; }
        const w = r.winner === 0 || r.winner === 1 ? fighters[r.winner] : null;
        if (w && w.state !== FState.Lying && w.state !== FState.Air) w.setState(FState.Win, 0);
        ev.push(EvType.RoundEnd, r.winner, -1, 0, 0, 0, r.winner);
      }
      break;
    case RoundPhase.End:
      if (r.phaseFrame >= TUNING.roundEndFrames) {
        if (r.wins[0] >= hooks.roundsToWin || r.wins[1] >= hooks.roundsToWin) {
          r.phase = RoundPhase.MatchOver; r.phaseFrame = 0;
        } else {
          r.roundNumber++;
          hooks.resetRound();
        }
      }
      break;
    case RoundPhase.MatchOver:
      break;
  }
}
