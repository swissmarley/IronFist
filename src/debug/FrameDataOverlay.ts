import type { FighterState } from '@/sim/fighterState';
import { FState, STATE_NAMES } from '@/sim/fighterState';
import type { CharacterRuntime } from '@/sim/character';

/** F2: per-fighter state / move / frame data readout, refreshed every sim step. */
export class FrameDataOverlay {
  private el: HTMLDivElement;
  private lastAdv: [string, string] = ['-', '-'];

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dbg-framedata';
    this.el.style.display = 'none';
    root.appendChild(this.el);
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? 'block' : 'none';
  }

  /** Record the advantage of the last contact for display (called from event consumer). */
  recordContact(attacker: number, adv: number, kind: 'hit' | 'block' | 'ch'): void {
    const sign = adv >= 0 ? '+' : '';
    this.lastAdv[attacker as 0 | 1] = `${kind.toUpperCase()} ${sign}${adv}`;
  }

  update(fighters: readonly FighterState[], chars: readonly CharacterRuntime[], frame: number): void {
    if (this.el.style.display === 'none') return;
    const lines: string[] = [`frame ${frame}`];
    fighters.forEach((f, i) => {
      const rt = chars[i] as CharacterRuntime;
      let moveLine = '-';
      let phase = '';
      if (f.state === FState.Attack && f.moveIdx >= 0) {
        const m = rt.move(f.moveIdx);
        const su = rt.startup[f.moveIdx] ?? 0, la = rt.lastActive[f.moveIdx] ?? 0;
        phase = f.moveFrame < su ? 'startup' : f.moveFrame <= la ? 'ACTIVE' : 'recovery';
        const h = m.hits[0];
        moveLine = `${m.name} [${m.input}] f${f.moveFrame}/${m.total} ${phase}  i${su} ${h ? `${h.level} dmg${h.damage} blk${h.onBlock >= 0 ? '+' : ''}${h.onBlock} hit${h.onHit >= 0 ? '+' : ''}${h.onHit}` : ''}`;
      }
      lines.push(
        `P${i + 1} ${STATE_NAMES[f.state]}${f.crouching ? ' (crouch)' : ''} sf${f.stateFrame} stun${f.stunFrames} hs${f.hitstop} hp${f.hp}` +
        ` pos ${f.x},${f.y},${f.z} combo ${f.comboHits}/${f.comboDamage} last ${this.lastAdv[i as 0 | 1]}`,
      );
      lines.push(`   ${moveLine}`);
    });
    this.el.textContent = lines.join('\n');
  }
}
