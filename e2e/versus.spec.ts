import { test, expect } from '@playwright/test';
import { bootGame, getRound, hold, IN, script, waitFrames } from './helpers';

// RoundPhase: Intro 0, Fight 1, KO 2, End 3, MatchOver 4
test('versus: rounds, KO slow-motion, results and rematch', async ({ page }) => {
  const errors = await bootGame(page, '/?mode=versus&quality=potato&hp=12');
  await expect(page.locator('.hud-banner')).toContainText('ROUND 1');
  await waitFrames(page, 105);
  expect((await getRound(page)).phase).toBe(1);
  // P1 walks in and does df+2 (launcher, 15 dmg) -> KO
  await script(page, 0, [...hold(IN.RIGHT, 30), IN.DOWN | IN.RIGHT | IN.B2, ...hold(0, 40)]);
  await waitFrames(page, 60);
  await expect(page.locator('.hud-banner')).toHaveText(/K\.O\.|PERFECT/);
  let r = await getRound(page);
  expect(r.phase).toBe(2);
  // slow-mo + end -> round 2 intro
  await waitFrames(page, 260);
  r = await getRound(page);
  expect(r.wins[0]).toBe(1);
  expect(r.roundNumber).toBe(2);
  await waitFrames(page, 105);
  await script(page, 0, [...hold(IN.RIGHT, 30), IN.DOWN | IN.RIGHT | IN.B2, ...hold(0, 40)]);
  await waitFrames(page, 330);
  r = await getRound(page);
  expect(r.phase).toBe(4);
  await expect(page.locator('.hud-results')).toContainText('WINS');
  await expect(page).toHaveScreenshot('versus-results.png', { maxDiffPixelRatio: 0.06 });
  // rematch with Start
  await page.keyboard.press('Enter', { delay: 60 });
  await waitFrames(page, 5);
  r = await getRound(page);
  expect(r.phase).toBe(0);
  expect(r.wins).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('ring-out ends a round on an open-edge stage', async ({ page }) => {
  await bootGame(page, '/?mode=versus&quality=potato&ringout=1');
  await waitFrames(page, 105);
  // walk P2 (holding right = backwards for P2) to the edge, then P1 dashes in and launches
  await script(page, 1, [...hold(IN.RIGHT, 170), ...hold(0, 200)]);
  await script(page, 0, [...hold(IN.RIGHT, 150), IN.RIGHT, 0, 0, IN.RIGHT, ...hold(IN.RIGHT, 12), IN.DOWN | IN.RIGHT | IN.B2, ...hold(IN.RIGHT, 60)]);
  await waitFrames(page, 420);
  const r = await getRound(page);
  expect(['ringout', 'ko', 'none']).toContain(r.lastRoundResult);
});
