import { describe, expect, it } from 'vitest';
import { FState } from '@/sim/fighterState';
import type { MoveDef } from '@/sim/types';
import {
  ATTACK, blinkAmount, emptyFaceSignals, FACE, FACE_TARGET_COUNT, FaceState, faceTargets, faceWeights,
  moveFaceInfo, readFaceSignals, type FaceSignals, type FaceSource,
} from '@/render/rig/FaceController';

function sig(over: Partial<FaceSignals>): FaceSignals {
  return { ...emptyFaceSignals(), ...over };
}

function settle(s: FaceSignals, face = new FaceState(), ms = 1000): Float32Array {
  for (let t = 0; t < ms; t += 16) faceWeights(s, face, 16);
  return face.out;
}

const move = (over: Partial<MoveDef>): MoveDef => ({ id: 'm', name: 'm', input: '1', total: 20, hits: [], ...over }) as MoveDef;
const hit = (reaction: string, frames: [number, number]): MoveDef['hits'][number] =>
  ({ frames, level: 'mid', damage: 10, onBlock: 0, onHit: 0, reaction, capsules: [], pushback: 0, pushbackBlock: 0 }) as MoveDef['hits'][number];

describe('face controller', () => {
  it('classifies launchers and throws as shout moves', () => {
    const moves = [
      move({ hits: [hit('light', [10, 12])] }),
      move({ hits: [hit('launch', [15, 16])] }),
      move({ hits: [], properties: ['throw'] }),
      move({ hits: [hit('medium', [12, 13])], properties: ['launcher'] }),
      move({ hits: [{ ...hit('medium', [12, 13]), chReaction: 'launch' }] }),
    ];
    const info = moveFaceInfo(moves, [10, 15, 9999, 12, 12], [12, 16, 0, 13, 13]);
    expect(Array.from(info.shout)).toEqual([0, 1, 1, 1, 0]);
  });

  it('maps move frames to startup / active / recovery', () => {
    const info = moveFaceInfo([move({ hits: [hit('light', [10, 12])] })], [10], [12]);
    const src: FaceSource = { state: FState.Attack, stateFrame: 0, stateTotal: 0, hitstop: 0, ko: 0, moveIdx: 0, moveFrame: 5, throwMove: -1, lastReaction: 0 };
    const out = emptyFaceSignals();
    expect(readFaceSignals(src, info, out).attackPhase).toBe(ATTACK.startup);
    expect(readFaceSignals({ ...src, moveFrame: 11 }, info, out).attackPhase).toBe(ATTACK.active);
    expect(readFaceSignals({ ...src, moveFrame: 13 }, info, out).attackPhase).toBe(ATTACK.recovery);
    expect(readFaceSignals({ ...src, state: FState.Throw, moveIdx: -1 }, info, out).shout).toBe(true);
  });

  it('grits on active frames and shouts on launchers', () => {
    const t = new Float32Array(FACE_TARGET_COUNT);
    faceTargets(sig({ state: FState.Attack, attackPhase: ATTACK.active }), t);
    expect(t[FACE.mouthGrit]).toBe(1);
    expect(t[FACE.browAngry]).toBe(1);
    faceTargets(sig({ state: FState.Attack, attackPhase: ATTACK.active, shout: true }), t);
    expect(t[FACE.mouthOpen]).toBe(1);
    expect(t[FACE.mouthGrit]).toBe(0);
  });

  it('scales pain with hit strength', () => {
    const t = new Float32Array(FACE_TARGET_COUNT);
    faceTargets(sig({ state: FState.Hitstun, hitStrength: 0 }), t);
    const light = t[FACE.browPain] as number;
    faceTargets(sig({ state: FState.Hitstun, hitStrength: 3 }), t);
    expect(t[FACE.browPain]).toBeGreaterThan(light);
    expect(t[FACE.browPain]).toBeCloseTo(1);
    faceTargets(sig({ state: FState.Blockstun, stateTotal: 6 }), t);
    const lightBlock = t[FACE.browPain] as number;
    faceTargets(sig({ state: FState.Blockstun, stateTotal: 20 }), t);
    expect(t[FACE.browPain]).toBeGreaterThan(lightBlock);
  });

  it('closes the eyes after a KO and stops blinking', () => {
    const out = settle(sig({ state: FState.Lying, ko: 1 }), new FaceState(), 3000);
    expect(out[FACE.eyesClosed]).toBeGreaterThan(0.99);
    expect(out[FACE.blink]).toBeLessThan(0.01);
  });

  it('smiles on Win after a short grit', () => {
    const t = new Float32Array(FACE_TARGET_COUNT);
    faceTargets(sig({ state: FState.Win, stateFrame: 5 }), t);
    expect(t[FACE.mouthGrit]).toBeGreaterThan(0);
    faceTargets(sig({ state: FState.Win, stateFrame: 60 }), t);
    expect(t[FACE.smile]).toBe(1);
  });

  it('eases toward the target over wall-clock time', () => {
    const face = new FaceState();
    const s = sig({ state: FState.Hitstun, hitStrength: 3 });
    faceWeights(s, face, 16);
    const early = face.out[FACE.browPain] as number;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(0.5);
    settle(s, face, 600);
    expect(face.out[FACE.browPain]).toBeGreaterThan(0.6);
  });

  it('snaps on a fresh hit-stop and holds while it lasts', () => {
    const face = new FaceState();
    settle(sig({ state: FState.Idle }), face, 500);
    const out = faceWeights(sig({ state: FState.Hitstun, hitStrength: 2, hitstop: 12 }), face, 16);
    const snapped = out[FACE.browPain] as number;
    expect(snapped).toBeGreaterThan(0.5);
    const clock = face.clockMs;
    // same hit-stop continuing with a different target: nothing moves, blink clock frozen
    faceWeights(sig({ state: FState.Idle, hitstop: 11 }), face, 16);
    faceWeights(sig({ state: FState.Idle, hitstop: 10 }), face, 16);
    expect(face.out[FACE.browPain]).toBeCloseTo(snapped);
    expect(face.clockMs).toBe(clock);
  });

  it('keeps each geometry group within a unit sum', () => {
    const face = new FaceState();
    // force overlapping mouth channels
    face.eased[FACE.mouthOpen] = 0.9; face.eased[FACE.mouthGrit] = 0.9; face.eased[FACE.smile] = 0.9;
    face.prevHitstop = 5; // mid hit-stop: eased values are held as-is
    const out = faceWeights(sig({ state: FState.Idle, hitstop: 5 }), face, 16);
    expect((out[FACE.mouthOpen] as number) + (out[FACE.mouthGrit] as number) + (out[FACE.smile] as number)).toBeLessThanOrEqual(1.0001);
  });

  it('blinks periodically with a deterministic per-fighter phase', () => {
    let closedA = 0, closedB = 0, same = 0;
    for (let t = 0; t < 20000; t += 10) {
      const a = blinkAmount(t, 610), b = blinkAmount(t, 610 + 1730);
      if (a > 0.9) closedA++;
      if (b > 0.9) closedB++;
      if (a > 0.9 && b > 0.9) same++;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(closedA).toBeGreaterThan(10);
    expect(closedB).toBeGreaterThan(10);
    expect(same).toBeLessThan(closedA);
    expect(blinkAmount(1234, 610)).toBe(blinkAmount(1234, 610));
  });

  it('does not allocate a new output array per call', () => {
    const face = new FaceState(100);
    const a = faceWeights(sig({}), face, 16);
    const b = faceWeights(sig({ state: FState.Attack, attackPhase: ATTACK.active }), face, 16);
    expect(a).toBe(b);
  });
});
