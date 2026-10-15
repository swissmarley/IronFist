import type { MenuAction } from '@/input/MenuInput';
import { ACTIONS, type Action, type KeyBindings } from '@/input/bindings';
import { QUALITY_TIERS } from '@/render/quality';
import type { Settings, SettingsStore } from '@/app/settings';
import { MenuList, type MenuItem } from '../MenuList';
import { Screen, h } from '../Screen';

const ACTION_LABELS: Record<Action, string> = {
  left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN', b1: '1 (LP)', b2: '2 (RP)', b3: '3 (LK)', b4: '4 (RK)',
  b12: '1+2', b34: '3+4', b13: '1+3', b24: '2+4', start: 'START', back: 'BACK',
};

type Page = 'main' | 'controls1' | 'controls2' | 'audio' | 'video' | 'access';

/** Settings with sub-pages: video, audio, controls (keyboard remap), accessibility. */
export class SettingsScreen extends Screen {
  readonly list: MenuList;
  private page: Page = 'main';
  private remapAction: Action | null = null;
  private remapPlayer = 0;
  private prompt: HTMLDivElement;
  private readonly keyHandler = (e: KeyboardEvent): void => this.onKey(e);
  onBack: (() => void) | null = null;
  onQualityChange: ((tier: Settings['quality']) => void) | null = null;

  constructor(root: HTMLElement, private readonly store: SettingsStore) {
    super(root, 'settings-screen');
    this.el.append(h('div', 'menu-title', 'SETTINGS'));
    this.list = new MenuList();
    this.list.onConfirm = (id) => this.confirm(id);
    this.prompt = h('div', 'remap-prompt');
    this.prompt.style.display = 'none';
    this.el.append(this.list.el, this.prompt, h('div', 'select-help', 'Left/Right: change · 1/3: select · 2/4: back'));
    this.setPage('main');
  }

  protected override onShow(): void { this.setPage('main'); window.addEventListener('keydown', this.keyHandler, true); }
  protected override onHide(): void { window.removeEventListener('keydown', this.keyHandler, true); }

  private s(): Settings { return this.store.get(); }

