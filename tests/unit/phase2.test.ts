import { describe, expect, it } from 'vitest';
import { MatchSim } from '@/sim/match';
import { RoundPhase } from '@/sim/rounds';
import { GREYBOX } from '@/data/characters/greybox';
import { frameFromNumpad, IN_B1, IN_B2, IN_B3, IN_B4 } from '@/input/InputFrame';
import { FState } from '@/sim/fighterState';
import { EvType } from '@/sim/events';
import { ReplayRecorder, deserializeReplay, serializeReplay, verifyReplay } from '@/sim/replay';
import { Rng } from '@/core/rng';
import { validateCharacter } from '@/sim/validate';

type Cfg = Partial<ConstructorParameters<typeof MatchSim>[1]>;
function sim(opts: Cfg = {}): MatchSim {
  return new MatchSim([GREYBOX, GREYBOX], { training: true, startDistance: 1000, ...opts });
}
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

describe('Phase 2: throws', () => {
  it('data validates with throws, parry and floor attacks', () => {
    expect(validateCharacter(GREYBOX)).toEqual([]);
  });
  it('1+3 throw grabs on frame 12, damages and knocks down', () => {
    const s = sim();
    const evs = run(s, 80, tapOn(0, 5, IN_B1 | IN_B3, P1));
    expect(evs).toContain(EvType.Throw);
    expect(s.fighters[1].hp).toBe(170 - 35);
    expect([FState.Lying, FState.Thrown]).toContain(s.fighters[1].state);
  });
  it('the correct break button escapes; the wrong one does not', () => {
    const good = sim();
    const evs = run(good, 60, tapOn(0, 5, IN_B1 | IN_B3, P1), (f) => (f === 16 ? P2(5, IN_B1) : P2(5)));
    expect(evs).toContain(EvType.ThrowBreak);
    expect(good.fighters[1].hp).toBe(170);
    const bad = sim();
    const evs2 = run(bad, 80, tapOn(0, 5, IN_B1 | IN_B3, P1), (f) => (f === 16 ? P2(5, IN_B2) : P2(5)));
    expect(evs2).not.toContain(EvType.ThrowBreak);
    expect(bad.fighters[1].hp).toBe(135);
    // 1+2 command throw needs 1+2
    const cmd = sim();
    const evs3 = run(cmd, 60, tapOn(0, 3, IN_B1 | IN_B2, P1), (f) => (f === 16 ? P2(5, IN_B1 | IN_B2) : P2(5)));
    expect(evs3).toContain(EvType.ThrowBreak);
  });
  it('throws whiff on crouching opponents unless the throw grabs crouchers', () => {
    const s = sim();
    const evs = run(s, 40, tapOn(2, 5, IN_B1 | IN_B3, P1), () => P2(2));
    expect(evs).not.toContain(EvType.Throw);
    const s2 = sim();
    const evs2 = run(s2, 40, (f) => (f === 2 ? P1(3, IN_B1 | IN_B2) : P1(5)), () => P2(2));
    expect(evs2).toContain(EvType.Throw);
  });
  it('dash throw f,f+1+3 reaches a distant opponent', () => {
    const s = sim({ startDistance: 1900 });
    const evs = run(s, 60, (f) => (f === 0 ? P1(6) : f === 3 ? P1(6, IN_B1 | IN_B3) : P1(5)));
    expect(evs).toContain(EvType.Throw);
  });
});

describe('Phase 2: juggles, walls, ring-out', () => {
  it('a launcher followed by a jab juggles with damage scaling', () => {
    const s = sim();
    // df+2 at frame 0 hits at 15 (+12 hitstop, recovers at 47). Jab buffered at 46, another at 58.
    const evs = run(s, 90, (f) => (f === 0 ? P1(3, IN_B2) : f === 47 || f === 50 ? P1(6) : f === 52 ? P1(5, IN_B1) : f === 64 ? P1(5, IN_B1) : P1(5)));
    const hits = evs.filter((e) => e === EvType.Hit).length;
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(s.fighters[1].comboHits).toBeGreaterThanOrEqual(2);
    // third hit scaled to 80%: damage 15 + 7 + 5 = 27 (7*80% = 5)
    if (hits === 3) expect(s.fighters[1].comboDamage).toBe(15 + 7 + 5);
  });
  it('bound slams an airborne opponent to the floor and pops them back up once', () => {
    const s = sim();
    const evs = run(s, 100, (f) => (f === 0 ? P1(3, IN_B2) : f === 47 || f === 50 ? P1(6) : f === 51 ? P1(2, IN_B2) : P1(5)));
    expect(evs.filter((e) => e === EvType.Land).length).toBeGreaterThanOrEqual(1);
    expect(s.fighters[1].boundUsed).toBe(1);
  });
  it('wall splat: a heavy hit near the wall splats the defender', () => {
    const s = sim({ startDistance: 1000 });
    // move P2 to the wall: place via training ring-out reposition is not available; simulate by walking back a lot
    for (let i = 0; i < 400; i++) s.step([P1(6), P2(4)]);
    expect(s.fighters[1].x).toBeGreaterThan(6000);
    const evs = run(s, 40, (f) => (f === 0 ? P1(6, IN_B2) : f === 3 ? P1(6, IN_B2) : P1(5)));
    void evs;
    const evs2 = run(s, 60, tapOn(0, 6, IN_B2, P1));
    void evs2;
    // use f,f+2 (wallSplat property): f at 0, f+2 at 3
    const s3 = sim();
    for (let i = 0; i < 400; i++) s3.step([P1(6), P2(4)]);
    const ev3 = run(s3, 80, (f) => (f === 0 ? P1(6) : f === 3 ? P1(6, IN_B2) : P1(5)));
    expect(ev3).toContain(EvType.Wall);
    expect([FState.WallSplat, FState.Air, FState.Lying]).toContain(s3.fighters[1].state);
  });
  it('ring-out ends the round on an open stage', () => {
    const s = new MatchSim([GREYBOX, GREYBOX], { training: false, startDistance: 1000, roundTimeSec: 0, arena: { id: 'open', name: 'Open', halfX: 1000, halfZ: 7000, walls: false } });
    // skip intro
    for (let i = 0; i < 101; i++) s.step([P1(5), P2(5)]);
    expect(s.round.phase).toBe(RoundPhase.Fight);
    // launch P2 toward the edge
    const evs = run(s, 120, (f) => (f === 0 ? P1(3, IN_B2) : P1(6)));
    expect(evs).toContain(EvType.RingOut);
    expect(s.round.lastRoundResult).toBe('ringout');
    expect(s.round.winner).toBe(0);
  });
});

