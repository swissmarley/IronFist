import type { CapsuleDef, CharacterDef } from './types';

/** Output of tools/bake-hitboxes.ts: pose-derived hurtboxes and per-frame hit capsules. */
export interface BakedHit { moveId: string; hitIdx: number; track: { frame: number; capsules: CapsuleDef[] }[] }
export interface BakedCharacter {
  hurtboxes: CharacterDef['hurtboxes'];
  hits: BakedHit[];
}

/** Merge baked data into a character definition (returns a new def). */
export function applyBaked(def: CharacterDef, baked: BakedCharacter): CharacterDef {
  const byMove = new Map<string, BakedHit[]>();
  for (const b of baked.hits) {
    const list = byMove.get(b.moveId) ?? [];
    list.push(b);
    byMove.set(b.moveId, list);
  }
  return {
    ...def,
    hurtboxes: baked.hurtboxes,
    moves: def.moves.map((m) => {
      const list = byMove.get(m.id);
      if (!list) return m;
      return { ...m, hits: m.hits.map((h, i) => { const b = list.find((x) => x.hitIdx === i); return b ? { ...h, track: b.track } : h; }) };
    }),
  };
}
