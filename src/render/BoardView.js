// 棋盘：花梨木棋盘面 + 石台（回纹石框）+ 浮空山岩 + 楚河汉界
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOARD_HALF_W, BOARD_HALF_D, RIVER_HALF } from './coords.js';
import {
  boardSurfaceTextures, woodCanvas, WOOD, stoneCanvas, canvasTexture, normalFromHeight, makeCanvas, valueNoise, fbm,
} from './textures.js';
import { River, RIVER_LEN } from './Water.js';

const STONE_EXT = 0.4; // 石框宽度
const STONE_HALF_D = BOARD_HALF_D + STONE_EXT;

// 回纹（云雷纹）贴图
function meanderTextures() {
  const W = 512;
  const H = 128;
  const draw = (ctx, color, lw) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    const unit = W / 4;
    const m = H * 0.18;
    for (let k = 0; k < 4; k++) {
      const x0 = k * unit;
      const s = H - 2 * m;
      // 方形回旋
      ctx.beginPath();
      ctx.moveTo(x0, H - m);
      ctx.lineTo(x0 + s * 0.95, H - m);
      ctx.lineTo(x0 + s * 0.95, m);
      ctx.lineTo(x0 + s * 0.2, m);
      ctx.lineTo(x0 + s * 0.2, H - m - s * 0.25);
      ctx.lineTo(x0 + s * 0.72, H - m - s * 0.25);
      ctx.lineTo(x0 + s * 0.72, m + s * 0.25);
      ctx.lineTo(x0 + s * 0.45, m + s * 0.25);
      ctx.lineTo(x0 + s * 0.45, m + s * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + s * 0.95, H - m);
      ctx.lineTo(x0 + unit, H - m);
      ctx.stroke();
    }
    // 上下细边
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, m * 0.35);
    ctx.lineTo(W, m * 0.35);
    ctx.moveTo(0, H - m * 0.35);
    ctx.lineTo(W, H - m * 0.35);
    ctx.stroke();
  };
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const stone = stoneCanvas(256, 64, [58, 52, 50], 21);
  ctx.drawImage(stone, 0, 0, W, H);
  ctx.globalAlpha = 0.9;
  draw(ctx, '#b08a4a', 9);
  ctx.globalAlpha = 1;
  const hc = makeCanvas(W, H);
  const hctx = hc.getContext('2d');
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, W, H);
  hctx.filter = 'blur(1.5px)';
  draw(hctx, '#fff', 10);
  const map = canvasTexture(c);
  const normal = canvasTexture(normalFromHeight(hc, 2.2), { srgb: false });
  for (const t of [map, normal]) t.wrapS = THREE.RepeatWrapping;
  return { map, normal };
}

// 浮空岩体
function makeRock(stoneTex) {
  const rx = BOARD_HALF_W + 0.2;
  const rz = STONE_HALF_D - 0.3;
  const profile = [
    [1.0, 0.0], [1.0, -0.4], [0.96, -1.0], [0.86, -1.9], [0.7, -3.0],
    [0.52, -4.3], [0.34, -5.6], [0.18, -6.8], [0.06, -7.8], [0.0, -8.3],
  ];
  const seg = 72;
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  for (let j = 0; j < profile.length; j++) {
    const [r, y] = profile[j];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const n = fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + y * 0.6, 4, 7);
      const jag = j === 0 ? 1 : 0.78 + n * 0.5 + (valueNoise(i * 0.9, j * 1.7, 3) - 0.5) * 0.18;
      const x = Math.cos(a) * rx * r * jag;
      const z = Math.sin(a) * rz * r * jag;
      pos.push(x, y - 1.0 + (j > 0 ? (n - 0.5) * 0.6 : 0), z);
      uv.push((i / seg) * 6, -y * 0.5);
      const shade = 0.55 + 0.45 * (1 - j / profile.length);
      col.push(shade, shade * 0.96, shade * 0.92);
    }
  }
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: stoneTex, vertexColors: true, roughness: 0.95, color: 0x9a8c84 });
  const m = new THREE.Mesh(geo, mat);
  return m;
}

function makeIslets(stoneTex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, color: 0xb8a89c });
  const spots = [[-22, -6, -14, 2.6], [26, -8, -9, 2.0], [-19, -9, 17, 1.6], [24, -4, 15, 1.2], [4, -11, -30, 3.2], [-32, -3, 2, 1.4]];
  for (const [x, y, z, s] of spots) {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 0.75 + valueNoise(v.x * 2 + x, v.z * 2 + z, 5) * 0.5;
      v.multiplyScalar(k);
      if (v.y > 0.2) v.y = 0.2 + (v.y - 0.2) * 0.3;
      else v.y *= 1.6;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.userData.base = y;
    m.userData.phase = Math.random() * 6;
    g.add(m);
  }
  return g;
}

