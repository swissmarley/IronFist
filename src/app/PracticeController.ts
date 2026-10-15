import type { Game } from './Game';
import type { MatchRunner } from './MatchRunner';
import { BasicAI } from '@/ai/BasicAI';
import { debugFlags } from '@/debug/DebugFlags';
import { frameFromNumpad, IN_START } from '@/input/InputFrame';
import { FState } from '@/sim/fighterState';
import type { PracticeOptions } from '@/ui/screens/PracticeMenu';
import { FX_ONE } from '@/core/fixed';

/**
 * Training-room dummy behaviour: stand / crouch / jump / guard modes, CPU, and
 * record/playback of the dummy's inputs. Drives P2 through input overrides.
 */
export class PracticeController {
  private options: PracticeOptions | null = null;
  private cpu: BasicAI | null = null;
  private recording: number[] | null = null;
  private armed = false;
  private playbackIdx = 0;
  private gotHit = false;
  private readonly tick = (): void => this.onSample();
  private prevStart = false;

  constructor(private readonly game: Game, private readonly runner: MatchRunner) {
    runner.session.onBeforeSample = this.tick;
  }

  apply(o: PracticeOptions): void {
    this.options = o;
    debugFlags.frameData = o.frameData;
    debugFlags.inputDisplay = o.inputDisplay;
    debugFlags.hitboxes = o.hitboxes;
    const sim = this.runner.session.sim;
    sim.config.training = true;
    this.cpu = o.dummy === 'cpu' ? new BasicAI(sim, 1, this.game.settings.get().difficulty, 42) : null;
    if (o.dummy !== 'record' && o.dummy !== 'playback') this.recording = o.dummy === 'stand' ? this.recording : this.recording;
    this.runner.session.hpRegen = o.hpRegen;
    this.game.input.overrides[1] = null;
  }

  reset(): void {
    const sim = this.runner.session.sim;
    sim.rematch();
    sim.round.phase = 1;
    for (const f of sim.fighters) { f.setState(FState.Idle); f.hp = f.maxHp; }
    this.gotHit = false;
  }

  private onSample(): void {
    const o = this.options;
    if (!o) return;
    const sim = this.runner.session.sim;
    const p2 = sim.fighters[1];
    const F = (dir: number, b = 0): number => frameFromNumpad(dir, b, false);
    const raw = this.game.input.sample();
    const p1Start = ((raw[0] ?? 0) & IN_START) !== 0;
    const startEdge = p1Start && !this.prevStart;
    this.prevStart = p1Start;
    if (p2.comboHits > 0) this.gotHit = true;
    if (p2.state === FState.Idle && p2.stateFrame > 30) this.gotHit = false;
    switch (o.dummy) {
      case 'stand': this.game.input.overrides[1] = 0; break;
      case 'crouch': this.game.input.overrides[1] = F(1); break;
      case 'jump': this.game.input.overrides[1] = (sim.frame % 50) < 8 ? F(8) : 0; break;
      case 'guardAll': this.game.input.overrides[1] = this.guardFrame(sim); break;
      case 'guardAfterFirst': this.game.input.overrides[1] = this.gotHit ? this.guardFrame(sim) : 0; break;
      case 'cpu': this.game.input.overrides[1] = this.cpu ? this.cpu.decide(sim) : 0; break;
      case 'record': {
        // START arms; while recording, P1's device drives the dummy
        if (startEdge) { this.armed = !this.armed; this.recording = this.armed ? [] : this.recording; }
        if (this.armed && this.recording) { const f = mirror(raw[0] ?? 0); this.recording.push(f); this.game.input.overrides[1] = f; this.game.input.overrides[0] = 0; }
        else { this.game.input.overrides[1] = 0; this.game.input.overrides[0] = null; }
        break;
      }
      case 'playback': {
        this.game.input.overrides[0] = null;
        if (this.recording && this.recording.length > 0) {
          this.game.input.overrides[1] = this.recording[this.playbackIdx % this.recording.length] ?? 0;
          this.playbackIdx++;
        } else this.game.input.overrides[1] = 0;
        break;
      }
    }
  }

  private guardFrame(sim: { fighters: readonly { state: number; moveIdx: number }[]; chars: readonly { move(i: number): { hits: { level: string }[] } }[] }): number {
    const p1 = sim.fighters[0];
    if (p1 && p1.state === FState.Attack && p1.moveIdx >= 0) {
      const level = sim.chars[0]?.move(p1.moveIdx).hits[0]?.level;
      return frameFromNumpad(level === 'low' ? 1 : 4, 0, false);
    }
    return frameFromNumpad(4, 0, false);
  }

  dispose(): void {
    this.runner.session.onBeforeSample = null;
    this.game.input.overrides[0] = null;
    this.game.input.overrides[1] = null;
    void FX_ONE;
  }
}

/** Mirror P1's absolute frame so it reads as the same relative input for P2 (facing left). */
function mirror(frame: number): number {
  const left = frame & 1, right = frame & 2;
  return (frame & ~3) | (left ? 2 : 0) | (right ? 1 : 0);
}
