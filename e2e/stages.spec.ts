import { test, expect } from '@playwright/test';
import { bootGame, getGlobal, hold, IN, script, waitFrames } from './helpers';

/** Every shipped stage boots, runs a short exchange and renders without page or loop errors. */
const STAGES = ['dojo', 'harbour', 'neon', 'desert', 'forest', 'colosseum'];

for (const stage of STAGES) {
  test(`stage ${stage} boots and fights cleanly`, async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors = await bootGame(page, `/?mode=training&stage=${stage}&quality=potato&p1=kaede&p2=boris`);
    await script(page, 0, [...hold(IN.RIGHT, 20), IN.B1, ...hold(0, 20), IN.DOWN | IN.RIGHT | IN.B2, ...hold(0, 40)]);
    await waitFrames(page, 90);
    const g = await getGlobal(page);
    expect(g.simFrame).toBeGreaterThanOrEqual(90);
    expect(g.errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const arena = await page.evaluate(() => (window as unknown as { __ironfist: { game: { scene: { stage: { id: string; arena: { walls: boolean } } } } } }).__ironfist.game.scene.stage);
    expect(arena.id).toBe(stage);
    expect(typeof arena.arena.walls).toBe('boolean');
  });
}
