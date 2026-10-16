import type { MenuAction } from '@/input/MenuInput';
import { MenuList } from '../MenuList';
import { Screen, h } from '../Screen';

export interface ReplayEntry { key: string; label: string }

export class ReplayList extends Screen {
  readonly list: MenuList;
  onPlay: ((key: string) => void) | null = null;
  onDelete: ((key: string) => void) | null = null;
  onBack: (() => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'replay-list');
    this.el.append(h('div', 'menu-title', 'REPLAY THEATRE'));
    this.list = new MenuList();
    this.list.onConfirm = (id) => { if (id !== '-') this.onPlay?.(id); };
    this.el.append(this.list.el, h('div', 'select-help', '1/3: play · 2/4: back · hold 1+2: delete'));
  }
  setEntries(entries: ReplayEntry[]): void {
    this.list.setItems(entries.length ? entries.map((e) => ({ id: e.key, label: e.label })) : [{ id: '-', label: 'NO REPLAYS SAVED', disabled: true }]);
    this.list.cursor = 0; this.list.render();
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'up') { this.list.move(-1); return true; }
    if (action === 'down') { this.list.move(1); return true; }
    if (action === 'confirm') { this.list.confirm(); return true; }
    if (action === 'alt') { const c = this.list.current(); if (c && c.id !== '-') this.onDelete?.(c.id); return true; }
    if (action === 'back' || action === 'start') { this.onBack?.(); return true; }
    return false;
  }
}
