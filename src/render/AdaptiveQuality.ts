import { type QualityTier, tierFromBenchmark } from './quality';

export interface AdaptiveDecision {
  /** Tier chosen by the start-up probe (emitted once). */
  tier?: QualityTier;
  /** New dynamic render-scale multiplier (0.5..1). */
  scale?: number;
}

export interface AdaptiveOptions {
  backend: 'webgpu' | 'webgl2';
  /** Run the start-up benchmark and pick a tier (quality setting 'auto'). */
  probe: boolean;
  /** Frames ignored while shaders compile and caches warm. */
  warmupFrames?: number;
  probeFrames?: number;
  minScale?: number;
  /** Frame time above which the scale steps down / below which it steps up. */
  slowMs?: number;
  fastMs?: number;
}

/**
 * Frame-time driven quality control. Two parts:
 *  - a one-shot probe over the first frames that picks a tier from the average
 *    frame time (`tierFromBenchmark`), and
 *  - a dynamic render scale that steps down when the smoothed frame time
 *    exceeds the budget and creeps back up when there is headroom.
 * Pure bookkeeping: the caller feeds frame times and applies the decisions.
 */
export class AdaptiveQuality {
  private frames = 0;
  private probeSum = 0;
  private probeCount = 0;
  private probed = false;
  private ema = 1000 / 60;
  private scale = 1;
  private sinceAdjust = 0;
  private readonly warmup: number;
  private readonly probeLen: number;
  private readonly minScale: number;
  private readonly slowMs: number;
  private readonly fastMs: number;

  constructor(private readonly opts: AdaptiveOptions) {
    this.warmup = opts.warmupFrames ?? 30;
    this.probeLen = opts.probeFrames ?? 120;
    this.minScale = opts.minScale ?? 0.6;
    this.slowMs = opts.slowMs ?? 19;
    this.fastMs = opts.fastMs ?? 14;
    this.probed = !opts.probe;
  }

  get currentScale(): number { return this.scale; }
  get hasProbed(): boolean { return this.probed; }

  /** Feed one rendered frame. `dynamic` enables the render-scale controller. */
  sample(frameMs: number, dynamic: boolean): AdaptiveDecision | null {
    this.frames++;
    if (this.frames <= this.warmup) return null;
    if (!this.probed) {
      this.probeSum += frameMs;
      this.probeCount++;
      if (this.probeCount < this.probeLen) return null;
      this.probed = true;
      this.sinceAdjust = 0;
      return { tier: tierFromBenchmark(this.probeSum / this.probeCount, this.opts.backend) };
    }
    if (!dynamic) return null;
    this.ema = this.ema * 0.9 + frameMs * 0.1;
    this.sinceAdjust++;
    if (this.sinceAdjust < 60) return null;
    this.sinceAdjust = 0;
    if (this.ema > this.slowMs && this.scale > this.minScale + 1e-6) {
      this.scale = Math.max(this.minScale, Math.round((this.scale - 0.1) * 100) / 100);
      return { scale: this.scale };
    }
    if (this.ema < this.fastMs && this.scale < 1 - 1e-6) {
      this.scale = Math.min(1, Math.round((this.scale + 0.05) * 100) / 100);
      return { scale: this.scale };
    }
    return null;
  }
}
