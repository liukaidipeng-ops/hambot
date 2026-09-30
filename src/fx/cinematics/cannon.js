// 炮：青铜火炮现身，炮弹越过炮架直取敌子
import * as THREE from 'three';
import { Cannon } from '../models.js';
import {
  V, UP, moveFrame, track, summon, crumble, absorbPiece, emergePiece, explosion, scorch, jolt, Ease, rand, TEAM,
} from './common.js';

export async function cannonStrike(fx, rec, mover, victim) {
  const f = moveFrame(fx, rec);
  const { A, B, dir, side, dist, team } = f;
  const cannon = new Cannon(team);
  const stop = track(fx, cannon);
  // 镜头：炮后越肩视角
  const shoulder = A.clone().addScaledVector(dir, -2.4).addScaledVector(side, 1.3).add(V(0, 1.35, 0));
  const lookMid = A.clone().lerp(B, 0.45).add(V(0, 0.35, 0));
  fx.cameraTo(shoulder, lookMid, 1.0, 44);
  fx.audio.play('drum');
  await absorbPiece(fx, mover, team, 0.3);
  await summon(fx, cannon, A.clone().addScaledVector(dir, -0.15), f.yaw, { dur: 0.75 });
  // 抬高炮口 + 点火
  const elev = -0.18 - Math.min(0.25, dist * 0.025);
  fx.audio.play('fuse', { dur: 0.55 });
  const tipPos = V();
  await fx.anim.tween(0.55, (t) => {
    cannon.barrel.rotation.x = -0.12 + (elev + 0.12) * t;
    cannon.torchTip.getWorldPosition(tipPos);
    fx.sparks.emit({ count: 2, pos: [tipPos.x, tipPos.y, tipPos.z], vel: () => [rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5)], life: 0.35, size: 0.03, color: 0xffd080, colorEnd: 0xff4000, tile: 'dot', gravity: 3 });
  }, Ease.inOutQuad);

  // 开炮
  const muzzle = cannon.muzzle.getWorldPosition(V());
  fx.audio.play('boom', { size: 1.2 });
  fx.stage.shake(0.28, 4);
  fx.stage.flash(0.45, 0xffd090);
  fx.lightFlash(muzzle, 0xffa040, 16);
  fx.sparks.emit({ count: 1, pos: muzzle, life: 0.22, size: 1.6, sizeEnd: 2.4, color: 0xfff2c0, alpha: 1, tile: 'glow' });
  fx.sparks.emit({
    count: 26,
    pos: muzzle,
    vel: () => [dir.x * rand(2, 6) + rand(-0.6, 0.6), rand(0, 1.2), dir.z * rand(2, 6) + rand(-0.6, 0.6)],
    life: [0.15, 0.4],
    size: [0.2, 0.4],
    sizeEnd: 0.6,
    color: 0xffd060,
    colorEnd: 0xff3000,
    drag: 5,
    tile: 'flame',
  });
  fx.smoke.emit({
    count: 36,
    pos: () => [muzzle.x + rand(-0.1, 0.1), muzzle.y + rand(-0.05, 0.1), muzzle.z + rand(-0.1, 0.1)],
    vel: () => [dir.x * rand(0.5, 3.5) + side.x * rand(-0.8, 0.8), rand(0.1, 1.2), dir.z * rand(0.5, 3.5) + side.z * rand(-0.8, 0.8)],
    life: [1.2, 2.4],
    size: [0.25, 0.45],
    sizeEnd: [1.1, 1.8],
    color: 0xd8d0c8,
    colorEnd: 0x7a746e,
    alpha: 0.6,
    drag: 2.4,
    tile: 'smoke',
    spin: [0.2, 0.8],
  });
  fx.shockwave(A, 0xffc080, 2.4, 0.5);
  fx.anim.tween(0.5, (t) => cannon.recoil(t), Ease.outQuad);

  // 炮弹飞行（子弹时间追踪镜头）
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.5, metalness: 0.6, emissive: new THREE.Color(0xff5a10), emissiveIntensity: 1.2 }),
  );
  ball.castShadow = true;
  fx.group.add(ball);
  const peak = 1.5 + dist * 0.17;
  const flight = 0.45 + dist * 0.05;
  const target = B.clone().setY(0.2);
  const prev = muzzle.clone();
  const cine = fx.rig.cine;
  const camFrom = cine.pos.clone();
  const lookFrom = cine.look.clone();
  fx.audio.play('whoosh', { dur: flight, from: 300, to: 1800, vol: 0.35 });
  fx.stage.timeScale = 0.6;
  await fx.anim.tween(flight, (t) => {
    const p = muzzle.clone().lerp(target, t);
    p.y += Math.sin(Math.PI * t) * peak;
    ball.position.copy(p);
    const vel = p.clone().sub(prev);
    prev.copy(p);
    // 追踪：从越肩位平滑过渡到炮弹后上方
    const chase = p.clone().addScaledVector(dir, -1.9).addScaledVector(side, 0.55).add(V(0, 0.55, 0));
    const ahead = p.clone().lerp(target, 0.45 + 0.35 * t);
    const k = Math.min(1, t * 3.5);
    cine.pos.lerpVectors(camFrom, chase, k);
    cine.look.lerpVectors(lookFrom, ahead, k);
    fx.sparks.emit({ count: 3, pos: () => [p.x + rand(-0.03, 0.03), p.y + rand(-0.03, 0.03), p.z + rand(-0.03, 0.03)], life: [0.12, 0.25], size: [0.22, 0.3], sizeEnd: 0.05, color: 0xffb040, colorEnd: 0xff2000, alpha: 0.8, tile: 'glow' });
    fx.sparks.emit({ count: 2, pos: [p.x, p.y, p.z], vel: () => [-vel.x * 20 + rand(-0.6, 0.6), rand(-0.3, 0.6), -vel.z * 20 + rand(-0.6, 0.6)], life: [0.2, 0.45], size: 0.03, color: 0xffe0a0, colorEnd: 0xff4000, tile: 'dot', stretch: 0.05, gravity: 2 });
    fx.smoke.emit({ count: 1, pos: [p.x, p.y, p.z], vel: [0, 0.2, 0], life: 1.1, size: 0.14, sizeEnd: 0.6, color: 0x4a4440, alpha: 0.5, tile: 'smoke', drag: 1 });
  }, Ease.linear);
  fx.stage.timeScale = 1;
  fx.group.remove(ball);
  ball.geometry.dispose();
  ball.material.dispose();

  // 命中
  explosion(fx, B, { size: 1.1, color: team });
  fx.audio.play('explosion', { size: 1.1 });
  fx.shatter(victim, { dir, power: 1.8 });
  scorch(fx, B, 1.8);
  jolt(fx, B, 2.4, 0.22);
  fx.cameraTo(B.clone().addScaledVector(dir, -2.3).addScaledVector(side, 1.5).add(V(0, 1.5, 0)), B.clone().add(V(0, 0.35, 0)), 0.22, 44, Ease.outCubic);
  await fx.slowmo(0.28, 0.45);
  crumble(fx, cannon, { dur: 0.7 }).then(stop);
  await fx.anim.wait(0.35);
  fx.cameraRelease(0.9);
  await emergePiece(fx, mover, B, team, 0.45);
}
