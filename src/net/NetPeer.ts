import type { MatchSim } from '@/sim/match';
import { RollbackSession } from './RollbackSession';
import { decodeMessage, encodeMessage, messageEpoch, MSG_PING, MSG_PONG } from './protocol';
import { DEFAULT_INPUT_DELAY, inputDelayForRtt, RttProbe } from './inputDelay';
import { parseLobby, type LobbyMsg, type OnlineSetup } from './lobby';
import { SYNC_CHUNK_INTS, TransferAssembler, transferMessages } from './resync';
import type { NetTransport, TransportState } from './transport';

export type { OnlineSetup } from './lobby';

/** Bumped whenever the wire format or the sim's determinism contract changes. */
export const NET_PROTOCOL_VERSION = 2;

export type NetRole = 'host' | 'guest';
/** lobby = picking fighters, match = a RollbackSession is running, post = results screen. */
export type NetPhase = 'lobby' | 'match' | 'post';
/** What a player chose on the results screen (LEAVE closes the connection instead). */
export type PostChoice = 'rematch' | 'change';
/** Lobby ping interval (ticks): ~10 RTT samples per second. */
const LOBBY_PING_TICKS = 6;
/** The lobby RTT estimate is ready after this long with enough samples ... */
const RTT_MEASURE_TICKS = 60;
const RTT_MIN_SAMPLES = 5;
/** ... or, on a link that loses most pings, after this long regardless. */
const RTT_GIVE_UP_TICKS = 180;

/** The host's start parameters; NetPeer assigns the match epoch. */
export type StartParams = Omit<OnlineSetup, 'match'>;

/**
 * One side of an online match, independent of the DOM: lobby handshake over the reliable
 * control channel (version check, character picks, the host's start message, post-match
 * rematch / change-fighter agreement) and the RollbackSession wired to the realtime
 * channel. The host is always P1, the guest P2. Several matches can run back to back on
 * one connection; each gets a new epoch so late packets of the previous one are ignored.
 */
export class NetPeer {
  readonly localPlayer: 0 | 1;
  localPick: string | null = null;
  remotePick: string | null = null;
  /** Set once the peer's hello with a matching protocol version arrived. */
  handshake = false;
  phase: NetPhase = 'lobby';
  session: RollbackSession | null = null;
  /** The setup of the current / last match (rematches reuse it with a new seed). */
  lastSetup: OnlineSetup | null = null;
  localChoice: PostChoice | null = null;
  remoteChoice: PostChoice | null = null;
  /** Matches started on this connection. */
  matches = 0;
  onStateChange: ((s: TransportState) => void) | null = null;
  onRemotePick: ((char: string) => void) | null = null;
  onStart: ((setup: OnlineSetup) => void) | null = null;
  onLeave: ((reason: string) => void) | null = null;
  /** The opponent chose on their results screen (UI note). */
  onRemoteChoice: ((c: PostChoice) => void) | null = null;
  /** Host: both players want a rematch; call `startRematch(seed)`. */
  onRematchReady: (() => void) | null = null;
  /** The opponent chose CHANGE FIGHTER: pick again (the remote pick is cleared). */
  onRepick: (() => void) | null = null;
  /** Ints per state-transfer chunk on the control channel (tests lower it to force several parts). */
  chunkInts = SYNC_CHUNK_INTS;
  /** Lobby round-trip samples (realtime channel, epoch 0, 60 Hz ticks). */
  readonly rtt = new RttProbe();
  private left = false;
  private epoch = 0;
  private readonly incoming = new TransferAssembler();
  private ticks = 0;
  private handshakeTick = -1;

