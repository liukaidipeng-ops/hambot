// 象棋 AI：迭代加深 + PVS + 置换表 + 静态搜索 + 空着裁剪
import {
  RED, BLACK, KING, ADVISOR, ELEPHANT, HORSE, ROOK, CANNON, PAWN,
  ZOBRIST, ZOBRIST_LOCK, ZOBRIST_SIDE, ZOBRIST_SIDE_LOCK,
  genPseudoMoves, isInCheck,
} from './xiangqi.js';

const MATE = 30000;
const WIN = MATE - 300;
const DRAW = 0;

// 位置价值表（红方视角，第 0 行为红方底线）
const T = {};
T[KING] = [
  [0, 0, 0, 11, 15, 11, 0, 0, 0],
  [0, 0, 0, 2, 2, 2, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  ...Array(7).fill([0, 0, 0, 0, 0, 0, 0, 0, 0]),
];
T[ADVISOR] = [
  [0, 0, 0, 20, 0, 20, 0, 0, 0],
  [0, 0, 0, 0, 23, 0, 0, 0, 0],
  [0, 0, 0, 20, 0, 20, 0, 0, 0],
  ...Array(7).fill([0, 0, 0, 0, 0, 0, 0, 0, 0]),
];
T[ELEPHANT] = [
  [0, 0, 20, 0, 0, 0, 20, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [18, 0, 0, 0, 23, 0, 0, 0, 18],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 20, 0, 0, 0, 20, 0, 0],
  ...Array(5).fill([0, 0, 0, 0, 0, 0, 0, 0, 0]),
];
T[HORSE] = [
  [88, 85, 90, 88, 90, 88, 90, 85, 88],
  [85, 90, 92, 93, 78, 93, 92, 90, 85],
  [93, 92, 94, 95, 92, 95, 94, 92, 93],
  [92, 94, 98, 95, 98, 95, 98, 94, 92],
  [90, 98, 101, 102, 103, 102, 101, 98, 90],
  [90, 100, 99, 103, 104, 103, 99, 100, 90],
  [93, 108, 100, 107, 100, 107, 100, 108, 93],
  [92, 98, 99, 103, 99, 103, 99, 98, 92],
  [90, 96, 103, 97, 94, 97, 103, 96, 90],
  [90, 90, 90, 96, 90, 96, 90, 90, 90],
];
T[ROOK] = [
  [194, 206, 204, 212, 200, 212, 204, 206, 194],
  [200, 208, 206, 212, 200, 212, 206, 208, 200],
  [198, 208, 204, 212, 212, 212, 204, 208, 198],
  [204, 209, 204, 212, 214, 212, 204, 209, 204],
  [208, 212, 212, 214, 215, 214, 212, 212, 208],
  [208, 211, 211, 214, 215, 214, 211, 211, 208],
  [206, 213, 213, 216, 216, 216, 213, 213, 206],
  [206, 208, 207, 214, 216, 214, 207, 208, 206],
  [206, 212, 209, 216, 233, 216, 209, 212, 206],
  [206, 208, 207, 213, 214, 213, 207, 208, 206],
];
T[CANNON] = [
  [96, 96, 97, 99, 99, 99, 97, 96, 96],
  [96, 97, 98, 98, 98, 98, 98, 97, 96],
  [97, 96, 100, 99, 101, 99, 100, 96, 97],
  [96, 96, 96, 96, 96, 96, 96, 96, 96],
  [95, 96, 99, 96, 100, 96, 99, 96, 95],
  [96, 96, 96, 96, 100, 96, 96, 96, 96],
  [96, 99, 99, 98, 100, 98, 99, 99, 96],
  [97, 97, 96, 91, 92, 91, 96, 97, 97],
  [98, 98, 96, 92, 89, 92, 96, 98, 98],
  [100, 100, 96, 91, 90, 91, 96, 100, 100],
];
T[PAWN] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [7, 0, 7, 0, 15, 0, 7, 0, 7],
  [7, 0, 13, 0, 16, 0, 13, 0, 7],
  [14, 18, 20, 27, 29, 27, 20, 18, 14],
  [19, 23, 27, 29, 30, 29, 27, 23, 19],
  [19, 24, 32, 37, 37, 37, 32, 24, 19],
  [19, 24, 34, 42, 44, 42, 34, 24, 19],
  [9, 9, 9, 11, 13, 11, 9, 9, 9],
];

