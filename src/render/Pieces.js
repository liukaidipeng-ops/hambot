// 棋子：黄杨木车削棋子 + 刻字顶面；选中/可走标记/将军提示
import * as THREE from 'three';
import { KING, pieceColor, pieceType } from '../../shared/xiangqi.js';
import { squareXZ, PIECE_R, PIECE_H } from './coords.js';
import { pieceFaceTextures, woodCanvas, WOOD, canvasTexture, radialGlowTexture } from './textures.js';
import { Ease } from '../core/anim.js';

const PROFILE = [
  [0.0, 0.0], [0.395, 0.0], [0.425, 0.01], [0.438, 0.035], [0.44, 0.06],
  [0.44, 0.2], [0.437, 0.228], [0.428, 0.248], [0.414, 0.26],
];

export class PieceSet {
  constructor(stage, anim) {
    this.stage = stage;
    this.anim = anim;
    this.group = new THREE.Group();
    this.meshes = new Map(); // sq -> piece group
    this.all = new Set();
    const hi = stage.quality !== 'low';

    this.sideGeo = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 64);
    this.topGeo = new THREE.CircleGeometry(0.414, 64);
    this.topGeo.rotateX(-Math.PI / 2);
    this.topGeo.translate(0, PIECE_H + 0.0005, 0);

    const sideTex = canvasTexture(woodCanvas('boxside', 256, 256, { ...WOOD.boxwood, seed: 91, rings: 5 }), { repeat: true });
    sideTex.repeat.set(3, 1);
    this.sideMat = new THREE.MeshPhysicalMaterial({
      map: sideTex,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.25,
      color: 0xf0dcc0,
    });

    // 14 种顶面材质
    this.topMats = [[], []];
    const size = hi ? 512 : 256;
    for (const color of [0, 1]) {
      for (let t = 1; t <= 7; t++) {
        const tx = pieceFaceTextures(color, t, size);
        const mat = new THREE.MeshPhysicalMaterial({
          map: canvasTexture(tx.map),
          normalMap: canvasTexture(tx.normal, { srgb: false }),
          normalScale: new THREE.Vector2(1.1, 1.1),
          roughnessMap: canvasTexture(tx.rough, { srgb: false }),
          roughness: 1,
          clearcoat: 0.55,
          clearcoatRoughness: 0.28,
          emissive: new THREE.Color(0x000000),
        });
        this.topMats[color][t] = mat;
      }
    }

    // 标记
    this.glowTex = radialGlowTexture(128);
    this.ringTex = ringTexture();
    this.selRing = this.makeDisc(1.35, 0xffd27a, this.ringTex);
    this.selRing.visible = false;
    this.group.add(this.selRing);
    this.hoverRing = this.makeDisc(1.15, 0xfff0c0, this.ringTex, 0.35);
    this.hoverRing.visible = false;
    this.group.add(this.hoverRing);
    this.checkRing = this.makeDisc(1.6, 0xff3020, this.glowTex);
    this.checkRing.visible = false;
    this.group.add(this.checkRing);
    this.lastFrom = this.makeDisc(0.9, 0xffe0a0, this.ringTex, 0.28);
    this.lastTo = this.makeDisc(1.25, 0xffc860, this.glowTex, 0.35);
    this.lastFrom.visible = this.lastTo.visible = false;
    this.group.add(this.lastFrom, this.lastTo);
    this.targetPool = [];
    this.targets = [];