  constructor(readonly transport: NetTransport, readonly role: NetRole) {
    this.localPlayer = role === 'host' ? 0 : 1;
    transport.onControl = (t) => this.onControl(t);
    transport.onMessage = (b) => this.onDatagram(b);
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
  start(params: StartParams): OnlineSetup {
    if (this.role !== 'host') throw new Error('only the host starts the match');
    const setup: OnlineSetup = { ...params, match: (this.matches % 255) + 1 };
    this.sendLobby({ k: 'start', setup });
    this.started(setup);
    return setup;
  }

  /** Host: start the agreed rematch (same fighters, stage, rules and delay; new seed). */
  startRematch(seed: number): OnlineSetup | null {
    const last = this.lastSetup;
    if (this.role !== 'host' || !last || this.phase !== 'post') return null;
    const { match: _match, ...params } = last;
    return this.start({ ...params, seed });
  }

  /** Begin rollback over `sim` (both peers build identical sims from the OnlineSetup). */
  beginMatch(sim: MatchSim, setup: OnlineSetup): RollbackSession {
    const epoch = setup.match;
    this.epoch = epoch;
    const s = new RollbackSession(sim, { localPlayer: this.localPlayer, inputDelay: setup.inputDelay, authority: this.role === 'host' }, (m) => this.transport.send(encodeMessage(m, epoch)));
    // desync recovery (D-028): the host's confirmed state wins and travels on the reliable channel
    s.onResync = (t) => { for (const m of transferMessages(t, epoch, this.chunkInts)) this.sendLobby(m); };
    s.onDesync = (gen) => this.sendLobby({ k: 'desync', match: epoch, gen });
    this.session = s;
    return s;
  }

  /**
   * The match runner is gone. A finished match's session stays and is pumped by `tick()`
   * until the next match begins, so a peer that is still confirming its last frames (or is
   * on its results screen) keeps receiving acks; an aborted match's session is dropped.
   */
  endMatch(): void {
    if (this.phase === 'match') this.session = null;
  }

  /**
   * Once per 60 Hz loop step (all screens): pings the peer while in the lobby (RTT for the
   * automatic input delay) and keeps a finished match's session serviced.
   */
  tick(): void {
    if (this.session && this.phase !== 'match') this.session.pump();
    if (this.handshake && this.phase === 'lobby' && this.ticks % LOBBY_PING_TICKS === 0) this.transport.send(encodeMessage({ type: MSG_PING, tick: this.ticks }, 0));
    this.ticks++;
  }

  /** Lobby RTT estimate (median, ticks), or -1 before the first sample. */
  get rttTicks(): number { return this.rtt.median; }

  /** True once ~1 s of lobby pings were measured (or the measurement gave up). */
  get rttReady(): boolean {
    if (this.handshakeTick < 0) return false;
    const t = this.ticks - this.handshakeTick;
    return (t >= RTT_MEASURE_TICKS && this.rtt.count >= RTT_MIN_SAMPLES) || t >= RTT_GIVE_UP_TICKS;
  }

  /** Input delay from the lobby RTT (D-028); the default when nothing was measured. */
  autoInputDelay(): number {
    const r = this.rtt.median;
    return r < 0 ? DEFAULT_INPUT_DELAY : inputDelayForRtt(r);
  }

  /** The local match reached its confirmed end: results screen, wait for post-match choices. */
  matchOver(): void {
    if (this.phase !== 'match') return;
    this.phase = 'post';
    if (this.remoteChoice === 'change') this.repick();
    else if (this.remoteChoice === 'rematch') this.onRemoteChoice?.('rematch');
  }

  /** Results screen: ask for a rematch (the host starts it once both asked). */
  requestRematch(): void {
    if (this.phase !== 'post' || this.localChoice) return;
    this.localChoice = 'rematch';
    this.sendLobby({ k: 'rematch' });
    if (this.role === 'host' && this.remoteChoice === 'rematch') this.onRematchReady?.();
  }

  /** Results screen: both players go back to the character pick. */
  changeFighter(): void {
    if (this.phase !== 'post' || this.localChoice) return;
    this.sendLobby({ k: 'change' });
    this.phase = 'lobby';
    this.localPick = null;
    this.remotePick = null;
    this.localChoice = null;
    this.remoteChoice = null;
  }

  /** Tell the peer we are leaving and close the transport. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.sendLobby({ k: 'bye' });
    this.session = null;
    this.transport.close();
  }

  private started(setup: OnlineSetup): void {
    this.lastSetup = setup;
    this.matches++;
    this.phase = 'match';
    this.localChoice = null;
    this.remoteChoice = null;
    this.onStart?.(setup);
  }

  private repick(): void {
    this.phase = 'lobby';
    this.localPick = null;
    this.localChoice = null;
    this.remoteChoice = null;
    this.onRepick?.();
  }

  private onDatagram(b: Uint8Array): void {
    if (messageEpoch(b) === 0) { this.onLobbyDatagram(b); return; }
    const s = this.session;
    // early datagrams are re-sent until acknowledged; other epochs are stale or not ours yet
    if (!s || messageEpoch(b) !== this.epoch) return;
    const m = decodeMessage(b);
    if (m) s.receive(m);
  }

  /** Lobby ping/pong on the realtime channel (outside any match epoch). */
  private onLobbyDatagram(b: Uint8Array): void {
    const m = decodeMessage(b);
    if (m?.type === MSG_PING) this.transport.send(encodeMessage({ type: MSG_PONG, tick: m.tick }, 0));
    else if (m?.type === MSG_PONG) {
      const rtt = this.ticks - m.tick;
      if (rtt >= 0 && rtt <= 600) this.rtt.add(rtt);
    }
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
        if (!this.handshake) this.handshakeTick = this.ticks;
        this.handshake = true;
        if (this.localPick) this.sendLobby({ k: 'pick', char: this.localPick });
        this.onStateChange?.(this.transport.state);
        break;
      case 'pick': this.remotePick = m.char; this.onRemotePick?.(m.char); break;
      case 'start': if (this.role === 'guest') this.started(m.setup); break;
      case 'rematch':
        this.remoteChoice = 'rematch';
        if (this.phase !== 'post') break; // remembered until our own match is over
        this.onRemoteChoice?.('rematch');
        if (this.role === 'host' && this.localChoice === 'rematch') this.onRematchReady?.();
        break;
      case 'change':
        // the opponent picks again: their next `pick` follows on this ordered channel
        this.remotePick = null;
        this.remoteChoice = 'change';
        if (this.phase === 'post') { this.onRemoteChoice?.('change'); this.repick(); }
        break;
      case 'desync': if (this.role === 'host' && m.match === this.epoch) this.session?.requestResync(m.gen); break;
      case 'sync': if (this.role === 'guest' && m.head.match === this.epoch) this.incoming.begin(m.head); break;
      case 'chunk': {
        const t = this.incoming.add(m.gen, m.part, m.data);
        if (t && this.phase === 'match') this.session?.receiveTransfer(t);
        break;
      }
      case 'bye': if (!this.left) { this.left = true; this.onLeave?.('OPPONENT LEFT'); } this.transport.close(); break;
      default: break;
    }
  }
}
