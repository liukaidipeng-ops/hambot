// 渲染舞台：渲染器、后期处理、镜头控制、帧循环
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uDesat: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTime: { value: 0 },
    uGrain: { value: 0.025 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uFlash, uDesat, uTime, uGrain, uAspect;
    uniform vec3 uFlashColor, uTint;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uTint;
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(l), uDesat);
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(0.95, 0.25, length(d) * (0.9 + uVignette));
      col *= mix(1.0 - uVignette, 1.0, v);
      col += uFlashColor * uFlash;
      col += (rand(vUv * 731.0 + uTime) - 0.5) * uGrain * (0.3 + l);
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

export class Stage {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
    this.activeScene = this.scene;
    this.activeCamera = this.camera;

    this.lastNow = performance.now();
    this.time = 0;
    this.timeScale = 1;
    this.updaters = new Set();
    this.shakeAmt = 0;
    this.shakeDecay = 0;

    this.setupComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  setupComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const samples = this.quality === 'high' ? 4 : this.quality === 'medium' ? 2 : 0;
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples,
    });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.86);
    this.bloom.enabled = this.quality !== 'low';
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.composer.dispose();
    this.setupComposer();
    this.resize();
    this.renderer.shadowMap.enabled = q !== 'low';
  }

  pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    if (this.quality === 'high') return Math.min(dpr, 2);
    if (this.quality === 'medium') return Math.min(dpr, 1.5);
    return Math.min(dpr, 1);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const bloomScale = this.quality === 'high' ? 0.5 : 0.35;
    this.bloom.resolution.set(w * bloomScale, h * bloomScale);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.grade.uniforms.uAspect.value = w / h;
    for (const fn of this.updaters) fn.onResize?.(w, h);
    this.onResize?.(w, h);
  }

  // 注册每帧回调：fn(dt, t)
  add(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  shake(amount = 0.15, decay = 3) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeDecay = decay;
  }

  flash(amount = 0.6, color = 0xffd9a0) {
    this.grade.uniforms.uFlash.value = Math.max(this.grade.uniforms.uFlash.value, amount);
    this.grade.uniforms.uFlashColor.value.set(color);
  }

  setView(scene, camera) {
    this.activeScene = scene;
    this.activeCamera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  start() {
    // ?still=N：仅渲染 N 帧后停止（用于无 GPU 环境截图调试）
    const still = +new URLSearchParams(location.search).get('still') || 0;
    let n = 0;
    const loop = () => {
      if (still && n++ >= still) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  frame() {
    const now = performance.now();
    const rawDt = Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;
    const dt = rawDt * this.timeScale;
    this.time += dt;
    this.realTime = (this.realTime || 0) + rawDt;
    this.frameDt = rawDt;
    for (const fn of this.updaters) fn(dt, this.time, rawDt);
    // 镜头震动
    const cam = this.activeCamera;
    let shakeOffset = null;
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt;
      shakeOffset = new THREE.Vector3(
        (Math.random() - 0.5) * a,
        (Math.random() - 0.5) * a * 0.7,
        (Math.random() - 0.5) * a,
      );
      cam.position.add(shakeOffset);
      this.shakeAmt *= Math.exp(-this.shakeDecay * rawDt);
    }
    const g = this.grade.uniforms;
    g.uFlash.value *= Math.exp(-6 * rawDt);
    g.uTime.value = this.realTime % 100;
    this.composer.render(rawDt);
    if (shakeOffset) cam.position.sub(shakeOffset);
    this.fpsSample(rawDt);
  }

  // 调试：以固定步长推进模拟（不渲染），最后渲染一帧
  async advance(seconds, dt = 1 / 30) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      const d = dt * this.timeScale;
      this.time += d;
      for (const fn of this.updaters) fn(d, this.time, dt);
      await new Promise((r) => setTimeout(r, 0));
    }
    this.lastNow = performance.now();
    this.frame();
  }

  // 帧率监测，用于自动降级
  fpsSample(dt) {
    this._acc = (this._acc || 0) + dt;
    this._frames = (this._frames || 0) + 1;
    if (this._acc > 2) {
      this.fps = this._frames / this._acc;
      this._acc = 0;
      this._frames = 0;
      this.onFps?.(this.fps);
    }
  }
}
