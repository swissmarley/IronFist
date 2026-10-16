import { test, expect } from '@playwright/test';
import { bootGame, getGlobal, waitFrames } from './helpers';

test('boots the arena at default quality with no console errors', async ({ page }) => {
  // One medium-quality capture of the paused Dojo takes ~16 s on software GL here and
  // roughly twice that on GitHub runners; a first-run baseline needs two matching captures.
  test.setTimeout(240_000);
  const consoleErrors = await bootGame(page, '/?mode=training&p1=greybox&p2=greybox&quality=medium');
  await waitFrames(page, 30);
  const g = await getGlobal(page);
  expect(g.simFrame).toBeGreaterThanOrEqual(30);
  expect(g.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.keyboard.press('F3');
  await expect(page.locator('.dbg-profiler')).toBeVisible();
  await expect(page.locator('.dbg-profiler')).toContainText('backend');
  await page.keyboard.press('F3');
  await page.evaluate(() => (window as unknown as { __ironfist: { game: { loop: { setPaused(p: boolean): void } } } }).__ironfist.game.loop.setPaused(true));
  await page.waitForTimeout(600);
  await expect(page).toHaveScreenshot('greybox-boot.png', { maxDiffPixelRatio: 0.05, timeout: 150_000 });
});
