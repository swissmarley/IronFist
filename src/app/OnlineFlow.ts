import { NetPeer, type NetRole, type OnlineSetup } from '@/net/NetPeer';
import { WebRtcTransport, type WebRtcOptions } from '@/net/WebRtcTransport';
import { createSignaller, type Signaller } from '@/net/signalling';
import type { RollbackStats } from '@/net/RollbackSession';
import type { OnlineScreen } from '@/ui/screens/OnlineScreen';
import { STEP_MS } from '@/core/loop';

export const DEFAULT_INPUT_DELAY = 2;

/** What the online lobby needs from the App (screen changes and match launch). */
export interface OnlineHooks {
  /** Show the ONLINE screen. */
  show(): void;
  /** Open the one-player character select for the local pick. */
  openSelect(): void;
  /** Host: open the stage select. */
  openStageSelect(): void;
  /** Rules for the match the host starts. */
  rules(): { roundsToWin: number; roundTimeSec: number; stage: string | null };
  launch(setup: OnlineSetup, peer: NetPeer): void;
  /** The connection ended: leave any match/select screen and show the reason. */
  abort(reason: string): void;
}

/**
 * Lobby flow for online play: HOST/JOIN, manual copy/paste signalling (or a registered
 * signaller via `?signal=`), character picks, the host's start message. Each peer picks
 * only its own fighter (host = P1, guest = P2); the host also picks the stage.
 */
export class OnlineFlow {
  peer: NetPeer | null = null;
  /** `?p1=` / `?p2=`: preset picks that skip the select screen (tests, quick rematches). */
  pinned: { p1: string | null; p2: string | null } = { p1: null, p2: null };
  /** `?signal=` value; null = manual copy/paste. */
  signal: string | null = null;
  rtc: WebRtcOptions = {};
  private pending: WebRtcTransport | null = null;
  private signaller: Signaller | null = null;
  private role: NetRole | null = null;
  private announced = false;
  private generation = 0;

  constructor(private readonly screen: OnlineScreen, private readonly hooks: OnlineHooks) {
    screen.onHost = () => void this.beginHost();
    screen.onJoin = () => void this.beginJoin();
    screen.onSubmit = (code) => void this.submit(code);
  }

  /** Enter the lobby; with a role, skip the HOST/JOIN choice. */
  open(role: NetRole | null = null): void {
    this.leave();
    this.screen.setRole(null);
    this.hooks.show();
    if (role === 'host') void this.beginHost();
    else if (role === 'guest') void this.beginJoin();
  }

  get active(): boolean { return this.peer !== null || this.pending !== null; }

  async beginHost(): Promise<void> {
    this.leave();
    const gen = this.generation;
    this.role = 'host';
    this.screen.setRole('host');
    this.screen.setStatus('CREATING CODE…', 'busy');
    try {
      const { transport, offer } = await WebRtcTransport.host(this.rtc);
      if (gen !== this.generation) { transport.close(); return; }
      this.pending = transport;
      this.attach(transport, 'host');
      this.screen.setLocalCode(offer);
      this.screen.setStatus('WAITING FOR REPLY', 'busy');
      this.signaller = createSignaller(this.signal, 'host');
      if (this.signaller) await this.submit(await this.signaller.exchangeOffer(offer));
    } catch (err) {
      if (gen === this.generation) this.screen.setStatus(`FAILED: ${String(err)}`, 'error');
    }
  }

  async beginJoin(): Promise<void> {
    this.leave();
    const gen = this.generation;
    this.role = 'guest';
    this.screen.setRole('guest');
    this.screen.setStatus("PASTE THE HOST'S CODE", 'idle');
    this.signaller = createSignaller(this.signal, 'guest');
    if (!this.signaller) return;
    try {
      const offer = await this.signaller.awaitOffer();
      if (gen === this.generation) await this.submit(offer);
    } catch (err) {
      if (gen === this.generation) this.screen.setStatus(`FAILED: ${String(err)}`, 'error');
    }
  }

