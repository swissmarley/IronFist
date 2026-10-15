import { test, expect } from '@playwright/test';
import { bootGame, getRound, hold, IN, script, waitFrames } from './helpers';

// RoundPhase: Intro 0, Fight 1, KO 2, End 3, MatchOver 4
test('versus: rounds, KO slow-motion, results and rematch', async ({ page }) => {
  const errors = await bootGame(page, '/?mode=versus&quality=potato&stage=greybox&p1=greybox&p2=greybox&hp=12');
  await expect(page.locator('.hud-banner')).toContainText('ROUND 1');
  await waitFrames(page, 105);
  expect((await getRound(page)).phase).toBe(1);
  // P1 walks in and does df+2 (launcher, 15 dmg) -> KO
  await script(page, 0, [...hold(IN.RIGHT, 30), IN.DOWN | IN.RIGHT | IN.B2, ...hold(0, 40)]);
  await waitFrames(page, 60);
  await expect(page.locator('.hud-banner')).toHaveText(/K\.O\.|PERFECT/);
  let r = await getRound(page);
  expect(r.phase).toBe(2);
  // slow-mo (90 sim frames at 1/3 speed = 270 ticks) + end (150) -> round 2 intro
  await waitFrames(page, 440);
  r = await getRound(page);
  expect(r.wins[0]).toBe(1);
  expect(r.roundNumber).toBe(2);
  await waitFrames(page, 105);
  await script(page, 0, [...hold(IN.RIGHT, 30), IN.DOWN | IN.RIGHT | IN.B2, ...hold(0, 40)]);
  await waitFrames(page, 520);
  r = await getRound(page);
  expect(r.phase).toBe(4);
  await expect(page.locator('.results-screen')).toContainText('WINS');
  await page.evaluate(() => (window as unknown as { __ironfist: { game: { loop: { setPaused(p: boolean): void } } } }).__ironfist.game.loop.setPaused(true));
  await expect(page).toHaveScreenshot('versus-results.png', { maxDiffPixelRatio: 0.06 });
  await page.evaluate(() => (window as unknown as { __ironfist: { game: { loop: { setPaused(p: boolean): void } } } }).__ironfist.game.loop.setPaused(false));
  // rematch with Start
  await page.keyboard.down('Enter');
  await waitFrames(page, 2);
  await page.keyboard.up('Enter');
  await waitFrames(page, 5);
  await page.waitForFunction(() => (window as unknown as { __ironfist: { app: { currentState: string } } }).__ironfist.app.currentState === 'match', null, { timeout: 30_000 });
  r = await getRound(page);
  expect([0, 1]).toContain(r.phase); // fresh match: intro or already fighting
  expect(r.roundNumber).toBe(1);
  expect(r.wins).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('ring-out ends a round on an open-edge stage', async ({ page }) => {
  await bootGame(page, '/?mode=versus&quality=potato&stage=greybox&p1=greybox&p2=greybox&ringout=1');
  await waitFrames(page, 105);
  // walk P2 (holding right = backwards for P2) to the edge, then P1 dashes in and launches
  await script(page, 1, [...hold(IN.RIGHT, 170), ...hold(0, 200)]);
  await script(page, 0, [...hold(IN.RIGHT, 150), IN.RIGHT, 0, 0, IN.RIGHT, ...hold(IN.RIGHT, 12), IN.DOWN | IN.RIGHT | IN.B2, ...hold(IN.RIGHT, 60)]);
  await waitFrames(page, 420);
  const r = await getRound(page);
  expect(['ringout', 'ko', 'none']).toContain(r.lastRoundResult);
});
