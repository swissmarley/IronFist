import { h } from './Screen';

export interface NetHudInfo {
  rttMs: number;
  delay: number;
  /** Delay picked from the lobby RTT (vs a fixed `?delay=` value). */
  delayAuto: boolean;
  frame: number;
  confirmed: number;
  rollbacks: number;
  maxDepth: number;
  stalls: number;
  desyncFrame: number;
  /** State transfers so far and the frame of the latest one. */
  resyncs: number;
  resyncFrame: number;
}

/** Updates (one per 10 loop ticks) the RESYNCED note stays up: ~2 s. */
const NOTE_UPDATES = 12;

/** Small connection readout shown during online matches (bottom-left, monospace). */
export class NetHud {
  readonly el: HTMLDivElement;
  private readonly warn: HTMLDivElement;
  private seenResyncs = 0;
  private noteLeft = 0;

  constructor(root: HTMLElement) {
    this.el = h('div', 'net-hud');
    this.warn = h('div', 'net-hud-warn');
    this.el.append(h('span', 'net-hud-text'), this.warn);
    root.appendChild(this.el);
  }

  update(i: NetHudInfo): void {
    const t = this.el.firstElementChild as HTMLElement;
    t.textContent = `ONLINE · RTT ${Math.round(i.rttMs)} ms · DELAY ${i.delay}${i.delayAuto ? ' AUTO' : ''} · ROLLBACKS ${i.rollbacks} (max ${i.maxDepth}) · STALLS ${i.stalls} · F ${i.frame}/${i.confirmed}`;
    this.el.dataset.rollbacks = String(i.rollbacks);
    this.el.dataset.delay = String(i.delay);
    this.el.dataset.resyncs = String(i.resyncs);
    if (i.resyncs > this.seenResyncs) { this.seenResyncs = i.resyncs; this.noteLeft = NOTE_UPDATES; }
    const resynced = this.noteLeft > 0;
    if (resynced) this.noteLeft--;
    this.warn.classList.toggle('ok', resynced && i.desyncFrame < 0);
    this.warn.textContent = i.desyncFrame >= 0 ? `DESYNC DETECTED AT FRAME ${i.desyncFrame} · RESYNCING` : resynced ? `RESYNCED (FRAME ${i.resyncFrame})` : '';
  }

  dispose(): void { this.el.remove(); }
}
