import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AudioEngine } from '@/audio/AudioEngine';
import { SFX_IDS, type SfxId } from '@/audio/sfx';
import type { PlayOpts } from '@/audio/types';
import { LAYERS, MusicPlayer, THEME_NAMES, THEMES, type NoteTrace } from '@/audio/music';
import { createAnnouncer, SpeechAnnouncer, SynthAnnouncer } from '@/audio/announcer';
import { CrowdAmbience } from '@/audio/crowd';
import { GameAudio, koLine, roundLine, sfxForEvent } from '@/audio/index';
import { EvType, type SimEvent } from '@/sim/events';
import { RoundPhase } from '@/sim/rounds';
import { FakeAudioContext, FakeGain, type FakeParam } from './audioStub';

async function engine(): Promise<{ fake: FakeAudioContext; eng: AudioEngine }> {
  const fake = new FakeAudioContext();
  const eng = new AudioEngine({ context: fake.asCtx() });
  await eng.init();
  return { fake, eng };
}

function ev(type: EvType, strength = 0, extra: Partial<SimEvent> = {}): SimEvent {
  return { type, a: 0, b: 1, x: 500, y: 0, z: -200, strength, move: -1, damage: 0, ...extra };
}

function gain(node: unknown): FakeParam { return (node as FakeGain).gain; }

describe('AudioEngine', () => {
  it('wires buses -> master -> limiter -> destination and ducks music through a separate gain', async () => {
    const { fake, eng } = await engine();
    expect(eng.ready).toBe(true);
    expect(fake.state).toBe('running');
    const master = eng.bus('master');
    const limiter = eng.limiterNode;
    const duck = eng.musicDuckNode;
    expect(master && limiter && duck).toBeTruthy();
    if (!master || !limiter || !duck) return;
    const m = master as unknown as FakeGain;
    expect(m.outputs).toContain(limiter);
    expect((limiter as unknown as FakeGain).outputs).toContain(fake.destination);
    for (const name of ['sfx', 'voice', 'ui'] as const) expect((eng.bus(name) as unknown as FakeGain).outputs).toContain(master);
    expect((eng.bus('music') as unknown as FakeGain).outputs).toContain(duck);
    expect((duck as unknown as FakeGain).outputs).toContain(master);
    expect((eng.bus('music') as unknown as FakeGain).reaches(fake.destination)).toBe(true);
  });

  it('bus gains are clamped, remembered and applied to the graph', async () => {
    const { eng } = await engine();
    eng.setBusGain('music', 0.25);
    expect(eng.getBusGain('music')).toBe(0.25);
    expect(gain(eng.bus('music')).last).toBe(0.25);
    eng.setBusGain('sfx', 7);
    expect(eng.getBusGain('sfx')).toBe(1);
    eng.setBusGain('ui', -1);
    expect(eng.getBusGain('ui')).toBe(0);
  });

  it('is a no-op before init and never throws without a context', () => {
    const eng = new AudioEngine({ createContext: () => null });
    expect(eng.play('hit_heavy')).toBe(0);
    eng.setBusGain('master', 0.5);
    expect(eng.getBusGain('master')).toBe(0.5);
    eng.duck(0.5, 100);
    eng.update(16);
    eng.dispose();
  });

  it('plays every SfxId through a panned voice on the right bus', async () => {
    for (const id of SFX_IDS) {
      const { fake, eng } = await engine();
      const before = fake.created.length;
      const dur = eng.play(id, { x: 1.5, z: 0.2, strength: 2, pitch: 1.1, gain: 0.8 });
      expect(dur, id).toBeGreaterThan(0);
      expect(fake.created.length, id).toBeGreaterThan(before);
      const started = fake.sources().filter((s) => s.startTime !== null);
      expect(started.length, id).toBeGreaterThan(0);
      for (const s of started) expect(s.stopTime, id).not.toBeNull();
      const bus = eng.bus(id.startsWith('ui_') ? 'ui' : 'sfx') as unknown as FakeGain;
      const panner = fake.nodes<FakeGain>('panner').pop();
      expect(panner?.outputs, id).toContain(bus);
      expect(eng.activeVoices).toBe(1);
    }
  });

  it('spatialises relative to the listener and attenuates with distance', async () => {
    const { fake, eng } = await engine();
    eng.setListener(2, 0);
    eng.play('hit_light', { x: 6, z: 0 });
    const far = fake.nodes<FakeGain>('panner').pop();
    expect((far as unknown as { pan: FakeParam }).pan.value).toBeGreaterThan(0.5);
    eng.play('hit_light', { x: -2, z: 0 });
    const left = fake.nodes<FakeGain>('panner').pop();
    expect((left as unknown as { pan: FakeParam }).pan.value).toBeLessThan(-0.5);
    eng.play('hit_light', { x: 2, z: 0 });
    const centre = fake.nodes<FakeGain>('panner').pop();
    expect((centre as unknown as { pan: FakeParam }).pan.value).toBe(0);
  });

  it('ducks music and recovers over time', async () => {
    const { eng } = await engine();
    const duck = gain(eng.musicDuckNode);
    eng.duck(0.6, 200);
    expect(duck.last).toBeCloseTo(0.4);
    eng.update(100);
    expect(duck.last).toBeCloseTo(0.7);
    eng.update(200);
    expect(duck.last).toBe(1);
  });

  it('steals the oldest voice beyond the polyphony cap and prunes finished ones', async () => {
    const fake = new FakeAudioContext();
    const eng = new AudioEngine({ context: fake.asCtx(), maxVoices: 2 });
    await eng.init();
    eng.play('step'); eng.play('step'); eng.play('step');
    expect(eng.activeVoices).toBe(2);
    fake.currentTime = 5;
    eng.update(16);
    expect(eng.activeVoices).toBe(0);
  });

  it('attachUnlock resumes on the first gesture and then detaches', async () => {
    const fake = new FakeAudioContext();
    fake.failResume = true;
    const eng = new AudioEngine({ context: fake.asCtx() });
    await eng.init();
    expect(fake.state).toBe('suspended');
    const target = new EventTarget();
    eng.attachUnlock(target);
    fake.failResume = false;
    target.dispatchEvent(new Event('pointerdown'));
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.state).toBe('running');
    const calls = fake.resumeCalls;
    target.dispatchEvent(new Event('keydown'));
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.resumeCalls).toBe(calls);
  });

  it('dispose closes the context and silences play', async () => {
    const { fake, eng } = await engine();
    eng.dispose();
    expect(fake.closeCalls).toBe(1);
    expect(eng.ready).toBe(false);
    expect(eng.play('ko')).toBe(0);
  });
});