// PST[piece][sq]
const PST = [];
for (let p = 0; p < 16; p++) PST.push(new Int16Array(90));
for (let t = 1; t <= 7; t++) {
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      PST[t][y * 9 + x] = T[t][y][x];
      PST[8 | t][(9 - y) * 9 + x] = T[t][y][x];
    }
  }
}

const MVV = [0, 50, 2, 2, 4, 9, 4, 1];
const LVA = [0, 1, 2, 2, 3, 5, 3, 1];

const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const F_EXACT = 1;
const F_LOWER = 2;
const F_UPPER = 3;
const MAX_PLY = 64;

export class AIEngine {
  constructor() {
    this.ttKey = new Uint32Array(TT_SIZE);
    this.ttLock = new Uint32Array(TT_SIZE);
    this.ttMove = new Uint16Array(TT_SIZE);
    this.ttScore = new Int16Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Uint8Array(TT_SIZE);
    this.history = new Int32Array(90 * 128);
    this.killers = [];
    for (let i = 0; i < MAX_PLY; i++) this.killers.push([0, 0]);
  }

  // board: Int8Array(90)，turn: 行棋方，past: 之前出现过的局面 [{h,l,check}]
  setPosition(board, turn, past = []) {
    this.b = Int8Array.from(board);
    this.side = turn;
    this.vl = [0, 0];
    let h = 0;
    let l = 0;
    for (let s = 0; s < 90; s++) {
      const p = this.b[s];
      if (!p) continue;
      this.vl[p >> 3] += PST[p][s];
      h ^= ZOBRIST[p][s];
      l ^= ZOBRIST_LOCK[p][s];
    }
    if (turn === BLACK) {
      h ^= ZOBRIST_SIDE;
      l ^= ZOBRIST_SIDE_LOCK;
    }
    this.h = h >>> 0;
    this.l = l >>> 0;
    // 历史局面栈：用于重复检测
    this.stackH = past.map((x) => x.h);
    this.stackL = past.map((x) => x.l);
    this.stackCheck = past.map((x) => !!x.check);
    this.stackH.push(this.h);
    this.stackL.push(this.l);
    this.stackCheck.push(isInCheck(this.b, turn));
    this.capStack = [];
  }

  evaluate() {
    return this.vl[this.side] - this.vl[this.side ^ 1] + 3;
  }

  makeMove(m) {
    const b = this.b;
    const f = m & 127;
    const t = m >> 7;
    const p = b[f];
    const c = b[t];
    this.capStack.push(c);
    const col = p >> 3;
    this.vl[col] += PST[p][t] - PST[p][f];
    let h = this.h ^ ZOBRIST[p][f] ^ ZOBRIST[p][t] ^ ZOBRIST_SIDE;
    let l = this.l ^ ZOBRIST_LOCK[p][f] ^ ZOBRIST_LOCK[p][t] ^ ZOBRIST_SIDE_LOCK;
    if (c) {
      this.vl[c >> 3] -= PST[c][t];
      h ^= ZOBRIST[c][t];
      l ^= ZOBRIST_LOCK[c][t];
    }
    b[t] = p;
    b[f] = 0;
    this.side ^= 1;
    this.h = h >>> 0;
    this.l = l >>> 0;
    this.stackH.push(this.h);
    this.stackL.push(this.l);
    this.stackCheck.push(false);
  }

