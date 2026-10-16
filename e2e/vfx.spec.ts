import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import type { VfxPreviewGlobal } from '../tools/vfx-preview';

/**
 * Drives tools/vfx-preview.html on a Vite dev server (the preview server in
 * playwright.config.ts only serves the built `dist`, which has no VFX page),
 * spawns every preset on both backends and snapshots the result.
 */
const PORT = 5174;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGE = `${BASE}/tools/vfx-preview.html`;
let server: ChildProcess | null = null;

async function portOpen(): Promise<boolean> {
  try { return (await fetch(PAGE)).ok; } catch { return false; }
}

test.beforeAll(async () => {
  if (await portOpen()) return; // reuse a dev server someone already started
  server = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'ignore', detached: true,
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await portOpen()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite dev server did not start on ${PORT}`);
});

test.afterAll(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
  }
});

interface Live { particles: number; flashes: number; rings: number; capacity: number }

async function bootPreview(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE + query);
  await page.waitForFunction(() => window.__vfx?.ready === true, null, { timeout: 60_000 });
  // let the live loop render a few real frames first
  await page.waitForFunction(() => (window.__vfx as VfxPreviewGlobal).frames > 5, null, { timeout: 30_000 });
  return errors;
}

for (const [name, query] of [['webgpu', ''], ['webgl2', '?gl=webgl']] as const) {
  test(`spawns every preset and renders on ${name}`, async ({ page }) => {
    const errors = await bootPreview(page, query);
    const backend = await page.evaluate(() => (window.__vfx as VfxPreviewGlobal).backend);
    expect(backend === 'webgpu' || backend === 'webgl2').toBe(true);
    if (name === 'webgl2') expect(backend).toBe('webgl2');

    // deterministic: freeze the loop, reseed, spawn everything, step fixed frames, render once
    const live: Live = await page.evaluate(() => {
      const v = window.__vfx as VfxPreviewGlobal;
      // 4 frames = 67 ms: inside every flash's 80-150 ms lifetime, sparks already stretched
      v.pause(); v.reseed(7); v.spawnAll(); v.step(1000 / 60, 4); v.render();
      return v.live();
    });
    expect(live.particles).toBeGreaterThan(100);
    expect(live.particles).toBeLessThanOrEqual(live.capacity);
    expect(live.flashes).toBeGreaterThan(5);
    expect(live.rings).toBeGreaterThan(3);
    await expect(page).toHaveScreenshot(`vfx-presets-${name}.png`, { maxDiffPixelRatio: 0.05 });

    // everything dies within a few seconds and the pools are empty again (no leaks)
    const after: Live = await page.evaluate(() => {
      const v = window.__vfx as VfxPreviewGlobal;
      v.step(1000 / 60, 240); v.render();
      return v.live();
    });
    expect(after.particles).toBe(0);
    expect(after.flashes).toBe(0);
    expect(after.rings).toBe(0);

    // quality change rebuilds buffers; reduced flash toggles without error
    const rebuilt: Live = await page.evaluate(() => {
      const v = window.__vfx as VfxPreviewGlobal;
      v.setQuality(500); v.setReducedFlash(true); v.spawnAll(); v.step(1000 / 60, 3); v.render();
      return v.live();
    });
    expect(rebuilt.capacity).toBeLessThan(live.capacity);
    expect(rebuilt.particles).toBeGreaterThan(0);
    expect(rebuilt.particles).toBeLessThanOrEqual(rebuilt.capacity);

    const pageErrors = await page.evaluate(() => (window.__vfx as VfxPreviewGlobal).errors);
    expect(pageErrors).toEqual([]);
    expect(errors).toEqual([]);
  });
}
