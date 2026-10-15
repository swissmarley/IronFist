# Architecture

## Layers (strict separation)

```
src/core     integer math, seeded RNG, hashing, ring buffers, fixed-step loop
src/sim      deterministic simulation: fighters, moves, hit resolution, match flow
src/data     character / stage / move data (TS modules + JSON), schemas
src/input    device layer: keyboard + gamepad -> InputFrame (bitmask per frame)
src/ai       AI controllers that produce InputFrames from sim state (deterministic)
src/render   Three.js (WebGPU / WebGL2) scene, animation, VFX, camera, post
src/audio    Web Audio mixer, SFX, music stems
src/ui       DOM menus and HUD
src/debug    F1 hitbox viewer, F2 frame data, F3 profiler, F4 input display
src/app      Game root: loop wiring, mode state machine, persistence
```

Rules:

1. `sim`, `core`, `data`, `ai` never import from `render`, `audio`, `ui`, `input`
   devices, or `three`. They must not use `Math.random`, `Date.now`,
   `performance.now`, or floating-point trig. ESLint enforces the first three.
2. The sim advances with `step(inputs: [InputFrame, InputFrame])` exactly once per
   60 Hz frame. Everything the sim needs is in `MatchState`; the state is plain
   integers so it can be hashed (`hashState`) and serialised.
3. Rendering interpolates between the previous and current sim snapshots with the
   loop's `alpha`. Sim events (hits, sounds, VFX) are queued in a per-frame event
   list that render/audio consume and clear.
4. Rapier is used only for cosmetics (ragdoll/props) and never feeds back into the
   sim.

## Units

- Position: integer millimetres on the XZ plane, Y up (mm).
- Direction: Q12 fixed-point unit vector (4096 = 1.0).
- Time: 60 Hz frames.
- Health: integer points (default 170 per round).

## Input pipeline

`KeyboardSource` / `GamepadSource` -> `InputMapper` -> `InputFrame` (u16 bitmask:
8 direction bits reduced to a 3x3 numpad direction + 4 buttons) -> `InputRing`
(per fighter, 60 frames) -> `CommandInterpreter` (trie over the ring with
per-command buffer windows) -> list of matched command ids for the frame, ordered
by priority. Directions are stored relative to facing (f/b) at sample time.

## Sim loop per frame

1. Resolve commands for both fighters (facing-relative).
2. Advance each fighter's state machine (move frame counters, stun timers).
3. Apply movement (walk/dash/sidestep/jump/gravity) with arena collision and
   fighter-vs-fighter pushbox separation.
4. Sample hit/hurt capsules from the pose for this frame.
5. Resolve attacks: trades, crush, block, counter-hit, throws and breaks.
6. Apply reactions, hit-stop, damage scaling, juggle lift, wall events.
7. Match flow: round timer, KO, ring-out, round transitions.
8. Emit events; increment frame.

## Rendering

- `three/webgpu` `WebGPURenderer` with automatic WebGL2 fallback; backend is
  detected and recorded in the quality settings.
- Grey-box scene (Phases 0–2) then the full stage/character pipeline.
- Stages: `src/render/stages/<id>.stage.ts` default-exports a `StageFactory` and
  exports its `arena`; the registry (`stages/index.ts`) discovers them with
  `import.meta.glob`. Helpers shared by stages live in `stages/common.ts`
  (Instancer, SpriteBatch, birds, Part/mergeGeos); procedural textures in
  `stages/textures.ts` and `stages/texturesNature.ts`. Each stage owns its
  lights, IBL, fog, grading and a per-frame `update()` for dynamic backgrounds.
- Post-processing uses the TSL `PostProcessing` pipeline (bloom, tone mapping,
  AA, SSAO, DOF/motion blur per tier).

## Testing

- `vitest` unit tests over `core`, `sim`, `data`, `ai`.
- Replay determinism: run a recorded input log twice and compare state hashes.
- Playwright: boot smoke, menu paths, screenshots for stages/characters.

## AI

`src/ai/LayeredAI.ts` is a pure function of sim state + seeded RNG → `InputFrame`, so
CPU matches replay exactly. A `Playbook` (src/ai/Playbook.ts) classifies the character's
moves from the baked capsules (reach, level, safety, launch). Decision layers run in
priority order each frame: throw break, wake-up, defence, punish, juggle/oki, spacing,
mix-up. `DIFFICULTIES` (src/ai/BasicAI.ts) is the only thing that changes between
levels. `src/ai/batch.ts` runs headless matches for tests and `tools/balance.ts`.
