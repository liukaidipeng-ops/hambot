// 有向距离场建模 + Surface Nets 网格化：用平滑融合的胶囊/椭球“雕刻”出有机形体
import * as THREE from 'three';

const v3 = (x, y, z) => [x, y, z];

// ---------- 基本体 ----------
export function sphere(c, r) {
  return (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
}

export function ellipsoid(c, r) {
  // iq 近似
  return (x, y, z) => {
    const px = (x - c[0]) / r[0];
    const py = (y - c[1]) / r[1];
    const pz = (z - c[2]) / r[2];
    const k0 = Math.hypot(px, py, pz);
    const k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  };
}

// 两端半径不同的胶囊（圆锥台）
export function capsule(a, b, ra, rb = ra) {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0];
    const pay = y - a[1];
    const paz = z - a[2];
    let h = (pax * bax + pay * bay + paz * baz) / l2;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = pax - bax * h;
    const dy = pay - bay * h;
    const dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
  };
}

export function roundBox(c, half, r) {
  return (x, y, z) => {
    const qx = Math.abs(x - c[0]) - half[0] + r;
    const qy = Math.abs(y - c[1]) - half[1] + r;
    const qz = Math.abs(z - c[2]) - half[2] + r;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

// 平滑并集
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function union(k, ...fs) {
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
    return d;
  };
}

export function subtract(a, b) {
  return (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
}

// ---------- Surface Nets ----------
// f: 距离函数；bounds: [[minx,miny,minz],[maxx,maxy,maxz]]；res: 最长边分辨率
export function meshSDF(f, bounds, res = 40, uvScale = 3) {
  const [mn, mx] = bounds;
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const step = Math.max(size[0], size[1], size[2]) / res;
  const nx = Math.ceil(size[0] / step) + 3;
  const ny = Math.ceil(size[1] / step) + 3;
  const nz = Math.ceil(size[2] / step) + 3;
  const ox = mn[0] - step;
  const oy = mn[1] - step;
  const oz = mn[2] - step;
  const N = nx * ny * nz;
  const val = new Float32Array(N);
  let p = 0;
  for (let k = 0; k < nz; k++) {
    const z = oz + k * step;
    for (let j = 0; j < ny; j++) {
      const y = oy + j * step;
      for (let i = 0; i < nx; i++) val[p++] = f(ox + i * step, y, z);
    }
  }
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const vIndex = new Int32Array(N).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c];
          const v = val[idx(i + a, j + b, k + d)];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          const v0 = cv[e0];
          const v1 = cv[e1];
          if (v0 < 0 === v1 < 0) continue;
          const t = v0 / (v0 - v1);
          const c0 = corners[e0];
          const c1 = corners[e1];
          sx += c0[0] + (c1[0] - c0[0]) * t;
          sy += c0[1] + (c1[1] - c0[1]) * t;
          sz += c0[2] + (c1[2] - c0[2]) * t;
          n++;
        }
        vIndex[idx(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * step, oy + (j + sy / n) * step, oz + (k + sz / n) * step);
      }
    }
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = val[idx(i, j, k)];
        const in0 = v0 < 0;
        // x 方向边
        if (i < nx - 1 && in0 !== val[idx(i + 1, j, k)] < 0) {
          quad(vIndex[idx(i, j - 1, k - 1)], vIndex[idx(i, j, k - 1)], vIndex[idx(i, j, k)], vIndex[idx(i, j - 1, k)], !in0);
        }
        if (j < ny - 1 && in0 !== val[idx(i, j + 1, k)] < 0) {
          quad(vIndex[idx(i - 1, j, k - 1)], vIndex[idx(i - 1, j, k)], vIndex[idx(i, j, k)], vIndex[idx(i, j, k - 1)], !in0);
        }
        if (k < nz - 1 && in0 !== val[idx(i, j, k + 1)] < 0) {
          quad(vIndex[idx(i - 1, j - 1, k)], vIndex[idx(i, j - 1, k)], vIndex[idx(i, j, k)], vIndex[idx(i - 1, j, k)], !in0);
        }
      }
    }
  }
  // 法线（距离场梯度）+ 盒投影 UV
  const nrm = new Float32Array(pos.length);
  const uv = new Float32Array((pos.length / 3) * 2);
  const e = step * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v];
    const y = pos[v + 1];
    const z = pos[v + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    nrm[v] = gx;
    nrm[v + 1] = gy;
    nrm[v + 2] = gz;
    const ax = Math.abs(gx);
    const ay = Math.abs(gy);
    const az = Math.abs(gz);
    const w = (v / 3) * 2;
    if (ay >= ax && ay >= az) {
      uv[w] = x * uvScale;
      uv[w + 1] = z * uvScale;
    } else if (ax >= az) {
      uv[w] = z * uvScale;
      uv[w + 1] = y * uvScale;
    } else {
      uv[w] = x * uvScale;
      uv[w + 1] = y * uvScale;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(tris);
  g.computeBoundingSphere();
  return g;
}

export { v3 };
