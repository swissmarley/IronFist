import './styles.css';
import { Game } from '@/app/Game';
import { App } from '@/app/App';

declare global {
  interface Window {
    __ironfist?: { game: Game; app: App; ready: boolean; errors: string[] };
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  const debugRoot = document.getElementById('debug-root') as HTMLElement;
  const status = document.getElementById('boot-status') as HTMLElement;
  const params = new URLSearchParams(location.search);
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

  const game = new Game({
    canvas, uiRoot, debugRoot,
    forceWebGL: params.get('gl') === 'webgl',
    ...(params.get('quality') ? { quality: params.get('quality') as string } : {}),
    ...(params.get('nopost') ? { noPost: true } : {}),
  });
  try {
    await game.init();
    const app = new App(game, uiRoot);
    game.loop.onError = (err, phase) => { errors.push(`${phase}: ${String(err)}`); console.error(phase, err); };
    game.driver = app;
    window.__ironfist = { game, app, ready: false, errors };
    // online host overrides (the host's start message carries them to the guest)
    const int = (k: string): number | null => { const v = parseInt(params.get(k) ?? '', 10); return Number.isFinite(v) ? v : null; };
    app.online.overrides = { rounds: int('rounds'), hp: int('hp'), delay: int('delay') };
    const mode = params.get('mode');
    if (mode === 'training' || mode === 'versus' || mode === 'practice') {
      const stage = params.get('stage') ?? 'dojo';
      const p1 = params.get('p1') ?? app.roster[0]?.id ?? 'greybox';
      const p2 = params.get('p2') ?? app.roster[1]?.id ?? p1;
      const cpu: [number | null, number | null] = [null, params.get('cpu') ? parseInt(params.get('cpu') as string, 10) : null];
      const hp = params.get('hp');
      await app.quickStart(mode, p1, p2, stage, {
        roundsToWin: 2, roundTimeSec: 60, seed: parseInt(params.get('seed') ?? '1', 10),
        ...(hp ? { hpOverride: parseInt(hp, 10) } : {}),
        ...(params.get('ringout') ? { arena: { id: 'open', name: 'Open Edge', halfX: 4000, halfZ: 4000, walls: false } } : {}),
      }, cpu);
    } else if (params.get('online') === 'host' || params.get('online') === 'join') {
      // online lobby; p1 (host) / p2 (guest) preset this side's pick, stage pins the host's stage
      const pinned = params.get('stage');
      if (pinned) app.pinnedStage = pinned;
      await game.loadStage(pinned ?? 'dojo');
      app.online.pinned = { p1: params.get('p1'), p2: params.get('p2') };
      app.online.signal = params.get('signal');
      if (params.get('ice') === 'none') app.online.rtc = { iceServers: [] };
      app.openOnline(params.get('online') === 'host' ? 'host' : 'guest');
    } else {
      if (params.get('signal')) app.online.signal = params.get('signal');
      const pinned = params.get('stage');
      if (pinned) app.pinnedStage = pinned;
      await game.loadStage(pinned ?? 'dojo');
      app.showTitle();
    }
    status.remove();
    game.start();
    window.__ironfist.ready = true;
    canvas.focus();
  } catch (err) {
    status.textContent = 'FAILED TO START: ' + String(err);
    errors.push(String(err));
    console.error(err);
  }
}

void boot();
