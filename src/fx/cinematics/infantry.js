// 兵：步卒列阵行进；吃子时长矛方阵突刺
import { Soldier } from '../models.js';
import {
  V, moveFrame, track, summon, crumble, absorbPiece, emergePiece, dustTrail, jolt, Ease, rand, TEAM,
} from './common.js';

function formation(team, rows, cols, opts) {
  const list = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = new Soldier(team, { weapon: 'spear', shield: r === 0 || opts.allShield });
      s.root.scale.setScalar(opts.scale);
      s.slot = { r, c };
      s.phase = Math.random() * 0.4;
      list.push(s);
    }
  }
  return list;
}

// 行军（非吃子）
export async function march(fx, rec, mover) {
  const { A, B, dir, side, team, yaw } = moveFrame(fx, rec);
  const troops = formation(team, 3, 3, { scale: 0.42 });
  const place = (s, center) => {
    const { r, c } = s.slot;
    return center.clone().addScaledVector(dir, -0.62 - r * 0.3).addScaledVector(side, (c - 1) * 0.3);
  };
  let walking = 0;
  const stops = troops.map((s) => track(fx, s, (dt) => {
    s.phase += dt * 9 * walking;
    s.walk(s.phase, 0.55 * walking);
  }));
  fx.audio.play('march', { dur: 1.5 });
  await Promise.all(troops.map((s, i) => fx.anim.wait(i * 0.02).then(() => summon(fx, s, place(s, A), yaw, { dur: 0.35, rise: 0.12, sound: i === 0 }))));
  walking = 1;
  mover.userData.liftGoal = 0;
  const dur = 1.05;
  let last = 0;
  await fx.anim.tween(dur, (t) => {
    const c = A.clone().lerp(B, t);
    mover.position.set(c.x, Math.abs(Math.sin(t * Math.PI * 3)) * 0.04, c.z);
    for (const s of troops) s.root.position.copy(place(s, c));
    if (t - last > 0.12) {
      last = t;
      dustTrail(fx, c.clone().addScaledVector(dir, -0.9), dir, 0.6);
    }
  }, Ease.inOutSine);
  walking = 0;
  fx.landing(rec.to, team);
  for (const s of troops) s.setIdle();
  await Promise.all(troops.map((s, i) => fx.anim.wait(i * 0.03).then(() => crumble(fx, s, { dur: 0.45 }))));
  stops.forEach((f) => f());
}

// 长矛突刺（吃子）
export async function phalanx(fx, rec, mover, victim) {
  const { A, B, dir, side, dist, team, yaw } = moveFrame(fx, rec);
  const troops = formation(team, 2, 3, { scale: 0.62, allShield: false });
  const place = (s, center) => center.clone().addScaledVector(dir, -0.2 - s.slot.r * 0.42).addScaledVector(side, (s.slot.c - 1) * 0.36);
  let walking = 0;
  const stops = troops.map((s) => track(fx, s, (dt) => {
    s.phase += dt * 12 * walking;
    if (walking) s.walk(s.phase, 0.7 * walking);
  }));
  fx.cameraTo(A.clone().lerp(B, 0.3).addScaledVector(side, 2.9).addScaledVector(dir, -0.2).add(V(0, 1.15, 0)), A.clone().lerp(B, 0.25).add(V(0, 0.4, 0)), 0.9, 44);
  fx.audio.play('drum');
  fx.audio.play('drum', { delay: 0.25 });
  await absorbPiece(fx, mover, team, 0.25);
  await Promise.all(troops.map((s, i) => fx.anim.wait(i * 0.04).then(() => summon(fx, s, place(s, A.clone().addScaledVector(dir, -0.3)), yaw, { dur: 0.45, rise: 0.15, sound: i === 0 }))));
  // 放平长矛
  await fx.anim.tween(0.3, (t) => troops.forEach((s) => s.levelSpear(t)), Ease.inOutQuad);
  // 冲锋
  fx.audio.play('march', { dur: 0.7, bpm: 220 });
  walking = 1;
  const from = A.clone().addScaledVector(dir, -0.3);
  const to = B.clone().addScaledVector(dir, -0.75);
  let last = 0;
  await fx.anim.tween(0.35 + dist * 0.12, (t) => {
    const c = from.clone().lerp(to, t);
    troops.forEach((s) => {
      s.root.position.copy(place(s, c));
      s.levelSpear(1);
    });
    if (t - last > 0.1) {
      last = t;
      dustTrail(fx, c, dir, 0.8);
    }
  }, Ease.inQuad);
  walking = 0;
  // 突刺
  fx.audio.play('slash', { vol: 0.6 });
  const slow = fx.slowmo(0.2, 0.45);
  await fx.anim.tween(0.4, (t) => troops.forEach((s) => s.thrust(t)), Ease.linear);
  fx.impact(B, team, 1.2);
  fx.audio.play('clang', { vol: 0.5 });
  fx.audio.play('thud', { vol: 0.8 });
  fx.shatter(victim, { dir, power: 1.4 });
  jolt(fx, B, 1.6, 0.14);
  await slow;
  await fx.anim.wait(0.2);
  troops.forEach((s, i) => fx.anim.wait(i * 0.04).then(() => crumble(fx, s, { dur: 0.55 })));
  fx.cameraRelease(0.9);
  await fx.anim.wait(0.3);
  await emergePiece(fx, mover, B, team, 0.45);
  stops.forEach((f) => f());
}

export { rand, TEAM };
