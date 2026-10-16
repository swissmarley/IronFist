import type { MatchConfig } from './config';
import { MatchSim } from './match';
import type { CharacterDef } from './types';

/** A recorded match: config + interleaved per-frame inputs (P1, P2, P1, P2, ...). */
export interface Replay {
  version: 1;
  chars: [string, string];
  config: Partial<MatchConfig>;
  inputs: number[];
  /** State hash every `hashInterval` frames (for verification). */
  hashes: number[];
  hashInterval: number;
  finalHash: number;
}

export const HASH_INTERVAL = 60;

export class ReplayRecorder {
  readonly inputs: number[] = [];
  readonly hashes: number[] = [];
  constructor(private readonly sim: MatchSim) {}

  /** Call after each sim.step with the inputs that were used. */
  record(p1: number, p2: number): void {
    this.inputs.push(p1, p2);
    if (this.sim.frame % HASH_INTERVAL === 0) this.hashes.push(this.sim.hash());
  }

  finish(): Replay {
    return {
      version: 1,
      chars: [this.sim.chars[0].def.id, this.sim.chars[1].def.id],
      config: this.sim.config,
      inputs: this.inputs.slice(),
      hashes: this.hashes.slice(),
      hashInterval: HASH_INTERVAL,
      finalHash: this.sim.hash(),
    };
  }
}

export interface ReplayVerification {
  ok: boolean;
  divergedAtFrame: number;
  finalHash: number;
}

/** Re-run a replay from scratch and compare checkpoints. */
export function verifyReplay(replay: Replay, defs: [CharacterDef, CharacterDef]): ReplayVerification {
  const sim = new MatchSim(defs, replay.config);
  let hi = 0;
  for (let i = 0; i + 1 < replay.inputs.length; i += 2) {
    sim.step([replay.inputs[i] as number, replay.inputs[i + 1] as number]);
    if (sim.frame % replay.hashInterval === 0) {
      const expected = replay.hashes[hi++];
      if (expected !== undefined && expected !== sim.hash()) return { ok: false, divergedAtFrame: sim.frame, finalHash: sim.hash() };
    }
  }
  const finalHash = sim.hash();
  return { ok: finalHash === replay.finalHash, divergedAtFrame: finalHash === replay.finalHash ? -1 : sim.frame, finalHash };
}

/** Compact binary-ish serialisation (JSON with inputs as a base36 string list). */
export function serializeReplay(r: Replay): string {
  return JSON.stringify({ ...r, inputs: r.inputs.map((v) => v.toString(36)).join(',') });
}

export function deserializeReplay(s: string): Replay {
  const o = JSON.parse(s) as Omit<Replay, 'inputs'> & { inputs: string };
  return { ...o, inputs: o.inputs.length ? o.inputs.split(',').map((v) => parseInt(v, 36)) : [] };
}
