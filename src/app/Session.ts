import type * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { rigOptionsFor } from '@/render/rig/look';
import { MatchSim } from '@/sim/match';
import type { ArenaDef, MatchConfig } from '@/sim/config';
import type { PostPipeline } from '@/render/PostPipeline';
import type { CharacterDef } from '@/sim/types';
import { InputSystem } from '@/input/InputSystem';
import { GreyBoxScene } from '@/render/GreyBoxScene';
import { FighterView } from '@/render/FighterView';
import { CameraRig } from '@/render/CameraRig';
import { HitboxViewer } from '@/render/HitboxViewer';
import { Hud } from '@/ui/Hud';
import { ContactShadow } from '@/render/ContactShadow';
import { FrameDataOverlay } from '@/debug/FrameDataOverlay';
import { InputDisplay } from '@/debug/InputDisplay';
import { debugFlags } from '@/debug/DebugFlags';
import { EvType } from '@/sim/events';
import { RoundPhase } from '@/sim/match';
import type { InputFrame } from '@/input/InputFrame';
import { TUNING } from '@/sim/config';
import type { GameAudio } from '@/audio';
import { VfxManager } from '@/render/vfx/VfxManager';

export interface SessionOptions {
  chars: [CharacterDef, CharacterDef];
  match: Partial<MatchConfig>;
  scene: GreyBoxScene;
  uiRoot: HTMLElement;
  debugRoot: HTMLElement;
  input: InputSystem;
  audio?: GameAudio;
  maxParticles?: number;
  arena?: ArenaDef;
  /** Accessibility: play a pitched cue when an attack starts (high / mid / low). */
  soundCues?: boolean;
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
  private readonly shadows: [ContactShadow, ContactShadow];
  private readonly soundCues: boolean;
  readonly frameData: FrameDataOverlay;
  readonly inputDisplay: InputDisplay;
  readonly vfx: VfxManager;
  private post: PostPipeline | null = null;
  private flash = 0;
  private readonly input: InputSystem;
  private readonly scene: GreyBoxScene;
  private readonly audio: GameAudio | null;
  /** Inputs recorded this session (for replay / tests). */
  readonly inputLog: number[] = [];
  private lastInputs: [InputFrame, InputFrame] = [0, 0];
  /** Inputs consumed by the most recent sim step (for replay recording). */
  lastInputsUsed: [InputFrame, InputFrame] = [0, 0];
  private slowmoCounter = 0;
  /** Sim steps per loop step during the KO slow-motion phase (1 = every step). */
  koSlowmoDivisor = 3;
  /** Hook run before each input sample (practice dummy control). */
  onBeforeSample: (() => void) | null = null;
  hpRegen = true;

  constructor(o: SessionOptions) {
    this.soundCues = o.soundCues === true;
    this.sim = new MatchSim(o.chars, { ...(o.arena && !o.match.arena ? { arena: o.arena } : {}), ...o.match });
    this.scene = o.scene;
    this.input = o.input;
    this.audio = o.audio ?? null;
    this.views = [
      new FighterView(o.scene.fighters[0] as THREE.Group, this.sim.chars[0], rigOptionsFor(o.chars[0], 0)),
      new FighterView(o.scene.fighters[1] as THREE.Group, this.sim.chars[1], rigOptionsFor(o.chars[1], 1)),
    ];
    this.camera = new CameraRig(o.scene.camera);
    this.hitboxes = new HitboxViewer();
    o.scene.scene.add(this.hitboxes.group);
    this.vfx = new VfxManager(o.scene.scene, { maxParticles: o.maxParticles ?? 5000 });
    this.shadows = [new ContactShadow(o.scene.scene), new ContactShadow(o.scene.scene)];
    this.hud = new Hud(o.uiRoot);
    this.hud.setNames(o.chars[0].name, o.chars[1].name);
    this.frameData = new FrameDataOverlay(o.debugRoot);
    this.inputDisplay = new InputDisplay(o.debugRoot);
    this.consumeEvents(); // the constructor's RoundStart
  }

  setPost(post: PostPipeline | null): void {
    this.post = post;
  }

  sampleInput(): void {
    this.onBeforeSample?.();
    const f = this.input.sample();
    this.lastInputs = [f[0] ?? 0, f[1] ?? 0];
  }

