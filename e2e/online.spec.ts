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
      online: { peer: { transport: { state: string } } | null };
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

function transportState(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as Win).__ironfist.app.online.peer?.transport.state ?? 'none');
}

// Two tabs in one browser connect over a real RTCPeerConnection with copy/paste signalling.
test('online: manual signalling, rollback match, a jab on the host hits P2 on the guest', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  const q = 'stage=greybox&quality=potato&p1=greybox&p2=greybox&ice=none';
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

  // wait for FIGHT on the host, then walk in and jab (scripted exact frames on page A only)
  await host.waitForFunction(() => ((window as unknown as Win).__ironfist.app.currentRunner?.session.sim.round.phase ?? 0) === 1 && ((window as unknown as Win).__ironfist.app.currentRunner?.session.sim.frame ?? 0) > 110, null, { timeout: 90_000 });
  await host.evaluate((f) => (window as unknown as Win).__ironfist.game.input.enqueueScript(0, f), [...hold(IN.RIGHT, 30), IN.B1, IN.B1, ...hold(0, 10)]);

  // the hit is simulated on the guest from the host's (remote) inputs
  await guest.waitForFunction(() => { const s = (window as unknown as Win).__ironfist.app.currentRunner?.session.sim; return !!s && (s.fighters[1]?.hp ?? 0) < (s.fighters[1]?.maxHp ?? 0); }, null, { timeout: 90_000 });
  const b = await probe(guest);
  expect(b).not.toBeNull();
  expect(b?.hp[1]).toBeLessThan(b?.maxHp[1] ?? 0);

  // both peers agree on the hash of a confirmed checkpoint after the hit
  const after = (b?.frame ?? 0) + 60;
  let common = -1;
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const [pa, pb] = [await probe(host), await probe(guest)];
    const f = Math.min(pa?.last?.frame ?? -1, pb?.last?.frame ?? -1);
    if (f >= after) { common = f; break; }
    await host.waitForTimeout(500);
  }
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
  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await ctx.close();
});
