// 兵马俑材质：陶土纹理 + 裂纹发光 + 溶解显现/消散
import * as THREE from 'three';
import { fbm, valueNoise, makeCanvas, canvasTexture } from '../render/textures.js';

let clayTex = null;
let crackTex = null;
let bronzeTex = null;
let armorTex = null;

// 抖动网格 Voronoi：返回每像素“到最近两点距离差”，用于生成裂纹
function voronoiCracks(W, seed = 3) {
  const G = 9;
  const cell = W / G;
  const pts = [];
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      pts.push([(gx + 0.15 + valueNoise(gx * 7.1, gy * 3.3, seed) * 0.7) * cell, (gy + 0.15 + valueNoise(gx * 2.7, gy * 9.1, seed + 1) * 0.7) * cell]);
    }
  }
  const img = new Float32Array(W * W);
  for (let y = 0; y < W; y++) {
    const cy = Math.floor(y / cell);
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(x / cell);
      let d1 = 1e9;
      let d2 = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cy + oy;
          const wx = ((gx % G) + G) % G;
          const wy = ((gy % G) + G) % G;
          const p = pts[wy * G + wx];
          const px = p[0] + (gx - wx) * cell;
          const py = p[1] + (gy - wy) * cell;
          const dx = x - px;
          const dy = y - py;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      img[y * W + x] = Math.sqrt(d2) - Math.sqrt(d1);
    }
  }
  return img;
}

function buildTextures() {
  const W = 256;
  const edges = voronoiCracks(W, 7);
  const edges2 = voronoiCracks(W, 19);
  // 陶土颜色 + 裂纹发光遮罩
  const c = makeCanvas(W, W);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, W);
  const k = makeCanvas(W, W);
  const kctx = k.getContext('2d');
  const kimg = kctx.createImageData(W, W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = fbm(x / 40, y / 40, 4, 11);
      const grit = valueNoise(x / 1.5, y / 1.5, 5);
      const e = edges[y * W + x];
      const mask = fbm(x / 26, y / 26, 3, 3);
      const crackLine = Math.max(0, 1 - e / 1.4);
      const visible = mask > 0.5 ? 1 : 0;
      const shade = 0.8 + (n - 0.5) * 0.45 + (grit - 0.5) * 0.1 - crackLine * visible * 0.45;
      img.data[i] = 255 * shade;
      img.data[i + 1] = 255 * shade * 0.97;
      img.data[i + 2] = 255 * shade * 0.93;
      img.data[i + 3] = 255;
      const e2 = edges2[y * W + x];
      const glow = Math.pow(crackLine, 1.6) * (mask > 0.56 ? 1 : 0) + Math.pow(Math.max(0, 1 - e2 / 1.1), 2) * (fbm(x / 18, y / 18, 2, 8) > 0.62 ? 0.7 : 0);
      kimg.data[i] = kimg.data[i + 1] = kimg.data[i + 2] = 255 * Math.min(1, glow);
      kimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  kctx.putImageData(kimg, 0, 0);
  clayTex = canvasTexture(c, { repeat: true });
  crackTex = canvasTexture(k, { srgb: false, repeat: true });
  // 札甲（甲片 + 甲钉）
  const a = makeCanvas(W, W);
  const actx = a.getContext('2d');
  actx.drawImage(c, 0, 0);
  const rows = 8;
  const cols = 6;
  const pw = W / cols;
  const ph = W / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const x0 = q * pw + (r % 2 ? pw / 2 : 0);
      const y0 = r * ph;
      actx.fillStyle = 'rgba(40,20,10,0.55)';
      actx.fillRect(x0 - 1, y0, 2.5, ph);
      actx.fillRect(x0, y0 + ph - 2.5, pw, 2.5);
      actx.fillStyle = 'rgba(255,235,210,0.12)';
      actx.fillRect(x0 + 2, y0 + 1, pw - 4, 3);
      actx.fillStyle = 'rgba(30,15,8,0.7)';
      for (const [dx, dy] of [[0.3, 0.25], [0.7, 0.25]]) {
        actx.beginPath();
        actx.arc(x0 + pw * dx, y0 + ph * dy, 2.2, 0, Math.PI * 2);
        actx.fill();
      }
    }
  }
  armorTex = canvasTexture(a, { repeat: true });
  // 青铜锈迹
  const b = makeCanvas(W, W);
  const bctx = b.getContext('2d');
  const bimg = bctx.createImageData(W, W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = fbm(x / 30, y / 30, 4, 21);
      const patina = Math.max(0, n - 0.55) * 2.2;
      bimg.data[i] = 255 * (0.8 - patina * 0.45);
      bimg.data[i + 1] = 255 * (0.72 + patina * 0.05);
      bimg.data[i + 2] = 255 * (0.55 + patina * 0.15);
      bimg.data[i + 3] = 255;
    }
  }
  bctx.putImageData(bimg, 0, 0);
  bronzeTex = canvasTexture(b, { repeat: true });
}

