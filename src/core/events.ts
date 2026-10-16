/** Minimal typed event emitter used outside the sim (UI, audio, render). */
type Listener = (...args: unknown[]) => void;

export class Emitter<Events extends Record<string, unknown[]>> {
  private listeners = new Map<keyof Events, Set<Listener>>();

  on<K extends keyof Events>(key: K, fn: (...args: Events[K]) => void): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    const l = fn as unknown as Listener;
    set.add(l);
    return () => { set?.delete(l); };
  }

  emit<K extends keyof Events>(key: K, ...args: Events[K]): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const fn of set) fn(...(args as unknown[]));
  }

  clear(): void {
    this.listeners.clear();
  }
}
