import type { MatchSim, MatchSnapshot } from '@/sim/match';
import type { InputFrame } from '@/input/InputFrame';
import { MAX_BATCH, MSG_HASH, MSG_INPUT, MSG_PING, MSG_PONG, type InputMsg, type NetMessage } from './protocol';

export interface RollbackOptions {
  /** Which sim player this peer controls (host = 0, guest = 1). */
  localPlayer: 0 | 1;
  /** Frames between sampling a local input and the frame it applies to (default 2). */
  inputDelay?: number;
  /** Most frames that may run on predicted remote input before the sim stalls (default 8). */
  maxRollback?: number;
  /** Confirmed-state hash exchange interval in frames (default 60, same as replays). */
  hashInterval?: number;
  /** Ticks between RTT pings (default 30). */
  pingInterval?: number;
  /** Minimum ticks between two time-sync stalls (default 12). */
  syncInterval?: number;
}

export interface RollbackStats {
  ticks: number;
  /** Rollback episodes (restore + re-simulate). */
  rollbacks: number;
  /** Total frames re-simulated. */
  rolledBackFrames: number;
  maxRollbackDepth: number;
  /** Remote inputs that differed from the prediction used. */
  mispredictions: number;
  /** Ticks without a sim advance because the prediction window was full. */
  windowStalls: number;
  /** Ticks skipped to let a lagging peer catch up (time sync). */
  syncStalls: number;
  packetsSent: number;
  packetsReceived: number;
  /** Input packets that arrived after a newer one. */
  outOfOrder: number;
  /** Smoothed round trip in loop ticks (60 Hz). */
  rttTicks: number;
  localAdvantage: number;
  remoteAdvantage: number;
  checkpointsCompared: number;
}

export interface Desync { frame: number; local: number; remote: number }

const INPUT_RING = 256;
const CHECKPOINT_RING = 32;
const NONE = 0x7fffffff;

/**
 * GGPO-style rollback over a deterministic MatchSim. Pure and DOM-free: it is driven by
 * `tick()` once per 60 Hz loop step, fed with `receive()` and talks through `send`.
 *
 * - Local inputs apply `inputDelay` frames after they are sampled.
 * - Missing remote inputs are predicted by repeating the last known one; when the real
 *   input arrives and differs, the sim is restored to that frame from a snapshot ring and
 *   re-simulated up to the present in the same tick.
 * - At most `maxRollback` frames may run ahead of the last confirmed remote input; past
 *   that the session stalls (keeps sending, does not advance).
 * - Each side estimates its frame advantage; the side that runs ahead skips a tick now
 *   and then so both stay in step.
 * - Every `hashInterval` frames the hash of the confirmed state is exchanged; a mismatch
 *   sets `desync`.
 * - `onStepped(frame, resim)` fires after every sim step; `resim` is true for frames whose
 *   events were already presented, so audio/VFX are not played twice.
 */
export class RollbackSession {
  readonly local: 0 | 1;
  readonly remote: 0 | 1;
  readonly inputDelay: number;
  readonly maxRollback: number;
  readonly hashInterval: number;
  readonly stats: RollbackStats = {
    ticks: 0, rollbacks: 0, rolledBackFrames: 0, maxRollbackDepth: 0, mispredictions: 0, windowStalls: 0, syncStalls: 0,
    packetsSent: 0, packetsReceived: 0, outOfOrder: 0, rttTicks: 0, localAdvantage: 0, remoteAdvantage: 0, checkpointsCompared: 0,
  };
  desync: Desync | null = null;
  onStepped: ((frame: number, resim: boolean) => void) | null = null;

