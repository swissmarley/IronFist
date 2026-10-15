import type { CharacterDef } from '@/sim/types';
import type { BoneName } from '@/anim/skeleton';
import { DEFAULT_STYLE, type PartMaterial, type RigStyle } from './RigGeometry';
import { PALETTES } from './RigMaterials';
import type { RigOptions } from './RigView';

/** Build rig options from a character's `look` (falls back to the player-slot palette). */
export function rigOptionsFor(def: CharacterDef, slot: number): RigOptions {
  const look = def.look;
  if (!look) return { palette: slot === 0 ? PALETTES.karate : PALETTES.p2, style: { ...DEFAULT_STYLE, hair: slot === 0 ? 'bun' : 'spiky' } };
  const parts: Partial<Record<BoneName, PartMaterial>> = { ...DEFAULT_STYLE.parts };
  if (look.parts) for (const [bone, mat] of Object.entries(look.parts)) if (mat) parts[bone as BoneName] = mat;
  const style: RigStyle = { parts, bulk: look.bulk, hair: look.hair, ...(look.heavy ? { heavy: true } : {}) };
  return { palette: look.palette, style, heightScale: look.heightScale };
}
