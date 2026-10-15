# Roster brief (v1)

All fighters, names, styles and moves are original. Each fighter needs 60–100 moves
(see `validateRoster` in src/sim/validate.ts): ≥30 root moves, string follow-ups,
≥2 throws (+ their breaks), ≥2 launchers on normal hit, 1 power crush, a homing move,
lows, WS/FC moves, floor attacks, ≥1 stance id, a 10-hit string (`tenHit`), and a `look`.
Frame data must satisfy the validator (advantage cannot exceed recovery; follow-ups
start after the previous active window). Use realistic genre numbers: jabs i10,
generic mids i12–16, launchers i14–16 and −12 or worse on block, lows i12–20 and
unsafe, throws i12 with 10–14 frame break windows, damage 5–30 per hit, HP 170.

| id | Name | Archetype | Signature gimmick | Stances | Strong side | Look |
|----|------|-----------|-------------------|---------|-------------|------|
| kaede | Kaede Mori | Rushdown karate (shoto-style) | Electric wind-step launcher (just-frame crouch-dash punch), wavedash pressure | `default` | left | white gi, red gloves, bun |
| boris | Boris "The Bear" Volkov | Heavy brawler / wrestler | Chain throws (3-link chains with per-link breaks), armour on big swings, slow but huge damage | `default`, `bear` (crouched grappling stance, `endStance`) | right | huge bulk, singlet, bald/short, heavy=true, heightScale 1.08 |
| luiz | Luiz Barreto | Capoeira / evasive | `handstand` and `negativa` stances with evasive low-crush/high-crush windows, spinning kicks, floor game | `default`, `handstand`, `negativa` | left | bare torso (skin top), white pants, long hair, heightScale 1.0 |
| meiling | Mei-Ling Chen | Speedy kicker | `flamingo` stance from kicks, fastest pokes (i10 kicks), long kick strings, backflips (lowCrush) | `default`, `flamingo` | right | qipao-style top, black pants, bun |
| jaehyun | Jae-Hyun Park | Taekwondo | Right/left flamingo (`rff`, `lff`), kick-only strings with stance transitions, axe kicks, spinning kicks | `default`, `rff`, `lff` | left | dobok (white top, white pants, black belt), spiky |
| golem | Golem | Giant boss | Unblockables (slow, telegraphed), huge reach, armour on many moves, cannot be launched high (weight 150), ground-pound stomps hit grounded | `default` | right | stone-grey skin, no hair, heightScale 1.25, bulk 1.3, heavy=true |
| ricardo | Ricardo Vale | Stance-switch fighter | Three stances (`iron`, `silk`, `storm`) with distinct trees; stance-cancel moves; mix of punches/kicks per stance | `default`, `iron`, `silk`, `storm` | left | dark vest (top), grey pants, short |
| seraphine | Seraphine | Mystical fast-poke | Teleport sidestep (SS move that crosses to the other side with invulnerable frames), long-range pokes (reach +10%), float juggles, parry | `default` | right | violet top, dark pants, long hair, heightScale 0.97 |

Move naming: give every move an evocative original English name (no Namco names).
Notation per docs/SPEC.md §1. Use `anim` specs (type/limb/height) on every move so
the animation templates and hitbox baker produce sensible reach.
