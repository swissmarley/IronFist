import { describe, expect, it } from 'vitest';
import { validateCharacter } from '@/sim/validate';
import { GREYBOX } from '@/data/characters/greybox';
import { CharacterRuntime } from '@/sim/character';

describe('frame data', () => {
  it('greybox validates', () => {
    expect(validateCharacter(GREYBOX)).toEqual([]);
  });
  it('rejects inconsistent frame data', () => {
    const bad = { ...GREYBOX, id: 'bad', moves: [{ ...GREYBOX.moves[0]!, hits: [{ ...GREYBOX.moves[0]!.hits[0]!, onBlock: -50 }] }] };
    expect(validateCharacter(bad).some((e) => e.includes('exceeds recovery'))).toBe(true);
  });
  it('compiles into a runtime with commands for every root move', () => {
    const rt = new CharacterRuntime(GREYBOX);
    expect(rt.interpreter.size).toBeGreaterThan(10);
    expect(rt.startup[rt.moveIndex.get('jab')!]).toBe(10);
  });
});
