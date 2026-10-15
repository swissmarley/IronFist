import type { BoneName } from '@/anim/skeleton';
import type { CharacterLook } from '@/sim/types';
import type { PartMaterial } from './RigGeometry';
import type { SpringParams } from './SpringBones';

/** Collider ids for `SpringChainSpec.collide` (bit order in `SpringColliders`). */
export const SPRING_COLLIDERS = ['head', 'chest', 'hips', 'legL', 'legR'] as const;
export type SpringColliderId = (typeof SPRING_COLLIDERS)[number];

/**
 * One spring chain hanging off a rig bone. Offsets/lengths are absolute
 * metres in the rest pose (the head/hips shells are not height-scaled either),
 * relative to the parent bone's joint.
 */
export interface SpringChainSpec {
  name: string;
  parent: BoneName;
  /** Anchor offset from the parent joint (m, rest frame: +Y up, +Z forward, +X fighter's left). */
  offset: [number, number, number];
  /** Rest direction of the chain (normalised on use). */
  dir: [number, number, number];
  segments: number;
  /** Total length (m). */
  length: number;
  stiffness: number;
  damping: number;
  gravity?: number;
  maxStretch?: number;
  /** Visual radius at the root (m); also the particle collision radius. */
  radius: number;
  /** Visual radius at the tip (default radius * 0.45). */
  tipRadius?: number;
  /** 'tube' = tapered capsule, 'ribbon' = flat strip `radius * 2` wide. */
  shape: 'tube' | 'ribbon';
  /** Ribbon thickness / width ratio (default 0.22). */
  flat?: number;
  material: PartMaterial;
  collide?: readonly SpringColliderId[];
  /** Hit-whip strength multiplier (default 1). */
  whip?: number;
}

/** Static extras drawn with the chains (a belt band for belt tails). */
export interface SpringDressing {
  beltBand?: boolean;
}

export interface SpringSetup {
  chains: SpringChainSpec[];
  dressing: SpringDressing;
}

/** A look may carry hand-authored chains; otherwise `defaultSprings` derives them. */
export type SpringLook = CharacterLook & { springs?: SpringChainSpec[]; springDressing?: SpringDressing };

const HAIR_STRAND = { damping: 3.2, maxStretch: 0.04, shape: 'tube', material: 'hair', collide: ['head', 'chest'] } as const;
const CLOTH = { damping: 4.5, maxStretch: 0.06, shape: 'ribbon', collide: ['hips', 'legL', 'legR'] } as const;

/** Hair chain(s) derived from the hair style. */
function hairChains(hair: CharacterLook['hair']): SpringChainSpec[] {
  switch (hair) {
    case 'long': // ponytail out of the long-hair back panel
      return [{ ...HAIR_STRAND, name: 'ponytail', parent: 'head', offset: [0, 0.06, -0.125], dir: [0, -0.9, -0.42], segments: 4, length: 0.36, stiffness: 0.07, radius: 0.04, tipRadius: 0.016, whip: 1.2 }];
    case 'bun': // short tail falling from the bun
      return [{ ...HAIR_STRAND, name: 'bunTail', parent: 'head', offset: [0, 0.17, -0.13], dir: [0, -0.75, -0.66], segments: 3, length: 0.17, stiffness: 0.12, radius: 0.026, tipRadius: 0.01, collide: ['head'] }];
    case 'spiky': // two stiff flicks at the nape
      return [
        { ...HAIR_STRAND, name: 'flickL', parent: 'head', offset: [0.035, 0.1, -0.095], dir: [0.25, -0.45, -0.86], segments: 2, length: 0.085, stiffness: 0.32, radius: 0.024, tipRadius: 0.006, collide: ['head'] },
        { ...HAIR_STRAND, name: 'flickR', parent: 'head', offset: [-0.035, 0.1, -0.095], dir: [-0.25, -0.45, -0.86], segments: 2, length: 0.085, stiffness: 0.32, radius: 0.024, tipRadius: 0.006, collide: ['head'] },
      ];
    case 'short':
      return [{ ...HAIR_STRAND, name: 'napeFlick', parent: 'head', offset: [0, 0.095, -0.09], dir: [0, -0.55, -0.83], segments: 2, length: 0.065, stiffness: 0.4, radius: 0.028, tipRadius: 0.01, collide: ['head'] }];
    case 'none':
    default:
      return [];
  }
}

/** Two belt ends hanging from a front knot. */
function beltTails(width = 0.02): SpringChainSpec[] {
  return [
    { ...CLOTH, name: 'beltL', parent: 'hips', offset: [0.03, 0.05, 0.13], dir: [0.12, -1, 0.1], segments: 3, length: 0.23, stiffness: 0.1, radius: width, tipRadius: width * 0.85, material: 'belt' },
    { ...CLOTH, name: 'beltR', parent: 'hips', offset: [-0.025, 0.05, 0.13], dir: [-0.08, -1, 0.1], segments: 3, length: 0.2, stiffness: 0.1, radius: width, tipRadius: width * 0.85, material: 'belt' },
  ];
}

