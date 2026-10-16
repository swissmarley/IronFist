import { describe, expect, it } from 'vitest';
import { MatchSim } from '@/sim/match';
import { getCharacter, CHARACTERS } from '@/data/characters';
import { Rng } from '@/core/rng';
import { RollbackSession, type RollbackStats } from '@/net/RollbackSession';
import { SimChannel, type ChannelConditions } from '@/net/SimChannel';
import { decodeMessage, encodeMessage, messageEpoch, MSG_HASH, MSG_INPUT, MSG_PING, type NetMessage } from '@/net/protocol';
import { IN_B1, IN_B2, IN_B3, IN_B4, IN_DOWN, IN_LEFT, IN_RIGHT, IN_UP } from '@/input/InputFrame';
import type { CharacterDef } from '@/sim/types';

const ROSTER = Object.values(CHARACTERS).filter((c) => c.id !== 'greybox');
const DEFS: [CharacterDef, CharacterDef] = [ROSTER[2] ?? getCharacter('greybox'), ROSTER[3] ?? getCharacter('greybox')];
const DIRS = [0, IN_LEFT, IN_RIGHT, IN_UP, IN_DOWN, IN_DOWN | IN_RIGHT, IN_DOWN | IN_LEFT];
const BTNS = [IN_B1, IN_B2, IN_B3, IN_B4, IN_B1 | IN_B2, IN_B1 | IN_B3];

function randomInput(rng: Rng, prev: number): number {
  const dir = rng.chance(85) ? prev & 0xf : rng.pick(DIRS);
  return dir | (rng.chance(15) ? rng.pick(BTNS) : 0);
}

const makeSim = (): MatchSim => new MatchSim(DEFS, { seed: 42, hpOverride: 60, roundsToWin: 3, roundTimeSec: 30, startDistance: 1300 });

interface PairResult {
  a: RollbackSession; b: RollbackSession; simA: MatchSim; simB: MatchSim; ticks: number;
  presentedInOrder: boolean; channel: { sent: number; dropped: number; duplicated: number };
  /** Confirmed inputs [P1, P2] per frame as seen by each peer. */
  logA: number[]; logB: number[];
}

/** Append the newly confirmed frames' inputs (the ring only keeps the recent ones). */
function record(s: RollbackSession, log: number[]): void {
  const io: [number, number] = [0, 0];
  for (let f = log.length / 2; f <= s.confirmedFrame; f++) { s.inputsAt(f, io); log.push(io[0], io[1]); }
}

/** Two peers over a seeded lossy channel; B boots late and its clock runs 1% slow. */
function runPair(cond: ChannelConditions, target = 2000, seed = 1, lateStart = 25): PairResult {
  const simA = makeSim(), simB = makeSim();
  const ab = new SimChannel<Uint8Array>(cond, seed * 10 + 1), ba = new SimChannel<Uint8Array>(cond, seed * 10 + 2);
  let now = 0;
  const a = new RollbackSession(simA, { localPlayer: 0 }, (m) => ab.send(encodeMessage(m), now));
  const b = new RollbackSession(simB, { localPlayer: 1 }, (m) => ba.send(encodeMessage(m), now));
  let presentedInOrder = true;
  const last = [-1, -1];
  a.onStepped = (f, resim) => { if (!resim) { if (f !== (last[0] as number) + 1) presentedInOrder = false; last[0] = f; } };
  b.onStepped = (f, resim) => { if (!resim) { if (f !== (last[1] as number) + 1) presentedInOrder = false; last[1] = f; } };
  const ra = new Rng(seed * 3 + 1), rb = new Rng(seed * 3 + 2);
  let ia = 0, ib = 0;
  const logA: number[] = [], logB: number[] = [];
  for (now = 0; now < target * 6; now++) {
    for (const m of ba.poll(now)) { const d = decodeMessage(m); if (d) a.receive(d); }
    for (const m of ab.poll(now)) { const d = decodeMessage(m); if (d) b.receive(d); }
    if (simA.frame < target) { ia = randomInput(ra, ia); a.tick(ia); } else a.pump();
    if (now >= lateStart && now % 100 !== 0) {
      if (simB.frame < target) { ib = randomInput(rb, ib); b.tick(ib); } else b.pump();
    }
    record(a, logA); record(b, logB);
    if (simA.frame >= target && simB.frame >= target && a.confirmedFrame >= target - 1 && b.confirmedFrame >= target - 1) break;
  }
  return { a, b, simA, simB, ticks: now, presentedInOrder, logA, logB, channel: { sent: ab.sent + ba.sent, dropped: ab.dropped + ba.dropped, duplicated: ab.duplicated + ba.duplicated } };
}

function summary(s: RollbackStats): string {
  return `rollbacks ${s.rollbacks}, resim frames ${s.rolledBackFrames}, max depth ${s.maxRollbackDepth}, mispredicted ${s.mispredictions}, ` +
    `window stalls ${s.windowStalls}, sync stalls ${s.syncStalls}, rtt ${s.rttTicks}t, checkpoints ${s.checkpointsCompared}`;
}

