// 中国象棋规则引擎（前端、服务器、AI 共用）
// 棋盘 9 列 × 10 行，索引 s = y * 9 + x；y = 0 为红方底线，y = 9 为黑方底线。

export const RED = 0;
export const BLACK = 1;

export const KING = 1;
export const ADVISOR = 2;
export const ELEPHANT = 3;
export const HORSE = 4;
export const ROOK = 5;
export const CANNON = 6;
export const PAWN = 7;

export const TYPE_NAMES = ['', 'king', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'pawn'];

// 棋子上的字（红 / 黑）
export const PIECE_CHARS = [
  ['', '帥', '仕', '相', '傌', '俥', '炮', '兵'],
  ['', '將', '士', '象', '馬', '車', '砲', '卒'],
];
// 记谱用字
export const NOTATION_CHARS = [
  ['', '帅', '仕', '相', '马', '车', '炮', '兵'],
  ['', '将', '士', '象', '马', '车', '炮', '卒'],
];

const FEN_CHARS = ' kabnrcp';

export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

export const pieceColor = (p) => p >> 3;
export const pieceType = (p) => p & 7;
export const makePiece = (color, type) => (color << 3) | type;
export const sqOf = (x, y) => y * 9 + x;
export const fileOf = (s) => s % 9;
export const rankOf = (s) => (s / 9) | 0;
export const moveFrom = (m) => m & 127;
export const moveTo = (m) => m >> 7;
export const encodeMove = (from, to) => from | (to << 7);

const inBoard = (x, y) => x >= 0 && x < 9 && y >= 0 && y < 10;
const inPalace = (x, y) => x >= 3 && x <= 5 && ((y >= 0 && y <= 2) || (y >= 7 && y <= 9));
const redHalf = (y) => y <= 4;

// ---------- 预计算走法表 ----------
const KING_MOVES = [];
const ADVISOR_MOVES = [];
const ELEPHANT_MOVES = []; // [to, eye]
const HORSE_MOVES = []; // [to, leg]
const HORSE_ATTACKERS = []; // 能攻击 s 的马的位置 [from, leg]
const PAWN_MOVES = [[], []];
const RAYS = []; // RAYS[s][dir] = [squares...]  dir: 0 上(+y) 1 下 2 左 3 右

for (let s = 0; s < 90; s++) {
  const x = fileOf(s);
  const y = rankOf(s);
  const km = [];
  const am = [];
  if (inPalace(x, y)) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (inPalace(nx, ny) && redHalf(ny) === redHalf(y)) km.push(sqOf(nx, ny));
    }
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (inPalace(nx, ny) && redHalf(ny) === redHalf(y)) am.push(sqOf(nx, ny));
    }
  }
  KING_MOVES.push(km);
  ADVISOR_MOVES.push(am);

  const em = [];
  for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBoard(nx, ny) && redHalf(ny) === redHalf(y)) em.push([sqOf(nx, ny), sqOf(x + dx / 2, y + dy / 2)]);
  }
  ELEPHANT_MOVES.push(em);

  const hm = [];
  const ha = [];
  for (const [dx, dy] of [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBoard(nx, ny)) continue;
    // 马腿：沿长边方向的相邻点
    const legX = Math.abs(dx) === 2 ? x + dx / 2 : x;
    const legY = Math.abs(dy) === 2 ? y + dy / 2 : y;
    hm.push([sqOf(nx, ny), sqOf(legX, legY)]);
    // 反向：位于 (nx,ny) 的马攻击 s，马腿在马旁边
    const bx = -dx;
    const by = -dy;
    const lx = Math.abs(bx) === 2 ? nx + bx / 2 : nx;
    const ly = Math.abs(by) === 2 ? ny + by / 2 : ny;
    ha.push([sqOf(nx, ny), sqOf(lx, ly)]);
  }
  HORSE_MOVES.push(hm);
  HORSE_ATTACKERS.push(ha);

  for (const color of [RED, BLACK]) {
    const pm = [];
    const fwd = color === RED ? 1 : -1;
    if (inBoard(x, y + fwd)) pm.push(sqOf(x, y + fwd));
    const crossed = color === RED ? y >= 5 : y <= 4;
    if (crossed) {
      if (x > 0) pm.push(sqOf(x - 1, y));
      if (x < 8) pm.push(sqOf(x + 1, y));
    }
    PAWN_MOVES[color].push(pm);
  }

  const rays = [];
  for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) {
    const r = [];
    let nx = x + dx;
    let ny = y + dy;
    while (inBoard(nx, ny)) {
      r.push(sqOf(nx, ny));
      nx += dx;
      ny += dy;
    }
    rays.push(r);
  }
  RAYS.push(rays);
}