  unmakeMove(m) {
    const b = this.b;
    const f = m & 127;
    const t = m >> 7;
    const p = b[t];
    const c = this.capStack.pop();
    const col = p >> 3;
    this.vl[col] -= PST[p][t] - PST[p][f];
    if (c) this.vl[c >> 3] += PST[c][t];
    b[f] = p;
    b[t] = c;
    this.side ^= 1;
    this.stackH.pop();
    this.stackL.pop();
    this.stackCheck.pop();
    this.h = this.stackH[this.stackH.length - 1];
    this.l = this.stackL[this.stackL.length - 1];
  }

  makeNull() {
    this.side ^= 1;
    this.h = (this.h ^ ZOBRIST_SIDE) >>> 0;
    this.l = (this.l ^ ZOBRIST_SIDE_LOCK) >>> 0;
    this.stackH.push(this.h);
    this.stackL.push(this.l);
    this.stackCheck.push(false);
    this.capStack.push(0);
  }

  unmakeNull() {
    this.side ^= 1;
    this.stackH.pop();
    this.stackL.pop();
    this.stackCheck.pop();
    this.capStack.pop();
    this.h = this.stackH[this.stackH.length - 1];
    this.l = this.stackL[this.stackL.length - 1];
  }

  // 重复检测：返回 0 表示无重复，否则返回对当前行棋方的评分。
  // stackCheck[j] 表示局面 j 的行棋方正被将军（即上一步是将军）。
  repetitionScore(ply) {
    const n = this.stackH.length - 1;
    const h = this.h;
    const l = this.l;
    let selfCheckAll = true; // 当前行棋方在循环中每步都将军
    let oppCheckAll = true; // 对手在循环中每步都将军
    for (let i = n - 2; i >= 0; i -= 2) {
      if (!this.stackCheck[i + 1]) selfCheckAll = false;
      if (!this.stackCheck[i + 2]) oppCheckAll = false;
      if (this.stackH[i] === h && this.stackL[i] === l) {
        if (oppCheckAll && !selfCheckAll) return WIN - ply; // 对手长将判负
        if (selfCheckAll && !oppCheckAll) return -(WIN - ply);
        return DRAW - 1;
      }
    }
    return 0;
  }

  probeTT(depth, alpha, beta, ply) {
    const i = this.h & TT_MASK;
    if (this.ttKey[i] !== this.h || this.ttLock[i] !== this.l) return null;
    const move = this.ttMove[i];
    if (this.ttDepth[i] < depth) return { move, score: null };
    let score = this.ttScore[i];
    if (score > WIN) score -= ply;
    else if (score < -WIN) score += ply;
    const flag = this.ttFlag[i];
    if (flag === F_EXACT) return { move, score };
    if (flag === F_LOWER && score >= beta) return { move, score };
    if (flag === F_UPPER && score <= alpha) return { move, score };
    return { move, score: null };
  }

  storeTT(depth, flag, score, move, ply) {
    const i = this.h & TT_MASK;
    if (this.ttKey[i] === this.h && this.ttLock[i] === this.l && this.ttDepth[i] > depth && flag !== F_EXACT) return;
    if (score > WIN) score += ply;
    else if (score < -WIN) score -= ply;
    this.ttKey[i] = this.h;
    this.ttLock[i] = this.l;
    this.ttMove[i] = move;
    this.ttScore[i] = Math.max(-32000, Math.min(32000, score));
    this.ttDepth[i] = depth;
    this.ttFlag[i] = flag;
  }

  inCheck() {
    return isInCheck(this.b, this.side);
  }

