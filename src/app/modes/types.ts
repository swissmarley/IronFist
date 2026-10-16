import type { MatchConfig } from '@/sim/config';

/** One match to play: character ids, stage id, config overrides, and CPU levels (null = human). */
export interface MatchSetup {
  p1: string;
  p2: string;
  stage: string;
  config: Partial<MatchConfig>;
  cpu: [number | null, number | null];
  /** Label shown on the ladder HUD (e.g. "STAGE 3 / 8"). */
  label?: string;
  /** Cutscene lines to play before the match. */
  intro?: { speaker: string; line: string }[];
}

export interface MatchOutcome {
  winner: number;          // 0, 1 or 2 (draw)
  wins: [number, number];
  frames: number;
  maxCombo: [number, number];
  damage: [number, number];
  hpLeft: [number, number];
}

export type AfterMatch = { kind: 'results'; choices: { id: 'rematch' | 'select' | 'next' | 'menu'; label: string }[] } | { kind: 'next' } | { kind: 'ending'; lines: { speaker: string; line: string }[] } | { kind: 'menu' };

export interface Mode {
  readonly id: string;
  /** The next match to play, or null when the mode is finished. */
  next(): MatchSetup | null;
  /** Called with the outcome of the match that just ended. */
  onEnd(outcome: MatchOutcome): AfterMatch;
  /** Called when the player chose an option on the results screen. */
  onChoice?(choice: string): void;
}