// ---------- Zobrist ----------
let seed = 0x9e3779b9;
function rnd32() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}
export const ZOBRIST = [];
export const ZOBRIST_LOCK = [];
for (let p = 0; p < 16; p++) {
  const a = new Uint32Array(90);
  const b = new Uint32Array(90);
  for (let s = 0; s < 90; s++) {
    a[s] = rnd32();
    b[s] = rnd32();
  }
  ZOBRIST.push(a);
  ZOBRIST_LOCK.push(b);
}
export const ZOBRIST_SIDE = rnd32();
export const ZOBRIST_SIDE_LOCK = rnd32();

// ---------- 走法生成 ----------

export function findKing(board, color) {
  const k = makePiece(color, KING);
  if (color === RED) {
    for (let y = 0; y <= 2; y++) for (let x = 3; x <= 5; x++) if (board[y * 9 + x] === k) return y * 9 + x;
  } else {
    for (let y = 7; y <= 9; y++) for (let x = 3; x <= 5; x++) if (board[y * 9 + x] === k) return y * 9 + x;
  }
  return -1;
}

// 判断 color 方的将帅是否被攻击（含将帅照面）
export function isInCheck(board, color) {
  const ks = findKing(board, color);
  if (ks < 0) return true;
  return isSquareAttacked(board, ks, color ^ 1);
}

// by 方是否攻击 s 点（仅考虑车、马、炮、兵、将帅照面 —— 可攻击到九宫的子）
export function isSquareAttacked(board, s, by) {
  const enemyRook = makePiece(by, ROOK);
  const enemyCannon = makePiece(by, CANNON);
  const enemyKing = makePiece(by, KING);
  const enemyHorse = makePiece(by, HORSE);
  const enemyPawn = makePiece(by, PAWN);
  const rays = RAYS[s];
  for (let d = 0; d < 4; d++) {
    const ray = rays[d];
    let i = 0;
    const n = ray.length;
    while (i < n && board[ray[i]] === 0) i++;
    if (i >= n) continue;
    const p = board[ray[i]];
    if (p === enemyRook || (d < 2 && p === enemyKing)) return true;
    i++;
    while (i < n && board[ray[i]] === 0) i++;
    if (i < n && board[ray[i]] === enemyCannon) return true;
  }
  const ha = HORSE_ATTACKERS[s];
  for (let i = 0; i < ha.length; i++) {
    const [f, leg] = ha[i];
    if (board[f] === enemyHorse && board[leg] === 0) return true;
  }
  const x = fileOf(s);
  const y = rankOf(s);
  // 兵从 by 方前进方向攻击
  const back = by === RED ? -1 : 1; // 攻击者所在的相对位置
  if (inBoard(x, y + back) && board[sqOf(x, y + back)] === enemyPawn) return true;
  const crossedAt = by === RED ? y >= 5 : y <= 4; // 位于 s 旁边的兵是否已过河（同一行）
  if (crossedAt) {
    if (x > 0 && board[s - 1] === enemyPawn) return true;
    if (x < 8 && board[s + 1] === enemyPawn) return true;
  }
  return false;
}

