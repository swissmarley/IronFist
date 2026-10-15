/**
 * Parses fighting-game notation into command tokens for the interpreter.
 * Directions are numpad-relative (6 = forward). Sets are 9-bit masks (bit d-1).
 */
export interface Token {
  /** 9-bit direction mask; 0 = any direction. */
  dirMask: number;
  /** Buttons 1..4 as bits 0..3; 0 = no button. */
  buttons: number;
  /** Max frames allowed between this token and the next one. */
  maxGap: number;
  /** This token must be a fresh press (direction edge) when preceded by the same direction. */
  edge: boolean;
}

export interface ParsedCommand {
  tokens: Token[];
  /** Specificity used for priority: smaller direction sets and more tokens rank higher. */
  priority: number;
}

export function dirBit(d: number): number {
  return 1 << (d - 1);
}

function mask(...dirs: number[]): number {
  let m = 0;
  for (const d of dirs) m |= dirBit(d);
  return m;
}

export const DIR_SETS: Record<string, number> = {
  n: mask(5),
  f: mask(6), b: mask(4),
  u: mask(7, 8), d: mask(1, 2),
  'u/f': mask(9), 'u/b': mask(7), 'd/f': mask(3), 'd/b': mask(1),
  uf: mask(9), ub: mask(7), df: mask(3), db: mask(1),
  // strict/loose helpers for motions
  'D': mask(1, 2, 3), 'F': mask(3, 6, 9), 'B': mask(1, 4, 7), 'U': mask(7, 8, 9),
};

const MOTIONS: Record<string, string> = {
  qcf: 'D,d/f,F', qcb: 'D,d/b,B', hcf: 'B,d/b,D,d/f,F', hcb: 'F,d/f,D,d/b,B',
  cd: 'f,n,D,d/f', ws: '', dp: 'f,D,d/f',
};

export const DEFAULT_GAP = 10;

function parseSegment(seg: string, gap: number): Token {
  const parts = seg.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  let dirMask = 0;
  let buttons = 0;
  for (const p of parts) {
    if (/^[1-4]$/.test(p)) {
      buttons |= 1 << (parseInt(p, 10) - 1);
    } else if (/^[1-4]{2,4}$/.test(p)) {
      for (const ch of p) buttons |= 1 << (parseInt(ch, 10) - 1);
    } else {
      const m = DIR_SETS[p] ?? DIR_SETS[p.toLowerCase()];
      if (m === undefined) throw new Error(`Unknown direction token "${p}" in "${seg}"`);
      dirMask |= m;
    }
  }
  return { dirMask, buttons, maxGap: gap, edge: false };
}

/**
 * Parse e.g. "f,f+2", "d/f+2", "qcf+1", "1+2", "f,n,d,d/f+4", "u/f+4", "b+1+3".
 * Motion shorthands are expanded before parsing. "~" is a tight cancel (gap 3).
 */
export function parseNotation(input: string, gap = DEFAULT_GAP): ParsedCommand {
  let s = input.trim();
  // expand shorthand motions (case-insensitive) at segment boundaries
  s = s.replace(/\b(qcf|qcb|hcf|hcb|cd|dp)\b/gi, (m) => MOTIONS[m.toLowerCase()] ?? m);
  // split on ',' and '~' keeping the separator for gap selection
  const tokens: Token[] = [];
  const pieces = s.split(/([,~])/);
  let nextGap = gap;
  for (let i = 0; i < pieces.length; i++) {
    const piece = (pieces[i] as string).trim();
    if (piece === ',') { nextGap = gap; continue; }
    if (piece === '~') { nextGap = 3; continue; }
    if (piece === '') continue;
    const t = parseSegment(piece, gap);
    if (tokens.length > 0) (tokens[tokens.length - 1] as Token).maxGap = nextGap;
    tokens.push(t);
  }
  if (tokens.length === 0) throw new Error(`Empty command "${input}"`);
  // consecutive identical direction-only tokens require a release in between (f,f)
  for (let i = 1; i < tokens.length; i++) {
    const a = tokens[i - 1] as Token, b = tokens[i] as Token;
    if (a.dirMask !== 0 && a.dirMask === b.dirMask && a.buttons === 0) b.edge = true;
  }
  const last = tokens[tokens.length - 1] as Token;
  const dirSpecificity = last.dirMask === 0 ? 0 : 9 - popcount(last.dirMask);
  const priority = tokens.length * 100 + popcount(last.buttons) * 20 + dirSpecificity;
  return { tokens, priority };
}

export function popcount(v: number): number {
  let c = 0;
  while (v) { v &= v - 1; c++; }
  return c;
}
