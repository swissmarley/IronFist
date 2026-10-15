import { describe, expect, it } from 'vitest';
import { MatchSim } from '@/sim/match';
import { GREYBOX } from '@/data/characters/greybox';
import { frameFromNumpad, IN_B1, IN_B2, IN_B3, IN_B4 } from '@/input/InputFrame';
import { FState } from '@/sim/fighterState';
import { EvType } from '@/sim/events';

function sim(opts: Partial<ConstructorParameters<typeof MatchSim>[1]> = {}): MatchSim {
  return new MatchSim([GREYBOX, GREYBOX], { training: true, startDistance: 1100, ...opts });
}
/** Run n frames with P1/P2 absolute inputs (functions of frame). */
function run(s: MatchSim, n: number, p1: (f: number) => number, p2: (f: number) => number = () => 0): EvType[] {
  const evs: EvType[] = [];
  for (let i = 0; i < n; i++) {
    s.step([p1(i), p2(i)]);
    for (const e of s.events.items) evs.push(e.type);
  }
  return evs;
}
const P1 = (dir: number, b = 0) => frameFromNumpad(dir, b, true);
const P2 = (dir: number, b = 0) => frameFromNumpad(dir, b, false);
const tapOn = (frame: number, dir: number, b: number, mk: typeof P1) => (f: number) => (f === frame ? mk(dir, b) : mk(dir));

