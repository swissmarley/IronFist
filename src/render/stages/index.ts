import type { StageFactory } from './Stage';
import { createDojoRooftop } from './DojoRooftop';
import { createGreyBoxStage } from './GreyBoxStage';

/**
 * Stage registry. Built-in stages plus any `*.stage.ts` module in this folder
 * that default-exports a StageFactory (id = file name without `.stage.ts`).
 */
const discovered = import.meta.glob<{ default: StageFactory }>('./*.stage.ts', { eager: true });

export const STAGES: Record<string, StageFactory> = {
  greybox: createGreyBoxStage,
  dojo: createDojoRooftop,
};
for (const [path, mod] of Object.entries(discovered)) {
  const id = path.replace('./', '').replace('.stage.ts', '');
  if (mod.default) STAGES[id] = mod.default;
}

export const STAGE_IDS = Object.keys(STAGES);
