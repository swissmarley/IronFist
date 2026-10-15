import type { Page } from '@playwright/test';

export interface IronFistGlobal {
  ready: boolean;
  errors: string[];
  game: {
    getSimFrame(): number;
    input: { enqueueScript(player: number, frames: number[]): void };
    session: {
      sim: {
        fighters: { hp: number; state: number; x: number; z: number; comboHits: number }[];
        frame: number;
        hash(): number;
        round: { phase: number; wins: [number, number]; roundNumber: number; winner: number; lastRoundResult: string };
      };
    } | null;
  };
}

/** Wait for the game to boot and return captured console/page errors list. */
export async function bootGame(page: Page, path = '/'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __ironfist?: IronFistGlobal }).__ironfist?.ready === true, null, { timeout: 60_000 });
  await page.locator('#game-canvas').focus();
  return errors;
}

export function getGlobal(page: Page): Promise<{ ready: boolean; errors: string[]; simFrame: number }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __ironfist: IronFistGlobal }).__ironfist;
    return { ready: g.ready, errors: g.errors, simFrame: g.game.getSimFrame() };
  });
}

export function getFighters(page: Page): Promise<{ hp: number; state: number; x: number; z: number; comboHits: number }[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __ironfist: IronFistGlobal }).__ironfist;
    return g.game.session!.sim.fighters.map((f) => ({ hp: f.hp, state: f.state, x: f.x, z: f.z, comboHits: f.comboHits }));
  });
}

/** Wait until at least n sim frames have elapsed. */
export async function waitFrames(page: Page, n: number): Promise<void> {
  const start = (await getGlobal(page)).simFrame;
  await page.waitForFunction((target) => (window as unknown as { __ironfist: IronFistGlobal }).__ironfist.game.getSimFrame() >= target, start + n, { timeout: 30_000 });
}

/** Queue exact per-sim-frame inputs for a player. */
export async function script(page: Page, player: number, frames: number[]): Promise<void> {
  await page.evaluate(([p, f]) => {
    (window as unknown as { __ironfist: IronFistGlobal }).__ironfist.game.input.enqueueScript(p as number, f as number[]);
  }, [player, frames] as const);
}

/** Absolute InputFrame bits (mirrors src/input/InputFrame.ts). */
export const IN = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, B1: 16, B2: 32, B3: 64, B4: 128 } as const;
export function hold(frame: number, n: number): number[] { return new Array(n).fill(frame); }

export function getRound(page: Page): Promise<{ phase: number; wins: [number, number]; roundNumber: number; winner: number; lastRoundResult: string }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __ironfist: IronFistGlobal }).__ironfist;
    const r = g.game.session!.sim.round;
    return { phase: r.phase, wins: r.wins, roundNumber: r.roundNumber, winner: r.winner, lastRoundResult: r.lastRoundResult };
  });
}