describe('net protocol', () => {
  it('round-trips every message type and rejects garbage', () => {
    const msgs: NetMessage[] = [
      { type: MSG_INPUT, seq: 4000000000, ack: 77, frame: 80, adv: -3, start: 70, inputs: [0, 1, 0x3ff, 0xffff] },
      { type: MSG_PING, tick: 123456 },
      { type: MSG_HASH, frame: 600, hash: 0xdeadbeef, gen: 3 },
    ];
    for (const m of msgs) expect(decodeMessage(encodeMessage(m, 7))).toEqual(m);
    // byte 1 carries the match epoch so a rematch can drop the previous match's late packets
    for (const m of msgs) expect(messageEpoch(encodeMessage(m, 7))).toBe(7);
    expect(messageEpoch(encodeMessage(msgs[1] as NetMessage))).toBe(0);
    expect(decodeMessage(new Uint8Array([9, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(decodeMessage(new Uint8Array([1, 5, 0, 0]))).toBeNull();
    expect(encodeMessage(msgs[0] as NetMessage).byteLength).toBe(20 + 8);
  });
});

describe('RollbackSession over a simulated channel', () => {
  const cases: [string, ChannelConditions][] = [
    ['lan (1±1 ticks, 2% loss)', { latency: 1, jitter: 1, lossPct: 2, dupPct: 1 }],
    ['wifi (4±4 ticks, 8% loss, 3% dup)', { latency: 4, jitter: 4, lossPct: 8, dupPct: 3 }],
    ['bad (7±6 ticks, 15% loss, 5% dup)', { latency: 7, jitter: 6, lossPct: 15, dupPct: 5 }],
  ];
  for (const [name, cond] of cases) {
    it(`2000 frames stay in sync: ${name}`, () => {
      const r = runPair(cond);
      const { a, b, simA, simB } = r;
      expect(simA.frame).toBe(2000);
      expect(simB.frame).toBe(2000);
      expect(a.desync).toBeNull();
      expect(b.desync).toBeNull();
      expect(simA.hash()).toBe(simB.hash());
      expect(a.stats.checkpointsCompared).toBeGreaterThanOrEqual(30);
      expect(r.presentedInOrder).toBe(true);
      // the confirmed input log replayed straight reproduces the same final state
      const ref = makeSim();
      expect(r.logA.length).toBe(4000);
      expect(r.logB).toEqual(r.logA);
      for (let f = 0; f < 2000; f++) {
        ref.step([r.logA[2 * f] as number, r.logA[2 * f + 1] as number]);
        if (f % 60 === 59) expect(a.checkpointHash(f + 1) ?? ref.hash()).toBe(ref.hash());
      }
      expect(ref.hash()).toBe(simA.hash());
      expect(a.stats.maxRollbackDepth).toBeLessThanOrEqual(8);
      expect(b.stats.maxRollbackDepth).toBeLessThanOrEqual(8);
      // time sync keeps the late, slow peer within a few frames (ticks ≈ frames + stalls)
      expect(r.ticks).toBeLessThan(2000 + 25 + 60 + 400);
      console.info(`[rollback] ${name}: ${r.ticks} ticks; channel sent ${r.channel.sent} dropped ${r.channel.dropped} dup ${r.channel.duplicated}\n  A: ${summary(a.stats)}\n  B: ${summary(b.stats)}`);
    });
  }

  it('rolls back when predictions are wrong and never exceeds the window', () => {
    const { a, b } = runPair({ latency: 5, jitter: 3, lossPct: 5, dupPct: 0 }, 1200, 7);
    expect(a.stats.rollbacks + b.stats.rollbacks).toBeGreaterThan(20);
    expect(a.stats.mispredictions).toBeGreaterThan(0);
    expect(Math.max(a.stats.maxRollbackDepth, b.stats.maxRollbackDepth)).toBeLessThanOrEqual(8);
  });

  it('flags a desync when the peers disagree', () => {
    const simA = makeSim(), simB = makeSim();
    simB.fighters[1].hp -= 1; // corrupt one side
    const ab = new SimChannel<Uint8Array>({ latency: 1, jitter: 0, lossPct: 0, dupPct: 0 }, 1);
    const ba = new SimChannel<Uint8Array>({ latency: 1, jitter: 0, lossPct: 0, dupPct: 0 }, 2);
    let now = 0;
    const a = new RollbackSession(simA, { localPlayer: 0 }, (m) => ab.send(encodeMessage(m), now));
    const b = new RollbackSession(simB, { localPlayer: 1 }, (m) => ba.send(encodeMessage(m), now));
    for (now = 0; now < 200; now++) {
      for (const m of ba.poll(now)) { const d = decodeMessage(m); if (d) a.receive(d); }
      for (const m of ab.poll(now)) { const d = decodeMessage(m); if (d) b.receive(d); }
      a.tick(0); b.tick(0);
    }
    expect(a.desync?.frame).toBe(60);
    expect(b.desync?.frame).toBe(60);
  });

  it('stalls instead of predicting past the window when the peer goes silent', () => {
    const sim = makeSim();
    const s = new RollbackSession(sim, { localPlayer: 0, maxRollback: 8 }, () => undefined);
    for (let i = 0; i < 50; i++) s.tick(0);
    expect(sim.frame).toBe(8);
    expect(s.stats.windowStalls).toBe(42);
    expect(s.confirmedFrame).toBe(-1);
  });
});