  private setPage(p: Page): void {
    this.page = p;
    const s = this.s();
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const vol = (k: keyof Settings['volumes'], label: string): MenuItem => ({ id: k, label, value: () => pct(this.s().volumes[k]), adjust: (d) => this.store.update((x) => ({ ...x, volumes: { ...x.volumes, [k]: Math.max(0, Math.min(1, Math.round((x.volumes[k] + d * 0.1) * 10) / 10)) } })) });
    const tog = (get: (x: Settings) => boolean, set: (x: Settings, v: boolean) => Settings, id: string, label: string): MenuItem => ({ id, label, value: () => (get(this.s()) ? 'ON' : 'OFF'), adjust: () => this.store.update((x) => set(x, !get(x))) });
    let items: MenuItem[];
    switch (p) {
      case 'video': {
        const tiers = ['auto', ...QUALITY_TIERS];
        items = [
          { id: 'quality', label: 'QUALITY', value: () => this.s().quality.toUpperCase(), adjust: (d) => { const i = (tiers.indexOf(this.s().quality) + d + tiers.length) % tiers.length; const q = tiers[i] as Settings['quality']; this.store.update({ quality: q }); this.onQualityChange?.(q); } },
          { id: 'scale', label: 'RENDER SCALE', value: () => pct(this.s().renderScale), adjust: (d) => this.store.update((x) => ({ ...x, renderScale: Math.max(0.5, Math.min(1, Math.round((x.renderScale + d * 0.1) * 10) / 10)) })) },
          { id: 'back', label: 'BACK' },
        ];
        break;
      }
      case 'audio':
        items = [vol('master', 'MASTER'), vol('sfx', 'SFX'), vol('voice', 'VOICE'), vol('music', 'MUSIC'), vol('ui', 'UI'),
          { id: 'announcer', label: 'ANNOUNCER', value: () => this.s().announcer.toUpperCase(), adjust: () => this.store.update((x) => ({ ...x, announcer: x.announcer === 'speech' ? 'synth' : 'speech' })) },
          { id: 'back', label: 'BACK' }];
        break;
      case 'access':
        items = [
          tog((x) => x.accessibility.reducedShake, (x, v) => ({ ...x, accessibility: { ...x.accessibility, reducedShake: v } }), 'shake', 'REDUCED SCREEN SHAKE'),
          tog((x) => x.accessibility.reducedFlash, (x, v) => ({ ...x, accessibility: { ...x.accessibility, reducedFlash: v } }), 'flash', 'REDUCED FLASHES'),
          tog((x) => x.accessibility.colourBlindHud, (x, v) => ({ ...x, accessibility: { ...x.accessibility, colourBlindHud: v } }), 'cb', 'COLOUR-BLIND HUD'),
          tog((x) => x.accessibility.subtitles, (x, v) => ({ ...x, accessibility: { ...x.accessibility, subtitles: v } }), 'subs', 'SUBTITLES'),
          tog((x) => x.accessibility.soundCues, (x, v) => ({ ...x, accessibility: { ...x.accessibility, soundCues: v } }), 'cues', 'SOUND CUES'),
          tog((x) => x.accessibility.holdToBlock[0], (x, v) => ({ ...x, accessibility: { ...x.accessibility, holdToBlock: [v, x.accessibility.holdToBlock[1]] } }), 'htb1', 'HOLD-TO-BLOCK ASSIST P1'),
          tog((x) => x.accessibility.holdToBlock[1], (x, v) => ({ ...x, accessibility: { ...x.accessibility, holdToBlock: [x.accessibility.holdToBlock[0], v] } }), 'htb2', 'HOLD-TO-BLOCK ASSIST P2'),
          { id: 'back', label: 'BACK' },
        ];
        break;
      case 'controls1':
      case 'controls2': {
        const pl = p === 'controls1' ? 0 : 1;
        items = [
          ...ACTIONS.map((a): MenuItem => ({ id: `remap:${a}`, label: ACTION_LABELS[a], value: () => (this.s().keys[pl as 0 | 1][a].join(' / ') || '—') })),
          { id: 'reset', label: 'RESET TO DEFAULT' },
          { id: 'back', label: 'BACK' },
        ];
        break;
      }
      default:
        items = [
          { id: 'video', label: 'VIDEO' }, { id: 'audio', label: 'AUDIO' }, { id: 'controls1', label: 'CONTROLS P1' }, { id: 'controls2', label: 'CONTROLS P2' }, { id: 'access', label: 'ACCESSIBILITY' },
          { id: 'rounds', label: 'ROUNDS TO WIN', value: () => String(s.rounds), adjust: (d) => this.store.update((x) => ({ ...x, rounds: Math.max(1, Math.min(5, x.rounds + d)) })) },
          { id: 'time', label: 'ROUND TIME', value: () => (this.s().roundTime === 0 ? 'INFINITE' : `${this.s().roundTime}s`), adjust: (d) => this.store.update((x) => { const opts = [30, 45, 60, 99, 0]; const i = (opts.indexOf(x.roundTime) + d + opts.length) % opts.length; return { ...x, roundTime: opts[i] as number }; }) },
          { id: 'difficulty', label: 'CPU DIFFICULTY', value: () => ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'BOSS'][this.s().difficulty] ?? 'MEDIUM', adjust: (d) => this.store.update((x) => ({ ...x, difficulty: Math.max(0, Math.min(4, x.difficulty + d)) })) },
          { id: 'resetAll', label: 'RESET ALL SETTINGS' },
          { id: 'back', label: 'BACK' },
        ];
    }
    this.list.setItems(items);
    this.list.cursor = 0; this.list.render();
  }

  private confirm(id: string): void {
    if (id === 'back') { if (this.page === 'main') this.onBack?.(); else this.setPage('main'); return; }
    if (id === 'resetAll') { this.store.reset(); this.setPage('main'); return; }
    if (id === 'reset') { const pl = this.page === 'controls1' ? 0 : 1; this.store.update((x) => { const keys = [...x.keys] as [KeyBindings, KeyBindings]; keys[pl] = structuredClone((pl === 0 ? x.keys[0] : x.keys[1])); return x; }); this.resetControls(pl); return; }
    if (id.startsWith('remap:')) { this.beginRemap(id.slice(6) as Action, this.page === 'controls1' ? 0 : 1); return; }
    if (['video', 'audio', 'controls1', 'controls2', 'access'].includes(id)) { this.setPage(id as Page); return; }
    this.list.adjust(1);
  }

  private resetControls(pl: number): void {
    void import('@/input/bindings').then((b) => {
      this.store.update((x) => { const keys = [...x.keys] as [KeyBindings, KeyBindings]; keys[pl as 0 | 1] = structuredClone(pl === 0 ? b.DEFAULT_KEYS_P1 : b.DEFAULT_KEYS_P2); return { ...x, keys }; });
      this.list.render();
    });
  }

  private beginRemap(a: Action, pl: number): void {
    this.remapAction = a; this.remapPlayer = pl;
    this.prompt.textContent = `PRESS A KEY FOR ${ACTION_LABELS[a]} (ESC TO CANCEL)`;
    this.prompt.style.display = 'flex';
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.remapAction) return;
    e.preventDefault(); e.stopPropagation();
    if (e.code !== 'Escape') {
      const a = this.remapAction, pl = this.remapPlayer as 0 | 1;
      this.store.update((x) => {
        const keys = [structuredClone(x.keys[0]), structuredClone(x.keys[1])] as [KeyBindings, KeyBindings];
        // remove the key from any other action of this player, then bind
        for (const other of ACTIONS) keys[pl][other] = keys[pl][other].filter((c) => c !== e.code);
        keys[pl][a] = [e.code];
        return { ...x, keys };
      });
    }
    this.remapAction = null;
    this.prompt.style.display = 'none';
    this.list.render();
  }

  handle(_player: number, action: MenuAction): boolean {
    if (this.remapAction) return true;
    if (action === 'up') { this.list.move(-1); return true; }
    if (action === 'down') { this.list.move(1); return true; }
    if (action === 'left') { this.list.adjust(-1); return true; }
    if (action === 'right') { this.list.adjust(1); return true; }
    if (action === 'confirm') { this.list.confirm(); return true; }
    if (action === 'back') { this.confirm('back'); return true; }
    return false;
  }
}
