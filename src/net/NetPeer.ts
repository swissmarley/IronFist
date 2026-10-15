import type { MatchSim } from '@/sim/match';
import { RollbackSession } from './RollbackSession';
import { decodeMessage, encodeMessage } from './protocol';
import type { NetTransport, TransportState } from './transport';

/** Bumped whenever the wire format or the sim's determinism contract changes. */
export const NET_PROTOCOL_VERSION = 1;

export type NetRole = 'host' | 'guest';

/** Everything both peers must agree on before frame 0 (sent by the host). */
export interface OnlineSetup {
  p1: string;
  p2: string;
  stage: string;
  seed: number;
  roundsToWin: number;
  roundTimeSec: number;
  inputDelay: number;
}

type LobbyMsg =
  | { k: 'hello'; v: number }
  | { k: 'pick'; char: string }
  | { k: 'start'; setup: OnlineSetup }
  | { k: 'bye' };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseSetup(v: unknown): OnlineSetup | null {
  if (!isObj(v)) return null;
  const { p1, p2, stage, seed, roundsToWin, roundTimeSec, inputDelay } = v;
  if (typeof p1 !== 'string' || typeof p2 !== 'string' || typeof stage !== 'string') return null;
  if (typeof seed !== 'number' || typeof roundsToWin !== 'number' || typeof roundTimeSec !== 'number' || typeof inputDelay !== 'number') return null;
  return { p1, p2, stage, seed: seed | 0, roundsToWin: roundsToWin | 0, roundTimeSec: roundTimeSec | 0, inputDelay: inputDelay | 0 };
}

function parseLobby(text: string): LobbyMsg | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!isObj(v)) return null;
  switch (v.k) {
    case 'hello': return typeof v.v === 'number' ? { k: 'hello', v: v.v } : null;
    case 'pick': return typeof v.char === 'string' ? { k: 'pick', char: v.char } : null;
    case 'start': { const setup = parseSetup(v.setup); return setup ? { k: 'start', setup } : null; }
    case 'bye': return { k: 'bye' };
    default: return null;
  }
}

/**
 * One side of an online match, independent of the DOM: lobby handshake over the reliable
 * control channel (version check, character picks, the host's start message) and the
 * RollbackSession wired to the realtime channel. The host is always P1, the guest P2.
 */
export class NetPeer {
  readonly localPlayer: 0 | 1;
  localPick: string | null = null;
  remotePick: string | null = null;
  /** Set once the peer's hello with a matching protocol version arrived. */
  handshake = false;
  session: RollbackSession | null = null;
  onStateChange: ((s: TransportState) => void) | null = null;
  onRemotePick: ((char: string) => void) | null = null;
  onStart: ((setup: OnlineSetup) => void) | null = null;
  onLeave: ((reason: string) => void) | null = null;
  private left = false;

  constructor(readonly transport: NetTransport, readonly role: NetRole) {
    this.localPlayer = role === 'host' ? 0 : 1;
    transport.onControl = (t) => this.onControl(t);
    transport.onMessage = (b) => {
      const s = this.session;
      if (!s) return; // early datagrams are re-sent until acknowledged
      const m = decodeMessage(b);
      if (m) s.receive(m);
    };
    transport.onStateChange = (s) => {
      if (s === 'connected') this.sendLobby({ k: 'hello', v: NET_PROTOCOL_VERSION });
      if ((s === 'closed' || s === 'failed') && !this.left) { this.left = true; this.onLeave?.(s === 'failed' ? 'CONNECTION FAILED' : 'OPPONENT DISCONNECTED'); }
      this.onStateChange?.(s);
    };
    if (transport.state === 'connected') this.sendLobby({ k: 'hello', v: NET_PROTOCOL_VERSION });
  }

  get connected(): boolean { return this.transport.state === 'connected' && this.handshake; }

  /** Announce this player's character. */
  pick(char: string): void {
    this.localPick = char;
    this.sendLobby({ k: 'pick', char });
  }

  /** Host only: fix the match setup and tell the guest; fires onStart locally as well. */
  start(setup: OnlineSetup): void {
    if (this.role !== 'host') throw new Error('only the host starts the match');
    this.sendLobby({ k: 'start', setup });
    this.onStart?.(setup);
  }

  /** Begin rollback over `sim` (both peers build identical sims from the OnlineSetup). */
  beginMatch(sim: MatchSim, inputDelay: number): RollbackSession {
    this.session = new RollbackSession(sim, { localPlayer: this.localPlayer, inputDelay }, (m) => this.transport.send(encodeMessage(m)));
    return this.session;
  }

  endMatch(): void {
    this.session = null;
  }

  /** Tell the peer we are leaving and close the transport. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.sendLobby({ k: 'bye' });
    this.session = null;
    this.transport.close();
  }

  private sendLobby(m: LobbyMsg): void {
    this.transport.sendControl(JSON.stringify(m));
  }

  private onControl(text: string): void {
    const m = parseLobby(text);
    if (!m) return;
    switch (m.k) {
      case 'hello':
        if (m.v !== NET_PROTOCOL_VERSION) { this.left = true; this.onLeave?.(`VERSION MISMATCH (${m.v} vs ${NET_PROTOCOL_VERSION})`); this.transport.close(); return; }
        this.handshake = true;
        if (this.localPick) this.sendLobby({ k: 'pick', char: this.localPick });
        this.onStateChange?.(this.transport.state);
        break;
      case 'pick': this.remotePick = m.char; this.onRemotePick?.(m.char); break;
      case 'start': if (this.role === 'guest') this.onStart?.(m.setup); break;
      case 'bye': if (!this.left) { this.left = true; this.onLeave?.('OPPONENT LEFT'); } this.transport.close(); break;
    }
  }
}
