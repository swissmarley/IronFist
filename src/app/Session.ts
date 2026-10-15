import type { WebGPURenderer } from 'three/webgpu';
import { MatchSim } from '@/sim/match';
import type { MatchConfig } from '@/sim/config';
import type { CharacterDef } from '@/sim/types';
import { InputSystem } from '@/input/InputSystem';
import { GreyBoxScene } from '@/render/GreyBoxScene';
import { FighterView } from '@/render/FighterView';
import { CameraRig } from '@/render/CameraRig';
import { HitboxViewer } from '@/render/HitboxViewer';
import { Hud } from '@/ui/Hud';
import { FrameDataOverlay } from '@/debug/FrameDataOverlay';
import { InputDisplay } from '@/debug/InputDisplay';
import { debugFlags } from '@/debug/DebugFlags';
import { EvType } from '@/sim/events';
import { RoundPhase } from '@/sim/match';
import { IN_START, type InputFrame } from '@/input/InputFrame';
import { TUNING } from '@/sim/config';

export interface SessionOptions {
  chars: [CharacterDef, CharacterDef];
  match: Partial<MatchConfig>;
  scene: GreyBoxScene;
  uiRoot: HTMLElement;
  debugRoot: HTMLElement;
  input: InputSystem;
}

/**
 * A running match: sim + views + HUD + overlays. The Game drives it from the
 * fixed-step loop. Everything render-side reads the sim; nothing writes to it
 * except `step`.
 */
export class Session {
  readonly sim: MatchSim;
  readonly views: [FighterView, FighterView];
  readonly camera: CameraRig;
  readonly hitboxes: HitboxViewer;
  readonly hud: Hud;
  readonly frameData: FrameDataOverlay;
  readonly inputDisplay: InputDisplay;
  private readonly input: InputSystem;
  private readonly scene: GreyBoxScene;
  /** Inputs recorded this session (for replay / tests). */
  readonly inputLog: number[] = [];
  private lastInputs: [InputFrame, InputFrame] = [0, 0];
  private slowmoCounter = 0;
  /** Sim steps per loop step during the KO slow-motion phase (1 = every step). */
  koSlowmoDivisor = 3;
  private prevStart: [boolean, boolean] = [false, false];

  constructor(o: SessionOptions) {
    this.sim = new MatchSim(o.chars, o.match);
    this.scene = o.scene;
    this.input = o.input;
    this.views = [new FighterView(o.scene.fighters[0] as never, 0xff7a1a), new FighterView(o.scene.fighters[1] as never, 0x26c6ff)];
    this.camera = new CameraRig(o.scene.camera);
    this.hitboxes = new HitboxViewer();
    o.scene.scene.add(this.hitboxes.group);
    this.hud = new Hud(o.uiRoot);
    this.hud.setNames(o.chars[0].name, o.chars[1].name);
    this.frameData = new FrameDataOverlay(o.debugRoot);
    this.inputDisplay = new InputDisplay(o.debugRoot);
    this.consumeEvents(); // the constructor's RoundStart
  }

  sampleInput(): void {
    const f = this.input.sample();
    this.lastInputs = [f[0] ?? 0, f[1] ?? 0];
  }

  step(): void {
    const r = this.sim.round;
    // Start on the results screen = rematch
    if (r.phase === RoundPhase.MatchOver) {
      for (let p = 0; p < 2; p++) {
        const down = ((this.lastInputs[p] ?? 0) & IN_START) !== 0;
        if (down && !this.prevStart[p]) { this.sim.rematch(); this.hud.hideResults(); }
        this.prevStart[p] = down;
      }
    } else {
      this.prevStart = [false, false];
    }
    // KO slow-motion: advance the sim on every Nth loop step (sim frames stay exact)
    if (r.phase === RoundPhase.KO && r.phaseFrame < TUNING.koSlowmoFrames) {
      this.slowmoCounter = (this.slowmoCounter + 1) % this.koSlowmoDivisor;
      if (this.slowmoCounter !== 0) return;
    } else this.slowmoCounter = 0;
    this.sim.step(this.lastInputs);
    this.inputLog.push(this.lastInputs[0], this.lastInputs[1]);
    this.inputDisplay.record(this.sim.fighters);
    this.consumeEvents();
    if (this.sim.round.phase === RoundPhase.MatchOver && this.sim.round.phaseFrame === 0) {
      const w = this.sim.round.winner;
      this.hud.showResults(w === 0 || w === 1 ? this.sim.chars[w].def.name : 'DRAW', this.sim.round.wins);
    }
  }

