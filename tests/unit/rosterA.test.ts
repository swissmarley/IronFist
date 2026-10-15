import { describe, expect, it } from 'vitest';
import { validateRoster } from '@/sim/validate';
import { MatchSim } from '@/sim/match';
import { FState } from '@/sim/fighterState';
import { EvType } from '@/sim/events';
import { frameFromNumpad, IN_B1, IN_B2, IN_B3, IN_B4 } from '@/input/InputFrame';
import type { CharacterDef } from '@/sim/types';
import { KAEDE } from '@/data/characters/kaede';
import { BORIS } from '@/data/characters/boris';
import { LUIZ } from '@/data/characters/luiz';
import { MEILING } from '@/data/characters/meiling';

const ROSTER: CharacterDef[] = [KAEDE, BORIS, LUIZ, MEILING];
const P1 = (dir: number, b = 0): number => frameFromNumpad(dir, b, true);
const P2 = (dir: number, b = 0): number => frameFromNumpad(dir, b, false);

function sim(def: CharacterDef, startDistance = 1000): MatchSim {
  return new MatchSim([def, def], { training: true, startDistance });
}
/** Run n frames; p1 gives P1's input per frame, P2 stands idle. */
function run(s: MatchSim, n: number, p1: (f: number) => number): EvType[] {
  const evs: EvType[] = [];
  for (let i = 0; i < n; i++) {
    s.step([p1(i), P2(5)]);
    for (const e of s.events.items) evs.push(e.type);
  }
  return evs;
}
const tap = (frame: number, dir: number, b: number) => (f: number): number => (f === frame ? P1(dir, b) : P1(5));
const moveIdx = (def: CharacterDef, id: string): number => def.moves.findIndex((m) => m.id === id);
const jabDamage = (def: CharacterDef): number => def.moves.find((m) => m.id === 'jab')?.hits[0]?.damage ?? -1;

describe('roster A: Kaede, Boris, Luiz, Mei-Ling', () => {
  for (const def of ROSTER) {
    describe(def.id, () => {
      it('passes validateRoster', () => {
        const errors = validateRoster(def);
        expect(errors, errors.join('\n')).toEqual([]);
      });
      it('has 60-100 moves and at least 30 root moves', () => {
        expect(def.moves.length).toBeGreaterThanOrEqual(60);
        expect(def.moves.length).toBeLessThanOrEqual(100);
        expect(def.moves.filter((m) => m.cmd === undefined || m.cmd === m.input).length).toBeGreaterThanOrEqual(30);
      });
      it('has an anim spec on every move and a look', () => {
        for (const m of def.moves) expect(m.anim, m.id).toBeDefined();
        expect(def.look).toBeDefined();
        expect(def.stances?.[0]).toBe('default');
      });
      it('jab hits an idle opponent at 1000 mm', () => {
        const s = sim(def);
        const evs = run(s, 14, tap(0, 5, IN_B1));
        expect(evs).toContain(EvType.Hit);
        expect(s.fighters[1].hp).toBe(def.stats.hp - jabDamage(def));
        expect(s.fighters[1].state).toBe(FState.Hitstun);
      });
      it('1+3 throw grabs an idle opponent', () => {
        const s = sim(def);
        const evs = run(s, 20, tap(0, 5, IN_B1 | IN_B3));
        expect(evs).toContain(EvType.Throw);
        expect(s.fighters[1].state).toBe(FState.Thrown);
      });
    });
  }

  it('Kaede and Boris d/f+2 launch; Luiz and Mei-Ling d/f+3 launch', () => {
    for (const [def, b] of [[KAEDE, IN_B2], [BORIS, IN_B2], [LUIZ, IN_B3], [MEILING, IN_B3]] as const) {
      const s = sim(def);
      const evs = run(s, 40, tap(0, 3, b));
      expect(evs, def.id).toContain(EvType.Launch);
      expect(s.fighters[1].state, def.id).toBe(FState.Air);
    }
  });

  it('Kaede ten-hit string chains the first three links', () => {
    const s = sim(KAEDE);
    const evs = run(s, 70, (f) => (f === 0 ? P1(6) : f === 3 ? P1(6, IN_B1) : f === 17 ? P1(5, IN_B2) : f === 29 ? P1(5, IN_B1) : P1(5)));
    expect(evs.filter((e) => e === EvType.Hit).length).toBeGreaterThanOrEqual(3);
  });

  it('Boris chain throw continues into the mount link with a new break button', () => {
    const s = sim(BORIS);
    const mount = moveIdx(BORIS, 'tackle_mount');
    expect(mount).toBeGreaterThan(0);
    // f,f+1+2 tackle, then tap 3+4 repeatedly inside the chain window (throw frames 18-40)
    const evs = run(s, 80, (f) => {
      if (f === 0) return P1(6);
      if (f === 3) return P1(6, IN_B1 | IN_B2);
      if (f >= 44 && f <= 60 && f % 4 === 0) return P1(5, IN_B3 | IN_B4);
      return P1(5);
    });
    expect(evs).toContain(EvType.Throw);
    expect(s.fighters[0].state).toBe(FState.Throw);
    expect(s.fighters[0].throwMove).toBe(mount);
  });

  it('Mei-Ling f+3 ends in flamingo, and 3 from flamingo is the stance move', () => {
    const s = sim(MEILING, 1400);
    run(s, 45, tap(0, 6, IN_B3));
    expect(s.fighters[0].state).toBe(FState.Idle);
    expect(s.fighters[0].stanceIdx).toBe(MEILING.stances!.indexOf('flamingo'));
    run(s, 4, tap(0, 5, IN_B3));
    expect(s.fighters[0].moveIdx).toBe(moveIdx(MEILING, 'fl_3'));
  });

  it('Luiz 3+4 ends in handstand, and 4 from handstand launches', () => {
    const s = sim(LUIZ);
    run(s, 50, tap(0, 5, IN_B3 | IN_B4));
    expect(s.fighters[0].state).toBe(FState.Idle);
    expect(s.fighters[0].stanceIdx).toBe(LUIZ.stances!.indexOf('handstand'));
    const evs = run(s, 40, tap(0, 5, IN_B4));
    expect(s.fighters[1].lastHitMove).toBe(moveIdx(LUIZ, 'hs_4'));
    expect(evs).toContain(EvType.Launch);
    expect(s.fighters[1].state).toBe(FState.Air);
  });
});
