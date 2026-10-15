# IRON FIST — Game Specification

IRON FIST is an original 3D fighting game for the browser. It targets the mechanics,
pacing and feel of mid-2000s 3D arena fighters (the Tekken 5 era) with original
characters, art, music and move data. No third-party IP is used.

## 1. Controls and notation

| Button | Default key | Gamepad | Meaning |
|--------|-------------|---------|---------|
| 1 (LP) | U | X / Square | Left punch |
| 2 (RP) | I | Y / Triangle | Right punch |
| 3 (LK) | J | A / Cross | Left kick |
| 4 (RK) | K | B / Circle | Right kick |
| Direction | WASD | D-pad / left stick | 8-way + neutral |

Notation: `f b u d` (and `df db uf ub`) for directions, `N` neutral, `+` simultaneous,
`,` sequential, `~` tight cancel, `QCF/HCF/HCB`, `CD` crouch-dash (`f,N,d,df`),
`WS` while-standing, `FC` full crouch, `SS` sidestep, `WR` while-running,
`ws`/`BT` back-turned. Buttons are numeric; `1+2`, `3+4`, `1+3`, `2+4` are the
two-button macros (throws, power crush, special).

Input is sampled once per 60 Hz sim frame. Commands are parsed by a trie-based
interpreter over a ring buffer of input frames with a per-command buffer window
(default 10 frames for buttons after a motion, 8 for sequences). Just-frame inputs
use a 1–3 frame window declared per move.

All controls are remappable (keyboard and gamepad). Settings persist in IndexedDB.

## 2. Movement

- Walk forward/back (hold f/b). Dash forward `f,f`, backdash `b,b` (backdash has
  recovery frames where the fighter can be hit but not blocked-cancelled).
- Sidestep: tap `u` (into screen) / `d` (out of screen) then neutral. Holding becomes
  sidewalk. Each character has a strong and weak side; sidestep distance and evasion
  frames differ by side and by the opponent's move tracking.
- Crouch (hold d/db/df). Jump (hold u/uf/ub). Crouch-dash `f,N,d,df`, wavedash via
  repeated crouch-dash cancels.
- Fighters always auto-face the opponent at the start of any neutral/moving frame.
- Arena: flat floor with either walls (bounded) or open edges (ring-out).

## 3. Hit levels and defence

Levels: `high`, `mid`, `low`, `special-mid` (hits crouchers, blockable either way),
`unblockable`, `throw`. Overheads are mids with a jump-in property.

- Standing block: hold `b`. Blocks high and mid. Lows hit.
- Crouching block: hold `db`. Blocks low and special-mid. Mids hit. Highs whiff.
- Crouching makes highs whiff; jumping crushes lows (and some mids while airborne).
- Crush: `low-crush` moves are immune to lows during their crush window; `high-crush`
  moves are immune to highs. Power Crush moves absorb one high/mid hit during their
  armour window and take chip damage, but lose to lows and throws.
- Parry: defined per character as a command (e.g. `b+1+3`) with a window; parried
  attackers suffer a fixed stagger.
- Counter hit: an attack that lands while the opponent is in startup/active frames
  of their own attack. CH gives bonus damage and may change the reaction (stagger,
  crumple, launch).

## 4. Frame data (single source of truth)

Every move is defined in data:

```
id, name, input, level, damage, startup, active, recovery,
onBlock, onHit, onCounterHit, hitstun/blockstun (derived or explicit),
pushbackHit, pushbackBlock, properties[] (homing, tracksLeft, tracksRight,
lowCrush, highCrush, powerCrush, launcher, bound, screw, wallSplat, wallBounce,
knockdown, floorBreak, unblockable, throw, justFrame...)
hitboxes[] : per-frame capsules attached to bones
reaction: { hit, counter, air, crouching }
followups: string tree (next move ids) with cancel windows
```

A schema validates each character file; a test asserts frame-data consistency
(active frames inside total, on-block = blockstun − remaining recovery, etc.).

