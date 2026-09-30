// 程序化纹理：木纹、棋子刻字、棋盘线、石材等（全部由 Canvas 实时生成，无外部贴图）
import * as THREE from 'three';
import { PIECE_CHARS } from '../../shared/xiangqi.js';
import { CELL, RIVER_GAP, BOARD_HALF_W, BOARD_HALF_D, fileX, rankZ } from './coords.js';

// ---------- 噪声 ----------
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function fbm(x, y, oct = 4, seed = 0) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * valueNoise(x * f, y * f, seed + i * 17);
    f *= 2;
    amp *= 0.5;
  }
  return v;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 木纹 ----------
// 以像素方式生成：年轮 + 纤维，返回 ImageData 以便叠加
function woodPixels(w, h, opt) {
  const { light, dark, seed = 1, rings = 9, fiber = 0.18, warp = 1.2, figure = 0.5 } = opt;
  const img = new ImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const wv = fbm(u * 2.2, v * 1.1, 3, seed) - 0.5;
      const r = u * rings + wv * warp * 2.2 + Math.sin(v * Math.PI * 2 + seed) * 0.12 * warp;
      const band = Math.sin(r * Math.PI * 2) * 0.5 + 0.5;
      const late = Math.pow(band, 4);
      const fib = (valueNoise(u * 300, v * 5, seed + 5) - 0.5) * fiber + (valueNoise(u * 90, v * 2.5, seed + 9) - 0.5) * fiber * 0.8;
      const t = Math.min(1, Math.max(0, 0.18 + late * 0.5 * figure + band * 0.12 + fib + wv * 0.25));
      const i = (y * w + x) * 4;
      d[i] = lerp(light[0], dark[0], t);
      d[i + 1] = lerp(light[1], dark[1], t);
      d[i + 2] = lerp(light[2], dark[2], t);
      d[i + 3] = 255;
    }
  }
  return img;
}

const woodCache = new Map();
export function woodCanvas(key, w, h, opt) {
  const k = key + w + 'x' + h;
  if (woodCache.has(k)) return woodCache.get(k);
  const c = makeCanvas(w, h);
  c.getContext('2d').putImageData(woodPixels(w, h, opt), 0, 0);
  woodCache.set(k, c);
  return c;
}

export const WOOD = {
  // 黄杨木（棋子）
  boxwood: { light: [238, 204, 150], dark: [190, 140, 82], rings: 6, fiber: 0.12, seed: 11, warp: 0.7, figure: 0.55 },
  // 花梨木（棋盘面）
  rosewood: { light: [201, 136, 74], dark: [120, 62, 28], rings: 11, fiber: 0.22, seed: 23, warp: 0.9, figure: 0.8 },
  // 紫檀（边框）
  sandalwood: { light: [96, 40, 28], dark: [40, 14, 10], rings: 16, fiber: 0.25, seed: 37, warp: 0.6, figure: 0.9 },
};

