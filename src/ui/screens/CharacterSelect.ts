import type { MenuAction } from '@/input/MenuInput';
import type { CharacterDef } from '@/sim/types';
import { Screen, h } from '../Screen';

export interface SelectResult { p1: string; p2: string }

/**
 * Character select grid for one or two players with a rotating cursor.
 * The 3D turntable portraits are rendered by SelectScene behind this overlay.
 */
export class CharacterSelect extends Screen {
  private grid: HTMLDivElement;
  private cells: HTMLDivElement[] = [];
  private cursor: [number, number] = [0, 1];
  private locked: [boolean, boolean] = [false, false];
  private players = 1;
  private names: [HTMLDivElement, HTMLDivElement];
  private taglines: [HTMLDivElement, HTMLDivElement];
  private cols = 4;
  onChange: ((p: number, id: string) => void) | null = null;
  onDone: ((r: SelectResult) => void) | null = null;
  onBack: (() => void) | null = null;
  onSound: ((kind: 'move' | 'confirm' | 'back') => void) | null = null;

  constructor(root: HTMLElement, private readonly roster: CharacterDef[]) {
    super(root, 'char-select');
    this.el.append(h('div', 'menu-title', 'CHOOSE YOUR FIGHTER'));
    const side1 = h('div', 'select-side side-p1'), side2 = h('div', 'select-side side-p2');
    this.names = [h('div', 'select-name'), h('div', 'select-name')];
    this.taglines = [h('div', 'select-tag'), h('div', 'select-tag')];
    side1.append(this.names[0], this.taglines[0]);
    side2.append(this.names[1], this.taglines[1]);
    this.grid = h('div', 'select-grid');
    this.cells = roster.map((c, i) => {
      const cell = h('div', 'select-cell');
      cell.dataset.id = c.id;
      cell.append(h('div', 'select-cell-name', c.name.split(' ')[0] ?? c.name));
      cell.style.setProperty('--i', String(i));
      this.grid.appendChild(cell);
      return cell;
    });
    this.el.append(side1, this.grid, side2, h('div', 'select-help', 'Move: directions · Confirm: 1 / 3 · Back: 2 / 4'));
  }

  start(players: number): void {
    this.players = players;
    this.locked = [false, false];
    this.cursor = [0, Math.min(1, this.roster.length - 1)];
    this.render();
    this.show();
  }

  private render(): void {
    this.cells.forEach((cell, i) => {
      cell.classList.toggle('cur-p1', this.cursor[0] === i);
      cell.classList.toggle('cur-p2', this.players === 2 && this.cursor[1] === i);
      cell.classList.toggle('locked', (this.locked[0] && this.cursor[0] === i) || (this.locked[1] && this.cursor[1] === i));
    });
    for (let p = 0; p < 2; p++) {
      const c = this.roster[this.cursor[p] as number];
      (this.names[p] as HTMLDivElement).textContent = p === 1 && this.players === 1 ? '' : c?.name ?? '';
      (this.taglines[p] as HTMLDivElement).textContent = p === 1 && this.players === 1 ? '' : c?.tagline ?? c?.archetype ?? '';
    }
  }

  current(p: number): string {
    return this.roster[this.cursor[p as 0 | 1]]?.id ?? this.roster[0]?.id ?? 'greybox';
  }

  handle(player: number, action: MenuAction): boolean {
    const p = (this.players === 1 ? 0 : Math.min(player, 1)) as 0 | 1;
    if (this.locked[p] && action !== 'back') return true;
    const n = this.roster.length;
    const cur = this.cursor[p];
    switch (action) {
      case 'left': this.cursor[p] = (cur - 1 + n) % n; break;
      case 'right': this.cursor[p] = (cur + 1) % n; break;
      case 'up': this.cursor[p] = (cur - this.cols + n) % n; break;
      case 'down': this.cursor[p] = (cur + this.cols) % n; break;
      case 'confirm':
      case 'start': {
        this.locked[p] = true;
        this.onSound?.('confirm');
        this.render();
        if (this.players === 1 || (this.locked[0] && this.locked[1])) {
          const p2 = this.players === 1 ? this.pickCpu() : this.current(1);
          this.onDone?.({ p1: this.current(0), p2 });
        }
        return true;
      }
      case 'back': {
        if (this.locked[p]) { this.locked[p] = false; this.render(); this.onSound?.('back'); return true; }
        this.onSound?.('back');
        this.onBack?.();
        return true;
      }
      default: return false;
    }
    this.onSound?.('move');
    this.render();
    this.onChange?.(p, this.current(p));
    return true;
  }

  private pickCpu(): string {
    // first opponent is chosen by the mode; return the next roster entry as a placeholder
    const i = (this.cursor[0] + 1) % this.roster.length;
    return this.roster[i]?.id ?? this.current(0);
  }
}
