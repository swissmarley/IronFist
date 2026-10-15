import type { AfterMatch, MatchSetup, Mode } from './types';

/** One online match; afterwards the results screen returns to the menu (closing the link). */
export class OnlineMode implements Mode {
  readonly id = 'online';
  constructor(private readonly setup: MatchSetup) {}
  next(): MatchSetup | null { return this.setup; }
  onEnd(): AfterMatch {
    return { kind: 'results', choices: [{ id: 'menu', label: 'MAIN MENU' }] };
  }
}
