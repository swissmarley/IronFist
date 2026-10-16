import { IntRing } from '@/core/ring';
import { dirBit, parseNotation, type ParsedCommand, type Token } from './notation';

/** Per-fighter history of facing-relative directions and button masks. */
export class InputHistory {
  readonly dirs: IntRing;
  readonly buttons: IntRing;
  constructor(capacity = 64) {
    this.dirs = new IntRing(capacity);
    this.buttons = new IntRing(capacity);
  }
  push(dir: number, buttons: number): void {
    this.dirs.push(dir);
    this.buttons.push(buttons);
  }
  dir(back = 0): number { return this.dirs.back(back); }
  btn(back = 0): number { return this.buttons.back(back); }
  /** Buttons newly pressed at `back` frames ago. */
  pressed(back = 0): number {
    return this.btn(back) & ~this.btn(back + 1);
  }
  clear(): void { this.dirs.clear(); this.buttons.clear(); }
  get length(): number { return this.dirs.length; }
}

export interface CommandDef {
  id: string;
  parsed: ParsedCommand;
  /** Just-frame tolerance in frames (undefined = normal). */
  justFrame?: number;
}

export interface CommandMatch {
  id: string;
  priority: number;
  /** True when every token landed within the just-frame tolerance. */
  justFrame: boolean;
}

/**
 * Trie-free matcher: commands are evaluated independently against the history
 * each frame (fast enough for ~100 commands/fighter and keeps semantics simple).
 * A command matches on the frame its last token is completed (button press edge
 * or direction edge). Earlier tokens are searched backwards with per-token gaps.
 */
export class CommandInterpreter {
  private readonly commands: CommandDef[] = [];

  add(id: string, notation: string, justFrame?: number): void {
    const parsed = parseNotation(notation);
    const def: CommandDef = { id, parsed };
    if (justFrame !== undefined) def.justFrame = justFrame;
    this.commands.push(def);
  }

  addParsed(def: CommandDef): void {
    this.commands.push(def);
  }

  get size(): number { return this.commands.length; }

  /** Evaluate all commands against the newest frame of `h`. Results sorted by priority desc. */
  match(h: InputHistory, out: CommandMatch[] = []): CommandMatch[] {
    out.length = 0;
    for (const c of this.commands) {
      const r = matchCommand(c.parsed.tokens, h, c.justFrame);
      if (r >= 0) out.push({ id: c.id, priority: c.parsed.priority, justFrame: r === 1 });
    }
    out.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
    return out;
  }
}

function tokenHeldAt(t: Token, h: InputHistory, back: number): boolean {
  if (t.dirMask !== 0 && (t.dirMask & dirBit(h.dir(back))) === 0) return false;
  if (t.buttons !== 0 && (h.btn(back) & t.buttons) !== t.buttons) return false;
  return true;
}

/** Returns -1 no match, 0 match, 1 just-frame match. */
export function matchCommand(tokens: Token[], h: InputHistory, justFrame?: number): number {
  const last = tokens[tokens.length - 1] as Token;
  // Last token must complete on the newest frame.
  if (last.buttons !== 0) {
    // all required buttons down, and all of them newly pressed this frame (same-frame simultaneity)
    if ((h.btn(0) & last.buttons) !== last.buttons) return -1;
    if ((h.pressed(0) & last.buttons) !== last.buttons) return -1;
    if (last.dirMask !== 0 && (last.dirMask & dirBit(h.dir(0))) === 0) return -1;
  } else {
    // direction-only last token: must be a fresh entry into the mask this frame
    if ((last.dirMask & dirBit(h.dir(0))) === 0) return -1;
    if ((last.dirMask & dirBit(h.dir(1))) !== 0) return -1;
  }
  let frame = 0; // frame index (back) where the current token was satisfied
  let tight = true;
  for (let i = tokens.length - 2; i >= 0; i--) {
    const t = tokens[i] as Token;
    const next = tokens[i + 1] as Token;
    let found = -1;
    const start = frame + 1;
    const limit = frame + t.maxGap + 1;
    for (let back = start; back <= limit; back++) {
      if (back >= h.length) break;
      if (!tokenHeldAt(t, h, back)) continue;
      if (next.edge && next.dirMask !== 0) {
        // the next token needed a release between: ensure at least one frame between
        // `back` and `frame` that does not satisfy next's mask (search gap)
        let released = false;
        for (let k = frame + 1; k < back; k++) {
          if ((next.dirMask & dirBit(h.dir(k))) === 0) { released = true; break; }
        }
        if (!released) {
          // if next token is same mask and held continuously from `back` to `frame`, it's one press
          continue;
        }
      }
      found = back;
      break;
    }
    if (found < 0) return -1;
    if (justFrame !== undefined && found - frame > justFrame) tight = false;
    frame = found;
  }
  if (justFrame !== undefined) return tight ? 1 : 0;
  return 0;
}
