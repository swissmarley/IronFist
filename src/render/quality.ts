export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'potato';
export const QUALITY_TIERS: readonly QualityTier[] = ['ultra', 'high', 'medium', 'low', 'potato'];

export interface QualitySettings {
  tier: QualityTier;
  renderScale: number; // 0.5 .. 1.0 (base; dynamic resolution may lower it)
  shadowMapSize: number;
  shadows: boolean;
  ssao: boolean;
  bloom: boolean;
  motionBlur: boolean;
  dof: boolean;
  particlesMax: number;
  anisotropy: number;
  dynamicResolution: boolean;
  /** Spring-bone segments per chain cap (hair/cloth secondary motion runs on every tier). */
  springSegments: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  ultra: { tier: 'ultra', renderScale: 1, shadowMapSize: 4096, shadows: true, ssao: true, bloom: true, motionBlur: true, dof: true, particlesMax: 20000, anisotropy: 16, dynamicResolution: false, springSegments: 8 },
  high: { tier: 'high', renderScale: 1, shadowMapSize: 2048, shadows: true, ssao: true, bloom: true, motionBlur: false, dof: true, particlesMax: 10000, anisotropy: 8, dynamicResolution: true, springSegments: 8 },
  medium: { tier: 'medium', renderScale: 1, shadowMapSize: 2048, shadows: true, ssao: false, bloom: true, motionBlur: false, dof: false, particlesMax: 5000, anisotropy: 4, dynamicResolution: true, springSegments: 8 },
  low: { tier: 'low', renderScale: 0.85, shadowMapSize: 1024, shadows: true, ssao: false, bloom: false, motionBlur: false, dof: false, particlesMax: 2000, anisotropy: 2, dynamicResolution: true, springSegments: 8 },
  potato: { tier: 'potato', renderScale: 0.6, shadowMapSize: 512, shadows: false, ssao: false, bloom: false, motionBlur: false, dof: false, particlesMax: 500, anisotropy: 1, dynamicResolution: true, springSegments: 1 },
};

/**
 * Pick a tier from a short benchmark: frame times measured over N frames of a
 * representative scene. Thresholds are average ms/frame.
 */
export function tierFromBenchmark(avgFrameMs: number, backend: 'webgpu' | 'webgl2'): QualityTier {
  if (avgFrameMs < 4 && backend === 'webgpu') return 'ultra';
  if (avgFrameMs < 7) return 'high';
  if (avgFrameMs < 12) return 'medium';
  if (avgFrameMs < 20) return 'low';
  return 'potato';
}