// 由高度图生成法线贴图
export function normalFromHeight(heightCanvas, strength = 2.5) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => {
    x = Math.min(w - 1, Math.max(0, x));
    y = Math.min(h - 1, Math.max(0, y));
    return src[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function canvasTexture(canvas, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------- 棋子顶面 ----------
export const INK = {
  red: '#b3261e',
  redDeep: '#7d140f',
  black: '#1d2a22',
  blackDeep: '#0b120e',
};

const FONT_PIECE = '"WenKai", "KaiTi", "STKaiti", "楷体", serif';
export const FONT_BRUSH = '"MaShan", "WenKai", "KaiTi", "STKaiti", serif';

export function pieceFaceTextures(color, type, size = 512) {
  const ch = PIECE_CHARS[color][type];
  const inkMain = color === 0 ? INK.red : INK.black;
  // 颜色贴图
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const wood = woodCanvas('box' + type + color, 256, 256, { ...WOOD.boxwood, seed: 11 + type * 3 + color * 29 });
  ctx.drawImage(wood, 0, 0, size, size);
  // 中心略亮的油润感
  const g = ctx.createRadialGradient(size * 0.42, size * 0.38, size * 0.05, size / 2, size / 2, size * 0.55);
  g.addColorStop(0, 'rgba(255,240,210,0.22)');
  g.addColorStop(1, 'rgba(90,50,20,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // 刻槽：外圈 + 字
  const drawCarve = (context, fill, grow = 0) => {
    context.save();
    context.strokeStyle = fill;
    context.fillStyle = fill;
    context.lineWidth = size * 0.022 + grow;
    context.beginPath();
    context.arc(size / 2, size / 2, size * 0.405, 0, Math.PI * 2);
    context.stroke();
    context.font = `${Math.round(size * 0.56)}px ${FONT_PIECE}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = size * 0.028 + grow;
    context.lineJoin = 'round';
    const ty = size * 0.53;
    context.strokeText(ch, size / 2, ty);
    context.fillText(ch, size / 2, ty);
    context.restore();
  };
  // 刻痕内阴影
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.translate(size * 0.006, size * 0.008);
  drawCarve(ctx, '#3a1c0c', size * 0.012);
  ctx.restore();
  drawCarve(ctx, inkMain);
  // 墨色里的细微不均匀
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.restore();

  // 高度图：木面 = 白，刻槽 = 黑
  const hc = makeCanvas(size, size);
  const hctx = hc.getContext('2d');
  hctx.fillStyle = '#fff';
  hctx.fillRect(0, 0, size, size);
  hctx.filter = `blur(${Math.max(1, size / 256)}px)`;
  drawCarve(hctx, '#000');
  hctx.filter = 'none';
  // 边缘轻微倒角
  const eg = hctx.createRadialGradient(size / 2, size / 2, size * 0.44, size / 2, size / 2, size * 0.5);
  eg.addColorStop(0, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(0,0,0,0.5)');
  hctx.fillStyle = eg;
  hctx.fillRect(0, 0, size, size);
  const nc = normalFromHeight(hc, 3.2);

  // 粗糙度：刻槽内更粗糙
  const rc = makeCanvas(size, size);
  const rctx = rc.getContext('2d');
  rctx.fillStyle = 'rgb(95,95,95)';
  rctx.fillRect(0, 0, size, size);
  drawCarve(rctx, 'rgb(200,200,200)');

  return { map: c, normal: nc, rough: rc };
}

// ---------- 棋盘面 ----------
// 返回棋盘顶面贴图（整块，含河道区域——河道由水面覆盖）
export function boardSurfaceTextures(res = 2048) {
  const W = res;
  const H = Math.round(res * (BOARD_HALF_D / BOARD_HALF_W));
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const wood = woodCanvas('rose', 512, 512, WOOD.rosewood);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(wood, -H / 2, -W / 2, H, W);
  ctx.restore();
  // 做旧：边缘暗角 + 斑驳
  const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.75);
  vg.addColorStop(0, 'rgba(255,220,170,0.10)');
  vg.addColorStop(1, 'rgba(40,15,5,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const sx = W / (BOARD_HALF_W * 2);
  const sz = H / (BOARD_HALF_D * 2);
  const P = (wx, wz) => [(wx + BOARD_HALF_W) * sx, (wz + BOARD_HALF_D) * sz];

  const drawLines = (context, color, widthScale = 1) => {
    context.save();
    context.strokeStyle = color;
    context.lineCap = 'round';
    const lw = 0.028 * sx * widthScale;
    context.lineWidth = lw;
    const line = (x1, z1, x2, z2) => {
      const [a, b] = P(x1, z1);
      const [cc, d] = P(x2, z2);
      context.beginPath();
      context.moveTo(a, b);
      context.lineTo(cc, d);
      context.stroke();
    };
    // 横线
    for (let y = 0; y < 10; y++) line(fileX(0), rankZ(y), fileX(8), rankZ(y));
    // 竖线（河道处断开，两侧边线延伸到河岸）
    for (let x = 0; x < 9; x++) {
      line(fileX(x), rankZ(0), fileX(x), rankZ(4));
      line(fileX(x), rankZ(5), fileX(x), rankZ(9));
    }
    // 九宫斜线
    line(fileX(3), rankZ(0), fileX(5), rankZ(2));
    line(fileX(5), rankZ(0), fileX(3), rankZ(2));
    line(fileX(3), rankZ(7), fileX(5), rankZ(9));
    line(fileX(5), rankZ(7), fileX(3), rankZ(9));
    // 外框粗线
    context.lineWidth = lw * 2.4;
    const m = 0.16;
    context.strokeRect(
      P(fileX(0) - m, 0)[0], P(0, rankZ(9) - m)[1],
      (8 + 2 * m) * sx, (rankZ(0) - rankZ(9) + 2 * m) * sz,
    );
    // 炮、兵位花标
    context.lineWidth = lw * 0.9;
    const marks = [[1, 2], [7, 2], [1, 7], [7, 7], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]];
    const g = 0.08;
    const L = 0.2;
    for (const [mx, my] of marks) {
      const cx = fileX(mx);
      const cz = rankZ(my);
      for (const sxn of [-1, 1]) {
        if ((mx === 0 && sxn < 0) || (mx === 8 && sxn > 0)) continue;
        for (const szn of [-1, 1]) {
          const ax = cx + sxn * g;
          const az = cz + szn * g;
          line(ax, az, ax + sxn * L, az);
          line(ax, az, ax, az + szn * L);
        }
      }
    }
    context.restore();
  };
  // 墨线（带轻微晕染）
  ctx.save();
  ctx.filter = `blur(${Math.max(1, W / 1400)}px)`;
  drawLines(ctx, 'rgba(30,12,4,0.55)', 1.5);
  ctx.restore();
  drawLines(ctx, 'rgba(26,10,3,0.92)', 1);

  // 坐标数字
  ctx.save();
  ctx.fillStyle = 'rgba(40,16,6,0.8)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cn = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
  ctx.font = `${Math.round(0.3 * sx)}px ${FONT_PIECE}`;
  for (let x = 0; x < 9; x++) {
    const [px, pz] = P(fileX(x), rankZ(0) + 0.5);
    ctx.fillText(cn[x], px, pz);
    const [qx, qz] = P(fileX(x), rankZ(9) - 0.5);
    ctx.save();
    ctx.translate(qx, qz);
    ctx.rotate(Math.PI);
    ctx.fillText(String(x + 1), 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // 高度图（刻线）
  const hc = makeCanvas(W / 2, H / 2);
  const hctx = hc.getContext('2d');
  hctx.fillStyle = '#fff';
  hctx.fillRect(0, 0, hc.width, hc.height);
  hctx.scale(0.5, 0.5);
  hctx.filter = 'blur(1px)';
  drawLines(hctx, '#000', 1.1);
  const nc = normalFromHeight(hc, 1.6);
  return { map: c, normal: nc };
}

// ---------- 河床文字 ----------
export function riverbedTexture(w = 2048, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  // 河床：深青石 + 卵石噪声
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 40, y / 40, 4, 5);
      const pebble = Math.pow(valueNoise(x / 9, y / 9, 8), 3);
      const i = (y * w + x) * 4;
      const edge = Math.min(y, h - 1 - y) / (h * 0.5);
      const shade = 0.55 + n * 0.5 + pebble * 0.35;
      d[i] = 34 * shade * (0.6 + edge * 0.5);
      d[i + 1] = 58 * shade * (0.6 + edge * 0.5);
      d[i + 2] = 52 * shade * (0.6 + edge * 0.5);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 金色篆刻文字
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(h * 0.72)}px ${FONT_BRUSH}`;
  const drawWord = (text, cx, flip) => {
    ctx.save();
    ctx.translate(cx, h * 0.52);
    if (flip) ctx.rotate(Math.PI);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = h * 0.05;
    ctx.fillStyle = '#e8c36a';
    const chars = [...text];
    const gap = h * 0.95;
    chars.forEach((ch, i) => ctx.fillText(ch, (i - (chars.length - 1) / 2) * gap, 0));
    ctx.restore();
  };
  // 楚河面向黑方（旋转 180°），汉界面向红方
  drawWord('楚河', w * 0.28, true);
  drawWord('漢界', w * 0.72, false);
  ctx.restore();
  return c;
}

// ---------- 石材 ----------
export function stoneCanvas(w = 512, h = 512, tint = [70, 66, 62], seed = 3) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 64, y / 64, 5, seed);
      const vein = Math.pow(1 - Math.abs(Math.sin((x / w) * 8 + n * 6)), 12) * 0.3;
      const speck = valueNoise(x / 2.5, y / 2.5, seed + 3) > 0.93 ? 0.15 : 0;
      const s = 0.62 + n * 0.55 + vein + speck;
      const i = (y * w + x) * 4;
      d[i] = tint[0] * s;
      d[i + 1] = tint[1] * s;
      d[i + 2] = tint[2] * s;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- 通用 ----------
export function radialGlowTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c, { srgb: false });
}

export function textCanvas(text, { font = FONT_BRUSH, size = 256, color = '#fff', w, h, stroke, strokeWidth = 0 } = {}) {
  const chars = [...text];
  const c = makeCanvas(w || size * chars.length, h || size);
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.86)}px ${font}`;
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, c.width / 2, c.height / 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, c.height / 2);
  return c;
}

export { makeCanvas, CELL, RIVER_GAP };
