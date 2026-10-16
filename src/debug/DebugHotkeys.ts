import { debugFlags, type DebugFlagKey } from './DebugFlags';

const MAP: Record<string, DebugFlagKey> = { F1: 'hitboxes', F2: 'frameData', F3: 'profiler', F4: 'inputDisplay' };

/** Binds F1..F4 to debug flags. Returns an unbind function. */
export function bindDebugHotkeys(onChange: (key: DebugFlagKey, value: boolean) => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    const key = MAP[e.code];
    if (!key) return;
    e.preventDefault();
    debugFlags[key] = !debugFlags[key];
    onChange(key, debugFlags[key]);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
