/**
 * Bake per-frame hit capsules and pose hurtboxes for every character from the
 * animation templates. Usage: pnpm tsx tools/bake-hitboxes.ts
 * Output: src/data/baked/<characterId>.json (committed; consumed by the sim).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { bakeCharacter } from '@/anim/bake';
import { GREYBOX } from '@/data/characters/greybox';

const chars = [GREYBOX];
mkdirSync('src/data/baked', { recursive: true });
for (const c of chars) {
  const baked = bakeCharacter(c);
  const path = `src/data/baked/${c.id}.json`;
  writeFileSync(path, JSON.stringify(baked));
  console.info(`baked ${c.id}: ${baked.hits.length} hits -> ${path}`);
  const reach = (caps: { bz: number; r: number }[]): number => Math.max(...caps.map((k) => k.bz + k.r));
  for (const h of baked.hits.slice(0, 40)) console.info(`  ${h.moveId}#${h.hitIdx} frames ${h.track[0]?.frame}-${h.track[h.track.length - 1]?.frame} reach ${reach(h.track.flatMap((t) => t.capsules))}mm y ${h.track[0]?.capsules[0]?.by}`);
  console.info('  stand head top', Math.max(...baked.hurtboxes.stand.map((k) => Math.max(k.ay, k.by) + k.r)), 'crouch head top', Math.max(...baked.hurtboxes.crouch.map((k) => Math.max(k.ay, k.by) + k.r)));
}
