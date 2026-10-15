import { test, expect } from '@playwright/test';
import { bootGame } from './helpers';

/** With the quality setting on AUTO, the start-up probe must settle on a tier that fits the (slow, software) renderer. */
test('auto quality probes the frame time and drops to a cheaper tier', async ({ page }) => {
  test.setTimeout(240_000);
  await bootGame(page, '/?mode=training&stage=greybox&p1=greybox&p2=greybox');
  const tier = await page.waitForFunction(() => {
    const g = (window as unknown as { __ironfist: { game: { quality: { tier: string } } } }).__ironfist;
    return g.game.quality.tier !== 'medium' ? g.game.quality.tier : null;
  }, null, { timeout: 200_000 });
  expect(['low', 'potato']).toContain(await tier.jsonValue());
});
