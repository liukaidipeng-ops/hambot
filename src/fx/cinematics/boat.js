// 渡河：船家摆渡，棋子乘舟横渡楚河汉界
import { Boat, Soldier, makeFlag } from '../models.js';
import { RIVER_HALF, WATER_Y, rankZ } from '../../render/coords.js';
import { PAWN } from '../../../shared/xiangqi.js';
import { V, moveFrame, track, summon, crumble, Ease, rand, TEAM } from './common.js';

export async function boatCrossing(fx, rec, mover) {
  const { A, B, side, team } = moveFrame(fx, rec);
  const full = fx.level === 'full';
  const sgn = Math.sign(A.z) || 1; // 出发岸
  const bankNear = sgn * (RIVER_HALF + 0.02);
  const bankFar = -bankNear;
  // 与河岸的交点
  const at = (z) => {
    const t = (z - A.z) / (B.z - A.z);
    return A.clone().lerp(B, t);
  };
  const P1 = at(sgn * (rankZ(4) - 0.0)).setZ(sgn * Math.min(Math.abs(A.z), rankZ(4)));
  const P2 = at(-sgn * rankZ(4)).setZ(-sgn * Math.min(Math.abs(B.z), rankZ(4)));
  const cx = (P1.x + P2.x) / 2;
  const boat = new Boat();
  boat.root.scale.setScalar(1.18);
  const flow = 1; // 河水向 +x 流
  const startX = cx - 3.2 * flow;
  const nearZ = sgn * (RIVER_HALF - 0.52);
  const farZ = -nearZ;
  boat.root.position.set(startX, WATER_Y - 0.25, nearZ);
  boat.root.rotation.y = 0;
  fx.group.add(boat.root);
  let bob = 0;
  let pole = 0;
  const stopBob = fx.anim.loop((dt) => {
    bob += dt;
    boat.root.rotation.z = Math.sin(bob * 2.2) * 0.03;
    boat.root.rotation.x = Math.sin(bob * 1.7) * 0.02;
    boat.pole.rotation.z = 0.5 + Math.sin(pole) * 0.25;
    boat.boatman.rotation.z = Math.sin(pole) * 0.06;
  });
  // 兵卒随船
  const crew = [];
  if ((rec.piece & 7) === PAWN && full) {
    for (const [x, z] of [[-0.35, 0.22], [-0.35, -0.22]]) {
      const s = new Soldier(team, { weapon: 'spear' });
      s.root.scale.setScalar(0.34);
      crew.push({ s, x, z, stop: track(fx, s) });
    }
  }
  const flagPole = full ? makeFlag(boat.mats[0], TEAM[team].name, team) : null;
  if (flagPole) {
    boat.mats.push(flagPole.material);
    flagPole.position.set(-0.55, 0.62, 0);
    flagPole.scale.setScalar(0.8);
    boat.root.add(flagPole);
  }
  if (full) {
    fx.cameraTo(V(cx, 0, 0).addScaledVector(side, 3.6).add(V(-1.2, 2.3, sgn * 1.2)), V(cx, 0.1, 0), 1.0, 42);
  }
  // 船从上游驶来
  fx.audio.play('oar');
  fx.audio.play('oar', { delay: 0.45 });
  fx.river.ripple(startX, nearZ, 0.8);
  const arrive = full ? 0.9 : 0.6;
  let last = 0;
  // 棋子先行至岸边
  fx.anim.tween(arrive * 0.8, (t) => {
    mover.position.lerpVectors(A, P1, t);
  }, Ease.inOutQuad);
  await fx.anim.tween(arrive, (t) => {
    boat.root.position.x = startX + (cx - startX) * t;
    boat.root.position.y = WATER_Y - 0.25 * (1 - Math.min(1, t * 2));
    boat.root.scale.setScalar(1.18 * Math.min(1, 0.3 + t * 1.4));
    pole += 0.25;
    if (flagPole) flagPole.userData.wave(fx.stage.time);
    if (t - last > 0.15) {
      last = t;
      fx.river.ripple(boat.root.position.x - 0.6, nearZ, 0.5);
    }
  }, Ease.outCubic);
  for (const c of crew) {
    boat.root.add(c.s.root);
    c.s.root.position.set(c.x, -0.06, c.z);
    c.s.root.rotation.y = Math.PI / 2 * -sgn;
    summon(fx, c.s, c.s.root.position.clone(), -sgn * Math.PI / 2, { dur: 0.35, rise: 0.05, sound: false }).then(() => {
      c.s.root.position.set(c.x, -0.06, c.z);
    });
  }
  // 跳上船
  const deck = V(cx, WATER_Y + 0.02, nearZ);
  const from = mover.position.clone();
  await fx.anim.tween(0.32, (t) => {
    mover.position.lerpVectors(from, deck, t);
    mover.position.y = WATER_Y + Math.sin(Math.PI * t) * 0.45 + (from.y - WATER_Y) * (1 - t);
  }, Ease.inOutQuad);
  fx.audio.play('clack', { strength: 0.7 });
  fx.audio.play('splash', { vol: 0.35 });
  fx.river.ripple(cx, nearZ, 1.2);
  fx.smoke.emit({ count: 10, pos: () => [cx + rand(-0.5, 0.5), WATER_Y + 0.02, nearZ + rand(-0.3, 0.3)], vel: () => [rand(-0.5, 0.5), rand(0.5, 1.2), rand(-0.5, 0.5)], life: [0.4, 0.7], size: 0.12, sizeEnd: 0.3, color: 0xe8f4f4, alpha: 0.6, tile: 'smoke', gravity: 2 });
  // 渡河
  const cross = full ? 1.0 : 0.7;
  last = 0;
  const b0 = boat.root.position.clone();
  await fx.anim.tween(cross, (t) => {
    boat.root.position.set(b0.x + t * 0.35 * flow, b0.y, nearZ + (farZ - nearZ) * t);
    boat.root.rotation.y = Math.sin(t * Math.PI) * 0.18 * sgn;
    mover.position.set(boat.root.position.x, WATER_Y + Math.sin(bob * 2.2) * 0.01, boat.root.position.z);
    pole += 0.22;
    if (flagPole) flagPole.userData.wave(fx.stage.time);
    if (t - last > 0.12) {
      last = t;
      fx.river.ripple(boat.root.position.x, boat.root.position.z + sgn * 0.35, 0.6);
      fx.audio.play('oar', { vol: 0.15 });
    }
  }, Ease.inOutSine);
  // 登岸
  const land = P2.clone();
  const fromBoat = mover.position.clone();
  await fx.anim.tween(0.34, (t) => {
    mover.position.lerpVectors(fromBoat, land, t);
    mover.position.y = WATER_Y + Math.sin(Math.PI * t) * 0.5 + (0 - WATER_Y) * t;
  }, Ease.inOutQuad);
  fx.landing(-1, team, 0.9, land);
  if (full) fx.cameraRelease(1.0);
  // 船离开
  const b1 = boat.root.position.clone();
  for (const c of crew) crumble(fx, c.s, { dur: 0.5 }).then(c.stop);
  fx.anim.tween(1.1, (t) => {
    boat.root.position.set(b1.x + t * 2.5 * flow, WATER_Y - t * 0.3, b1.z * (1 - t * 0.5));
    boat.root.scale.setScalar(1.18 * (1 - t * 0.7));
    if (t > 0.6) boat.root.traverse((o) => {
      if (o.isMesh) {
        o.material.transparent = true;
        o.material.opacity = 1 - (t - 0.6) / 0.4;
      }
    });
  }, Ease.inQuad).then(() => {
    stopBob.cancel();
    boat.dispose();
  });
  // 走到终点
  if (land.distanceTo(B) > 0.05) {
    await fx.anim.tween(0.25 + land.distanceTo(B) * 0.08, (t) => mover.position.lerpVectors(land, B, t), Ease.inOutQuad);
    fx.landing(rec.to, team, 0.8);
  }
  void bankFar;
  void bankNear;
}
