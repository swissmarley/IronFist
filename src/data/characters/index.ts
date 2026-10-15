import { applyBaked, type BakedCharacter } from '@/sim/baked';
import type { CharacterDef } from '@/sim/types';
import { GREYBOX } from './greybox';
import greyboxBaked from '@/data/baked/greybox.json';

/** Shipped character definitions with pose-baked capsules applied. */
export const CHARACTERS: Record<string, CharacterDef> = {
  greybox: applyBaked(GREYBOX, greyboxBaked as BakedCharacter),
};

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`unknown character ${id}`);
  return c;
}
