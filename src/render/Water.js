// 楚河汉界：流动的河水（程序化法线、菲涅尔反射、焦散、河床金字、涟漪）+ 两端瀑布
import * as THREE from 'three';
import { BOARD_HALF_W, RIVER_HALF, WATER_Y } from './coords.js';
import { riverbedTexture, canvasTexture } from './textures.js';
import { SUN_DIR, PALETTE } from './Environment.js';

export const RIVER_LEN = BOARD_HALF_W + 0.4; // 河道半长（含石台）
const MAX_RIPPLES = 10;

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0,0.0)), u.x), mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }
`;

export class River {
  constructor(stage) {
    this.stage = stage;
    this.ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.flowSpeed = 0.55;

    const bed = canvasTexture(riverbedTexture(2048, 200), { srgb: true });
    const len = RIVER_LEN * 2;
    const geo = new THREE.PlaneGeometry(len, RIVER_HALF * 2 + 0.02, 96, 6);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uBed: { value: bed },
      uSunDir: { value: SUN_DIR.clone().setY(0.55).normalize() },
      uSunColor: { value: PALETTE.sun.clone() },
      uSkyTop: { value: new THREE.Color('#4a4a8a') },
      uSkyHorizon: { value: PALETTE.horizon.clone() },
      uDeep: { value: new THREE.Color('#0d3b3a') },
      uShallow: { value: new THREE.Color('#2f8a78') },
      uRipples: { value: this.ripples },
      uHalf: { value: new THREE.Vector2(RIVER_LEN, RIVER_HALF) },
      uFlow: { value: 0 },
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color('#ff6a2a') },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime, uFlow;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        varying vec2 vUv;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        void main(){
          vUv = uv;
          vec3 p = position;
          vec4 w = modelMatrix * vec4(p, 1.0);
          float wave = (noise(w.xz * 2.2 + vec2(-uFlow * 1.3, uTime * 0.3)) - 0.5) * 0.025;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > 3.0) continue;
            float d = distance(w.xz, r.xy);
            float front = age * 1.4;
            wave += sin((d - front) * 16.0) * exp(-abs(d - front) * 5.0) * exp(-age * 1.3) * 0.03 * r.w;
          }
          w.y += wave;
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uFlow, uGlow;
        uniform sampler2D uBed;
        uniform vec3 uSunDir, uSunColor, uSkyTop, uSkyHorizon, uDeep, uShallow, uGlowColor;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        uniform vec2 uHalf;
        varying vec2 vUv;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        float height(vec2 p){
          float h = 0.0;
          // 顺流方向 +x 的多层波纹
          h += noise(p * vec2(2.2, 3.4) + vec2(-uFlow * 1.6, 0.0)) * 0.5;
          h += noise(p * vec2(4.5, 6.0) + vec2(-uFlow * 2.6, uTime * 0.2)) * 0.25;
          h += noise(p * vec2(9.0, 11.0) + vec2(-uFlow * 4.0, -uTime * 0.35)) * 0.12;
          h += noise(p * vec2(18.0, 22.0) + vec2(-uFlow * 6.5, uTime * 0.5)) * 0.06;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > 3.0) continue;
            float d = distance(p, r.xy);
            float front = age * 1.4;
            h += sin((d - front) * 18.0) * exp(-abs(d - front) * 4.0) * exp(-age * 1.2) * 0.35 * r.w;
          }
          return h;
        }
        float caustic(vec2 p){
          vec2 q = p * 5.0 + vec2(-uFlow * 2.0, 0.0);
          float c = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            c += abs(sin(q.x + sin(q.y * 1.3 + uTime * 0.7 + fi) * 1.5 + fi * 2.1) * sin(q.y + sin(q.x * 0.9 - uTime * 0.6 + fi) * 1.5));
            q *= 1.35;
          }
          return pow(c / 3.0, 3.0);
        }
        void main(){
          vec2 p = vWorld.xz;
          float e = 0.02;
          float h0 = height(p);
          float hx = height(p + vec2(e, 0.0));
          float hz = height(p + vec2(0.0, e));
          vec3 N = normalize(vec3(-(hx - h0) / e * 0.045, 1.0, -(hz - h0) / e * 0.045));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

          // 折射：河床 + 金字
          vec2 buv = vUv + N.xz * 0.04;
          vec3 bed = texture2D(uBed, buv).rgb;
          float edge = abs(p.y) / uHalf.y;
          float depthF = 1.0 - smoothstep(0.55, 1.0, edge);
          vec3 waterCol = mix(uShallow, uDeep, depthF * 0.8);
          vec3 refr = mix(bed * 1.1, waterCol, 0.35 + depthF * 0.25);
          refr += vec3(0.55, 0.85, 0.75) * caustic(p + N.xz * 0.3) * 0.22 * (0.6 + depthF * 0.4);

          // 反射天空
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
          vec3 col = mix(refr, sky, fres * 0.85);

          // 高光
          float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 180.0);
          col += uSunColor * spec * 2.4;
          float sparkle = pow(max(dot(R, normalize(uSunDir)), 0.0), 30.0) * step(0.93, noise(p * 30.0 + vec2(-uFlow * 8.0, uTime)));
          col += uSunColor * sparkle * 0.25;

          // 岸边泡沫
          float foamN = noise(p * vec2(10.0, 16.0) + vec2(-uFlow * 5.0, 0.0));
          float foam = smoothstep(0.82, 0.98, edge + foamN * 0.12);
          // 两端瀑布口的白水
          float lip = smoothstep(uHalf.x - 0.55, uHalf.x, abs(p.x));
          foam = max(foam, lip * smoothstep(0.35, 0.8, foamN + lip * 0.3));
          col = mix(col, vec3(0.92, 0.96, 0.95), foam * 0.75);

          col += uGlowColor * uGlow * (0.4 + 0.6 * h0);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = WATER_Y;
    this.mesh.receiveShadow = false;

    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.falls = [makeFall(1), makeFall(-1)];
    for (const f of this.falls) this.group.add(f);
    this.mist = makeMist();
    this.group.add(this.mist);

    stage.add((dt, t) => {
      this.uniforms.uTime.value = t;
      this.uniforms.uFlow.value += dt * this.flowSpeed;
      for (const f of this.falls) f.material.uniforms.uTime.value = t;
      this.mist.material.uniforms.uTime.value = t;
    });
  }

  // 在水面 (x,z) 处产生涟漪
  ripple(x, z, strength = 1) {
    let slot = this.ripples[0];
    for (const r of this.ripples) if (r.z < slot.z) slot = r;
    slot.set(x, z, this.uniforms.uTime.value, strength);
  }
}

// 瀑布：从河道尽头倾泻入云海
function makeFall(dir) {
  const segU = 8;
  const segV = 40;
  const W = RIVER_HALF * 2;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= segV; j++) {
    const t = j / segV;
    // 抛物线：先越过边缘，再垂直落下
    const out = 0.25 * Math.sqrt(t) + t * 0.9;
    const drop = t * t * 10 + t * 0.4;
    for (let i = 0; i <= segU; i++) {
      const s = i / segU;
      const spread = 1 + t * 0.9;
      pos.push(dir * (RIVER_LEN + out), WATER_Y - drop, (s - 0.5) * W * spread);
      uv.push(s, t);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + segU + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main(){
        float streak = noise(vec2(vUv.x * 26.0, vUv.y * 3.0 - uTime * 2.6));
        streak += noise(vec2(vUv.x * 60.0, vUv.y * 6.0 - uTime * 3.4)) * 0.5;
        float edgeFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float a = (0.35 + streak * 0.55) * edgeFade * smoothstep(1.0, 0.45, vUv.y);
        vec3 col = mix(vec3(0.35, 0.7, 0.66), vec3(0.95, 0.98, 1.0), smoothstep(0.4, 1.1, streak) * 0.8 + vUv.y * 0.3);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

// 瀑布水雾
function makeMist(count = 120) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    pos[i * 3] = side * (RIVER_LEN + 0.3);
    pos[i * 3 + 1] = 0;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vA;
      void main(){
        float life = fract(uTime * 0.25 + aSeed);
        vec3 p = position;
        float side = sign(p.x);
        p.x += side * (0.2 + life * 1.4);
        p.y = -0.3 - life * 9.0;
        p.z *= 1.0 + life * 1.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (60.0 + life * 260.0) / -mv.z;
        vA = sin(life * 3.14159) * 0.28;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(0.92, 0.95, 1.0), a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}
