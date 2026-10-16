import type { MenuAction } from '@/input/MenuInput';
import { Screen, h } from '../Screen';

/** "P1 vs P2" splash shown while the stage loads. */
export class VersusSplash extends Screen {
  private left: HTMLDivElement;
  private right: HTMLDivElement;
  private stage: HTMLDivElement;
  constructor(root: HTMLElement) {
    super(root, 'versus-splash');
    this.left = h('div', 'vs-name vs-left');
    this.right = h('div', 'vs-name vs-right');
    this.stage = h('div', 'vs-stage');
    this.el.append(this.left, h('div', 'vs-mark', 'VS'), this.right, this.stage);
  }
  set(p1: string, p2: string, stage: string): void {
    this.left.textContent = p1; this.right.textContent = p2; this.stage.textContent = stage;
  }
  handle(): boolean { return true; }
}

/** Loading screen with rotating tips. */
export class LoadingScreen extends Screen {
  private tip: HTMLDivElement;
  private tips = [
    'Hold back to block highs and mids; crouch-block for lows.',
    'Tap up or down to sidestep. Linear attacks whiff; homing attacks track.',
    'Throw breaks: 1+3 → press 1, 2+4 → press 2, 1+2 → press 1+2.',
    'Launchers are unsafe on block. Punish with your fastest move.',
    'Press any button when you land to tech roll.',
    'Counter hits deal more damage and open bigger combos.',
    'Power crush moves absorb highs and mids but lose to lows and throws.',
    'F1 hitboxes · F2 frame data · F3 profiler · F4 input display',
  ];
  constructor(root: HTMLElement) {
    super(root, 'loading-screen');
    this.tip = h('div', 'loading-tip');
    this.el.append(h('div', 'loading-label', 'LOADING'), this.tip);
  }
  protected override onShow(): void {
    this.tip.textContent = this.tips[Math.floor(Math.random() * this.tips.length)] ?? '';
  }
  handle(): boolean { return true; }
}

/** Letterboxed cutscene overlay with subtitles. */
export class CutsceneOverlay extends Screen {
  private text: HTMLDivElement;
  private skip: HTMLDivElement;
  onSkip: (() => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'cutscene');
    this.text = h('div', 'cutscene-text');
    this.skip = h('div', 'cutscene-skip', 'START: SKIP');
    this.el.append(h('div', 'letterbox top'), h('div', 'letterbox bottom'), this.text, this.skip);
  }
  say(line: string, speaker = ''): void {
    this.text.innerHTML = speaker ? `<b>${speaker}</b> ${line}` : line;
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'start') { this.onSkip?.(); return true; }
    return true;
  }
}