describe('MatchSim combat core', () => {
  it('jab hits an idle opponent on frame 10 and applies hit-stop and stun', () => {
    const s = sim();
    const evs = run(s, 12, tapOn(0, 5, IN_B1, P1));
    expect(evs).toContain(EvType.Hit);
    const [a, b] = s.fighters;
    expect(b.hp).toBe(170 - 7);
    expect(b.state).toBe(FState.Hitstun);
    expect(a.hitstop).toBeGreaterThan(0);
    // hit frame = frame 10 after the press frame 0
    expect(a.moveFrame).toBe(10);
  });
  it('holding back blocks a high and a mid, but a low connects', () => {
    const s = sim();
    run(s, 20, tapOn(0, 5, IN_B1, P1), () => P2(4));
    expect(s.fighters[1].hp).toBe(170);
    expect(s.fighters[1].state).toBe(FState.Blockstun);
    const s2 = sim();
    run(s2, 30, tapOn(0, 2, IN_B4, P1), () => P2(4));
    expect(s2.fighters[1].hp).toBe(160);
  });
  it('crouch guard blocks lows and highs whiff over a croucher, but mids hit', () => {
    const s = sim();
    run(s, 30, tapOn(5, 2, IN_B4, P1), () => P2(1));
    expect(s.fighters[1].hp).toBe(170);
    const s2 = sim();
    const evs = run(s2, 30, tapOn(5, 5, IN_B1, P1), () => P2(1));
    expect(evs).not.toContain(EvType.Hit);
    expect(s2.fighters[1].hp).toBe(170);
    const s3 = sim();
    run(s3, 30, tapOn(5, 6, IN_B2, P1), () => P2(1));
    expect(s3.fighters[1].hp).toBe(170 - 14);
  });
  it('frame advantage matches the data: +1 on block jab leaves the attacker free first', () => {
    const s = sim();
    run(s, 11, tapOn(0, 5, IN_B1, P1), () => P2(4));
    // on frame 10 the hit lands: attacker remaining = 20-10 = 10 frames, blockstun = 10 + 1 = 11
    expect(s.fighters[1].stunFrames).toBe(11);
    // after hit-stop both tick: the attacker is free 1 frame before the defender
    let attackerFree = -1, defenderFree = -1;
    for (let f = 11; f < 60; f++) {
      s.step([P1(5), P2(4)]);
      if (attackerFree < 0 && s.fighters[0].state === FState.Idle) attackerFree = f;
      if (defenderFree < 0 && s.fighters[1].state !== FState.Blockstun) defenderFree = f;
    }
    expect(defenderFree - attackerFree).toBe(1);
  });
  it('1,2 string chains and df+2 launches into a juggle state', () => {
    const s = sim();
    const evs = run(s, 40, (f) => (f === 0 ? P1(5, IN_B1) : f === 9 ? P1(5, IN_B2) : P1(5)));
    expect(evs.filter((e) => e === EvType.Hit).length).toBe(2);
    expect(s.fighters[1].hp).toBe(170 - 7 - 10);
    const s2 = sim();
    const evs2 = run(s2, 30, tapOn(0, 3, IN_B2, P1));
    expect(evs2).toContain(EvType.Launch);
    expect(s2.fighters[1].state).toBe(FState.Air);
    expect(s2.fighters[1].y).toBeGreaterThan(0);
  });
  it('a sidestep evades a linear jab but a homing move connects', () => {
    const s = sim();
    // P2 taps up (sidestep in) on frame 0-1, P1 jabs on frame 2
    const evs = run(s, 20, (f) => (f === 2 ? P1(5, IN_B1) : P1(5)), (f) => (f <= 1 ? P2(8) : P2(5)));
    expect(evs).not.toContain(EvType.Hit);
    expect(s.fighters[1].hp).toBe(170);
    const s2 = sim();
    const evs2 = run(s2, 40, (f) => (f === 2 ? P1(4, IN_B4) : P1(5)), (f) => (f <= 1 ? P2(8) : P2(5)));
    expect(evs2).toContain(EvType.Hit);
  });
  it('counter hit deals bonus damage', () => {
    const s = sim();
    // P2 starts a slow kick (4) at frame 0; P1 jabs at frame 1 -> hits P2 during startup
    run(s, 20, (f) => (f === 1 ? P1(5, IN_B1) : P1(5)), (f) => (f === 0 ? P2(5, IN_B4) : P2(5)));
    expect(s.fighters[1].hp).toBe(170 - Math.trunc((7 * 125) / 100));
  });
  it('dash f,f moves forward and backdash moves away', () => {
    const s = sim({ startDistance: 3000 });
    const x0 = s.fighters[0].x;
    run(s, 20, (f) => (f === 0 || f === 3 ? P1(6) : P1(5)));
    expect(s.fighters[0].x - x0).toBeGreaterThan(300);
    const s2 = sim({ startDistance: 3000 });
    const x1 = s2.fighters[0].x;
    run(s2, 20, (f) => (f === 0 || f === 3 ? P1(4) : P1(5)));
    expect(x1 - s2.fighters[0].x).toBeGreaterThan(250);
  });
  it('power crush armour absorbs a mid and the move still lands', () => {
    const s = sim();
    // P1 does b+1+2 (armour 6-18), P2 jabs at frame 4 -> hits around frame 14 (inside armour)
    const evs = run(s, 40, (f) => (f === 0 ? P1(4, IN_B1 | IN_B2) : P1(4)), (f) => (f === 4 ? P2(5, IN_B1) : P2(5)));
    expect(evs).toContain(EvType.Armour);
    expect(evs).toContain(EvType.Hit);
    expect(s.fighters[1].state).not.toBe(FState.Idle);
  });
  it('hop kick low-crushes a low kick', () => {
    const s = sim();
    const evs = run(s, 40, (f) => (f === 0 ? P1(9, IN_B4) : P1(5)), (f) => (f === 0 ? P2(2, IN_B4) : P2(2)));
    expect(evs).toContain(EvType.Whiff);
    expect(s.fighters[0].hp).toBe(170);
  });
  it('pushboxes keep fighters apart', () => {
    const s = sim({ startDistance: 400 });
    run(s, 5, () => P1(5));
    const [a, b] = s.fighters;
    expect(b.x - a.x).toBeGreaterThanOrEqual(680);
  });
  it('is deterministic: same input log gives the same hash', () => {
    const script = (f: number): number => (f % 17 === 0 ? P1(5, IN_B1) : f % 23 === 0 ? P1(3, IN_B2) : f % 31 === 0 ? P1(2, IN_B4) : f % 7 === 0 ? P1(6) : P1(5));
    const script2 = (f: number): number => (f % 13 === 0 ? P2(5, IN_B3) : f % 29 === 0 ? P2(9, IN_B4) : f % 5 === 0 ? P2(4) : P2(5));
    const a = sim({ seed: 42 }), b = sim({ seed: 42 });
    run(a, 1200, script, script2);
    run(b, 1200, script, script2);
    expect(a.hash()).toBe(b.hash());
    expect(a.fighters[0].hp + a.fighters[1].hp).toBeLessThan(340);
  });
});
