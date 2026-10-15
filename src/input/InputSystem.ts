import { DEFAULT_KEYS_P1, DEFAULT_KEYS_P2, DEFAULT_PAD, type KeyBindings, type PadBindings } from './bindings';
import { GamepadSource } from './GamepadSource';
import { KeyboardSource } from './KeyboardSource';
import type { InputFrame } from './InputFrame';

export type PlayerDevice = 'keyboard' | 'gamepad' | 'none';

/** Merges keyboard and gamepad frames per player. Sampled once per sim step. */
export class InputSystem {
  readonly keyboard: KeyboardSource;
  readonly gamepad: GamepadSource;
  private keyBindings: KeyBindings[] = [DEFAULT_KEYS_P1, DEFAULT_KEYS_P2];
  private padBindings: PadBindings[] = [DEFAULT_PAD, DEFAULT_PAD];
  /** Explicit override frames (AI, replay, tests); null = read devices. */
  overrides: (InputFrame | null)[] = [null, null];
  /** Scripted per-frame inputs consumed one entry per sample (record/playback, tests). */
  readonly scripts: InputFrame[][] = [[], []];
  readonly frames: InputFrame[] = [0, 0];

  constructor() {
    this.keyboard = new KeyboardSource(this.keyBindings);
    this.gamepad = new GamepadSource(DEFAULT_PAD);
  }

  attach(): void {
    this.keyboard.attach();
  }

  detach(): void {
    this.keyboard.detach();
  }

  setKeyBindings(player: number, b: KeyBindings): void {
    this.keyBindings[player] = b;
    this.keyboard.setBindings(this.keyBindings);
  }

  setPadBindings(player: number, b: PadBindings): void {
    this.padBindings[player] = b;
  }

  getKeyBindings(player: number): KeyBindings {
    return this.keyBindings[player] ?? DEFAULT_KEYS_P1;
  }

  /** Queue exact per-frame inputs for a player (consumed FIFO, one per sim step). */
  enqueueScript(player: number, frames: InputFrame[]): void {
    const s = this.scripts[player];
    if (s) s.push(...frames);
  }

  /** Sample both players. Returns the frames array (reused, no allocation). */
  sample(): InputFrame[] {
    for (let p = 0; p < 2; p++) {
      const script = this.scripts[p];
      if (script && script.length > 0) { this.frames[p] = script.shift() ?? 0; continue; }
      const o = this.overrides[p];
      if (o !== null && o !== undefined) { this.frames[p] = o; continue; }
      this.gamepad.setBindings(this.padBindings[p] ?? DEFAULT_PAD);
      this.frames[p] = this.keyboard.sample(p) | this.gamepad.sample(p);
    }
    return this.frames;
  }
}
