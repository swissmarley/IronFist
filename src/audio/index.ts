/**
 * Audio layer entry point. `GameAudio` is the facade the Session drives:
 * feed it sim events, health state and a per-frame `update()`.
 *
 * Integration:
 *   const audio = new GameAudio({ theme: 'dojo' });
 *   audio.attachUnlock(window);   // resumes on the first gesture
 *   void audio.init();            // safe before the gesture
 *   ... per frame: audio.setListener(camX, camZ); audio.onSimEvent(e); audio.update(dtMs);
 */
import { EvType, type SimEvent } from '../sim/events';
import { RoundPhase, type RoundResult } from '../sim/rounds';
import { AudioEngine, type AudioEngineOptions } from './AudioEngine';
import { createAnnouncer, type Announcer, type AnnouncerLine } from './announcer';
import { CrowdAmbience, type CrowdReaction } from './crowd';
import { MusicPlayer, type ThemeDef, type ThemeName } from './music';
import type { SfxId } from './types';

export * from './types';
export * from './AudioEngine';
export * from './sfx';
export * from './music';
export * from './announcer';
export * from './crowd';

/** Sim positions are integer millimetres; the engine works in metres. */
const MM = 0.001;
const HIT_IDS: readonly SfxId[] = ['hit_light', 'hit_medium', 'hit_heavy', 'hit_launch'];

/** Which SFX a sim event fires (null = none). Exported so tests can assert the table. */
export function sfxForEvent(e: SimEvent): SfxId | null {
  const s = e.strength;
  switch (e.type) {
    case EvType.Hit: return HIT_IDS[Math.max(0, Math.min(3, s))] ?? 'hit_medium';
    case EvType.Counter: return 'hit_counter';
    case EvType.Block: return s >= 2 ? 'block_heavy' : 'block';
    case EvType.Whiff: return 'whoosh_light';
    case EvType.MoveStart: return s >= 2 ? 'whoosh_heavy' : 'whoosh_light';
    case EvType.Launch: return 'whoosh_heavy';
    case EvType.Land: return s >= 2 ? 'land_heavy' : 'land';
    case EvType.Throw: return 'throw_grab';
    case EvType.ThrowBreak: return 'throw_break';
    case EvType.Wall: return 'wall_splat';
    case EvType.KO: return 'ko';
    case EvType.RoundStart: return 'round_start';
    case EvType.Armour: return 'armour';
    case EvType.Parry: return 'parry';
    case EvType.Step: return 'sidestep';
    case EvType.Dash: return 'dash';
    case EvType.Jump: return 'jump';
    case EvType.RingOut: return 'whoosh_heavy';
    case EvType.RoundEnd: return null;
    default: return null;
  }
}

/** Announcer line for a KO event's payload (0 ko, 1 time, 2 ring-out). */
export function koLine(strength: number): AnnouncerLine {
  return strength === 1 ? 'timeOver' : strength === 2 ? 'ringOut' : 'ko';
}

export function roundLine(roundNumber: number): AnnouncerLine {
  return roundNumber <= 1 ? 'round1' : roundNumber === 2 ? 'round2' : roundNumber === 3 ? 'round3' : 'finalRound';
}

export interface GameAudioOptions {
  engine?: AudioEngine;
  engineOptions?: AudioEngineOptions;
  announcer?: 'speech' | 'synth';
  /** Fighter index treated as "you" for win/lose lines. Default 0. */
  localPlayer?: number;
  /** Theme to start once the engine is ready. */
  theme?: ThemeName;
  /** Delay before "Fight!" follows the round call, ms. */
  fightDelayMs?: number;
}

interface PendingLine { at: number; line: AnnouncerLine }

export class GameAudio {
  readonly engine: AudioEngine;
  readonly music: MusicPlayer;
  readonly crowd: CrowdAmbience;
  announcer: Announcer;
  private readonly localPlayer: number;
  private readonly fightDelayMs: number;
  private theme: ThemeName | ThemeDef | null;
  private clock = 0;
  private pending: PendingLine[] = [];
  private started = false;
  private lastPhase: RoundPhase = RoundPhase.Intro;

  constructor(opts: GameAudioOptions = {}) {
    this.engine = opts.engine ?? new AudioEngine(opts.engineOptions ?? {});
    this.music = new MusicPlayer(this.engine);
    this.crowd = new CrowdAmbience(this.engine);
    this.announcer = createAnnouncer(opts.announcer ?? 'speech', this.engine);
    this.localPlayer = opts.localPlayer ?? 0;
    this.fightDelayMs = opts.fightDelayMs ?? 1300;
    this.theme = opts.theme ?? null;
  }

  /** Create/resume the context and start music + crowd once it exists. */
  async init(): Promise<void> {
    await this.engine.init();
    this.startIfReady();
  }

  attachUnlock(target: EventTarget): () => void { return this.engine.attachUnlock(target); }

  private startIfReady(): void {
    if (this.started || !this.engine.ready) return;
    this.started = true;
    if (this.theme) this.music.play(this.theme);
    this.crowd.start();
  }

