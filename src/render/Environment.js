// 场景环境：黄昏天空、云海、远山、光照、浮尘
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fbm, valueNoise, makeCanvas, canvasTexture } from './textures.js';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.32, -0.72).normalize();

export const PALETTE = {
  skyTop: new THREE.Color('#0b1030'),
  skyMid: new THREE.Color('#3b2c5c'),
  horizon: new THREE.Color('#f08a5a'),
  sun: new THREE.Color('#ffc58a'),
  cloudLit: new THREE.Color('#ffb98a'),
  cloudShade: new THREE.Color('#5a4a78'),
};

function makeSky() {
  const geo = new THREE.SphereGeometry(400, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: PALETTE.skyTop },
      uMid: { value: PALETTE.skyMid },
      uHorizon: { value: PALETTE.horizon },
      uSun: { value: PALETTE.sun },
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir;
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
        col = mix(col, uTop, smoothstep(0.25, 0.85, h));
        col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.2, h));
        // 地平线光带
        col += uHorizon * 0.35 * exp(-abs(h) * 14.0);
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 900.0) * 10.0 + pow(s, 60.0) * 0.6 + pow(s, 6.0) * 0.25);
        // 星点
        vec3 sp = floor(d * 300.0);
        float st = hash(sp);
        float star = step(0.9975, st) * smoothstep(0.35, 0.8, h) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 80.0));
        col += vec3(star) * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function makeClouds(quality) {
  const geo = new THREE.PlaneGeometry(900, 900, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    defines: { LIT: quality === 'high' ? 1 : 0 },
    uniforms: {
      uTime: { value: 0 },
      uLit: { value: PALETTE.cloudLit },
      uShade: { value: PALETTE.cloudShade },
      uDeep: { value: new THREE.Color('#1c1630') },
      uHorizon: { value: PALETTE.horizon },
      uSun: { value: PALETTE.sun },
      uSunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uLit, uShade, uDeep, uHorizon, uSun, uSunDir;
      varying vec3 vWorld;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0; float a = 0.5;
        for(int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; }
        return v;
      }
      float clouds(vec2 p, vec2 q){ return fbm(p + 1.6 * q); }
      void main(){
        vec2 p = vWorld.xz * 0.035 + vec2(uTime * 0.01, uTime * 0.004);
        vec2 q = vec2(fbm(p * 0.6), fbm(p * 0.6 + vec2(5.2, 1.3)));
        float n = clouds(p, q);
        float dens = smoothstep(0.38, 0.72, n);
        vec3 col = mix(uDeep, uShade, smoothstep(0.25, 0.55, n));
        #if LIT
          float e = 0.06;
          float nx = clouds(p + vec2(e, 0.0), q);
          float nz = clouds(p + vec2(0.0, e), q);
          vec3 N = normalize(vec3(-(nx - n) / e * 0.5, 1.0, -(nz - n) / e * 0.5));
          vec3 L = normalize(vec3(uSunDir.x, 0.35, uSunDir.z));
          float diff = clamp(dot(N, L) * 0.8 + 0.2, 0.0, 1.0);
          col = mix(col, uLit, diff * dens * 0.9);
          col += uSun * pow(diff, 6.0) * dens * 0.25;
        #else
          col = mix(col, uLit, dens * 0.6);
        #endif
        // 远处融入地平线
        float dist = length(vWorld.xz);
        float fogF = smoothstep(40.0, 360.0, dist);
        col = mix(col, uHorizon * 0.9, pow(fogF, 0.7));
        float alpha = smoothstep(440.0, 330.0, dist);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -10;
  m.renderOrder = -9;
  return m;
}

// 远山剪影（水墨风格的环形山带）
function mountainTexture(seed, peaks = 22, sharp = 1) {
  const W = 1024;
  const H = 160;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const ridge = new Float32Array(W);
  for (let x = 0; x < W; x++) ridge[x] = 0.18 + fbm(x / 90, seed, 4, seed) * 0.22;
  for (let i = 0; i < peaks; i++) {
    const cx = valueNoise(i * 3.1, seed, seed) * W;
    const hgt = 0.3 + valueNoise(i * 7.3, seed + 1, seed) * 0.62;
    const wid = (10 + valueNoise(i, seed + 2, seed) * 45) / sharp;
    for (let dx = -W / 2; dx < W / 2; dx++) {
      const x = (((cx + dx) % W) + W) % W;
      const t = Math.abs(dx) / wid;
      const v = hgt * Math.exp(-t * t * 1.4) * (1 + 0.06 * Math.sin(dx * 0.3));
      if (v > ridge[x]) ridge[x] = v;
    }
  }
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let x = 0; x < W; x++) {
    const top = H * (1 - ridge[x]);
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      if (y < top) {
        d[i + 3] = 0;
        continue;
      }
      const depth = (y - top) / (H - top + 1);
      const tex = fbm(x / 15, y / 15, 3, seed + 9);
      const shade = 1 - depth * 0.4 + (tex - 0.5) * 0.25;
      d[i] = 255 * shade;
      d[i + 1] = 255 * shade;
      d[i + 2] = 255 * shade;
      d[i + 3] = 255 * Math.min(1, (1 - Math.pow(depth, 1.6)) * 1.1) * Math.min(1, (y - top + 1) / 2);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeMountains() {
  const g = new THREE.Group();
  const layers = [
    { r: 330, h: 70, y: -32, color: '#9a6a7a', seed: 3, peaks: 18, rot: 0.3 },
    { r: 250, h: 62, y: -30, color: '#5c3f5c', seed: 7, peaks: 24, rot: 1.7 },
    { r: 175, h: 46, y: -24, color: '#2e2240', seed: 11, peaks: 30, rot: 4.1, sharp: 1.4 },
  ];
  for (const L of layers) {
    const geo = new THREE.CylinderGeometry(L.r, L.r, L.h, 96, 1, true);
    const tex = mountainTexture(L.seed, L.peaks, L.sharp || 1);
    tex.repeat.set(2, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(L.color),
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = L.y + L.h / 2;
    m.rotation.y = L.rot;
    m.renderOrder = -8;
    g.add(m);
  }
  return g;
}

// 浮尘/余烬
function makeMotes(count = 160) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = Math.random() * 7 - 1;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 22;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uScale;
      varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * (0.05 + aSeed * 0.08);
        p.x += sin(t * 3.0 + aSeed * 40.0) * 1.2;
        p.z += cos(t * 2.3 + aSeed * 17.0) * 1.2;
        p.y = mod(p.y + t * 1.5, 8.0) - 1.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + aSeed * 3.0) * uScale * (20.0 / -mv.z);
        vA = (0.35 + 0.65 * sin(uTime * 1.5 + aSeed * 30.0) * 0.5 + 0.5) * smoothstep(-1.0, 1.5, p.y) * smoothstep(7.0, 4.0, p.y);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * a * vA * 0.9, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export class Environment {
  constructor(stage) {
    this.stage = stage;
    const scene = stage.scene;
    scene.background = PALETTE.horizon.clone();
    scene.fog = new THREE.Fog(PALETTE.skyMid.clone().lerp(PALETTE.horizon, 0.5), 40, 120);

    this.sky = makeSky();
    scene.add(this.sky);
    this.clouds = makeClouds(stage.quality);
    scene.add(this.clouds);
    this.mountains = makeMountains();
    scene.add(this.mountains);
    this.motes = makeMotes(stage.quality === 'low' ? 60 : 160);
    scene.add(this.motes);

    // 光照
    this.hemi = new THREE.HemisphereLight(0xaab6ff, 0x6a4028, 0.9);
    scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffd2a0, 2.6);
    this.key.position.set(-6, 13, 7);
    this.key.castShadow = true;
    const sm = stage.quality === 'high' ? 2048 : 1024;
    this.key.shadow.mapSize.set(sm, sm);
    const sc = this.key.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 8;
    sc.bottom = -8;
    sc.near = 2;
    sc.far = 40;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 3;
    scene.add(this.key);
    scene.add(this.key.target);
    this.rim = new THREE.DirectionalLight(0xff9a6a, 1.2);
    this.rim.position.copy(SUN_DIR).multiplyScalar(20);
    scene.add(this.rim);
    this.fill = new THREE.DirectionalLight(0x8fa8ff, 0.5);
    this.fill.position.set(6, 6, 8);
    scene.add(this.fill);

    // 反射环境
    const pmrem = new THREE.PMREMGenerator(stage.renderer);
    const envScene = new RoomEnvironment();
    this.envMap = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.45;
    pmrem.dispose();

    stage.add((dt, t) => {
      this.sky.material.uniforms.uTime.value = t;
      this.clouds.material.uniforms.uTime.value = t;
      this.motes.material.uniforms.uTime.value = t;
      this.motes.material.uniforms.uScale.value = stage.renderer.getPixelRatio() * (stage.height / 900);
      this.mountains.rotation.y = t * 0.002;
    });
  }
}
