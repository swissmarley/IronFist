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
- **D-017 Fighters are procedural skinned rigs; animation is pose-keyframe data.** No
  CC0 fighting mocap is reachable from this environment and the roster needs ~600
  moves, so attack clips are generated from per-move templates (type, limb, height)
  timed by the frame data, with a two-bone IK solver aiming fists/feet at explicit
  targets in metres. Locomotion and reactions are hand-authored key poses.
- **D-018 Hit capsules are baked from the animation pose** (`tools/bake-hitboxes.ts`
  → `src/data/baked/<id>.json`, applied in `src/data/characters/index.ts`). Hurtboxes
  are baked per pose class (head/torso/legs; guard arms deliberately excluded) except
  the airborne class, which stays one generous capsule so juggles are reliable. Highs
  always whiff on crouchers by rule, independent of geometry.
- **D-019 Difficulty is behaviour, never stats.** `LayeredAI` (src/ai/LayeredAI.ts) stacks
  throw-break → wake-up → defence (delayed reaction, level reads, sidestep, power
  crush) → frame-data punish/whiff-punish → juggle/oki → spacing → mix-up layers over a
  per-character `Playbook` built from the baked reach of each move. Levels differ only in
  the `AiDifficulty` table (reaction frames, block/break/punish/step/safe percentages,
  aggression, think cadence, execution accuracy). The idle "hold" input guards with a
  probability tied to `blockPct`; an unconditional back-hold had made every level block
  equally and flattened the ladder. Boss vs Beginner wins ~86% of single rounds after
  the change; each level beats the one below (tests/unit/balance.test.ts, docs/BALANCE.md).
- **D-020 Stage modules export their `arena`** next to the default `StageFactory` so the
  registry (src/render/stages/index.ts) can list names and wall/ring-out type for menus
  without building a scene.
- **D-021 Balance pass 1 is "fix the AI's blind spots first, then nudge the data".** The
  Hard-mirror table (docs/BALANCE.md) had kaede/boris at 26–29% and luiz/meiling at 83%.
  Diagnosis (scratch batches over `runMatch` with per-move hit/whiff/damage tallies)
  showed the gap was mostly how `LayeredAI` used the roster, not the roster itself:
  rushdown archetypes never attacked beyond `ideal + 600` so their f,f moves were never
  used at the range they were built for; whiff punishes picked the longest-reaching move
  instead of a launcher; running throws were never thrown because throws were gated at a
  fixed 1100 mm; and motion inputs (crouch dash, qcf) took 3 input frames per token, which
  made every one of kaede's four cd moves a whiff machine that diluted her pool. Those are
  fixed in src/ai (approach only when nothing reaches, `Playbook.whiffPunisher`, throw
  gating by real throw reach, 2-frame-per-token scripts, input delay counted as startup).
  A sim bug surfaced on the way: a jump attack whose `vy` hit exactly 0 at the apex froze
  in the air for the rest of the round (meiling/luiz jump stats), which was the source of
  the ladder stalls. Only then were the numbers touched, Tekken-5 style: ±10–20% damage,
  2–3 frames of recovery, reach through root-motion distance, onBlock safety and small
  movement-stat trims; no startup/active frames changed, so no rebake. Every change is
  listed in docs/BALANCE.md ("Balance pass 1"). tools/balance.ts now counts both sides of
  every pairing for the per-character rate (twice the sample). Target: every fighter
  within 35–65% at Hard mirror; result 44–60%.
- **D-022 Quality adapts to measured frame time, never to device heuristics.** With the
  quality setting on AUTO, `AdaptiveQuality` averages the first 120 frames after a 30-frame
  warm-up and picks the tier (`tierFromBenchmark`); afterwards a dynamic render scale steps
  between 0.6 and 1.0 against the frame budget. A `?quality=` query param disables both so
  tests stay deterministic. Related rendering rules: stage exposure is applied before bloom
  (so dark-graded stages do not halo bright costumes) and cloth albedo is capped at 0.72
  linear in `RigMaterials` (white gis keep their folds instead of clipping).
- **D-024 Stances, intros and wins are render-only pose sets picked by id.** Each
  `CharacterDef` names `anim: { stance, intro, win }` (strings, so src/data stays free of
  `three`); src/anim/stances.ts and src/anim/ceremonies.ts own the pose sets, and a missing
  or unknown id falls back to the greybox clips, which are unchanged (E2E baselines hold).
  Poses are authored as Euler upper bodies plus foot plants and wrist targets that are
  solved once by the existing two-bone IK (src/anim/plant.ts) and converted back to Euler,
  so feet sit flat on the floor and arms clear the torso by construction and everything
  still composes with the Euler clip pipeline. The stance's first key is the fighter's rest
  pose: idle, walk upper body and the start/end keys of short clips and every move clip use
  it, but a move's active frames never do, so the baked hit capsules are identical with or
  without a stance (unit-tested). Gameplay hurtboxes deliberately stay baked from the shared
  neutral STANCE/CROUCH: stances are cosmetic, and a low wrestler or side-on fencer must not
  change what hits them right after balance pass 1. Intros settle into the stance by
  `roundStartFrames`; wins hold their last key. Root offsets are authored for a 1.78 m
  skeleton, so `FighterAnimator` scales them by `look.heightScale` to keep scaled rigs'
  feet planted.
