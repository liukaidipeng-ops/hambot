// 士/仕：弓弩手万箭齐发
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Soldier } from '../models.js';
import {
  V, moveFrame, track, summon, crumble, absorbPiece, emergePiece, jolt, Ease, rand, TEAM,
} from './common.js';

let arrowGeo = null;
function getArrowGeo() {
  if (arrowGeo) return arrowGeo;
  const shaft = new THREE.CylinderGeometry(0.007, 0.007, 0.55, 5);
  const head = new THREE.ConeGeometry(0.02, 0.07, 6);
  head.translate(0, 0.31, 0);
  const f1 = new THREE.BoxGeometry(0.05, 0.1, 0.002);
  f1.translate(0, -0.23, 0);
  const f2 = f1.clone();
  f2.rotateY(Math.PI / 2);
  arrowGeo = mergeGeometries([shaft, head, f1, f2].map((g) => g.toNonIndexed()));
  arrowGeo.rotateX(Math.PI / 2); // 箭头朝 +z
  return arrowGeo;
}

export async function arrowVolley(fx, rec, mover, victim) {
  const { A, B, dir, side, team, yaw } = moveFrame(fx, rec);
  const archers = [];
  const offsets = [[-0.75, -0.35], [-0.38, -0.05], [0, -0.45], [0.38, -0.05], [0.75, -0.35]];
  for (const [s, d] of offsets) {
    const a = new Soldier(team, { weapon: 'bow' });
    a.root.scale.setScalar(0.6);
    a.pos = A.clone().addScaledVector(side, s).addScaledVector(dir, d - 0.2);
    archers.push(a);
  }
  const stops = archers.map((a) => track(fx, a));
  // 镜头：弓手身后仰望
  fx.cameraTo(A.clone().addScaledVector(dir, -2.0).addScaledVector(side, 1.4).add(V(0, 1.0, 0)), A.clone().addScaledVector(dir, 0.8).add(V(0, 0.8, 0)), 0.9, 50);
  fx.audio.play('drum');
  await absorbPiece(fx, mover, team, 0.3);
  await Promise.all(archers.map((a, i) => fx.anim.wait(i * 0.05).then(() => summon(fx, a, a.pos, yaw, { dur: 0.5, rise: 0.15, sound: i === 0 }))));
  // 拉弓
  await fx.anim.tween(0.45, (t) => archers.forEach((a) => {
    a.drawBow(0);
    a.chest.rotation.x = -0.5 * t;
  }), Ease.outQuad);
  // 放箭
  fx.audio.play('arrows', { count: 22, spread: 0.6 });
  archers.forEach((a) => a.drawBow(1));
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6, emissive: TEAM[team].glow, emissiveIntensity: 0.6 });
  const count = 26;
  const mesh = new THREE.InstancedMesh(getArrowGeo(), mat, count);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  fx.group.add(mesh);
  const arrows = [];
  for (let i = 0; i < count; i++) {
    const src = archers[i % archers.length].pos.clone().add(V(rand(-0.1, 0.1), 0.6, rand(-0.1, 0.1)));
    const hitVictim = i < 6;
    const tgt = hitVictim ? B.clone().add(V(rand(-0.22, 0.22), 0.24, rand(-0.22, 0.22))) : B.clone().add(V(rand(-0.9, 0.9), 0.0, rand(-0.9, 0.9)));
    arrows.push({ src, tgt, delay: rand(0, 0.35), peak: rand(2.4, 3.2), dur: rand(0.85, 1.0), hitVictim, stuck: false });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = V(1, 1, 1);
  const zAxis = V(0, 0, 1);
  // 镜头转向目标：箭雨落下
  fx.cameraTo(B.clone().addScaledVector(dir, 1.9).addScaledVector(side, 1.4).add(V(0, 1.3, 0)), B.clone().add(V(0, 0.9, 0)), 0.8, 50, Ease.inOutSine);
  let thunked = false;
  let hitDone = false;
  let elapsed = 0;
  const flight = fx.anim.loop((dt) => {
    elapsed += dt;
    let all = true;
    arrows.forEach((ar, i) => {
      const t = Math.min(1, Math.max(0, (elapsed - ar.delay) / ar.dur));
      if (t < 1) all = false;
      const p = ar.src.clone().lerp(ar.tgt, t);
      p.y += Math.sin(Math.PI * t) * ar.peak;
      const t2 = Math.min(1, t + 0.01);
      const p2 = ar.src.clone().lerp(ar.tgt, t2);
      p2.y += Math.sin(Math.PI * t2) * ar.peak;
      const d = p2.sub(p);
      if (t >= 1 && !ar.stuck) {
        ar.stuck = true;
        ar.dir = ar.lastDir || V(0, -1, 0);
        fx.sparks.emit({ count: 4, pos: [p.x, p.y + 0.02, p.z], vel: () => [rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)], life: 0.3, size: 0.025, color: 0xffe0a0, gravity: 6, tile: 'dot' });
        fx.smoke.emit({ count: 2, pos: [p.x, 0.05, p.z], vel: [0, 0.3, 0], life: 0.6, size: 0.1, sizeEnd: 0.35, color: 0xc8a888, alpha: 0.4, tile: 'smoke' });
      }
      if (!ar.stuck && d.lengthSq() > 1e-8) ar.lastDir = d.normalize();
      const look = ar.stuck ? ar.dir : ar.lastDir || V(0, 1, 0);
      q.setFromUnitVectors(zAxis, look);
      const pos = ar.stuck ? ar.tgt.clone().addScaledVector(look, -0.12) : p;
      if (t <= 0) m4.makeScale(0, 0, 0);
      else m4.compose(pos, q, one);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (!thunked && elapsed > 0.85) {
      thunked = true;
      fx.audio.play('thunks', { count: 14, spread: 0.45 });
    }
    if (!hitDone && arrows.filter((a) => a.hitVictim && a.stuck).length >= 3) {
      hitDone = true;
      fx.impact(B, team, 0.8);
      fx.stage.shake(0.12, 5);
    }
    return !all;
  });
  await flight;
  // 中箭的棋子带着箭倒下碎裂
  const stuckOnVictim = arrows.map((a, i) => (a.hitVictim ? i : -1)).filter((i) => i >= 0);
  const slow = fx.slowmo(0.35, 0.35);
  await fx.anim.tween(0.35, (t) => {
    victim.rotation.x = -t * 0.5;
    victim.position.y = t * 0.1;
  }, Ease.inQuad);
  for (const i of stuckOnVictim) {
    m4.makeScale(0, 0, 0);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  fx.shatter(victim, { dir, power: 1.2 });
  fx.audio.play('capture');
  jolt(fx, B, 1.4, 0.1);
  await slow;
  archers.forEach((a, i) => fx.anim.wait(i * 0.05).then(() => crumble(fx, a, { dur: 0.5 })));
  fx.cameraRelease(0.9);
  // 箭矢淡出
  fx.anim.tween(1.2, (t) => {
    mat.opacity = 1 - t;
    mat.transparent = true;
  }, Ease.linear).then(() => {
    fx.group.remove(mesh);
    mesh.dispose();
    mat.dispose();
  });
  await fx.anim.wait(0.3);
  await emergePiece(fx, mover, B, team, 0.45);
  stops.forEach((f) => f());
}