// 生成伪合法走法（不检查自身被将）。capturesOnly 仅生成吃子。
export function genPseudoMoves(board, color, out, capturesOnly = false) {
  for (let s = 0; s < 90; s++) {
    const p = board[s];
    if (p === 0 || p >> 3 !== color) continue;
    const t = p & 7;
    switch (t) {
      case KING: {
        const ms = KING_MOVES[s];
        for (let i = 0; i < ms.length; i++) pushIf(board, color, s, ms[i], out, capturesOnly);
        break;
      }
      case ADVISOR: {
        const ms = ADVISOR_MOVES[s];
        for (let i = 0; i < ms.length; i++) pushIf(board, color, s, ms[i], out, capturesOnly);
        break;
      }
      case ELEPHANT: {
        const ms = ELEPHANT_MOVES[s];
        for (let i = 0; i < ms.length; i++) {
          if (board[ms[i][1]] === 0) pushIf(board, color, s, ms[i][0], out, capturesOnly);
        }
        break;
      }
      case HORSE: {
        const ms = HORSE_MOVES[s];
        for (let i = 0; i < ms.length; i++) {
          if (board[ms[i][1]] === 0) pushIf(board, color, s, ms[i][0], out, capturesOnly);
        }
        break;
      }
      case ROOK: {
        const rays = RAYS[s];
        for (let d = 0; d < 4; d++) {
          const ray = rays[d];
          for (let i = 0; i < ray.length; i++) {
            const t2 = ray[i];
            const q = board[t2];
            if (q === 0) {
              if (!capturesOnly) out.push(s | (t2 << 7));
            } else {
              if (q >> 3 !== color) out.push(s | (t2 << 7));
              break;
            }
          }
        }
        break;
      }
      case CANNON: {
        const rays = RAYS[s];
        for (let d = 0; d < 4; d++) {
          const ray = rays[d];
          let i = 0;
          for (; i < ray.length; i++) {
            const t2 = ray[i];
            if (board[t2] === 0) {
              if (!capturesOnly) out.push(s | (t2 << 7));
            } else break;
          }
          for (i++; i < ray.length; i++) {
            const q = board[ray[i]];
            if (q !== 0) {
              if (q >> 3 !== color) out.push(s | (ray[i] << 7));
              break;
            }
          }
        }
        break;
      }
      case PAWN: {
        const ms = PAWN_MOVES[color][s];
        for (let i = 0; i < ms.length; i++) pushIf(board, color, s, ms[i], out, capturesOnly);
        break;
      }
    }
  }
  return out;
}

function pushIf(board, color, from, to, out, capturesOnly) {
  const q = board[to];
  if (q === 0) {
    if (!capturesOnly) out.push(from | (to << 7));
  } else if (q >> 3 !== color) out.push(from | (to << 7));
}

// 伪合法走法中仅生成某一点出发的走法
export function genPseudoMovesFrom(board, s) {
  const p = board[s];
  if (!p) return [];
  const out = [];
  const tmp = [];
  genPseudoMoves(board, p >> 3, tmp);
  for (const m of tmp) if ((m & 127) === s) out.push(m);
  return out;
}

export function genLegalMoves(board, color) {
  const pseudo = genPseudoMoves(board, color, []);
  const legal = [];
  for (let i = 0; i < pseudo.length; i++) {
    const m = pseudo[i];
    const f = m & 127;
    const t = m >> 7;
    const cap = board[t];
    board[t] = board[f];
    board[f] = 0;
    if (!isInCheck(board, color)) legal.push(m);
    board[f] = board[t];
    board[t] = cap;
  }
  return legal;
}

export function hashBoard(board, turn) {
  let h = 0;
  let l = 0;
  for (let s = 0; s < 90; s++) {
    const p = board[s];
    if (p) {
      h ^= ZOBRIST[p][s];
      l ^= ZOBRIST_LOCK[p][s];
    }
  }
  if (turn === BLACK) {
    h ^= ZOBRIST_SIDE;
    l ^= ZOBRIST_SIDE_LOCK;
  }
  return [h >>> 0, l >>> 0];
}

// ---------- FEN ----------
export function parseFEN(fen) {
  const board = new Int8Array(90);
  const [placement, side] = fen.trim().split(/\s+/);
  const rows = placement.split('/');
  if (rows.length !== 10) throw new Error('Bad FEN');
  for (let r = 0; r < 10; r++) {
    const y = 9 - r;
    let x = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        x += parseInt(ch, 10);
        continue;
      }
      const lower = ch.toLowerCase();
      const t = FEN_CHARS.indexOf(lower === 'h' ? 'n' : lower === 'e' ? 'b' : lower);
      if (t <= 0) throw new Error('Bad FEN piece ' + ch);
      const color = ch === lower ? BLACK : RED;
      board[sqOf(x, y)] = makePiece(color, t);
      x++;
    }
  }
  const turn = side === 'b' ? BLACK : RED;
  return { board, turn };
}

