import type { MenuAction } from '@/input/MenuInput';
import { MenuList } from '../MenuList';
import { Screen, h } from '../Screen';

export type DummyMode = 'stand' | 'crouch' | 'jump' | 'guardAll' | 'guardAfterFirst' | 'cpu' | 'record' | 'playback';
export interface PracticeOptions { dummy: DummyMode; counterHit: boolean; frameData: boolean; inputDisplay: boolean; hitboxes: boolean; hpRegen: boolean }

const DUMMY_MODES: DummyMode[] = ['stand', 'crouch', 'jump', 'guardAll', 'guardAfterFirst', 'cpu', 'record', 'playback'];
const LABELS: Record<DummyMode, string> = { stand: 'STAND', crouch: 'CROUCH', jump: 'JUMP', guardAll: 'GUARD ALL', guardAfterFirst: 'GUARD AFTER 1ST HIT', cpu: 'CPU', record: 'RECORD (START to arm)', playback: 'PLAYBACK' };

export class PracticeMenu extends Screen {
  readonly list: MenuList;
  readonly options: PracticeOptions = { dummy: 'stand', counterHit: false, frameData: true, inputDisplay: true, hitboxes: false, hpRegen: true };
  onChange: ((o: PracticeOptions) => void) | null = null;
  onBack: (() => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'practice-menu');
    this.el.append(h('div', 'menu-title', 'TRAINING OPTIONS'));
    const o = this.options;
    const toggle = (key: keyof Omit<PracticeOptions, 'dummy'>, label: string) => ({ id: key, label, value: () => (o[key] ? 'ON' : 'OFF'), adjust: () => { o[key] = !o[key]; this.onChange?.(o); } });
    this.list = new MenuList([
      { id: 'dummy', label: 'DUMMY', value: () => LABELS[o.dummy], adjust: (d) => { const i = (DUMMY_MODES.indexOf(o.dummy) + d + DUMMY_MODES.length) % DUMMY_MODES.length; o.dummy = DUMMY_MODES[i] as DummyMode; this.onChange?.(o); } },
      toggle('counterHit', 'COUNTER HIT ON HIT'),
      toggle('frameData', 'FRAME DATA (F2)'),
      toggle('inputDisplay', 'INPUT DISPLAY (F4)'),
      toggle('hitboxes', 'HITBOXES (F1)'),
      toggle('hpRegen', 'HP REGEN'),
      { id: 'back', label: 'BACK' },
    ]);
    this.list.onConfirm = (id) => { if (id === 'back') this.onBack?.(); else this.list.adjust(1); };
    this.el.append(this.list.el);
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'up') { this.list.move(-1); return true; }
    if (action === 'down') { this.list.move(1); return true; }
    if (action === 'left') { this.list.adjust(-1); return true; }
    if (action === 'right') { this.list.adjust(1); return true; }
    if (action === 'confirm') { this.list.confirm(); return true; }
    if (action === 'back' || action === 'start') { this.onBack?.(); return true; }
    return false;
  }
}
