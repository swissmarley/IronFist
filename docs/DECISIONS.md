# Decisions log

- **D-001 Integer sim.** Positions in mm, directions in Q12, time in frames. Avoids
  float trig/non-determinism across engines and is rollback-friendly.
- **D-002 No React.** Menus and HUD are plain DOM (small typed components). Removes a
  dependency and keeps the UI outside the game loop. Store is a tiny custom one.
- **D-003 Pinned Chromium for local E2E.** The sandbox ships Chromium 1194; the
  Playwright config uses it when present (`PW_CHROMIUM_PATH` override) and CI
  installs the matching browser via `playwright install`.
- **D-004 Fixed-step loop samples input right before each step.** Guarantees < 1
  frame of added input latency. Catch-up capped at 6 steps/frame.
- **D-005 Debug hotkeys F1–F4** are bound globally (hitboxes, frame data, profiler,
  input display) and only touch render/UI flags, never the sim.
- **D-006 Health 170 / round, 60 s timer by default.** Numbers chosen to match the
  reference genre's round length (~30–45 s of real fighting).
- **D-007 Command interpreter is a trie over a per-fighter ring of InputFrames**,
  evaluated every frame; motions have per-step max gaps and a trailing button
  buffer window. Just-frames are an explicit window on the last token.
