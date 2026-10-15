import './styles.css';
import { Game } from '@/app/Game';

declare global {
  interface Window {
    __ironfist?: { game: Game; ready: boolean; errors: string[] };
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

  const game = new Game({ canvas, uiRoot, debugRoot, forceWebGL: params.get('gl') === 'webgl', mode: params.get('mode') ?? 'training', ...(params.get('quality') ? { quality: params.get('quality') as string } : {}), ...(params.get('hp') ? { hp: parseInt(params.get('hp') as string, 10) } : {}), ...(params.get('ringout') ? { ringout: true } : {}) });
  window.__ironfist = { game, ready: false, errors };
  try {
    await game.init();
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