/** Front + back loincloth / apron flaps (heavy builds). */
function flaps(material: PartMaterial, width: number, length: number): SpringChainSpec[] {
  return [
    { ...CLOTH, name: 'flapFront', parent: 'hips', offset: [0, 0.0, 0.14], dir: [0, -1, 0.12], segments: 3, length, stiffness: 0.14, damping: 5, radius: width, tipRadius: width * 0.8, flat: 0.12, material, whip: 0.7 },
    { ...CLOTH, name: 'flapBack', parent: 'hips', offset: [0, 0.0, -0.13], dir: [0, -1, -0.12], segments: 3, length, stiffness: 0.14, damping: 5, radius: width, tipRadius: width * 0.8, flat: 0.12, material, whip: 0.7 },
  ];
}

/** Coat / qipao tails hanging behind the hips. */
function coatTails(material: PartMaterial, length: number): SpringChainSpec[] {
  return [
    { ...CLOTH, name: 'coatL', parent: 'hips', offset: [0.07, 0.03, -0.12], dir: [0.15, -1, -0.2], segments: 3, length, stiffness: 0.1, radius: 0.05, tipRadius: 0.04, flat: 0.14, material },
    { ...CLOTH, name: 'coatR', parent: 'hips', offset: [-0.07, 0.03, -0.12], dir: [-0.15, -1, -0.2], segments: 3, length, stiffness: 0.1, radius: 0.05, tipRadius: 0.04, flat: 0.14, material },
  ];
}

/** Side cord (capoeira corda) for bare-torso looks. */
function sideCord(): SpringChainSpec[] {
  return [{ ...CLOTH, name: 'cord', parent: 'hips', offset: [0.12, 0.05, 0.07], dir: [0.2, -1, 0.15], segments: 3, length: 0.26, stiffness: 0.08, radius: 0.016, tipRadius: 0.012, shape: 'tube', material: 'belt' }];
}

/**
 * Default chains for a look: one from the hair style plus cloth that the
 * look suggests. Heavy builds get flaps, bare torsos a side cord, long hair
 * with a covered torso coat tails, everyone else belt tails and a belt band.
 */
export function defaultSprings(look: Pick<CharacterLook, 'hair' | 'heavy' | 'parts'>): SpringSetup {
  const chains = hairChains(look.hair);
  const bareTorso = look.parts?.chest === 'skin';
  if (look.heavy) chains.push(...flaps('belt', look.hair === 'none' ? 0.09 : 0.075, look.hair === 'none' ? 0.3 : 0.24));
  else if (bareTorso) chains.push(...sideCord());
  else if (look.hair === 'long') chains.push(...coatTails('top', 0.34), ...beltTails(0.016));
  else chains.push(...beltTails());
  const dressing: SpringDressing = { beltBand: !look.heavy };
  return { chains, dressing };
}

/** Per-character extras where the costume suggests cloth the rules cannot infer. */
const EXTRAS: Record<string, (look: CharacterLook) => SpringChainSpec[]> = {
  // qipao-style top: front and back panels below the waist instead of belt ends
  meiling: () => [
    { ...CLOTH, name: 'panelFront', parent: 'hips', offset: [0, 0.02, 0.135], dir: [0, -1, 0.1], segments: 3, length: 0.32, stiffness: 0.1, radius: 0.065, tipRadius: 0.055, flat: 0.1, material: 'top' },
    { ...CLOTH, name: 'panelBack', parent: 'hips', offset: [0, 0.02, -0.125], dir: [0, -1, -0.1], segments: 3, length: 0.32, stiffness: 0.1, radius: 0.065, tipRadius: 0.055, flat: 0.1, material: 'top' },
  ],
};
/** Characters whose extras replace the default cloth chains (hair chains are kept). */
const REPLACES_CLOTH = new Set(['meiling']);

export function springsFor(id: string, look: CharacterLook): SpringSetup {
  const l = look as SpringLook;
  if (l.springs) return { chains: l.springs, dressing: l.springDressing ?? {} };
  const base = defaultSprings(look);
  const extra = EXTRAS[id];
  if (!extra) return base;
  const chains = REPLACES_CLOTH.has(id) ? hairChains(look.hair) : base.chains;
  return { chains: [...chains, ...extra(look)], dressing: REPLACES_CLOTH.has(id) ? { beltBand: true } : base.dressing };
}

export function paramsOf(spec: SpringChainSpec): Partial<SpringParams> {
  // a ribbon collides by its thickness-ish edge, not its full width
  const radius = spec.shape === 'ribbon' ? Math.min(spec.radius, 0.03) : spec.radius;
  return { stiffness: spec.stiffness, damping: spec.damping, gravity: spec.gravity ?? 1, maxStretch: spec.maxStretch ?? 0.05, radius };
}

export function colliderMaskOf(spec: SpringChainSpec): number {
  let m = 0;
  for (const c of spec.collide ?? []) m |= 1 << SPRING_COLLIDERS.indexOf(c);
  return m;
}
