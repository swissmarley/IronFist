import type { CharacterRuntime } from '@/sim/character';
import type { HitDef, MoveDef } from '@/sim/types';
import { notationToFrames } from './BasicAI';

export interface PlayMove {
  idx: number;
  move: MoveDef;
  /** Effective reach from the fighter centre (mm) incl. forward motion. */
  reach: number;
  startup: number;
  onBlock: number;
  level: HitDef['level'] | 'throw';
  damage: number;
  /** Input script (absolute frames) for the given facing. */
  input: number[];
  launcher: boolean;
  homing: boolean;
  low: boolean;
  safe: boolean;      // onBlock >= -9
  fast: boolean;      // startup <= 12
  powerCrush: boolean;
  isThrow: boolean;
  breakButton: 1 | 2 | 12 | 0;
}

/**
 * Per-character knowledge derived from the move data: categorised moves with
 * reach and frame data so the AI can reason about punishes, pokes and mix-ups.
 */
export class Playbook {
  readonly all: PlayMove[] = [];
  readonly pokes: PlayMove[] = [];
  readonly mids: PlayMove[] = [];
  readonly lows: PlayMove[] = [];
  readonly launchers: PlayMove[] = [];
  readonly homing: PlayMove[] = [];
  readonly throws: PlayMove[] = [];
  readonly powerCrush: PlayMove[] = [];
  readonly punishers: PlayMove[] = []; // sorted by startup
  readonly whiffPunishers: PlayMove[] = []; // launchers / big damage with reach
  readonly groundHits: PlayMove[] = [];
  readonly fastestStartup: number;

  constructor(rt: CharacterRuntime, facingRight: boolean) {
    rt.moves.forEach((m, idx) => {
      if (m.cmd !== undefined && m.cmd !== m.input) return;
      const conds = m.conditions ?? ['standing'];
      if (!conds.includes('standing')) return;
      const input = notationToFrames(m.input, facingRight);
      if (!input) return;
      // frames of motion input before the final button lands (f,f = 2, cd = 5)
      const delay = input.length - 2;
      const motion = m.motion?.reduce((a, r) => a + r.forward * (r.frames[1] - r.frames[0] + 1), 0) ?? 0;
      if (m.throw) {
        const pm: PlayMove = { idx, move: m, reach: m.throw.range + Math.max(0, motion), startup: m.throw.grabFrame + delay, onBlock: 0, level: 'throw', damage: m.throw.damage, input, launcher: false, homing: false, low: false, safe: true, fast: m.throw.grabFrame + delay <= 12, powerCrush: false, isThrow: true, breakButton: m.throw.breakButton };
        this.all.push(pm); this.throws.push(pm);
        return;
      }
      const h = m.hits[0];
      if (!h) return;
      const caps = h.track?.[0]?.capsules ?? h.capsules;
      const reach = Math.max(...caps.map((c) => Math.max(c.az, c.bz) + c.r)) + Math.max(0, motion);
      const launcher = h.reaction.includes('launch') || h.reaction === 'spinLaunch';
      const pm: PlayMove = {
        idx, move: m, reach, startup: h.frames[0] + delay, onBlock: h.onBlock, level: h.level, damage: m.hits.reduce((a, x) => a + x.damage, 0), input,
        launcher, homing: m.properties?.includes('homing') ?? false, low: h.level === 'low', safe: h.onBlock >= -9, fast: h.frames[0] + delay <= 12,
        powerCrush: m.armour !== undefined, isThrow: false, breakButton: 0,
      };
      this.all.push(pm);
      if (launcher) this.launchers.push(pm);
      else if (pm.low) this.lows.push(pm);
      else if (h.level === 'mid' || h.level === 'smid') { if (pm.fast && pm.safe) this.pokes.push(pm); else this.mids.push(pm); }
      else if (h.level === 'high' && pm.fast && pm.safe) this.pokes.push(pm);
      if (pm.homing) this.homing.push(pm);
      if (pm.powerCrush) this.powerCrush.push(pm);
      if (m.properties?.includes('hitsGrounded') || pm.low) this.groundHits.push(pm);
    });
    this.punishers = [...this.all].filter((p) => !p.isThrow && p.level !== 'unblockable').sort((a, b) => a.startup - b.startup || b.damage - a.damage);
    this.whiffPunishers = [...this.launchers, ...this.mids.filter((m) => m.damage >= 18)].sort((a, b) => b.reach - a.reach);
    this.fastestStartup = this.punishers[0]?.startup ?? 10;
  }

  /** Best punisher that starts up within `frames` and reaches `dist`. Prefers launchers when the window allows. */
  punisher(frames: number, dist: number): PlayMove | null {
    const ok = this.punishers.filter((p) => p.startup <= frames && p.reach + 250 >= dist);
    if (ok.length === 0) return null;
    const launcher = ok.find((p) => p.launcher);
    return launcher ?? ok.sort((a, b) => b.damage - a.damage)[0] ?? null;
  }

  /** Best whiff punisher that reaches `dist`: a launcher when one reaches, else the biggest hit. */
  whiffPunisher(dist: number): PlayMove | null {
    const ok = this.inReach(this.whiffPunishers, dist);
    return ok.find((p) => p.launcher) ?? ok.sort((a, b) => b.damage - a.damage)[0] ?? null;
  }

  inReach(list: PlayMove[], dist: number, slack = 250): PlayMove[] {
    return list.filter((p) => p.reach + slack >= dist);
  }
}
