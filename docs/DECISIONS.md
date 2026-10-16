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
- **D-023 Hair and cloth secondary motion is a render-only Verlet spring-bone layer.** Each
  fighter gets extra bones appended to its skinned rig (`src/render/rig/SpringRig.ts`)
  driven by pinned Verlet chains (`src/render/rig/SpringBones.ts`: stiffness pull toward
  the rigidly-attached rest shape, damping, gravity, segment length within `maxStretch`,
  push-out from head/chest/hips/thigh capsules, fixed 1/120 s sub-steps, preallocated
  typed arrays, so no per-frame allocation). Chains integrate in world space, which means
  root velocity (walks, dashes, knockback, juggles) produces lag with no extra code.
  `FighterView` flings them away from the attacker when a new hit-stop starts and runs them
  at 0.3x speed during the freeze, so the whip plays out as the freeze releases. Chains come
  from `look.springs` when a look has them (optional `SpringLook` field in
  `src/render/rig/look.ts`). Otherwise `springPresets.ts` derives them from the hair style
  (long → ponytail, bun → bun tail, spiky → nape flicks, short → nape flick) and the costume
  (heavy → front/back flaps, bare torso → side cord, long hair → coat tails, else a belt
  band with knot and two belt ends). A small per-id table adds what the rules cannot infer
  (Mei-Ling's qipao panels). Every roster fighter gets at least one chain. The sim never
  sees any of it; dt is wall-clock, and the per-fighter idle breeze phase is derived from
  the player slot rather than `Math.random`. Spring bones run on every quality tier;
  `QualitySettings.springSegments` caps segments per chain (potato = 1). The cap is read
  when a session is built, so an adaptive tier change mid-match applies from the next
  session. Segments are rigidly skinned, so sharp bends rely on overlapping capsule caps,
  like the limbs do.
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
- **D-025 Online play is GGPO-style rollback over WebRTC data channels with copy/paste
  signalling.** `MatchSim.snapshot()/restore()` copy the whole deterministic state into one
  flat `Int32Array` (fighter fields discovered from the instance, input-history rings, RNG
  words, round state; `CharacterRuntime` has no per-match mutable state, events are dropped
  on restore). `src/net/RollbackSession` (deterministic, DOM-free, lint-guarded like the
  sim) runs 2 frames of input delay, predicts the remote by repeating its last input, keeps a
  ring of `maxRollback + 4` snapshots, re-simulates from the first mispredicted frame in the
  same tick, stalls when more than 8 frames would be predicted, skips a tick every ≥ 12 when
  it runs a whole frame ahead of the peer (frame-advantage exchange, RTT measured in loop
  ticks) and exchanges the hash of every 60th *confirmed* frame (repeated with each ping) to
  flag desyncs. Only frames shown for the first time are presented (`Session.presentStep`),
  so a rollback never replays audio/VFX; replays record confirmed inputs only. Transport:
  one RTCPeerConnection with an unordered `maxRetransmits: 0` channel for a 20-byte-header
  binary format (input batches re-send everything unacknowledged, so loss is repaired by the
  next packet) and a reliable channel for the JSON lobby (version, picks, host's start).
  Signalling is non-trickle (codes carry all ICE candidates) and needs no server; `?signal=`
  selects a registered `Signaller` for a future server. Host = P1, guest = P2, each picks
  its own fighter; the host picks the stage and rules. Online matches force hold-to-block
  off on both sides (a per-player assist would change the rules on one peer only), have no
  pause and no KO slow motion (loop ticks must map 1:1 to sim frames), and end only once the
  deciding frame is confirmed.
- **D-026 Screenshot baselines are per environment.** Pixel baselines depend on the exact
  Chromium build, fonts and software GPU. Sandboxes use the preinstalled Chromium, CI uses
  Playwright's bundled build on GitHub runners, so `playwright.config.ts` stores them under
  `e2e/__screenshots__/{local|ci}/`. CI runs with `updateSnapshots: 'missing'`: the first run
  writes its baselines and uploads them as the `ci-screenshot-baselines` artifact, which is
  committed so every later CI run compares against real CI pixels. The workflow takes the pnpm
  version from `packageManager` only (pinning it twice made pnpm/action-setup abort).
- **D-027 Faces are a separate morph-target mesh on the head bone, driven by a pure render-side
  controller.** Every head gets stylised, original features built in code (src/render/rig/FaceRig.ts):
  sclera, iris, upper lids, brows, mouth and teeth as low-poly ellipsoids conformed to the head
  and jaw ellipsoids of RigGeometry, each half-embedded in the skull so features meet the skin at
  a real 3D intersection (no coplanar decals, no polygon offset, no z-fighting). Colours derive
  from the palette (brows = hair, iris = darkened hair, mouth = darkened skin, sclera/teeth =
  skin lifted toward ivory) and the lids reuse the head's own material, so hit flash, KO dim and
  guard tint apply to the whole face. Seven relative morph targets (position + normal deltas):
  blink, browAngry, browPain, mouthOpen (shout), mouthGrit (teeth), eyesClosed (KO) and smile.
  The lids are ellipsoid shells whose lower vertices are clamped to a lid line, so moving the
  line per target opens/closes/slants them linearly. *Why a separate mesh:* three r186 node
  materials do support morphs on SkinnedMesh, but morph data on the merged body would cover
  every body vertex (~7 targets × all vertices), compile morph code into every body material and
  need new material slots in the body; a ~2k-triangle face Mesh parented to the head Bone is
  cheaper and leaves RigGeometry untouched. *Driving:* src/render/rig/FaceController.ts is pure
  (no `three`, no allocation per frame; unit-tested in tests/unit/face.test.ts): FighterState →
  `FaceSignals` → targets → `faceWeights()` exponential easing on wall-clock dt (in 55 ms, out
  130 ms, eyes 220 ms). Grit + angry brows on an attack's active frames (lighter in
  startup/recovery), shout on throws, `launcher` moves and moves that launch on normal hit
  (counter-hit-only launchers grit), pain scaled by `lastReaction` in hit-stun and by the stun
  length in block-stun, eyes closed once `ko` is set (pain on the KO impact itself), a 0.5 s grit
  then a smile on Win. Blinks follow a fixed gap table (incl. a double blink) offset by a
  per-slot phase (`slot * 1730 + 610` ms) — no `Math.random`. A fresh hit-stop snaps the face to
  its target so the impact expression reads during the freeze; the rest of the hit-stop holds the
  face and the blink clock. Channels that deform the same geometry (lids, brows, mouth) are
  normalised to sum ≤ 1 so additive deltas never overshoot. `QualitySettings.faceExpressions` is
  false on potato (features still render, static); the sim is untouched.
- **D-028 Online polish: rematch on one connection, RTT-based input delay, host-authoritative
  desync recovery.** *Rematch:* the results screen offers REMATCH / CHANGE FIGHTER / LEAVE over
  the existing `NetPeer` (phases `lobby → match → post`). REMATCH needs both players; the host
  then sends a new `start` with the same fighters, stage, rules and input delay and a new seed.
  CHANGE FIGHTER from either side sends both back to the online character pick (the ordered
  control channel guarantees the `change` arrives before that player's next `pick`; a `change`
  that arrives while the other peer is still confirming its last frames waits for its results).
  Every start carries a match epoch (1..255) that is byte 1 of every realtime datagram, so
  packets still in flight from the previous match are dropped (without it the rematch test
  fails: stale acks/inputs corrupt the new session). A finished match's session keeps being
  pumped by `NetPeer.tick()` until the next match begins, so a peer that is still confirming
  never loses its acks. The match ends once the frame that *entered* MatchOver is confirmed
  (`RollbackSession.matchDecided`; the previous "every frame confirmed" test only held by
  chance under latency because the sim keeps stepping MatchOver frames). *Input delay:* in the
  lobby both peers ping every 6 ticks on the realtime channel (epoch 0); after ≥ 1 s and ≥ 5
  samples (or 3 s regardless) the host picks `clamp(ceil(rtt_ticks / 2) + 1, 1, 6)` from the
  median RTT and sends it in the start message (`inputDelay`, `delayAuto`); the guest always
  adopts it. With time sync both peers run the same frame at the same moment, so a remote
  input for F + d arrives rtt/2 frames after it was sampled: d ≥ ceil(rtt/2) + 1 means steady
  play needs no rollback; above 6 frames (100 ms) delay is felt more than rollbacks, so the
  rest is left to the 8-frame window. LAN stays at the old default of 2. `?delay=N` (host,
  clamped 0..8) fixes the value and skips the wait. *Desync recovery:* on a confirmed-checkpoint
  mismatch the host (authority) snapshots its last confirmed frame K (`confirmedFrame + 1`, always
  inside the snapshot ring) and sends it with all its inputs the guest may lack (from
  `min(K, remoteAck + 1)`) as JSON on the reliable channel, chunked at 1024 ints (< 16 KB per
  message). The guest restores K (or jumps forward when it is behind K), re-simulates to its
  present without re-presenting frames, and both move to a new hash generation (byte 2 of hash
  datagrams) with checkpoints before K no longer compared, so hashes computed before the
  transfer can never trigger a second resync; a guest that detects first asks the host with a
  `desync` message carrying its generation (ignored once handled). The host's state wins even
  when the host was the corrupted side: the goal is that both continue identically, not that
  the "right" state survives. The NetHud shows RESYNCED for ~2 s. Replays of a resynced match
  record the confirmed inputs but cannot reproduce the state jump. Protocol version 2.
  Spectators and a signalling server remain open.
