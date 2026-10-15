import { test, expect } from '@playwright/test';
import { bootGame, waitFrames } from './helpers';

/** Full menu path: title → main menu → versus → character select → stage select → match → pause → quit. */
test('menus: title to versus match and back via pause', async ({ page }) => {
  const errors = await bootGame(page, '/?quality=potato&stage=greybox');
  await expect(page.locator('.title-screen')).toBeVisible();
  const press = async (code: string): Promise<void> => { await page.keyboard.down(code); await waitFrames(page, 3); await page.keyboard.up(code); await waitFrames(page, 3); };
  await press('Enter');
  await expect(page.locator('.main-menu')).toBeVisible();
  await press('KeyS'); // ARCADE -> VERSUS
  await press('KeyU');
  await expect(page.locator('.char-select')).toBeVisible();
  await press('KeyU');        // P1 confirms
  await press('Numpad4');     // P2 confirms
  await expect(page.locator('.stage-select')).toBeVisible();
  await press('KeyS'); await press('KeyU');  // first listed stage (dojo)
  await page.waitForFunction(() => (window as unknown as { __ironfist: { app: { currentState: string } } }).__ironfist.app.currentState === 'match', null, { timeout: 60_000 });
  await waitFrames(page, 100);
  await expect(page.locator('.hud')).toBeVisible();
  await press('Enter');       // pause
  await expect(page.locator('.pause-menu')).toBeVisible();
  await press('KeyS'); await press('KeyU'); // MOVE LIST
  await expect(page.locator('.move-list')).toBeVisible();
  await expect(page.locator('.move-row').first()).toBeVisible();
  await press('KeyI');        // back
  await expect(page.locator('.pause-menu')).toBeVisible();
  await press('KeyS'); await press('KeyS'); await press('KeyS'); await press('KeyU'); // QUIT (resume, movelist, settings, restart, quit)
  await expect(page.locator('.main-menu')).toBeVisible();
  // settings page opens and remap prompt appears
  await press('KeyW'); await press('KeyW'); await press('KeyU'); // cursor was on VERSUS: up, up wraps to SETTINGS
  await expect(page.locator('.settings-screen')).toBeVisible();
  await press('KeyS'); await press('KeyS'); await press('KeyU'); // CONTROLS P1
  await press('KeyU'); // remap LEFT
  await expect(page.locator('.remap-prompt')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
