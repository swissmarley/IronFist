import type { MenuAction } from '@/input/MenuInput';

/** Base class for DOM screens. Screens are mounted into the UI root and receive menu actions. */
export abstract class Screen {
  readonly el: HTMLDivElement;
  protected root: HTMLElement;
  private visible = false;

  constructor(root: HTMLElement, className: string) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = `screen ${className}`;
    this.el.style.display = 'none';
    root.appendChild(this.el);
  }

  show(): void {
    this.visible = true;
    this.el.style.display = '';
    this.el.classList.remove('leave');
    this.el.classList.add('enter');
    this.onShow();
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
    this.onHide();
  }

  isVisible(): boolean { return this.visible; }
  protected onShow(): void { /* override */ }
  protected onHide(): void { /* override */ }
  /** Handle a menu action; return true when consumed. */
  abstract handle(player: number, action: MenuAction): boolean;
  update(_dtMs: number): void { /* override */ }
  dispose(): void { this.el.remove(); }
}

/** Helper: create an element with class and optional text. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}
