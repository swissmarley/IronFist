/** Input delay bounds for the automatic pick (D-028); `?delay=` may go outside them. */
export const MIN_AUTO_DELAY = 1;
export const MAX_AUTO_DELAY = 6;
/** Used when no RTT sample arrived at all (and by tests that fix the delay). */
export const DEFAULT_INPUT_DELAY = 2;
/** Upper bound for a manual `?delay=` value (the rollback window is 8 frames). */
export const MAX_INPUT_DELAY = 8;

/**
 * Input delay for a measured round trip in 60 Hz ticks: `clamp(ceil(rtt / 2) + 1, 1, 6)`.
 *
 * With time sync both peers simulate frame F at about the same moment. A remote input
 * sampled for frame F + d arrives one-way-latency (rtt / 2) frames later, so with
 * d >= ceil(rtt / 2) + 1 it is normally there before it is needed (the +1 absorbs tick
 * phase and jitter) and steady play needs no rollback at all. Above 6 frames (100 ms) the
 * delay would be felt more than the rollbacks it saves, so the rest is left to rollback
 * (8-frame window). LAN (rtt <= 2 ticks) keeps the old fixed default of 2.
 */
export function inputDelayForRtt(rttTicks: number): number {
  const half = Math.trunc((Math.max(0, rttTicks) + 1) / 2);
  return Math.max(MIN_AUTO_DELAY, Math.min(MAX_AUTO_DELAY, half + 1));
}

/** Clamp a manual delay override to something the session can run. */
export function clampInputDelay(d: number): number {
  return Math.max(0, Math.min(MAX_INPUT_DELAY, Math.trunc(d)));
}

/** Recent RTT samples (ticks); the median ignores a single slow or lost-and-retried ping. */
export class RttProbe {
  private readonly ring: number[] = [];
  private next = 0;
  count = 0;

  constructor(private readonly capacity = 15) {}

  add(rttTicks: number): void {
    if (this.ring.length < this.capacity) this.ring.push(rttTicks);
    else this.ring[this.next] = rttTicks;
    this.next = (this.next + 1) % this.capacity;
    this.count++;
  }

  /** Median of the held samples, or -1 before the first one. */
  get median(): number {
    if (this.ring.length === 0) return -1;
    const s = this.ring.slice().sort((a, b) => a - b);
    return s[(s.length - 1) >> 1] as number;
  }
}