  /** The remote code was pasted (host: the reply; guest: the host's code). */
  async submit(code: string): Promise<void> {
    const gen = this.generation;
    try {
      if (this.role === 'host') {
        if (!this.pending) return;
        await this.pending.acceptAnswer(code);
        this.screen.setStatus('CONNECTING…', 'busy');
      } else if (this.role === 'guest') {
        if (this.pending) return;
        this.screen.setStatus('CREATING REPLY…', 'busy');
        const { transport, answer } = await WebRtcTransport.join(code, this.rtc);
        if (gen !== this.generation) { transport.close(); return; }
        this.pending = transport;
        this.attach(transport, 'guest');
        this.screen.setLocalCode(answer);
        this.screen.setStatus('WAITING FOR THE HOST TO CONNECT', 'busy');
        if (this.signaller) await this.signaller.sendAnswer(answer);
      }
    } catch (err) {
      if (gen === this.generation) this.screen.setStatus(`INVALID CODE (${err instanceof Error ? err.message : String(err)})`, 'error');
    }
  }

  /** The local player's character (from the select screen or `pinned`). */
  localPicked(char: string): void {
    const peer = this.peer;
    if (!peer) return;
    peer.pick(char);
    if (this.role === 'guest') {
      this.hooks.show();
      this.screen.setStatus('WAITING FOR THE HOST TO START', 'ok');
    } else this.maybeStart();
  }

  /** Host chose the stage (already resolved from RANDOM). */
  stageChosen(stage: string): void {
    const peer = this.peer;
    if (!peer || this.role !== 'host' || !peer.localPick || !peer.remotePick) return;
    const rules = this.hooks.rules();
    peer.start({ p1: peer.localPick, p2: peer.remotePick, stage, seed: (Date.now() % 1000000) | 1, roundsToWin: rules.roundsToWin, roundTimeSec: rules.roundTimeSec, inputDelay: DEFAULT_INPUT_DELAY });
  }

  /** Close everything (back to menu). */
  leave(): void {
    this.generation++;
    this.peer?.leave();
    this.peer = null;
    this.pending?.close();
    this.pending = null;
    this.signaller?.close();
    this.signaller = null;
    this.announced = false;
  }

  /** Show the last match's netcode numbers on the lobby screen. */
  reportStats(s: RollbackStats): void {
    this.screen.setStats(`LAST MATCH · RTT ${Math.round(s.rttTicks * STEP_MS)} ms · ROLLBACKS ${s.rollbacks} (${s.rolledBackFrames} frames, max ${s.maxRollbackDepth}) · STALLS ${s.windowStalls + s.syncStalls}`);
  }

  private attach(transport: WebRtcTransport, role: NetRole): void {
    const peer = new NetPeer(transport, role);
    this.peer = peer;
    peer.onStateChange = (s) => {
      if (peer !== this.peer) return;
      if (s === 'connecting') this.screen.setStatus('CONNECTING…', 'busy');
      if (peer.connected && !this.announced) { this.announced = true; this.onConnected(); }
    };
    peer.onRemotePick = () => { if (peer === this.peer) this.maybeStart(); };
    peer.onStart = (setup) => { if (peer === this.peer) this.hooks.launch(setup, peer); };
    peer.onLeave = (reason) => {
      if (peer !== this.peer) return;
      this.peer = null;
      this.pending = null;
      this.hooks.abort(reason);
      this.screen.setRole(null);
      this.screen.setStatus(reason, 'error');
    };
  }

  private onConnected(): void {
    this.screen.setStatus('CONNECTED', 'ok');
    const pin = this.role === 'host' ? this.pinned.p1 : this.pinned.p2;
    if (pin) this.localPicked(pin);
    else this.hooks.openSelect();
  }

  private maybeStart(): void {
    const peer = this.peer;
    if (!peer || this.role !== 'host' || !peer.localPick) return;
    if (!peer.remotePick) { this.hooks.show(); this.screen.setStatus("CONNECTED · WAITING FOR THE OPPONENT'S PICK", 'ok'); return; }
    const stage = this.hooks.rules().stage;
    if (stage) this.stageChosen(stage);
    else this.hooks.openStageSelect();
  }
}
