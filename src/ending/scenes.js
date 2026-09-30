// 结局场景：乌江（项羽）与彭城（刘邦）
import * as THREE from 'three';
import { fbm, valueNoise, makeCanvas, canvasTexture } from '../render/textures.js';
import { Hero, blackSteed } from './heroes.js';
import { Boat, makeFlag } from '../fx/models.js';
import { spiritUniforms, spiritMaterial } from '../fx/materials.js';
import { ParticleSystem } from '../fx/Particles.js';

const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0,0.0)), u.x), mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

function sky(colors, sunDir, { stars = 0, clouds = 0.5 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(colors.top) },
      uMid: { value: new THREE.Color(colors.mid) },
      uHorizon: { value: new THREE.Color(colors.horizon) },
      uSun: { value: new THREE.Color(colors.sun) },
      uSunDir: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
      uStars: { value: stars },
      uClouds: { value: clouds },
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir; uniform float uTime, uStars, uClouds; varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
        col = mix(col, uTop, smoothstep(0.22, 0.8, h));
        col = mix(col, uHorizon * 0.6, smoothstep(0.0, -0.15, h));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 700.0) * 6.0 + pow(s, 40.0) * 0.6 + pow(s, 5.0) * 0.3);
        // 云带
        vec2 cp = d.xz / max(h + 0.15, 0.05) * 1.2 + vec2(uTime * 0.01, 0.0);
        float c = smoothstep(0.45, 0.85, fbm(cp)) * smoothstep(0.02, 0.2, h) * smoothstep(0.7, 0.25, h) * uClouds;
        vec3 cloudCol = mix(uHorizon * 0.5, uSun * 1.1, pow(s, 3.0));
        col = mix(col, cloudCol, c * 0.8);
        float st = step(0.998, fract(sin(dot(floor(d * 260.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453)) * smoothstep(0.3, 0.8, h) * uStars;
        col += st;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 40, 20), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function groundTexture(kind) {
  const W = 512;
  const c = makeCanvas(W, W);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 60, y / 60, 5, kind === 'grass' ? 3 : 9);
      const fine = valueNoise(x / 3, y / 3, 7);
      const i = (y * W + x) * 4;
      let r;
      let g;
      let b;
      if (kind === 'grass') {
        const dry = Math.max(0, Math.min(1, (n - 0.35) * 2));
        r = 70 + dry * 70 + fine * 20;
        g = 64 + dry * 40 + fine * 18;
        b = 40 + dry * 10 + fine * 10;
      } else {
        const burn = Math.max(0, Math.min(1, (0.55 - n) * 3));
        r = 88 - burn * 55 + fine * 18;
        g = 70 - burn * 48 + fine * 14;
        b = 52 - burn * 38 + fine * 10;
      }
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = canvasTexture(c, { repeat: true });
  t.repeat.set(14, 14);
  return t;
}

function water(colors) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(colors.deep) },
      uSky: { value: new THREE.Color(colors.sky) },
      uSun: { value: new THREE.Color(colors.sun) },
      uSunDir: { value: colors.sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uDeep, uSky, uSun, uSunDir; varying vec3 vW;
      ${NOISE}
      float h(vec2 p){ return noise(p * 0.6 + vec2(uTime * 0.12, 0.0)) * 0.5 + noise(p * 1.7 - vec2(uTime * 0.2, uTime * 0.05)) * 0.3 + noise(p * 5.0 + vec2(uTime * 0.4, 0.0)) * 0.12; }
      void main(){
        vec2 p = vW.xz; float e = 0.05;
        float h0 = h(p); vec3 N = normalize(vec3(-(h(p + vec2(e,0.0)) - h0) / e * 0.3, 1.0, -(h(p + vec2(0.0,e)) - h0) / e * 0.3));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 col = mix(uDeep, uSky, fres);
        float sp = pow(max(dot(R, normalize(uSunDir)), 0.0), 120.0);
        col += uSun * sp * 3.0;
        col += uSun * pow(max(dot(R, normalize(uSunDir)), 0.0), 12.0) * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 60, 1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function reeds(count, area, color, clear = null) {
  const geo = new THREE.PlaneGeometry(0.04, 1, 1, 4);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
  const u = { uTime: { value: 0 } };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = u.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float sway = sin(uTime * 1.6 + ip.x * 0.7 + ip.z * 0.5) * 0.25 + sin(uTime * 3.1 + ip.x) * 0.06;
      transformed.x += sway * position.y * position.y;
      transformed.z += sway * 0.4 * position.y * position.y;`);
  };
  const m = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const [x0, x1, z0, z1] = area;
    let x;
    let z;
    do {
      x = x0 + Math.random() * (x1 - x0);
      z = z0 + Math.random() * (z1 - z0);
    } while (clear && Math.hypot((x - clear[0]) / clear[2], (z - clear[1]) / clear[3]) < 1);
    d.position.set(x, 0, z);
    d.rotation.set(0, Math.random() * 6, (Math.random() - 0.5) * 0.3);
    d.scale.set(1, 0.35 + Math.random() * 0.7, 1);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
  }
  m.userData.u = u;
  m.castShadow = true;
  return m;
}

// 飘落/飞舞粒子（雪、沙尘、余烬）
function drift(count, { color, size, area, speed, wind, rise = false, additive = false, opacity = 0.8 }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area[0];
    pos[i * 3 + 1] = Math.random() * area[1];
    pos[i * 3 + 2] = (Math.random() - 0.5) * area[2];
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uArea: { value: new THREE.Vector3(...area) },
      uSpeed: { value: speed },
      uWind: { value: wind },
      uRise: { value: rise ? 1 : -1 },
      uOpacity: { value: opacity },
      uScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uSize, uSpeed, uWind, uRise, uScale; uniform vec3 uArea; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * (0.6 + aSeed * 0.8);
        p.y = mod(p.y + uRise * t * uSpeed, uArea.y);
        p.x = mod(p.x + uArea.x * 0.5 + t * uWind + sin(t * 1.3 + aSeed * 30.0) * 0.4, uArea.x) - uArea.x * 0.5;
        p.z += sin(t * 0.9 + aSeed * 11.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.5 + aSeed) * uScale / -mv.z;
        vA = smoothstep(0.0, uArea.y * 0.1, p.y) * smoothstep(uArea.y, uArea.y * 0.8, p.y);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * uOpacity; gl_FragColor = vec4(uColor, a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function mountainRing(color, radius, height, seed, y = 0) {
  const W = 1024;
  const H = 160;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) {
    const r = 0.25 + fbm(x / 120, seed, 4, seed) * 0.5 + Math.max(0, Math.sin(x / 70 + seed)) * 0.15;
    ctx.lineTo(x, H * (1 - r));
  }
  ctx.lineTo(W, H);
  ctx.fill();
  const tex = canvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  m.position.y = y + height / 2;
  m.renderOrder = -8;
  return m;
}

// 城墙剪影（彭城）
function cityWall(len, fireMat) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#1a1412', roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, 2.4), mat);
  wall.position.y = 1.6;
  g.add(wall);
  for (let x = -len / 2 + 0.6; x < len / 2; x += 1.2) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.5), mat);
    m.position.set(x, 3.5, 1.0);
    g.add(m);
  }
  // 城楼
  const tower = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 3), mat);
  base.position.y = 4.3;
  tower.add(base);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 4), mat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.2, 1, 0.7);
  roof.position.y = 6.2;
  tower.add(roof);
  g.add(tower);
  // 火光窗口
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), fireMat);
    w.position.set(-2 + i * 0.8, 4.2, 1.52);
    tower.add(w);
  }
  return g;
}

// ================= 乌江 =================
export function buildWujiang(stage) {
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(-0.2, 0.08, -1);
  const pal = { top: '#1a0d1c', mid: '#6a1e24', horizon: '#e4502c', sun: '#ffb070' };
  scene.background = new THREE.Color(pal.horizon);
  scene.fog = new THREE.Fog(new THREE.Color('#8a3228'), 18, 90);
  const skyM = sky(pal, sunDir, { stars: 0.4, clouds: 0.8 });
  scene.add(skyM);
  scene.add(mountainRing('#3a1418', 160, 26, 5, -2), mountainRing('#200c10', 110, 18, 11, -2));
  const hemi = new THREE.HemisphereLight(0xff9a7a, 0x2a1810, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffa070, 3.2);
  sun.position.copy(sunDir).multiplyScalar(30).setY(8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 70 });
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x7a8aff, 0.5);
  fill.position.set(6, 5, 8);
  scene.add(fill);
  // 面光：夕阳余晖从镜头一侧照亮人物
  const face = new THREE.SpotLight(0xffb088, 26, 14, 0.5, 0.6, 1.2);
  face.position.set(1.8, 2.6, 4.2);
  face.target.position.set(0, 1.5, -1.2);
  scene.add(face, face.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: groundTexture('grass'), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  // 河岸：地面在 z < -3 处被河水覆盖
  scene.add(ground);
  const river = water({ deep: '#3a0e10', sky: '#e06a40', sun: '#ffb070', sunDir });
  river.position.set(0, 0.02, -34);
  scene.add(river);
  const reed = reeds(620, [-16, 16, -5.5, 4], '#5a4a30', [0.5, 0.5, 4.2, 3.6]);
  scene.add(reed);

  const hero = new Hero('xiangyu');
  hero.root.position.set(0, 0, -1.2);
  hero.root.rotation.y = Math.PI * 0.85; // 先面向江水，随后回身
  scene.add(hero.root);
  const steed = blackSteed();
  steed.root.position.set(1.9, 0, 0.4);
  steed.root.rotation.y = Math.PI * 0.75;
  steed.horse.stand();
  scene.add(steed.root);
  // 残旗
  const u = spiritUniforms();
  u.uDissolve.value = -1;
  u.uCrack.value = 0;
  u.uRim.value = 0;
  const flagMat = spiritMaterial(u, { color: '#1a2030', side: THREE.DoubleSide });
  const flag = makeFlag(flagMat, '楚', 1);
  const pole = new THREE.Group();
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 3.2, 6), new THREE.MeshStandardMaterial({ color: '#2a1a10' }));
  pm.position.y = 1.6;
  pole.add(pm);
  flag.scale.setScalar(2.4);
  flag.position.set(0, 2.7, 0);
  pole.add(flag);
  pole.position.set(-2.2, 0, 0.2);
  pole.rotation.z = 0.18;
  scene.add(pole);
  // 乌江亭长之舟
  const boat = new Boat();
  boat.root.scale.setScalar(1.8);
  boat.root.position.set(-3.4, 0.08, -6.5);
  boat.root.rotation.y = 0.4;
  scene.add(boat.root);
  const lantern = new THREE.PointLight(0xffa050, 3, 6);
  lantern.position.set(-3.4, 1.2, -6.5);
  scene.add(lantern);
  const snow = drift(900, { color: '#fff4ee', size: 26, area: [30, 12, 24], speed: 0.6, wind: 0.5 });
  snow.position.set(0, 0, -2);
  scene.add(snow);
  const embers = drift(120, { color: '#ff8a40', size: 18, area: [20, 6, 14], speed: 0.4, wind: 0.3, rise: true, additive: true, opacity: 0.9 });
  scene.add(embers);

  const update = (dt, t) => {
    skyM.material.uniforms.uTime.value = t;
    river.material.uniforms.uTime.value = t;
    reed.userData.u.uTime.value = t;
    snow.material.uniforms.uTime.value = t;
    embers.material.uniforms.uTime.value = t;
    const sc = stage.renderer.getPixelRatio() * (stage.height / 900);
    snow.material.uniforms.uScale.value = sc;
    embers.material.uniforms.uScale.value = sc;
    hero.update(t, 1);
    flag.userData.wave(t * 0.8);
    boat.root.position.y = 0.08 + Math.sin(t * 1.3) * 0.03;
    boat.root.rotation.z = Math.sin(t * 1.1) * 0.03;
    lantern.intensity = 3 + Math.sin(t * 9) * 0.4;
  };
  return { scene, hero, steed, boat, update, sunDir };
}

// ================= 彭城 =================
export function buildPengcheng(stage) {
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(0.1, 0.05, -1);
  const pal = { top: '#05060c', mid: '#1c0c10', horizon: '#8a2a10', sun: '#ff7a30' };
  scene.background = new THREE.Color(pal.mid);
  scene.fog = new THREE.Fog(new THREE.Color('#2a1410'), 12, 70);
  const skyM = sky(pal, sunDir, { stars: 1, clouds: 0.6 });
  scene.add(skyM);
  const hemi = new THREE.HemisphereLight(0x5a3a50, 0x100806, 0.55);
  scene.add(hemi);
  const fireLight = new THREE.DirectionalLight(0xff6a2a, 2.4);
  fireLight.position.set(-2, 6, -20);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024);
  Object.assign(fireLight.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 60 });
  scene.add(fireLight, fireLight.target);
  const moon = new THREE.DirectionalLight(0x6a7aff, 0.7);
  moon.position.set(8, 10, 10);
  scene.add(moon);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: groundTexture('burnt'), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3), toneMapped: false });
  const wall = cityWall(60, fireMat);
  wall.position.set(0, 0, -26);
  scene.add(wall);
  // 火焰与浓烟（远处）
  const fire = new ParticleSystem(700, true);
  const smoke = new ParticleSystem(500, false);
  scene.add(smoke.mesh, fire.mesh);
  const fireSpots = [[-14, -24], [-6, -24.5], [3, -24], [11, -23.5], [19, -24.5], [-20, -25]];
  // 残骸：断轮、倒旗
  const wreck = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.9 });
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 24, Math.PI * 1.6), woodMat);
  wheel.rotation.set(-Math.PI / 2 + 0.2, 0, 0.3);
  wheel.position.set(2.3, 0.1, 0.6);
  wreck.add(wheel);
  for (let k = 0; k < 6; k++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), woodMat);
    sp.position.set(2.3 + Math.cos(k) * 0.3, 0.1, 0.6 + Math.sin(k) * 0.3);
    sp.rotation.set(Math.PI / 2, 0, k);
    wreck.add(sp);
  }
  const u = spiritUniforms();
  u.uDissolve.value = -1;
  u.uCrack.value = 0;
  u.uRim.value = 0;
  const flag = makeFlag(spiritMaterial(u, { color: '#c0281a', side: THREE.DoubleSide }), '汉', 0);
  flag.scale.setScalar(2.2);
  const pole = new THREE.Group();
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.2, 6), woodMat);
  pm.position.y = 1.1;
  pole.add(pm);
  flag.position.set(0, 1.8, 0);
  pole.add(flag);
  pole.position.set(-2.0, 0, 0.3);
  pole.rotation.z = 0.6;
  wreck.add(pole);
  scene.add(wreck);
  wreck.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  // 刘邦踞鞍而坐
  const hero = new Hero('liubang');
  hero.pose('sit');
  hero.root.position.set(0, 0, 0);
  hero.root.rotation.y = 0.15;
  scene.add(hero.root);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.6), new THREE.MeshStandardMaterial({ color: '#5a2a18', roughness: 0.8 }));
  saddle.position.set(0, 0.18, -0.08);
  saddle.castShadow = true;
  scene.add(saddle);
  const steedObj = blackSteed();
  steedObj.root.traverse((o) => {
    if (o.isMesh && o.material.color && o.material.color.getHexString() === '141414') o.material = o.material.clone();
  });
  steedObj.root.traverse((o) => {
    if (o.isMesh && o.material.color?.getHexString() === '141414') o.material.color.set('#5a3a24');
  });
  steedObj.root.position.set(-1.6, 0, -1.4);
  steedObj.root.rotation.y = 0.9;
  steedObj.horse.stand();
  scene.add(steedObj.root);
  const glow = new THREE.PointLight(0xff5a20, 6, 12);
  glow.position.set(1.5, 1.2, -3);
  scene.add(glow);
  const face = new THREE.SpotLight(0xff9a60, 18, 12, 0.5, 0.6, 1.2);
  face.position.set(-1.2, 2.2, 3.6);
  face.target.position.set(0, 0.9, 0);
  scene.add(face, face.target);
  const sand = drift(1600, { color: '#c09a70', size: 90, area: [40, 8, 26], speed: 0.1, wind: 6, opacity: 0.45 });
  sand.position.set(0, 0, -4);
  scene.add(sand);
  const embers = drift(260, { color: '#ff7a30', size: 20, area: [30, 10, 24], speed: 0.8, wind: 1.6, rise: true, additive: true, opacity: 1 });
  embers.position.set(0, 0, -6);
  scene.add(embers);

  let acc = 0;
  const update = (dt, t) => {
    skyM.material.uniforms.uTime.value = t;
    const sc = stage.renderer.getPixelRatio() * (stage.height / 900);
    for (const p of [sand, embers]) {
      p.material.uniforms.uTime.value = t;
      p.material.uniforms.uScale.value = sc;
    }
    hero.update(t, 1.4);
    flag.userData.wave(t);
    glow.intensity = 5 + Math.sin(t * 7) * 1 + Math.sin(t * 13) * 0.6;
    acc += dt;
    if (acc > 0.05) {
      acc = 0;
      for (const [x, z] of fireSpots) {
        fire.emit({ count: 2, pos: () => [x + (Math.random() - 0.5) * 3, 3 + Math.random(), z], vel: () => [0.2, 1.5 + Math.random() * 2, 0], life: [0.8, 1.5], size: [1.2, 2], sizeEnd: 0.4, color: 0xffa040, colorEnd: 0xa01800, tile: 'flame', drag: 0.5 });
        smoke.emit({ count: 1, pos: [x, 5, z], vel: () => [0.8, 2 + Math.random(), 0], life: [3, 5], size: 2, sizeEnd: 6, color: 0x1a1210, alpha: 0.6, tile: 'smoke', spin: 0.2 });
      }
    }
    fire.update(dt);
    smoke.update(dt);
  };
  return { scene, hero, steed: steedObj, update, sunDir, sand };
}
