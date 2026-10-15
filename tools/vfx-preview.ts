import * as THREE from 'three/webgpu';
import { createRenderer, type Backend } from '@/render/backend';
import { GreyBoxScene } from '@/render/GreyBoxScene';
import { VfxManager } from '@/render/vfx/VfxManager';
import { EvType, type SimEvent } from '@/sim/events';

/**
 * Standalone VFX preview served by the Vite dev server at
 * /tools/vfx-preview.html (?gl=webgl forces the WebGL2 backend). Exposes
 * `window.__vfx` so the Playwright spec can drive it deterministically.
 */
export interface VfxPreviewGlobal {
  ready: boolean;
  errors: string[];
  backend: Backend | null;
  frames: number;
  paused: boolean;
  pause(): void;
  resume(): void;
  reseed(seed: number): void;
  spawnAll(): void;
  spawn(kind: PresetKind): void;
  step(dtMs: number, n: number): void;
  render(): void;
  live(): { particles: number; flashes: number; rings: number; capacity: number };
  setQuality(n: number): void;
  setReducedFlash(b: boolean): void;
}

declare global { interface Window { __vfx?: VfxPreviewGlobal } }

export type PresetKind = 'hit' | 'heavy' | 'counter' | 'block' | 'parry' | 'wall' | 'launch' | 'land' | 'dash' | 'step' | 'throw' | 'ko' | 'ringout';
const PRESETS: readonly PresetKind[] = ['hit', 'heavy', 'counter', 'block', 'parry', 'wall', 'launch', 'land', 'dash', 'step', 'throw', 'ko', 'ringout'];
const KEY_PRESETS: Record<string, PresetKind> = { '1': 'hit', '2': 'heavy', '3': 'counter', '4': 'block', '5': 'wall', '6': 'launch', '7': 'land', '8': 'dash', '9': 'ko' };
const QUALITIES = [500, 2000, 5000, 10000, 20000];

/** Spread every preset across the visible arena (metres). */
const LAYOUT: Record<PresetKind, { type: EvType; x: number; y: number; z: number; strength: number; dirX: number; dirZ: number }> = {
  hit: { type: EvType.Hit, x: -1.7, y: 1.1, z: 0.2, strength: 1, dirX: 1, dirZ: 0 },
  heavy: { type: EvType.Hit, x: -0.9, y: 1.0, z: -0.4, strength: 3, dirX: 1, dirZ: 0.3 },
  counter: { type: EvType.Counter, x: -0.2, y: 1.25, z: 0.3, strength: 2, dirX: -1, dirZ: 0 },
  block: { type: EvType.Block, x: 0.6, y: 1.1, z: 0.1, strength: 1, dirX: -1, dirZ: 0 },
  parry: { type: EvType.Parry, x: 1.1, y: 1.3, z: -0.6, strength: 1, dirX: 1, dirZ: 0 },
  wall: { type: EvType.Wall, x: 1.9, y: 1.0, z: 0.0, strength: 2, dirX: 1, dirZ: 0 },
  launch: { type: EvType.Launch, x: -1.3, y: 0.0, z: -1.4, strength: 2, dirX: 1, dirZ: 0 },
  land: { type: EvType.Land, x: 1.4, y: 0.0, z: 1.0, strength: 2, dirX: 1, dirZ: 0 },
  dash: { type: EvType.Dash, x: 0.1, y: 0.0, z: 1.3, strength: 1, dirX: 1, dirZ: 0 },
  step: { type: EvType.Step, x: -0.7, y: 0.0, z: 1.6, strength: 1, dirX: 0, dirZ: 1 },
  throw: { type: EvType.Throw, x: 0.5, y: 1.2, z: -1.2, strength: 2, dirX: 1, dirZ: 0 },
  ko: { type: EvType.KO, x: 0.0, y: 0.9, z: -2.4, strength: 0, dirX: 1, dirZ: 0 },
  ringout: { type: EvType.RingOut, x: 2.2, y: 0.0, z: -1.8, strength: 0, dirX: 1, dirZ: 0 },
};