  private consumeEvents(): void {
    for (const e of this.sim.events.items) {
      switch (e.type) {
        case EvType.Hit:
        case EvType.Counter: {
          const v = this.views[e.b as 0 | 1];
          v?.triggerFlash(e.strength);
          this.camera.addShake(0.15 + e.strength * 0.22);
          if (e.strength >= 2) this.camera.addPunch(0.3 + e.strength * 0.2);
          const m = this.sim.chars[e.a as 0 | 1]?.move(e.move);
          const h = m?.hits[0];
          if (h) this.frameData.recordContact(e.a, e.type === EvType.Counter ? (h.onCH ?? h.onHit) : h.onHit, e.type === EvType.Counter ? 'ch' : 'hit');
          if (e.type === EvType.Counter) this.hud.showBanner('COUNTER', 500);
          break;
        }
        case EvType.Block: {
          this.camera.addShake(0.08);
          const m = this.sim.chars[e.a as 0 | 1]?.move(e.move);
          const h = m?.hits[0];
          if (h) this.frameData.recordContact(e.a, h.onBlock, 'block');
          break;
        }
        case EvType.Armour: this.camera.addShake(0.2); break;
        case EvType.KO: {
          this.camera.addShake(0.6); this.camera.addPunch(0.8);
          const label = e.strength === 1 ? 'TIME OVER' : e.strength === 2 ? 'RING OUT' : this.sim.round.lastRoundResult === 'perfect' ? 'PERFECT' : this.sim.round.lastRoundResult === 'double' ? 'DOUBLE K.O.' : 'K.O.';
          this.hud.showBanner(label, 1800);
          break;
        }
        case EvType.RoundStart: if (!this.sim.config.training) this.hud.showBanner(`ROUND ${e.strength}`, 1100, 'FIGHT'); break;
        case EvType.Throw: this.camera.addShake(0.2); break;
        case EvType.ThrowBreak: this.hud.showBanner('ESCAPE', 500); break;
        case EvType.Wall: this.camera.addShake(0.5); this.views[e.a as 0 | 1]?.triggerFlash(2); break;
        case EvType.Parry: this.hud.showBanner('PARRY', 500); break;
        case EvType.RingOut: this.camera.addShake(0.4); break;
        default: break;
      }
    }
  }

  render(alpha: number, dtMs: number, renderer: WebGPURenderer): void {
    const [a, b] = this.sim.fighters;
    const slowmo = this.sim.round.phase === RoundPhase.KO;
    this.views[0].update(a, alpha, dtMs);
    this.views[1].update(b, alpha, dtMs);
    this.camera.update(a, b, alpha, dtMs, slowmo);
    this.hitboxes.setVisible(debugFlags.hitboxes);
    this.hitboxes.update(this.sim.fighters, this.sim.chars);
    this.frameData.setVisible(debugFlags.frameData);
    this.frameData.update(this.sim.fighters, this.sim.chars, this.sim.frame);
    this.inputDisplay.setVisible(debugFlags.inputDisplay);
    this.inputDisplay.render();
    this.hud.update(this.sim, dtMs);
    renderer.render(this.scene.scene, this.scene.camera);
  }

  dispose(): void {
    this.scene.scene.remove(this.hitboxes.group);
    this.hud.el.remove();
  }
}
