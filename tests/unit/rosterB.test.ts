import { describe, expect, it } from 'vitest';
import { validateRoster } from '@/sim/validate';
import { MatchSim } from '@/sim/match';
import { CharacterRuntime } from '@/sim/character';
import type { CharacterDef } from '@/sim/types';
import { frameFromNumpad, IN_B1, IN_B2, IN_B3 } from '@/input/InputFrame';
import { EvType } from '@/sim/events';
import { FState } from '@/sim/fighterState';
import { JAEHYUN } from '@/data/characters/jaehyun';
import { GOLEM } from '@/data/characters/golem';
import { RICARDO } from '@/data/characters/ricardo';
import { SERAPHINE } from '@/data/characters/seraphine';

const ROSTER: CharacterDef[] = [JAEHYUN, GOLEM, RICARDO, SERAPHINE];

function sim(def: CharacterDef, opts: Partial<ConstructorParameters<typeof MatchSim>[1]> = {}): MatchSim {
  return new MatchSim([def, def], { training: true, startDistance: 1000, ...opts });
}
function run(s: MatchSim, n: number, p1: (f: number) => number, p2: (f: number) => number = () => P2(5)): EvType[] {
  const evs: EvType[] = [];
  for (let i = 0; i < n; i++) {
    s.step([p1(i), p2(i)]);
    for (const e of s.events.items) evs.push(e.type);
  }
  return evs;
}
const P1 = (dir: number, b = 0): number => frameFromNumpad(dir, b, true);
const P2 = (dir: number, b = 0): number => frameFromNumpad(dir, b, false);
const tapOn = (frame: number, dir: number, b: number, mk: typeof P1) => (f: number): number => (f === frame ? mk(dir, b) : mk(5));
const moveId = (s: MatchSim, def: CharacterDef, side: 0 | 1): string => def.moves[s.fighters[side].moveIdx]?.id ?? '';

describe('roster B data (jaehyun, golem, ricardo, seraphine)', () => {
  for (const def of ROSTER) {
    it(`${def.id} passes validateRoster`, () => {
      const errors = validateRoster(def);
      expect(errors, errors.join('\n')).toEqual([]);
      expect(def.moves.length).toBeGreaterThanOrEqual(60);
      expect(def.moves.length).toBeLessThanOrEqual(100);
      expect(def.moves.every((m) => m.anim !== undefined)).toBe(true);
      expect(def.stances?.[0]).toBe('default');
      expect(new CharacterRuntime(def).interpreter.size).toBeGreaterThan(20);
    });
    it(`${def.id}: jab hits an idle opponent and 1+3 throws`, () => {
      const s = sim(def);
      const jab = def.moves.find((m) => m.id === 'jab');
      expect(jab).toBeDefined();
      const evs = run(s, 14, tapOn(0, 5, IN_B1, P1));
      expect(evs).toContain(EvType.Hit);
      expect(s.fighters[1].hp).toBe(170 - (jab?.hits[0]?.damage ?? 0));
      expect(s.fighters[1].state).toBe(FState.Hitstun);
      const t = sim(def);
      const dmg = def.moves.find((m) => m.id === 'throw13')?.throw?.damage ?? 0;
      const evs2 = run(t, 90, tapOn(0, 5, IN_B1 | IN_B3, P1));
      expect(evs2).toContain(EvType.Throw);
      expect(t.fighters[1].hp).toBe(170 - dmg);
    });
  }

  it('jaehyun: f+3 ends in the rff flamingo stance and chains into a flamingo kick', () => {
    const s = sim(JAEHYUN);
    run(s, 40, tapOn(0, 6, IN_B3, P1));
    expect(s.fighters[0].stanceIdx).toBe(JAEHYUN.stances?.indexOf('rff'));
    const c = sim(JAEHYUN);
    run(c, 34, (f) => (f === 0 ? P1(6, IN_B3) : f === 19 ? P1(5, IN_B3) : P1(5)));
    expect(moveId(c, JAEHYUN, 0)).toBe('rff3');
  });

  it('golem: Earthbreaker cannot be blocked and has a slow telegraph', () => {
    const ub = GOLEM.moves.filter((m) => m.hits.some((h) => h.level === 'unblockable'));
    expect(ub.length).toBeGreaterThanOrEqual(2);
    for (const m of ub) expect(m.hits[0]?.frames[0]).toBeGreaterThanOrEqual(40);
    expect(GOLEM.stats.weight).toBe(150);
    const s = sim(GOLEM);
    const evs = run(s, 60, tapOn(0, 6, IN_B1 | IN_B2, P1), (f) => (f >= 30 ? P2(4) : P2(5)));
    expect(evs).toContain(EvType.Hit);
    expect(evs).not.toContain(EvType.Block);
    expect(s.fighters[1].hp).toBe(170 - 40);
  });

  it('ricardo: f+2 enters iron and the iron tree is reachable from it', () => {
    const s = sim(RICARDO);
    run(s, 40, tapOn(0, 6, IN_B2, P1));
    expect(s.fighters[0].stanceIdx).toBe(RICARDO.stances?.indexOf('iron'));
    const c = sim(RICARDO);
    run(c, 24, (f) => (f === 0 ? P1(6, IN_B2) : f === 18 ? P1(5, IN_B1) : P1(5)));
    expect(moveId(c, RICARDO, 0)).toBe('iron1');
    for (const st of ['iron', 'silk', 'storm']) expect(RICARDO.moves.filter((m) => m.stance === st).length).toBeGreaterThanOrEqual(6);
  });

  it('seraphine: Mirror Veil parries a jab and the Shadow Cross crushes highs and lows', () => {
    const s = sim(SERAPHINE);
    const evs = run(s, 30, tapOn(1, 5, IN_B1, P1), (f) => (f === 0 ? P2(4, IN_B1 | IN_B3) : P2(5)));
    expect(evs).toContain(EvType.Parry);
    expect(s.fighters[0].state).toBe(FState.Stagger);
    const ss = SERAPHINE.moves.find((m) => m.id === 'ss34');
    expect(ss?.conditions).toContain('ss');
    expect(ss?.crush?.map((c) => c.level).sort()).toEqual(['high', 'low']);
    expect((ss?.motion?.[0]?.forward ?? 0) * ((ss?.motion?.[0]?.frames[1] ?? 0) - (ss?.motion?.[0]?.frames[0] ?? 0) + 1)).toBeGreaterThan(1000);
  });
});
