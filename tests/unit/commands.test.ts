import { describe, expect, it } from 'vitest';
import { CommandInterpreter, InputHistory, matchCommand } from '@/sim/commands';
import { parseNotation } from '@/sim/notation';

/** Feed a sequence of [dir, buttons] frames. */
function feed(h: InputHistory, seq: [number, number][]): void {
  for (const [d, b] of seq) h.push(d, b);
}
const B1 = 1, B2 = 2, B3 = 4;

describe('parseNotation', () => {
  it('parses buttons and directions', () => {
    const p = parseNotation('d/f+2');
    expect(p.tokens).toHaveLength(1);
    expect(p.tokens[0]!.buttons).toBe(B2);
    expect(p.tokens[0]!.dirMask).toBe(1 << 2);
  });
  it('expands motions and marks repeated directions as edges', () => {
    expect(parseNotation('qcf+1').tokens).toHaveLength(3);
    const ff = parseNotation('f,f+2');
    expect(ff.tokens).toHaveLength(2);
    expect(ff.tokens[1]!.edge).toBe(true);
  });
  it('ranks specific commands above generic ones', () => {
    expect(parseNotation('d/f+2').priority).toBeGreaterThan(parseNotation('2').priority);
    expect(parseNotation('1+2').priority).toBeGreaterThan(parseNotation('1').priority);
    expect(parseNotation('f,f+2').priority).toBeGreaterThan(parseNotation('f+2').priority);
  });
});

describe('matchCommand', () => {
  it('matches a plain button on its press frame only', () => {
    const h = new InputHistory();
    const t = parseNotation('1').tokens;
    feed(h, [[5, 0], [5, B1]]);
    expect(matchCommand(t, h)).toBe(0);
    feed(h, [[5, B1]]);
    expect(matchCommand(t, h)).toBe(-1);
  });
  it('requires the direction to be held at press time', () => {
    const h = new InputHistory();
    const t = parseNotation('d/f+2').tokens;
    feed(h, [[5, 0], [3, B2]]);
    expect(matchCommand(t, h)).toBe(0);
    const h2 = new InputHistory();
    feed(h2, [[5, 0], [6, B2]]);
    expect(matchCommand(t, h2)).toBe(-1);
  });
  it('matches f,f dash with a release in between and rejects a held f', () => {
    const t = parseNotation('f,f').tokens;
    const h = new InputHistory();
    feed(h, [[5, 0], [6, 0], [5, 0], [5, 0], [6, 0]]);
    expect(matchCommand(t, h)).toBe(0);
    const held = new InputHistory();
    feed(held, [[5, 0], [6, 0], [6, 0], [6, 0]]);
    expect(matchCommand(t, held)).toBe(-1);
  });
  it('matches f,f+2 even when the button is delayed after the second f', () => {
    const t = parseNotation('f,f+2').tokens;
    const h = new InputHistory();
    feed(h, [[5, 0], [6, 0], [5, 0], [6, 0], [6, 0], [6, 0], [6, B2]]);
    expect(matchCommand(t, h)).toBe(0);
  });
  it('matches qcf+1 with gaps and rejects when the gap is too large', () => {
    const t = parseNotation('qcf+1').tokens;
    const h = new InputHistory();
    feed(h, [[5, 0], [2, 0], [2, 0], [3, 0], [6, 0], [6, 0], [6, B1]]);
    expect(matchCommand(t, h)).toBe(0);
    const slow = new InputHistory();
    const seq: [number, number][] = [[5, 0], [2, 0]];
    for (let i = 0; i < 12; i++) seq.push([5, 0]);
    seq.push([3, 0], [6, B1]);
    feed(slow, seq);
    expect(matchCommand(t, slow)).toBe(-1);
  });
  it('matches the crouch-dash f,n,d,d/f', () => {
    const t = parseNotation('f,n,d,d/f').tokens;
    const h = new InputHistory();
    feed(h, [[5, 0], [6, 0], [5, 0], [2, 0], [3, 0]]);
    expect(matchCommand(t, h)).toBe(0);
  });
  it('requires simultaneous presses on the same frame for 1+2', () => {
    const t = parseNotation('1+2').tokens;
    const h = new InputHistory();
    feed(h, [[5, 0], [5, B1 | B2]]);
    expect(matchCommand(t, h)).toBe(0);
    const stag = new InputHistory();
    feed(stag, [[5, 0], [5, B1], [5, B1 | B2]]);
    expect(matchCommand(t, stag)).toBe(-1);
  });
  it('reports just-frame timing', () => {
    const t = parseNotation('f,n,d,d/f+2').tokens;
    const tight = new InputHistory();
    feed(tight, [[5, 0], [6, 0], [5, 0], [2, 0], [3, B2]]);
    expect(matchCommand(t, tight, 1)).toBe(1);
    const loose = new InputHistory();
    feed(loose, [[5, 0], [6, 0], [5, 0], [5, 0], [2, 0], [2, 0], [3, 0], [3, B2]]);
    expect(matchCommand(t, loose, 1)).toBe(0);
  });
});

describe('CommandInterpreter', () => {
  it('returns matches ordered by priority', () => {
    const ci = new CommandInterpreter();
    ci.add('jab', '1');
    ci.add('df1', 'd/f+1');
    ci.add('throw', '1+3');
    const h = new InputHistory();
    feed(h, [[5, 0], [3, B1]]);
    const m = ci.match(h);
    expect(m.map((x) => x.id)).toEqual(['df1', 'jab']);
    const h2 = new InputHistory();
    feed(h2, [[5, 0], [5, B1 | B3]]);
    expect(ci.match(h2).map((x) => x.id)).toEqual(['throw', 'jab']);
  });
});
