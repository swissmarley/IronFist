import type { MenuAction } from '@/input/MenuInput';
import { MenuList } from '../MenuList';
import { Screen, h } from '../Screen';

export type MainMenuChoice = 'arcade' | 'versus' | 'online' | 'practice' | 'survival' | 'timeattack' | 'replays' | 'settings';

export class MainMenu extends Screen {
  readonly list: MenuList;
  onChoose: ((c: MainMenuChoice) => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'main-menu');
    this.el.append(h('div', 'menu-title', 'MAIN MENU'));
    this.list = new MenuList([
      { id: 'arcade', label: 'ARCADE', hint: 'Fight through 8 stages' },
      { id: 'versus', label: 'VERSUS', hint: 'Local 2 player' },
      { id: 'online', label: 'ONLINE', hint: '2 players over the internet (rollback netcode)' },
      { id: 'practice', label: 'PRACTICE', hint: 'Training room' },
      { id: 'survival', label: 'SURVIVAL' },
      { id: 'timeattack', label: 'TIME ATTACK' },
      { id: 'replays', label: 'REPLAY THEATRE' },
      { id: 'settings', label: 'SETTINGS' },
    ]);
    this.list.onConfirm = (id) => this.onChoose?.(id as MainMenuChoice);
    this.el.append(this.list.el);
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'up') { this.list.move(-1); return true; }
    if (action === 'down') { this.list.move(1); return true; }
    if (action === 'confirm' || action === 'start') { this.list.confirm(); return true; }
    return false;
  }
}
