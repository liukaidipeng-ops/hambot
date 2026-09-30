// 马：重甲铁骑突袭，人立挥刀斩杀
import { Cavalry } from '../models.js';
import {
  V, moveFrame, track, summon, crumble, absorbPiece, emergePiece, dustTrail, slashArc, jolt, Ease, rand, TEAM,
} from './common.js';

export async function cavalrySlash(fx, rec, mover, victim) {
  const { A, B, dir, side, dist, team, yaw } = moveFrame(fx, rec);
  const cav = new Cavalry(team);
  let phase = 0;
  let gallop = 0;
  const stop = track(fx, cav, (dt) => {
    phase += dt * 11 * Math.max(0.3, gallop);
    if (gallop > 0) cav.horse.gallop(phase, gallop);
  });
  const start = A.clone().addScaledVector(dir, -0.6);
  // 镜头：目标侧前方低机位，看骑兵冲来
  fx.cameraTo(B.clone().addScaledVector(dir, 1.4).addScaledVector(side, 1.9).add(V(0, 0.75, 0)), A.clone().lerp(B, 0.35).add(V(0, 0.7, 0)), 1.0, 44);
  fx.audio.play('drum', { vol: 0.8 });
  await absorbPiece(fx, mover, team, 0.3);
  const rider = cav.rider;
  rider.slash(0);
  await summon(fx, cav, start, yaw, { dur: 0.7 });
  fx.audio.play('neigh', { vol: 0.28 });
  // 冲锋
  const stopAt = dist + 0.6 - 0.95;
  const runTime = 0.45 + stopAt * 0.12;
  fx.audio.play('gallop', { dur: runTime + 0.2, rate: 1.4, vol: 0.7 });
  gallop = 1;
  let last = 0;
  await fx.anim.tween(runTime, (t) => {
    cav.root.position.copy(start).addScaledVector(dir, stopAt * t);
    if (t - last > 0.05) {
      last = t;
      dustTrail(fx, cav.root.position.clone().addScaledVector(dir, -0.3), dir, 1.2);
    }
  }, Ease.inQuad);
  // 人立 + 斩
  gallop = 0;
  cav.horse.stand();
  const cutPos = B.clone().add(V(0, 0.55, 0));
  fx.cameraTo(B.clone().addScaledVector(side, 2.7).addScaledVector(dir, 0.5).add(V(0, 1.05, 0)), B.clone().addScaledVector(dir, -0.45).add(V(0, 0.75, 0)), 0.35, 42, Ease.outCubic);
  fx.audio.play('neigh', { vol: 0.35 });
  await fx.anim.tween(0.32, (t) => {
    cav.horse.rear(Math.sin(t * Math.PI * 0.5));
    rider.slash(0);
  }, Ease.outQuad);
  fx.audio.play('slash', { vol: 0.9 });
  slashArc(fx, B.clone().add(V(0, 0.4, 0)).addScaledVector(dir, -0.15), yaw, TEAM[team].accent, { radius: 0.72, width: 0.16, tilt: 0.6, dur: 0.28 });
  const slowP = fx.slowmo(0.15, 0.55);
  await fx.anim.tween(0.18, (t) => rider.slash(t), Ease.inQuad);
  // 劈开
  fx.splitHalves(victim, dir.clone().applyAxisAngle(V(0, 1, 0), 0.3), 1.2);
  fx.impact(B, team, 1.1);
  fx.audio.play('clang', { vol: 0.6 });
  fx.debris.burst(B.clone().setY(0.2), { count: 16, speed: 2, up: 2, colors: [0xfff1dc, 0xe8c9a0, team === 0 ? 0x1d2a22 : 0xb3261e] });
  fx.stage.flash(0.35, 0xffffff);
  jolt(fx, B, 1.6, 0.14);
  await slowP;
  await fx.anim.tween(0.4, (t) => cav.horse.rear(1 - t), Ease.inOutQuad);
  crumble(fx, cav, { dur: 0.7 }).then(stop);
  fx.cameraRelease(0.9);
  await fx.anim.wait(0.3);
  await emergePiece(fx, mover, B, team, 0.45);
}