describe('MusicPlayer', () => {
  it('schedules notes in time order ahead of the clock and keeps going as time advances', async () => {
    const { fake, eng } = await engine();
    const music = new MusicPlayer(eng, { lookahead: 0.3 });
    const notes: NoteTrace[] = [];
    music.onNote = (n) => notes.push(n);
    music.play('neon');
    music.setIntensity(3);
    music.update(16);
    expect(music.scheduledSteps).toBeGreaterThan(0);
    const first = music.scheduledSteps;
    for (let i = 1; i < 30; i++) { fake.currentTime = i * 0.1; music.update(100); }
    expect(music.scheduledSteps).toBeGreaterThan(first);
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.time).toBeGreaterThanOrEqual(notes[i - 1]!.time);
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.step).toBeGreaterThanOrEqual(notes[i - 1]!.step);
    const layers = new Set(notes.map((n) => n.layer));
    for (const l of LAYERS) expect(layers.has(l), l).toBe(true);
    const step = 60 / THEMES.neon.bpm / 4;
    const kicks = notes.filter((n) => n.layer === 'drums' && n.midi === 36);
    expect(kicks[1]!.time - kicks[0]!.time).toBeCloseTo(step * 4, 5);
  });

  it('intensity crossfades layer gains and gates what gets scheduled', async () => {
    const { fake, eng } = await engine();
    const music = new MusicPlayer(eng);
    const notes: NoteTrace[] = [];
    music.onNote = (n) => notes.push(n);
    music.play('dojo');
    music.update(16);
    expect(gain(music.layerGain('pad')).last).toBe(1);
    expect(gain(music.layerGain('drums')).last).toBe(1);
    expect(gain(music.layerGain('bass')).last).toBe(0);
    expect(gain(music.layerGain('lead')).last).toBe(0);
    music.setIntensity(0);
    expect(gain(music.layerGain('drums')).last).toBe(0);
    notes.length = 0;
    for (let i = 1; i < 20; i++) { fake.currentTime = i * 0.1; music.update(100); }
    expect(notes.every((n) => n.layer === 'pad')).toBe(true);
    music.setIntensity(3);
    for (const l of LAYERS) expect(gain(music.layerGain(l)).last).toBe(1);
    notes.length = 0;
    for (let i = 20; i < 40; i++) { fake.currentTime = i * 0.1; music.update(100); }
    expect(notes.some((n) => n.layer === 'bass')).toBe(true);
    expect(notes.some((n) => n.layer === 'lead')).toBe(true);
  });

  it('tempo scale stretches step spacing and stop fades everything out', async () => {
    const { fake, eng } = await engine();
    const music = new MusicPlayer(eng, { lookahead: 1 });
    const notes: NoteTrace[] = [];
    music.onNote = (n) => notes.push(n);
    music.play('colosseum');
    music.setIntensity(1);
    music.setTempoScale(0.5);
    music.update(16);
    const kicks = notes.filter((n) => n.layer === 'drums' && n.midi === 36);
    expect(kicks[1]!.time - kicks[0]!.time).toBeCloseTo((60 / THEMES.colosseum.bpm / 4) * 2 * 2, 5);
    music.stop(300);
    expect(music.isPlaying).toBe(false);
    for (const l of LAYERS) expect(gain(music.layerGain(l)).last).toBe(0);
    const before = music.scheduledSteps;
    fake.currentTime = 10;
    music.update(100);
    expect(music.scheduledSteps).toBe(before);
  });

  it('every theme plays a full bar on every layer without throwing', async () => {
    for (const name of THEME_NAMES) {
      const { fake, eng } = await engine();
      const music = new MusicPlayer(eng, { lookahead: 0.5 });
      music.play(name);
      music.setIntensity(3);
      const bar = (60 / THEMES[name].bpm) * 4;
      for (let t = 0; t < bar + 0.5; t += 0.1) { fake.currentTime = t; music.update(100); }
      expect(music.scheduledSteps, name).toBeGreaterThanOrEqual(16);
      expect(music.currentTheme).toBe(name);
    }
  });

  it('is safe to drive before the engine has a context', () => {
    const eng = new AudioEngine({ createContext: () => null });
    const music = new MusicPlayer(eng);
    music.play('forest');
    music.setIntensity(2);
    music.update(16);
    music.stop();
    expect(music.scheduledSteps).toBe(0);
  });
});

