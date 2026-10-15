import type { FighterState } from '@/sim/fighterState';

const ARROWS = ['', '↙', '↓', '↘', '←', '·', '→', '↖', '↑', '↗'];
const ROWS = 14;

/** F4 / training: scrolling input history for both players (numpad arrows + buttons). */
export class InputDisplay {
  private el: HTMLDivElement;
  private cols: HTMLDivElement[] = [];
  private histories: { dir: number; btn: number; frames: number }[][] = [[], []];

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dbg-input';
    this.el.style.display = 'none';
    for (let i = 0; i < 2; i++) {
      const c = document.createElement('div');
      c.style.display = 'inline-block';
      c.style.verticalAlign = 'top';
      c.style.minWidth = '110px';
      this.cols.push(c);
      this.el.appendChild(c);
    }
    root.appendChild(this.el);
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? 'block' : 'none';
  }

  /** Called once per sim step. */
  record(fighters: readonly FighterState[]): void {
    fighters.forEach((f, i) => {
      const h = this.histories[i] as { dir: number; btn: number; frames: number }[];
      const last = h[h.length - 1];
      if (last && last.dir === f.dir && last.btn === f.buttons) { last.frames = Math.min(99, last.frames + 1); return; }
      h.push({ dir: f.dir, btn: f.buttons, frames: 1 });
      if (h.length > ROWS) h.shift();
    });
  }

  render(): void {
    if (this.el.style.display === 'none') return;
    this.histories.forEach((h, i) => {
      const lines = [`P${i + 1}`];
      for (let k = h.length - 1; k >= 0; k--) {
        const e = h[k] as { dir: number; btn: number; frames: number };
        const b = [1, 2, 3, 4].filter((n) => e.btn & (1 << (n - 1))).join('+');
        lines.push(`${String(e.frames).padStart(2, ' ')} ${ARROWS[e.dir]} ${b}`);
      }
      (this.cols[i] as HTMLDivElement).textContent = lines.join('\n');
    });
  }
}
