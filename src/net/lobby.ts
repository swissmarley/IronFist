/**
 * JSON messages on the reliable, ordered control channel: handshake, picks, the host's
 * match start, post-match choices (rematch / change fighter) and desync state transfer.
 */

/** Everything both peers must agree on before frame 0 (sent by the host). */
export interface OnlineSetup {
  p1: string;
  p2: string;
  stage: string;
  seed: number;
  roundsToWin: number;
  roundTimeSec: number;
  /** Frames of input delay both peers use (picked by the host, D-028). */
  inputDelay: number;
  /** True when `inputDelay` came from the lobby RTT measurement, false for a fixed value. */
  delayAuto: boolean;
  /** Round HP override (0 = each character's own HP). */
  hp: number;
  /** Match epoch on this connection (1..255, wraps): tags realtime packets so stale ones are dropped. */
  match: number;
}

/** One chunk of a state transfer: the host's confirmed snapshot plus its inputs after it. */
export interface SyncHeader {
  /** Match epoch the transfer belongs to. */
  match: number;
  /** Resync generation the receiver moves to once applied. */
  gen: number;
  /** Snapshot frame (the first frame not covered by it). */
  frame: number;
  /** Snapshot length in ints and number of `chunk` messages that follow. */
  ints: number;
  parts: number;
  /** Host inputs for frames `inputsFrom ..` (everything the guest may still lack). */
  inputsFrom: number;
  inputs: number[];
}

export type LobbyMsg =
  | { k: 'hello'; v: number }
  | { k: 'pick'; char: string }
  | { k: 'start'; setup: OnlineSetup }
  | { k: 'rematch' }
  | { k: 'change' }
  | { k: 'desync'; match: number; gen: number }
  | { k: 'sync'; head: SyncHeader }
  | { k: 'chunk'; gen: number; part: number; data: number[] }
  | { k: 'bye' };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum);

export function parseSetup(v: unknown): OnlineSetup | null {
  if (!isObj(v)) return null;
  const { p1, p2, stage, seed, roundsToWin, roundTimeSec, inputDelay, delayAuto, hp, match } = v;
  if (typeof p1 !== 'string' || typeof p2 !== 'string' || typeof stage !== 'string' || typeof delayAuto !== 'boolean') return null;
  if (!isNum(seed) || !isNum(roundsToWin) || !isNum(roundTimeSec) || !isNum(inputDelay) || !isNum(hp) || !isNum(match)) return null;
  return { p1, p2, stage, seed: seed | 0, roundsToWin: roundsToWin | 0, roundTimeSec: roundTimeSec | 0, inputDelay: inputDelay | 0, delayAuto, hp: hp | 0, match: match & 0xff };
}

function parseSync(v: unknown): SyncHeader | null {
  if (!isObj(v)) return null;
  const { match, gen, frame, ints, parts, inputsFrom, inputs } = v;
  if (!isNum(match) || !isNum(gen) || !isNum(frame) || !isNum(ints) || !isNum(parts) || !isNum(inputsFrom) || !isIntArray(inputs)) return null;
  return { match: match & 0xff, gen: gen & 0xff, frame: frame | 0, ints: ints | 0, parts: parts | 0, inputsFrom: inputsFrom | 0, inputs };
}

export function parseLobby(text: string): LobbyMsg | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!isObj(v)) return null;
  switch (v.k) {
    case 'hello': return isNum(v.v) ? { k: 'hello', v: v.v } : null;
    case 'pick': return typeof v.char === 'string' ? { k: 'pick', char: v.char } : null;
    case 'start': { const setup = parseSetup(v.setup); return setup ? { k: 'start', setup } : null; }
    case 'rematch': return { k: 'rematch' };
    case 'change': return { k: 'change' };
    case 'desync': return isNum(v.match) && isNum(v.gen) ? { k: 'desync', match: v.match & 0xff, gen: v.gen & 0xff } : null;
    case 'sync': { const head = parseSync(v.head); return head ? { k: 'sync', head } : null; }
    case 'chunk': return isNum(v.gen) && isNum(v.part) && isIntArray(v.data) ? { k: 'chunk', gen: v.gen & 0xff, part: v.part | 0, data: v.data } : null;
    case 'bye': return { k: 'bye' };
    default: return null;
  }
}