describe('Announcer', () => {
  const g = globalThis as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };
  afterEach(() => { delete g.speechSynthesis; delete g.SpeechSynthesisUtterance; });

  it('falls back to the synth placeholder when speechSynthesis is missing', async () => {
    const { fake, eng } = await engine();
    const a = createAnnouncer('speech', eng);
    expect(a).toBeInstanceOf(SynthAnnouncer);
    expect(a.kind).toBe('synth');
    const before = fake.created.length;
    a.say('fight');
    expect(fake.created.length).toBeGreaterThan(before);
    expect(createAnnouncer('synth', eng).kind).toBe('synth');
  });

  it('uses speechSynthesis when present and keeps the synth as a fallback', async () => {
    const spoken: string[] = [];
    class Utter { text: string; rate = 1; pitch = 1; volume = 1; constructor(t: string) { this.text = t; } }
    g.SpeechSynthesisUtterance = Utter;
    g.speechSynthesis = { speak: (u: Utter) => spoken.push(u.text), cancel: () => undefined };
    const { eng } = await engine();
    const a = createAnnouncer('speech', eng);
    expect(a).toBeInstanceOf(SpeechAnnouncer);
    a.say('ko');
    expect(spoken).toEqual(['K.O.!']);
    expect(createAnnouncer('synth', eng).kind).toBe('synth');
  });
});

