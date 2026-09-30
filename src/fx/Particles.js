// GPU 实例化粒子系统（火焰、烟尘、火星、水花、光晕……）
import * as THREE from 'three';

const TILE = { glow: 0, smoke: 1, dot: 2, flame: 3 };

function makeAtlas() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S;
  const ctx = c.getContext('2d');
  // 0 光晕
  let g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // 1 烟团
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2);
      const dy = (y - S / 2) / (S / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      let n = 0;
      let amp = 0.5;
      let f = 3;
      for (let o = 0; o < 4; o++) {
        n += amp * (Math.sin(x * f * 0.05 + Math.cos(y * f * 0.043) * 2) * Math.cos(y * f * 0.047 + Math.sin(x * f * 0.031) * 2) * 0.5 + 0.5);
        f *= 2.1;
        amp *= 0.5;
      }
      const a = Math.max(0, 1 - r) ** 1.4 * (0.55 + n * 0.6);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, S, 0);
  // 2 硬点（火星）
  g = ctx.createRadialGradient(S * 2.5, S / 2, 0, S * 2.5, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(S * 2, 0, S, S);
  // 3 火苗
  ctx.save();
  ctx.translate(S * 3.5, S * 0.62);
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.45);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -S * 0.58);
  ctx.bezierCurveTo(S * 0.35, -S * 0.1, S * 0.42, S * 0.3, 0, S * 0.36);
  ctx.bezierCurveTo(-S * 0.42, S * 0.3, -S * 0.35, -S * 0.1, 0, -S * 0.58);
  ctx.fill();
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let atlas = null;