  private readonly pingInterval: number;
  private readonly syncInterval: number;
  private readonly localInputs = new Int32Array(INPUT_RING);
  private readonly remoteInputs = new Int32Array(INPUT_RING);
  private readonly usedRemote = new Int32Array(INPUT_RING);
  private localKnown: number;
  private remoteKnown: number;
  private remoteAck: number;
  private rollbackFrom = NONE;
  private presented: number;
  private readonly snaps: MatchSnapshot[];
  private readonly snapHash: Float64Array;
  private readonly stepInputs: [InputFrame, InputFrame] = [0, 0];
  // time sync
  private remoteFrame = 0;
  private remoteFrameTick = 0;
  private lastRemoteSeq = -1;
  private lastSyncTick = 0;
  // transport bookkeeping
  private seq = 0;
  private lastRecvTick = 0;
  private rttSamples = 0;
  // checkpoints
  private nextCheckpoint: number;
  private readonly ckLocal = new Float64Array(CHECKPOINT_RING * 2);
  private readonly ckRemote = new Float64Array(CHECKPOINT_RING * 2);
  private readonly ckCompared = new Float64Array(CHECKPOINT_RING);

  constructor(readonly sim: MatchSim, opts: RollbackOptions, private readonly send: (m: NetMessage) => void) {
    this.local = opts.localPlayer;
    this.remote = opts.localPlayer === 0 ? 1 : 0;
    this.inputDelay = Math.max(0, opts.inputDelay ?? 2);
    this.maxRollback = Math.max(1, opts.maxRollback ?? 8);
    this.hashInterval = Math.max(1, opts.hashInterval ?? 60);
    this.pingInterval = Math.max(1, opts.pingInterval ?? 30);
    this.syncInterval = Math.max(1, opts.syncInterval ?? 12);
    const start = sim.frame;
    // inputs for the first `inputDelay` frames are neutral on both sides by definition
    this.localKnown = start + this.inputDelay - 1;
    this.remoteKnown = start - 1;
    this.remoteAck = start - 1;
    this.presented = start - 1;
    this.nextCheckpoint = start - (start % this.hashInterval) + this.hashInterval;
    const slots = this.maxRollback + 4;
    this.snaps = Array.from({ length: slots }, () => sim.allocSnapshot());
    this.snapHash = new Float64Array(slots);
    this.ckLocal.fill(-1); this.ckRemote.fill(-1); this.ckCompared.fill(-1);
  }

  /** Current (possibly predicted) sim frame: the next frame to simulate. */
  get frame(): number { return this.sim.frame; }

  /** Last frame whose inputs are final for both players and already simulated with them. */
  get confirmedFrame(): number {
    return Math.min(this.remoteKnown, this.sim.frame - 1, this.rollbackFrom - 1);
  }

  /** Ticks since anything arrived from the peer (disconnect detection). */
  get ticksSinceReceive(): number { return this.stats.ticks - this.lastRecvTick; }

  /** Both players' inputs for a confirmed frame (absolute InputFrames, [P1, P2]). */
  inputsAt(frame: number, out: [InputFrame, InputFrame]): [InputFrame, InputFrame] {
    const i = frame % INPUT_RING;
    out[this.local] = this.localInputs[i] as number;
    out[this.remote] = this.remoteInputs[i] as number;
    return out;
  }

  /** Inputs the most recent simulation of `frame` used (remote may be a prediction). */
  usedInputsAt(frame: number, out: [InputFrame, InputFrame]): [InputFrame, InputFrame] {
    const i = frame % INPUT_RING;
    out[this.local] = this.localInputs[i] as number;
    out[this.remote] = this.usedRemote[i] as number;
    return out;
  }

  /** Hash of the confirmed state at a checkpoint frame (multiple of hashInterval), if still held. */
  checkpointHash(frame: number): number | undefined {
    if (frame < 0 || frame % this.hashInterval !== 0) return undefined;
    const i = ((frame / this.hashInterval) % CHECKPOINT_RING) * 2;
    return this.ckLocal[i] === frame ? (this.ckLocal[i + 1] as number) : undefined;
  }

  /** Most recent confirmed checkpoint, or null before the first one. */
  get lastCheckpoint(): { frame: number; hash: number } | null {
    const f = this.nextCheckpoint - this.hashInterval;
    const h = this.checkpointHash(f);
    return h === undefined ? null : { frame: f, hash: h };
  }

