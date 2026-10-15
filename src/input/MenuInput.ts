import { IN_B1, IN_B2, IN_B3, IN_B4, IN_BACK, IN_DOWN, IN_LEFT, IN_RIGHT, IN_START, IN_UP, type InputFrame } from './InputFrame';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'start' | 'alt';

const REPEAT_DELAY = 22; // frames before auto-repeat
const REPEAT_RATE = 6;

/**
 * Turns raw per-player InputFrames into edge-triggered menu actions with
 * directional auto-repeat. Sampled once per sim step from both players.
 */
export class MenuInput {
  private prev: [InputFrame, InputFrame] = [0, 0];
  private held: [number, number] = [0, 0];
  private heldDir: [number, number] = [0, 0];
  readonly queue: { player: number; action: MenuAction }[] = [];

  /** Feed one frame of both players' inputs. */
  push(frames: readonly [InputFrame, InputFrame]): void {
    for (let p = 0; p < 2; p++) {
      const cur = frames[p] as InputFrame, prev = this.prev[p] as InputFrame;
      const pressed = cur & ~prev;
      if (pressed & (IN_B1 | IN_B3)) this.queue.push({ player: p, action: 'confirm' });
      if (pressed & (IN_B2 | IN_B4 | IN_BACK)) this.queue.push({ player: p, action: 'back' });
      if (pressed & IN_START) this.queue.push({ player: p, action: 'start' });
      const dir = cur & (IN_UP | IN_DOWN | IN_LEFT | IN_RIGHT);
      if (dir !== this.heldDir[p]) { this.heldDir[p] = dir; this.held[p] = 0; if (dir) this.emitDir(p, dir); }
      else if (dir) {
        const h = (this.held[p] as number) + 1;
        this.held[p] = h;
        if (h >= REPEAT_DELAY && (h - REPEAT_DELAY) % REPEAT_RATE === 0) this.emitDir(p, dir);
      }
      this.prev[p] = cur;
    }
  }

  private emitDir(p: number, dir: number): void {
    if (dir & IN_UP) this.queue.push({ player: p, action: 'up' });
    if (dir & IN_DOWN) this.queue.push({ player: p, action: 'down' });
    if (dir & IN_LEFT) this.queue.push({ player: p, action: 'left' });
    if (dir & IN_RIGHT) this.queue.push({ player: p, action: 'right' });
  }

  /** Drain queued actions. */
  drain(): { player: number; action: MenuAction }[] {
    const out = this.queue.slice();
    this.queue.length = 0;
    return out;
  }

  /** Drop queued actions and repeat timers; held keys stay "held" so they do not re-fire on the next screen. */
  reset(): void {
    this.held = [0, 0]; this.queue.length = 0;
  }

  /** Treat the given frames as already held (no edges until released). */
  prime(frames: readonly [InputFrame, InputFrame]): void {
    this.prev = [frames[0], frames[1]];
    this.heldDir = [frames[0] & (IN_UP | IN_DOWN | IN_LEFT | IN_RIGHT), frames[1] & (IN_UP | IN_DOWN | IN_LEFT | IN_RIGHT)];
    this.held = [0, 0];
    this.queue.length = 0;
  }
}
