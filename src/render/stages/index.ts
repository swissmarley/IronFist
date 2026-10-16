import type { ArenaDef } from '@/sim/config';
import { DEFAULT_ARENA } from '@/sim/config';
import type { StageFactory } from './Stage';
import { arena as dojoArena, createDojoRooftop } from './DojoRooftop';
import { createGreyBoxStage } from './GreyBoxStage';

/**
 * Stage registry. Built-in stages plus any `*.stage.ts` module in this folder
 * that default-exports a StageFactory (id = file name without `.stage.ts`) and
 * exports its `arena` so menus can list it without building the scene.
 */
const discovered = import.meta.glob<{ default: StageFactory; arena?: ArenaDef }>('./*.stage.ts', { eager: true });

export const STAGES: Record<string, StageFactory> = {
  greybox: createGreyBoxStage,
  dojo: createDojoRooftop,
};
export const STAGE_ARENAS: Record<string, ArenaDef> = { greybox: DEFAULT_ARENA, dojo: dojoArena };
for (const [path, mod] of Object.entries(discovered)) {
  const id = path.replace('./', '').replace('.stage.ts', '');
  if (mod.default) STAGES[id] = mod.default;
  if (mod.arena) STAGE_ARENAS[id] = mod.arena;
}

export const STAGE_IDS = Object.keys(STAGES);

/** Display name and arena type for menus. */
export function stageInfo(id: string): { id: string; name: string; kind: 'walls' | 'open' } {
  const a = STAGE_ARENAS[id];
  return { id, name: a?.name ?? id, kind: a === undefined || a.walls ? 'walls' : 'open' };
}
