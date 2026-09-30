// 结局人物：西楚霸王项羽、汉王刘邦、乌骓马
import * as THREE from 'three';
import { meshSDF, sphere, ellipsoid, capsule, roundBox, union, subtract } from '../fx/sdf.js';
import { Horse } from '../fx/models.js';
import { getTextures } from '../fx/materials.js';

const cache = new Map();
function g(name, fn) {
  if (!cache.has(name)) cache.set(name, fn());
  return cache.get(name);
}

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (Array.isArray(s)) m.scale.set(...s);
  else m.scale.setScalar(s);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, x = 0, y = 0, z = 0) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

// ---------- 形体 ----------
const SH = {
  torso: () => meshSDF(union(0.06,
    ellipsoid([0, 0.26, 0.01], [0.21, 0.17, 0.14]),
    roundBox([0, 0.18, 0], [0.18, 0.17, 0.12], 0.07),
    capsule([0, 0.0, 0], [0, 0.18, 0], 0.15, 0.17),
    capsule([0, 0.4, 0], [0, 0.48, 0.01], 0.06, 0.055),
  ), [[-0.3, -0.12, -0.2], [0.3, 0.54, 0.22]], 44),
  pauldron: () => meshSDF(subtract(ellipsoid([0, 0, 0], [0.12, 0.09, 0.12]), (x, y) => -(y + 0.02)), [[-0.14, -0.1, -0.14], [0.14, 0.12, 0.14]], 22),
  head: () => meshSDF(union(0.025,
    sphere([0, 0.1, -0.01], 0.092),
    ellipsoid([0, 0.05, 0.025], [0.075, 0.075, 0.075]),
    capsule([0, 0.1, 0.085], [0, 0.065, 0.1], 0.016, 0.02),
    capsule([-0.035, 0.125, 0.075], [0.035, 0.125, 0.075], 0.014, 0.014),
    sphere([0.09, 0.08, 0], 0.022),
    sphere([-0.09, 0.08, 0], 0.022),
  ), [[-0.13, -0.03, -0.12], [0.13, 0.22, 0.14]], 36),
  beardFull: () => meshSDF(union(0.03,
    ellipsoid([0, 0.0, 0.06], [0.07, 0.07, 0.05]),
    capsule([0, 0.0, 0.07], [0, -0.14, 0.08], 0.055, 0.02),
    capsule([-0.06, 0.05, 0.05], [0.06, 0.05, 0.05], 0.02, 0.02),
  ), [[-0.1, -0.2, -0.02], [0.1, 0.1, 0.14]], 28),
  beardLong: () => meshSDF(union(0.03,
    ellipsoid([0, 0.0, 0.06], [0.06, 0.06, 0.045]),
    capsule([0, -0.02, 0.07], [0, -0.26, 0.09], 0.045, 0.012),
    capsule([-0.05, 0.05, 0.06], [-0.01, 0.035, 0.085], 0.012, 0.01),
    capsule([0.05, 0.05, 0.06], [0.01, 0.035, 0.085], 0.012, 0.01),
  ), [[-0.1, -0.3, -0.02], [0.1, 0.1, 0.14]], 28),
  upperArm: () => meshSDF(capsule([0, 0, 0], [0, -0.24, 0], 0.065, 0.052), [[-0.08, -0.31, -0.08], [0.08, 0.08, 0.08]], 20),
  forearm: () => meshSDF(union(0.03, capsule([0, 0, 0], [0, -0.21, 0], 0.05, 0.04), ellipsoid([0, -0.25, 0.01], [0.04, 0.05, 0.03])), [[-0.07, -0.31, -0.06], [0.07, 0.07, 0.07]], 22),
  sleeve: () => meshSDF(subtract(capsule([0, 0, 0], [0, -0.3, 0.02], 0.08, 0.13), (x, y) => -(y + 0.36)), [[-0.15, -0.38, -0.14], [0.15, 0.1, 0.16]], 24),
  thigh: () => meshSDF(capsule([0, 0, 0], [0, -0.33, 0], 0.08, 0.065), [[-0.1, -0.41, -0.1], [0.1, 0.1, 0.1]], 22),
  shin: () => meshSDF(union(0.04, capsule([0, 0, 0], [0, -0.31, 0], 0.062, 0.05), roundBox([0, -0.35, 0.04], [0.05, 0.03, 0.1], 0.02)), [[-0.08, -0.4, -0.08], [0.08, 0.08, 0.16]], 24),
  skirt: () => meshSDF(subtract(capsule([0, 0.05, 0], [0, -0.3, 0], 0.17, 0.25), (x, y) => y + 0.34), [[-0.28, -0.36, -0.28], [0.28, 0.24, 0.28]], 32),
  robe: () => meshSDF(subtract(union(0.1, capsule([0, 0.05, 0], [0, -0.45, 0.02], 0.18, 0.34)), (x, y) => y + 0.52), [[-0.4, -0.55, -0.38], [0.4, 0.26, 0.4]], 36),
  helmet: () => {
    const pts = [[0, 0.2], [0.03, 0.2], [0.05, 0.18], [0.085, 0.14], [0.105, 0.08], [0.112, 0.02], [0.115, -0.01], [0.14, -0.02], [0.14, -0.035], [0.1, -0.03], [0.1, 0.0]];
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  },
  crown: () => new THREE.BoxGeometry(0.07, 0.22, 0.2),
};

