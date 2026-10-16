import type { MenuAction } from '@/input/MenuInput';
import type { CharacterDef, MoveDef } from '@/sim/types';
import { Screen, h } from '../Screen';

/** Scrollable move list with frame data; optional "demo" callback for live execution in practice. */
export class MoveListScreen extends Screen {
  private body: HTMLDivElement;
  private rows: HTMLDivElement[] = [];
  private moves: MoveDef[] = [];
  private cursor = 0;
  onDemo: ((move: MoveDef) => void) | null = null;
  onBack: (() => void) | null = null;
  constructor(root: HTMLElement) {
    super(root, 'move-list');
    this.body = h('div', 'move-list-body');
    this.el.append(h('div', 'menu-title', 'MOVE LIST'), this.body, h('div', 'select-help', 'Up/Down: browse · 1/3: demo (practice) · 2/4: back'));
  }
  setCharacter(def: CharacterDef): void {
    this.moves = def.moves.filter((m) => !m.conditions?.includes('throwing'));
    this.body.innerHTML = '';
    this.rows = this.moves.map((m) => {
      const row = h('div', 'move-row');
      const hit = m.hits[0];
      const cond = m.conditions?.filter((c) => c !== 'standing').join(' ') ?? '';
      const fd = m.throw ? `throw · ${m.throw.damage} dmg · i${m.throw.grabFrame} · break ${m.throw.breakButton === 12 ? '1+2' : m.throw.breakButton}` :
        hit ? `${hit.level} · ${hit.damage} dmg · i${hit.frames[0]} · blk ${hit.onBlock >= 0 ? '+' : ''}${hit.onBlock} · hit ${hit.onHit >= 0 ? '+' : ''}${hit.onHit}${hit.reaction.includes('launch') ? ' · LAUNCH' : ''}` : m.parry ? 'parry' : '';
      row.append(h('span', 'move-name', m.name), h('span', 'move-input', `${cond ? cond.toUpperCase() + ' ' : ''}${m.input}`), h('span', 'move-fd', fd));
      this.body.appendChild(row);
      return row;
    });
    this.cursor = 0;
    this.render();
  }
  private render(): void {
    this.rows.forEach((r, i) => r.classList.toggle('selected', i === this.cursor));
    this.rows[this.cursor]?.scrollIntoView({ block: 'nearest' });
  }
  handle(_player: number, action: MenuAction): boolean {
    const n = this.rows.length;
    if (action === 'up') { this.cursor = (this.cursor - 1 + n) % n; this.render(); return true; }
    if (action === 'down') { this.cursor = (this.cursor + 1) % n; this.render(); return true; }
    if (action === 'confirm') { const m = this.moves[this.cursor]; if (m) this.onDemo?.(m); return true; }
    if (action === 'back' || action === 'start') { this.onBack?.(); return true; }
    return false;
  }
}
