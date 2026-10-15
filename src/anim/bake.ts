import { Quaternion } from 'three';
import type { AnimSpec, CapsuleDef, CharacterDef, HitDef, MoveDef } from '@/sim/types';
import { BONE_INDEX, HUMANOID, Skeleton, type BoneName } from './skeleton';
import { evaluateClip, Pose, poseFromEuler, type Clip } from './pose';
import { buildMoveClip, defaultAnim } from './templates';
import { CROUCH, LYING_UP, STANCE } from './poses';

/**
 * Bakes sim capsules (integer mm, fighter-local: x right, y up, z forward)
 * from the animation pose. Skeleton space has +X = fighter left, so x is negated.
 */
const MM = 1000;

const skel = new Skeleton(HUMANOID);
const pose = new Pose();


function solve(p: Pose): void {
  skel.solve(p.rots as Quaternion[], p.root, 0);
}

function capsuleFromBone(name: BoneName, r: number, extendTip = 0, extendBase = 0): CapsuleDef {
  const x = skel.xforms[BONE_INDEX[name]];
  if (!x) throw new Error('bone ' + name);
  const dir = x.tip.clone().sub(x.pos).normalize();
  const a = x.pos.clone().addScaledVector(dir, -extendBase);
  const b = x.tip.clone().addScaledVector(dir, extendTip);
  return {
    ax: Math.round(-a.x * MM), ay: Math.max(0, Math.round(a.y * MM)), az: Math.round(a.z * MM),
    bx: Math.round(-b.x * MM), by: Math.max(0, Math.round(b.y * MM)), bz: Math.round(b.z * MM),
    r: Math.round(r * MM),
  };
}

function limbCapsule(type: AnimSpec['type'], side: 'L' | 'R'): CapsuleDef {
  switch (type) {
    case 'elbow': return capsuleFromBone(`forearm${side}`, 0.13, 0.02, 0.08);
    case 'knee': return capsuleFromBone(`lowerLeg${side}`, 0.12, -0.2, 0.06);
    case 'front': case 'round': case 'low': case 'sweep': case 'hop': case 'spinBack': case 'axe': case 'side': case 'rising': case 'ground':
      return capsuleFromBone(`lowerLeg${side}`, 0.14, 0.14, -0.1);
    default:
      return capsuleFromBone(`hand${side}`, 0.12, 0.03, 0.14);
  }
}

/**
 * Hurt capsules for a full-body pose: head, torso and legs. Arms are left out
 * on purpose: in the reference genre the guard arms are not hittable in
 * neutral, which is what keeps sidesteps and ducks honest.
 */
export function hurtCapsulesForPose(p: Pose): CapsuleDef[] {
  solve(p);
  return [
    capsuleFromBone('head', 0.13, 0.02, 0.02),
    capsuleFromBone('chest', 0.21, 0.02, 0.02),
    capsuleFromBone('spine', 0.19, 0, 0),
    capsuleFromBone('hips', 0.2, 0, 0.04),
    capsuleFromBone('upperLegL', 0.12), capsuleFromBone('lowerLegL', 0.1, 0.05),
    capsuleFromBone('upperLegR', 0.12), capsuleFromBone('lowerLegR', 0.1, 0.05),
  ];
}

import type { BakedCharacter, BakedHit } from '@/sim/baked';

/** Bake every hit of every move from the generated clips. */
export function bakeCharacter(def: CharacterDef, clipFor: (m: MoveDef) => Clip = buildMoveClip): BakedCharacter {
  const hits: BakedHit[] = [];
  for (const m of def.moves) {
    if (m.hits.length === 0) continue;
    const spec = m.anim ?? defaultAnim(m);
    const clip = clipFor(m);
    m.hits.forEach((h: HitDef, hitIdx) => {
      const track: { frame: number; capsules: CapsuleDef[] }[] = [];
      for (let f = h.frames[0]; f <= h.frames[1]; f++) {
        evaluateClip(clip, f, pose);
        solve(pose);
        const limb = spec.limb ?? 'R';
        const caps: CapsuleDef[] = [limbCapsule(spec.type, limb)];
        if (spec.type === 'doublePunch' || spec.type === 'powerCrush') caps.push(limbCapsule(spec.type, limb === 'L' ? 'R' : 'L'));
        track.push({ frame: f, capsules: caps });
      }
      hits.push({ moveId: m.id, hitIdx, track });
    });
  }
  return {
    hurtboxes: {
      stand: hurtCapsulesForPose(poseFromEuler(STANCE)),
      crouch: hurtCapsulesForPose(poseFromEuler(CROUCH)),
      // juggled bodies use one generous capsule so follow-ups stay reliable
      air: [{ ax: 0, ay: 150, az: -150, bx: 0, by: 1250, bz: 150, r: 330 }],
      lying: hurtCapsulesForPose(poseFromEuler(LYING_UP)),
    },
    hits,
  };
}

