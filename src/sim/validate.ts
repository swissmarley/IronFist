import type { CharacterDef, MoveDef } from './types';
import { parseNotation } from './notation';

const LEVELS = new Set(['high', 'mid', 'low', 'smid', 'unblockable', 'throw']);

/**
 * Validate a character definition. Returns a list of human-readable problems;
 * empty means valid. Used by the frame-data test and by the tooling page.
 */
export function validateCharacter(def: CharacterDef): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const e = (msg: string): void => { errors.push(`${def.id}: ${msg}`); };
  if (!def.id || !def.name) e('missing id/name');
  const s = def.stats;
  if (!(s.hp > 0) || !(s.walkF > 0) || !(s.walkB > 0) || !(s.gravity > 0) || !(s.pushRadius > 0)) e('invalid stats');
  for (const key of ['stand', 'crouch', 'air', 'lying'] as const) {
    if (!def.hurtboxes[key] || def.hurtboxes[key].length === 0) e(`missing hurtboxes.${key}`);
  }
  for (const m of def.moves) {
    if (ids.has(m.id)) e(`duplicate move id ${m.id}`);
    ids.add(m.id);
    validateMove(def, m, e);
  }
  for (const m of def.moves) {
    for (const fu of m.followups ?? []) {
      if (!ids.has(fu.moveId)) e(`${m.id}: follow-up ${fu.moveId} does not exist`);
      if (fu.cancelFrame > fu.windowEnd) e(`${m.id}: follow-up ${fu.moveId} cancelFrame > windowEnd`);
      if (fu.cancelFrame > m.total) e(`${m.id}: follow-up ${fu.moveId} cancelFrame beyond total`);
      const lastActive = m.hits.reduce((acc, h) => Math.max(acc, h.frames[1]), 0);
      if (fu.cancelFrame <= lastActive) e(`${m.id}: follow-up ${fu.moveId} cancelFrame ${fu.cancelFrame} must be after the active window (${lastActive})`);
    }
    if (m.justFrame !== undefined && m.cmd === undefined && !ids.has(m.id + '_jf')) e(`${m.id}: justFrame move needs a ${m.id}_jf variant`);
  }
  return errors;
}

function validateMove(def: CharacterDef, m: MoveDef, e: (msg: string) => void): void {
  const id = m.id;
  if (!Number.isInteger(m.total) || m.total <= 0) e(`${id}: total must be a positive integer`);
  try { parseNotation(m.cmd ?? m.input); } catch (err) { e(`${id}: bad notation (${String(err)})`); }
  if (m.hits.length === 0 && !m.throw) e(`${id}: move has no hits and is not a throw`);
  for (const h of m.hits) {
    if (!LEVELS.has(h.level)) e(`${id}: bad level ${h.level}`);
    const [s, en] = h.frames;
    if (s < 1 || en < s) e(`${id}: bad active window ${s}-${en}`);
    if (en >= m.total) e(`${id}: active frames extend past total (${en} >= ${m.total})`);
    const recovery = m.total - en;
    if (h.onBlock < -recovery) e(`${id}: onBlock ${h.onBlock} exceeds recovery ${recovery}`);
    if (h.onHit < -recovery) e(`${id}: onHit ${h.onHit} exceeds recovery ${recovery}`);
    if (h.damage <= 0 && h.level !== 'throw') e(`${id}: damage must be positive`);
    if (h.capsules.length === 0) e(`${id}: hit has no capsules`);
    for (const c of h.capsules) if (c.r <= 0) e(`${id}: capsule radius must be positive`);
    for (const k of ['damage', 'onBlock', 'onHit', 'pushback', 'pushbackBlock'] as const) {
      if (!Number.isInteger(h[k])) e(`${id}: ${k} must be an integer`);
    }
  }
  for (const rm of m.motion ?? []) if (rm.frames[0] > rm.frames[1]) e(`${id}: bad motion frames`);
  for (const c of m.crush ?? []) if (c.frames[0] > c.frames[1]) e(`${id}: bad crush frames`);
  if (m.armour && m.armour[0] > m.armour[1]) e(`${id}: bad armour frames`);
  if (m.conditions?.includes('stance') && !(def.stances ?? []).includes(m.stance ?? '')) e(`${id}: unknown stance ${m.stance}`);
}