describe('CrowdAmbience', () => {
  it('loops a filtered bed and follows excitement', async () => {
    const { fake, eng } = await engine();
    const crowd = new CrowdAmbience(eng);
    crowd.start();
    crowd.update(16);
    const loops = fake.nodes<FakeGain>('bufferSource').filter((s) => (s as unknown as { loop: boolean }).loop);
    expect(loops.length).toBe(2);
    expect(loops[0]!.reaches(fake.destination)).toBe(true);
    crowd.setExcitement(0);
    for (let i = 0; i < 100; i++) crowd.update(50);
    const quiet = gain(fake.nodes<FakeGain>('gain').find((n) => n.outputs.includes(eng.bus('sfx') as unknown as FakeGain))).last;
    crowd.setExcitement(1);
    for (let i = 0; i < 100; i++) crowd.update(50);
    const loud = gain(fake.nodes<FakeGain>('gain').find((n) => n.outputs.includes(eng.bus('sfx') as unknown as FakeGain))).last;
    expect(loud).toBeGreaterThan(quiet);
    const play = vi.spyOn(eng, 'play');
    crowd.react('roar');
    expect(play).toHaveBeenCalledWith('crowd_cheer', expect.anything());
    expect(crowd.currentExcitement).toBe(1);
    crowd.dispose();
  });
});