  timeUp() {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) this.stopped = true;
    return this.stopped;
  }

  orderMoves(moves, ttMove, ply) {
    const b = this.b;
    const scores = new Int32Array(moves.length);
    const k = this.killers[ply];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const t = m >> 7;
      let s;
      if (m === ttMove) s = 1 << 30;
      else if (b[t]) s = (1 << 28) + MVV[b[t] & 7] * 16 - LVA[b[m & 127] & 7];
      else if (m === k[0]) s = (1 << 27) + 2;
      else if (m === k[1]) s = (1 << 27) + 1;
      else s = this.history[(m & 127) * 128 + (m >> 7)] | 0;
      scores[i] = s;
    }
    // 插入排序（走法数一般 < 60）
    for (let i = 1; i < moves.length; i++) {
      const m = moves[i];
      const s = scores[i];
      let j = i - 1;
      while (j >= 0 && scores[j] < s) {
        moves[j + 1] = moves[j];
        scores[j + 1] = scores[j];
        j--;
      }
      moves[j + 1] = m;
      scores[j + 1] = s;
    }
    return moves;
  }

  quiesce(alpha, beta, ply) {
    if (this.timeUp()) return 0;
    const inCheck = this.inCheck();
    if (ply >= MAX_PLY - 1) return this.evaluate();
    let best = -MATE + ply;
    if (!inCheck) {
      const stand = this.evaluate();
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
    }
    const moves = genPseudoMoves(this.b, this.side, [], !inCheck);
    this.orderMoves(moves, 0, ply);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      this.makeMove(m);
      if (isInCheck(this.b, this.side ^ 1)) {
        this.unmakeMove(m);
        continue;
      }
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      this.unmakeMove(m);
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) return score;
        }
      }
    }
    return best;
  }

  nonPawnMaterial(side) {
    let v = 0;
    const b = this.b;
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (p && p >> 3 === side) {
        const t = p & 7;
        if (t === ROOK) v += 4;
        else if (t === HORSE || t === CANNON) v += 2;
      }
    }
    return v;
  }

  search(depth, alpha, beta, ply, allowNull) {
    const inCheck = this.inCheck();
    this.stackCheck[this.stackCheck.length - 1] = inCheck;
    if (ply > 0) {
      const rep = this.repetitionScore(ply);
      if (rep) return rep;
    }
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    if (this.timeUp()) return 0;
    if (ply >= MAX_PLY - 1) return this.evaluate();

    // 杀棋距离裁剪
    const matedScore = -MATE + ply;
    if (matedScore >= beta) return matedScore;

    const pv = beta - alpha > 1;
    const tt = this.probeTT(depth, alpha, beta, ply);
    let ttMove = 0;
    if (tt) {
      ttMove = tt.move;
      if (tt.score !== null && !pv && ply > 0) return tt.score;
    }

    // 空着裁剪
    if (allowNull && !pv && !inCheck && depth >= 3 && this.nonPawnMaterial(this.side) >= 4) {
      const ev = this.evaluate();
      if (ev >= beta) {
        this.makeNull();
        const score = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
        this.unmakeNull();
        if (this.stopped) return 0;
        if (score >= beta && score < WIN) return score;
      }
    }

    const moves = genPseudoMoves(this.b, this.side, []);
    this.orderMoves(moves, ttMove, ply);
    let best = -MATE;
    let bestMove = 0;
    let flag = F_UPPER;
    let legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      this.makeMove(m);
      if (isInCheck(this.b, this.side ^ 1)) {
        this.unmakeMove(m);
        continue;
      }
      legal++;
      let score;
      const isCap = this.capStack[this.capStack.length - 1] !== 0;
      if (legal === 1) {
        score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // 后期走法减少搜索深度（LMR）
        let r = 0;
        if (depth >= 3 && legal > 4 && !inCheck && !isCap && m !== this.killers[ply][0] && m !== this.killers[ply][1]) {
          r = legal > 12 ? 2 : 1;
        }
        score = -this.search(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && r) score = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      this.unmakeMove(m);
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          flag = F_EXACT;
          if (ply === 0) this.rootBest = m;
          if (score >= beta) {
            flag = F_LOWER;
            if (!isCap) {
              const k = this.killers[ply];
              if (k[0] !== m) {
                k[1] = k[0];
                k[0] = m;
              }
              this.history[(m & 127) * 128 + (m >> 7)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return -MATE + ply; // 无子可动（将死或困毙均判负）
    this.storeTT(depth, flag, best, bestMove, ply);
    return best;
  }

  // 根节点搜索，返回每个走法的分数（用于随机化）
  // margin > 0 时，对与最佳分差在 margin 内的走法求精确值（用于随机选择）
  rootSearch(depth, alpha, beta, rootMoves, margin = 0) {
    const inCheck = this.inCheck();
    this.stackCheck[this.stackCheck.length - 1] = inCheck;
    const results = [];
    let best = -MATE;
    for (let i = 0; i < rootMoves.length; i++) {
      const m = rootMoves[i];
      this.makeMove(m);
      let score;
      let exact = true;
      if (i === 0) score = -this.search(depth - 1, -beta, -alpha, 1, true);
      else {
        const a = alpha - margin;
        score = -this.search(depth - 1, -a - 1, -a, 1, true);
        if (score > a && score < beta) score = -this.search(depth - 1, -beta, -a, 1, true);
        exact = score > a;
      }
      this.unmakeMove(m);
      if (this.stopped) break;
      results.push({ move: m, score, exact });
      if (score > best) {
        best = score;
        if (score > alpha) alpha = score;
      }
    }
    return results;
  }

  legalRootMoves() {
    const moves = genPseudoMoves(this.b, this.side, []);
    const legal = [];
    for (const m of moves) {
      this.makeMove(m);
      if (!isInCheck(this.b, this.side ^ 1)) legal.push(m);
      this.unmakeMove(m);
    }
    return legal;
  }

  // opts: {maxDepth, timeMs, randomness(分), onInfo}
  think(opts = {}) {
    const maxDepth = opts.maxDepth || 20;
    const timeMs = opts.timeMs || 1500;
    const randomness = opts.randomness || 0;
    this.deadline = Date.now() + timeMs;
    this.stopped = false;
    this.nodes = 0;
    this.history.fill(0);
    for (const k of this.killers) k[0] = k[1] = 0;

    let rootMoves = this.legalRootMoves();
    if (rootMoves.length === 0) return { move: 0, score: -MATE, depth: 0 };
    if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0 };
    this.orderMoves(rootMoves, 0, 0);

    let bestResults = null;
    let depthDone = 0;
    for (let d = 1; d <= maxDepth; d++) {
      const results = this.rootSearch(d, -MATE, MATE, rootMoves, randomness);
      if (this.stopped && results.length === 0) break;
      if (!this.stopped || results.length === rootMoves.length) {
        results.sort((a, b) => b.score - a.score);
        bestResults = results;
        depthDone = d;
        rootMoves = results.map((r) => r.move);
      } else if (results.length) {
        // 部分完成：若找到更好的首选，采用之
        const partialBest = results.reduce((a, b) => (b.score > a.score ? b : a));
        if (bestResults && partialBest.score > bestResults[0].score) {
          bestResults = [partialBest, ...bestResults.filter((r) => r.move !== partialBest.move)];
        }
      }
      if (opts.onInfo) opts.onInfo({ depth: d, score: bestResults ? bestResults[0].score : 0, nodes: this.nodes });
      if (this.stopped) break;
      if (bestResults && Math.abs(bestResults[0].score) > WIN) break;
      if (Date.now() > this.deadline - timeMs * 0.45 && d >= 4) break; // 下一层大概率超时
    }
    if (!bestResults) return { move: rootMoves[0], score: 0, depth: 0 };
    let pick = bestResults[0];
    if (randomness > 0 && Math.abs(pick.score) < WIN) {
      const pool = bestResults.filter((r) => r.exact && r.score >= pick.score - randomness);
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    return { move: pick.move, score: pick.score, depth: depthDone, nodes: this.nodes };
  }
}

export const AI_LEVELS = {
  easy: { label: '初出茅庐', maxDepth: 2, timeMs: 400, randomness: 60 },
  medium: { label: '运筹帷幄', maxDepth: 6, timeMs: 1200, randomness: 12 },
  hard: { label: '兵仙韩信', maxDepth: 24, timeMs: 3000, randomness: 0 },
};

export { RED, BLACK };