export class BoardView {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    const hi = stage.quality === 'high';

    // ---- 木质棋盘面 ----
    const tex = boardSurfaceTextures(hi ? 2048 : 1400);
    const map = canvasTexture(tex.map);
    const normal = canvasTexture(tex.normal, { srgb: false });
    const topMat = new THREE.MeshPhysicalMaterial({
      map,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.58,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
    });
    const sideWood = canvasTexture(woodCanvas('sandal', 256, 256, WOOD.sandalwood), { repeat: true });
    const sideMat = new THREE.MeshStandardMaterial({ map: sideWood, roughness: 0.6, color: 0xc8a090 });

    const inlayDepth = BOARD_HALF_D - RIVER_HALF;
    for (const sgn of [1, -1]) {
      const geo = new THREE.BoxGeometry(BOARD_HALF_W * 2, 0.14, inlayDepth);
      const zc = sgn * (RIVER_HALF + inlayDepth / 2);
      // 顶面 UV 按世界坐标映射到整张棋盘贴图
      const p = geo.attributes.position;
      const n = geo.attributes.normal;
      const uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (n.getY(i) > 0.9) {
          const wx = p.getX(i);
          const wz = p.getZ(i) + zc;
          uv.setXY(i, (wx + BOARD_HALF_W) / (2 * BOARD_HALF_W), (BOARD_HALF_D - wz) / (2 * BOARD_HALF_D));
        }
      }
      const mesh = new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
      mesh.position.set(0, -0.07, zc);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.group.add(mesh);
    }

    // ---- 石台 ----
    const stoneTex = canvasTexture(stoneCanvas(256, 256, [74, 68, 66], 3), { repeat: true });
    stoneTex.repeat.set(3, 1);
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85, color: 0xb0a8a0 });
    const stoneDepth = STONE_HALF_D - RIVER_HALF;
    for (const sgn of [1, -1]) {
      const geo = new RoundedBoxGeometry(RIVER_LEN * 2, 1.0, stoneDepth, 2, 0.05);
      const mesh = new THREE.Mesh(geo, stoneMat);
      mesh.position.set(0, -0.52, sgn * (RIVER_HALF + stoneDepth / 2));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // 河道底（避免看穿）
    const bedGeo = new THREE.BoxGeometry(RIVER_LEN * 2, 0.5, RIVER_HALF * 2 + 0.02);
    const bed = new THREE.Mesh(bedGeo, stoneMat);
    bed.position.set(0, -0.78, 0);
    this.group.add(bed);

    // ---- 回纹石框 ----
    const mz = meanderTextures();
    const rimMat = (len) => {
      const m = mz.map.clone();
      const nm = mz.normal.clone();
      m.repeat.set(len / 1.6, 1);
      nm.repeat.set(len / 1.6, 1);
      m.needsUpdate = nm.needsUpdate = true;
      const top = new THREE.MeshStandardMaterial({ map: m, normalMap: nm, roughness: 0.55, metalness: 0.15 });
      return [stoneMat, stoneMat, top, stoneMat, stoneMat, stoneMat];
    };
    const rimH = 0.07;
    const addRim = (w, d, x, z, rotY, len) => {
      const geo = new THREE.BoxGeometry(w, rimH, d);
      const mesh = new THREE.Mesh(geo, rimMat(len));
      mesh.position.set(x, -0.02 + rimH / 2, z);
      mesh.rotation.y = rotY;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
    };
    const rimW = STONE_EXT - 0.02;
    const outerX = RIVER_LEN - rimW / 2;
    const outerZ = STONE_HALF_D - rimW / 2;
    // 两端（红/黑底线外）
    addRim(RIVER_LEN * 2, rimW, 0, outerZ, 0, RIVER_LEN * 2);
    addRim(RIVER_LEN * 2, rimW, 0, -outerZ, Math.PI, RIVER_LEN * 2);
    // 左右两侧（被河道截断）
    const sideLen = STONE_HALF_D - RIVER_HALF - rimW;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        addRim(sideLen, rimW, sx * outerX, sz * (RIVER_HALF + sideLen / 2), sx > 0 ? -Math.PI / 2 : Math.PI / 2, sideLen);
      }
    }

    // ---- 岩体 ----
    const rockTex = canvasTexture(stoneCanvas(256, 256, [88, 78, 72], 9), { repeat: true });
    this.rock = makeRock(rockTex);
    this.group.add(this.rock);
    this.islets = makeIslets(rockTex);
    this.group.add(this.islets);

    // ---- 河水 ----
    this.river = new River(stage);
    this.group.add(this.river.group);

    stage.add((dt, t) => {
      for (const m of this.islets.children) {
        m.position.y = m.userData.base + Math.sin(t * 0.4 + m.userData.phase) * 0.35;
        m.rotation.y += dt * 0.03;
      }
    });
  }
}

export { STONE_HALF_D };
