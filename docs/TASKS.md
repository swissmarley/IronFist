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
- [ ] Juggles, gravity, scaling, bound/screw
- [ ] Throws + breaks, command throws
- [ ] Crush system, power crush, parry
- [ ] Walls: splat/bounce, ring-out
- [ ] Knockdown/oki/tech-roll/get-up
- [ ] Counter hits
- [ ] Round/match flow, timer, KO rules
- [ ] Replay determinism test

## Phase 3 — First fighter at final quality
- [ ] Rigged fighter + animation set
- [ ] PBR materials, stage 1 lighting and VFX
- [ ] Hit-stop, camera work, audio

## Phase 4 — Content scale-up
- [ ] 7 more fighters, 6 stages
- [ ] Menus, character select, modes, arcade story-lite

## Phase 5 — AI and balance
- [ ] Layered AI, difficulties, headless balance reports

## Phase 6 — Polish and performance
- [ ] Quality tiers, loading, accessibility, bug bash, full E2E

## Phase 7 — Stretch
- [ ] Rollback netcode
