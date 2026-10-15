import type { MenuAction } from '@/input/MenuInput';
import { MenuList } from '../MenuList';
import { Screen, h } from '../Screen';

export type PauseChoice = 'resume' | 'movelist' | 'practice' | 'settings' | 'restart' | 'quit';

export class PauseMenu extends Screen {
  readonly list: MenuList;
  onChoose: ((c: PauseChoice) => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'pause-menu');
    this.el.append(h('div', 'menu-title', 'PAUSED'));
    this.list = new MenuList();
    this.list.onConfirm = (id) => this.onChoose?.(id as PauseChoice);
    this.el.append(this.list.el);
  }
  configure(practice: boolean): void {
    this.list.setItems([
      { id: 'resume', label: 'RESUME' },
      { id: 'movelist', label: 'MOVE LIST' },
      ...(practice ? [{ id: 'practice', label: 'TRAINING OPTIONS' }] : []),
      { id: 'settings', label: 'SETTINGS' },
      { id: 'restart', label: practice ? 'RESET POSITIONS' : 'RESTART MATCH' },
      { id: 'quit', label: 'QUIT TO MENU' },
    ]);
    this.list.cursor = 0; this.list.render();
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'up') { this.list.move(-1); return true; }
    if (action === 'down') { this.list.move(1); return true; }
    if (action === 'confirm') { this.list.confirm(); return true; }
    if (action === 'back' || action === 'start') { this.onChoose?.('resume'); return true; }
    return false;
  }
}
