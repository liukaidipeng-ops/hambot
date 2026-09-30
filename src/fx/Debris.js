// 碎木块（实例化）+ 简易刚体（被击飞的棋子、劈开的两半）
import * as THREE from 'three';
import { RIVER_HALF, WATER_Y } from '../render/coords.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const AXIS = new THREE.Vector3();

function floorAt(x, z) {
  if (Math.abs(z) < RIVER_HALF - 0.02 && Math.abs(x) < 5.2) return WATER_Y - 0.4; // 落水下沉
  if (Math.abs(x) > 5.2 || Math.abs(z) > 6.2) return -30;
  return 0;
}

export class Debris {
  constructor(max = 260, woodMap) {
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.6 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.items = [];
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
    this.bodies = [];
  }

  // 碎块喷发
  burst(pos, { count = 24, speed = 3, up = 3, size = [0.04, 0.12], colors = [0xffffff], life = [2.5, 4], dir = null, spread = 1 } = {}) {
    for (let k = 0; k < count; k++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      let vx = Math.cos(a) * s * spread;
      let vz = Math.sin(a) * s * spread;
      if (dir) {
        vx += dir.x * speed;
        vz += dir.z * speed;
      }
      const sz = size[0] + Math.random() * (size[1] - size[0]);
      this.items.push({
        p: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.3, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * 0.3),
        v: new THREE.Vector3(vx, up * (0.5 + Math.random()), vz),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
        s: new THREE.Vector3(sz * (0.6 + Math.random() * 0.8), sz * (0.4 + Math.random() * 0.5), sz * (1 + Math.random())),
        color: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]),
        life: life[0] + Math.random() * (life[1] - life[0]),
        age: 0,
      });
    }
  }

  // 为任意物体附加简易刚体
  addBody(obj, { vel = new THREE.Vector3(), ang = new THREE.Vector3(), life = 3, bounce = 0.35, fade = true, onDone } = {}) {
    const b = { obj, vel: vel.clone(), ang: ang.clone(), life, age: 0, bounce, fade, onDone, baseScale: obj.scale.clone() };
    this.bodies.push(b);
    return b;
  }

  update(dt) {
    const g = 9.8;
    let n = 0;
    const keep = [];
    for (const it of this.items) {
      it.age += dt;
      if (it.age > it.life) continue;
      it.v.y -= g * dt;
      it.p.addScaledVector(it.v, dt);
      const fl = floorAt(it.p.x, it.p.z) + it.s.y * 0.5;
      if (it.p.y < fl) {
        it.p.y = fl;
        if (Math.abs(it.v.y) > 0.6) it.v.y *= -0.32;
        else it.v.y = 0;
        it.v.x *= 0.55;
        it.v.z *= 0.55;
        it.w.multiplyScalar(0.5);
      }
      it.r.x += it.w.x * dt;
      it.r.y += it.w.y * dt;
      it.r.z += it.w.z * dt;
      const fade = Math.min(1, (it.life - it.age) / 0.6);
      tmpQ.setFromEuler(it.r);
      tmpS.copy(it.s).multiplyScalar(fade);
      tmpM.compose(it.p, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      this.mesh.setColorAt(n, it.color);
      n++;
      keep.push(it);
    }
    this.items = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // 刚体
    const kb = [];
    for (const b of this.bodies) {
      b.age += dt;
      const o = b.obj;
      b.vel.y -= g * dt;
      o.position.addScaledVector(b.vel, dt);
      const fl = floorAt(o.position.x, o.position.z);
      if (o.position.y < fl) {
        o.position.y = fl;
        if (Math.abs(b.vel.y) > 0.8) b.vel.y *= -b.bounce;
        else b.vel.y = 0;
        b.vel.x *= 0.6;
        b.vel.z *= 0.6;
        b.ang.multiplyScalar(0.6);
      }
      const w = b.ang.length();
      if (w > 1e-4) {
        AXIS.copy(b.ang).divideScalar(w);
        tmpQ.setFromAxisAngle(AXIS, w * dt);
        o.quaternion.premultiply(tmpQ);
      }
      if (b.fade) {
        const f = Math.min(1, Math.max(0, (b.life - b.age) / 0.7));
        o.scale.copy(b.baseScale).multiplyScalar(f);
      }
      if (b.age >= b.life) {
        b.onDone?.();
        continue;
      }
      kb.push(b);
    }
    this.bodies = kb;
  }

  clear() {
    this.items = [];
    for (const b of this.bodies) b.onDone?.();
    this.bodies = [];
    this.mesh.count = 0;
  }
}

export { tmpP, tmpE };
