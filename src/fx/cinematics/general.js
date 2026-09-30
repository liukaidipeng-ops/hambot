// 帅/将：天子之剑从天而降
import * as THREE from 'three';
import { GiantSword } from '../models.js';
import {
  V, moveFrame, track, summon, absorbPiece, emergePiece, explosion, scorch, jolt, Ease, rand, TEAM,
} from './common.js';

export async function heavenSword(fx, rec, mover, victim) {
  const { A, B, dir, side, team } = moveFrame(fx, rec);
  const sword = new GiantSword(team);
  const stop = track(fx, sword);
  fx.cameraTo(B.clone().addScaledVector(dir, 3.2).addScaledVector(side, 2.2).add(V(0, 1.2, 0)), B.clone().add(V(0, 1.8, 0)), 1.0, 52);
  fx.audio.play('gong', { vol: 0.5, base: 100, dur: 3 });
  await absorbPiece(fx, mover, team, 0.35);
  // 天光
  const beamMat = new THREE.MeshBasicMaterial({ color: TEAM[team].accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 14, 24, 1, true), beamMat);
  beam.position.set(B.x, 7, B.z);
  fx.group.add(beam);
  fx.anim.tween(0.6, (t) => (beamMat.opacity = t * 0.35), Ease.outQuad);
  const grade = fx.stage.grade.uniforms;
  fx.anim.tween(0.6, (t) => grade.uTint.value.setRGB(1 - t * 0.35, 1 - t * 0.3, 1 - t * 0.2), Ease.outQuad);
  await summon(fx, sword, B.clone().add(V(0, 11, 0)), 0, { dur: 0.6, rise: 0 });
  fx.cameraTo(B.clone().addScaledVector(dir, 3.0).addScaledVector(side, 1.8).add(V(0, 0.8, 0)), B.clone().add(V(0, 1.5, 0)), 0.4, 50, Ease.inQuad);
  fx.audio.play('whoosh', { dur: 0.4, from: 200, to: 3000, vol: 0.6 });
  await fx.anim.tween(0.36, (t) => {
    sword.root.position.y = 11 - t * 7.4;
  }, Ease.inCubic);
  // 贯地
  explosion(fx, B, { size: 1.4, color: team });
  fx.shockwave(B, 0xffffff, 6, 1.0);
  fx.shockwave(B, TEAM[team].accent, 4, 1.3);
  fx.audio.play('explosion', { size: 1.2 });
  fx.audio.play('clang', { vol: 0.8 });
  fx.audio.play('gong', { vol: 0.7, base: 90, dur: 4 });
  fx.stage.flash(0.8, 0xfff0c0);
  fx.stage.shake(0.5, 3);
  fx.shatter(victim, { dir, power: 2 });
  scorch(fx, B, 2.6, 6, 0x1a0e08);
  jolt(fx, B, 3.5, 0.3);
  await fx.slowmo(0.2, 0.6);
  await fx.anim.wait(0.3);
  // 剑化金光消散
  fx.sparks.emit({
    count: 120,
    pos: () => [B.x + rand(-0.15, 0.15), rand(0, 4), B.z + rand(-0.15, 0.15)],
    vel: () => [rand(-0.6, 0.6), rand(0.5, 2.5), rand(-0.6, 0.6)],
    life: [0.8, 1.6],
    size: [0.03, 0.07],
    color: TEAM[team].accent,
    colorEnd: TEAM[team].glow,
    drag: 1,
    tile: 'dot',
  });
  fx.anim.tween(0.8, (t) => {
    sword.dissolve = -0.3 + t * 1.6;
    beamMat.opacity = 0.35 * (1 - t);
    grade.uTint.value.setRGB(0.65 + t * 0.35, 0.7 + t * 0.3, 0.8 + t * 0.2);
  }, Ease.inQuad).then(() => {
    sword.dispose();
    stop();
    fx.group.remove(beam);
    beam.geometry.dispose();
    beamMat.dispose();
    grade.uTint.value.setRGB(1, 1, 1);
  });
  fx.cameraRelease(1.0);
  await fx.anim.wait(0.4);
  await emergePiece(fx, mover, B, team, 0.45);
}
