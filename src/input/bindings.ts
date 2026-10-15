import { IN_B1, IN_B2, IN_B3, IN_B4, IN_BACK, IN_DOWN, IN_LEFT, IN_RIGHT, IN_START, IN_UP } from './InputFrame';

export type Action = 'left' | 'right' | 'up' | 'down' | 'b1' | 'b2' | 'b3' | 'b4' | 'b12' | 'b34' | 'b13' | 'b24' | 'start' | 'back';
export const ACTIONS: readonly Action[] = ['left', 'right', 'up', 'down', 'b1', 'b2', 'b3', 'b4', 'b12', 'b34', 'b13', 'b24', 'start', 'back'];

export const ACTION_BITS: Record<Action, number> = {
  left: IN_LEFT, right: IN_RIGHT, up: IN_UP, down: IN_DOWN,
  b1: IN_B1, b2: IN_B2, b3: IN_B3, b4: IN_B4,
  b12: IN_B1 | IN_B2, b34: IN_B3 | IN_B4, b13: IN_B1 | IN_B3, b24: IN_B2 | IN_B4,
  start: IN_START, back: IN_BACK,
};

/** Keyboard bindings: action -> list of KeyboardEvent.code values. */
export type KeyBindings = Record<Action, string[]>;
/** Gamepad bindings: action -> list of standard-mapping button indices (axis handled separately). */
export type PadBindings = Record<Action, number[]>;

export const DEFAULT_KEYS_P1: KeyBindings = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
  b1: ['KeyU'], b2: ['KeyI'], b3: ['KeyJ'], b4: ['KeyK'],
  b12: ['KeyO'], b34: ['KeyL'], b13: ['KeyY'], b24: ['KeyH'],
  start: ['Enter', 'Escape'], back: ['Backspace'],
};

export const DEFAULT_KEYS_P2: KeyBindings = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  b1: ['Numpad4', 'KeyZ'], b2: ['Numpad5', 'KeyX'], b3: ['Numpad1', 'KeyC'], b4: ['Numpad2', 'KeyV'],
  b12: ['Numpad6', 'KeyB'], b34: ['Numpad3', 'KeyN'], b13: ['Numpad7'], b24: ['Numpad8'],
  start: ['NumpadEnter'], back: ['NumpadDecimal'],
};

/** Standard gamepad mapping: 0=A/Cross 1=B/Circle 2=X/Square 3=Y/Triangle 4=LB 5=RB 6=LT 7=RT 8=Back 9=Start 12-15 dpad. */
export const DEFAULT_PAD: PadBindings = {
  left: [14], right: [15], up: [12], down: [13],
  b1: [2], b2: [3], b3: [0], b4: [1],
  b12: [5], b34: [7], b13: [4], b24: [6],
  start: [9], back: [8],
};

export function cloneBindings<T extends Record<string, unknown[]>>(b: T): T {
  const out: Record<string, unknown[]> = {};
  for (const k of Object.keys(b)) out[k] = [...(b[k] as unknown[])];
  return out as T;
}