  receive(m: NetMessage): void {
    this.stats.packetsReceived++;
    this.lastRecvTick = this.stats.ticks;
    switch (m.type) {
      case MSG_INPUT: this.onInput(m); break;
      case MSG_PING: this.emit({ type: MSG_PONG, tick: m.tick }); break;
      case MSG_PONG: {
        const rtt = this.stats.ticks - m.tick;
        if (rtt < 0 || rtt > 600) break;
        this.stats.rttTicks = this.rttSamples === 0 ? rtt : Math.trunc((this.stats.rttTicks * 3 + rtt + 2) / 4);
        this.rttSamples++;
        break;
      }
      case MSG_HASH: {
        if (m.frame % this.hashInterval !== 0) break;
        const i = ((m.frame / this.hashInterval) % CHECKPOINT_RING) * 2;
        this.ckRemote[i] = m.frame; this.ckRemote[i + 1] = m.hash >>> 0;
        this.compare(m.frame);
        break;
      }
    }
  }

  /**
   * One loop step: apply any pending rollback, then advance one frame with `localInput`
   * unless the prediction window is full or time sync asks to wait. Returns true when the
   * sim advanced.
   */
  tick(localInput: InputFrame): boolean {
    this.stats.ticks++;
    this.settle();
    const f = this.sim.frame;
    let advance = true;
    if (f - this.remoteKnown > this.maxRollback) { advance = false; this.stats.windowStalls++; }
    else if (this.shouldWait()) { advance = false; this.stats.syncStalls++; }
    if (advance) {
      const lf = f + this.inputDelay;
      if (lf > this.localKnown) { this.localInputs[lf % INPUT_RING] = localInput & 0xffff; this.localKnown = lf; }
      this.advance();
    }
    this.flush();
    return advance;
  }

  /** Network upkeep without advancing (results screen, loading): rollbacks, hashes, resends. */
  pump(): void {
    this.stats.ticks++;
    this.settle();
    this.flush();
  }

  private settle(): void {
    this.applyRollback();
    this.reportCheckpoints();
  }

  private flush(): void {
    this.sendInputs();
    if (this.stats.ticks % this.pingInterval === 1) {
      this.emit({ type: MSG_PING, tick: this.stats.ticks });
      // hashes travel on the lossy channel: repeat the latest one so a single loss is harmless
      const last = this.lastCheckpoint;
      if (last) this.emit({ type: MSG_HASH, frame: last.frame, hash: last.hash });
    }
  }

  private onInput(m: InputMsg): void {
    if (m.seq > this.lastRemoteSeq || this.lastRemoteSeq - m.seq > 0x7fffffff) {
      this.lastRemoteSeq = m.seq;
      this.remoteFrame = m.frame;
      this.remoteFrameTick = this.stats.ticks;
      this.stats.remoteAdvantage = m.adv;
    } else this.stats.outOfOrder++;
    if (m.ack > this.remoteAck) this.remoteAck = Math.min(m.ack, this.localKnown);
    if (m.start > this.remoteKnown + 1) return; // gap: wait for a packet that starts earlier
    const simulated = this.sim.frame;
    for (let k = 0; k < m.inputs.length; k++) {
      const f = m.start + k;
      if (f <= this.remoteKnown) continue;
      if (f - simulated >= INPUT_RING - 8) break; // never overwrite inputs still needed
      const v = m.inputs[k] as number;
      const i = f % INPUT_RING;
      this.remoteInputs[i] = v;
      this.remoteKnown = f;
      if (f < simulated && this.usedRemote[i] !== v) {
        this.stats.mispredictions++;
        if (f < this.rollbackFrom) this.rollbackFrom = f;
      }
    }
  }

  private predict(): number {
    return this.remoteKnown >= 0 ? (this.remoteInputs[this.remoteKnown % INPUT_RING] as number) : 0;
  }

