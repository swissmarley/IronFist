import { describe, expect, it } from 'vitest';
import { MatchSim } from '@/sim/match';
import { getCharacter } from '@/data/characters';
import { LocalLoopbackTransport } from '@/net/transport';
import { NetPeer, type OnlineSetup } from '@/net/NetPeer';
import { IN_B1, IN_RIGHT } from '@/input/InputFrame';
import { RoundPhase } from '@/sim/rounds';

function simFor(s: OnlineSetup): MatchSim {
  return new MatchSim([getCharacter(s.p1), getCharacter(s.p2)], { seed: s.seed, roundsToWin: s.roundsToWin, roundTimeSec: s.roundTimeSec });
}

describe('NetPeer over the loopback transport (online path without WebRTC)', () => {
  it('handshakes, picks, starts, and a host jab lands on the guest with matching confirmed hashes', () => {
    const [ta, tb] = LocalLoopbackTransport.pair({ latency: 3, jitter: 2, lossPct: 5, dupPct: 2 }, 9);
    const host = new NetPeer(ta, 'host');
    const guest = new NetPeer(tb, 'guest');
    const sims: (MatchSim | null)[] = [null, null];
    host.onStart = (s) => { sims[0] = simFor(s); host.beginMatch(sims[0], s.inputDelay); };
    guest.onStart = (s) => { sims[1] = simFor(s); guest.beginMatch(sims[1], s.inputDelay); };
    host.onRemotePick = (c) => {
      if (host.localPick) host.start({ p1: host.localPick, p2: c, stage: 'greybox', seed: 5, roundsToWin: 2, roundTimeSec: 60, inputDelay: 2 });
    };
    host.pick('greybox');
    let now = 0;
    const pump = (): void => { ta.pump(now); tb.pump(now); };
    pump();
    expect(host.connected && guest.connected).toBe(true);
    guest.pick('greybox');
    pump();
    expect(sims[0]).not.toBeNull();
    expect(sims[1]).not.toBeNull();
    const [a, b] = [host.session, guest.session];
    if (!a || !b || !sims[0] || !sims[1]) throw new Error('match did not start');
    // host: wait for FIGHT, walk in, jab (scripted like the E2E), guest idles
    const script: number[] = [];
    for (let i = 0; i < 110; i++) script.push(0);
    for (let i = 0; i < 25; i++) script.push(IN_RIGHT);
    script.push(IN_B1, IN_B1, 0);
    let hit = -1;
    for (now = 1; now < 400; now++) {
      pump();
      a.tick(script[now - 1] ?? 0);
      b.tick(0);
      if (hit < 0 && sims[1].fighters[1].hp < sims[1].fighters[1].maxHp) hit = sims[1].frame;
    }
    expect(sims[0].round.phase).toBe(RoundPhase.Fight);
    expect(hit).toBeGreaterThan(110);
    expect(sims[1].fighters[1].hp).toBeLessThan(sims[1].fighters[1].maxHp);
    expect(sims[0].fighters[1].hp).toBe(sims[1].fighters[1].hp);
    const ca = a.lastCheckpoint, cb = b.lastCheckpoint;
    expect(ca).not.toBeNull();
    const common = Math.min(ca?.frame ?? 0, cb?.frame ?? 0);
    expect(common).toBeGreaterThanOrEqual(300);
    expect(a.checkpointHash(common)).toBe(b.checkpointHash(common));
    expect(a.desync ?? b.desync).toBeNull();
    // leaving notifies the other side
    let reason = '';
    guest.onLeave = (r) => { reason = r; };
    host.leave();
    pump();
    expect(reason).not.toBe('');
  });

  it('rejects a peer with another protocol version', () => {
    const [ta, tb] = LocalLoopbackTransport.pair();
    const guest = new NetPeer(tb, 'guest');
    let reason = '';
    guest.onLeave = (r) => { reason = r; };
    ta.sendControl(JSON.stringify({ k: 'hello', v: 999 }));
    tb.pump(0);
    expect(reason).toMatch(/VERSION/);
    expect(guest.connected).toBe(false);
  });
});
