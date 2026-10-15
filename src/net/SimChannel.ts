import { Rng } from '@/core/rng';

export interface ChannelConditions {
  /** One-way latency in ticks. */
  latency: number;
  /** Extra random latency 0..jitter ticks per packet (reorders packets). */
  jitter: number;
  /** Packet loss in percent. */
  lossPct: number;
  /** Duplicate delivery in percent. */
  dupPct: number;
}

export const PERFECT: ChannelConditions = { latency: 0, jitter: 0, lossPct: 0, dupPct: 0 };

/**
 * A deterministic lossy, jittery one-way datagram channel driven by an explicit tick
 * clock and a seeded Rng. Used by the netcode tests and the loopback transport.
 */
export class SimChannel<T> {
  private readonly rng: Rng;
  private readonly queue: { at: number; order: number; item: T }[] = [];
  private order = 0;
  sent = 0;
  dropped = 0;
  duplicated = 0;

  constructor(public conditions: ChannelConditions, seed: number) {
    this.rng = new Rng(seed);
  }

  send(item: T, now: number): void {
    this.sent++;
    const c = this.conditions;
    if (c.lossPct > 0 && this.rng.chance(c.lossPct)) { this.dropped++; return; }
    const copies = c.dupPct > 0 && this.rng.chance(c.dupPct) ? 2 : 1;
    if (copies === 2) this.duplicated++;
    for (let k = 0; k < copies; k++) {
      const at = now + c.latency + (c.jitter > 0 ? this.rng.range(0, c.jitter) : 0);
      this.queue.push({ at, order: this.order++, item });
    }
  }

  /** Items due at `now`, in arrival order (ties keep send order). */
  poll(now: number): T[] {
    const due: { at: number; order: number; item: T }[] = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i] as { at: number; order: number; item: T };
      if (q.at <= now) { due.push(q); this.queue.splice(i, 1); }
    }
    due.sort((a, b) => a.at - b.at || a.order - b.order);
    return due.map((q) => q.item);
  }

  get pending(): number { return this.queue.length; }
}
