import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { BONE_INDEX, HUMANOID, Skeleton, type BoneName } from '@/anim/skeleton';
import { evaluateClip, Pose } from '@/anim/pose';
import { buildClipSet } from '@/anim/clips';
import { buildMoveClip } from '@/anim/templates';
import { resolveStance, STANCES } from '@/anim/stances';
import { INTROS, WINS } from '@/anim/ceremonies';
import { CHARACTERS, ROSTER_IDS } from '@/data/characters';
import { TUNING } from '@/sim/config';

const sk = new Skeleton(HUMANOID);
const X = (b: BoneName): { pos: Vector3; tip: Vector3 } => sk.xforms[BONE_INDEX[b]] as { pos: Vector3; tip: Vector3 };
const FOOT_R = 0.05, LIMB_R = 0.045;
const pa = new Vector3(), pb = new Vector3();

function segDist(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3): number {
  let best = Infinity;
  for (let i = 0; i <= 8; i++) {
    pa.lerpVectors(a0, a1, i / 8);
    for (let j = 0; j <= 8; j++) best = Math.min(best, pa.distanceTo(pb.lerpVectors(b0, b1, j / 8)));
  }
  return best;
}

/** Foot bottoms (m above the floor) and the smallest forearm/hand gap to the torso capsules. */
function measure(p: Pose): { feet: [number, number]; clearance: number } {
  sk.solve(p.rots as Quaternion[], p.root, 0);
  const foot = (s: 'L' | 'R'): number => Math.min(X(`foot${s}`).pos.y, X(`foot${s}`).tip.y) - FOOT_R;
  let clearance = Infinity;
  for (const limb of ['forearmL', 'handL', 'forearmR', 'handR'] as BoneName[]) {
    for (const t of ['chest', 'spine', 'hips'] as BoneName[]) {
      const r = (HUMANOID[BONE_INDEX[t]]?.radius ?? 0) + LIMB_R;
      clearance = Math.min(clearance, segDist(X(limb).pos, X(limb).tip, X(t).pos, X(t).tip) - r);
    }
  }
  return { feet: [foot('L'), foot('R')], clearance };
}

describe('per-character stances, intros and wins', () => {
  it('every roster fighter names known stance / intro / win sets', () => {
    for (const id of ROSTER_IDS) {
      const a = CHARACTERS[id]?.anim;
      expect(a, id).toBeDefined();
      expect(STANCES[a?.stance ?? ''], `${id} stance`).toBeDefined();
      expect(INTROS[a?.intro ?? ''], `${id} intro`).toBeDefined();
      expect(WINS[a?.win ?? ''], `${id} win`).toBeDefined();
    }
    const stances = new Set(ROSTER_IDS.map((id) => CHARACTERS[id]?.anim?.stance));
    expect(stances.size).toBe(ROSTER_IDS.length);
  });

  it('keeps feet on the floor and arms off the torso in every frame', () => {
    const pose = new Pose();
    for (const id of ROSTER_IDS) {
      const clips = buildClipSet(CHARACTERS[id]?.anim);
      for (const name of ['idle', 'intro', 'win'] as const) {
        const clip = clips[name];
        for (let t = 0; t <= clip.length; t += 3) {
          const m = measure(evaluateClip(clip, t, pose));
          const tag = `${id} ${name} f${t}`;
          expect(Math.min(...m.feet), `${tag} foot below floor`).toBeGreaterThan(-0.015);
          // idle: both feet planted; ceremonies may raise one leg (crane, axe kick)
          if (name === 'idle') expect(Math.max(...m.feet), `${tag} foot floating`).toBeLessThan(0.035);
          else expect(Math.min(...m.feet), `${tag} no foot on the floor`).toBeLessThan(0.035);
          expect(m.clearance, `${tag} arm through torso`).toBeGreaterThan(-0.005);
        }
      }
    }
  });

  it('intros settle into the stance before the round starts; wins last 1.5-2.5 s', () => {
    const a = new Pose(), b = new Pose();
    for (const id of ROSTER_IDS) {
      const clips = buildClipSet(CHARACTERS[id]?.anim);
      expect(clips.intro.length).toBeGreaterThanOrEqual(90);
      expect(clips.intro.length).toBeLessThanOrEqual(150);
      expect(clips.win.length).toBeGreaterThanOrEqual(90);
      expect(clips.win.length).toBeLessThanOrEqual(150);
      evaluateClip(clips.intro, TUNING.roundStartFrames, a);
      evaluateClip(clips.idle, 0, b);
      a.rots.forEach((q, i) => expect(Math.abs(q.dot(b.rots[i] as Quaternion)), `${id} bone ${i}`).toBeGreaterThan(0.9999));
      expect(a.root.distanceTo(b.root)).toBeLessThan(1e-6);
    }
  });

  it('a stance never changes the active frames that hit capsules are baked from', () => {
    const p0 = new Pose(), p1 = new Pose();
    for (const id of ROSTER_IDS) {
      const def = CHARACTERS[id];
      if (!def) continue;
      const rest = resolveStance(def.anim?.stance).rest;
      for (const m of def.moves) {
        if (m.hits.length === 0) continue;
        const shared = buildMoveClip(m), own = buildMoveClip(m, rest);
        for (const h of m.hits) for (let f = h.frames[0]; f <= h.frames[1]; f++) {
          evaluateClip(shared, f, p0);
          evaluateClip(own, f, p1);
          p0.rots.forEach((q, i) => expect(Math.abs(q.dot(p1.rots[i] as Quaternion)), `${id} ${m.id} f${f}`).toBeGreaterThan(0.99999));
        }
      }
    }
  });

  it('the greybox default clip set is unchanged', () => {
    const a = buildClipSet(), b = buildClipSet(CHARACTERS.greybox?.anim);
    for (const k of ['idle', 'intro', 'win', 'dash', 'jump', 'landing'] as const) {
      expect(a[k].length).toBe(b[k].length);
      expect(a[k].keys.map((x) => x.t)).toEqual(b[k].keys.map((x) => x.t));
    }
    expect(a.idle.length).toBe(120);
    expect(a.intro.keys.map((x) => x.t)).toEqual([0, 50, 80, 100]);
    expect(a.win.keys.map((x) => x.t)).toEqual([0, 25, 90, 150]);
  });
});
