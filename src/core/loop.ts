/**
 * Fixed-timestep game loop with accumulator and render interpolation.
 *
 * Order per animation frame:
 *   1. accumulate elapsed wall time (clamped to avoid spiral of death)
 *   2. while accumulator >= STEP: sampleInput() -> step() ; this samples input
 *      right before each sim step so there is no added buffering latency
 *   3. render(alpha) where alpha = accumulator / STEP for interpolation
 *
 * The loop has no knowledge of the game; it only drives callbacks. A headless
 * variant (`advance`) allows tests to drive it with a fake clock.
 */
export const SIM_HZ = 60;
export const STEP_MS = 1000 / SIM_HZ;
const MAX_STEPS_PER_FRAME = 6;
const MAX_FRAME_MS = 250;

export interface LoopCallbacks {
  /** Called immediately before each sim step so input is as fresh as possible. */
  sampleInput(): void;
  /** Advance the simulation by exactly one fixed step. */
  step(): void;
  /** Render with interpolation factor alpha in [0,1). dtMs is wall time since last render. */
  render(alpha: number, dtMs: number): void;
}

export interface LoopStats {
  simMs: number;
  renderMs: number;
  frameMs: number;
  stepsLastFrame: number;
  fps: number;
}

export class FixedStepLoop {
  private accumulator = 0;
  private lastTime = -1;
  private rafId = 0;
  private running = false;
  private paused = false;
  readonly stats: LoopStats = { simMs: 0, renderMs: 0, frameMs: 0, stepsLastFrame: 0, fps: 0 };
  private fpsAccum = 0;
  private fpsFrames = 0;
  private now: () => number;

  // eslint-disable-next-line no-restricted-properties -- the loop is wall-clock driven by design; the sim never reads it
  constructor(private readonly cb: LoopCallbacks, now: () => number = () => performance.now()) {
    this.now = now;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    const tick = (): void => {
      if (!this.running) return;
      this.frame(this.now());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Step exactly once while paused (frame advance). */
  stepOnce(): void {
    this.cb.sampleInput();
    this.cb.step();
  }

  /** Drive a frame with an explicit timestamp. Used by rAF and by headless tests. */
  frame(timeMs: number): void {
    if (this.lastTime < 0) this.lastTime = timeMs;
    let dt = timeMs - this.lastTime;
    this.lastTime = timeMs;
    if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;
    if (dt < 0) dt = 0;
    this.stats.frameMs = dt;

    let steps = 0;
    const t0 = this.now();
    if (!this.paused) {
      this.accumulator += dt;
      while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        this.cb.sampleInput();
        this.cb.step();
        this.accumulator -= STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME && this.accumulator >= STEP_MS) {
        // Too far behind: drop the backlog rather than freeze the page.
        this.accumulator = this.accumulator % STEP_MS;
      }
    }
    const t1 = this.now();
    this.stats.simMs = t1 - t0;
    this.stats.stepsLastFrame = steps;

    const alpha = this.paused ? 0 : this.accumulator / STEP_MS;
    this.cb.render(alpha, dt);
    this.stats.renderMs = this.now() - t1;

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 500) {
      this.stats.fps = (this.fpsFrames * 1000) / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}
