import { test, expect } from '@playwright/test';

/** Renders contact sheets from the animation tool; used for visual review of poses. */
const SHEETS: [string, string, string][] = [
  ['idle', '0,30,60,90', 'side'],
  ['idle', '0,30,60,90', 'front'],
  ['walkF', '0,8,16,24', 'side'],
  ['crouchIdle', '0,45', '3q'],
  ['move:jab', '0,5,10,14,20', 'side'],
  ['move:straight', '0,6,11,15,23', 'side'],
  ['move:df2', '0,8,15,20,35', 'side'],
  ['move:k3', '0,8,14,20,32', 'side'],
  ['move:d4', '0,7,12,20,28', 'side'],
  ['move:uf4', '0,8,15,22,42', 'side'],
  ['move:db3', '0,8,16,24,46', '3q'],
  ['hitHeavy', '0,4,12,20,28', 'side'],
  ['launched', '0,6,30,60', 'side'],
  ['lyingUp', '8', '3q'],
  ['getup', '0,12,24', 'side'],
  ['move:throw13', '0,12,20,40', 'side'],
];

/** Per-character stance idle (front/side), intro and win sheets: [char, clip, frames, view]. */
const ROSTER = ['kaede', 'boris', 'luiz', 'meiling', 'jaehyun', 'seraphine', 'ricardo', 'golem'];
const CHAR_SHEETS: [string, string, string, string][] = ROSTER.flatMap((c): [string, string, string, string][] => [
  [c, 'idle', '0,30,60,90', '3q'],
  [c, 'idle', '0,30,60,90', 'side'],
  [c, 'intro', '0,30,60,80,100', '3q'],
  [c, 'win', '0,30,60,100,140', '3q'],
]);

for (const [char, clip, frames, view] of CHAR_SHEETS) {
  test(`contact sheet ${char} ${clip} ${view}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/tools/animation.html?char=${char}&clip=${clip}&frames=${frames}&view=${view}&cols=5`);
    await page.waitForFunction(() => ((window as unknown as { __animTool?: { rendered: number } }).__animTool?.rendered ?? 0) > 0, null, { timeout: 60_000 });
    await page.locator('#sheet').screenshot({ path: `test-results/anim/char-${char}-${clip}-${view}.png` });
    expect(errors).toEqual([]);
  });
}

for (const [clip, frames, view] of SHEETS) {
  test(`contact sheet ${clip} ${view}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/tools/animation.html?clip=${encodeURIComponent(clip)}&frames=${frames}&view=${view}&cols=5`);
    await page.waitForFunction(() => (window as unknown as { __animTool?: { rendered: number } }).__animTool?.rendered !== undefined && (window as unknown as { __animTool: { rendered: number } }).__animTool.rendered > 0, null, { timeout: 60_000 });
    await page.locator('#sheet').screenshot({ path: `test-results/anim/${clip.replace(':', '_')}-${view}.png` });
    expect(errors).toEqual([]);
  });
}
