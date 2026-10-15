import { CommandInterpreter } from './commands';
import type { CharacterDef, MoveDef } from './types';

export const SYS_DASH = 'sys:dash';
export const SYS_BACKDASH = 'sys:backdash';
export const SYS_CROUCHDASH = 'sys:cd';

/** A CharacterDef compiled for fast runtime lookup. Immutable and shareable. */
export class CharacterRuntime {
  readonly def: CharacterDef;
  readonly moves: readonly MoveDef[];
  readonly moveIndex: ReadonlyMap<string, number>;
  readonly interpreter: CommandInterpreter;
  /** Command id -> move index (commands for follow-ups and roots alike). */
  readonly cmdToMove: ReadonlyMap<string, number>;
  readonly lastActive: readonly number[];
  readonly startup: readonly number[];

  constructor(def: CharacterDef) {
    this.def = def;
    this.moves = def.moves;
    const idx = new Map<string, number>();
    def.moves.forEach((m, i) => idx.set(m.id, i));
    this.moveIndex = idx;
    const ci = new CommandInterpreter();
    const c2m = new Map<string, number>();
    ci.add(SYS_DASH, 'f,f');
    ci.add(SYS_BACKDASH, 'b,b');
    ci.add(SYS_CROUCHDASH, 'f,n,d,d/f');
    const seen = new Map<string, string>();
    def.moves.forEach((m, i) => {
      const cmd = m.cmd ?? m.input;
      const key = `${cmd}|${(m.conditions ?? ['standing']).join(',')}|${m.stance ?? ''}`;
      // moves sharing the same trigger+conditions are follow-ups chosen via the string tree
      const cmdId = seen.get(cmd) ?? `cmd:${m.id}`;
      if (!seen.has(cmd)) {
        seen.set(cmd, cmdId);
        ci.add(cmdId, cmd, m.justFrame);
      }
      void key;
      c2m.set(m.id, i);
    });
    this.interpreter = ci;
    this.cmdToMove = c2m;
    this.lastActive = def.moves.map((m) => m.hits.reduce((acc, h) => Math.max(acc, h.frames[1]), 0));
    this.startup = def.moves.map((m) => m.hits.reduce((acc, h) => Math.min(acc, h.frames[0]), 9999));
  }

  move(i: number): MoveDef {
    return this.moves[i] as MoveDef;
  }

  /** All move indices whose trigger notation equals cmd. */
  movesForCommand(cmd: string): number[] {
    const out: number[] = [];
    this.moves.forEach((m, i) => { if ((m.cmd ?? m.input) === cmd) out.push(i); });
    return out;
  }
}

/** Reverse lookup of command id -> trigger notation for the interpreter ids. */
export function commandNotation(id: string, rt: CharacterRuntime): string | null {
  if (!id.startsWith('cmd:')) return null;
  const i = rt.moveIndex.get(id.slice(4));
  if (i === undefined) return null;
  const m = rt.move(i);
  return m.cmd ?? m.input;
}