describe('GameAudio', () => {
  type PlaySpy = MockInstance<(id: SfxId, opts?: PlayOpts) => number>;
  async function game(): Promise<{ fake: FakeAudioContext; audio: GameAudio; play: PlaySpy; said: string[] }> {
    const fake = new FakeAudioContext();
    const audio = new GameAudio({ engine: new AudioEngine({ context: fake.asCtx() }), announcer: 'synth', theme: 'dojo', fightDelayMs: 1000 });
    await audio.init();
    const play = vi.spyOn(audio.engine, 'play');
    const said: string[] = [];
    audio.announcer = { kind: 'silent', say: (l) => { said.push(l); } };
    return { fake, audio, play, said };
  }

  const table: [EvType, number, SfxId | null][] = [
    [EvType.Hit, 0, 'hit_light'], [EvType.Hit, 1, 'hit_medium'], [EvType.Hit, 2, 'hit_heavy'], [EvType.Hit, 3, 'hit_launch'],
    [EvType.Counter, 2, 'hit_counter'], [EvType.Block, 0, 'block'], [EvType.Block, 2, 'block_heavy'],
    [EvType.Whiff, 0, 'whoosh_light'], [EvType.MoveStart, 0, 'whoosh_light'], [EvType.Launch, 2, 'whoosh_heavy'],
    [EvType.Land, 1, 'land'], [EvType.Land, 2, 'land_heavy'], [EvType.Throw, 1, 'throw_grab'], [EvType.ThrowBreak, 0, 'throw_break'],
    [EvType.Wall, 2, 'wall_splat'], [EvType.KO, 0, 'ko'], [EvType.RoundStart, 1, 'round_start'], [EvType.RoundEnd, 0, null],
    [EvType.Armour, 1, 'armour'], [EvType.Parry, 1, 'parry'], [EvType.Step, 1, 'sidestep'], [EvType.Dash, 1, 'dash'],
    [EvType.Jump, 0, 'jump'], [EvType.RingOut, 0, 'whoosh_heavy'],
  ];

  it('maps every sim event type to the expected SFX', async () => {
    const { audio, play } = await game();
    for (const [type, strength, id] of table) {
      expect(sfxForEvent(ev(type, strength))).toBe(id);
      play.mockClear();
      audio.onSimEvent(ev(type, strength));
      if (id) expect(play, `${EvType[type]}`).toHaveBeenCalledWith(id, expect.objectContaining({ x: 0.5, z: -0.2 }));
      else expect(play.mock.calls.filter((c) => c[0] !== 'crowd_cheer' && c[0] !== 'crowd_gasp')).toHaveLength(0);
    }
    const seen = new Set(table.map((r) => r[0]));
    for (const t of Object.values(EvType).filter((v): v is EvType => typeof v === 'number')) expect(seen.has(t), EvType[t]).toBe(true);
  });

  it('pans swings at the attacker when attackerX is given', async () => {
    const { audio, play } = await game();
    audio.onSimEvent(ev(EvType.MoveStart, 0), -1500);
    expect(play).toHaveBeenCalledWith('whoosh_light', expect.objectContaining({ x: -1.5 }));
    audio.onSimEvent(ev(EvType.Hit, 1), -1500);
    expect(play).toHaveBeenLastCalledWith('hit_medium', expect.objectContaining({ x: 0.5, strength: 1 }));
  });

  it('announces rounds, delays "fight", and handles KO flavours', async () => {
    const { audio, said } = await game();
    audio.onSimEvent(ev(EvType.RoundStart, 1));
    expect(said).toEqual(['round1']);
    audio.update(500);
    expect(said).toEqual(['round1']);
    audio.update(600);
    expect(said).toEqual(['round1', 'fight']);
    audio.onSimEvent(ev(EvType.RoundStart, 4));
    expect(said.at(-1)).toBe('finalRound');
    audio.onSimEvent(ev(EvType.KO, 2));
    expect(said.at(-1)).toBe('ringOut');
    expect(audio.music.currentTempoScale).toBe(0.5);
    expect(gain(audio.engine.musicDuckNode).last).toBeCloseTo(0.2);
    audio.update(2000);
    expect(said.slice(said.indexOf('ringOut'))).toEqual(['ringOut']); // KO cancels the pending "fight"

    audio.onSimEvent(ev(EvType.RoundEnd, 0, { a: 0 }));
    audio.update(600);
    expect(said.at(-1)).toBe('youWin');
    audio.onSimEvent(ev(EvType.RoundEnd, 0, { a: 1 }));
    audio.update(600);
    expect(said.at(-1)).toBe('youLose');
    audio.onSimEvent(ev(EvType.RoundStart, 2));
    expect(audio.music.currentTempoScale).toBe(1);
    expect(koLine(1)).toBe('timeOver');
    expect(roundLine(3)).toBe('round3');
    audio.announceRoundResult('perfect', 0);
    expect(said.at(-1)).toBe('perfect');
  });

  it('drives music intensity and crowd excitement from health and phase', async () => {
    const { audio } = await game();
    audio.update(16);
    expect(audio.music.isPlaying).toBe(true);
    expect(audio.music.currentTheme).toBe('dojo');
    audio.setHealthState(1, 1, RoundPhase.Fight);
    expect(audio.music.currentIntensity).toBe(1);
    audio.setHealthState(0.9, 0.4, RoundPhase.Fight);
    expect(audio.music.currentIntensity).toBe(2);
    audio.setHealthState(0.1, 0.4, RoundPhase.Fight);
    expect(audio.music.currentIntensity).toBe(3);
    const tense = audio.crowd.currentExcitement;
    audio.setHealthState(0.1, 0.4, RoundPhase.KO);
    expect(audio.music.currentIntensity).toBe(0);
    expect(audio.crowd.currentExcitement).toBeGreaterThan(tense);
    audio.setHealthState(1, 1, RoundPhase.Intro);
    expect(audio.music.currentIntensity).toBe(1);
    audio.setTheme('neon');
    expect(audio.music.currentTheme).toBe('neon');
    audio.dispose();
  });

  it('can be constructed and updated with no audio support at all', () => {
    const audio = new GameAudio({ engineOptions: { createContext: () => null }, theme: 'menu' });
    audio.onSimEvent(ev(EvType.Hit, 3));
    audio.setHealthState(0.5, 0.5, RoundPhase.Fight);
    audio.update(16);
    audio.dispose();
  });
});
