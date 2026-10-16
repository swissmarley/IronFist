/**
 * Bake per-frame hit capsules and pose hurtboxes from the animation templates.
 * Usage: pnpm tsx tools/bake-hitboxes.ts [path/to/character/module.ts ...]
 * Without arguments every module in src/data/characters/*.ts (except index.ts) is baked.
 * Every exported value that looks like a CharacterDef (has id + moves) is processed.
 * Output: src/data/baked/<characterId>.json (committed; consumed by the sim).
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { bakeCharacter } from '@/anim/bake';
import type { CharacterDef } from '@/sim/types';

const args = process.argv.slice(2);
const files = args.length > 0 ? args : readdirSync('src/data/characters').filter((f) => f.endsWith('.ts') && f !== 'index.ts').map((f) => `src/data/characters/${f}`);
mkdirSync('src/data/baked', { recursive: true });
const isChar = (v: unknown): v is CharacterDef => typeof v === 'object' && v !== null && 'id' in v && 'moves' in v && Array.isArray((v as CharacterDef).moves);

for (const file of files) {
  const mod = (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>;
  for (const value of Object.values(mod)) {
    if (!isChar(value)) continue;
    const baked = bakeCharacter(value);
    const path = `src/data/baked/${value.id}.json`;
    writeFileSync(path, JSON.stringify(baked));
    const reach = (caps: { bz: number; r: number }[]): number => Math.max(...caps.map((k) => k.bz + k.r));
    const short = baked.hits.filter((h) => reach(h.track.flatMap((t) => t.capsules)) < 700).map((h) => h.moveId);
    console.info(`baked ${value.id}: ${baked.hits.length} hits -> ${path}${short.length ? `  (short reach <700mm: ${short.join(', ')})` : ''}`);
  }
}