const EV: SimEvent = { type: EvType.Hit, a: 0, b: 1, x: 0, y: 0, z: 0, strength: 0, move: -1, damage: 0 };

async function boot(): Promise<void> {
  const canvas = document.getElementById('vfx-canvas') as HTMLCanvasElement;
  const hud = document.getElementById('vfx-hud') as HTMLElement;
  const params = new URLSearchParams(location.search);
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

  const scene = new GreyBoxScene(innerWidth / Math.max(1, innerHeight));
  const quality = Number(params.get('particles') ?? 5000);
  const vfx = new VfxManager(scene.scene, { maxParticles: quality, reducedFlash: params.get('reduced') === '1' });
  const camPos = new THREE.Vector3();
  let renderer: THREE.WebGPURenderer | null = null;
  let qualityIdx = Math.max(0, QUALITIES.indexOf(quality));
  let last = performance.now();
  let autoTimer = 0;
  let autoIdx = 0;

  const g: VfxPreviewGlobal = {
    ready: false, errors, backend: null, frames: 0, paused: false,
    pause() { g.paused = true; },
    resume() { g.paused = false; last = performance.now(); },
    reseed(seed) { vfx.reseed(seed); },
    spawn(kind) {
      const l = LAYOUT[kind];
      EV.type = l.type; EV.strength = l.strength;
      EV.x = Math.round(l.x * 1000); EV.y = Math.round(l.y * 1000); EV.z = Math.round(l.z * 1000);
      vfx.onSimEvent(EV, l.dirX, l.dirZ);
    },
    spawnAll() { for (const k of PRESETS) g.spawn(k); },
    step(dtMs, n) { for (let i = 0; i < n; i++) vfx.update(dtMs, camPos.copy(scene.camera.position)); },
    render() { if (renderer) { renderer.render(scene.scene, scene.camera); g.frames++; } },
    live() { return { particles: vfx.particles.liveCount, flashes: vfx.flashes.live, rings: vfx.rings.live, capacity: vfx.particles.capacity }; },
    setQuality(n) { vfx.setQuality(n); },
    setReducedFlash(b) { vfx.setReducedFlash(b); },
  };
  window.__vfx = g;

  const resize = (): void => {
    const w = innerWidth, h = innerHeight;
    renderer?.setSize(w, h, false);
    scene.resize(w / Math.max(1, h));
  };

  const frame = (): void => {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(50, now - last);
    last = now;
    if (!g.paused) {
      autoTimer += dt;
      if (autoTimer > 700) { autoTimer = 0; g.spawn(PRESETS[autoIdx++ % PRESETS.length] as PresetKind); }
      g.step(dt, 1);
      g.render();
    }
    const l = g.live();
    hud.textContent = `backend ${g.backend}  budget ${vfx.budget}  particles ${l.particles}/${l.capacity}  flashes ${l.flashes}  rings ${l.rings}  reduced ${vfx.reducedFlash}${g.paused ? '  PAUSED' : ''}`;
  };

  window.addEventListener('keydown', (e) => {
    const k = KEY_PRESETS[e.key];
    if (k) g.spawn(k);
    else if (e.key === '0') g.spawnAll();
    else if (e.key === ' ') { if (g.paused) g.resume(); else g.pause(); }
    else if (e.key === 'r' || e.key === 'R') vfx.setReducedFlash(!vfx.reducedFlash);
    else if (e.key === 'q' || e.key === 'Q') { qualityIdx = (qualityIdx + 1) % QUALITIES.length; vfx.setQuality(QUALITIES[qualityIdx] as number); }
  });

  try {
    const init = await createRenderer(canvas, params.get('gl') === 'webgl');
    renderer = init.renderer;
    renderer.shadowMap.enabled = true;
    g.backend = init.backend;
    window.addEventListener('resize', resize);
    resize();
    g.render();
    requestAnimationFrame(frame);
    g.ready = true;
  } catch (err) {
    hud.textContent = 'FAILED TO START: ' + String(err);
    errors.push(String(err));
    console.error(err);
  }
}

void boot();