## 5. Offence systems

- Juggles: launchers put the opponent in an air state with integer gravity. Air
  hits apply hit-stun and lift; combos scale damage (100/80/70/60/50% …) with a
  per-hit floor. Bound/screw hits allow one ground-bounce per combo. Height rules
  limit infinites: lift decays per juggle hit.
- Walls: wall-splat on hitting a wall during an airborne/stagger state, wall-bounce
  for wall-bounce moves, wall combos with reduced pushback.
- Throws: `1+3`, `2+4`, `1+2` generic throws plus command throws; three-way break
  (`1`, `2`, or `1+2` matched to the throw type) in a 10–20 frame window
  depending on throw and difficulty. `f+` dash throws reach further.
- Oki: knocked-down opponents may tech-roll on landing (any button), stay down,
  roll sideways, roll back, kip-up, or attack from the floor (`3`/`4`). Ground
  hits do reduced damage; certain moves hit grounded.
- Ring-out: in open-edge stages, falling off the edge is a KO.

## 6. Match flow

- Best-of-N rounds (1–5 wins), round timer 30–99 s or infinite.
- KO, time-over (higher HP wins, draw possible), double KO, perfect, ring-out.
- Slow-motion KO camera on the final hit, intro poses, win poses, rematch flow.

## 7. Game feel

Hit-stop scaled by hit strength (light 4f, medium 7f, heavy 10f, launcher 12f,
wall-splat 14f), screen shake with a reduced-motion option, impact flashes and
sparks, dust and sweat particles, camera punch-in on heavies, spring-bone hair and
cloth. Inputs are sampled right before each sim step; the sim renders with
interpolation, adding < 1 frame of latency.

## 8. Roster (v1)

| Fighter | Archetype | Gimmick |
|---------|-----------|---------|
| Kaede Mori | Rushdown karate | Shoto-style stance; electric wind-step launcher |
| Boris "The Bear" Volkov | Heavy brawler/wrestler | Chain throws, armour |
| Luiz Barreto | Capoeira / evasive | Handstand & negativa stances |
| Mei-Ling Chen | Speedy kicker | Flamingo stance, fastest pokes |
| Jae-Hyun Park | Taekwondo | Right/left flamingo, kick strings |
| Golem | Giant boss | Slow, huge range, unblockables |
| Ricardo Vale | Stance-switch | Three stances with distinct trees |
| Seraphine | Mystical fast-poke | Teleport sidestep, long pokes |

Each fighter: 60–100 moves, ≥ 1 stance, string tree, 2 throws, 2 launchers,
1 power crush, 1 signature gimmick, a 10-hit string.

## 9. Modes

Arcade (8 stages, sub-boss, final boss, cutscenes, ending), Versus (local 2P),
Practice (frame data, input display, dummy settings, record/playback, move list),
Survival, Time Attack, Replay theatre, Settings. Online rollback is a stretch goal
after determinism is proven.

## 10. Stages (v1)

Dojo Rooftop (walls), Harbour Deck (ring-out), Neon Street (walls, rain),
Desert Ruins (open), Bamboo Forest (walls), Arena Colosseum (walls, crowd).

## 11. AI

Layered: frame-data awareness, spacing, mix-up generator, defensive model,
per-character playbook, difficulty by reaction/accuracy/read quality. No frame-one
input reading. Validated by headless batch matches.

## 12. Quality tiers

Ultra/High/Medium/Low/Potato chosen by a short benchmark with manual override.
Targets: 60 fps locked at Medium on mid-range laptops; 120 fps at Ultra on high-end.

## 13. Online

Two players over WebRTC with rollback netcode (D-025). ONLINE in the main menu: the host
sends a code, the guest pastes it and sends a reply back (no server). Host is P1, guest
P2; each picks their own fighter, the host picks the stage. 2 frames of input delay, up to
8 frames of rollback, then the game waits for the opponent. No pause or KO slow motion
online; a desync (hash mismatch on a confirmed frame) is shown in the net HUD.
