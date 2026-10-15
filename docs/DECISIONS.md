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
- **D-008 Hit/hurt capsules are authored per move as local-space capsule tracks**
  (baked from the animation pose at authoring time with the /tools/animation page
  in Phase 3). The sim never evaluates a skeleton, which keeps it deterministic and
  cheap; the F1 viewer shows exactly what the sim tests.
- **D-009 Simultaneous presses must land on the same sampled frame.** Macro keys
  (1+2, 3+4, 1+3, 2+4) are bound by default on keyboard and shoulder buttons on pads.
- **D-010 Move frame 0 is the press frame;** a hit with `frames: [10, 10]` connects 10
  steps after the input (i10). Frame advantage is derived at contact:
  stun = remaining recovery + onBlock/onHit, so the data is the single source of truth
  and the validator rejects advantages the recovery cannot express.
- **D-011 String follow-ups start after the previous hit's active window** (fixed
  string timing). Early presses are buffered and come out at `cancelFrame`.
- **D-012 Blocked attacks push the attacker more than the defender** (60/40), and
  a walled defender doubles the attacker's pushback.
- **D-013 Throws are moves with a `throw` block and no hitboxes.** They connect by a
  forward range/side check on `grabFrame`, whiff on crouchers unless flagged, and the
  victim is locked to the thrower during the animation. Breaks are matched against the
  pressed-edge button mask (1 / 2 / 1+2) within `breakWindow`.
- **D-014 Wall splat is geometric.** A heavy/knockdown hit within 1.4 m of a wall sets a
  pending splat that fires when the pushback reaches the boundary; airborne fighters
  touching a wall splat directly. Two extra wall hits are allowed before the drop.
- **D-015 KO slow-motion is implemented in the Session**, which steps the sim every 3rd
  loop step during the KO phase. Sim frames stay exact so replays are unaffected.
- **D-016 Launch drift is deliberately small** (4–8 mm/frame) so juggles require a short
  step/dash to follow, matching the reference feel without the opponent flying away.
