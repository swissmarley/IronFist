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
- [ ] 7 more fighters, 6 stages
- [ ] Menus, character select, modes, arcade story-lite

## Phase 5 — AI and balance
- [ ] Layered AI, difficulties, headless balance reports

## Phase 6 — Polish and performance
- [ ] Quality tiers, loading, accessibility, bug bash, full E2E

## Phase 7 — Stretch
- [ ] Rollback netcode
