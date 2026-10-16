import type { MatchSim } from '@/sim/match';
import { RoundPhase } from '@/sim/match';

/** Match HUD: health bars with damage trail, round pips, timer, combo counters. */
export class Hud {
  readonly el: HTMLDivElement;
  private bars: HTMLDivElement[] = [];
  private trails: HTMLDivElement[] = [];
  private names: HTMLDivElement[] = [];
  private pips: HTMLDivElement[] = [];
  private combos: HTMLDivElement[] = [];
  private timer: HTMLDivElement;
  private trailValue = [1, 1];
  private banner: HTMLDivElement;
  private bannerTimer = 0;
  private bannerNext: string | null = null;
  private results: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="hud-side hud-p1"><div class="hud-name"></div><div class="hud-bar"><div class="hud-trail"></div><div class="hud-fill"></div></div><div class="hud-pips"></div></div>
        <div class="hud-timer">60</div>
        <div class="hud-side hud-p2"><div class="hud-name"></div><div class="hud-bar"><div class="hud-trail"></div><div class="hud-fill"></div></div><div class="hud-pips"></div></div>
      </div>
      <div class="hud-combo hud-combo-p1"></div>
      <div class="hud-combo hud-combo-p2"></div>
      <div class="hud-banner"></div>
      <div class="arcade-ladder"></div>
      <div class="hud-results"><div class="hud-results-title"></div><div class="hud-results-sub">PRESS START TO REMATCH</div></div>`;
    root.appendChild(this.el);
    for (const side of ['p1', 'p2']) {
      const s = this.el.querySelector(`.hud-${side}`) as HTMLDivElement;
      this.bars.push(s.querySelector('.hud-fill') as HTMLDivElement);
      this.trails.push(s.querySelector('.hud-trail') as HTMLDivElement);
      this.names.push(s.querySelector('.hud-name') as HTMLDivElement);
      this.pips.push(s.querySelector('.hud-pips') as HTMLDivElement);
      this.combos.push(this.el.querySelector(`.hud-combo-${side}`) as HTMLDivElement);
    }
    this.timer = this.el.querySelector('.hud-timer') as HTMLDivElement;
    this.banner = this.el.querySelector('.hud-banner') as HTMLDivElement;
    this.results = this.el.querySelector('.hud-results') as HTMLDivElement;
  }

  setLadderLabel(text: string): void {
    const el = this.el.querySelector('.arcade-ladder') as HTMLDivElement | null;
    if (el) el.textContent = text;
  }

  showResults(winner: string, wins: [number, number]): void {
    (this.results.querySelector('.hud-results-title') as HTMLDivElement).textContent = `${winner} WINS  ${wins[0]}–${wins[1]}`;
    this.results.classList.add('show');
  }

  hideResults(): void {
    this.results.classList.remove('show');
  }

  /** Colour-blind palette: blue/orange bars with distinct textures instead of two yellows. */
  setColourBlind(on: boolean): void { this.el.classList.toggle('hud-cb', on); }

  setNames(a: string, b: string): void {
    (this.names[0] as HTMLDivElement).textContent = a;
    (this.names[1] as HTMLDivElement).textContent = b;
  }

  showBanner(text: string, ms = 1200, next: string | null = null): void {
    this.banner.textContent = text;
    this.banner.classList.add('show');
    this.bannerTimer = ms;
    this.bannerNext = next;
  }

  update(sim: MatchSim, dtMs: number): void {
    const r = sim.round;
    for (let i = 0; i < 2; i++) {
      const f = sim.fighters[i] as MatchSim['fighters'][0];
      const frac = Math.max(0, f.hp / f.maxHp);
      (this.bars[i] as HTMLDivElement).style.width = `${frac * 100}%`;
      let t = this.trailValue[i] as number;
      if (frac < t) t = Math.max(frac, t - dtMs / 1400); else t = frac;
      this.trailValue[i] = t;
      (this.trails[i] as HTMLDivElement).style.width = `${t * 100}%`;
      const victim = sim.fighters[1 - i] as MatchSim['fighters'][0];
      const c = this.combos[i] as HTMLDivElement;
      if (victim.comboHits >= 2) { c.textContent = `${victim.comboHits} HITS\n${victim.comboDamage} DMG`; c.classList.add('show'); }
      else c.classList.remove('show');
      const pipsEl = this.pips[i] as HTMLDivElement;
      const want = sim.config.roundsToWin;
      if (pipsEl.childElementCount !== want) {
        pipsEl.innerHTML = '';
        for (let k = 0; k < want; k++) { const p = document.createElement('span'); p.className = 'pip'; pipsEl.appendChild(p); }
      }
      Array.from(pipsEl.children).forEach((p, k) => p.classList.toggle('won', k < (r.wins[i] ?? 0)));
    }
    this.timer.textContent = sim.config.training ? '∞' : r.timer < 0 ? '∞' : String(Math.ceil(r.timer / 60));
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dtMs;
      if (this.bannerTimer <= 0) {
        this.banner.classList.remove('show');
        if (this.bannerNext) { const n = this.bannerNext; this.bannerNext = null; setTimeout(() => this.showBanner(n, 700), 120); }
      }
    }
    this.el.classList.toggle('hud-ko', r.phase === RoundPhase.KO);
  }
}
