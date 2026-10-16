import { describe, expect, it } from 'vitest';
import { FixedStepLoop, STEP_MS } from '@/core/loop';

function makeLoop() {
  let t = 0;
  const calls = { input: 0, step: 0, render: 0, alphas: [] as number[] };
  const loop = new FixedStepLoop({
    sampleInput: () => { calls.input++; },
    step: () => { calls.step++; expect(calls.input).toBe(calls.step); },
    render: (alpha) => { calls.render++; calls.alphas.push(alpha); },
  }, () => t);
  return { loop, calls, advance: (ms: number) => { t += ms; loop.frame(t); } };
}

describe('FixedStepLoop', () => {
  it('runs exactly 60 steps per simulated second at any frame rate', () => {
    for (const frameMs of [1000 / 144, 1000 / 60, 1000 / 30, 1000 / 24]) {
      const { loop, calls, advance } = makeLoop();
      loop.frame(0);
      let elapsed = 0;
      while (elapsed < 1000 - 1e-6) { advance(frameMs); elapsed += frameMs; }
      // allow +-1 for accumulator rounding at the boundary
      expect(Math.abs(calls.step - 60)).toBeLessThanOrEqual(1);
    }
  });
  it('samples input immediately before every step', () => {
    const { loop, calls, advance } = makeLoop();
    loop.frame(0);
    advance(STEP_MS * 3.5);
    expect(calls.step).toBe(3);
    expect(calls.input).toBe(3);
    expect(calls.render).toBe(2);
    expect(calls.alphas[1]).toBeCloseTo(0.5, 5);
  });
  it('caps catch-up steps to avoid the spiral of death', () => {
    const { loop, calls, advance } = makeLoop();
    loop.frame(0);
    advance(5000);
    expect(calls.step).toBeLessThanOrEqual(10);
  });
  it('does not step while paused but still renders, and stepOnce advances', () => {
    const { loop, calls, advance } = makeLoop();
    loop.frame(0);
    loop.setPaused(true);
    advance(100);
    expect(calls.step).toBe(0);
    expect(calls.render).toBe(2);
    loop.stepOnce();
    expect(calls.step).toBe(1);
  });
});
