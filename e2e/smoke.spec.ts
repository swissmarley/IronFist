import { test, expect } from '@playwright/test';
import { bootGame, getGlobal } from './helpers';

test('boots the grey-box scene with no console errors', async ({ page }) => {
  const consoleErrors = await bootGame(page);
  await page.waitForTimeout(1000);
  const g = await getGlobal(page);
  expect(g.simFrame).toBeGreaterThan(30);
  expect(g.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.keyboard.press('F3');
  await expect(page.locator('.dbg-profiler')).toBeVisible();
  await expect(page.locator('.dbg-profiler')).toContainText('backend');
  await expect(page).toHaveScreenshot('greybox-boot.png', { maxDiffPixelRatio: 0.05 });
});
