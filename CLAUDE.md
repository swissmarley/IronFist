# IRON FIST — working notes for Claude Code

Original 3D browser fighting game (see docs/SPEC.md). Current phase: **4 (content scale-up) — roster, menus, modes done; stages in progress → 5 (AI & balance)**.

## Commands
- `pnpm install` — install (pnpm 10, Node 22)
- `pnpm dev` — Vite dev server on http://127.0.0.1:5173
- `pnpm typecheck` / `pnpm lint` / `pnpm test` — TS strict, ESLint, Vitest unit tests
- `pnpm build` — typecheck + production build to `dist/`
- `pnpm test:e2e` — Playwright (uses preinstalled Chromium at /opt/pw-browsers/chromium when present)
- `pnpm exec playwright test --update-snapshots` — refresh visual baselines
- `pnpm test:all` — everything, in CI order
- `pnpm sim:balance [perLevel] [perPair]` — headless AI ladder + matchup report → docs/BALANCE.md (1000/level ≈ 30 min)

## Conventions
- TypeScript strict; files ≤ 500 lines (lint-enforced); no `any`; no shipped TODOs.
- `src/sim`, `src/core`, `src/data`, `src/ai` are deterministic: integers only
  (mm, Q12, frames), seeded `Rng`, no wall clock, no `three` imports.
- Rendering interpolates sim snapshots; the sim never depends on rendering/physics.
- Debug hotkeys: F1 hitboxes, F2 frame data, F3 profiler, F4 input display.
- `pnpm tsx tools/bake-hitboxes.ts` regenerates `src/data/baked/*.json` after changing poses/templates/move anim specs (commit the JSON).
- Visual review: `PW_PORT=4273 pnpm exec playwright test e2e/review.spec.ts` writes shots to test-results/review/; `e2e/animtool.spec.ts` writes pose contact sheets to test-results/anim/.
- Headless Chromium renders at ~4 fps; functional E2E uses `stage=greybox&quality=potato`. Use `PW_PORT` to avoid port clashes with parallel runs.
- Query params: `?gl=webgl` forces the WebGL2 backend; `?stage=dojo|greybox`; `?nopost=1`; `?mode=training|versus|practice` (quick start; `p1=`/`p2=` character ids, `cpu=N` level for P2, `seed=`); `?quality=potato..ultra`; `?hp=N` round HP; `?ringout=1` open-edge arena.
- E2E drives the sim with keyboard (hold keys ≥ 1 frame) or exact per-frame scripts via `window.__ironfist.game.input.enqueueScript`.
- Player 1: WASD + U/I/J/K (O=1+2, L=3+4, Y=1+3, H=2+4). Player 2: arrows + Numpad 4/5/1/2 or Z/X/C/V.
- Every decision goes in docs/DECISIONS.md; every asset licence in docs/CREDITS.md.
- Update docs/TASKS.md and this file after every milestone.

## Layout
See docs/ARCHITECTURE.md. Entry: `index.html` → `src/main.ts` → `src/app/Game.ts` (renderer/loop/input/audio) → `src/app/App.ts` (screens, modes, MatchRunner).
Roster: `src/data/characters/<id>.ts` + `src/data/baked/<id>.json`, registered in `src/data/characters/index.ts`; brief in docs/ROSTER.md.
Stages: `src/render/stages/<id>.stage.ts` (default export StageFactory) are auto-discovered.
