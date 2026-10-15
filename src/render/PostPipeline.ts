import * as THREE from 'three/webgpu';
import { float, Fn, mix, mrt, normalView, output, pass, renderOutput, uniform, uv, vec3, vec4, luminance } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import type { QualitySettings } from './quality';
import type { StageGrading } from './stages/Stage';

/**
 * TSL post-processing: scene pass (+MRT normals for AO) → GTAO → bloom →
 * colour grading + vignette → tone mapping / colour space → FXAA or SMAA.
 * Rebuilt when the quality tier changes; grading is driven by uniforms.
 */
export class PostPipeline {
  private post: THREE.PostProcessing;
  private readonly uExposure = uniform(1);
  private readonly uContrast = uniform(1);
  private readonly uSaturation = uniform(1);
  private readonly uTint = uniform(new THREE.Vector3(1, 1, 1));
  private readonly uVignette = uniform(0.3);
  private readonly uFlash = uniform(0);
  private bloomStrength: { value: number } | null = null;
  private bloomThreshold: { value: number } | null = null;
  readonly renderer: THREE.WebGPURenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private quality: QualitySettings;
  private grading: StageGrading;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, quality: QualitySettings, grading: StageGrading) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.grading = grading;
    this.post = this.build();
    this.setGrading(grading);
  }

  private build(): THREE.PostProcessing {
    const q = this.quality;
    const scenePass = pass(this.scene, this.camera);
    let color: Node<'vec4'> = scenePass.getTextureNode('output');
    if (q.ssao) {
      scenePass.setMRT(mrt({ output, normal: normalView }));
      const depth = scenePass.getTextureNode('depth');
      const normal = scenePass.getTextureNode('normal');
      const aoPass = ao(depth, normal, this.camera);
      aoPass.resolutionScale = 1;
      aoPass.radius.value = 0.22;
      aoPass.scale.value = 1.0;
      aoPass.thickness.value = 0.6;
      const aoDenoised = denoise(aoPass.getTextureNode(), depth, normal, this.camera);
      color = color.mul(aoDenoised as unknown as Node<'float'>);
    }
    // exposure is applied before bloom so a stage's grading also scales what blooms
    color = color.mul(this.uExposure);
    if (q.bloom) {
      const b = bloom(color, this.grading.bloomStrength, 0.3, this.grading.bloomThreshold);
      this.bloomStrength = b.strength;
      this.bloomThreshold = b.threshold;
      color = color.add(b);
    } else {
      this.bloomStrength = null;
      this.bloomThreshold = null;
    }
    const uContrast = this.uContrast, uSaturation = this.uSaturation, uTint = this.uTint, uVignette = this.uVignette, uFlash = this.uFlash;
    const graded = Fn(() => {
      let c = color.rgb.mul(uTint);
      const lum = luminance(c);
      c = mix(vec3(lum), c, uSaturation);
      c = c.sub(0.5).mul(uContrast).add(0.5).max(0.0);
      const d = uv().sub(0.5).length();
      const vig = float(1.0).sub(d.mul(d).mul(uVignette.mul(2.2)));
      c = c.mul(vig.max(0.0));
      c = mix(c, vec3(1.0), uFlash);
      return vec4(c, 1.0);
    })();
    const ldr = renderOutput(graded);
    const post = new THREE.PostProcessing(this.renderer);
    post.outputColorTransform = false;
    if (q.tier === 'ultra' || q.tier === 'high') post.outputNode = smaa(ldr);
    else if (q.tier === 'medium' || q.tier === 'low') post.outputNode = fxaa(ldr);
    else post.outputNode = ldr;
    return post;
  }

  setGrading(g: StageGrading): void {
    this.grading = g;
    this.uExposure.value = g.exposure;
    this.uContrast.value = g.contrast;
    this.uSaturation.value = g.saturation;
    this.uTint.value.set(g.tint[0], g.tint[1], g.tint[2]);
    this.uVignette.value = g.vignette;
    if (this.bloomStrength) this.bloomStrength.value = g.bloomStrength;
    if (this.bloomThreshold) this.bloomThreshold.value = g.bloomThreshold;
  }

  /** Full-screen white flash amount (0..1), used for KO / wall hits; decays per frame. */
  setFlash(v: number): void {
    this.uFlash.value = Math.max(0, Math.min(1, v));
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
    this.post.dispose();
    this.post = this.build();
    this.setGrading(this.grading);
  }

  render(): void {
    this.post.render();
  }

  dispose(): void {
    this.post.dispose();
  }
}
