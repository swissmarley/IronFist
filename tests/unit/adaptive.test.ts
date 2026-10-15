import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '@/render/AdaptiveQuality';

describe('AdaptiveQuality', () => {
  it('probes the first frames and picks a tier from the average frame time', () => {
    const a = new AdaptiveQuality({ backend: 'webgl2', probe: true, warmupFrames: 5, probeFrames: 10 });
    const out: string[] = [];
    for (let i = 0; i < 20; i++) { const d = a.sample(i < 5 ? 500 : 25, true); if (d?.tier) out.push(d.tier); }
    expect(out).toEqual(['potato']);
    const b = new AdaptiveQuality({ backend: 'webgpu', probe: true, warmupFrames: 0, probeFrames: 4 });
    let tier = '';
    for (let i = 0; i < 4; i++) { const d = b.sample(3, true); if (d?.tier) tier = d.tier; }
    expect(tier).toBe('ultra');
  });
  it('steps the render scale down under load and back up with headroom', () => {
    const a = new AdaptiveQuality({ backend: 'webgl2', probe: false, warmupFrames: 0 });
    const scales: number[] = [];
    for (let i = 0; i < 400; i++) { const d = a.sample(30, true); if (d?.scale !== undefined) scales.push(d.scale); }
    expect(scales[0]).toBeCloseTo(0.9);
    expect(scales[scales.length - 1]).toBeCloseTo(0.6);
    for (let i = 0; i < 2000; i++) { const d = a.sample(8, true); if (d?.scale !== undefined) scales.push(d.scale); }
    expect(scales[scales.length - 1]).toBe(1);
    expect(a.sample(30, false)).toBeNull();
  });
});
