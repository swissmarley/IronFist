import { h } from './Screen';

export interface NetHudInfo {
  rttMs: number;
  delay: number;
  frame: number;
  confirmed: number;
  rollbacks: number;
  maxDepth: number;
  stalls: number;
  desyncFrame: number;
}

/** Small connection readout shown during online matches (bottom-left, monospace). */
export class NetHud {
  readonly el: HTMLDivElement;
  private readonly warn: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = h('div', 'net-hud');
    this.warn = h('div', 'net-hud-warn');
    this.el.append(h('span', 'net-hud-text'), this.warn);
    root.appendChild(this.el);
  }

  update(i: NetHudInfo): void {
    const t = this.el.firstElementChild as HTMLElement;
    t.textContent = `ONLINE · RTT ${Math.round(i.rttMs)} ms · DELAY ${i.delay} · ROLLBACKS ${i.rollbacks} (max ${i.maxDepth}) · STALLS ${i.stalls} · F ${i.frame}/${i.confirmed}`;
    this.el.dataset.rollbacks = String(i.rollbacks);
    this.warn.textContent = i.desyncFrame >= 0 ? `DESYNC DETECTED AT FRAME ${i.desyncFrame}` : '';
  }

  dispose(): void { this.el.remove(); }
}
