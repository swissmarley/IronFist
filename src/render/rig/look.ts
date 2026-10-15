import type { CharacterDef } from '@/sim/types';
import type { BoneName } from '@/anim/skeleton';
import { DEFAULT_STYLE, type PartMaterial, type RigStyle } from './RigGeometry';
import { PALETTES } from './RigMaterials';
import type { RigOptions } from './RigView';
import { defaultSprings, springsFor } from './springPresets';

export type { SpringChainSpec, SpringLook } from './springPresets';

/**
 * Build rig options from a character's `look` (falls back to the player-slot
 * palette). A look may carry an optional `springs` list (see `SpringLook`);
 * otherwise chains are derived from the hair style and costume.
 * `springMaxSegments` caps chain segments for the quality tier.
 */
export function rigOptionsFor(def: CharacterDef, slot: number, springMaxSegments?: number): RigOptions {
  const look = def.look;
  const springOpts = { springPhase: slot * 2.1 + 0.4, ...(springMaxSegments !== undefined ? { springMaxSegments } : {}) };
  if (!look) {
    const hair = slot === 0 ? 'bun' : 'spiky';
    return { palette: slot === 0 ? PALETTES.karate : PALETTES.p2, style: { ...DEFAULT_STYLE, hair }, springs: defaultSprings({ hair }), ...springOpts };
  }
  const parts: Partial<Record<BoneName, PartMaterial>> = { ...DEFAULT_STYLE.parts };
  if (look.parts) for (const [bone, mat] of Object.entries(look.parts)) if (mat) parts[bone as BoneName] = mat;
  const style: RigStyle = { parts, bulk: look.bulk, hair: look.hair, ...(look.heavy ? { heavy: true } : {}) };
  return { palette: look.palette, style, heightScale: look.heightScale, springs: springsFor(def.id, look), ...springOpts };
}