  step(): void {
    const r = this.sim.round;
    // KO slow-motion: advance the sim on every Nth loop step (sim frames stay exact)
    if (r.phase === RoundPhase.KO && r.phaseFrame < TUNING.koSlowmoFrames) {
      this.slowmoCounter = (this.slowmoCounter + 1) % this.koSlowmoDivisor;
      if (this.slowmoCounter !== 0) return;
    } else this.slowmoCounter = 0;
    this.sim.config.trainingRegen = this.hpRegen;
    this.sim.step(this.lastInputs);
    this.lastInputsUsed = [this.lastInputs[0], this.lastInputs[1]];
    this.inputLog.push(this.lastInputs[0], this.lastInputs[1]);
    this.inputDisplay.record(this.sim.fighters);
    this.consumeEvents();
  }

  private consumeEvents(): void {
    for (const e of this.sim.events.items) {
      this.audio?.onSimEvent(e, this.sim.fighters[e.a as 0 | 1]?.x);
      const actor = this.sim.fighters[e.a as 0 | 1] ?? this.sim.fighters[0];
      this.vfx.onSimEvent(e, actor.fx, actor.fz);
      if (e.type === EvType.RoundEnd) this.audio?.announceRoundResult(this.sim.round.lastRoundResult, this.sim.round.winner);
      switch (e.type) {
        case EvType.MoveStart: {
          if (!this.soundCues) break;
          const lvl = this.sim.chars[e.a as 0 | 1]?.move(e.move)?.hits[0]?.level;
          if (lvl) this.audio?.engine.play('ui_move', { pitch: lvl === 'high' ? 1.7 : lvl === 'low' ? 0.55 : 1, gain: 0.45 });
          break;
        }
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
          this.camera.addShake(0.6); this.camera.addPunch(0.8); this.flash = 0.7;
          const label = e.strength === 1 ? 'TIME OVER' : e.strength === 2 ? 'RING OUT' : this.sim.round.lastRoundResult === 'perfect' ? 'PERFECT' : this.sim.round.lastRoundResult === 'double' ? 'DOUBLE K.O.' : 'K.O.';
          this.hud.showBanner(label, 1800);
          break;
        }
        case EvType.RoundStart: if (!this.sim.config.training) this.hud.showBanner(`ROUND ${e.strength}`, 1100, 'FIGHT'); break;
        case EvType.Throw: this.camera.addShake(0.2); break;
        case EvType.ThrowBreak: this.hud.showBanner('ESCAPE', 500); break;
        case EvType.Wall: this.camera.addShake(0.5); this.views[e.a as 0 | 1]?.triggerFlash(2); this.flash = Math.max(this.flash, 0.25); break;
        case EvType.Parry: this.hud.showBanner('PARRY', 500); break;
        case EvType.RingOut: this.camera.addShake(0.4); break;
        default: break;
      }
    }
  }

  render(alpha: number, dtMs: number, renderer: WebGPURenderer): void {
    const [a, b] = this.sim.fighters;
    const slowmo = this.sim.round.phase === RoundPhase.KO;
    this.views[0].update(a, b, alpha, dtMs);
    this.views[1].update(b, a, alpha, dtMs);
    this.shadows[0].update(this.views[0].group.position);
    this.shadows[1].update(this.views[1].group.position);
    this.camera.update(a, b, alpha, dtMs, slowmo);
    this.hitboxes.setVisible(debugFlags.hitboxes);
    this.hitboxes.update(this.sim.fighters, this.sim.chars);
    this.frameData.setVisible(debugFlags.frameData);
    this.frameData.update(this.sim.fighters, this.sim.chars, this.sim.frame);
    this.inputDisplay.setVisible(debugFlags.inputDisplay);
    this.inputDisplay.render();
    this.hud.update(this.sim, dtMs);
    this.vfx.update(slowmo ? dtMs / 3 : dtMs, this.scene.camera.position);
    if (this.audio) {
      this.audio.setListener(Math.trunc((a.x + b.x) / 2), Math.trunc((a.z + b.z) / 2));
      this.audio.setHealthState(a.hp / a.maxHp, b.hp / b.maxHp, this.sim.round.phase);
      this.audio.update(dtMs);
    }
    if (this.post) {
      this.flash = Math.max(0, this.flash - dtMs / 260);
      this.post.setFlash(this.flash * 0.6);
      this.post.render();
    } else renderer.render(this.scene.scene, this.scene.camera);
  }

  dispose(): void {
    this.vfx.dispose();
    for (const v of this.views) { v.group.remove(v.rig.group); v.rig.dispose(); }
    this.scene.scene.remove(this.hitboxes.group);
    this.shadows[0].dispose(); this.shadows[1].dispose();
    this.hud.el.remove();
  }
}