export function toFEN(board, turn) {
  const rows = [];
  for (let y = 9; y >= 0; y--) {
    let row = '';
    let empty = 0;
    for (let x = 0; x < 9; x++) {
      const p = board[sqOf(x, y)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const ch = FEN_CHARS[p & 7];
      row += p >> 3 === RED ? ch.toUpperCase() : ch;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/') + ' ' + (turn === RED ? 'w' : 'b') + ' - - 0 1';
}

// ---------- 中文记谱 ----------
const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const AR_NUM = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function moveToChinese(board, from, to) {
  const p = board[from];
  const color = p >> 3;
  const t = p & 7;
  const fx = fileOf(from);
  const fy = rankOf(from);
  const tx = fileOf(to);
  const ty = rankOf(to);
  const nums = color === RED ? CN_NUM : AR_NUM;
  const fileNo = (x) => (color === RED ? 9 - x : x + 1);
  const name = NOTATION_CHARS[color][t];

  // 同列同种棋子，按前后区分
  const sameFile = [];
  for (let y = 0; y < 10; y++) if (board[sqOf(fx, y)] === p) sameFile.push(y);
  let head;
  if (sameFile.length >= 2 && t !== KING && t !== ADVISOR && t !== ELEPHANT) {
    // 从本方视角排序：前 = 更靠近对方
    const ordered = sameFile.slice().sort((a, b) => (color === RED ? b - a : a - b));
    const idx = ordered.indexOf(fy);
    let tag;
    if (ordered.length === 2) tag = idx === 0 ? '前' : '后';
    else if (ordered.length === 3) tag = ['前', '中', '后'][idx];
    else tag = CN_NUM[idx + 1];
    head = tag + name;
  } else {
    head = name + nums[fileNo(fx)];
  }

  const forward = color === RED ? ty > fy : ty < fy;
  let action;
  let target;
  if (fy === ty) {
    action = '平';
    target = nums[fileNo(tx)];
  } else {
    action = forward ? '进' : '退';
    if (t === HORSE || t === ELEPHANT || t === ADVISOR) target = nums[fileNo(tx)];
    else target = nums[Math.abs(ty - fy)];
  }
  return head + action + target;
}

// ---------- 对局 ----------
export class XiangqiGame {
  constructor(fen = START_FEN) {
    this.reset(fen);
  }

  reset(fen = START_FEN) {
    const { board, turn } = parseFEN(fen);
    this.startFEN = fen;
    this.board = board;
    this.turn = turn;
    this.history = [];
    this.positions = [this.key()];
    this.result = null; // {winner: RED|BLACK|null, reason}
  }

  key() {
    const [h, l] = hashBoard(this.board, this.turn);
    return h.toString(36) + ':' + l.toString(36);
  }

  clone() {
    const g = new XiangqiGame(this.startFEN);
    for (const h of this.history) g.move(h.from, h.to);
    return g;
  }

  pieceAt(s) {
    return this.board[s];
  }

  legalMoves() {
    if (this.result) return [];
    return genLegalMoves(this.board, this.turn);
  }

  legalTargets(from) {
    const p = this.board[from];
    if (!p || p >> 3 !== this.turn || this.result) return [];
    return this.legalMoves()
      .filter((m) => (m & 127) === from)
      .map((m) => m >> 7);
  }

  isLegal(from, to) {
    return this.legalTargets(from).includes(to);
  }

  inCheck(color = this.turn) {
    return isInCheck(this.board, color);
  }

  // 执行一步棋，返回记录；非法返回 null
  move(from, to) {
    if (!this.isLegal(from, to)) return null;
    const board = this.board;
    const piece = board[from];
    const captured = board[to];
    const notation = moveToChinese(board, from, to);
    board[to] = piece;
    board[from] = 0;
    const mover = this.turn;
    this.turn ^= 1;
    const check = isInCheck(board, this.turn);
    const rec = {
      from,
      to,
      piece,
      captured,
      notation,
      check,
      color: mover,
      ply: this.history.length,
      crossesRiver: redHalf(rankOf(from)) !== redHalf(rankOf(to)),
    };
    this.history.push(rec);
    this.positions.push(this.key());
    this.result = this.computeResult();
    rec.result = this.result;
    return rec;
  }

  undo() {
    const rec = this.history.pop();
    if (!rec) return null;
    this.board[rec.from] = rec.piece;
    this.board[rec.to] = rec.captured;
    this.turn = rec.color;
    this.positions.pop();
    this.result = null;
    return rec;
  }

  // 外部裁定（认输、超时、和棋协议）
  setResult(winner, reason) {
    this.result = { winner, reason };
  }

  computeResult() {
    const legal = genLegalMoves(this.board, this.turn);
    if (legal.length === 0) {
      const checked = isInCheck(this.board, this.turn);
      return { winner: this.turn ^ 1, reason: checked ? 'checkmate' : 'stalemate' };
    }
    // 重复局面
    const cur = this.positions[this.positions.length - 1];
    let count = 0;
    let prevIdx = -1;
    for (let i = this.positions.length - 1; i >= 0; i--) {
      if (this.positions[i] === cur) {
        count++;
        if (count === 2) prevIdx = i;
      }
    }
    if (count >= 3) {
      // 检查上一次重复以来每方是否一直在将军（长将判负）
      const moves = this.history.slice(prevIdx);
      const perpetual = [true, true];
      const moved = [false, false];
      for (const m of moves) {
        moved[m.color] = true;
        if (!m.check) perpetual[m.color] = false;
      }
      const redP = perpetual[RED] && moved[RED];
      const blackP = perpetual[BLACK] && moved[BLACK];
      if (redP && !blackP) return { winner: BLACK, reason: 'perpetual' };
      if (blackP && !redP) return { winner: RED, reason: 'perpetual' };
      return { winner: null, reason: 'repetition' };
    }
    // 六十回合无吃子
    let quiet = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].captured) break;
      quiet++;
    }
    if (quiet >= 120) return { winner: null, reason: 'nocapture' };
    // 双方均无进攻子力
    let attackers = 0;
    for (let s = 0; s < 90; s++) {
      const t = this.board[s] & 7;
      if (t === ROOK || t === HORSE || t === CANNON || t === PAWN) {
        attackers++;
        break;
      }
    }
    if (!attackers) return { winner: null, reason: 'material' };
    return null;
  }

  // 是否处于长将警告（同一局面第二次出现且一方连续将军）
  perpetualWarning() {
    const cur = this.positions[this.positions.length - 1];
    let prevIdx = -1;
    for (let i = this.positions.length - 2; i >= 0; i--) {
      if (this.positions[i] === cur) {
        prevIdx = i;
        break;
      }
    }
    if (prevIdx < 0) return null;
    const moves = this.history.slice(prevIdx);
    const perpetual = [true, true];
    const moved = [false, false];
    for (const m of moves) {
      moved[m.color] = true;
      if (!m.check) perpetual[m.color] = false;
    }
    if (perpetual[RED] && moved[RED] && !(perpetual[BLACK] && moved[BLACK])) return RED;
    if (perpetual[BLACK] && moved[BLACK] && !(perpetual[RED] && moved[RED])) return BLACK;
    return null;
  }

  fen() {
    return toFEN(this.board, this.turn);
  }

  moveList() {
    return this.history.map((h) => [h.from, h.to]);
  }
}

export const RESULT_TEXT = {
  checkmate: '绝杀',
  stalemate: '困毙',
  perpetual: '长将判负',
  repetition: '重复局面 · 和棋',
  nocapture: '六十回合无吃子 · 和棋',
  material: '双方无攻击子力 · 和棋',
  resign: '认输',
  timeout: '超时',
  agreement: '议和',
  abandon: '对手离开',
};
