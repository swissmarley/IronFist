import type { Game } from './Game';
import { Session } from './Session';
import { BasicAI } from '@/ai/BasicAI';
import { getCharacter } from '@/data/characters';
import { ReplayRecorder, type Replay } from '@/sim/replay';
import { RoundPhase } from '@/sim/rounds';
import { EvType } from '@/sim/events';
import type { MatchOutcome, MatchSetup } from './modes/types';
import type { InputFrame } from '@/input/InputFrame';

/**
 * Runs one match: builds the Session for a MatchSetup, drives CPU players,
 * records the replay and collects outcome stats.
 */
export class MatchRunner {
  readonly session: Session;
  readonly setup: MatchSetup;
  private readonly ai: [BasicAI | null, BasicAI | null] = [null, null];
  private recorder: ReplayRecorder;
  private maxCombo: [number, number] = [0, 0];
  private damage: [number, number] = [0, 0];
  private startFrame = 0;
  paused = false;
  /** Replay playback: feed these inputs instead of devices. */
  playback: Replay | null = null;
  private playbackIdx = 0;
  playbackSpeed = 1;
  private speedAcc = 0;

  constructor(private readonly game: Game, setup: MatchSetup) {
    this.setup = setup;
    const p1 = getCharacter(setup.p1), p2 = getCharacter(setup.p2);
    this.session = game.createSession([p1, p2], setup.config);
    const sim = this.session.sim;
    if (setup.cpu[0] !== null) this.ai[0] = new BasicAI(sim, 0, setup.cpu[0], (setup.config.seed ?? 1) * 7 + 1);
    if (setup.cpu[1] !== null) this.ai[1] = new BasicAI(sim, 1, setup.cpu[1], (setup.config.seed ?? 1) * 7 + 2);
    this.recorder = new ReplayRecorder(sim);
    this.startFrame = sim.frame;
    const acc = game.settings.get().accessibility;
    sim.options.holdToBlock = [acc.holdToBlock[0], acc.holdToBlock[1]];
    if (setup.label) this.session.hud.setLadderLabel(setup.label);
  }

  /** Called before every sim step: decide CPU inputs / playback frames. */
  sampleInput(): void {
    const input = this.game.input;
    if (this.playback) {
      const i = this.playbackIdx * 2;
      const a = this.playback.inputs[i], b = this.playback.inputs[i + 1];
      input.overrides[0] = a ?? 0; input.overrides[1] = b ?? 0;
    } else {
      for (let p = 0; p < 2; p++) {
        const ai = this.ai[p as 0 | 1];
        if (ai) input.overrides[p] = ai.decide(this.session.sim);
      }
    }
    this.session.sampleInput();
  }

  /** Advance one loop step (handles pause and playback speed). Returns true when the match finished this step. */
  step(): boolean {
    if (this.paused) return false;
    if (this.playback) {
      this.speedAcc += this.playbackSpeed;
      if (this.speedAcc < 1) return false;
      this.speedAcc -= 1;
      if (this.playbackIdx * 2 >= this.playback.inputs.length) return true;
      this.playbackIdx++;
    }
    const sim = this.session.sim;
    const before = sim.frame;
    this.session.step();
    if (sim.frame !== before) {
      const [a, b] = this.session.lastInputsUsed;
      this.recorder.record(a, b);
      for (const e of sim.events.items) {
        if ((e.type === EvType.Hit || e.type === EvType.Counter) && e.b >= 0) {
          this.damage[e.a as 0 | 1] += e.damage;
          const victim = sim.fighters[e.b as 0 | 1];
          this.maxCombo[e.a as 0 | 1] = Math.max(this.maxCombo[e.a as 0 | 1], victim.comboHits);
        }
      }
    }
    return sim.round.phase === RoundPhase.MatchOver;
  }

  outcome(): MatchOutcome {
    const sim = this.session.sim;
    return {
      winner: sim.round.winner,
      wins: [sim.round.wins[0], sim.round.wins[1]],
      frames: sim.frame - this.startFrame,
      maxCombo: this.maxCombo,
      damage: this.damage,
      hpLeft: [sim.fighters[0].hp, sim.fighters[1].hp],
    };
  }

  replay(): Replay {
    return this.recorder.finish();
  }

  hasCpu(p: number): boolean { return this.ai[p as 0 | 1] !== null; }

  /** Clear CPU overrides so devices control both players again. */
  dispose(): void {
    this.game.input.overrides[0] = null;
    this.game.input.overrides[1] = null;
    this.session.dispose();
  }

  static scriptFrames(frames: InputFrame[]): InputFrame[] { return frames; }
}
