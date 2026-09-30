// 特效导演：根据走法选择动画（普通走子 / 渡河 / 行军 / 吃子战斗电影镜头）
import * as THREE from 'three';
import { KING, ADVISOR, ELEPHANT, HORSE, ROOK, CANNON, PAWN, pieceType, pieceColor, RED } from '../../shared/xiangqi.js';
import { squareXZ, rankZ, RIVER_HALF, WATER_Y } from '../render/coords.js';
import { ParticleSystem } from './Particles.js';
import { Debris } from './Debris.js';
import { Ease, rand } from '../core/anim.js';
import { canvasTexture, woodCanvas, WOOD, radialGlowTexture } from '../render/textures.js';
import { settings } from '../core/settings.js';
import { stampText } from '../ui/stamp.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const TEAM = [
  { glow: new THREE.Color('#ff5a26'), accent: new THREE.Color('#ffcf6a'), metal: new THREE.Color('#8a5a32'), cloth: new THREE.Color('#a8231b'), name: '汉' },
  { glow: new THREE.Color('#4f8dff'), accent: new THREE.Color('#9fd0ff'), metal: new THREE.Color('#3e4650'), cloth: new THREE.Color('#1f2a3a'), name: '楚' },
];

export class FX {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    this.anim = app.anim;
    this.rig = app.rig;
    this.pieces = app.pieces;
    this.audio = app.audio;
    this.river = app.board.river;
    this.group = new THREE.Group();
    this.stage.scene.add(this.group);

    this.sparks = new ParticleSystem(1800, true);
    this.smoke = new ParticleSystem(900, false);
    this.group.add(this.smoke.mesh, this.sparks.mesh);
    const chipTex = canvasTexture(woodCanvas('chip', 128, 128, { ...WOOD.boxwood, seed: 5 }));
    this.debris = new Debris(300, chipTex);
    this.group.add(this.debris.mesh);

    this.flashLight = new THREE.PointLight(0xffa050, 0, 12, 1.6);
    this.flashLight.position.set(0, 1, 0);
    this.group.add(this.flashLight);

    this.ringTex = radialGlowTexture(128);
    this.waveTex = shockTexture();
    this.pool = [];

