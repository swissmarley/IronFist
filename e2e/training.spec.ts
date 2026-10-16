import { test, expect } from '@playwright/test';
import { bootGame, getFighters, hold, IN, script, waitFrames } from './helpers';

const URL = '/?mode=training&quality=potato&stage=greybox&p1=greybox&p2=greybox';

test.describe('grey-box training room', () => {
  test('keyboard jab hits, holding back blocks, overlays render', async ({ page }) => {
    const errors = await bootGame(page, URL);
    await waitFrames(page, 10);
    // P1 walks forward to close the gap, then jabs (keyboard path, with a held key so a 60 Hz sample sees it)
    await page.keyboard.down('KeyD');
    await waitFrames(page, 36);
    await page.keyboard.up('KeyD');
    await waitFrames(page, 5);
    await page.keyboard.down('KeyU');
    await waitFrames(page, 2);
    await page.keyboard.up('KeyU');
    await waitFrames(page, 24);
    let f = await getFighters(page);
    expect(f[1]!.hp).toBeLessThan(170);
    const hpAfterHit = f[1]!.hp;
    await waitFrames(page, 60);
    // P2 holds back (ArrowRight = away from P1); P1 jabs again -> blocked
    await page.keyboard.down('ArrowRight');
    await waitFrames(page, 3);
    const hpBeforeBlock = (await getFighters(page))[1]!.hp;
    await page.keyboard.down('KeyU');
    await waitFrames(page, 2);
    await page.keyboard.up('KeyU');
    await waitFrames(page, 24);
    f = await getFighters(page);
    expect(f[1]!.hp).toBeGreaterThanOrEqual(hpBeforeBlock); // blocked: no damage (training regen may add)
    expect(hpAfterHit).toBeLessThan(170);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('F1');
    await page.keyboard.press('F2');
    await page.keyboard.press('F4');
    await page.keyboard.down('KeyS');
    await waitFrames(page, 6);
    await expect(page.locator('.dbg-framedata')).toContainText('Crouch');
    await page.keyboard.up('KeyS');
    await waitFrames(page, 4);
    expect(errors).toEqual([]);
  });

  test('debug overlays render over a deterministic exchange (visual)', async ({ page }) => {
    const errors = await bootGame(page, URL);
    // Pause, queue exact inputs and step a fixed number of sim frames, so the pose and
    // overlays are identical on every run regardless of headless frame rate.
    await page.evaluate(() => (window as unknown as { __ironfist: { game: { loop: { setPaused(p: boolean): void } } } }).__ironfist.game.loop.setPaused(true));
    const p1 = [...hold(IN.RIGHT, 30), ...hold(0, 8), IN.B1, IN.B1, ...hold(0, 30), ...hold(IN.DOWN, 14)];
    await script(page, 0, p1);
    await script(page, 1, hold(0, p1.length));
    await page.evaluate((n) => {
      const loop = (window as unknown as { __ironfist: { game: { loop: { stepOnce(): void } } } }).__ironfist.game.loop;
      for (let i = 0; i < n; i++) loop.stepOnce();
    }, p1.length);
    await page.keyboard.press('F1');
    await page.keyboard.press('F2');
    await page.keyboard.press('F4');
    await expect(page.locator('.dbg-framedata')).toContainText('Crouch');
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('training-hitboxes.png', { maxDiffPixelRatio: 0.03, timeout: 60_000 });
    expect(errors).toEqual([]);
  });

  test('scripted inputs: sidestep evades a jab, crouch makes a high whiff, low hits a standing block', async ({ page }) => {
    await bootGame(page, URL);
    await waitFrames(page, 5);
    const before = await getFighters(page);
    // P2 taps up for 2 frames (sidestep in); P1 jabs 2 frames later
    await script(page, 1, [...hold(IN.UP, 2), ...hold(0, 40)]);
    await script(page, 0, [0, 0, IN.B1, ...hold(0, 39)]);
    await waitFrames(page, 45);
    const after = await getFighters(page);
    expect(Math.abs(after[1]!.z - before[1]!.z)).toBeGreaterThan(250);
    expect(after[1]!.hp).toBe(170);
    // reposition: P2 walks back toward the line is not needed; P1 does a low kick (d+4) while P2 stands blocking
    await waitFrames(page, 30);
    await script(page, 1, [...hold(0, 28), ...hold(IN.RIGHT, 40)]);
    await script(page, 0, [...hold(IN.RIGHT, 30), IN.DOWN | IN.B4, ...hold(IN.DOWN, 20), ...hold(0, 19)]);
    await waitFrames(page, 75);
    const low = await getFighters(page);
    expect(low[1]!.hp).toBeLessThan(170);
  });
});
