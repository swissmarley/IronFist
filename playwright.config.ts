import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Local/cloud sandboxes may ship a pinned Chromium; CI installs the matching one via `playwright install`.
const PREINSTALLED = process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const executablePath = !process.env.CI && existsSync(PREINSTALLED) ? PREINSTALLED : undefined;

const PORT = Number(process.env.PW_PORT ?? 4173);

// Screenshot baselines are tied to the exact Chromium build, fonts and software GPU, so local
// sandboxes (preinstalled Chromium) and CI (Playwright's bundled Chromium on GitHub runners)
// each keep their own set (D-026). CI writes a baseline the first time it is missing.
const SHOT_ENV = process.env.CI ? 'ci' : 'local';

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: `{testDir}/__screenshots__/${SHOT_ENV}/{testFilePath}/{arg}{ext}`,
  ...(process.env.CI ? { updateSnapshots: 'missing' as const } : {}),
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.03 } },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-features=Vulkan'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