    this.cinematics = {};
    this.stage.add((dt) => {
      this.sparks.update(dt);
      this.smoke.update(dt);
      this.debris.update(dt);
      if (this.flashLight.intensity > 0.01) this.flashLight.intensity *= Math.exp(-dt * 7);
      else this.flashLight.intensity = 0;
    });
  }

  get level() {
    return settings.get('effects');
  }

  register(type, fn) {
    this.cinematics[type] = fn;
  }

  sq(s, y = 0) {
    const { x, z } = squareXZ(s);
    return V(x, y, z);
  }

  // 估计动画时长（用于计时补偿）
  estimateDuration(rec) {
    const lv = this.level;
    if (lv === 'off') return 0.5;
    if (rec.captured) return lv === 'full' ? 4.2 : 1.2;
    if (rec.crossesRiver) return 2.2;
    if ((rec.piece & 7) === PAWN && lv === 'full') return 1.8;
    return 0.6;
  }

  // ---------- 主入口 ----------
  async playMove(rec, match) {
    const { mover, victim } = this.pieces.relocate(rec.from, rec.to);
    if (!mover) return;
    const type = pieceType(rec.piece);
    const lv = this.level;
    this.skipping = false;
    mover.userData.animating = true;
    mover.userData.liftGoal = 0;
    try {
      if (rec.captured && victim) {
        const cine = this.cinematics[type];
        if (lv === 'full' && cine) await cine(this, rec, mover, victim);
        else await this.basicCapture(rec, mover, victim);
      } else if (rec.crossesRiver && lv !== 'off' && this.cinematics.boat) {
        await this.cinematics.boat(this, rec, mover);
      } else if (type === PAWN && lv === 'full' && this.cinematics.march) {
        await this.cinematics.march(this, rec, mover);
      } else {
        await this.basicMove(rec, mover);
      }
    } finally {
      mover.userData.animating = false;
      mover.userData.lift = 0;
      const p = this.sq(rec.to);
      mover.position.set(p.x, 0, p.z);
      mover.rotation.set(0, 0, 0);
      mover.scale.setScalar(1);
      mover.visible = true;
      if (victim && victim.parent) this.pieces.disposePiece(victim);
      this.rig.cine.weight = Math.min(this.rig.cine.weight, 1);
      if (this.rig.cine.weight > 0) this.cameraRelease(0.6);
      this.stage.timeScale = 1;
    }
  }

  // ---------- 基础动画 ----------
  async basicMove(rec, mover) {
    const type = pieceType(rec.piece);
    const hop = type === HORSE ? 0.9 : type === ELEPHANT ? 0.7 : undefined;
    await this.pieces.animateSlide(mover, rec.to, {
      arc: hop,
      onLand: () => this.landing(rec.to, pieceColor(rec.piece)),
    });
    await this.anim.wait(0.05);
  }

  async basicCapture(rec, mover, victim) {
    const to = this.sq(rec.to);
    await this.pieces.animateSlide(mover, rec.to, {
      duration: 0.42,
      arc: 0.7,
      onLand: () => {
        this.shatter(victim, { dir: to.clone().sub(this.sq(rec.from)).normalize(), power: 1 });
        this.impact(to, pieceColor(rec.piece), 0.8);
        this.audio.play('capture');
      },
    });
    await this.anim.wait(0.35);
  }

  landing(s, color, strength = 1) {
    const p = this.sq(s, 0.02);
    this.audio.play('clack', { strength });
    this.dustRing(p, 0.6 * strength);
    if (Math.abs(p.z) < RIVER_HALF + 0.5) this.river.ripple(p.x, Math.sign(p.z) * (RIVER_HALF - 0.05), 0.4);
  }

  // ---------- 通用特效 ----------
  dustRing(p, strength = 1, color = 0xd8b890) {
    this.smoke.emit({
      count: Math.round(14 * strength),
      pos: () => [p.x + rand(-0.15, 0.15), p.y + 0.03, p.z + rand(-0.15, 0.15)],
      vel: () => {
        const a = Math.random() * Math.PI * 2;
        const s = rand(0.8, 1.8) * strength;
        return [Math.cos(a) * s, rand(0.05, 0.3), Math.sin(a) * s];
      },
      life: [0.6, 1.1],
      size: [0.15, 0.25],
      sizeEnd: [0.5, 0.8],
      color,
      alpha: 0.45,
      drag: 3.2,
      tile: 'smoke',
      spin: [0.5, 1.5],
    });
  }

  impact(p, color = 0, strength = 1) {
    const team = TEAM[color];
    this.sparks.emit({
      count: Math.round(40 * strength),
      pos: [p.x, p.y + 0.2, p.z],
      vel: () => {
        const a = Math.random() * Math.PI * 2;
        const s = rand(2, 6) * strength;
        return [Math.cos(a) * s, rand(1, 5), Math.sin(a) * s];
      },
      life: [0.3, 0.8],
      size: [0.03, 0.06],
      color: team.accent,
      colorEnd: team.glow,
      alpha: 1,
      gravity: 9,
      drag: 1.5,
      tile: 'dot',
      stretch: 0.08,
    });
    this.sparks.emit({
      count: 1,
      pos: [p.x, p.y + 0.25, p.z],
      life: 0.35,
      size: 1.2 * strength,
      sizeEnd: 2.4 * strength,
      color: team.accent,
      alpha: 0.9,
      tile: 'glow',
    });
    this.shockwave(p, team.glow, 2.2 * strength);
    this.dustRing(p, 1.2 * strength);
    this.lightFlash(p, team.glow, 6 * strength);
    this.stage.shake(0.08 * strength, 5);
  }

  lightFlash(p, color, intensity = 8) {
    this.flashLight.position.set(p.x, p.y + 0.8, p.z);
    this.flashLight.color.set(color);
    this.flashLight.intensity = intensity;
  }

  shockwave(p, color, size = 2.5, dur = 0.55) {
    let m = this.pool.pop();
    if (!m) {
      m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: this.waveTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 8;
    }
    m.material.color.set(color);
    m.position.set(p.x, Math.max(p.y, 0) + 0.03, p.z);
    this.group.add(m);
    this.anim
      .tween(dur, (t) => {
        const s = 0.2 + size * t;
        m.scale.set(s, s, s);
        m.material.opacity = (1 - t) * 1.2;
      }, Ease.outCubic)
      .then(() => {
        this.group.remove(m);
        this.pool.push(m);
      });
  }

  // 棋子碎裂：两半 + 碎屑
  shatter(g, { dir = V(0, 0, 1), power = 1, split = true } = {}) {
    if (!g || !g.parent) return;
    const pos = g.getWorldPosition(V());
    const color = g.userData.color;
    const ink = color === RED ? 0xb3261e : 0x1d2a22;
    this.debris.burst(pos.clone().setY(0.15), {
      count: Math.round(26 * power),
      speed: 2.4 * power,
      up: 3 * power,
      colors: [0xfff1dc, 0xf0d7b0, 0xe8c9a0, ink],
      dir: dir.clone().multiplyScalar(0.6),
    });
    if (split) this.splitHalves(g, dir, power);
    else g.visible = false;
  }

  // 把棋子沿切面分成两半飞出（切线沿 dir 方向）
  splitHalves(g, dir = V(0, 0, 1), power = 1) {
    const { top, side } = g.userData;
    const d = dir.clone().setY(0);
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize();
    const n = V(d.z, 0, -d.x); // 切面法线
    const alpha = Math.atan2(-n.z, n.x);
    const r = top.rotation.y || 0;
    if (!this.cutMat) {
      this.cutMat = side.material.clone();
      this.cutMat.side = THREE.DoubleSide;
      this.cutMat.color = new THREE.Color(0xe8c9a0);
    }
    const halves = [];
    const base = g.getWorldPosition(V());
    for (const k of [0, 1]) {
      const h = new THREE.Group();
      const topGeo = new THREE.CircleGeometry(0.414, 32, alpha - r - Math.PI / 2 + k * Math.PI, Math.PI);
      topGeo.rotateX(-Math.PI / 2);
      topGeo.translate(0, 0.2605, 0);
      const t = new THREE.Mesh(topGeo, top.material);
      t.rotation.y = r;
      const sideGeo = new THREE.LatheGeometry(side.geometry.parameters.points, 32, alpha + k * Math.PI, Math.PI);
      const sm = new THREE.Mesh(sideGeo, side.material);
      sm.castShadow = true;
      const cutGeo = new THREE.PlaneGeometry(0.86, 0.25);
      cutGeo.translate(0, 0.13, 0);
      const cut = new THREE.Mesh(cutGeo, this.cutMat);
      cut.rotation.y = Math.atan2(n.x, n.z);
      h.add(t, sm, cut);
      h.position.copy(base);
      this.group.add(h);
      const out = n.clone().multiplyScalar(k ? -1 : 1);
      const vel = out.multiplyScalar(1.6 * power).add(d.clone().multiplyScalar(1.2 * power)).setY(2.0 * power);
      const spinAxis = d.clone().multiplyScalar((k ? -1 : 1) * rand(5, 9) * power);
      this.debris.addBody(h, {
        vel,
        ang: spinAxis.add(V(0, rand(-3, 3), 0)),
        life: 2.6,
        onDone: () => {
          this.group.remove(h);
          topGeo.dispose();
          sideGeo.dispose();
          cutGeo.dispose();
        },
      });
      halves.push(h);
    }
    g.visible = false;
    return halves;
  }

  // 整颗棋子被击飞
  launch(g, vel, ang = V(8, 2, 6), life = 2.2) {
    const wrap = new THREE.Group();
    wrap.position.copy(g.position);
    g.parent.remove(g);
    g.position.set(0, 0, 0);
    wrap.add(g);
    this.group.add(wrap);
    const body = this.debris.addBody(wrap, {
      vel,
      ang,
      life,
      onDone: () => {
        this.group.remove(wrap);
      },
    });
    return body;
  }

  // ---------- 镜头 ----------
  cameraTo(pos, look, dur = 1, fov = 40, ease = Ease.inOutCubic) {
    const cine = this.rig.cine;
    const cam = this.stage.camera;
    if (cine.weight < 0.01) {
      cine.pos.copy(cam.position);
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      cine.look.copy(this.rig.target);
      cine.fov = cam.fov;
    }
    const p0 = cine.pos.clone();
    const l0 = cine.look.clone();
    const f0 = cine.fov;
    const w0 = cine.weight;
    return this.anim.tween(dur, (t) => {
      cine.pos.lerpVectors(p0, pos, t);
      cine.look.lerpVectors(l0, look, t);
      cine.fov = f0 + (fov - f0) * t;
      cine.weight = w0 + (1 - w0) * t;
    }, ease);
  }

  cameraRelease(dur = 0.9) {
    const cine = this.rig.cine;
    const w0 = cine.weight;
    if (w0 <= 0) return Promise.resolve();
    return this.anim.tween(dur, (t) => {
      cine.weight = w0 * (1 - t);
    }, Ease.inOutCubic);
  }

  // 慢动作
  async slowmo(scale = 0.25, dur = 0.5) {
    const st = this.stage;
    await this.anim.tween(0.08, (t) => (st.timeScale = 1 + (scale - 1) * t), Ease.linear, true);
    await this.anim.waitReal(dur);
    await this.anim.tween(0.25, (t) => (st.timeScale = scale + (1 - scale) * t), Ease.inQuad, true);
    st.timeScale = 1;
  }

  // ---------- 悔棋回放 ----------
  async rewind(board) {
    this.debris.clear();
    this.sparks.clear();
    this.smoke.clear();
    this.audio.play('whoosh');
    this.stage.flash(0.25, 0x9fd0ff);
    this.pieces.sync(board);
    await this.anim.wait(0.1);
  }

  // ---------- 将军 ----------
  async checkStamp(rec) {
    const color = pieceColor(rec.piece);
    this.audio.play('check');
    this.stage.shake(0.06, 4);
    await stampText('将', { color: color === RED ? '#d8321f' : '#1a1a1a', sub: '将军', duration: 1100 });
  }

  async mateStamp(result) {
    this.audio.play('mate');
    this.stage.flash(0.4, 0xffc070);
    const txt = result.reason === 'checkmate' ? '绝杀' : result.reason === 'stalemate' ? '困毙' : null;
    if (txt) await stampText(txt, { color: '#c0271b', duration: 1800, big: true });
  }
}

function shockTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.9, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export { V, rankZ, RIVER_HALF, WATER_Y, KING, ADVISOR, ELEPHANT, HORSE, ROOK, CANNON, PAWN };
