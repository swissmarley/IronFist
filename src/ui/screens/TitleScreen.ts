import type { MenuAction } from '@/input/MenuInput';
import { Screen, h } from '../Screen';

export class TitleScreen extends Screen {
  onStart: (() => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'title-screen');
    const logo = h('div', 'logo');
    logo.innerHTML = '<span class="logo-iron">IRON</span><span class="logo-fist">FIST</span>';
    this.el.append(logo, h('div', 'title-sub', 'ORIGINAL 3D FIGHTING'), h('div', 'press-start', 'PRESS START'), h('div', 'title-foot', 'Enter / Start · WASD + U I J K · Arrows + Z X C V'));
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'start' || action === 'confirm') { this.onStart?.(); return true; }
    return false;
  }
}
