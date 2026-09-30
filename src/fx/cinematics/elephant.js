// 相/象：战象践踏
import { Elephant } from '../models.js';
import {
  V, moveFrame, track, summon, crumble, absorbPiece, emergePiece, explosion, scorch, jolt, Ease, rand, TEAM,
} from './common.js';

export async function elephantStomp(fx, rec, mover, victim) {
  const { A, B, dir, side, dist, team, yaw } = moveFrame(fx, rec);
  const ele = new Elephant(team);
  let phase = 0;
  let walking = 0;
  const stop = track(fx, ele, (dt) => {
    phase += dt * 5 * walking;
    if (walking) ele.walk(phase);
  });
  const start = A.clone().addScaledVector(dir, -0.5);
  // 仰拍
  fx.cameraTo(B.clone().addScaledVector(dir, 1.5).addScaledVector(side, 2.8).add(V(0, 0.5, 0)), A.clone().lerp(B, 0.55).add(V(0, 0.95, 0)), 1.0, 50);
  await absorbPiece(fx, mover, team, 0.3);
  await summon(fx, ele, start, yaw, { dur: 0.8 });
  fx.audio.play('trumpet', { vol: 0.45 });
  await fx.anim.wait(0.3);
  // 沉重步伐
  walking = 1;
  const end = B.clone().addScaledVector(dir, -1.0);
  const walkTime = 0.5 + dist * 0.25;
  let stepAcc = 0;
  let prevPhase = phase;
  await fx.anim.tween(walkTime, (t) => {
    ele.root.position.copy(start).lerp(end, t);
    stepAcc += phase - prevPhase;
    prevPhase = phase;
    if (stepAcc > Math.PI) {
      stepAcc = 0;
      fx.audio.play('thud', { vol: 0.5 });
      fx.stage.shake(0.06, 6);
      fx.dustRing(ele.root.position.clone().setY(0.02), 0.8);
    }
  }, Ease.linear);
  walking = 0;
  // 人立
  fx.audio.play('trumpet', { vol: 0.55 });
  await fx.anim.tween(0.55, (t) => ele.rear(t), Ease.outQuad);
  await fx.anim.wait(0.1);
  // 践踏
  await fx.anim.tween(0.16, (t) => ele.rear(1 - t), Ease.inQuad);
  explosion(fx, B, { size: 0.8, color: team });
  fx.shockwave(B, 0xffffff, 5, 0.8);
  fx.audio.play('thud', { vol: 1.3 });
  fx.audio.play('explosion', { size: 0.6 });
  fx.stage.shake(0.45, 3.5);
  scorch(fx, B, 2.2, 5, 0x1a0e08);
  jolt(fx, B, 3, 0.3);
  // 棋子被压扁后碎裂
  fx.anim.tween(0.1, (t) => victim.scale.set(1 + t * 0.3, 1 - t * 0.8, 1 + t * 0.3), Ease.outQuad).then(() => fx.shatter(victim, { dir, power: 1.5 }));
  await fx.slowmo(0.25, 0.5);
  crumble(fx, ele, { dur: 0.8 }).then(stop);
  fx.cameraRelease(1.0);
  await fx.anim.wait(0.3);
  await emergePiece(fx, mover, B, team, 0.45);
}

export { rand, TEAM };
