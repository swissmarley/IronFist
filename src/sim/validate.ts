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
  if (m.hits.length === 0 && !m.throw && !m.parry) e(`${id}: move has no hits and is not a throw or parry`);
  if (m.throw) {
    const t = m.throw;
    if (t.grabFrame < 1 || t.grabFrame >= m.total) e(`${id}: throw grabFrame must be inside the move`);
    if (t.duration <= 0 || t.breakWindow < 0 || t.breakWindow > t.duration) e(`${id}: bad throw timing`);
    if (t.damage <= 0 || t.range <= 0) e(`${id}: throw needs damage and range`);
    if (![1, 2, 12].includes(t.breakButton)) e(`${id}: throw breakButton must be 1, 2 or 12`);
    for (const c of t.chain ?? []) {
      if (!def.moves.some((x) => x.id === c.moveId && x.throw && x.conditions?.includes('throwing'))) e(`${id}: chain throw ${c.moveId} must be a throw with condition 'throwing'`);
    }
  }
  if (m.parry) {
    if (m.parry.frames[0] > m.parry.frames[1] || m.parry.frames[1] >= m.total) e(`${id}: bad parry frames`);
    if (m.parry.levels.length === 0) e(`${id}: parry needs levels`);
  }
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

/** Roster requirements for a shipped fighter (SPEC §8). */
export function validateRoster(def: CharacterDef): string[] {
  const errors = validateCharacter(def);
  const e = (msg: string): void => { errors.push(`${def.id}: ${msg}`); };
  const moves = def.moves;
  const rootMoves = moves.filter((m) => m.cmd === undefined || m.cmd === m.input || (m.conditions !== undefined && !m.conditions.includes('standing')));
  if (moves.length < 60) e(`needs at least 60 moves (has ${moves.length})`);
  if (moves.length > 110) e(`has more than 110 moves (${moves.length})`);
  if (rootMoves.length < 30) e(`needs at least 30 root (directly triggered) moves (has ${rootMoves.length})`);
  const throws = moves.filter((m) => m.throw && !m.conditions?.includes('throwing'));
  if (throws.length < 2) e(`needs at least 2 throws (has ${throws.length})`);
  const launchers = moves.filter((m) => m.hits.some((h) => ['launch', 'launchHigh', 'launchLow', 'spinLaunch'].includes(h.reaction)));
  if (launchers.length < 2) e(`needs at least 2 launchers on normal hit (has ${launchers.length})`);
  if (!moves.some((m) => m.armour)) e('needs a power crush (armour window)');
  if (!def.tenHit || !moves.some((m) => m.id === def.tenHit)) e('needs a tenHit string root');
  else {
    // follow the follow-up chain from the ten-hit root
    let count = 1;
    let cur = moves.find((m) => m.id === def.tenHit);
    const seen = new Set<string>();
    while (cur && cur.followups && cur.followups.length > 0 && count < 20) {
      const next = cur.followups[0];
      if (!next || seen.has(next.moveId)) break;
      seen.add(next.moveId);
      cur = moves.find((m) => m.id === next.moveId);
      count++;
    }
    if (count < 10) e(`ten-hit string only chains ${count} moves`);
  }
  if (!def.stances || def.stances.length < 1) e('needs at least one stance id');
  if (!moves.some((m) => m.followups && m.followups.length > 0)) e('needs string follow-ups');
  if (!moves.some((m) => m.properties?.includes('homing'))) e('needs a homing move');
  if (!moves.some((m) => m.hits.some((h) => h.level === 'low'))) e('needs low attacks');
  if (!moves.some((m) => m.conditions?.includes('ws'))) e('needs while-standing moves');
  if (!moves.some((m) => m.conditions?.includes('crouch'))) e('needs full-crouch moves');
  if (!moves.some((m) => m.conditions?.includes('lying'))) e('needs floor attacks');
  if (!def.look) e('needs a look');
  return errors;
}
