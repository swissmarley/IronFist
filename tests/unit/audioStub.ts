/**
 * Minimal fake of the Web Audio API for unit tests: records node creation,
 * connections and AudioParam automation without producing sound.
 */
import type { AudioCtx } from '@/audio/types';

export interface ParamCall { method: string; value: number; time: number }

export class FakeParam {
  value: number;
  readonly calls: ParamCall[] = [];
  constructor(v: number) { this.value = v; }
  setValueAtTime(value: number, time: number): this { this.calls.push({ method: 'set', value, time }); this.value = value; return this; }
  linearRampToValueAtTime(value: number, time: number): this { this.calls.push({ method: 'lin', value, time }); this.value = value; return this; }
  exponentialRampToValueAtTime(value: number, time: number): this { this.calls.push({ method: 'exp', value, time }); this.value = value; return this; }
  setTargetAtTime(value: number, time: number, _tc: number): this { this.calls.push({ method: 'target', value, time }); this.value = value; return this; }
  cancelScheduledValues(_t: number): this { return this; }
  /** Last automation target written (or the plain value). */
  get last(): number { return this.calls.length ? (this.calls[this.calls.length - 1]?.value ?? this.value) : this.value; }
}

export class FakeNode {
  readonly kind: string;
  readonly outputs: FakeNode[] = [];
  constructor(kind: string) { this.kind = kind; }
  connect(n: FakeNode): FakeNode { this.outputs.push(n); return n; }
  disconnect(): void { this.outputs.length = 0; }
  /** True if this node reaches `target` through any path. */
  reaches(target: FakeNode, seen = new Set<FakeNode>()): boolean {
    if (this === target) return true;
    if (seen.has(this)) return false;
    seen.add(this);
    return this.outputs.some((o) => o.reaches(target, seen));
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
  constructor() { super('gain'); }
}

export class FakeScheduled extends FakeNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  onended: (() => void) | null = null;
  start(when = 0, _offset = 0): void {
    if (this.startTime !== null) throw new Error('start called twice');
    this.startTime = when;
  }
  stop(when = 0): void { this.stopTime = when; }
}

export class FakeOscillator extends FakeScheduled {
  type: OscillatorType = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  constructor() { super('oscillator'); }
}

export class FakeBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly data: Float32Array[];
  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels; this.length = length; this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(ch: number): Float32Array {
    const d = this.data[ch];
    if (!d) throw new Error('bad channel');
    return d;
  }
}

export class FakeBufferSource extends FakeScheduled {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  constructor() { super('bufferSource'); }
  override start(when = 0, offset = 0): void {
    if (!this.buffer) throw new Error('no buffer');
    if (offset < 0 || offset > this.buffer.duration) throw new Error(`offset out of range: ${offset}`);
    super.start(when, offset);
  }
}

export class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
  detune = new FakeParam(0);
  constructor() { super('filter'); }
}

export class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24); knee = new FakeParam(30); ratio = new FakeParam(12);
  attack = new FakeParam(0.003); release = new FakeParam(0.25);
  constructor() { super('compressor'); }
}

export class FakePanner extends FakeNode {
  pan = new FakeParam(0);
  constructor() { super('panner'); }
}

export class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = 8000;
  state: AudioContextState = 'suspended';
  readonly destination = new FakeNode('destination');
  readonly created: FakeNode[] = [];
  resumeCalls = 0;
  closeCalls = 0;
  failResume = false;

  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.failResume) return Promise.reject(new Error('gesture required'));
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
  private track<T extends FakeNode>(n: T): T { this.created.push(n); return n; }
  createGain(): FakeGain { return this.track(new FakeGain()); }
  createOscillator(): FakeOscillator { return this.track(new FakeOscillator()); }
  createBiquadFilter(): FakeFilter { return this.track(new FakeFilter()); }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer { return new FakeBuffer(channels, length, sampleRate); }
  createBufferSource(): FakeBufferSource { return this.track(new FakeBufferSource()); }
  createDynamicsCompressor(): FakeCompressor { return this.track(new FakeCompressor()); }
  createStereoPanner(): FakePanner { return this.track(new FakePanner()); }

  nodes<T extends FakeNode>(kind: string): T[] { return this.created.filter((n) => n.kind === kind) as T[]; }
  /** Every scheduled source (oscillator or buffer source) created so far. */
  sources(): FakeScheduled[] { return this.created.filter((n): n is FakeScheduled => n instanceof FakeScheduled); }
  asCtx(): AudioCtx { return this as unknown as AudioCtx; }
}
