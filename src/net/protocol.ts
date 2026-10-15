/**
 * Binary wire format for the realtime (unreliable, unordered) channel. Little-endian.
 *
 *   Input  [u8 1][u8 count][i16 adv][u32 seq][i32 ack][i32 frame][i32 start][u16 × count]
 *   Ping   [u8 2][3 pad][u32 tick]
 *   Pong   [u8 3][3 pad][u32 tick]
 *   Hash   [u8 4][3 pad][i32 frame][u32 hash]
 *
 * Input messages carry every local input the peer has not acknowledged yet (frames
 * `start .. start+count-1`), so a lost datagram is repaired by the next one. `ack` is the
 * last contiguous remote frame the sender holds, `frame` the sender's current sim frame
 * and `adv` its frame advantage estimate (time sync). `seq` numbers packets per sender.
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
export interface HashMsg { type: typeof MSG_HASH; frame: number; hash: number }
export type NetMessage = InputMsg | PingMsg | PongMsg | HashMsg;

function clamp16(v: number): number {
  return Math.max(-32768, Math.min(32767, v | 0));
}

export function encodeMessage(m: NetMessage): Uint8Array {
  switch (m.type) {
    case MSG_INPUT: {
      const n = Math.min(MAX_BATCH, m.inputs.length);
      const buf = new Uint8Array(INPUT_HEADER + 2 * n);
      const dv = new DataView(buf.buffer);
      dv.setUint8(0, MSG_INPUT); dv.setUint8(1, n); dv.setInt16(2, clamp16(m.adv), true);
      dv.setUint32(4, m.seq >>> 0, true); dv.setInt32(8, m.ack, true); dv.setInt32(12, m.frame, true); dv.setInt32(16, m.start, true);
      for (let i = 0; i < n; i++) dv.setUint16(INPUT_HEADER + 2 * i, (m.inputs[i] as number) & 0xffff, true);
      return buf;
    }
    case MSG_PING:
    case MSG_PONG: {
      const buf = new Uint8Array(8);
      const dv = new DataView(buf.buffer);
      dv.setUint8(0, m.type); dv.setUint32(4, m.tick >>> 0, true);
      return buf;
    }
    case MSG_HASH: {
      const buf = new Uint8Array(12);
      const dv = new DataView(buf.buffer);
      dv.setUint8(0, MSG_HASH); dv.setInt32(4, m.frame, true); dv.setUint32(8, m.hash >>> 0, true);
      return buf;
    }
  }
}

/** Decode one datagram; returns null for anything malformed (never throws). */
export function decodeMessage(bytes: Uint8Array): NetMessage | null {
  if (bytes.byteLength < 8) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = dv.getUint8(0);
  switch (type) {
    case MSG_INPUT: {
      if (bytes.byteLength < INPUT_HEADER) return null;
      const n = dv.getUint8(1);
      if (bytes.byteLength < INPUT_HEADER + 2 * n) return null;
      const inputs: number[] = new Array<number>(n);
      for (let i = 0; i < n; i++) inputs[i] = dv.getUint16(INPUT_HEADER + 2 * i, true);
      return { type: MSG_INPUT, adv: dv.getInt16(2, true), seq: dv.getUint32(4, true), ack: dv.getInt32(8, true), frame: dv.getInt32(12, true), start: dv.getInt32(16, true), inputs };
    }
    case MSG_PING: return { type: MSG_PING, tick: dv.getUint32(4, true) };
    case MSG_PONG: return { type: MSG_PONG, tick: dv.getUint32(4, true) };
    case MSG_HASH: return bytes.byteLength < 12 ? null : { type: MSG_HASH, frame: dv.getInt32(4, true), hash: dv.getUint32(8, true) };
    default: return null;
  }
}
