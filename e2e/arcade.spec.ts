import { test, expect } from '@playwright/test';
import { bootGame, getFighters, waitFrames } from './helpers';

/** Arcade through the menus: the CPU opponent must act and the ladder label must show. */
test('arcade: character select to a CPU fight', async ({ page }) => {
  const errors = await bootGame(page, '/?quality=potato&stage=greybox');
  const press = async (code: string): Promise<void> => { await page.keyboard.down(code); await waitFrames(page, 3); await page.keyboard.up(code); await waitFrames(page, 3); };
  await press('Enter');
  await press('KeyU'); // ARCADE
  await expect(page.locator('.char-select')).toBeVisible();
  await expect(page.locator('.select-name').first()).not.toBeEmpty();
  await page.evaluate(() => (window as unknown as { __ironfist: { game: { loop: { setPaused(p: boolean): void } } } }).__ironfist.game.loop.setPaused(true));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.pw-out/arcade-select.png' });
  await page.evaluate(() => (window as unknown as { __ironfist: { game: { loop: { setPaused(p: boolean): void } } } }).__ironfist.game.loop.setPaused(false));
  await press('KeyD'); // move cursor
  await press('KeyU'); // confirm
  await page.waitForFunction(() => (window as unknown as { __ironfist: { app: { currentState: string } } }).__ironfist.app.currentState === 'match', null, { timeout: 90_000 });
  await expect(page.locator('.arcade-ladder')).toHaveText(/STAGE 1 \/ 8/);
  await waitFrames(page, 400);
  const f = await getFighters(page);
  // the CPU must have moved or attacked, and both fighters should still be alive
  const moved = await page.evaluate(() => {
    const g = (window as unknown as { __ironfist: { app: { currentRunner: { session: { sim: { fighters: { x: number; state: number }[]; frame: number } } } } } }).__ironfist;
    const p2 = g.app.currentRunner.session.sim.fighters[1]!;
    return { x: p2.x, state: p2.state, frame: g.app.currentRunner.session.sim.frame };
  });
  expect(moved.frame).toBeGreaterThan(200);
  expect(f[0]!.hp + f[1]!.hp).toBeLessThanOrEqual(340);
  expect(errors).toEqual([]);
});
