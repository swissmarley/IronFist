import type { NetRole } from './NetPeer';

/**
 * Signalling moves one offer string (host → guest) and one answer string (guest → host).
 * The built-in path is manual copy/paste on the ONLINE screen and needs no server. A
 * signalling server can be plugged in without touching the netcode: register a factory
 * for a URL scheme and open the game with `?signal=<url>` (e.g. `?signal=wss://host/room`);
 * the online screen then uses it instead of the text boxes.
 */
export interface Signaller {
  /** Host: publish the offer and resolve with the guest's answer. */
  exchangeOffer(offer: string): Promise<string>;
  /** Guest: resolve with the host's offer. */
  awaitOffer(): Promise<string>;
  /** Guest: publish the answer. */
  sendAnswer(answer: string): Promise<void>;
  close(): void;
}

export type SignallerFactory = (url: URL, role: NetRole) => Signaller;

const factories = new Map<string, SignallerFactory>();

/** Register a signaller for a URL protocol such as 'wss:' or 'https:'. */
export function registerSignaller(protocol: string, factory: SignallerFactory): void {
  factories.set(protocol.endsWith(':') ? protocol : `${protocol}:`, factory);
}

/** The signaller selected by a `?signal=` value, or null for manual copy/paste. */
export function createSignaller(param: string | null, role: NetRole): Signaller | null {
  if (!param) return null;
  let url: URL;
  try { url = new URL(param); } catch { return null; }
  const f = factories.get(url.protocol);
  return f ? f(url, role) : null;
}

const PREFIX = 'IRONFIST1:';

/** Pack a session description into one copy-paste friendly line. */
export function encodeSignal(desc: { type: string; sdp: string }): string {
  return PREFIX + btoa(JSON.stringify({ t: desc.type, s: desc.sdp }));
}

/** Inverse of encodeSignal; tolerates whitespace/line breaks from pasting. Null when invalid. */
export function decodeSignal(text: string): { type: 'offer' | 'answer'; sdp: string } | null {
  const t = text.replace(/\s+/g, '');
  if (!t.startsWith(PREFIX)) return null;
  try {
    const v: unknown = JSON.parse(atob(t.slice(PREFIX.length)));
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if ((o.t !== 'offer' && o.t !== 'answer') || typeof o.s !== 'string') return null;
    return { type: o.t, sdp: o.s };
  } catch {
    return null;
  }
}
