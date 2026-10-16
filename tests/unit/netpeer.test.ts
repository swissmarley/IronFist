import { describe, expect, it } from 'vitest';
import { LocalLoopbackTransport } from '@/net/transport';
import { NetPeer, type StartParams } from '@/net/NetPeer';
import { IN_B1, IN_RIGHT } from '@/input/InputFrame';
import { RoundPhase } from '@/sim/rounds';
import { clampInputDelay, inputDelayForRtt, RttProbe } from '@/net/inputDelay';
import { aggressor, commonCheckpoints, link, type Link } from './netHarness';

const BASE: Omit<StartParams, 'p1' | 'p2'> = { stage: 'greybox', seed: 5, roundsToWin: 2, roundTimeSec: 60, inputDelay: 2, delayAuto: false, hp: 0 };

/** Handshake, then the host starts as soon as the guest's pick arrives. */
function lobby(l: Link, params: Omit<StartParams, 'p1' | 'p2'> = BASE): void {
  const { host, guest } = l;
  host.peer.onRemotePick = (c) => { if (host.peer.localPick && host.peer.phase === 'lobby') host.peer.start({ ...params, p1: host.peer.localPick, p2: c }); };
  host.peer.pick('greybox');
  l.pump();
  expect(host.peer.connected && guest.peer.connected).toBe(true);
  guest.peer.pick('greybox');
  l.pump();
}

