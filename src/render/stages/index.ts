import type { StageFactory } from './Stage';
import { createDojoRooftop } from './DojoRooftop';
import { createGreyBoxStage } from './GreyBoxStage';

export const STAGES: Record<string, StageFactory> = {
  greybox: createGreyBoxStage,
  dojo: createDojoRooftop,
};

export const STAGE_IDS = Object.keys(STAGES);