const DECL = /* glsl */ `
  varying vec3 vDisW;
  uniform float uDissolve, uBaseY, uHeight, uCrack, uRim, uTime;
  uniform vec3 uEdge, uGlowColor;
  uniform sampler2D uCrackTex;
  float dhash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float dnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dhash(i), dhash(i + vec3(1,0,0)), f.x), mix(dhash(i + vec3(0,1,0)), dhash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(dhash(i + vec3(0,0,1)), dhash(i + vec3(1,0,1)), f.x), mix(dhash(i + vec3(0,1,1)), dhash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float disField(){
    float rel = clamp((vDisW.y - uBaseY) / max(uHeight, 0.001), 0.0, 1.0);
    return dnoise(vDisW * 9.0) * 0.45 + dnoise(vDisW * 23.0) * 0.15 + (1.0 - rel) * 0.4;
  }
`;

const DISCARD = /* glsl */ `
  float dField = disField();
  if (dField < uDissolve) discard;
`;

const EMIT = /* glsl */ `
  {
    float edge = smoothstep(0.09, 0.0, dField - uDissolve) * step(0.001, uDissolve + 0.2);
    totalEmissiveRadiance += uEdge * edge * 5.0;
    #ifdef USE_MAP
      float ck = texture2D(uCrackTex, vMapUv * 0.7).r;
      totalEmissiveRadiance += uGlowColor * ck * uCrack * (0.75 + 0.25 * sin(uTime * 6.0 + vDisW.y * 8.0));
    #endif
    vec3 vdir = normalize(vViewPosition);
    float rim = pow(1.0 - clamp(abs(dot(normal, vdir)), 0.0, 1.0), 3.0);
    totalEmissiveRadiance += uGlowColor * rim * uRim;
  }
`;

// 创建一组共享 uniform（一个模型实例一组）
export function spiritUniforms(glow = new THREE.Color('#ff6a2a')) {
  if (!clayTex) buildTextures();
  return {
    uDissolve: { value: 1.2 },
    uBaseY: { value: 0 },
    uHeight: { value: 1.5 },
    uCrack: { value: 2.6 },
    uRim: { value: 0.3 },
    uTime: { value: 0 },
    uEdge: { value: new THREE.Color('#ffd28a') },
    uGlowColor: { value: glow.clone() },
    uCrackTex: { value: crackTex },
  };
}

export function spiritMaterial(u, opts = {}) {
  if (!clayTex) buildTextures();
  const kind = opts.kind || 'clay';
  const params = {
    color: new THREE.Color(opts.color ?? '#c08a62'),
    roughness: opts.roughness ?? 0.92,
    metalness: opts.metalness ?? 0,
    map: kind === 'bronze' ? bronzeTex : kind === 'armor' ? armorTex : clayTex,
    side: opts.side ?? THREE.FrontSide,
    transparent: false,
  };
  if (kind === 'bronze') {
    params.roughness = opts.roughness ?? 0.38;
    params.metalness = opts.metalness ?? 0.85;
  }
  if (kind === 'steel') {
    params.map = null;
    params.roughness = 0.22;
    params.metalness = 1;
  }
  const m = new THREE.MeshStandardMaterial(params);
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDisW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDisW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DISCARD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + EMIT);
  };
  m.customProgramCacheKey = () => 'spirit-' + kind + (params.map ? 'm' : '') + (params.side === THREE.DoubleSide ? 'd' : '');
  return m;
}

// 一个模型用到的整套材质（按阵营着色）
export function unitPalette(team, u) {
  const han = team === 0;
  return {
    clay: spiritMaterial(u, { color: '#b87650' }),
    skin: spiritMaterial(u, { color: '#c08260' }),
    armor: spiritMaterial(u, { kind: 'armor', color: han ? '#8a5a42' : '#5a5758', roughness: 0.8 }),
    trim: spiritMaterial(u, { kind: 'bronze', color: han ? '#d8a852' : '#aab6c0' }),
    cloth: spiritMaterial(u, { color: han ? '#9c3322' : '#2e3a52', roughness: 0.85, side: THREE.DoubleSide }),
    plume: spiritMaterial(u, { color: han ? '#e8321c' : '#1d2a60', roughness: 0.7, emissive: han ? '#5a0a00' : '#0a1640' }),
    wood: spiritMaterial(u, { color: '#7a5030', roughness: 0.8 }),
    steel: spiritMaterial(u, { kind: 'steel', color: '#dfe6ea' }),
    bronze: spiritMaterial(u, { kind: 'bronze', color: '#9a7440', roughness: 0.5 }),
    horse: spiritMaterial(u, { color: han ? '#a86c48' : '#4a403c' }),
    dark: spiritMaterial(u, { color: '#3a2a22', roughness: 0.9 }),
    flag: spiritMaterial(u, { color: han ? '#c0281a' : '#1a2030', roughness: 0.8, side: THREE.DoubleSide }),
  };
}

export function getTextures() {
  if (!clayTex) buildTextures();
  return { clayTex, crackTex, bronzeTex, armorTex };
}
