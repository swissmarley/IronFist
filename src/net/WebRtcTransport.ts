import { decodeSignal, encodeSignal } from './signalling';
import type { NetTransport, TransportState } from './transport';

export interface WebRtcOptions {
  /** ICE servers; default: one public STUN server. Empty = host candidates only (LAN / same machine). */
  iceServers?: RTCIceServer[];
  /** Give up waiting for ICE gathering after this long and signal what was found (ms). */
  gatherTimeoutMs?: number;
}

export const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * NetTransport over two RTCDataChannels on one peer connection:
 * - `rt`  unordered, maxRetransmits 0 — input batches, pings, hashes (UDP-like)
 * - `ctl` ordered, reliable — lobby messages
 * Signalling is non-trickle: the offer/answer strings already contain every gathered ICE
 * candidate, so one copy/paste in each direction is enough.
 */
export class WebRtcTransport implements NetTransport {
  state: TransportState = 'idle';
  onMessage: ((bytes: Uint8Array) => void) | null = null;
  onControl: ((text: string) => void) | null = null;
  onStateChange: ((s: TransportState) => void) | null = null;
  private readonly pc: RTCPeerConnection;
  private rt: RTCDataChannel | null = null;
  private ctl: RTCDataChannel | null = null;
  private readonly gatherTimeoutMs: number;
  bytesSent = 0;
  bytesReceived = 0;

  private constructor(opts: WebRtcOptions) {
    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers ?? DEFAULT_ICE });
    this.gatherTimeoutMs = opts.gatherTimeoutMs ?? 4000;
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.setState('failed');
      else if (s === 'closed') this.setState('closed');
    };
    this.pc.ondatachannel = (e) => this.adopt(e.channel);
  }

  /** Host: create the connection and the offer string to hand to the guest. */
  static async host(opts: WebRtcOptions = {}): Promise<{ transport: WebRtcTransport; offer: string }> {
    const t = new WebRtcTransport(opts);
    t.setState('connecting');
    t.adopt(t.pc.createDataChannel('rt', { ordered: false, maxRetransmits: 0 }));
    t.adopt(t.pc.createDataChannel('ctl', { ordered: true }));
    await t.pc.setLocalDescription(await t.pc.createOffer());
    return { transport: t, offer: await t.localSignal() };
  }

  /** Guest: accept the host's offer string; returns the answer string to send back. */
  static async join(offer: string, opts: WebRtcOptions = {}): Promise<{ transport: WebRtcTransport; answer: string }> {
    const d = decodeSignal(offer);
    if (!d || d.type !== 'offer') throw new Error('not a host offer');
    const t = new WebRtcTransport(opts);
    t.setState('connecting');
    await t.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
    await t.pc.setLocalDescription(await t.pc.createAnswer());
    return { transport: t, answer: await t.localSignal() };
  }

  /** Host: apply the guest's answer string. */
  async acceptAnswer(answer: string): Promise<void> {
    const d = decodeSignal(answer);
    if (!d || d.type !== 'answer') throw new Error('not a guest answer');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
  }

  send(bytes: Uint8Array): void {
    const c = this.rt;
    if (!c || c.readyState !== 'open') return;
    // a congested channel drops realtime packets instead of queueing stale inputs
    if (c.bufferedAmount > 64 * 1024) return;
    c.send(bytes as Uint8Array<ArrayBuffer>);
    this.bytesSent += bytes.byteLength;
  }

  sendControl(text: string): void {
    if (this.ctl?.readyState === 'open') this.ctl.send(text);
  }

  close(): void {
    if (this.state === 'closed') return;
    this.rt?.close(); this.ctl?.close();
    this.pc.close();
    this.setState('closed');
  }

  private adopt(c: RTCDataChannel): void {
    c.binaryType = 'arraybuffer';
    if (c.label === 'rt') this.rt = c; else this.ctl = c;
    c.onopen = () => { if (this.rt?.readyState === 'open' && this.ctl?.readyState === 'open') this.setState('connected'); };
    c.onclose = () => { if (this.state === 'connected' || this.state === 'connecting') this.setState('closed'); };
    c.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
      if (typeof e.data === 'string') { this.onControl?.(e.data); return; }
      this.bytesReceived += e.data.byteLength;
      this.onMessage?.(new Uint8Array(e.data));
    };
  }

  /** Wait for ICE gathering (or the timeout) and pack the local description. */
  private async localSignal(): Promise<string> {
    const pc = this.pc;
    if (pc.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, this.gatherTimeoutMs);
        function done(): void { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); }
        function check(): void { if (pc.iceGatheringState === 'complete') done(); }
        pc.addEventListener('icegatheringstatechange', check);
      });
    }
    const d = pc.localDescription;
    if (!d) throw new Error('no local description');
    return encodeSignal({ type: d.type, sdp: d.sdp });
  }

  private setState(s: TransportState): void {
    if (this.state === s) return;
    this.state = s;
    this.onStateChange?.(s);
  }
}
