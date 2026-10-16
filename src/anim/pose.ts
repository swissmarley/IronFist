import { Euler, Quaternion, Vector3 } from 'three';
import { BONES, type BoneName } from './skeleton';

const DEG = Math.PI / 180;

/** Authoring form: Euler degrees per bone (XYZ order) + root offset in metres. */
export type PoseEuler = Partial<Record<BoneName, [number, number, number]>> & { root?: [number, number, number] };

/** Runtime form: one quaternion per bone + root offset. */
export class Pose {
  readonly rots: Quaternion[];
  readonly root = new Vector3();
  constructor() {
    this.rots = BONES.map(() => new Quaternion());
  }
  copy(o: Pose): this {
    for (let i = 0; i < this.rots.length; i++) (this.rots[i] as Quaternion).copy(o.rots[i] as Quaternion);
    this.root.copy(o.root);
    return this;
  }
  identity(): this {
    for (const q of this.rots) q.identity();
    this.root.set(0, 0, 0);
    return this;
  }
  /** this = slerp(a, b, t) */
  lerpPoses(a: Pose, b: Pose, t: number): this {
    for (let i = 0; i < this.rots.length; i++) (this.rots[i] as Quaternion).slerpQuaternions(a.rots[i] as Quaternion, b.rots[i] as Quaternion, t);
    this.root.lerpVectors(a.root, b.root, t);
    return this;
  }
  /** Additively layer `o` scaled by weight (used for hit-reaction / breathing layers). */
  addLayer(o: Pose, weight: number): this {
    const tmp = scratchQ;
    for (let i = 0; i < this.rots.length; i++) {
      tmp.identity().slerp(o.rots[i] as Quaternion, weight);
      (this.rots[i] as Quaternion).multiply(tmp);
    }
    this.root.addScaledVector(o.root, weight);
    return this;
  }
}
const scratchQ = new Quaternion();
const scratchE = new Euler();

export function poseFromEuler(e: PoseEuler, base?: Pose): Pose {
  const p = new Pose();
  if (base) p.copy(base);
  for (const name of BONES) {
    const r = e[name];
    if (!r) continue;
    scratchE.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ');
    (p.rots[BONES.indexOf(name)] as Quaternion).setFromEuler(scratchE);
  }
  if (e.root) p.root.set(e.root[0], e.root[1], e.root[2]);
  return p;
}

/** Mirror a pose left<->right (for mirrored moves / stances). */
export function mirrorEuler(e: PoseEuler): PoseEuler {
  const out: PoseEuler = {};
  const swap = (n: string): BoneName => (n.endsWith('L') ? (n.slice(0, -1) + 'R') : n.endsWith('R') ? (n.slice(0, -1) + 'L') : n) as BoneName;
  for (const name of BONES) {
    const r = e[name];
    if (!r) continue;
    out[swap(name)] = [r[0], -r[1], -r[2]];
  }
  if (e.root) out.root = [-e.root[0], e.root[1], e.root[2]];
  return out;
}

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'snap' | 'overshoot';

export function ease(t: number, kind: Ease): number {
  switch (kind) {
    case 'in': return t * t;
    case 'out': return 1 - (1 - t) * (1 - t);
    case 'inOut': return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    case 'snap': return t < 0.35 ? (t / 0.35) * (t / 0.35) * 0.1 : 0.1 + 0.9 * (1 - Math.pow(1 - (t - 0.35) / 0.65, 3));
    case 'overshoot': { const s = 1.4; const u = t - 1; return u * u * ((s + 1) * u + s) + 1; }
    default: return t;
  }
}

export interface Key {
  /** Time in frames (60 Hz). */
  t: number;
  pose: Pose;
  /** Easing used when interpolating *into* this key. */
  ease: Ease;
}

export interface Clip {
  name: string;
  /** Total length in frames. */
  length: number;
  keys: Key[];
  loop: boolean;
}

/** Build a clip from Euler keys. Keys are sorted by time. */
export function makeClip(name: string, length: number, keys: { t: number; pose: PoseEuler; ease?: Ease }[], loop = false, base?: Pose): Clip {
  // Partial keys inherit every unspecified bone from the first key so that a
  // breathing/accent key never snaps limbs back to the rest pose.
  const first = keys[0]?.pose ?? {};
  const ks = keys.map((k) => ({ t: k.t, pose: poseFromEuler({ ...first, ...k.pose }, base), ease: k.ease ?? 'inOut' })).sort((a, b) => a.t - b.t);
  return { name, length, keys: ks, loop };
}

/** Build a clip from already-resolved Pose keys (used by templates that run IK). */
export function makeClipFromPoses(name: string, length: number, keys: { t: number; pose: Pose; ease?: Ease }[], loop = false): Clip {
  const ks = keys.map((k) => ({ t: k.t, pose: k.pose, ease: k.ease ?? 'inOut' })).sort((a, b) => a.t - b.t);
  return { name, length, keys: ks, loop };
}

/** Evaluate a clip at a fractional frame time into `out`. */
export function evaluateClip(clip: Clip, time: number, out: Pose): Pose {
  const keys = clip.keys;
  if (keys.length === 0) return out.identity();
  let t = time;
  if (clip.loop && clip.length > 0) { t = t % clip.length; if (t < 0) t += clip.length; }
  else t = Math.max(0, Math.min(clip.length, t));
  const first = keys[0] as Key, last = keys[keys.length - 1] as Key;
  if (t <= first.t) {
    if (clip.loop && keys.length > 1) return blend(last, first, (t + clip.length - last.t) / Math.max(1e-6, first.t + clip.length - last.t), out);
    return out.copy(first.pose);
  }
  if (t >= last.t) {
    if (clip.loop && keys.length > 1) return blend(last, first, (t - last.t) / Math.max(1e-6, first.t + clip.length - last.t), out);
    return out.copy(last.pose);
  }
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i] as Key;
    if (t <= b.t) {
      const a = keys[i - 1] as Key;
      return blend(a, b, (t - a.t) / Math.max(1e-6, b.t - a.t), out);
    }
  }
  return out.copy(last.pose);
}

function blend(a: Key, b: Key, u: number, out: Pose): Pose {
  return out.lerpPoses(a.pose, b.pose, ease(Math.max(0, Math.min(1, u)), b.ease));
}
