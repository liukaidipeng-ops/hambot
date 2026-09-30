// 棋盘坐标 <-> 世界坐标
// 为了让楚河汉界能容纳真实的流水与渡船，河道宽度 RIVER_GAP 大于普通格距。
export const CELL = 1;
export const RIVER_GAP = 2.3;
export const RIVER_HALF = 0.7; // 水面半宽
export const PIECE_R = 0.44;
export const PIECE_H = 0.26;
export const BOARD_MARGIN = 0.78;
export const BOARD_HALF_W = 4 * CELL + BOARD_MARGIN; // x 方向半宽
export const BOARD_HALF_D = 4 * CELL + RIVER_GAP / 2 + BOARD_MARGIN; // z 方向半深
export const SURFACE_Y = 0; // 棋盘面高度
export const WATER_Y = -0.1;

export function fileX(x) {
  return (x - 4) * CELL;
}

export function rankZ(y) {
  return y <= 4 ? (4 - y) * CELL + RIVER_GAP / 2 : -((y - 5) * CELL + RIVER_GAP / 2);
}

export function squareXZ(s) {
  const x = s % 9;
  const y = (s / 9) | 0;
  return { x: fileX(x), z: rankZ(y) };
}

// 世界坐标 -> 最近的交叉点，超出容差返回 -1
export function worldToSquare(wx, wz, tol = 0.55) {
  const x = Math.round(wx / CELL + 4);
  if (x < 0 || x > 8) return -1;
  let best = -1;
  let bestD = tol;
  for (let y = 0; y < 10; y++) {
    const d = Math.hypot(fileX(x) - wx, rankZ(y) - wz);
    if (d < bestD) {
      bestD = d;
      best = y * 9 + x;
    }
  }
  return best;
}

export const isRedHalf = (s) => ((s / 9) | 0) <= 4;
