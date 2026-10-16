import type { Game } from './Game';
import { MatchRunner } from './MatchRunner';
import type { MatchSetup } from './modes/types';
import type { NetPeer, OnlineSetup } from '@/net/NetPeer';
import type { RollbackSession } from '@/net/RollbackSession';
import { HASH_INTERVAL, type Replay } from '@/sim/replay';
import type { InputFrame } from '@/input/InputFrame';
import { NetHud } from '@/ui/NetHud';
import { STEP_MS } from '@/core/loop';

/** Ticks without any packet from the peer before the match is abandoned (10 s). */
const TIMEOUT_TICKS = 600;

/**
 * Drives an online match: the local player's input comes from the InputSystem (either
 * keyboard set, so the guest can use P1 keys), the remote player's from the
 * RollbackSession. The Session renders whatever the sim currently holds (confirmed or
 * predicted) and only frames shown for the first time are presented (events, input
 * display), so rollbacks never replay audio/VFX. Replays record confirmed inputs only.
 */
export class NetMatchRunner extends MatchRunner {
  override readonly pausable = false;
  readonly rb: RollbackSession;
  private localInput: InputFrame = 0;
  private readonly hud: NetHud;
  private readonly confirmedLog: number[] = [];
  private readonly hashes: number[] = [];
  private nextHashFrame = HASH_INTERVAL;
  private readonly io: [InputFrame, InputFrame] = [0, 0];

  constructor(game: Game, setup: MatchSetup, private readonly peer: NetPeer, private readonly online: OnlineSetup, uiRoot: HTMLElement) {
    super(game, setup);
    const sim = this.session.sim;
    // per-player accessibility assists would make the peers simulate different rules
    sim.options.holdToBlock = [false, false];
    this.rb = peer.beginMatch(sim, online);
    this.rb.onStepped = (frame, resim) => {
      if (resim) return;
      this.session.presentStep(this.rb.usedInputsAt(frame, this.io));
      this.tally();
    };
    this.hud = new NetHud(uiRoot);
  }

  override sampleInput(): void {
    const f = this.game.input.sample();
    this.localInput = (f[0] ?? 0) | (f[1] ?? 0);
  }

  override step(): boolean {
    const rb = this.rb;
    rb.tick(this.localInput);
    this.collect();
    if (rb.stats.ticks % 10 === 0) this.updateHud();
    if (rb.ticksSinceReceive > TIMEOUT_TICKS && !this.abort) this.abort = 'CONNECTION LOST';
    return rb.matchDecided;
  }

  override replay(): Replay {
    const sim = this.session.sim;
    return {
      version: 1,
      chars: [sim.chars[0].def.id, sim.chars[1].def.id],
      config: sim.config,
      inputs: this.confirmedLog.slice(),
      hashes: this.hashes.slice(),
      hashInterval: HASH_INTERVAL,
      finalHash: sim.hash(),
    };
  }

  override dispose(): void {
    this.hud.dispose();
    this.peer.endMatch();
    super.dispose();
  }

  /** Record confirmed inputs and checkpoint hashes (replay + diagnostics). */
  private collect(): void {
    const rb = this.rb;
    for (let f = this.confirmedLog.length / 2; f <= rb.confirmedFrame; f++) {
      rb.inputsAt(f, this.io);
      this.confirmedLog.push(this.io[0], this.io[1]);
    }
    for (;;) {
      const h = rb.checkpointHash(this.nextHashFrame);
      if (h === undefined) break;
      this.hashes.push(h);
      this.nextHashFrame += HASH_INTERVAL;
    }
  }

  private updateHud(): void {
    const s = this.rb.stats;
    this.hud.update({
      rttMs: s.rttTicks * STEP_MS, delay: this.rb.inputDelay, delayAuto: this.online.delayAuto, frame: this.rb.frame, confirmed: this.rb.confirmedFrame,
      rollbacks: s.rollbacks, maxDepth: s.maxRollbackDepth, stalls: s.windowStalls + s.syncStalls, desyncFrame: this.rb.desync?.frame ?? -1,
      resyncs: s.resyncs, resyncFrame: this.rb.syncFloor,
    });
  }
}
