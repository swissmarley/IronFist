import { test, expect, type Page } from '@playwright/test';
import { bootGame, hold, IN } from './helpers';

interface NetProbe {
  state: string;
  hp: number[];
  maxHp: number[];
  frame: number;
  phase: number;
  confirmed: number;
  last: { frame: number; hash: number } | null;
  desync: boolean;
}

type Win = {
  __ironfist: {
    game: { input: { enqueueScript(p: number, f: number[]): void } };
    app: {
      currentState: string;
      frame(): number;
      online: { peer: { transport: { state: string }; matches: number; lastSetup: { seed: number; match: number; inputDelay: number; delayAuto: boolean } | null } | null };
      currentRunner: {
        session: { sim: { fighters: { hp: number; maxHp: number }[]; frame: number; round: { phase: number } } };
        rb?: { confirmedFrame: number; lastCheckpoint: { frame: number; hash: number } | null; checkpointHash(f: number): number | undefined; desync: unknown };
      } | null;
    };
  };
};

function probe(page: Page): Promise<NetProbe | null> {
  return page.evaluate(() => {
    const g = (window as unknown as Win).__ironfist;
    const r = g.app.currentRunner;
    if (!r?.rb) return null;
    const s = r.session.sim;
    return {
      state: g.app.currentState, hp: s.fighters.map((f) => f.hp), maxHp: s.fighters.map((f) => f.maxHp), frame: s.frame, phase: s.round.phase,
      confirmed: r.rb.confirmedFrame, last: r.rb.lastCheckpoint, desync: r.rb.desync !== null,
    };
  });
}

function checkpointHash(page: Page, frame: number): Promise<number | null> {
  return page.evaluate((f) => (window as unknown as Win).__ironfist.app.currentRunner?.rb?.checkpointHash(f) ?? null, frame);
}

function appState(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as Win).__ironfist.app.currentState);
}

/** Press a key long enough for the loop to sample it (menus advance on loop ticks, not sim frames). */
async function press(page: Page, code: string): Promise<void> {
  const tick = (): Promise<number> => page.evaluate(() => (window as unknown as Win).__ironfist.app.frame());
  await page.keyboard.down(code);
  const t0 = await tick();
  await page.waitForFunction((t) => (window as unknown as Win).__ironfist.app.frame() >= t + 3, t0);
  await page.keyboard.up(code);
  await page.waitForFunction((t) => (window as unknown as Win).__ironfist.app.frame() >= t + 6, t0);
}

/** Wait until both peers confirmed a checkpoint at or after `after`; returns that frame (or -1). */
async function commonCheckpoint(host: Page, guest: Page, after: number, ms: number): Promise<number> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const [pa, pb] = [await probe(host), await probe(guest)];
    const f = Math.min(pa?.last?.frame ?? -1, pb?.last?.frame ?? -1);
    if (f >= after) return f;
    await host.waitForTimeout(500);
  }
  return -1;
}

function transportState(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as Win).__ironfist.app.online.peer?.transport.state ?? 'none');
}

