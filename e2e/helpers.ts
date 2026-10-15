import type { Page } from '@playwright/test';

export interface IronFistGlobal {
  ready: boolean;
  errors: string[];
  game: { getSimFrame(): number };
}

/** Wait for the game to boot and return captured console/page errors list. */
export async function bootGame(page: Page, path = '/'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __ironfist?: IronFistGlobal }).__ironfist?.ready === true, null, { timeout: 60_000 });
  return errors;
}

export function getGlobal(page: Page): Promise<{ ready: boolean; errors: string[]; simFrame: number }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __ironfist: IronFistGlobal }).__ironfist;
    return { ready: g.ready, errors: g.errors, simFrame: g.game.getSimFrame() };
  });
}
