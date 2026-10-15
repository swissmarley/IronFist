/**
 * Animation authoring / review page: renders a contact sheet of a clip at the
 * requested frames with an offscreen WebGPU/WebGL renderer. Query params:
 *   ?clip=<name|move:<id>>&frames=0,4,8&view=side|front|3q&char=<character id>
 * `char` selects the fighter's own clip set (stance idle, intro, win), look
 * and height; the default is the greybox set with the karate palette.
 */
import * as THREE from 'three/webgpu';
import { buildClipSet } from '@/anim/clips';
import { evaluateClip, Pose, type Clip } from '@/anim/pose';
import { buildMoveClip } from '@/anim/templates';
import { resolveStance } from '@/anim/stances';
import { RigView, type RigOptions } from '@/render/rig/RigView';
import { PALETTES } from '@/render/rig/RigMaterials';
import { rigOptionsFor } from '@/render/rig/look';
import { CHARACTERS } from '@/data/characters';
import { GREYBOX } from '@/data/characters/greybox';
import { createRenderer } from '@/render/backend';

declare global { interface Window { __animTool?: { ready: boolean; rendered: number } } }

const params = new URLSearchParams(location.search);
const charDef = CHARACTERS[params.get('char') ?? ''];
const def = charDef ?? GREYBOX;
const clips = buildClipSet(def.anim);
const rest = resolveStance(def.anim?.stance).rest;
const moveClips = new Map<string, Clip>();
for (const m of def.moves) moveClips.set('move:' + m.id, buildMoveClip(m, rest));
const rigOpts: RigOptions = charDef ? rigOptionsFor(charDef, 0) : { palette: PALETTES.karate };
const scale = rigOpts.heightScale ?? 1;

const sel = document.getElementById('clip') as HTMLSelectElement;
for (const k of Object.keys(clips)) sel.add(new Option(k, k));
for (const k of moveClips.keys()) sel.add(new Option(k, k));
const framesEl = document.getElementById('frames') as HTMLInputElement;
const viewEl = document.getElementById('view') as HTMLSelectElement;
const status = document.getElementById('status') as HTMLSpanElement;
const sheet = document.getElementById('sheet') as HTMLDivElement;

if (params.get('clip')) sel.value = params.get('clip') as string;
if (params.get('frames')) framesEl.value = params.get('frames') as string;
if (params.get('view')) viewEl.value = params.get('view') as string;
const cols = parseInt(params.get('cols') ?? '6', 10);
sheet.style.setProperty('--cols', String(cols));

const W = 300, H = 360;
const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
const { renderer } = await createRenderer(canvas, params.get('gl') === 'webgl');
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171c);
scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x332211, 1.1));
const key = new THREE.DirectionalLight(0xfff0dd, 2.4);
key.position.set(2, 4, 3); key.castShadow = true; scene.add(key);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshStandardMaterial({ color: 0x2a2f36 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
scene.add(new THREE.GridHelper(4, 8, 0x3d4652, 0x242a32));
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
const rig = new RigView(rigOpts);
scene.add(rig.group);
const pose = new Pose();
window.__animTool = { ready: true, rendered: 0 };

function setView(v: string): void {
  const k = Math.max(1, scale) * (charDef ? 1.12 : 1);
  if (v === 'front') camera.position.set(0, 1.0 * k, 4.2 * k);
  else if (v === '3q') camera.position.set(2.6 * k, 1.3 * k, 3.2 * k);
  else camera.position.set(4.2 * k, 1.0 * k, 0.0);
  camera.lookAt(0, 0.9 * k, 0);
}

async function render(): Promise<void> {
  sheet.innerHTML = '';
  const clip = clips[sel.value as keyof typeof clips] ?? moveClips.get(sel.value);
  if (!clip) { status.textContent = 'no clip'; return; }
  const frames = framesEl.value.split(',').map((s) => parseFloat(s.trim())).filter((n) => !Number.isNaN(n));
  setView(viewEl.value);
  let n = 0;
  for (const f of frames) {
    evaluateClip(clip, f, pose);
    pose.root.multiplyScalar(scale); // same root scaling as FighterAnimator
    rig.applyPose(pose);
    // skinned bone matrices refresh once per animation frame
    await new Promise<number>((r) => requestAnimationFrame(r));
    await renderer.renderAsync(scene, camera);
    const cell = document.createElement('div');
    cell.className = 'cell';
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d')?.drawImage(canvas, 0, 0);
    const label = document.createElement('span');
    label.textContent = `${charDef ? def.id + ' ' : ''}${clip.name} f${f}`;
    cell.append(c, label);
    sheet.appendChild(cell);
    n++;
  }
  status.textContent = `${n} frames of ${clip.name} (${clip.length}f)`;
  window.__animTool = { ready: true, rendered: n };
}

(document.getElementById('render') as HTMLButtonElement).addEventListener('click', () => { void render(); });
void render();
