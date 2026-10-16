import type { LoopStats } from '@/core/loop';

export interface ProfilerSample {
  loop: LoopStats;
  drawCalls: number;
  triangles: number;
  gpuMs: number;
  backend: string;
  tier: string;
  memoryMB: number;
  simFrame: number;
}

/** F3 overlay: sim/render/GPU time, draw calls, memory. Plain DOM, updated at ~10 Hz. */
export class ProfilerOverlay {
  private el: HTMLDivElement;
  private lastUpdate = 0;
  private history = new Float32Array(120);
  private hIdx = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dbg-profiler';
    this.el.style.display = 'none';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 240;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext('2d');
    root.appendChild(this.el);
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? 'block' : 'none';
  }

  update(s: ProfilerSample, nowMs: number): void {
    this.history[this.hIdx] = s.loop.frameMs;
    this.hIdx = (this.hIdx + 1) % this.history.length;
    if (nowMs - this.lastUpdate < 100) return;
    this.lastUpdate = nowMs;
    if (this.el.style.display === 'none') return;
    const text =
      `FPS ${s.loop.fps.toFixed(0)}  frame ${s.loop.frameMs.toFixed(1)}ms\n` +
      `sim ${s.loop.simMs.toFixed(2)}ms (${s.loop.stepsLastFrame} steps)  render ${s.loop.renderMs.toFixed(2)}ms  gpu ${s.gpuMs.toFixed(2)}ms\n` +
      `draw ${s.drawCalls}  tris ${s.triangles}  mem ${s.memoryMB.toFixed(0)}MB\n` +
      `backend ${s.backend}  tier ${s.tier}  simFrame ${s.simFrame}`;
    this.el.textContent = text;
    this.el.appendChild(this.canvas);
    this.drawGraph();
  }

  private drawGraph(): void {
    const c = this.ctx;
    if (!c) return;
    const w = this.canvas.width, h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#4f8';
    c.beginPath();
    for (let i = 0; i < this.history.length; i++) {
      const v = this.history[(this.hIdx + i) % this.history.length] as number;
      const y = h - Math.min(h, (v / 33.3) * h);
      if (i === 0) c.moveTo(i * 2, y); else c.lineTo(i * 2, y);
    }
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.beginPath();
    c.moveTo(0, h / 2); c.lineTo(w, h / 2);
    c.stroke();
  }
}