describe('NetPeer over the loopback transport (online path without WebRTC)', () => {
  it('handshakes, picks, starts, and a host jab lands on the guest with matching confirmed hashes', () => {
    const l = link({ latency: 3, jitter: 2, lossPct: 5, dupPct: 2 }, 9);
    lobby(l);
    const { host, guest } = l;
    const [simA, simB] = [host.sim, guest.sim];
    const [a, b] = [host.peer.session, guest.peer.session];
    if (!a || !b || !simA || !simB) throw new Error('match did not start');
    expect(host.setups[0]?.match).toBe(1);
    expect(guest.setups[0]).toEqual(host.setups[0]);
    // host: wait for FIGHT, walk in, jab (scripted like the E2E), guest idles
    const script: number[] = [];
    for (let i = 0; i < 110; i++) script.push(0);
    for (let i = 0; i < 25; i++) script.push(IN_RIGHT);
    script.push(IN_B1, IN_B1, 0);
    let hit = -1;
    for (let t = 0; t < 399; t++) {
      l.step(script[t] ?? 0, 0);
      if (hit < 0 && simB.fighters[1].hp < simB.fighters[1].maxHp) hit = simB.frame;
    }
    expect(simA.round.phase).toBe(RoundPhase.Fight);
    expect(hit).toBeGreaterThan(110);
    expect(simB.fighters[1].hp).toBeLessThan(simB.fighters[1].maxHp);
    expect(simA.fighters[1].hp).toBe(simB.fighters[1].hp);
    const ca = a.lastCheckpoint, cb = b.lastCheckpoint;
    expect(ca).not.toBeNull();
    const common = Math.min(ca?.frame ?? 0, cb?.frame ?? 0);
    expect(common).toBeGreaterThanOrEqual(300);
    expect(a.checkpointHash(common)).toBe(b.checkpointHash(common));
    expect(a.desync ?? b.desync).toBeNull();
    // leaving notifies the other side
    let reason = '';
    guest.peer.onLeave = (r) => { reason = r; };
    host.peer.leave();
    l.pump();
    expect(reason).not.toBe('');
  });

  it('plays a rematch on the same connection (new seed + epoch, stale packets dropped), then CHANGE FIGHTER re-picks', () => {
    const l = link({ latency: 4, jitter: 6, lossPct: 6, dupPct: 4 }, 3);
    const { host, guest } = l;
    let rematchSeed = 1000;
    host.peer.onRematchReady = () => { host.peer.startRematch(++rematchSeed); };
    const notes: string[] = [];
    host.peer.onRemoteChoice = (c) => notes.push(`host saw ${c}`);
    guest.peer.onRemoteChoice = (c) => notes.push(`guest saw ${c}`);
    lobby(l, { ...BASE, roundsToWin: 1, hp: 1 });
    const playOut = (match: number): void => {
      for (let t = 0; t < 1500 && (host.finished < match || guest.finished < match); t++) l.step(aggressor(host.sim), 0);
      expect(host.finished).toBe(match);
      expect(guest.finished).toBe(match);
    };
    playOut(1);
    expect(host.peer.phase).toBe('post');
    expect(host.sim?.round.winner).toBe(0);
    // guest asks first and keeps pumping its finished session; the host agrees a bit later
    guest.peer.requestRematch();
    for (let t = 0; t < 20; t++) l.step(0, 0);
    expect(host.setups.length).toBe(1);
    host.peer.requestRematch();
    l.step(0, 0);
    expect(host.setups.length).toBe(2);
    expect(guest.setups.length).toBe(2);
    expect(guest.setups[1]).toEqual(host.setups[1]);
    expect(host.setups[1]?.seed).toBe(1001);
    expect(host.setups[1]?.match).toBe(2);
    expect({ ...host.setups[1], seed: 0, match: 0 }).toEqual({ ...host.setups[0], seed: 0, match: 0 });
    playOut(2);
    expect(notes).toEqual(['host saw rematch', 'guest saw rematch']);
    // both matches: identical confirmed checkpoint hashes on both peers, no desync
    for (const i of [0, 1]) {
      const c = commonCheckpoints(l, i);
      expect(c.frames.length).toBeGreaterThanOrEqual(5);
      expect(c.equal).toBe(true);
    }
    expect(host.peer.session?.desync ?? guest.peer.session?.desync ?? null).toBeNull();
    // each side stops at its own (later) MatchOver frame, so compare the decided outcome
    expect(guest.sim?.round.wins).toEqual(host.sim?.round.wins);
    expect(guest.sim?.fighters.map((f) => f.hp)).toEqual(host.sim?.fighters.map((f) => f.hp));

    // CHANGE FIGHTER on the guest: the host (on its results screen) is sent back to the pick
    let repicked = 0;
    host.peer.onRepick = () => { repicked++; };
    guest.peer.changeFighter();
    expect(guest.peer.phase).toBe('lobby');
    l.step(0, 0);
    expect(repicked).toBe(1);
    expect(host.peer.phase).toBe('lobby');
    expect(host.peer.localPick).toBeNull();
    host.peer.onRemotePick = (c) => { if (host.peer.localPick) host.peer.start({ ...BASE, roundsToWin: 1, hp: 1, p1: host.peer.localPick, p2: c }); };
    guest.peer.pick('greybox');
    l.step(0, 0);
    expect(host.setups.length).toBe(2); // the host has not picked yet
    host.peer.pick('greybox');
    host.peer.start({ ...BASE, roundsToWin: 1, hp: 1, p1: 'greybox', p2: host.peer.remotePick ?? '' });
    l.step(0, 0);
    expect(guest.setups[2]?.match).toBe(3);
    expect(guest.setups[2]?.p2).toBe('greybox');
  });

  it('a CHANGE FIGHTER that arrives while the other peer is still confirming its last frames waits for its results', () => {
    const l = link({ latency: 6, jitter: 0, lossPct: 0, dupPct: 0 }, 4);
    const { host, guest } = l;
    lobby(l, { ...BASE, roundsToWin: 1, hp: 1 });
    let repicked = 0;
    host.peer.onRepick = () => { repicked++; };
    // run until exactly one side reached its confirmed end
    for (let t = 0; t < 1500 && host.finished + guest.finished === 0; t++) l.step(aggressor(host.sim), 0);
    const [first, second] = host.finished ? [host, guest] : [guest, host];
    expect(second.peer.phase).toBe('match');
    first.peer.changeFighter();
    first.peer.pick('greybox');
    for (let t = 0; t < 200 && second.finished === 0; t++) l.step(0, 0);
    expect(second.finished).toBe(1);
    expect(second.peer.phase).toBe('lobby');
    expect(second.peer.remotePick).toBe('greybox'); // the re-pick that followed the change is kept
    if (second === host) expect(repicked).toBe(1);
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

describe('automatic input delay from the lobby RTT', () => {
  it('follows clamp(ceil(rtt / 2) + 1, 1, 6)', () => {
    const table: [number, number][] = [[0, 1], [1, 2], [2, 2], [3, 3], [4, 3], [5, 4], [6, 4], [8, 5], [10, 6], [11, 6], [40, 6], [-3, 1]];
    for (const [rtt, d] of table) expect(inputDelayForRtt(rtt), `rtt ${rtt}`).toBe(d);
    expect(clampInputDelay(-1)).toBe(0);
    expect(clampInputDelay(3)).toBe(3);
    expect(clampInputDelay(99)).toBe(8);
    const p = new RttProbe(5);
    expect(p.median).toBe(-1);
    for (const r of [4, 4, 30, 5, 4, 6, 5]) p.add(r); // one outlier, ring keeps the last 5
    expect(p.median).toBe(5);
  });

  // [one-way latency, jitter, expected rtt]; the loopback delivers no earlier than the next tick, so 0 latency reads as 2
  for (const [latency, jitter, rtt] of [[0, 0, 2], [1, 0, 2], [4, 0, 8], [4, 2, 12], [12, 0, 24]] as const) {
    it(`measures ~1 s of pings and both peers run the host's delay (one-way ${latency}+${jitter} ticks)`, () => {
      const l = link({ latency, jitter, lossPct: 10, dupPct: 0 }, 21);
      const { host, guest } = l;
      host.peer.pick('greybox');
      guest.peer.pick('greybox');
      l.pump();
      let t = 0;
      for (; t < 400 && !host.peer.rttReady; t++) l.step(0, 0);
      expect(t).toBeGreaterThanOrEqual(59);
      expect(t).toBeLessThanOrEqual(jitter ? 200 : 70);
      // samples are whole ticks: with jitter the median lands anywhere in the jitter range
      expect(host.peer.rttTicks).toBeGreaterThanOrEqual(2 * latency);
      expect(host.peer.rttTicks).toBeLessThanOrEqual(rtt);
      const auto = host.peer.autoInputDelay();
      expect(auto).toBe(inputDelayForRtt(host.peer.rttTicks));
      if (!jitter) expect(auto).toBe(inputDelayForRtt(rtt));
      host.peer.start({ ...BASE, p1: 'greybox', p2: 'greybox', inputDelay: auto, delayAuto: true });
      for (let k = 0; k < 2 * latency + 2 * jitter + 2; k++) l.step(0, 0);
      expect(guest.setups[0]?.inputDelay).toBe(auto);
      expect(guest.setups[0]?.delayAuto).toBe(true);
      // the guest measured too, but adopts the host's value
      expect(host.peer.session?.inputDelay).toBe(auto);
      expect(guest.peer.session?.inputDelay).toBe(auto);
    });
  }
});
