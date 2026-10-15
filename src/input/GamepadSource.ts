import { ACTIONS, ACTION_BITS, type PadBindings } from './bindings';
import { IN_DOWN, IN_LEFT, IN_RIGHT, IN_UP, type InputFrame } from './InputFrame';

const DEADZONE = 0.5;

/** Reads the Gamepad API each sample; pad index i -> player i. */
export class GamepadSource {
  constructor(private bindings: PadBindings = { ...({} as PadBindings) }) {}

  setBindings(b: PadBindings): void {
    this.bindings = b;
  }

  sample(playerIndex: number): InputFrame {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    const pads = navigator.getGamepads();
    const pad = pads[playerIndex];
    if (!pad) return 0;
    let f = 0;
    for (const a of ACTIONS) {
      const idxs = this.bindings[a];
      if (!idxs) continue;
      for (const idx of idxs) {
        const b = pad.buttons[idx];
        if (b && (b.pressed || b.value > 0.5)) { f |= ACTION_BITS[a]; break; }
      }
    }
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    if (ax < -DEADZONE) f |= IN_LEFT;
    if (ax > DEADZONE) f |= IN_RIGHT;
    if (ay < -DEADZONE) f |= IN_UP;
    if (ay > DEADZONE) f |= IN_DOWN;
    return f;
  }

  static connectedCount(): number {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    let n = 0;
    for (const p of navigator.getGamepads()) if (p) n++;
    return n;
  }
}