// 翎子（雉尾）
function featherGeo(side) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(side * (0.03 + t * 0.25 + t * t * 0.2), 0.2 + Math.sin(t * Math.PI * 0.85) * 0.75, -0.02 - t * 0.55 - t * t * 0.3));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 48, 0.012, 5, false);
  // 末端收细
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = uv.getX(i);
    const c = curve.getPointAt(Math.min(1, t));
    const k = 1 - t * 0.85;
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function featherTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 8;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const band = Math.sin(x * 0.35) > 0.2;
    ctx.fillStyle = band ? '#2a1a10' : '#c89a48';
    ctx.fillRect(x, 0, 1, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 披风（CPU 顶点动画）
class Cape {
  constructor(parent, mat, { w = 0.62, h = 1.2, x = 0, y = 0.44, z = -0.16 } = {}) {
    this.geo = new THREE.PlaneGeometry(w, h, 10, 14);
    this.geo.translate(0, -h / 2, 0);
    this.base = this.geo.attributes.position.array.slice();
    this.h = h;
    this.mesh = mesh(parent, this.geo, mat, x, y, z);
    this.wind = 1;
  }

  update(t) {
    const p = this.geo.attributes.position;
    const b = this.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3];
      const y = b[i * 3 + 1];
      const d = -y / this.h; // 0 顶部 -> 1 底部
      const wave = Math.sin(t * 3.1 - d * 4 + x * 3) * 0.08 + Math.sin(t * 5.3 - d * 7) * 0.03;
      const z = -d * d * (0.25 + 0.25 * this.wind) - wave * d * this.wind;
      p.setXYZ(i, x * (1 + d * 0.35), y + d * d * 0.08 * this.wind, z);
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

export class Hero {
  // kind: 'xiangyu' | 'liubang'
  constructor(kind) {
    this.kind = kind;
    const xy = kind === 'xiangyu';
    const { clayTex } = getTextures();
    const M = {
      armor: new THREE.MeshStandardMaterial({ color: xy ? '#2a2624' : '#3a2a24', roughness: 0.45, metalness: 0.7 }),
      trim: new THREE.MeshStandardMaterial({ color: '#c89a48', roughness: 0.35, metalness: 0.9 }),
      skin: new THREE.MeshStandardMaterial({ color: '#b98464', roughness: 0.7, map: clayTex }),
      cloth: new THREE.MeshStandardMaterial({ color: xy ? '#7a1410' : '#8a2418', roughness: 0.85, side: THREE.DoubleSide }),
      robe: new THREE.MeshStandardMaterial({ color: xy ? '#1c1a1e' : '#6e1c14', roughness: 0.8, side: THREE.DoubleSide }),
      hair: new THREE.MeshStandardMaterial({ color: '#0e0b0a', roughness: 0.9 }),
      steel: new THREE.MeshStandardMaterial({ color: '#d0d6da', roughness: 0.2, metalness: 1 }),
      feather: new THREE.MeshStandardMaterial({ map: featherTexture(), roughness: 0.6 }),
      plume: new THREE.MeshStandardMaterial({ color: '#c01810', roughness: 0.8 }),
      wood: new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.8 }),
    };
    this.M = M;
    const r = new THREE.Group();
    this.root = r;
    this.hips = joint(r, 0, 0.98, 0);
    if (xy) mesh(this.hips, g('skirt', SH.skirt), M.armor, 0, 0, 0);
    else mesh(this.hips, g('robe', SH.robe), M.robe, 0, 0.02, 0);
    this.chest = joint(this.hips, 0, 0.02, 0);
    mesh(this.chest, g('torso', SH.torso), xy ? M.armor : M.robe, 0, 0, 0);
    mesh(this.chest, new THREE.TorusGeometry(0.16, 0.025, 6, 24), M.trim, 0, 0.04, 0, Math.PI / 2, 0, 0, [1, 0.8, 1]);
    if (xy) {
      // 护心镜
      mesh(this.chest, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20), M.trim, 0, 0.28, 0.14, Math.PI / 2, 0, 0);
      for (const sx of [-1, 1]) mesh(this.chest, g('pauldron', SH.pauldron), M.armor, sx * 0.23, 0.38, 0, 0, 0, sx * 0.35);
      for (const sx of [-1, 1]) mesh(this.chest, new THREE.TorusGeometry(0.1, 0.012, 5, 16, Math.PI), M.trim, sx * 0.23, 0.37, 0, 0, Math.PI / 2, sx * 0.35);
    } else {
      // 交领
      mesh(this.chest, new THREE.BoxGeometry(0.05, 0.3, 0.02), M.trim, 0.03, 0.28, 0.13, 0, 0, 0.5);
      mesh(this.chest, new THREE.BoxGeometry(0.05, 0.3, 0.02), M.trim, -0.03, 0.28, 0.13, 0, 0, -0.5);
    }
    // 头
    this.neck = joint(this.chest, 0, 0.48, 0.01);
    this.head = joint(this.neck, 0, 0, 0);
    mesh(this.head, g('head', SH.head), M.skin, 0, 0, 0);
    mesh(this.head, g(xy ? 'beardFull' : 'beardLong', xy ? SH.beardFull : SH.beardLong), M.hair, 0, 0.03, 0);
    if (xy) {
      mesh(this.head, g('helmet', SH.helmet), M.armor, 0, 0.12, -0.01);
      mesh(this.head, new THREE.ConeGeometry(0.012, 0.16, 6), M.trim, 0, 0.4, -0.01);
      mesh(this.head, new THREE.ConeGeometry(0.05, 0.14, 10), M.plume, 0, 0.36, -0.01, Math.PI, 0, 0);
      this.feathers = [];
      for (const sx of [-1, 1]) {
        const fj = joint(this.head, sx * 0.04, 0.22, 0);
        mesh(fj, featherGeo(sx), M.feather, 0, 0, 0);
        this.feathers.push(fj);
      }
    } else {
      // 刘氏冠（竹皮冠）
      mesh(this.head, new THREE.BoxGeometry(0.06, 0.2, 0.2), M.hair, 0, 0.3, -0.02, -0.15, 0, 0);
      mesh(this.head, new THREE.TorusGeometry(0.085, 0.015, 5, 20), M.hair, 0, 0.19, -0.01, Math.PI / 2 - 0.1, 0, 0);
      mesh(this.head, new THREE.CylinderGeometry(0.004, 0.004, 0.28, 4), M.trim, 0, 0.27, 0, 0, 0, Math.PI / 2);
    }
    // 手臂
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = joint(this.chest, sx * 0.25, 0.36, 0);
      if (xy) mesh(sh, g('upperArm', SH.upperArm), M.robe, 0, 0, 0);
      else mesh(sh, g('sleeve', SH.sleeve), M.robe, 0, 0, 0);
      const el = joint(sh, 0, -0.24, 0);
      if (xy) mesh(el, g('forearm', SH.forearm), M.armor, 0, 0, 0);
      else mesh(el, g('forearm', SH.forearm), M.skin, 0, -0.05, 0, 0, 0, 0, 0.85);
      const hand = joint(el, 0, -0.25, 0.01);
      this.arms.push({ sh, el, hand });
    }
    // 腿
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hp = joint(this.hips, sx * 0.1, -0.06, 0);
      mesh(hp, g('thigh', SH.thigh), xy ? M.robe : M.robe, 0, 0, 0);
      const kn = joint(hp, 0, -0.33, 0);
      mesh(kn, g('shin', SH.shin), xy ? M.armor : M.hair, 0, 0, 0);
      this.legs.push({ hp, kn });
    }
    // 披风
    this.cape = xy ? new Cape(this.chest, M.cloth, { w: 0.66, h: 1.3, y: 0.46, z: -0.16 }) : null;
    if (!xy) {
      // 宽袖长袍的下摆随风
      this.sash = new Cape(this.chest, M.cloth, { w: 0.08, h: 0.7, x: 0.12, y: 0.02, z: 0.14 });
    }
    // 兵器
    if (xy) {
      this.sword = joint(this.arms[1].hand, 0, 0, 0);
      mesh(this.sword, new THREE.BoxGeometry(0.045, 0.9, 0.01), M.steel, 0, 0.5, 0);
      mesh(this.sword, new THREE.BoxGeometry(0.16, 0.03, 0.05), M.trim, 0, 0.05, 0);
      mesh(this.sword, new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), M.hair, 0, -0.04, 0);
      this.sword.rotation.x = Math.PI;
    }
    this.pose('stand');
  }

  pose(name) {
    const [L, R] = this.arms;
    if (name === 'stand') {
      L.sh.rotation.set(0.05, 0, 0.12);
      L.el.rotation.set(-0.25, 0, 0);
      R.sh.rotation.set(0.1, 0, -0.15);
      R.el.rotation.set(-0.35, 0, 0);
      for (const l of this.legs) {
        l.hp.rotation.set(0, 0, 0);
        l.kn.rotation.set(0, 0, 0);
      }
      this.legs[0].hp.rotation.z = 0.06;
      this.legs[1].hp.rotation.z = -0.06;
      this.hips.position.y = 0.98;
    } else if (name === 'sit') {
      // 踞鞍而坐
      this.hips.position.y = 0.5;
      this.legs[0].hp.rotation.set(-1.35, 0, 0.35);
      this.legs[1].hp.rotation.set(-1.35, 0, -0.35);
      this.legs[0].kn.rotation.set(1.5, 0, 0);
      this.legs[1].kn.rotation.set(1.5, 0, 0);
      L.sh.rotation.set(-0.6, 0, 0.3);
      L.el.rotation.set(-0.9, 0, 0);
      R.sh.rotation.set(-0.5, 0, -0.3);
      R.el.rotation.set(-1.0, 0, 0);
      this.chest.rotation.x = 0.25;
      this.head.rotation.x = 0.35;
    }
  }

  // 举剑向天 t: 0..1
  raiseSword(t) {
    const R = this.arms[1];
    R.sh.rotation.set(0.1 - 2.9 * t, 0, -0.15 - 0.2 * t);
    R.el.rotation.set(-0.35 + 0.3 * t, 0, 0);
    if (this.sword) this.sword.rotation.x = Math.PI - Math.PI * t;
  }

  update(t, wind = 1) {
    for (const c of [this.cape, this.sash]) {
      if (!c) continue;
      c.wind = wind;
      c.update(t);
    }
    this.chest.position.y = 0.02 + Math.sin(t * 1.4) * 0.006;
    if (this.feathers) this.feathers.forEach((f, i) => {
      f.rotation.z = Math.sin(t * 1.7 + i) * 0.06 * wind;
      f.rotation.x = Math.sin(t * 1.3 + i * 2) * 0.05 * wind;
    });
  }
}

// 乌骓：乌黑骏马
export function blackSteed() {
  const mats = {
    horse: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.45, metalness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.7 }),
    armor: new THREE.MeshStandardMaterial({ color: '#2a2624', roughness: 0.5, metalness: 0.6 }),
    trim: new THREE.MeshStandardMaterial({ color: '#c89a48', roughness: 0.35, metalness: 0.9 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#7a1410', roughness: 0.85, side: THREE.DoubleSide }),
  };
  const holder = new THREE.Group();
  const h = new Horse(holder, mats, { armored: false });
  h.root.scale.setScalar(1.35);
  holder.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root: holder, horse: h };
}
