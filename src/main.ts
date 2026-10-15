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
    game.driver = app;
    window.__ironfist = { game, app, ready: false, errors };
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
    } else {
      await game.loadStage(params.get('stage') ?? 'dojo');
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
