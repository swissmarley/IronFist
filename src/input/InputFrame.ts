/**
 * InputFrame: one sampled frame of a player's controls as a bitmask.
 * Directions are device-absolute (screen left/right); the sim converts them to
 * facing-relative numpad notation.
 */
export const IN_LEFT = 1 << 0;
export const IN_RIGHT = 1 << 1;
export const IN_UP = 1 << 2;
export const IN_DOWN = 1 << 3;
export const IN_B1 = 1 << 4; // LP
export const IN_B2 = 1 << 5; // RP
export const IN_B3 = 1 << 6; // LK
export const IN_B4 = 1 << 7; // RK
export const IN_START = 1 << 8;
export const IN_BACK = 1 << 9;
export const IN_BUTTONS = IN_B1 | IN_B2 | IN_B3 | IN_B4;
export const IN_DIRS = IN_LEFT | IN_RIGHT | IN_UP | IN_DOWN;

export type InputFrame = number;

/** Build a frame from a numpad direction relative to "facing right" plus buttons. */
export function frameFromNumpad(dir: number, buttons = 0, facingRight = true): InputFrame {
  let f = buttons & IN_BUTTONS;
  const col = (dir - 1) % 3; // 0 = back(left when facing right), 1 = neutral, 2 = forward
  const row = Math.floor((dir - 1) / 3); // 0 = down, 1 = neutral, 2 = up
  if (col === 0) f |= facingRight ? IN_LEFT : IN_RIGHT;
  if (col === 2) f |= facingRight ? IN_RIGHT : IN_LEFT;
  if (row === 0) f |= IN_DOWN;
  if (row === 2) f |= IN_UP;
  return f;
}

/**
 * Convert an absolute frame into a facing-relative numpad direction (1..9, 5 = neutral)
 * where 6 is toward the opponent (forward). Opposite directions cancel to neutral.
 */
export function relativeDir(frame: InputFrame, facingRight: boolean): number {
  let h = 0;
  if (frame & IN_LEFT) h -= 1;
  if (frame & IN_RIGHT) h += 1;
  if (!facingRight) h = -h;
  let v = 0;
  if (frame & IN_DOWN) v -= 1;
  if (frame & IN_UP) v += 1;
  return 5 + h + v * 3;
}

export function buttonsOf(frame: InputFrame): number {
  return (frame & IN_BUTTONS) >> 4; // 0..15 with bit0 = 1, bit1 = 2, bit2 = 3, bit3 = 4
}

/** Numpad helpers (facing-relative). */
export const DIR_NEUTRAL = 5;
export function isForward(d: number): boolean { return d === 6 || d === 3 || d === 9; }
export function isBack(d: number): boolean { return d === 4 || d === 1 || d === 7; }
export function isDown(d: number): boolean { return d === 1 || d === 2 || d === 3; }
export function isUp(d: number): boolean { return d === 7 || d === 8 || d === 9; }
