// 电影镜头通用工具：召唤 / 崩解 / 取景 / 棋子化形
import * as THREE from 'three';
import { Ease, rand } from '../../core/anim.js';
import { TEAM } from '../team.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = V(0, 1, 0);

export function yawOf(dir) {
  return Math.atan2(dir.x, dir.z);
}

// 移动方向信息：dir、侧向（朝向当前镜头一侧）、距离
export function moveFrame(fx, rec) {
  const A = fx.sq(rec.from);
  const B = fx.sq(rec.to);
  const d = B.clone().sub(A);
  const dist = d.length();
  const dir = d.normalize();
  let side = V(dir.z, 0, -dir.x);
  const cam = fx.stage.camera.position;
  if (side.dot(cam.clone().sub(A).setY(0)) < 0) side.negate();
  return { A, B, dir, side, dist, mid: A.clone().lerp(B, 0.5), yaw: yawOf(dir), team: rec.color };
}

// 让模型随帧更新（uTime 等），返回停止函数
export function track(fx, unit, extra) {
  const p = fx.anim.loop((dt) => {
    unit.update?.(dt, fx.stage.time);
    extra?.(dt);
  });
  return () => p.cancel();
}

// 召唤：从地面升起、自下而上显形，伴随金色光尘
export async function summon(fx, unit, pos, yaw, { dur = 0.8, rise = 0.25, sound = true } = {}) {
  unit.root.position.copy(pos);
  unit.root.position.y = pos.y - rise;
  unit.root.rotation.y = yaw;
  unit.dissolve = 1.2;
  fx.group.add(unit.root);
  unit.update?.(0, fx.stage.time);
  if (sound) fx.audio.play('summon');
  const team = TEAM[unit.team ?? 0];
  fx.sparks.emit({
    count: 40,
    pos: () => [pos.x + rand(-0.5, 0.5), pos.y + rand(0, 0.2), pos.z + rand(-0.5, 0.5)],
    vel: () => [rand(-0.2, 0.2), rand(0.8, 2.2), rand(-0.2, 0.2)],
    life: [0.6, 1.2],
    size: [0.03, 0.07],
    color: team.accent,
    colorEnd: team.glow,
    drag: 1,
    tile: 'dot',
  });
  fx.shockwave(pos, team.glow, 1.8, 0.7);
  await fx.anim.tween(dur, (t) => {
    unit.dissolve = 1.2 - t * 1.45;
    unit.root.position.y = pos.y - rise * (1 - t);
  }, Ease.outCubic);
  unit.dissolve = -0.3;
}

// 崩解：陶俑碎成尘土
export async function crumble(fx, unit, { dur = 0.8 } = {}) {
  const p = unit.root.getWorldPosition(V());
  fx.smoke.emit({
    count: 26,
    pos: () => [p.x + rand(-0.4, 0.4), p.y + rand(0.1, 1.0), p.z + rand(-0.4, 0.4)],
    vel: () => [rand(-0.3, 0.3), rand(-0.2, 0.3), rand(-0.3, 0.3)],
    life: [0.9, 1.6],
    size: [0.2, 0.35],
    sizeEnd: [0.6, 1.0],
    color: 0xb08868,
    alpha: 0.5,
    drag: 1.5,
    tile: 'smoke',
    spin: [0.3, 1],
  });
  fx.debris.burst(p.clone().setY(p.y + 0.4), { count: 14, speed: 1.2, up: 1.2, size: [0.03, 0.07], colors: [0xb87650, 0x9a6040, 0x7a4c38] });
  await fx.anim.tween(dur, (t) => {
    unit.dissolve = -0.3 + t * 1.55;
  }, Ease.inQuad);
  unit.dispose();
}

// 棋子化形：收缩成光
export async function absorbPiece(fx, g, color, dur = 0.35) {
  const p = g.position.clone();
  const team = TEAM[color];
  fx.sparks.emit({ count: 1, pos: [p.x, 0.3, p.z], life: 0.5, size: 1.4, sizeEnd: 0.2, color: team.accent, alpha: 1, tile: 'glow' });
  await fx.anim.tween(dur, (t) => {
    g.scale.setScalar(1 - t * 0.999);
    g.position.y = t * 0.4;
  }, Ease.inBack);
  g.visible = false;
}