export class ParticleSystem {
  constructor(max = 2000, additive = true) {
    if (!atlas) atlas = makeAtlas();
    this.max = max;
    this.count = 0;
    const N = max;
    this.p = new Float32Array(N * 3);
    this.v = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.size0 = new Float32Array(N);
    this.size1 = new Float32Array(N);
    this.c0 = new Float32Array(N * 4);
    this.c1 = new Float32Array(N * 4);
    this.rot = new Float32Array(N);
    this.spin = new Float32Array(N);
    this.drag = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.tile = new Float32Array(N);
    this.stretch = new Float32Array(N);
    this.floor = new Float32Array(N);

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    this.aTile = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    this.aStretch = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iRot', this.aRot);
    geo.setAttribute('iTile', this.aTile);
    geo.setAttribute('iStretch', this.aStretch);
    geo.instanceCount = 0;
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uAtlas: { value: atlas } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec3 iVel; attribute float iSize; attribute vec4 iColor;
        attribute float iRot; attribute float iTile; attribute float iStretch;
        varying vec2 vUv; varying vec4 vColor;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          vec2 corner = position.xy;
          if (iStretch > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
            float l = length(vv.xy);
            vec2 dir = l > 1e-4 ? vv.xy / l : vec2(0.0, 1.0);
            vec2 perp = vec2(-dir.y, dir.x);
            float len = 1.0 + l * iStretch;
            mv.xy += (dir * corner.y * len + perp * corner.x) * iSize;
          } else {
            float c = cos(iRot); float s = sin(iRot);
            mv.xy += mat2(c, -s, s, c) * corner * iSize;
          }
          gl_Position = projectionMatrix * mv;
          vUv = vec2((uv.x + iTile) / 4.0, uv.y);
          vColor = iColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec2 vUv; varying vec4 vColor;
        void main(){
          vec4 t = texture2D(uAtlas, vUv);
          gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    if (additive) mat.toneMapped = false;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 15;
  }

  // opts: count, pos(i)->[x,y,z] | Vector3, vel(i)->[x,y,z], life, size, sizeEnd, color, colorEnd, alpha, alphaEnd, gravity, drag, tile, stretch, spin, floor
  emit(o) {
    const n = o.count || 1;
    const ca = new THREE.Color(o.color ?? 0xffffff);
    const cb = new THREE.Color(o.colorEnd ?? o.color ?? 0xffffff);
    const a0 = o.alpha ?? 1;
    const a1 = o.alphaEnd ?? 0;
    const tile = TILE[o.tile || 'glow'];
    for (let k = 0; k < n; k++) {
      if (this.count >= this.max) return;
      const i = this.count++;
      const pos = typeof o.pos === 'function' ? o.pos(k) : o.pos;
      const vel = typeof o.vel === 'function' ? o.vel(k) : o.vel || [0, 0, 0];
      const px = pos.x ?? pos[0];
      const py = pos.y ?? pos[1];
      const pz = pos.z ?? pos[2];
      this.p[i * 3] = px;
      this.p[i * 3 + 1] = py;
      this.p[i * 3 + 2] = pz;
      this.v[i * 3] = vel.x ?? vel[0];
      this.v[i * 3 + 1] = vel.y ?? vel[1];
      this.v[i * 3 + 2] = vel.z ?? vel[2];
      const life = rng(o.life ?? 1);
      this.life[i] = life;
      this.maxLife[i] = life;
      const s0 = rng(o.size ?? 0.2);
      this.size0[i] = s0;
      this.size1[i] = o.sizeEnd !== undefined ? rng(o.sizeEnd) : s0;
      const jitter = o.colorJitter || 0;
      const j = 1 + (Math.random() - 0.5) * jitter;
      this.c0.set([ca.r * j, ca.g * j, ca.b * j, a0], i * 4);
      this.c1.set([cb.r * j, cb.g * j, cb.b * j, a1], i * 4);
      this.rot[i] = Math.random() * Math.PI * 2;
      this.spin[i] = rng(o.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1);
      this.drag[i] = o.drag ?? 0;
      this.grav[i] = o.gravity ?? 0;
      this.tile[i] = tile;
      this.stretch[i] = o.stretch ?? 0;
      this.floor[i] = o.floor ?? -999;
    }
  }

  update(dt) {
    let n = this.count;
    const p = this.p;
    const v = this.v;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= d;
      v[i * 3 + 1] = v[i * 3 + 1] * d - this.grav[i] * dt;
      v[i * 3 + 2] *= d;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < this.floor[i]) {
        p[i * 3 + 1] = this.floor[i];
        v[i * 3 + 1] *= -0.3;
        v[i * 3] *= 0.6;
        v[i * 3 + 2] *= 0.6;
      }
      this.rot[i] += this.spin[i] * dt;
    }
    this.count = n;
    // 写入 GPU 属性
    const ap = this.aPos.array;
    const av = this.aVel.array;
    const as = this.aSize.array;
    const ac = this.aColor.array;
    const ar = this.aRot.array;
    const at = this.aTile.array;
    const ast = this.aStretch.array;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      ap[i * 3] = p[i * 3];
      ap[i * 3 + 1] = p[i * 3 + 1];
      ap[i * 3 + 2] = p[i * 3 + 2];
      av[i * 3] = v[i * 3];
      av[i * 3 + 1] = v[i * 3 + 1];
      av[i * 3 + 2] = v[i * 3 + 2];
      as[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      for (let k = 0; k < 4; k++) ac[i * 4 + k] = this.c0[i * 4 + k] + (this.c1[i * 4 + k] - this.c0[i * 4 + k]) * t;
      // 淡入
      if (t < 0.08) ac[i * 4 + 3] *= t / 0.08;
      ar[i] = this.rot[i];
      at[i] = this.tile[i];
      ast[i] = this.stretch[i];
    }
    this.geo.instanceCount = n;
    for (const a of [this.aPos, this.aVel, this.aSize, this.aColor, this.aRot, this.aTile, this.aStretch]) {
      a.needsUpdate = true;
      a.clearUpdateRanges?.();
      a.addUpdateRange?.(0, n * a.itemSize);
    }
  }

  copy(from, to) {
    const cp3 = (arr) => {
      arr[to * 3] = arr[from * 3];
      arr[to * 3 + 1] = arr[from * 3 + 1];
      arr[to * 3 + 2] = arr[from * 3 + 2];
    };
    cp3(this.p);
    cp3(this.v);
    for (const arr of [this.life, this.maxLife, this.size0, this.size1, this.rot, this.spin, this.drag, this.grav, this.tile, this.stretch, this.floor]) arr[to] = arr[from];
    for (let k = 0; k < 4; k++) {
      this.c0[to * 4 + k] = this.c0[from * 4 + k];
      this.c1[to * 4 + k] = this.c1[from * 4 + k];
    }
  }

  clear() {
    this.count = 0;
    this.geo.instanceCount = 0;
  }
}

function rng(v) {
  return Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v;
}

// 随机方向工具
export function randDir(spreadY = 1) {
  const a = Math.random() * Math.PI * 2;
  const y = Math.random() * spreadY;
  const r = Math.sqrt(1 - y * y);
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

export { rng };
