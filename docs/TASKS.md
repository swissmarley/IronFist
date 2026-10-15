# Tasks

## Phase 0 — Foundation
- [x] Repo tooling: pnpm, Vite, TypeScript strict, ESLint, Vitest, Playwright
- [x] CLAUDE.md, SPEC.md, ARCHITECTURE.md, TASKS.md, DECISIONS.md, CREDITS.md, FEEL_CHECKLIST.md
- [x] Integer math, seeded RNG, hashing, ring buffer
- [x] Fixed 60 Hz loop with accumulator and interpolation alpha
- [x] WebGPU renderer with WebGL2 fallback and backend detection
- [x] Grey-box arena scene
- [x] Debug overlays (F3 profiler; F1/F2/F4 flags)
- [x] CI workflow
- [x] Unit tests + Playwright smoke test with screenshot

## Phase 1 — Combat core
- [x] InputFrame, keyboard + gamepad sources, bindings (remap UI in Phase 4)
- [x] Input history ring + command interpreter (per-token gaps, buffers, just-frame)
- [x] Fighter state machine: idle/walk/dash/run/backdash/sidestep/sidewalk/crouch/crouch-dash/jump
- [x] Auto-facing, pushboxes, arena bounds
- [x] Move data schema + validator + frame-data test
- [x] Hit/hurt capsule pipeline from pose (local-space capsule tracks)
- [x] Hit levels, stand/crouch block, hit-stun/block-stun, pushback, hit-stop, counter hit, crush, power-crush armour
- [x] Hitbox viewer (F1), frame data overlay (F2), input display (F4)
- [x] 2P grey-box playable in training room (keyboard + scripted-input E2E)

## Phase 2 — Full move system
- [x] Juggles with integer gravity, lift decay, combo scaling, bound (one per combo) and screw
- [x] Throws (1+3, 2+4, d/f+1+2, f,f+1+3 dash throw), three-way breaks, chain-throw hook, ground/crouch grab flags
- [x] Crush system, power-crush armour, parry
- [x] Walls: splat (with extra wall hits), wall bounce, open-edge ring-out
- [x] Knockdown/oki: tech roll, stay down, kip-up, roll back/forward, floor attacks, ground hits
- [x] Counter hits (bonus damage, CH reactions)
- [x] Round/match flow: intro, timer, KO/time/double/perfect/ring-out, slow-mo KO, results, rematch
- [x] Replay module (record / verify / serialise) + determinism tests

## Phase 3 — First fighter at final quality
- [x] Procedural skinned rig, pose-keyframe animation, IK-aimed attack templates, /tools/animation
- [x] Pose-baked hit/hurt capsules (tools/bake-hitboxes.ts)
- [x] Physical materials with procedural roughness, palettes per fighter
- [x] Dojo Rooftop stage: procedural planks/stone/tiles/windows, analytic sky + PMREM IBL, lanterns, pagoda, parallax skyline, painted far backdrop
- [x] Post pipeline: GTAO(+denoise), bloom, grading/vignette, ACES, SMAA/FXAA per tier; KO/wall screen flash
- [x] Audio engine (mixer, procedural SFX, music stems, announcer, crowd) wired to sim events
- [x] VFX (instanced particles, impact flashes, shockwaves) wired to sim events
- [x] Hit-stop shudder, camera shake/punch, slow-motion KO
- [ ] Known issues: floor shadows faint under IBL; white costume halos at high sun; no spring-bone hair/cloth yet; facial blendshapes not started

## Phase 4 — Content scale-up
- [x] 8 original fighters (60–100 moves each, stances, chain throws, ten-hit strings), roster validator, baked capsules, per-character looks
- [x] 6 stages: Dojo Rooftop, Harbour Deck (ring-out), Neon Street, Desert Ruins (ring-out), Bamboo Forest, Arena Colosseum — auto-discovered, each with dynamic background and its own grading/music theme
- [x] Title, main menu, character select with 3D turntable, stage select, versus splash, loading tips, results, pause, move list
- [x] Settings (video/audio/controls remap/accessibility/rules) persisted in IndexedDB; records
- [x] Modes: arcade (8-fight ladder, sub-boss/boss intros, endings), versus, practice (dummy modes, record/playback, move demo), survival, time attack, replay theatre
- [x] First CPU opponent (BasicAI) with 5 difficulty levels
- [x] Per-character stance idle poses; intro/win poses per character (polish)

## Phase 5 — AI and balance
- [x] Per-character playbook from baked move reach (pokes, mids, lows, launchers, throws, punishers, homing, power crush, ground hits)
- [x] Layered AI: throw breaks, wake-up, delayed-reaction defence, level reads, sidesteps, block/whiff punish, juggles, oki, spacing, adaptive mix-ups, execution accuracy, optional rubber-band
- [x] Five difficulties tuned so each beats the one below (tests/unit/balance.test.ts)
- [x] Headless batch tools: `pnpm sim:balance` → docs/BALANCE.md (ladder + matchup table)

## Phase 6 — Polish and performance
- [x] Start-up frame-time probe picks the tier on AUTO; dynamic render scale targets the frame budget (src/render/AdaptiveQuality.ts, e2e/quality.spec.ts)
- [x] Accessibility options wired: reduced shake/flash, colour-blind HUD palette, attack-level sound cues, hold-to-block assist
- [x] FEEL_CHECKLIST ticked with evidence; stage-boot regression spec over all six stages (e2e/stages.spec.ts)
- [x] Stage exposure applied before bloom (no costume halos on dark-graded stages)
- [x] Character balance pass 1 (AI spacing/whiff-punish/throw-reach fixes, faster motion execution, mid-air freeze sim fix, per-character data trims) — all fighters 44–60% at Hard mirror; ladder 86/71/66/64%, 0 stalls
- [x] Contact shadows under fighters (faint IBL floor shadows); cloth albedo cap for white costumes
- [x] Spring-bone hair, belt ends and cloth flaps on every fighter (D-023)
- [x] Per-character stance on the character-select turntable
- [ ] Facial blendshapes (not started)
- [x] Bug bash (no shipped TODO/console.log/`any`) + full `pnpm test:all` on the final build: 166 unit tests, 67 Playwright specs green

## Phase 7 — Stretch
- [x] Rollback netcode (D-025): `MatchSim.snapshot/restore`; `src/net` RollbackSession (input delay 2, prediction, 8-frame window + stall, time sync, confirmed-hash desync check), binary protocol, loopback + WebRTC transports, copy/paste signalling with a `?signal=` hook
- [x] ONLINE menu → host/join lobby → character pick (each side) → host stage pick → `NetMatchRunner` match with net HUD (RTT, rollbacks, stalls)
- [x] Tests: snapshot/restore determinism, two peers over a seeded lossy/jittery channel (2000 frames, 3 profiles), loopback lobby path, `e2e/online.spec.ts` (two tabs over real WebRTC)
- [ ] Online polish: rematch without reconnecting, spectators, automatic input delay from RTT, a signalling server implementation, desync recovery (state transfer)
