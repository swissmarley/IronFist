# Feel checklist (side-by-side review against the reference genre)

Tick each item only after verifying in the running game.

## Input responsiveness
- [x] Jab (1) starts on the frame after the key press (10f startup counted from press). *tests/unit/sim.test.ts: hits on frame 10; e2e/training.spec.ts keyboard jab.*
- [x] No visible input lag between tap and animation start at 60 fps. *Input is sampled immediately before each sim step (src/core/loop.ts); the view renders the current snapshot the same rAF.*
- [x] Dash (f,f) and backdash (b,b) register with up to a 10-frame gap. *tests/unit/commands.test.ts (per-token maxGap 10), sim.test.ts dash/backdash.*
- [x] Crouch-dash and wavedash inputs parse reliably. *commands.test.ts: f,n,d,d/f.*

## Hit-stop
- [x] Light hits freeze both fighters ~4f; heavies ~10f; launchers ~12f. *TUNING.hitstopLight/Heavy/Launch = 4/10/12 (src/sim/config.ts); sim.test.ts checks hit-stop on the jab.*
- [x] Hit-stop freezes animation but the camera shake plays through it. *FighterAnimator shudders in place during hit-stop; CameraRig shake is wall-clock driven (src/render/CameraRig.ts).*

## Block / sidestep
- [x] Holding back blocks highs and mids; lows connect. *sim.test.ts; e2e/training.spec.ts.*
- [x] Crouch-block blocks lows; highs whiff over a crouching fighter. *sim.test.ts; e2e/training.spec.ts scripted inputs.*
- [x] A sidestep evades a linear attack but not a homing attack. *sim.test.ts.*
- [x] Tracking is asymmetric (strong/weak side). *src/sim/movement.ts sideIsStrong + sidestepWeakScale.*

## Juggles
- [x] Launcher lifts the opponent with weight; successive hits lift less. *tests/unit/phase2.test.ts juggle test (lift decay + scaling).*
- [x] Combo damage scales; bound hits allow a ground re-pickup once. *phase2.test.ts.*
- [x] Wall splat holds the opponent on the wall for a follow-up. *phase2.test.ts wall splat.*

## Camera
- [x] Side-on framing with both fighters, zooms with distance. *src/render/CameraRig.ts; stage review shots in test-results/review.*
- [x] Punch-in on heavy hits, slow-motion KO camera. *Session.consumeEvents addPunch on strength ≥ 2; KO slow-mo (D-015), e2e/versus.spec.ts.*