// Two tabs in one browser connect over a real RTCPeerConnection with copy/paste signalling.
test('online: manual signalling, rollback match, a jab on the host KOs P2 on the guest, rematch on the same connection', async ({ browser }) => {
  test.setTimeout(300_000);
  const t0 = Date.now();
  const lap = (label: string): void => console.info(`[online e2e] ${label} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  // one round, 1 HP: the first clean hit ends the match (host rules travel in the start message)
  const q = 'stage=greybox&quality=potato&p1=greybox&p2=greybox&ice=none&rounds=1&hp=1';
  const errorsA = await bootGame(host, `/?online=host&${q}`);
  const errorsB = await bootGame(guest, `/?online=join&${q}`);
  test.skip(!(await host.evaluate(() => typeof RTCPeerConnection === 'function')), 'RTCPeerConnection unavailable in this browser build');

  // host code -> guest; guest reply -> host
  await expect(host.locator('.online-local')).toHaveValue(/^IRONFIST1:/, { timeout: 30_000 });
  await guest.locator('.online-remote').fill(await host.locator('.online-local').inputValue());
  await guest.locator('.online-submit').click();
  await expect(guest.locator('.online-local')).toHaveValue(/^IRONFIST1:/, { timeout: 30_000 });
  await host.locator('.online-remote').fill(await guest.locator('.online-local').inputValue());
  await host.locator('.online-submit').click();

  // connected -> pinned picks -> host starts -> both in a match driven by NetMatchRunner
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && (await transportState(host)) !== 'connected') await host.waitForTimeout(250);
  const linked = (await transportState(host)) === 'connected';
  test.skip(!linked, `headless WebRTC could not connect in this sandbox (host transport: ${await transportState(host)}); the same path is covered by tests/unit/netpeer.test.ts over the loopback transport`);
  for (const p of [host, guest]) {
    await p.waitForFunction(() => (window as unknown as Win).__ironfist.app.currentRunner?.rb !== undefined && (window as unknown as Win).__ironfist.app.currentState === 'match', null, { timeout: 60_000 });
  }
  lap('connected, match 1 running');
  // the host measured the lobby RTT for ~1 s and both peers run its automatic input delay
  const s1 = await Promise.all([host, guest].map((p) => p.evaluate(() => (window as unknown as Win).__ironfist.app.online.peer?.lastSetup ?? null)));
  expect(s1[0]?.delayAuto).toBe(true);
  expect(s1[1]).toEqual(s1[0]);
  const delay = s1[0]?.inputDelay ?? -1;
  expect(delay).toBeGreaterThanOrEqual(1);
  expect(delay).toBeLessThanOrEqual(6);
  for (const p of [host, guest]) await expect(p.locator('.net-hud')).toContainText(`DELAY ${delay} AUTO`);
  console.info(`[online e2e] auto input delay ${delay}`);

  // wait for FIGHT on the host, then walk in and jab (scripted exact frames on page A only)
  await host.waitForFunction(() => ((window as unknown as Win).__ironfist.app.currentRunner?.session.sim.round.phase ?? 0) === 1 && ((window as unknown as Win).__ironfist.app.currentRunner?.session.sim.frame ?? 0) > 110, null, { timeout: 90_000 });
  await host.evaluate((f) => (window as unknown as Win).__ironfist.game.input.enqueueScript(0, f), [...hold(IN.RIGHT, 30), IN.B1, IN.B1, ...hold(0, 10)]);

  // the hit is simulated on the guest from the host's (remote) inputs
  await guest.waitForFunction(() => { const s = (window as unknown as Win).__ironfist.app.currentRunner?.session.sim; return !!s && (s.fighters[1]?.hp ?? 0) < (s.fighters[1]?.maxHp ?? 0); }, null, { timeout: 90_000 });
  const b = await probe(guest);
  expect(b).not.toBeNull();
  expect(b?.hp[1]).toBeLessThan(b?.maxHp[1] ?? 0);

  lap('match 1: hit landed on the guest');
  // both peers agree on the hash of a confirmed checkpoint after the hit
  const after = (b?.frame ?? 0) + 60;
  const common = await commonCheckpoint(host, guest, after, 90_000);
  expect(common).toBeGreaterThanOrEqual(after);
  const [ha, hb] = [await checkpointHash(host, common), await checkpointHash(guest, common)];
  expect(ha).not.toBeNull();
  expect(ha).toBe(hb);
  const [fa, fb] = [await probe(host), await probe(guest)];
  expect(fa?.desync).toBe(false);
  expect(fb?.desync).toBe(false);
  expect(fa?.hp[1]).toBe(fb?.hp[1]);
  await expect(host.locator('.net-hud')).toContainText('ONLINE');
  for (const [name, p] of [['host', host], ['guest', guest]] as const) {
    const st = await p.evaluate(() => (window as unknown as { __ironfist: { app: { currentRunner: { rb: { stats: Record<string, number> } } } } }).__ironfist.app.currentRunner.rb.stats);
    console.info(`[online e2e] ${name}: frame-ticks ${st.ticks}, rollbacks ${st.rollbacks} (${st.rolledBackFrames} frames, max ${st.maxRollbackDepth}), stalls ${st.windowStalls}+${st.syncStalls}, rtt ${st.rttTicks} ticks, checkpoints ${st.checkpointsCompared}`);
  }

  // the 1-HP KO decides the match: both reach the results screen (REMATCH / CHANGE FIGHTER / LEAVE)
  for (const p of [host, guest]) await p.waitForFunction(() => (window as unknown as Win).__ironfist.app.currentState === 'results', null, { timeout: 90_000 });
  lap('match 1 over, both on results');
  await expect(host.locator('.results-screen .menu-row')).toHaveText(['REMATCH', 'CHANGE FIGHTER', 'LEAVE']);
  const seed1 = await host.evaluate(() => (window as unknown as Win).__ironfist.app.online.peer?.lastSetup?.seed ?? 0);
  // guest asks first: it waits; the host agrees and starts match 2 over the same connection
  await press(guest, 'KeyU');
  await expect(guest.locator('.results-note')).toContainText('WAITING');
  await expect(host.locator('.results-note')).toContainText('OPPONENT WANTS A REMATCH');
  expect(await appState(guest)).toBe('results');
  await press(host, 'KeyU');
  for (const p of [host, guest]) {
    await p.waitForFunction(() => { const a = (window as unknown as Win).__ironfist.app; return a.currentState === 'match' && a.online.peer?.matches === 2 && (a.currentRunner?.session.sim.frame ?? 9999) < 600; }, null, { timeout: 60_000 });
  }
  lap('match 2 running');
  const setups = await Promise.all([host, guest].map((p) => p.evaluate(() => (window as unknown as Win).__ironfist.app.online.peer?.lastSetup ?? null)));
  expect(setups[0]?.match).toBe(2);
  expect(setups[1]).toEqual(setups[0]);
  expect(setups[0]?.seed).not.toBe(seed1);
  expect(await transportState(host)).toBe('connected');

  // desync recovery over the real channels: corrupt one guest fighter field before anyone
  // presses anything in match 2 (so no rollback can undo it); the next confirmed checkpoint
  // mismatches and the host's state transfer brings both back in sync
  // (the host's REMATCH key may still be held for match 2's first frames: wait until those are
  // confirmed, so no later rollback can restore a snapshot from before the corruption)
  type Rb = { stats: { resyncs: number }; syncFloor: number; confirmedFrame: number; frame: number };
  type Corrupt = { __ironfist: { app: { currentRunner: { session: { sim: { frame: number; fighters: { x: number }[] } }; rb: Rb } | null } } };
  await guest.waitForFunction(() => { const rb = (window as unknown as Corrupt).__ironfist.app.currentRunner?.rb; return !!rb && rb.confirmedFrame >= 30 && rb.confirmedFrame >= rb.frame - 2; }, null, { timeout: 30_000 });
  const corruptedAt = await guest.evaluate(() => { const r = (window as unknown as Corrupt).__ironfist.app.currentRunner; if (!r) return -1; r.session.sim.fighters[0]!.x += 37; return r.session.sim.frame; });
  expect(corruptedAt).toBeGreaterThan(0);
  for (const p of [host, guest]) await p.waitForFunction(() => ((window as unknown as Corrupt).__ironfist.app.currentRunner?.rb.stats.resyncs ?? 0) >= 1, null, { timeout: 60_000 });
  await expect(guest.locator('.net-hud-warn')).toContainText('RESYNCED');
  const floors = await Promise.all([host, guest].map((p) => p.evaluate(() => { const rb = (window as unknown as Corrupt).__ironfist.app.currentRunner?.rb; return rb ? [rb.stats.resyncs, rb.syncFloor] : null; })));
  expect(floors[0]).toEqual(floors[1]);
  expect(floors[0]?.[0]).toBe(1);
  lap(`match 2: guest corrupted at frame ${corruptedAt}, resynced at frame ${floors[0]?.[1]}`);

  // match 2: same scripted KO, then a common confirmed checkpoint with equal hashes
  await host.waitForFunction(() => ((window as unknown as Win).__ironfist.app.currentRunner?.session.sim.round.phase ?? 0) === 1 && ((window as unknown as Win).__ironfist.app.currentRunner?.session.sim.frame ?? 0) > 110, null, { timeout: 90_000 });
  await host.evaluate((f) => (window as unknown as Win).__ironfist.game.input.enqueueScript(0, f), [...hold(IN.RIGHT, 30), IN.B1, IN.B1, ...hold(0, 10)]);
  await guest.waitForFunction(() => { const s = (window as unknown as Win).__ironfist.app.currentRunner?.session.sim; return !!s && (s.fighters[1]?.hp ?? 0) < (s.fighters[1]?.maxHp ?? 0); }, null, { timeout: 90_000 });
  const b2 = await probe(guest);
  const common2 = await commonCheckpoint(host, guest, (b2?.frame ?? 0) + 60, 90_000);
  expect(common2).toBeGreaterThan(0);
  expect(await checkpointHash(host, common2)).toBe(await checkpointHash(guest, common2));
  for (const p of [host, guest]) await p.waitForFunction(() => (window as unknown as Win).__ironfist.app.currentState === 'results', null, { timeout: 90_000 });
  lap('match 2 over, both on results');
  const [e1, e2] = [await probe(host), await probe(guest)];
  expect(e1?.desync).toBe(false);
  expect(e2?.desync).toBe(false);
  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await ctx.close();
});
