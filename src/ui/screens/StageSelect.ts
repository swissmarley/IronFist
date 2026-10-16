import type { MenuAction } from '@/input/MenuInput';
import { MenuList } from '../MenuList';
import { Screen, h } from '../Screen';

export interface StageInfo { id: string; name: string; kind: 'walls' | 'open' }

export class StageSelect extends Screen {
  readonly list: MenuList;
  onChoose: ((id: string) => void) | null = null;
  onBack: (() => void) | null = null;
  constructor(root: HTMLElement, stages: StageInfo[]) {
    super(root, 'stage-select');
    this.el.append(h('div', 'menu-title', 'SELECT STAGE'));
    this.list = new MenuList([{ id: 'random', label: 'RANDOM' }, ...stages.map((s) => ({ id: s.id, label: `${s.name.toUpperCase()}  ·  ${s.kind === 'open' ? 'RING-OUT' : 'WALLS'}` }))]);
    this.list.onConfirm = (id) => this.onChoose?.(id);
    this.el.append(this.list.el);
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'up') { this.list.move(-1); return true; }
    if (action === 'down') { this.list.move(1); return true; }
    if (action === 'confirm' || action === 'start') { this.list.confirm(); return true; }
    if (action === 'back') { this.onBack?.(); return true; }
    return false;
  }
}
