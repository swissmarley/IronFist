import { test } from '@playwright/test';
import { bootGame, hold, IN, script, waitFrames } from './helpers';

/**
 * Visual review captures (not assertions): writes screenshots of key moments
 * to test-results/review/. Run: PW_PORT=4273 pnpm exec playwright test e2e/review.spec.ts
 */
const stage = process.env.REVIEW_STAGE ?? 'dojo';
const quality = process.env.REVIEW_QUALITY ?? 'medium';
test.setTimeout(240_000);

test('stage review shots', async ({ page }) => {
  await bootGame(page, `/?mode=training&stage=${stage}&quality=${quality}`);
  await waitFrames(page, 20);
  await page.screenshot({ path: `test-results/review/${stage}-idle.png` });
  // P1 walks in, launches (df+2), follows with a jab; P2 blocks the first jab
  await script(page, 0, [...hold(IN.RIGHT, 24), IN.B1, ...hold(0, 30), IN.DOWN | IN.RIGHT | IN.B2, ...hold(0, 46), IN.RIGHT, 0, 0, IN.RIGHT, 0, IN.B1, ...hold(0, 60)]);
  await script(page, 1, [...hold(0, 26), ...hold(IN.RIGHT, 20), ...hold(0, 200)]);
  await waitFrames(page, 34);
  await page.screenshot({ path: `test-results/review/${stage}-jab-block.png` });
  await waitFrames(page, 36);
  await page.screenshot({ path: `test-results/review/${stage}-launch.png` });
  await waitFrames(page, 14);
  await page.screenshot({ path: `test-results/review/${stage}-juggle.png` });
});