  /** Snapshot, step one frame with known/predicted inputs and notify. */
  private advance(): void {
    const sim = this.sim;
    const f = sim.frame;
    const slot = f % this.snaps.length;
    sim.snapshot(this.snaps[slot]);
    if (f % this.hashInterval === 0) this.snapHash[slot] = sim.hash();
    const i = f % INPUT_RING;
    const r = f <= this.remoteKnown ? (this.remoteInputs[i] as number) : this.predict();
    this.usedRemote[i] = r;
    this.stepInputs[this.local] = this.localInputs[i] as number;
    this.stepInputs[this.remote] = r;
    sim.step(this.stepInputs);
    const resim = f <= this.presented;
    if (!resim) this.presented = f;
    this.onStepped?.(f, resim);
  }

  private applyRollback(): void {
    const from = this.rollbackFrom;
    this.rollbackFrom = NONE;
    const target = this.sim.frame;
    if (from >= target) return;
    const snap = this.snaps[from % this.snaps.length];
    if (!snap || snap.frame !== from) throw new Error(`rollback to ${from} outside the snapshot window (at ${target})`);
    this.sim.restore(snap);
    const depth = target - from;
    this.stats.rollbacks++;
    this.stats.rolledBackFrames += depth;
    if (depth > this.stats.maxRollbackDepth) this.stats.maxRollbackDepth = depth;
    while (this.sim.frame < target) this.advance();
  }

  /** Report checkpoints whose state no longer depends on any prediction. */
  private reportCheckpoints(): void {
    for (;;) {
      const cp = this.nextCheckpoint;
      if (cp >= this.sim.frame || this.remoteKnown < cp - 1) return;
      const slot = cp % this.snaps.length;
      this.nextCheckpoint += this.hashInterval;
      if (this.snaps[slot]?.frame !== cp) continue;
      const hash = this.snapHash[slot] as number;
      const i = ((cp / this.hashInterval) % CHECKPOINT_RING) * 2;
      this.ckLocal[i] = cp; this.ckLocal[i + 1] = hash;
      this.emit({ type: MSG_HASH, frame: cp, hash });
      this.compare(cp);
    }
  }

  private compare(frame: number): void {
    const i = ((frame / this.hashInterval) % CHECKPOINT_RING) * 2;
    if (this.ckLocal[i] !== frame || this.ckRemote[i] !== frame || this.ckCompared[i / 2] === frame) return;
    this.ckCompared[i / 2] = frame;
    this.stats.checkpointsCompared++;
    const local = this.ckLocal[i + 1] as number, remote = this.ckRemote[i + 1] as number;
    if (local !== remote && !this.desync) this.desync = { frame, local, remote };
  }

  /** Frame advantage: how far this peer runs ahead of its estimate of the remote's frame. */
  private advantage(): number {
    if (this.lastRemoteSeq < 0) return 0;
    const est = this.remoteFrame + (this.stats.ticks - this.remoteFrameTick) + Math.trunc(this.stats.rttTicks / 2);
    return this.sim.frame - est;
  }

  private shouldWait(): boolean {
    const adv = this.advantage();
    this.stats.localAdvantage = adv;
    if (this.stats.ticks - this.lastSyncTick < this.syncInterval) return false;
    // both sides see the same gap from opposite ends; wait only when ahead by a whole frame
    if (adv - this.stats.remoteAdvantage < 2) return false;
    this.lastSyncTick = this.stats.ticks;
    return true;
  }

  private sendInputs(): void {
    // oldest unacknowledged first: the receiver only accepts contiguous runs
    const start = this.remoteAck + 1;
    const n = Math.max(0, Math.min(MAX_BATCH, this.localKnown - start + 1));
    const inputs: number[] = new Array<number>(n);
    for (let k = 0; k < n; k++) inputs[k] = this.localInputs[(start + k) % INPUT_RING] as number;
    this.emit({ type: MSG_INPUT, seq: this.seq++, ack: this.remoteKnown, frame: this.sim.frame, adv: this.advantage(), start, inputs });
  }

  private emit(m: NetMessage): void {
    this.stats.packetsSent++;
    this.send(m);
  }
}
