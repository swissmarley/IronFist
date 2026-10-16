import { MatchSim } from '@/sim/match';
import { getCharacter } from '@/data/characters';
import { LocalLoopbackTransport } from '@/net/transport';
import { NetPeer, type OnlineSetup } from '@/net/NetPeer';
import type { ChannelConditions } from '@/net/SimChannel';
import { RoundPhase } from '@/sim/rounds';

export function simFor(s: OnlineSetup): MatchSim {
  return new MatchSim([getCharacter(s.p1), getCharacter(s.p2)], { seed: s.seed, roundsToWin: s.roundsToWin, roundTimeSec: s.roundTimeSec, ...(s.hp > 0 ? { hpOverride: s.hp } : {}) });
}

/** One peer plus what a NetMatchRunner would hold: its sim and the checkpoint hashes per match. */
export interface Side {
  peer: NetPeer;
  sim: MatchSim | null;
  setups: OnlineSetup[];
  /** Per match: checkpoint frame -> confirmed hash. */
  hashes: Map<number, number>[];
  /** Matches whose confirmed end this side reached. */
  finished: number;
}

function side(peer: NetPeer): Side {
  const s: Side = { peer, sim: null, setups: [], hashes: [], finished: 0 };
  peer.onStart = (setup) => {
    s.setups.push(setup);
    s.sim = simFor(setup);
    s.hashes.push(new Map());
    peer.beginMatch(s.sim, setup);
  };
  return s;
}

export interface Link {
  host: Side;
  guest: Side;
  ta: LocalLoopbackTransport;
  tb: LocalLoopbackTransport;
  now: number;
  /** Deliver due messages on both ends at the current tick. */
  pump(): void;
  /** One loop tick on both peers: match ticks like NetMatchRunner, otherwise NetPeer.tick. */
  step(hostInput: number, guestInput: number): void;
}

/**
 * Drive one side for one loop tick the way App + NetMatchRunner do: tick the session
 * during a match, record newly confirmed checkpoints, end the match once its deciding
 * frame is confirmed; outside a match only `peer.tick()` runs (lobby RTT, post-match pump).
 */
function drive(s: Side, input: number): void {
  const { peer, sim } = s;
  const rb = peer.session;
  if (peer.phase === 'match' && rb && sim) {
    rb.tick(input);
    const map = s.hashes[s.hashes.length - 1] as Map<number, number>;
    for (let f = rb.hashInterval * (map.size + 1); ; f += rb.hashInterval) {
      const h = rb.checkpointHash(f);
      if (h === undefined) break;
      map.set(f, h);
    }
    if (rb.matchDecided) { s.finished++; peer.matchOver(); }
  } else peer.tick();
}

export function link(cond: ChannelConditions, seed: number): Link {
  const [ta, tb] = LocalLoopbackTransport.pair(cond, seed);
  const host = side(new NetPeer(ta, 'host'));
  const guest = side(new NetPeer(tb, 'guest'));
  const l: Link = {
    host, guest, ta, tb, now: 0,
    pump: () => { ta.pump(l.now); tb.pump(l.now); },
    step: (hi, gi) => { l.now++; l.pump(); drive(host, hi); drive(guest, gi); },
  };
  return l;
}

/** Host script: once FIGHT is on, walk in and jab over and over (KOs at low HP). */
export function aggressor(sim: MatchSim | null): number {
  if (!sim || sim.round.phase !== RoundPhase.Fight) return 0;
  const k = sim.frame % 30;
  return k < 24 ? 2 /* IN_RIGHT */ : k < 26 ? 16 /* IN_B1 */ : 0;
}

/** Checkpoints both peers confirmed in match `i`, and whether every one of them agrees. */
export function commonCheckpoints(l: Link, i: number): { frames: number[]; equal: boolean } {
  const a = l.host.hashes[i], b = l.guest.hashes[i];
  if (!a || !b) return { frames: [], equal: false };
  const frames = [...a.keys()].filter((f) => b.has(f));
  return { frames, equal: frames.every((f) => a.get(f) === b.get(f)) };
}
