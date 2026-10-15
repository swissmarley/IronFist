import type { LobbyMsg, SyncHeader } from './lobby';

/**
 * Desync recovery payload (D-028): the host's confirmed state at `frame` (a MatchSim
 * snapshot buffer) plus the host's own inputs from `inputsFrom` on, so the guest can
 * restore and re-simulate to its present without waiting for the realtime channel.
 */
export interface StateTransfer {
  /** Resync generation both peers are in once the guest applied it. */
  gen: number;
  frame: number;
  data: Int32Array;
  inputsFrom: number;
  inputs: number[];
}

/** Ints per control message: <= ~12 KB of JSON, under the 16 KB SCTP message size every browser accepts. */
export const SYNC_CHUNK_INTS = 1024;

/** Split a transfer into a header plus `chunk` messages for the reliable channel. */
export function transferMessages(t: StateTransfer, match: number, chunkInts = SYNC_CHUNK_INTS): LobbyMsg[] {
  const size = Math.max(1, chunkInts);
  const parts = Math.max(1, Math.ceil(t.data.length / size));
  const head: SyncHeader = { match, gen: t.gen, frame: t.frame, ints: t.data.length, parts, inputsFrom: t.inputsFrom, inputs: t.inputs };
  const out: LobbyMsg[] = [{ k: 'sync', head }];
  for (let p = 0; p < parts; p++) out.push({ k: 'chunk', gen: t.gen, part: p, data: Array.from(t.data.subarray(p * size, (p + 1) * size)) });
  return out;
}

/** Collects the chunks of one incoming transfer (the channel is ordered, but parts are indexed anyway). */
export class TransferAssembler {
  private head: SyncHeader | null = null;
  private parts: (number[] | null)[] = [];
  private got = 0;

  begin(head: SyncHeader): void {
    this.head = head;
    this.parts = new Array<number[] | null>(Math.max(0, head.parts)).fill(null);
    this.got = 0;
  }

  /** Add one chunk; returns the complete transfer once every part arrived (null otherwise / when malformed). */
  add(gen: number, part: number, data: number[]): StateTransfer | null {
    const h = this.head;
    if (!h || gen !== h.gen || part < 0 || part >= this.parts.length || this.parts[part]) return null;
    this.parts[part] = data;
    if (++this.got < this.parts.length) return null;
    this.head = null;
    const all = new Int32Array(h.ints);
    let o = 0;
    for (const p of this.parts) {
      for (const v of p ?? []) { if (o >= all.length) return null; all[o++] = v; }
    }
    if (o !== all.length) return null;
    return { gen: h.gen, frame: h.frame, data: all, inputsFrom: h.inputsFrom, inputs: h.inputs };
  }
}
