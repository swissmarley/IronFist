import type { AfterMatch, MatchSetup, Mode } from './types';

/**
 * One online match. The results screen offers REMATCH (both must agree; the host starts it
 * with a new seed), CHANGE FIGHTER (both go back to the character pick) and LEAVE (closes
 * the connection), all over the same NetPeer connection.
 */
export class OnlineMode implements Mode {
  readonly id = 'online';
  constructor(private readonly setup: MatchSetup) {}
  next(): MatchSetup | null { return this.setup; }
  onEnd(): AfterMatch {
    return { kind: 'results', choices: [{ id: 'rematch', label: 'REMATCH' }, { id: 'select', label: 'CHANGE FIGHTER' }, { id: 'menu', label: 'LEAVE' }] };
  }
}
