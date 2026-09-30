// 程序化模型：兵马俑步卒、陶马、骑兵、驷马战车、青铜火炮、战象、小舟、天子剑
import * as THREE from 'three';
import { spiritUniforms, unitPalette, spiritMaterial } from './materials.js';
import { TEAM } from './team.js';
import { shape } from './shapes.js';

// 鞍鞯
function roundedSaddle() {
  return cached('saddle', () => {
    const g = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 14, 1, true, -Math.PI / 2 - 0.9, Math.PI + 1.8);
    g.rotateX(Math.PI / 2);
    g.rotateZ(Math.PI);
    return g;
  });
}

// ---------- 几何缓存 ----------
const geoCache = new Map();
function cached(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}
const box = (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 10, open = false) => cached(`c${rt},${rb},${h},${s},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open));
const sph = (r, ws = 12, hs = 9) => cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cone = (r, h, s = 10) => cached(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r, t, rs = 6, ts = 20, arc = Math.PI * 2) => cached(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));

function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// 可溶解模型的基类
export class Unit {
  constructor(team, height = 1.5) {
    this.team = team;
    this.root = new THREE.Group();
    this.u = spiritUniforms(TEAM[team].glow);
    this.u.uHeight.value = height;
    this.mats = unitPalette(team, this.u);
  }

  set dissolve(v) {
    this.u.uDissolve.value = v;
  }

  get dissolve() {
    return this.u.uDissolve.value;
  }

  update(dt, t) {
    this.u.uTime.value = t;
    this.u.uBaseY.value = this.root.position.y - 0.05;
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

// ================= 步卒 =================
export class Soldier extends Unit {
  // weapon: spear | sword | bow | halberd | none
  constructor(team, { weapon = 'spear', shield = false, officer = false, cape = false } = {}) {
    super(team, 1.1);
    const M = this.mats;
    const r = this.root;
    this.weaponType = weapon;
    this.hips = joint(r, 0, 0.5, 0);
    part(this.hips, shape('manSkirt'), M.cloth, 0, 0, 0);
    this.chest = joint(this.hips, 0, 0, 0);
    part(this.chest, shape('manTorso'), M.armor, 0, 0, 0);
    part(this.chest, torus(0.118, 0.018, 6, 20), M.trim, 0, 0.035, 0, Math.PI / 2, 0, 0, 1, 0.8, 1);
    part(this.chest, box(0.04, 0.2, 0.02), M.trim, 0, 0.17, 0.1);
    // 头
    this.neck = joint(this.chest, 0, 0.36, 0);
    this.head = joint(this.neck, 0, 0, 0);
    part(this.head, shape('manHead'), M.skin, 0, 0, 0);
    if (officer) {
      // 长冠
      part(this.head, box(0.05, 0.11, 0.11), M.dark, 0, 0.16, -0.02, -0.35, 0, 0);
      part(this.head, torus(0.066, 0.01, 5, 18), M.dark, 0, 0.1, 0, Math.PI / 2 - 0.15, 0, 0);
    } else {
      // 头巾 + 缨
      part(this.head, torus(0.066, 0.014, 5, 18), M.cloth, 0, 0.1, -0.005, Math.PI / 2 - 0.1, 0, 0);
      part(this.head, cone(0.03, 0.12, 8), M.plume, 0.03, 0.2, -0.03, 0.2, 0, -0.25);
    }
    // 手臂
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = joint(this.chest, sx * 0.175, 0.275, 0);
      part(sh, shape('manUpperArm'), M.cloth, 0, 0, 0);
      const el = joint(sh, 0, -0.165, 0);
      part(el, shape('manForearm'), M.skin, 0, 0, 0);
      const hand = joint(el, 0, -0.165, 0.008);
      this.arms.push({ sh, el, hand });
    }
    // 腿
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hp = joint(this.hips, sx * 0.075, -0.04, 0);
      part(hp, shape('manThigh'), M.cloth, 0, 0, 0);
      const kn = joint(hp, 0, -0.21, 0);
      part(kn, shape('manShin'), M.armor, 0, 0, 0);
      const ft = joint(kn, 0, -0.21, 0);
      this.legs.push({ hp, kn, ft });
    }
    if (cape) {
      const c = part(this.chest, box(0.3, 0.46, 0.012), M.cloth, 0, 0.06, -0.11, 0.12, 0, 0);
      this.cape = c;
    }
    // 武器
    const hand = this.arms[1].hand;
    this.weapon = joint(hand, 0, 0, 0);
    if (weapon === 'spear' || weapon === 'halberd') {
      part(this.weapon, cyl(0.012, 0.012, 1.35, 6), M.wood, 0, 0.35, 0);
      part(this.weapon, cone(0.028, 0.14, 6), M.steel, 0, 1.08, 0);
      part(this.weapon, cone(0.035, 0.07, 8), M.plume, 0, 0.98, 0, Math.PI, 0, 0);
      if (weapon === 'halberd') part(this.weapon, box(0.12, 0.03, 0.01), M.steel, 0.06, 0.95, 0);
      this.weapon.rotation.x = Math.PI / 2 - 0.35;
    } else if (weapon === 'sword') {
      part(this.weapon, box(0.03, 0.55, 0.008), M.steel, 0, 0.32, 0);
      part(this.weapon, box(0.1, 0.02, 0.03), M.trim, 0, 0.05, 0);
      part(this.weapon, cyl(0.014, 0.014, 0.1, 6), M.dark, 0, -0.01, 0);
      this.weapon.rotation.x = Math.PI / 2;
    } else if (weapon === 'bow') {
      const bowHand = this.arms[0].hand;
      this.bow = joint(bowHand, 0, 0, 0);
      part(this.bow, torus(0.3, 0.012, 5, 16, Math.PI * 0.8), M.wood, 0, 0, 0.05, 0, Math.PI / 2, Math.PI * 0.6);
      this.weapon.visible = false;
    }
    if (shield) {
      const sh = joint(this.arms[0].el, 0.02, -0.1, 0.06);
      part(sh, box(0.26, 0.36, 0.025), M.wood, 0, 0, 0);
      part(sh, box(0.2, 0.3, 0.012), M.cloth, 0, 0, 0.018);
      part(sh, sph(0.035, 8, 6), M.trim, 0, 0, 0.025);
      this.shield = sh;
    }
    this.setIdle();
  }

  setIdle() {
    const [L, R] = this.arms;
    L.sh.rotation.set(0.1, 0, 0.15);
    L.el.rotation.set(-0.6, 0, 0);
    R.sh.rotation.set(-0.2, 0, -0.1);
    R.el.rotation.set(-1.1, 0, 0);
    for (const l of this.legs) {
      l.hp.rotation.set(0, 0, 0);
      l.kn.rotation.set(0, 0, 0);
    }
  }

  // 行进步伐
  walk(phase, amp = 0.5) {
    const s = Math.sin(phase);
    const [L, R] = this.legs;
    L.hp.rotation.x = s * amp;
    R.hp.rotation.x = -s * amp;
    L.kn.rotation.x = Math.max(0, -Math.cos(phase)) * amp * 1.3;
    R.kn.rotation.x = Math.max(0, Math.cos(phase)) * amp * 1.3;
    this.hips.position.y = 0.5 + Math.abs(Math.cos(phase)) * 0.02;
    this.arms[0].sh.rotation.x = -s * amp * 0.5 + 0.1;
    this.chest.rotation.y = s * 0.06;
  }

  // 让长矛保持给定俯仰角（相对身体），抵消手臂旋转
  aimSpear(pitch = Math.PI / 2 - 0.05) {
    const R = this.arms[1];
    this.weapon.rotation.x = pitch - (R.sh.rotation.x + R.el.rotation.x);
  }

  // 平端长矛
  levelSpear(k = 1) {
    const [L, R] = this.arms;
    R.sh.rotation.set(-0.2 - 0.3 * k, 0, -0.1);
    R.el.rotation.set(-1.1 + 0.1 * k, 0, 0);
    L.sh.rotation.set(0.1 - 0.9 * k, 0, 0.15 + 0.15 * k);
    L.el.rotation.set(-0.6 - 0.3 * k, 0, 0);
    // 竖持（k=0，与 setIdle 一致）到平端（k=1）
    const idle = Math.PI / 2 - 0.35 + (-0.2 - 1.1);
    this.aimSpear(idle + (Math.PI / 2 - 0.05 - idle) * k);
  }

  // 长矛突刺 t: 0..1（先收后刺）
  thrust(t) {
    const [L, R] = this.arms;
    let sh;
    let el;
    if (t < 0.4) {
      const k = t / 0.4;
      sh = -0.5 + 0.25 * k;
      el = -1.0 - 0.45 * k;
    } else if (t < 0.6) {
      const k = (t - 0.4) / 0.2;
      sh = -0.25 - 1.1 * k;
      el = -1.45 + 1.3 * k;
    } else {
      sh = -1.35;
      el = -0.15;
    }
    R.sh.rotation.set(sh, 0, -0.1);
    R.el.rotation.set(el, 0, 0);
    L.sh.rotation.set(sh * 0.9, 0, 0.3);
    L.el.rotation.set(el, 0, 0);
    this.aimSpear();
    const lunge = t > 0.4 ? Math.min(1, (t - 0.4) / 0.2) : 0;
    this.chest.rotation.x = lunge * 0.22;
    this.legs[0].hp.rotation.x = -0.5 * lunge;
    this.legs[1].hp.rotation.x = 0.3 * lunge;
  }

  // 挽弓 t: 0..1（0 拉弓，1 放箭）
  drawBow(t) {
    const [L, R] = this.arms;
    L.sh.rotation.set(-1.45, 0.3, 0.1);
    L.el.rotation.set(0, 0, 0);
    R.sh.rotation.set(-1.4, -0.4 + t * 0.2, 0);
    R.el.rotation.set(-1.8 * (1 - t), 0, 0);
    this.chest.rotation.y = 0.5;
  }

  // 挥刀
  slash(t) {
    const R = this.arms[1];
    const k = t < 0.5 ? t / 0.5 : 1;
    R.sh.rotation.set(-2.6 + k * 2.6, 0, -0.3 + k * 0.4);
    R.el.rotation.x = -0.6 + k * 0.5;
    this.chest.rotation.y = -0.4 + k * 0.8;
  }
}

// ================= 陶马 =================
export class Horse {
  constructor(parent, M, { armored = false } = {}) {
    const r = joint(parent, 0, 0, 0);
    this.root = r;
    this.baseY = 0.8;
    this.body = joint(r, 0, this.baseY, 0);
    part(this.body, shape('horseTorso'), M.horse, 0, 0, 0);
    part(this.body, shape('horseMane'), M.dark, 0, 0, 0);
    if (armored) {
      part(this.body, shape('horseBard'), M.armor, 0, 0, 0);
      part(this.body, box(0.03, 0.2, 0.1), M.trim, 0, 0.4, 0.66, -0.7, 0, 0);
    }
    // 鞍鞯
    part(this.body, roundedSaddle(), M.cloth, 0, 0.2, -0.04);
    // 缰绳
    part(this.body, cyl(0.006, 0.006, 0.5, 4), M.dark, 0, 0.32, 0.46, -1.05, 0, 0);
    this.neck = joint(this.body, 0, 0, 0);
    this.neckBase = 0;
    // 腿
    this.legs = [];
    const legPos = [[0.09, 0.3, 0, 'F'], [-0.09, 0.3, 0.3, 'F'], [0.1, -0.31, 0.55, 'H'], [-0.1, -0.31, 0.85, 'H']];
    for (const [x, z, off, kind] of legPos) {
      const hip = joint(this.body, x, kind === 'F' ? -0.08 : -0.06, z);
      part(hip, shape(kind === 'F' ? 'horseLegUpperF' : 'horseLegUpperH'), M.horse, 0, 0, 0);
      const knee = joint(hip, 0, kind === 'F' ? -0.34 : -0.35, kind === 'F' ? 0.01 : -0.02);
      part(knee, shape('horseLegLower'), M.horse, 0, 0, 0);
      this.legs.push({ hip, knee, off, front: kind === 'F' });
    }
    this.tail = joint(this.body, 0, 0, 0);
  }

  // 奔跑
  gallop(phase, amp = 1) {
    for (const l of this.legs) {
      const p = phase + l.off * Math.PI * 2;
      const s = Math.sin(p);
      l.hip.rotation.x = (l.front ? -s : s) * 0.65 * amp;
      l.knee.rotation.x = (l.front ? Math.max(0, Math.cos(p)) * 1.2 : -Math.max(0, -Math.cos(p)) * 1.0) * amp;
    }
    this.body.rotation.x = Math.sin(phase * 2) * 0.06 * amp;
    this.body.position.y = this.baseY + Math.abs(Math.sin(phase)) * 0.07 * amp;
  }

  stand() {
    for (const l of this.legs) {
      l.hip.rotation.x = 0;
      l.knee.rotation.x = 0;
    }
    this.body.rotation.x = 0;
    this.body.position.y = this.baseY;
  }

  // 人立而起
  rear(t) {
    this.body.rotation.x = -0.75 * t;
    this.body.position.y = this.baseY + 0.25 * t;
    for (const l of this.legs) {
      if (l.front) {
        l.hip.rotation.x = -1.1 * t;
        l.knee.rotation.x = 1.4 * t;
      } else l.hip.rotation.x = 0.5 * t;
    }
  }
}

// ================= 重甲骑兵 =================
export class Cavalry extends Unit {
  constructor(team) {
    super(team, 1.9);
    this.horse = new Horse(this.root, this.mats, { armored: true });
    this.rider = new Soldier(team, { weapon: 'sword', cape: true });
    // 共用材质与 uniforms
    this.rider.u = this.u;
    for (const k of Object.keys(this.rider.mats)) this.rider.mats[k].dispose();
    reassignMaterials(this.rider.root, this.rider.mats, this.mats);
    this.rider.mats = this.mats;
    const seat = joint(this.horse.body, 0, 0.24, -0.04);
    seat.add(this.rider.root);
    this.rider.root.position.set(0, -0.42, 0);
    // 骑姿
    for (const [i, l] of this.rider.legs.entries()) {
      l.hp.rotation.set(-1.2, 0, (i ? 1 : -1) * 0.35);
      l.kn.rotation.x = 1.4;
    }
    this.rider.arms[0].sh.rotation.set(-0.8, 0, 0.2);
    this.rider.arms[0].el.rotation.x = -0.8;
    // 大刀（加长）
    this.rider.weapon.scale.set(1.4, 1.5, 1.4);
    this.rider.weapon.rotation.x = 0.3;
    this.rider.arms[1].sh.rotation.set(-2.2, 0, -0.3);
  }
}

function reassignMaterials(root, from, to) {
  const map = new Map();
  for (const k of Object.keys(from)) map.set(from[k], to[k]);
  root.traverse((o) => {
    if (o.isMesh && map.has(o.material)) o.material = map.get(o.material);
  });
}

// ================= 驷马战车 =================
export class Chariot extends Unit {
  constructor(team) {
    super(team, 1.9);
    const M = this.mats;
    const r = this.root;
    // 车厢
    this.car = joint(r, 0, 0.42, -0.35);
    part(this.car, box(0.62, 0.05, 0.5), M.wood, 0, 0, 0);
    for (const [x, z, w, d] of [[0, 0.23, 0.62, 0.03], [0, -0.23, 0.62, 0.03], [0.3, 0, 0.03, 0.5], [-0.3, 0, 0.03, 0.5]]) {
      part(this.car, box(w, 0.26, d), M.wood, x, 0.14, z);
      part(this.car, box(w + 0.01, 0.03, d + 0.01), M.trim, x, 0.28, z);
    }
    // 伞盖
    part(this.car, cyl(0.012, 0.012, 0.8, 5), M.wood, 0, 0.45, 0.05);
    part(this.car, cone(0.42, 0.14, 12), M.cloth, 0, 0.88, 0.05);
    // 车轮
    this.wheels = [];
    for (const sx of [-1, 1]) {
      const w = joint(r, sx * 0.4, 0.38, -0.35);
      w.rotation.z = Math.PI / 2;
      const spin = joint(w, 0, 0, 0);
      part(spin, torus(0.36, 0.025, 6, 22), M.wood, 0, 0, 0, Math.PI / 2, 0, 0);
      part(spin, torus(0.37, 0.012, 4, 22), M.trim, 0, 0, 0, Math.PI / 2, 0, 0);
      for (let k = 0; k < 9; k++) part(spin, cyl(0.009, 0.009, 0.7, 4), M.wood, 0, 0, 0, 0, (k / 9) * Math.PI, Math.PI / 2);
      part(spin, cyl(0.06, 0.06, 0.12, 8), M.trim, 0, 0, 0);
      this.wheels.push(spin);
    }
    part(r, cyl(0.02, 0.02, 0.9, 6), M.wood, 0, 0.38, -0.35, 0, 0, Math.PI / 2);
    // 辕
    part(r, cyl(0.022, 0.022, 1.2, 6), M.wood, 0, 0.5, 0.3, Math.PI / 2 - 0.08, 0, 0);
    part(r, cyl(0.02, 0.02, 0.9, 6), M.wood, 0, 0.56, 0.86, 0, 0, Math.PI / 2);
    // 四马
    this.horses = [];
    for (const x of [-0.39, -0.13, 0.13, 0.39]) {
      const hg = joint(r, x, 0, 0.72);
      const h = new Horse(hg, M, { armored: false });
      h.root.scale.setScalar(0.72);
      h.phaseOff = Math.random() * 0.6;
      this.horses.push(h);
    }
    // 车上将士
    this.driver = new Soldier(team, { weapon: 'none' });
    this.warrior = new Soldier(team, { weapon: 'halberd' });
    for (const s of [this.driver, this.warrior]) {
      for (const k of Object.keys(s.mats)) s.mats[k].dispose();
      reassignMaterials(s.root, s.mats, M);
      s.mats = M;
      s.root.scale.setScalar(0.62);
      this.car.add(s.root);
    }
    this.driver.root.position.set(0.12, 0.02, 0.1);
    this.warrior.root.position.set(-0.14, 0.02, -0.08);
    this.driver.arms[0].sh.rotation.set(-1.1, 0, 0);
    this.driver.arms[1].sh.rotation.set(-1.1, 0, 0);
    this.warrior.arms[1].sh.rotation.set(-1.4, 0, -0.2);
    // 战旗
    const pole = joint(this.car, -0.26, 0.1, -0.2);
    part(pole, cyl(0.01, 0.01, 1.3, 5), M.wood, 0, 0.65, 0);
    this.flag = makeFlag(M.flag, TEAM[team].name, team);
    this.flag.position.set(0, 1.08, 0);
    pole.add(this.flag);
    this.mats.flagCopy = this.flag.material;
  }

  run(phase, speed = 1) {
    for (const h of this.horses) h.gallop(phase + h.phaseOff, 1);
    for (const w of this.wheels) w.rotation.y = -phase * 0.9 * speed;
    this.car.position.y = 0.42 + Math.abs(Math.sin(phase * 2)) * 0.02;
  }
}

// 旗帜（带字）
const flagTex = new Map();
export function makeFlag(mat, char, team) {
  const key = char + team;
  if (!flagTex.has(key)) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 192;
    const ctx = c.getContext('2d');
    ctx.fillStyle = team === 0 ? '#b8231a' : '#141b26';
    ctx.fillRect(0, 0, 256, 192);
    ctx.strokeStyle = team === 0 ? '#f0c060' : '#9fb4d0';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 236, 172);
    ctx.fillStyle = team === 0 ? '#ffe2a0' : '#d8e6f5';
    ctx.font = '130px "MaShan", "WenKai", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, 128, 104);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    flagTex.set(key, t);
  }
  const geo = new THREE.PlaneGeometry(0.5, 0.38, 10, 4);
  geo.translate(0.25, 0, 0);
  const m = mat.clone();
  m.map = flagTex.get(key);
  m.color.set('#ffffff');
  m.onBeforeCompile = mat.onBeforeCompile;
  m.customProgramCacheKey = mat.customProgramCacheKey;
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.userData.wave = (t) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, Math.sin(x * 9 - t * 9) * 0.04 * x * 2);
    }
    p.needsUpdate = true;
  };
  return mesh;
}

// ================= 青铜火炮 =================
export class Cannon extends Unit {
  constructor(team) {
    super(team, 1.2);
    const M = this.mats;
    const r = this.root;
    // 炮架
    for (const sx of [-1, 1]) part(r, box(0.06, 0.2, 0.9), M.wood, sx * 0.17, 0.3, -0.05);
    part(r, box(0.4, 0.06, 0.7), M.wood, 0, 0.22, -0.05);
    for (const sx of [-1, 1]) {
      const w = joint(r, sx * 0.26, 0.22, 0.12);
      w.rotation.z = Math.PI / 2;
      part(w, torus(0.2, 0.025, 6, 18), M.wood, 0, 0, 0, Math.PI / 2, 0, 0);
      for (let k = 0; k < 6; k++) part(w, cyl(0.012, 0.012, 0.38, 4), M.wood, 0, 0, 0, 0, (k / 6) * Math.PI, Math.PI / 2);
      part(w, cyl(0.05, 0.05, 0.08, 8), M.bronze, 0, 0, 0);
    }
    part(r, box(0.3, 0.05, 0.3), M.wood, 0, 0.05, -0.55, 0.3, 0, 0);
    // 炮管（车削）
    this.barrel = joint(r, 0, 0.46, 0);
    const prof = [[0, -0.52], [0.06, -0.55], [0.1, -0.5], [0.13, -0.45], [0.14, -0.38], [0.155, -0.36], [0.155, -0.33], [0.13, -0.31],
      [0.125, -0.1], [0.14, -0.08], [0.14, -0.05], [0.12, -0.03], [0.11, 0.25], [0.125, 0.27], [0.125, 0.3], [0.1, 0.32], [0.095, 0.5],
      [0.12, 0.53], [0.125, 0.58], [0.07, 0.6], [0.06, 0.4]];
    const bGeo = cached('barrel', () => {
      const g = new THREE.LatheGeometry(prof.map(([rr, z]) => new THREE.Vector2(rr, z)), 20);
      g.rotateX(Math.PI / 2);
      return g;
    });
    part(this.barrel, bGeo, M.bronze, 0, 0, 0);
    part(this.barrel, cyl(0.035, 0.035, 0.44, 8), M.bronze, 0, 0, -0.05, 0, 0, Math.PI / 2);
    part(this.barrel, sph(0.05, 8, 6), M.bronze, 0, 0, -0.6);
    this.barrel.rotation.x = -0.12;
    this.muzzle = joint(this.barrel, 0, 0, 0.62);
    // 炮手
    this.gunner = new Soldier(team, { weapon: 'none', officer: true });
    for (const k of Object.keys(this.gunner.mats)) this.gunner.mats[k].dispose();
    reassignMaterials(this.gunner.root, this.gunner.mats, M);
    this.gunner.mats = M;
    this.gunner.root.scale.setScalar(0.62);
    this.gunner.root.position.set(0.42, 0, -0.45);
    this.gunner.root.rotation.y = -0.5;
    r.add(this.gunner.root);
    const torch = joint(this.gunner.arms[1].hand, 0, 0, 0);
    part(torch, cyl(0.012, 0.012, 0.3, 5), M.wood, 0, 0.12, 0);
    this.torchTip = joint(torch, 0, 0.28, 0);
    this.gunner.arms[1].sh.rotation.set(-1.3, 0, 0.2);
  }

  recoil(t) {
    this.barrel.position.z = -Math.sin(Math.min(1, t) * Math.PI) * 0.18;
    this.root.children[0].position.z = -0.05;
  }
}

// ================= 战象 =================
export class Elephant extends Unit {
  constructor(team) {
    super(team, 2.4);
    const M = this.mats;
    const r = this.root;
    const grey = spiritMaterial(this.u, { color: '#8a7a70', roughness: 0.95 });
    const ivory = spiritMaterial(this.u, { color: '#f0e4d0', roughness: 0.4 });
    this.mats.grey = grey;
    this.mats.ivory = ivory;
    this.baseY = 1.08;
    this.body = joint(r, 0, this.baseY, 0);
    part(this.body, shape('eleBody'), grey, 0, 0, 0);
    // 披挂
    const drape = part(this.body, cyl(0.47, 0.5, 0.62, 16, true), M.cloth, 0, -0.02, -0.08, Math.PI / 2, 0, 0, 1, 1, 0.95);
    drape.scale.set(1.02, 1, 0.92);
    part(this.body, torus(0.47, 0.02, 5, 24), M.trim, 0, -0.02, 0.23, 0, 0, 0, 1.02, 0.95, 1);
    part(this.body, torus(0.47, 0.02, 5, 24), M.trim, 0, -0.02, -0.39, 0, 0, 0, 1.02, 0.95, 1);
    // 鞍楼
    this.howdah = joint(this.body, 0, 0.47, -0.08);
    part(this.howdah, box(0.5, 0.06, 0.55), M.wood, 0, 0, 0);
    for (const [x, z, w, d] of [[0, 0.26, 0.5, 0.03], [0, -0.26, 0.5, 0.03], [0.24, 0, 0.03, 0.55], [-0.24, 0, 0.03, 0.55]]) {
      part(this.howdah, box(w, 0.2, d), M.wood, x, 0.1, z);
      part(this.howdah, box(w + 0.01, 0.025, d + 0.01), M.trim, x, 0.21, z);
    }
    for (const [x, z] of [[0.22, 0.24], [-0.22, 0.24], [0.22, -0.24], [-0.22, -0.24]]) part(this.howdah, cyl(0.012, 0.012, 0.5, 4), M.wood, x, 0.3, z);
    part(this.howdah, cone(0.45, 0.22, 4), M.cloth, 0, 0.64, 0, 0, Math.PI / 4, 0);
    // 耳
    this.ears = [];
    for (const sx of [-1, 1]) {
      const ej = joint(this.body, sx * 0.29, 0.16, 0.5);
      part(ej, shape('eleEar'), grey, sx * 0.02, -0.04, -0.12, 0, sx * 0.35, 0);
      this.ears.push(ej);
    }
    // 额甲
    part(this.body, box(0.3, 0.26, 0.04), M.armor, 0, 0.26, 0.8, -0.35, 0, 0);
    part(this.body, sph(0.035, 8, 6), M.trim, 0, 0.3, 0.83);
    // 象牙
    for (const sx of [-1, 1]) {
      const tj = joint(this.body, sx * 0.13, -0.06, 0.8);
      part(tj, cone(0.035, 0.52, 8), ivory, 0, 0.2, 0.1, 1.9, 0, 0);
    }
    // 象鼻
    this.trunk = [];
    let parent = joint(this.body, 0, -0.2, 0.87);
    for (let i = 0; i < 6; i++) {
      const rr = 0.082 - i * 0.01;
      part(parent, cyl(rr * 0.86, rr, 0.15, 10), grey, 0, -0.075, 0);
      part(parent, sph(rr * 0.9, 8, 6), grey, 0, -0.15, 0);
      this.trunk.push(parent);
      parent = joint(parent, 0, -0.15, 0);
    }
    // 腿
    this.legs = [];
    for (const [x, z, off] of [[0.25, 0.32, 0], [-0.25, 0.32, 0.5], [0.25, -0.34, 0.5], [-0.25, -0.34, 0]]) {
      const hip = joint(this.body, x, -0.2, z);
      part(hip, shape('eleLeg'), grey, 0, 0, 0);
      part(hip, torus(0.13, 0.018, 5, 16), M.trim, 0, -0.66, 0, Math.PI / 2, 0, 0);
      this.legs.push({ hip, off });
    }
    // 象背武士
    this.rider = new Soldier(team, { weapon: 'spear' });
    for (const k of Object.keys(this.rider.mats)) this.rider.mats[k].dispose();
    reassignMaterials(this.rider.root, this.rider.mats, M);
    this.rider.mats = M;
    this.rider.root.scale.setScalar(0.6);
    this.rider.root.position.set(0, 0.03, 0);
    this.howdah.add(this.rider.root);
    this.curlTrunk(0.3);
  }

  curlTrunk(k) {
    this.trunk.forEach((j, i) => {
      j.rotation.x = i === 0 ? 0.2 - k * 0.8 : -k * (0.25 + i * 0.05);
    });
  }

  walk(phase) {
    for (const l of this.legs) l.hip.rotation.x = Math.sin(phase + l.off * Math.PI * 2) * 0.3;
    this.body.position.y = this.baseY + Math.abs(Math.sin(phase)) * 0.03;
    this.curlTrunk(0.3 + Math.sin(phase * 0.5) * 0.15);
    this.ears.forEach((e, i) => (e.rotation.y = (i ? -1 : 1) * (0.2 + Math.sin(phase * 0.7) * 0.25)));
  }

  // 人立：以后脚为支点抬起前身
  rear(t) {
    const th = -0.5 * t;
    this.body.rotation.x = th;
    const hy = -0.2;
    const hz = -0.34;
    const y2 = hy * Math.cos(th) - hz * Math.sin(th);
    const z2 = hy * Math.sin(th) + hz * Math.cos(th);
    this.body.position.y = this.baseY + (hy - y2);
    this.body.position.z = hz - z2;
    for (const l of this.legs.slice(2)) l.hip.rotation.x = -th;
    for (const l of this.legs.slice(0, 2)) l.hip.rotation.x = 0.4 * t;
    this.curlTrunk(0.3 - 1.1 * t);
    this.ears.forEach((e, i) => (e.rotation.y = (i ? -1 : 1) * (0.2 + 0.5 * t)));
  }
}

// ================= 小舟 =================
export class Boat {
  constructor() {
    this.root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4426', roughness: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2320', roughness: 0.9, side: THREE.DoubleSide });
    this.mats = [wood, dark];
    const hull = cached('hull', () => {
      const L = 1.7;
      const W = 0.86;
      const D = 0.16;
      const nu = 22;
      const nv = 10;
      const pos = [];
      const idx = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const prof = Math.pow(Math.sin(Math.PI * u), 0.55);
        const lift = Math.pow(Math.abs(u - 0.5) * 2, 3) * 0.22;
        for (let j = 0; j <= nv; j++) {
          const v = j / nv;
          const a = Math.PI * v;
          pos.push((u - 0.5) * L, -Math.sin(a) * D * prof + lift, Math.cos(a) * (W / 2) * prof);
        }
      }
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const a = i * (nv + 1) + j;
          const b = a + nv + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    });
    const hm = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: '#6b4426', roughness: 0.75, side: THREE.DoubleSide }));
    this.mats.push(hm.material);
    hm.castShadow = true;
    this.root.add(hm);
    // 船舷与甲板
    part(this.root, box(1.2, 0.035, 0.04), wood, 0, 0.0, 0.41);
    part(this.root, box(1.2, 0.035, 0.04), wood, 0, 0.0, -0.41);
    part(this.root, box(1.3, 0.02, 0.78), wood, 0, -0.07, 0);
    for (const x of [-0.4, 0, 0.4]) part(this.root, box(0.03, 0.03, 0.8), wood, x, -0.055, 0);
    // 船尾乌篷
    const awn = new THREE.Mesh(cached('awning', () => new THREE.CylinderGeometry(0.34, 0.34, 0.3, 14, 1, true, -Math.PI / 2, Math.PI)), dark);
    awn.rotation.z = Math.PI / 2;
    awn.rotation.y = 0;
    awn.position.set(-0.62, -0.02, 0);
    awn.castShadow = true;
    this.root.add(awn);
    // 船夫
    this.boatman = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: '#c89068', roughness: 0.8 });
    const robe = new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.9 });
    const hat = new THREE.MeshStandardMaterial({ color: '#c8a868', roughness: 0.8 });
    this.mats.push(skin, robe, hat);
    part(this.boatman, cyl(0.07, 0.12, 0.4, 8), robe, 0, 0.2, 0);
    part(this.boatman, sph(0.06, 10, 8), skin, 0, 0.46, 0);
    part(this.boatman, cone(0.16, 0.08, 12), hat, 0, 0.53, 0);
    this.pole = joint(this.boatman, 0.05, 0.32, 0.08);
    part(this.pole, cyl(0.01, 0.01, 1.6, 5), wood, 0, 0, 0);
    this.pole.rotation.z = 0.5;
    this.boatman.position.set(0.72, -0.05, 0.1);
    this.boatman.rotation.y = Math.PI;
    this.boatman.scale.setScalar(0.95);
    this.root.add(this.boatman);
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}

// ================= 天子剑 =================
export class GiantSword extends Unit {
  constructor(team) {
    super(team, 5);
    const M = this.mats;
    const blade = cached('sword', () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.14, 0);
      shape.lineTo(0.14, 0);
      shape.lineTo(0.12, 3.4);
      shape.lineTo(0, 3.8);
      shape.lineTo(-0.12, 3.4);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
      g.translate(0, 0, -0.015);
      return g;
    });
    const steel = spiritMaterial(this.u, { kind: 'bronze', color: '#f0d890', emissive: TEAM[team].accent, emissiveIntensity: 0.25 });
    this.mats.bladeMat = steel;
    this.blade = part(this.root, blade, steel, 0, 0, 0);
    part(this.root, box(0.9, 0.12, 0.16), M.trim, 0, -0.02, 0);
    part(this.root, cyl(0.06, 0.06, 0.7, 8), M.dark, 0, -0.4, 0);
    part(this.root, sph(0.11, 10, 8), M.trim, 0, -0.8, 0);
    part(this.root, torus(0.1, 0.03, 6, 12), M.trim, 0, 0.12, 0, Math.PI / 2, 0, 0);
    this.root.rotation.x = Math.PI; // 剑尖朝下
  }
}

// 在所有网格上启用阴影
export function enableShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
}
