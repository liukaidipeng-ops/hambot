// 车：驷马战车冲锋碾压
import { Chariot } from '../models.js';
import {
  V, moveFrame, track, summon, crumble, absorbPiece, emergePiece, jolt, dustTrail, Ease, rand, TEAM,
} from './common.js';

export async function chariotCharge(fx, rec, mover, victim) {
  const { A, B, dir, side, dist, team, yaw } = moveFrame(fx, rec);
  const ch = new Chariot(team);
  let phase = 0;
  let speed = 0;
  const stop = track(fx, ch, (dt) => {
    phase += dt * (3 + speed * 5);
    ch.run(phase, speed);
    ch.flag.userData.wave(fx.stage.time);
  });
  const start = A.clone().addScaledVector(dir, -0.9);
  fx.cameraTo(start.clone().addScaledVector(side, 2.4).addScaledVector(dir, 1.6).add(V(0, 0.9, 0)), start.clone().add(V(0, 0.5, 0)), 0.9, 46);
  fx.audio.play('horn', { dur: 1.3 });
  await absorbPiece(fx, mover, team, 0.3);
  await summon(fx, ch, start, yaw, { dur: 0.7 });
  // 冲锋
  const impactDist = dist + 0.9 - 1.25; // 车头（马）抵达目标
  const total = impactDist + 1.6;
  const runTime = 0.45 + total * 0.11;
  fx.audio.play('chariot', { dur: runTime + 0.6 });
  const pos = V();
  const camOff = side.clone().multiplyScalar(2.7).add(V(0, 1.0, 0)).addScaledVector(dir, -1.1);
  let hit = false;
  let last = 0;
  await fx.anim.tween(runTime, (t) => {
    const s = t * t * (1.6 - 0.6 * t);
    const d = s * total;
    speed = 1 + t;
    pos.copy(start).addScaledVector(dir, d);
    ch.root.position.copy(pos);
    const cine = fx.rig.cine;
    cine.pos.copy(pos).add(camOff);
    cine.look.copy(pos).addScaledVector(dir, 1.6).add(V(0, 0.4, 0));
    if (t - last > 0.02) {
      last = t;
      for (const sx of [-0.4, 0.4]) dustTrail(fx, pos.clone().addScaledVector(side, sx).addScaledVector(dir, -0.35), dir, 1);
    }
    if (!hit && d >= impactDist) {
      hit = true;
      const imp = B.clone();
      fx.launch(victim, dir.clone().multiplyScalar(5.5).add(V(rand(-0.6, 0.6), 4.2, rand(-0.6, 0.6))), V(rand(6, 12), rand(-4, 4), rand(6, 12)), 1.6);
      fx.impact(imp, team, 1.5);
      fx.audio.play('thud', { vol: 1.1 });
      fx.audio.play('clang', { vol: 0.5 });
      fx.stage.shake(0.3, 5);
      fx.stage.flash(0.15, 0xffe0b0);
      jolt(fx, imp, 2.0, 0.2);
      fx.debris.burst(imp.clone().setY(0.15), { count: 20, speed: 3, up: 2.5, colors: [0xfff1dc, 0xe8c9a0], dir });
      fx.slowmo(0.22, 0.5);
    }
  }, Ease.linear);
  // 被撞飞的棋子在落地时碎裂
  crumble(fx, ch, { dur: 0.6 }).then(stop);
  fx.cameraRelease(1.0);
  await fx.anim.wait(0.25);
  await emergePiece(fx, mover, B, team, 0.45);
}
