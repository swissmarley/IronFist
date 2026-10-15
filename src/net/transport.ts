import { PERFECT, SimChannel, type ChannelConditions } from './SimChannel';

export type TransportState = 'idle' | 'connecting' | 'connected' | 'closed' | 'failed';

/**
 * Datagram transport between two peers. `send` is the realtime path (unreliable,
 * unordered: input batches, pings, hashes); `sendControl` is reliable and ordered
 * (lobby: hello, picks, match start).
 */
export interface NetTransport {
  readonly state: TransportState;
  send(bytes: Uint8Array): void;
  sendControl(text: string): void;
  onMessage: ((bytes: Uint8Array) => void) | null;
  onControl: ((text: string) => void) | null;
  onStateChange: ((s: TransportState) => void) | null;
  close(): void;
}

/**
 * In-memory transport pair for tests and offline debugging. Datagrams travel through a
 * deterministic `SimChannel` (latency/jitter/loss/duplication in ticks); control messages
 * are reliable and delivered on the next `pump`. Nothing is delivered re-entrantly: call
 * `pump(now)` on each end once per tick.
 */
export class LocalLoopbackTransport implements NetTransport {
  state: TransportState = 'connecting';
  onMessage: ((bytes: Uint8Array) => void) | null = null;
  onControl: ((text: string) => void) | null = null;
  onStateChange: ((s: TransportState) => void) | null = null;
  private peer: LocalLoopbackTransport | null = null;
  private readonly inbox: SimChannel<Uint8Array>;
  private readonly controlInbox: string[] = [];
  private now = 0;

  private constructor(conditions: ChannelConditions, seed: number) {
    this.inbox = new SimChannel<Uint8Array>(conditions, seed);
  }

  /** Two connected ends; `conditions` applies to datagrams in both directions. */
  static pair(conditions: ChannelConditions = PERFECT, seed = 1): [LocalLoopbackTransport, LocalLoopbackTransport] {
    const a = new LocalLoopbackTransport(conditions, seed * 2 + 1);
    const b = new LocalLoopbackTransport(conditions, seed * 2 + 2);
    a.peer = b; b.peer = a;
    a.setState('connected'); b.setState('connected');
    return [a, b];
  }

  get channelStats(): { sent: number; dropped: number; duplicated: number } {
    return { sent: this.inbox.sent, dropped: this.inbox.dropped, duplicated: this.inbox.duplicated };
  }

  send(bytes: Uint8Array): void {
    const p = this.peer;
    if (this.state !== 'connected' || !p) return;
    p.inbox.send(bytes.slice(), p.now);
  }

  sendControl(text: string): void {
    if (this.state !== 'connected' || !this.peer) return;
    this.peer.controlInbox.push(text);
  }

  /** Deliver everything due at tick `now` (control first, then datagrams). */
  pump(now: number): void {
    this.now = now;
    while (this.controlInbox.length) this.onControl?.(this.controlInbox.shift() as string);
    for (const b of this.inbox.poll(now)) this.onMessage?.(b);
  }

  close(): void {
    if (this.state === 'closed') return;
    this.setState('closed');
    const p = this.peer;
    this.peer = null;
    if (p) { p.peer = null; p.setState('closed'); }
  }

  private setState(s: TransportState): void {
    this.state = s;
    this.onStateChange?.(s);
  }
}