// 棋子在目标处显形
export async function emergePiece(fx, g, at, color, dur = 0.45) {
  const team = TEAM[color];
  g.position.set(at.x, 0.5, at.z);
  g.rotation.set(0, 0, 0);
  g.visible = true;
  g.scale.setScalar(0.001);
  fx.sparks.emit({ count: 1, pos: [at.x, 0.3, at.z], life: 0.6, size: 0.4, sizeEnd: 2.0, color: team.accent, alpha: 0.9, tile: 'glow' });
  fx.sparks.emit({
    count: 24,
    pos: [at.x, 0.2, at.z],
    vel: () => {
      const a = Math.random() * Math.PI * 2;
      return [Math.cos(a) * 1.5, rand(0.5, 2), Math.sin(a) * 1.5];
    },
    life: [0.4, 0.8],
    size: [0.03, 0.05],
    color: team.accent,
    colorEnd: team.glow,
    gravity: 3,
    tile: 'dot',
  });
  await fx.anim.tween(dur, (t) => {
    g.scale.setScalar(Math.max(0.001, t));
    g.position.y = 0.5 * (1 - t);
  }, Ease.outBack);
  g.scale.setScalar(1);
  g.position.y = 0;
  fx.landing(-1, color, 1.2, at);
}

// 焦痕贴花
export function scorch(fx, pos, size = 1.6, life = 6, color = 0x000000) {
  if (!fx.scorchTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`;
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 40;
      ctx.beginPath();
      ctx.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    fx.scorchTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: fx.scorchTex, transparent: true, depthWrite: false, color, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * 6;
  m.position.set(pos.x, 0.006, pos.z);
  m.renderOrder = 4;
  fx.group.add(m);
  fx.anim.wait(life).then(() =>
    fx.anim.tween(1.5, (t) => (m.material.opacity = 0.85 * (1 - t)), Ease.linear).then(() => {
      fx.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }),
  );
  return m;
}

// 爆炸：火球 + 浓烟 + 火星
export function explosion(fx, p, { size = 1, color = 0 } = {}) {
  const team = TEAM[color];
  fx.sparks.emit({ count: 1, pos: [p.x, p.y + 0.3, p.z], life: 0.35, size: 1.8 * size, sizeEnd: 3.2 * size, color: 0xffe0a0, alpha: 0.9, tile: 'glow' });
  fx.sparks.emit({
    count: Math.round(40 * size),
    pos: () => [p.x + rand(-0.2, 0.2), p.y + rand(0.05, 0.4), p.z + rand(-0.2, 0.2)],
    vel: () => {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.6, 2.4) * size;
      return [Math.cos(a) * s, rand(0.8, 3) * size, Math.sin(a) * s];
    },
    life: [0.35, 0.8],
    size: [0.35, 0.6],
    sizeEnd: [0.7, 1.1],
    color: 0xffc060,
    colorEnd: 0xc02808,
    alpha: 1,
    drag: 2.5,
    tile: 'flame',
    spin: [1, 3],
  });
  fx.sparks.emit({
    count: Math.round(70 * size),
    pos: [p.x, p.y + 0.2, p.z],
    vel: () => {
      const a = Math.random() * Math.PI * 2;
      const s = rand(3, 9) * size;
      return [Math.cos(a) * s, rand(2, 7) * size, Math.sin(a) * s];
    },
    life: [0.5, 1.2],
    size: [0.025, 0.05],
    color: 0xffe0a0,
    colorEnd: team.glow,
    gravity: 9,
    drag: 1.2,
    tile: 'dot',
    stretch: 0.06,
    floor: 0.02,
  });
  fx.smoke.emit({
    count: Math.round(34 * size),
    pos: () => [p.x + rand(-0.3, 0.3), p.y + rand(0.1, 0.5), p.z + rand(-0.3, 0.3)],
    vel: () => {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1.6) * size;
      return [Math.cos(a) * s, rand(0.6, 2.2) * size, Math.sin(a) * s];
    },
    life: [1.4, 2.6],
    size: [0.4, 0.7],
    sizeEnd: [1.4, 2.2],
    color: 0x2a2220,
    colorEnd: 0x6a6058,
    alpha: 0.75,
    drag: 1.6,
    tile: 'smoke',
    spin: [0.2, 0.8],
  });
  fx.shockwave(p, 0xffb060, 3.6 * size, 0.6);
  fx.shockwave(p, team.glow, 2.2 * size, 0.9);
  fx.lightFlash(p, 0xffa040, 14 * size);
  fx.stage.flash(0.18 * size, 0xffd8a0);
  fx.stage.shake(0.3 * size, 4);
}

// 附近棋子受震轻跳
export function jolt(fx, center, radius = 2, strength = 0.18) {
  for (const g of fx.pieces.meshes.values()) {
    if (!g.visible || g.userData.animating) continue;
    const d = g.position.distanceTo(center);
    if (d > radius || d < 0.1) continue;
    const k = (1 - d / radius) * strength;
    const rx = rand(-0.3, 0.3) * k * 3;
    const rz = rand(-0.3, 0.3) * k * 3;
    fx.anim.tween(0.45, (t) => {
      const s = Math.sin(t * Math.PI);
      g.position.y = s * k;
      g.rotation.x = s * rx;
      g.rotation.z = s * rz;
    }, Ease.outQuad).then(() => {
      g.position.y = 0;
      g.rotation.set(0, 0, 0);
    });
  }
}

// 尘土拖尾（涉水时溅起水花）
export function dustTrail(fx, p, dir, strength = 1) {
  if (Math.abs(p.z) < 0.7) {
    fx.river.ripple(p.x, p.z, 0.7 * strength);
    fx.smoke.emit({
      count: Math.round(4 * strength),
      pos: () => [p.x + rand(-0.2, 0.2), -0.06, p.z + rand(-0.2, 0.2)],
      vel: () => [rand(-0.8, 0.8), rand(1.2, 2.4), rand(-0.8, 0.8)],
      life: [0.4, 0.7],
      size: [0.06, 0.12],
      sizeEnd: [0.2, 0.3],
      color: 0xeaf6f4,
      alpha: 0.7,
      gravity: 6,
      tile: 'smoke',
    });
    return;
  }
  fx.smoke.emit({
    count: Math.round(3 * strength),
    pos: () => [p.x + rand(-0.2, 0.2), 0.05, p.z + rand(-0.2, 0.2)],
    vel: () => [-dir.x * rand(0.3, 1) + rand(-0.3, 0.3), rand(0.2, 0.7), -dir.z * rand(0.3, 1) + rand(-0.3, 0.3)],
    life: [0.8, 1.4],
    size: [0.2, 0.35],
    sizeEnd: [0.7, 1.2],
    color: 0xc8a888,
    alpha: 0.4,
    drag: 2,
    tile: 'smoke',
    spin: [0.2, 1],
  });
}

// 挥砍光弧
export function slashArc(fx, center, yaw, color, { radius = 0.9, tilt = 0.4, dur = 0.35, width = 0.35 } = {}) {
  const geo = new THREE.RingGeometry(radius - width, radius, 40, 1, -0.2, Math.PI * 0.8);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 8;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 8);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  // 按角度映射 UV
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    uv.setXY(i, (a + 0.2) / (Math.PI * 0.8), 0.5);
  }
  const m = new THREE.Mesh(geo, mat);
  const holder = new THREE.Group();
  holder.position.copy(center);
  holder.rotation.set(0, yaw + Math.PI / 2, 0);
  m.rotation.set(tilt, 0, 0);
  holder.add(m);
  holder.renderOrder = 30;
  fx.group.add(holder);
  fx.anim.tween(dur, (t) => {
    m.rotation.z = -1.4 + t * 2.2;
    mat.opacity = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
    const s = 0.8 + t * 0.4;
    m.scale.set(s, s, s);
  }, Ease.outCubic).then(() => {
    fx.group.remove(holder);
    geo.dispose();
    mat.dispose();
    tex.dispose();
  });
}

export { Ease, rand, TEAM };
