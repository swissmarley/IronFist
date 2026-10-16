import { h } from './Screen';

export interface MenuItem {
  id: string;
  label: string;
  /** Optional value renderer for option rows (e.g. "< 3 >"). */
  value?: () => string;
  /** Left/right handlers for option rows. */
  adjust?: (dir: -1 | 1) => void;
  disabled?: boolean;
  hint?: string;
}

/** Vertical menu with a cursor, wrap-around and option rows. */
export class MenuList {
  readonly el: HTMLDivElement;
  private items: MenuItem[] = [];
  private rows: HTMLDivElement[] = [];
  cursor = 0;
  onConfirm: ((id: string) => void) | null = null;
  onCursor: ((id: string) => void) | null = null;
  onSound: ((kind: 'move' | 'confirm' | 'back') => void) | null = null;

  constructor(items: MenuItem[] = []) {
    this.el = h('div', 'menu-list');
    this.setItems(items);
  }

  setItems(items: MenuItem[]): void {
    this.items = items;
    this.el.innerHTML = '';
    this.rows = items.map((it) => {
      const row = h('div', 'menu-row' + (it.disabled ? ' disabled' : ''));
      row.appendChild(h('span', 'menu-label', it.label));
      if (it.value) row.appendChild(h('span', 'menu-value', it.value()));
      if (it.hint) row.title = it.hint;
      this.el.appendChild(row);
      return row;
    });
    this.cursor = Math.min(this.cursor, Math.max(0, items.length - 1));
    this.render();
  }

  render(): void {
    this.rows.forEach((row, i) => {
      row.classList.toggle('selected', i === this.cursor);
      const it = this.items[i];
      const v = row.querySelector('.menu-value');
      if (it?.value && v) v.textContent = it.value();
    });
  }

  move(delta: number): void {
    if (this.items.length === 0) return;
    let next = this.cursor;
    for (let k = 0; k < this.items.length; k++) {
      next = (next + delta + this.items.length) % this.items.length;
      if (!this.items[next]?.disabled) break;
    }
    if (next !== this.cursor) { this.cursor = next; this.render(); this.onSound?.('move'); this.onCursor?.(this.items[next]?.id ?? ''); }
  }

  adjust(dir: -1 | 1): boolean {
    const it = this.items[this.cursor];
    if (!it?.adjust) return false;
    it.adjust(dir);
    this.render();
    this.onSound?.('move');
    return true;
  }

  confirm(): void {
    const it = this.items[this.cursor];
    if (!it || it.disabled) return;
    this.onSound?.('confirm');
    this.onConfirm?.(it.id);
  }

  current(): MenuItem | undefined { return this.items[this.cursor]; }
}
