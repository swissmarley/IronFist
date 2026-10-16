/**
 * Binary wire format for the realtime (unreliable, unordered) channel. Little-endian.
 * Byte 1 of every message is the match epoch (`OnlineSetup.match`, 0 = lobby), so packets
 * still in flight from a previous match on the same connection are recognised and dropped.
 *
 *   Input  [u8 1][u8 epoch][u8 count][i8 adv][u32 seq][i32 ack][i32 frame][i32 start][u16 × count]
 *   Ping   [u8 2][u8 epoch][2 pad][u32 tick]
 *   Pong   [u8 3][u8 epoch][2 pad][u32 tick]
 *   Hash   [u8 4][u8 epoch][u8 gen][pad][i32 frame][u32 hash]
 *
 * Input messages carry every local input the peer has not acknowledged yet (frames
 * `start .. start+count-1`), so a lost datagram is repaired by the next one. `ack` is the
 * last contiguous remote frame the sender holds, `frame` the sender's current sim frame
 * and `adv` its frame advantage estimate (time sync, clamped to ±127). `seq` numbers
 * packets per sender. A hash's `gen` is the sender's resync generation: hashes computed
 * before a state transfer was applied are not compared with ones computed after it.
 */
export const MSG_INPUT = 1;
export const MSG_PING = 2;
export const MSG_PONG = 3;
export const MSG_HASH = 4;

/** Upper bound of inputs carried by one packet (keeps a datagram well under 1 KB). */
export const MAX_BATCH = 64;
const INPUT_HEADER = 20;

export interface InputMsg { type: typeof MSG_INPUT; seq: number; ack: number; frame: number; adv: number; start: number; inputs: number[] }
export interface PingMsg { type: typeof MSG_PING; tick: number }
export interface PongMsg { type: typeof MSG_PONG; tick: number }
export interface HashMsg { type: typeof MSG_HASH; frame: number; hash: number; gen: number }
export type NetMessage = InputMsg | PingMsg | PongMsg | HashMsg;

function clamp8(v: number): number {
  return Math.max(-128, Math.min(127, v | 0));
}

/** Encode one message for the match `epoch` (0..255; 0 = lobby traffic outside a match). */
export function encodeMessage(m: NetMessage, epoch = 0): Uint8Array {
  const e = epoch & 0xff;
  switch (m.type) {
    case MSG_INPUT: {
      const n = Math.min(MAX_BATCH, m.inputs.length);
      const buf = new Uint8Array(INPUT_HEADER + 2 * n);
      const dv = new DataView(buf.buffer);
      dv.setUint8(0, MSG_INPUT); dv.setUint8(1, e); dv.setUint8(2, n); dv.setInt8(3, clamp8(m.adv));
      dv.setUint32(4, m.seq >>> 0, true); dv.setInt32(8, m.ack, true); dv.setInt32(12, m.frame, true); dv.setInt32(16, m.start, true);
      for (let i = 0; i < n; i++) dv.setUint16(INPUT_HEADER + 2 * i, (m.inputs[i] as number) & 0xffff, true);
      return buf;
    }
    case MSG_PING:
    case MSG_PONG: {
      const buf = new Uint8Array(8);
      const dv = new DataView(buf.buffer);
      dv.setUint8(0, m.type); dv.setUint8(1, e); dv.setUint32(4, m.tick >>> 0, true);
      return buf;
    }
    case MSG_HASH: {
      const buf = new Uint8Array(12);
      const dv = new DataView(buf.buffer);
      dv.setUint8(0, MSG_HASH); dv.setUint8(1, e); dv.setUint8(2, m.gen & 0xff);
      dv.setInt32(4, m.frame, true); dv.setUint32(8, m.hash >>> 0, true);
      return buf;
    }
  }
}

/** The match epoch a datagram belongs to (-1 when too short to tell). */
export function messageEpoch(bytes: Uint8Array): number {
  return bytes.byteLength < 2 ? -1 : (bytes[1] as number);
}

/** Decode one datagram; returns null for anything malformed (never throws). */
export function decodeMessage(bytes: Uint8Array): NetMessage | null {
  if (bytes.byteLength < 8) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = dv.getUint8(0);
  switch (type) {
    case MSG_INPUT: {
      if (bytes.byteLength < INPUT_HEADER) return null;
      const n = dv.getUint8(2);
      if (bytes.byteLength < INPUT_HEADER + 2 * n) return null;
      const inputs: number[] = new Array<number>(n);
      for (let i = 0; i < n; i++) inputs[i] = dv.getUint16(INPUT_HEADER + 2 * i, true);
      return { type: MSG_INPUT, adv: dv.getInt8(3), seq: dv.getUint32(4, true), ack: dv.getInt32(8, true), frame: dv.getInt32(12, true), start: dv.getInt32(16, true), inputs };
    }
    case MSG_PING: return { type: MSG_PING, tick: dv.getUint32(4, true) };
    case MSG_PONG: return { type: MSG_PONG, tick: dv.getUint32(4, true) };
    case MSG_HASH: return bytes.byteLength < 12 ? null : { type: MSG_HASH, gen: dv.getUint8(2), frame: dv.getInt32(4, true), hash: dv.getUint32(8, true) };
    default: return null;
  }
}