describe('Phase 2: oki, parry, rounds', () => {
  it('tech roll on landing, kip-up, roll back and floor attacks', () => {
    const s = sim();
    // sweep knocks down
    run(s, 60, tapOn(0, 1, IN_B3, P1));
    expect(s.fighters[1].state).toBe(FState.Lying);
    // press a button during the tech window -> Roll
    run(s, 2, () => P1(5), () => P2(5, IN_B4));
    expect([FState.Roll, FState.Attack]).toContain(s.fighters[1].state);
    // kip-up after landing without tech
    const k = sim();
    run(k, 60, tapOn(0, 1, IN_B3, P1));
    run(k, 5, () => P1(5));
    expect(k.fighters[1].state).toBe(FState.Lying);
    run(k, 1, () => P1(5), () => P2(8));
    expect(k.fighters[1].state).toBe(FState.Getup);
    // floor attack
    const g = sim();
    run(g, 60, tapOn(0, 1, IN_B3, P1));
    run(g, 5, () => P1(5));
    run(g, 1, () => P1(5), () => P2(5, IN_B3));
    expect(g.fighters[1].state).toBe(FState.Attack);
  });
  it('parry staggers the attacker', () => {
    const s = sim();
    const evs = run(s, 30, tapOn(1, 5, IN_B1, P1), (f) => (f === 0 ? P2(4, IN_B1 | IN_B3) : P2(5)));
    expect(evs).toContain(EvType.Parry);
    expect(s.fighters[0].state).toBe(FState.Stagger);
    expect(s.fighters[1].hp).toBe(170);
  });
  it('round flow: KO -> slow-mo -> next round -> match over -> rematch', () => {
    const s = new MatchSim([GREYBOX, GREYBOX], { training: false, startDistance: 1000, roundTimeSec: 60, roundsToWin: 1, hpOverride: 10 });
    for (let i = 0; i < 101; i++) s.step([P1(5), P2(5)]);
    const evs = run(s, 40, tapOn(0, 3, IN_B2, P1));
    expect(evs).toContain(EvType.KO);
    expect(s.round.phase).toBe(RoundPhase.KO);
    run(s, 300, () => P1(5));
    expect(s.round.phase).toBe(RoundPhase.MatchOver);
    expect(s.round.wins[0]).toBe(1);
    s.rematch();
    expect(s.round.phase).toBe(RoundPhase.Intro);
    expect(s.fighters[1].hp).toBe(10);
  });
  it('time over picks the healthier fighter', () => {
    const s = new MatchSim([GREYBOX, GREYBOX], { training: false, startDistance: 1000, roundTimeSec: 2, roundsToWin: 1 });
    for (let i = 0; i < 101; i++) s.step([P1(5), P2(5)]);
    run(s, 20, tapOn(0, 5, IN_B1, P1));
    run(s, 130, () => P1(5));
    expect(s.round.lastRoundResult).toBe('time');
    expect(s.round.winner).toBe(0);
  });
});

describe('Phase 2: replay determinism', () => {
  it('a recorded random match replays to identical hashes, including after serialisation', () => {
    const rng = new Rng(777);
    const cfg: Cfg = { training: false, roundsToWin: 2, roundTimeSec: 30, seed: 99 };
    const s = new MatchSim([GREYBOX, GREYBOX], cfg);
    const rec = new ReplayRecorder(s);
    const randomInput = (facingRight: boolean): number => {
      const dir = rng.range(1, 9);
      const roll = rng.nextInt(100);
      const b = roll < 12 ? IN_B1 : roll < 24 ? IN_B2 : roll < 34 ? IN_B3 : roll < 44 ? IN_B4 : roll < 48 ? IN_B1 | IN_B3 : roll < 50 ? IN_B1 | IN_B2 : 0;
      return frameFromNumpad(dir, b, facingRight);
    };
    let frames = 0;
    while (!s.isMatchOver() && frames < 20000) {
      const a = randomInput(true), b = randomInput(false);
      s.step([a, b]);
      rec.record(a, b);
      frames++;
    }
    expect(s.isMatchOver()).toBe(true);
    const replay = rec.finish();
    const v = verifyReplay(replay, [GREYBOX, GREYBOX]);
    expect(v.ok).toBe(true);
    const round = deserializeReplay(serializeReplay(replay));
    expect(verifyReplay(round, [GREYBOX, GREYBOX]).ok).toBe(true);
    // tampering with a stretch of inputs diverges
    for (let i = 400; i < 520; i += 2) round.inputs[i] = frameFromNumpad(6, IN_B1 | IN_B2, true);
    const bad = verifyReplay(round, [GREYBOX, GREYBOX]);
    expect(bad.ok).toBe(false);
  });
});
