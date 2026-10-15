import { applyBaked, type BakedCharacter } from '@/sim/baked';
import type { CharacterDef } from '@/sim/types';
import { GREYBOX } from './greybox';
import { KAEDE } from './kaede';
import { BORIS } from './boris';
import { LUIZ } from './luiz';
import { MEILING } from './meiling';
import { JAEHYUN } from './jaehyun';
import { GOLEM } from './golem';
import { RICARDO } from './ricardo';
import { SERAPHINE } from './seraphine';
import greyboxBaked from '@/data/baked/greybox.json';
import kaedeBaked from '@/data/baked/kaede.json';
import borisBaked from '@/data/baked/boris.json';
import luizBaked from '@/data/baked/luiz.json';
import meilingBaked from '@/data/baked/meiling.json';
import jaehyunBaked from '@/data/baked/jaehyun.json';
import golemBaked from '@/data/baked/golem.json';
import ricardoBaked from '@/data/baked/ricardo.json';
import seraphineBaked from '@/data/baked/seraphine.json';

/** Shipped character definitions with pose-baked capsules applied. Roster order = select-screen order. */
export const CHARACTERS: Record<string, CharacterDef> = {
  kaede: applyBaked(KAEDE, kaedeBaked as BakedCharacter),
  boris: applyBaked(BORIS, borisBaked as BakedCharacter),
  luiz: applyBaked(LUIZ, luizBaked as BakedCharacter),
  meiling: applyBaked(MEILING, meilingBaked as BakedCharacter),
  jaehyun: applyBaked(JAEHYUN, jaehyunBaked as BakedCharacter),
  seraphine: applyBaked(SERAPHINE, seraphineBaked as BakedCharacter),
  ricardo: applyBaked(RICARDO, ricardoBaked as BakedCharacter),
  golem: applyBaked(GOLEM, golemBaked as BakedCharacter),
  greybox: applyBaked(GREYBOX, greyboxBaked as BakedCharacter),
};

export const ROSTER_IDS = Object.keys(CHARACTERS).filter((id) => id !== 'greybox');

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`unknown character ${id}`);
  return c;
}