    this.selected = null;
    this.checkSq = -1;
    stage.add((dt, t) => this.update(dt, t));
  }

  makeDisc(size, color, tex, opacity = 1) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: tex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 5;
    m.userData.baseOpacity = opacity;
    return m;
  }

  createPiece(p) {
    const color = pieceColor(p);
    const type = pieceType(p);
    const g = new THREE.Group();
    const side = new THREE.Mesh(this.sideGeo, this.sideMat);
    side.castShadow = true;
    side.receiveShadow = true;
    const top = new THREE.Mesh(this.topGeo, this.topMats[color][type].clone());
    top.receiveShadow = true;
    top.castShadow = false;
    top.rotation.y = color === 1 ? Math.PI : 0;
    g.add(side, top);
    g.userData = { piece: p, color, type, top, side, lift: 0, liftGoal: 0, sq: -1 };
    this.group.add(g);
    this.all.add(g);
    return g;
  }

  // 根据棋盘重建全部棋子（开局、悔棋、重连）
  sync(board) {
    const want = new Map();
    for (let s = 0; s < 90; s++) if (board[s]) want.set(s, board[s]);
    // 复用：同位置同棋子保留
    const keep = new Map();
    for (const [s, g] of this.meshes) {
      if (want.get(s) === g.userData.piece) keep.set(s, g);
      else this.disposePiece(g);
    }
    this.meshes = keep;
    for (const [s, p] of want) {
      if (this.meshes.has(s)) continue;
      const g = this.createPiece(p);
      this.place(g, s);
      this.meshes.set(s, g);
    }
    this.clearMarkers();
  }

  disposePiece(g) {
    this.group.remove(g);
    this.all.delete(g);
    g.userData.top.material.dispose();
  }

  place(g, s) {
    const { x, z } = squareXZ(s);
    g.position.set(x, 0, z);
    g.userData.sq = s;
    g.rotation.set(0, 0, 0);
    g.scale.setScalar(1);
    g.visible = true;
  }

  at(s) {
    return this.meshes.get(s) || null;
  }

  // 逻辑上移动（动画由外部控制）
  relocate(from, to) {
    const g = this.meshes.get(from);
    const victim = this.meshes.get(to) || null;
    this.meshes.delete(from);
    if (victim) this.meshes.delete(to);
    if (g) {
      this.meshes.set(to, g);
      g.userData.sq = to;
    }
    return { mover: g, victim };
  }

  // 默认走子动画：抬起、弧线平移、落下
  async animateSlide(g, to, { duration, arc, onLand } = {}) {
    const { x, z } = squareXZ(to);
    const sx = g.position.x;
    const sz = g.position.z;
    const dist = Math.hypot(x - sx, z - sz);
    const dur = duration ?? 0.32 + Math.min(dist, 9) * 0.045;
    const h = arc ?? Math.min(0.9, 0.25 + dist * 0.08);
    g.userData.liftGoal = 0;
    await this.anim.tween(dur, (t) => {
      g.position.x = sx + (x - sx) * t;
      g.position.z = sz + (z - sz) * t;
      g.position.y = Math.sin(Math.PI * t) * h + g.userData.lift * (1 - t);
    }, Ease.inOutCubic);
    g.position.set(x, 0, z);
    g.userData.lift = 0;
    onLand?.();
    // 落子轻颤
    const base = g.scale.x;
    this.anim.tween(0.18, (t) => {
      const s = 1 + Math.sin(t * Math.PI) * 0.05;
      g.scale.set(base * s, base / s, base * s);
    }, Ease.linear);
  }

  // ---------- 标记 ----------
  select(s) {
    if (this.selected !== null) {
      const g = this.meshes.get(this.selected);
      if (g) g.userData.liftGoal = 0;
    }
    this.selected = s;
    if (s === null || s < 0) {
      this.selRing.visible = false;
      this.selected = null;
      return;
    }
    const g = this.meshes.get(s);
    if (g) g.userData.liftGoal = 0.32;
    const { x, z } = squareXZ(s);
    this.selRing.position.set(x, 0.015, z);
    this.selRing.visible = true;
  }

  hover(s) {
    if (s === null || s < 0) {
      this.hoverRing.visible = false;
      return;
    }
    const { x, z } = squareXZ(s);
    this.hoverRing.position.set(x, 0.012, z);
    this.hoverRing.visible = true;
  }

  showTargets(list, board, color = 0xffd27a) {
    this.clearTargets();
    for (const s of list) {
      const capture = !!board[s];
      let m = this.targetPool.pop();
      if (!m) {
        m = this.makeDisc(1, 0xffffff, this.glowTex);
        this.group.add(m);
      }
      m.material.map = capture ? this.ringTex : this.glowTex;
      m.material.color.set(capture ? 0xff4a30 : color);
      m.userData.capture = capture;
      m.userData.phase = Math.random() * 6;
      const { x, z } = squareXZ(s);
      m.position.set(x, capture ? 0.02 : 0.03, z);
      m.visible = true;
      m.userData.baseScale = capture ? 1.3 : 0.42;
      this.targets.push(m);
    }
  }

  clearTargets() {
    for (const m of this.targets) {
      m.visible = false;
      this.targetPool.push(m);
    }
    this.targets = [];
  }

  showLastMove(from, to) {
    if (from < 0) {
      this.lastFrom.visible = this.lastTo.visible = false;
      return;
    }
    const a = squareXZ(from);
    const b = squareXZ(to);
    this.lastFrom.position.set(a.x, 0.011, a.z);
    this.lastTo.position.set(b.x, 0.011, b.z);
    this.lastFrom.visible = this.lastTo.visible = true;
  }

  setCheck(s) {
    this.checkSq = s;
    if (s < 0 || s === null) {
      this.checkRing.visible = false;
      for (const g of this.all) if (g.userData.type === KING) g.userData.top.material.emissive.setRGB(0, 0, 0);
      return;
    }
    const { x, z } = squareXZ(s);
    this.checkRing.position.set(x, 0.02, z);
    this.checkRing.visible = true;
  }

  clearMarkers() {
    this.select(null);
    this.clearTargets();
    this.hover(null);
    this.setCheck(-1);
  }

  update(dt, t) {
    const k = 1 - Math.exp(-dt * 14);
    for (const g of this.all) {
      const u = g.userData;
      if (u.animating) continue;
      if (Math.abs(u.lift - u.liftGoal) > 0.0005 || u.liftGoal > 0) {
        u.lift += (u.liftGoal - u.lift) * k;
        const bob = u.liftGoal > 0 ? Math.sin(t * 3.2) * 0.03 : 0;
        g.position.y = u.lift + bob;
      }
    }
    if (this.selRing.visible) {
      this.selRing.rotation.z = t * 0.8;
      const s = 1 + Math.sin(t * 4) * 0.04;
      this.selRing.scale.set(s, s, s);
    }
    for (const m of this.targets) {
      const p = 1 + Math.sin(t * 4 + m.userData.phase) * 0.12;
      const s = m.userData.baseScale * p;
      m.scale.set(s, s, s);
      if (m.userData.capture) m.rotation.z = -t * 1.2;
    }
    if (this.checkRing.visible) {
      const s = 1 + Math.sin(t * 7) * 0.15;
      this.checkRing.scale.set(s, s, s);
      this.checkRing.material.opacity = 0.7 + Math.sin(t * 7) * 0.3;
      const g = this.meshes.get(this.checkSq);
      if (g) g.userData.top.material.emissive.setRGB(0.35 + Math.sin(t * 7) * 0.25, 0.02, 0.0);
    }
  }
}

function ringTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.7, 'rgba(255,255,255,1)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // 刻度
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = size * 0.012;
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.beginPath();
    ctx.moveTo(size * 0.4, 0);
    ctx.lineTo(size * (i % 6 === 0 ? 0.47 : 0.44), 0);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export { PIECE_R };
