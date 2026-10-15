import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { IN_B1, IN_B2, IN_B3, IN_DOWN, IN_LEFT, IN_RIGHT } from '@/input/InputFrame';
import { TransferAssembler, transferMessages } from '@/net/resync';
import type { RollbackSession } from '@/net/RollbackSession';
import { link, type Link, type Side } from './netHarness';

const DIRS = [0, IN_LEFT, IN_RIGHT, IN_DOWN, IN_DOWN | IN_RIGHT];
const BTNS = [IN_B1, IN_B2, IN_B3];

function randomInput(rng: Rng, prev: number): number {
  const dir = rng.chance(85) ? prev & 0xf : rng.pick(DIRS);
  return dir | (rng.chance(12) ? rng.pick(BTNS) : 0);
}

function session(s: Side): RollbackSession {
  const rb = s.peer.session;
  if (!rb) throw new Error('no session');
  return rb;
}

/**
 * A long match over a lossy, jittery channel. Mid-match one peer's sim is corrupted (one
 * fighter field) at a moment no rollback can undo it; the checkpoint exchange must detect
 * it and the host's state transfer must bring both peers back to identical hashes.
 */
function runCorrupted(victim: 'host' | 'guest', chunkInts: number): { l: Link; sawDesync: boolean; corruptedAt: number } {
  const l = link({ latency: 3, jitter: 3, lossPct: 8, dupPct: 3 }, 17);
  const { host, guest } = l;
  host.peer.chunkInts = chunkInts;
  host.peer.onRemotePick = (c) => { host.peer.start({ p1: 'greybox', p2: c, stage: 'greybox', seed: 9, roundsToWin: 3, roundTimeSec: 99, inputDelay: 2, delayAuto: false, hp: 0 }); };
  host.peer.pick('greybox');
  guest.peer.pick('greybox');
  l.pump(); l.pump();
  const ra = new Rng(5), rb = new Rng(6);
  let ia = 0, ib = 0, sawDesync = false, corruptedAt = -1;
  for (let t = 0; t < 1500; t++) {
    // random play, a quiet stretch (constant input = no misprediction, so no rollback can
    // restore a pre-corruption snapshot), the corruption, then random play again
    const quiet = t >= 300 && t < 360;
    if (!quiet) { ia = randomInput(ra, ia); ib = randomInput(rb, ib); } else { ia = 0; ib = 0; }
    if (t === 340) {
      const sim = (victim === 'host' ? host : guest).sim;
      if (!sim) throw new Error('no sim');
      sim.fighters[0].x += 37;
      corruptedAt = sim.frame;
    }
    l.step(ia, ib);
    if (session(host).desync || session(guest).desync) sawDesync = true;
  }
  return { l, sawDesync, corruptedAt };
}

/** Checkpoints (>= the resync frame) both peers still hold, and whether they all agree. */
function agreeing(l: Link): { frames: number[]; equal: boolean } {
  const a = session(l.host), b = session(l.guest);
  const frames: number[] = [];
  let equal = true;
  for (let f = Math.max(a.syncFloor, 0); f <= a.frame; f++) {
    const ha = a.checkpointHash(f), hb = b.checkpointHash(f);
    if (ha === undefined || hb === undefined) continue;
    frames.push(f);
    if (ha !== hb) equal = false;
  }
  return { frames, equal };
}

describe('desync recovery (state transfer over the reliable channel)', () => {
  for (const victim of ['guest', 'host'] as const) {
    it(`detects a corrupted ${victim}, transfers the host's confirmed state and both resume in sync`, () => {
      const { l, sawDesync, corruptedAt } = runCorrupted(victim, 100);
      const a = session(l.host), b = session(l.guest);
      expect(sawDesync).toBe(true);
      expect(a.stats.resyncs).toBe(1);
      expect(b.stats.resyncs).toBe(1);
      expect(a.syncGen).toBe(1);
      expect(b.syncGen).toBe(1);
      expect(a.syncFloor).toBe(b.syncFloor);
      expect(a.syncFloor).toBeGreaterThan(corruptedAt);
      // detected at the first confirmed checkpoint after the corruption, fixed right after
      expect(a.syncFloor - corruptedAt).toBeLessThan(140);
      expect(a.desync).toBeNull();
      expect(b.desync).toBeNull();
      const c = agreeing(l);
      expect(c.frames.length).toBeGreaterThanOrEqual(10);
      expect(c.equal).toBe(true);
      expect(a.stats.checkpointsCompared).toBeGreaterThan(15);
      // the host is authoritative: a corrupted host's state is what both continue from
      const hostX = l.host.sim?.fighters[0].x, guestX = l.guest.sim?.fighters[0].x;
      if (a.frame === b.frame) expect(guestX).toBe(hostX);
      console.info(`[resync] ${victim} corrupted at ${corruptedAt}, resynced at ${a.syncFloor}; ${c.frames.length} agreeing checkpoints after; host rollbacks ${a.stats.rollbacks}, guest ${b.stats.rollbacks}`);
    });
  }

  it('chunks a snapshot and reassembles it exactly (and rejects foreign chunks)', () => {
    const data = new Int32Array(1000);
    for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) | 0;
    const msgs = transferMessages({ gen: 2, frame: 777, data, inputsFrom: 770, inputs: [1, 2, 3] }, 4, 256);
    expect(msgs.length).toBe(1 + 4);
    const asm = new TransferAssembler();
    const head = msgs[0];
    if (head?.k !== 'sync') throw new Error('header first');
    asm.begin(JSON.parse(JSON.stringify(head.head)) as typeof head.head);
    expect(asm.add(9, 0, [1])).toBeNull(); // other generation
    let out = null;
    for (const m of msgs.slice(1)) if (m.k === 'chunk') out = asm.add(m.gen, m.part, JSON.parse(JSON.stringify(m.data)) as number[]);
    expect(out?.frame).toBe(777);
    expect(out?.inputsFrom).toBe(770);
    expect(Array.from(out?.data ?? [])).toEqual(Array.from(data));
  });

  it('a clean match never resyncs', () => {
    const l = link({ latency: 3, jitter: 3, lossPct: 8, dupPct: 3 }, 17);
    l.host.peer.onRemotePick = (c) => { l.host.peer.start({ p1: 'greybox', p2: c, stage: 'greybox', seed: 9, roundsToWin: 3, roundTimeSec: 99, inputDelay: 2, delayAuto: false, hp: 0 }); };
    l.host.peer.pick('greybox');
    l.guest.peer.pick('greybox');
    l.pump(); l.pump();
    const ra = new Rng(5), rb = new Rng(6);
    let ia = 0, ib = 0;
    for (let t = 0; t < 800; t++) { ia = randomInput(ra, ia); ib = randomInput(rb, ib); l.step(ia, ib); }
    expect(session(l.host).stats.resyncs + session(l.guest).stats.resyncs).toBe(0);
    expect(agreeing(l).equal).toBe(true);
  });
});
