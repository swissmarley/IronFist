import type { MenuAction } from '@/input/MenuInput';
import { MenuList } from '../MenuList';
import { Screen, h } from '../Screen';

export interface MatchStats { winner: string; wins: [number, number]; maxCombo: [number, number]; damage: [number, number]; timeSec: number }
export type ResultsChoice = 'rematch' | 'select' | 'next' | 'menu';

export class ResultsScreen extends Screen {
  private title: HTMLDivElement;
  private stats: HTMLDivElement;
  private note: HTMLDivElement;
  readonly list: MenuList;
  onChoose: ((c: ResultsChoice) => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'results-screen');
    this.title = h('div', 'results-title');
    this.stats = h('div', 'results-stats');
    this.list = new MenuList();
    this.list.onConfirm = (id) => this.onChoose?.(id as ResultsChoice);
    this.note = h('div', 'results-note');
    this.el.append(this.title, this.stats, this.list.el, this.note);
  }
  set(stats: MatchStats, choices: { id: ResultsChoice; label: string }[]): void {
    this.title.textContent = `${stats.winner} WINS`;
    this.stats.innerHTML = `<table><tr><th></th><th>P1</th><th>P2</th></tr>
      <tr><td>Rounds</td><td>${stats.wins[0]}</td><td>${stats.wins[1]}</td></tr>
      <tr><td>Max combo</td><td>${stats.maxCombo[0]}</td><td>${stats.maxCombo[1]}</td></tr>
      <tr><td>Damage dealt</td><td>${stats.damage[0]}</td><td>${stats.damage[1]}</td></tr>
      <tr><td>Time</td><td colspan="2">${stats.timeSec.toFixed(1)} s</td></tr></table>`;
    this.setChoices(choices);
    this.setNote('');
  }
  /** Replace the menu (online: after a choice only LEAVE remains). */
  setChoices(choices: { id: ResultsChoice; label: string }[]): void {
    this.list.setItems(choices.map((c) => ({ id: c.id, label: c.label })));
    this.list.cursor = 0; this.list.render();
  }
  /** One status line under the menu (online: the opponent's choice). */
  setNote(text: string): void {
    this.note.textContent = text;
  }
  handle(_player: number, action: MenuAction): boolean {
    if (action === 'up') { this.list.move(-1); return true; }
    if (action === 'down') { this.list.move(1); return true; }
    if (action === 'confirm' || action === 'start') { this.list.confirm(); return true; }
    return false;
  }
}
