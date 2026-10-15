import { DEFAULT_KEYS_P1, DEFAULT_KEYS_P2, DEFAULT_PAD, type KeyBindings, type PadBindings } from '@/input/bindings';
import type { QualityTier } from '@/render/quality';
import { loadKey, saveKey } from './storage';

export interface Settings {
  version: 1;
  quality: QualityTier | 'auto';
  renderScale: number;
  volumes: { master: number; sfx: number; voice: number; music: number; ui: number };
  announcer: 'speech' | 'synth';
  keys: [KeyBindings, KeyBindings];
  pads: [PadBindings, PadBindings];
  accessibility: { reducedShake: boolean; reducedFlash: boolean; colourBlindHud: boolean; subtitles: boolean; soundCues: boolean; holdToBlock: [boolean, boolean] };
  rounds: number;
  roundTime: number; // seconds, 0 = infinite
  difficulty: number; // 0..4 (Beginner..Boss)
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  quality: 'auto',
  renderScale: 1,
  volumes: { master: 0.9, sfx: 1, voice: 1, music: 0.7, ui: 0.8 },
  announcer: 'speech',
  keys: [DEFAULT_KEYS_P1, DEFAULT_KEYS_P2],
  pads: [DEFAULT_PAD, DEFAULT_PAD],
  accessibility: { reducedShake: false, reducedFlash: false, colourBlindHud: false, subtitles: true, soundCues: false, holdToBlock: [false, false] },
  rounds: 3,
  roundTime: 60,
  difficulty: 2,
};

type Listener = (s: Settings) => void;

/** Tiny observable settings store persisted to IndexedDB. */
export class SettingsStore {
  private value: Settings = structuredClone(DEFAULT_SETTINGS);
  private listeners = new Set<Listener>();

  get(): Settings { return this.value; }

  async load(): Promise<Settings> {
    const saved = await loadKey<Partial<Settings> | null>('settings', null);
    if (saved && saved.version === 1) this.value = { ...structuredClone(DEFAULT_SETTINGS), ...saved } as Settings;
    this.emit();
    return this.value;
  }

  update(patch: Partial<Settings> | ((s: Settings) => Settings)): void {
    this.value = typeof patch === 'function' ? patch(this.value) : { ...this.value, ...patch };
    this.emit();
    void saveKey('settings', this.value);
  }

  reset(): void {
    this.update(structuredClone(DEFAULT_SETTINGS));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    for (const l of this.listeners) l(this.value);
  }
}

export interface Records {
  arcadeClears: Record<string, number>;
  survivalBest: Record<string, number>;
  timeAttackBest: Record<string, number>; // ms
  unlocks: string[];
  matchesPlayed: number;
}
export const DEFAULT_RECORDS: Records = { arcadeClears: {}, survivalBest: {}, timeAttackBest: {}, unlocks: [], matchesPlayed: 0 };

export async function loadRecords(): Promise<Records> {
  return { ...structuredClone(DEFAULT_RECORDS), ...(await loadKey<Partial<Records>>('records', {})) };
}
export async function saveRecords(r: Records): Promise<void> {
  await saveKey('records', r);
}