  setTheme(theme: ThemeName | ThemeDef): void {
    this.theme = theme;
    if (this.started) this.music.play(theme);
  }

  /** Listener (camera focus) position in sim millimetres. */
  setListener(xMm: number, zMm: number): void { this.engine.setListener(xMm * MM, zMm * MM); }

  announce(line: AnnouncerLine, delayMs = 0): void {
    if (delayMs <= 0) { this.announcer.say(line); return; }
    this.pending.push({ at: this.clock + delayMs, line });
  }

  /** Called by the Session with the round result once it is known. */
  announceRoundResult(result: RoundResult, winner: number): void {
    if (result === 'perfect') this.announce('perfect');
    else if (result === 'double' || winner === 2) { this.announce('draw'); return; }
    if (winner === this.localPlayer) this.announce('youWin', 700);
    else if (winner === 0 || winner === 1) this.announce('youLose', 700);
  }

  private react(kind: CrowdReaction, strength = 1): void { this.crowd.react(kind, strength); }

  /**
   * Route a sim event to SFX, announcer, crowd and ducking. `attackerX`
   * (mm) positions swing sounds at the attacker instead of the contact point.
   */
  onSimEvent(e: SimEvent, attackerX?: number): void {
    const id = sfxForEvent(e);
    const s = e.strength;
    const swing = e.type === EvType.MoveStart || e.type === EvType.Whiff;
    const x = (swing && attackerX !== undefined ? attackerX : e.x) * MM;
    const z = e.z * MM;
    if (id) {
      const gain = e.type === EvType.Whiff ? 0.5 : e.type === EvType.MoveStart ? 0.6 : e.type === EvType.Wall && s < 2 ? 0.5 : 1;
      const strength = e.type === EvType.Hit || e.type === EvType.Counter || e.type === EvType.Wall ? Math.max(0, Math.min(3, s)) : 1;
      this.engine.play(id, { x, z, strength, gain });
    }
    switch (e.type) {
      case EvType.Hit:
        if (s >= 2) { this.engine.duck(0.3, 350); this.react(s >= 3 ? 'gasp' : 'ooh'); }
        break;
      case EvType.Counter:
        this.engine.duck(0.35, 400);
        this.react('gasp', 1.2);
        break;
      case EvType.Launch: this.react('gasp'); break;
      case EvType.ThrowBreak: this.react('ooh'); break;
      case EvType.Parry: this.react('ooh'); break;
      case EvType.Wall:
        if (s >= 2) { this.engine.duck(0.3, 300); this.react('gasp'); }
        break;
      case EvType.RingOut: this.react('gasp', 1.5); break;
      case EvType.KO:
        this.engine.duck(0.8, 1500);
        this.music.setTempoScale(0.5);
        this.react('roar');
        this.pending = [];
        this.announce(koLine(s));
        break;
      case EvType.RoundStart:
        this.music.setTempoScale(1);
        this.pending = [];
        this.announce(roundLine(s));
        this.announce('fight', this.fightDelayMs);
        break;
      case EvType.RoundEnd:
        if (e.a === 2) this.announce('draw', 500);
        else if (e.a === this.localPlayer) { this.announce('youWin', 500); this.react('cheer'); }
        else if (e.a === 0 || e.a === 1) this.announce('youLose', 500);
        break;
      default: break;
    }
  }

  /** Drive music intensity and crowd tension from health and round phase. */
  setHealthState(p1Frac: number, p2Frac: number, roundPhase: RoundPhase): void {
    const lo = Math.max(0, Math.min(1, Math.min(p1Frac, p2Frac)));
    const close = Math.abs(p1Frac - p2Frac) < 0.15;
    let level: number;
    let excitement: number;
    switch (roundPhase) {
      case RoundPhase.Fight:
        level = lo < 0.2 ? 3 : lo < 0.5 ? 2 : 1;
        excitement = 0.25 + 0.55 * (1 - lo) + (close && lo < 0.5 ? 0.15 : 0);
        break;
      case RoundPhase.KO: level = 0; excitement = 0.9; break;
      case RoundPhase.End: level = 1; excitement = 0.5; break;
      case RoundPhase.MatchOver: level = 2; excitement = 0.7; break;
      default: level = 1; excitement = 0.3; break;
    }
    this.music.setIntensity(level);
    this.crowd.setExcitement(excitement);
    this.lastPhase = roundPhase;
  }

  get phase(): RoundPhase { return this.lastPhase; }

  update(dtMs: number): void {
    this.clock += Math.max(0, dtMs);
    this.startIfReady();
    this.engine.update(dtMs);
    this.music.update(dtMs);
    this.crowd.update(dtMs);
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.clock);
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > this.clock);
        for (const p of due) this.announcer.say(p.line);
      }
    }
  }

  dispose(): void {
    this.pending = [];
    this.announcer.dispose?.();
    this.crowd.dispose();
    this.music.dispose();
    this.engine.dispose();
  }
}
