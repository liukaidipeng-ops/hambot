// 镜头控制：玩家视角轨道 + 电影镜头混合 + 触控/鼠标输入
import * as THREE from 'three';
import { clamp, lerp } from '../core/anim.js';
import { BOARD_HALF_W, BOARD_HALF_D } from './coords.js';

const tmpV = new THREE.Vector3();

export class CameraRig {
  constructor(stage, dom) {
    this.stage = stage;
    this.camera = stage.camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.side = 0; // 0 红方视角，1 黑方视角
    this.baseAz = 0;
    this.az = 0; // 相对 baseAz 的偏移
    this.polar = 0.62;
    this.radius = 18;
    this.goal = { az: 0, polar: 0.62, radius: 18, baseAz: 0 };
    this.userZoom = 1;
    this.fitRadius = 18;
    this.safe = { top: 0.1, bottom: 0.1, left: 0.04, right: 0.04 };
    this.enabled = true;
    this.idleSpin = 0; // 菜单背景缓慢旋转

    // 电影镜头
    this.cine = {
      weight: 0,
      pos: new THREE.Vector3(0, 10, 10),
      look: new THREE.Vector3(),
      fov: 40,
    };
    this.baseFov = 40;

    this.pointers = new Map();
    this.bindInput();
    stage.add((dt, t, raw) => this.update(raw));
    stage.onResize = () => this.refit();
    this.refit();
  }

  setSide(side, instant = false) {
    this.side = side;
    this.goal.baseAz = side === 1 ? Math.PI : 0;
    // 选择最短旋转方向
    while (this.goal.baseAz - this.baseAz > Math.PI) this.goal.baseAz -= Math.PI * 2;
    while (this.goal.baseAz - this.baseAz < -Math.PI) this.goal.baseAz += Math.PI * 2;
    this.goal.az = 0;
    if (instant) {
      this.baseAz = this.goal.baseAz;
      this.az = 0;
    }
  }

  resetView() {
    this.goal.az = 0;
    this.userZoom = 1;
    this.goal.polar = this.defaultPolar();
    this.refit();
  }

  defaultPolar() {
    const aspect = this.stage.width / this.stage.height;
    return aspect < 0.8 ? 0.36 : aspect < 1.2 ? 0.48 : 0.62;
  }

  setSafeArea(safe) {
    Object.assign(this.safe, safe);
    this.refit();
  }

  // 计算能完整容纳棋盘的镜头距离
  refit() {
    const aspect = this.stage.width / this.stage.height;
    this.goal.polar = this.goal.polar || this.defaultPolar();
    if (!this._polarSetByUser) this.goal.polar = this.defaultPolar();
    const cam = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 500);
    const corners = [];
    const hw = BOARD_HALF_W + 0.45;
    const hd = BOARD_HALF_D + 0.4;
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [-0.3, 0.35]) corners.push(new THREE.Vector3(x, y, z));
    const s = this.safe;
    const fits = (r) => {
      this.placeCamera(cam, this.goal.baseAz, 0, this.goal.polar, r);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (const c of corners) {
        tmpV.copy(c).project(cam);
        if (tmpV.x < -1 + s.left * 2 || tmpV.x > 1 - s.right * 2) return false;
        if (tmpV.y < -1 + s.bottom * 2 || tmpV.y > 1 - s.top * 2) return false;
      }
      return true;
    };
    let lo = 4;
    let hi = 80;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.fitRadius = hi;
    this.goal.radius = hi * this.userZoom;
  }

  placeCamera(cam, baseAz, az, polar, radius, target = this.target) {
    const a = baseAz + az;
    cam.position.set(
      target.x + Math.sin(a) * Math.sin(polar) * radius,
      target.y + Math.cos(polar) * radius,
      target.z + Math.cos(a) * Math.sin(polar) * radius,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 6);
    if (this.idleSpin) this.goal.baseAz += this.idleSpin * dt;
    this.baseAz = lerp(this.baseAz, this.goal.baseAz, this.idleSpin ? 1 : 1 - Math.exp(-dt * 2.2));
    this.az = lerp(this.az, this.goal.az, k);
    this.polar = lerp(this.polar, this.goal.polar, k);
    this.radius = lerp(this.radius, this.goal.radius, k);
    const cam = this.camera;
    this.placeCamera(cam, this.baseAz, this.az, this.polar, this.radius);
    const w = this.cine.weight;
    if (w > 0.0001) {
      tmpV.copy(this.target);
      cam.position.lerp(this.cine.pos, w);
      const look = tmpV.lerp(this.cine.look, w);
      cam.lookAt(look);
      cam.fov = lerp(this.baseFov, this.cine.fov, w);
    } else {
      cam.fov = this.baseFov;
    }
    cam.updateProjectionMatrix();
  }

  // ---------- 输入 ----------
  bindInput() {
    const el = this.dom;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e, true));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.onHover?.(null);
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.enabled || this.cine.weight > 0.01) return;
        this.zoomBy(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  zoomBy(f) {
    this.userZoom = clamp(this.userZoom * f, 0.55, 1.5);
    this.goal.radius = this.fitRadius * this.userZoom;
  }

  onDown(e) {
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.multi = true;
    }
    this.dragging = false;
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.onHover?.(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist && this.enabled) this.zoomBy(this.pinchDist / d);
      this.pinchDist = d;
      return;
    }
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (!this.dragging && moved > 10) this.dragging = true;
    if (this.dragging && this.enabled && this.cine.weight < 0.01) {
      const s = 3.2 / Math.max(300, Math.min(this.stage.width, this.stage.height));
      this.goal.az = clamp(this.goal.az - dx * s, -1.25, 1.25);
      this.goal.polar = clamp(this.goal.polar - dy * s, 0.05, 1.2);
      this._polarSetByUser = true;
    }
  }

  onUp(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    if (this.pointers.size === 0) {
      const wasMulti = this.multi;
      this.multi = false;
      if (!cancelled && !this.dragging && !wasMulti && performance.now() - p.t < 800) {
        this.onTap?.(e.clientX, e.clientY);
      }
      this.dragging = false;
    }
  }

  // 屏幕坐标 -> 与 y=h 平面的交点
  screenToPlane(cx, cy, h = 0.13) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }
}
