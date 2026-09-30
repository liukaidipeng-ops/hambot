// 对局控制：输入、走子、动画队列、AI / 本地 / 联机、计时、悔棋、结算
import {
  XiangqiGame, RED, BLACK, KING, findKing, pieceColor, RESULT_TEXT,
} from '../../shared/xiangqi.js';
import { worldToSquare } from '../render/coords.js';
import { AIPlayer } from './AIPlayer.js';
import { settings } from '../core/settings.js';

export class MatchController {
  // opts: { mode: 'ai'|'local'|'online', myColor, level, net, players:[{name},{name}], timeControl:{base,inc}|null }
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.mode = opts.mode;
    this.myColor = opts.mode === 'local' ? null : opts.myColor ?? RED;
    this.game = new XiangqiGame(opts.fen);
    this.selected = -1;
    this.busy = false;
    this.visualQueue = Promise.resolve();
    this.pendingVisuals = 0;
    this.disposed = false;
    this.ended = false;
    this.players = opts.players || [{ name: '红方' }, { name: '黑方' }];
    this.clock = null;
    if (opts.timeControl && opts.timeControl.base) {
      this.clock = { remaining: [opts.timeControl.base, opts.timeControl.base], running: null, since: 0 };
    }
    if (this.mode === 'ai') this.ai = new AIPlayer();
    this.lastHint = null;
  }

  get pieces() {
    return this.app.pieces;
  }

  start() {
    const app = this.app;
    this.startedAt = performance.now();
    this.pieces.sync(this.game.board);
    this.pieces.showLastMove(-1);
    const side = this.myColor === BLACK ? BLACK : RED;
    app.rig.idleSpin = 0;
    app.rig.setSide(side);
    app.rig.resetView();
    app.rig.onTap = (x, y) => this.onScreenTap(x, y);
    app.rig.onHover = (x, y) => this.onScreenHover(x, y);
    app.ui.hud.show(this);
    this.updateHud();
    this.startClock();
    this.maybeAITurn();
  }

  dispose() {
    this.disposed = true;
    this.ai?.dispose();
    this.stopClockTimer();
    const rig = this.app.rig;
    rig.onTap = null;
    rig.onHover = null;
    this.pieces.clearMarkers();
  }

  // ---------- 状态 ----------
  isMyTurn() {
    if (this.ended || this.game.result || this.opts.spectator) return false;
    if (this.mode === 'local') return true;
    return this.game.turn === this.myColor;
  }

  canInteract() {
    return !this.busy && this.pendingVisuals === 0 && this.isMyTurn() && !this.app.ui.modalOpen;
  }

  controlledColor() {
    return this.mode === 'local' ? this.game.turn : this.myColor;
  }

  // ---------- 输入 ----------
  onScreenTap(cx, cy) {
    const p = this.app.rig.screenToPlane(cx, cy, 0.13);
    if (!p) return;
    const s = worldToSquare(p.x, p.z);
    this.onSquare(s);
  }

  onScreenHover(cx, cy) {
    if (cx == null || !this.canInteract()) {
      this.pieces.hover(null);
      return;
    }
    const p = this.app.rig.screenToPlane(cx, cy, 0.13);
    const s = p ? worldToSquare(p.x, p.z) : -1;
    const piece = s >= 0 ? this.game.board[s] : 0;
    const mine = piece && pieceColor(piece) === this.controlledColor();
    const target = this.selected >= 0 && this.targets?.includes(s);
    this.pieces.hover(mine || target ? s : null);
    this.app.stage.canvas.style.cursor = mine || target ? 'pointer' : 'default';
  }

  onSquare(s) {
    if (!this.canInteract()) {
      if (s >= 0 && !this.ended && !this.isMyTurn()) this.app.ui.toast(this.mode === 'online' ? '请等待对方走棋' : '对方思考中……', 900);
      return;
    }
    const g = this.game;
    const piece = s >= 0 ? g.board[s] : 0;
    const color = this.controlledColor();
    if (this.selected >= 0) {
      if (s === this.selected) {
        this.deselect();
        return;
      }
      if (this.targets.includes(s)) {
        const from = this.selected;
        this.deselect();
        this.userMove(from, s);
        return;
      }
      if (piece && pieceColor(piece) === color) {
        this.select(s);
        return;
      }
      // 非法目标
      this.app.audio.play('deny');
      this.deselect();
      return;
    }
    if (piece && pieceColor(piece) === color) this.select(s);
  }

  select(s) {
    this.selected = s;
    this.targets = this.game.legalTargets(s);
    this.pieces.select(s);
    this.pieces.showTargets(this.targets, this.game.board);
    this.app.audio.play('pick');
    if (!this.targets.length) this.app.ui.toast('此子无路可走', 900);
  }

  deselect() {
    this.selected = -1;
    this.targets = [];
    this.pieces.select(null);
    this.pieces.clearTargets();
  }

  // ---------- 走子 ----------
  userMove(from, to) {
    const rec = this.applyMove(from, to, 'me');
    if (!rec) return;
    if (this.mode === 'online') this.opts.net.sendMove(from, to, rec.ply);
  }

  applyMove(from, to, origin) {
    if (this.disposed) return null;
    const rec = this.game.move(from, to);
    if (!rec) {
      console.warn('illegal move', from, to, origin);
      return null;
    }
    rec.origin = origin;
    this.lastHint = null;
    this.onClockMove(rec);
    this.enqueueVisual(rec);
    this.maybeAITurn();
    return rec;
  }

  enqueueVisual(rec) {
    this.pendingVisuals++;
    this.busy = true;
    this.visualQueue = this.visualQueue
      .then(() => this.playVisual(rec))
      .catch((e) => console.error(e))
      .then(() => {
        this.pendingVisuals--;
        if (this.pendingVisuals === 0) this.busy = false;
        this.afterVisual(rec);
      });
  }

  async playVisual(rec) {
    if (this.disposed) return;
    const app = this.app;
    this.pieces.clearTargets();
    this.pieces.setCheck(-1);
    this.pieces.showLastMove(-1);
    await app.fx.playMove(rec, this);
    if (this.disposed) return;
    this.pieces.showLastMove(rec.from, rec.to);
    this.updateHud();
    if (rec.check && !rec.result) {
      const ks = findKing(this.game.board, rec.color ^ 1);
      // 只在当前局面仍为该步之后时显示
      if (this.game.history[this.game.history.length - 1] === rec) this.pieces.setCheck(ks);
      await app.fx.checkStamp(rec);
    }
    const warn = this.game.history[this.game.history.length - 1] === rec ? this.game.perpetualWarning() : null;
    if (warn !== null && !rec.result) app.ui.toast(`${warn === RED ? '红方' : '黑方'}长将，再重复将判负`, 2200);
  }

  afterVisual(rec) {
    if (this.disposed) return;
    if (rec.result && !this.ended) this.finish(rec.result);
    else if (this.mode === 'local' && settings.get('autoFlip') && this.pendingVisuals === 0 && !this.game.result) {
      this.app.rig.setSide(this.game.turn);
    }
    this.updateHud();
  }

  // ---------- AI ----------
  async maybeAITurn() {
    if (this.mode !== 'ai' || this.game.result || this.ended) return;
    if (this.game.turn === this.myColor) return;
    if (this.aiThinking) return;
    this.aiThinking = true;
    this.updateHud();
    const ply = this.game.history.length;
    const t0 = performance.now();
    const mv = await this.ai.think(this.game, this.opts.level || 'medium');
    // 至少“思考”一会儿，更有临场感
    const minWait = 500 - (performance.now() - t0);
    if (minWait > 0) await new Promise((r) => setTimeout(r, minWait));
    // 等待动画播完再落子
    await this.visualQueue;
    this.aiThinking = false;
    if (this.disposed || !mv || this.game.history.length !== ply || this.game.result) {
      this.updateHud();
      return;
    }
    this.applyMove(mv.from, mv.to, 'ai');
  }

  async hint() {
    if (!this.canInteract()) return;
    if (!this.hintAI) this.hintAI = this.ai || new AIPlayer();
    this.app.ui.toast('军师正在推演……', 1200);
    const mv = await this.hintAI.think(this.game, 'medium', 900);
    if (!mv || this.disposed || !this.canInteract()) return;
    this.select(mv.from);
    this.pieces.showTargets([mv.to], this.game.board, 0x6fffd0);
    this.targets = [mv.to];
  }

  // ---------- 悔棋 / 和棋 / 认输 ----------
  undoPlies() {
    const g = this.game;
    if (this.mode === 'ai') {
      // 回到我方走棋前
      if (!g.history.length) return 0;
      const last = g.history[g.history.length - 1];
      return last.color === this.myColor ? 1 : Math.min(2, g.history.length);
    }
    return g.history.length ? 1 : 0;
  }

  async undo(n = this.undoPlies()) {
    if (!n) {
      this.app.ui.toast('尚无可悔之棋', 1000);
      return false;
    }
    this.ai?.cancel();
    this.aiThinking = false;
    await this.visualQueue;
    for (let i = 0; i < n; i++) this.game.undo();
    this.ended = false;
    this.deselect();
    await this.app.fx.rewind(this.game.board);
    const last = this.game.history[this.game.history.length - 1];
    this.pieces.showLastMove(last ? last.from : -1, last ? last.to : -1);
    if (last?.check) this.pieces.setCheck(findKing(this.game.board, this.game.turn));
    this.updateHud();
    if (this.mode === 'local' && settings.get('autoFlip')) this.app.rig.setSide(this.game.turn);
    this.maybeAITurn();
    return true;
  }

  // 外部（联机）直接同步整个局面
  async syncState(moves, result) {
    await this.visualQueue;
    const g = new XiangqiGame(this.game.startFEN);
    for (const [f, t] of moves) g.move(f, t);
    if (result) g.setResult(result.winner, result.reason);
    this.game = g;
    this.deselect();
    this.pieces.sync(g.board);
    const last = g.history[g.history.length - 1];
    this.pieces.showLastMove(last ? last.from : -1, last ? last.to : -1);
    if (last?.check && !result) this.pieces.setCheck(findKing(g.board, g.turn));
    this.updateHud();
  }

  resign(color = this.controlledColor()) {
    if (this.ended || this.game.result) return;
    this.game.setResult(color ^ 1, 'resign');
    this.finish(this.game.result);
  }

  agreeDraw() {
    if (this.ended) return;
    this.game.setResult(null, 'agreement');
    this.finish(this.game.result);
  }

  // ---------- 计时 ----------
  startClock() {
    if (!this.clock) return;
    this.clock.running = this.game.turn;
    this.clock.since = performance.now();
    this.stopClockTimer();
    this.clockTimer = setInterval(() => this.tickClock(), 250);
  }

  stopClockTimer() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  clockRemaining(color) {
    const c = this.clock;
    if (!c) return null;
    let r = c.remaining[color];
    if (c.running === color && !this.ended) r -= Math.max(0, performance.now() - c.since);
    return Math.max(0, r);
  }

  onClockMove(rec) {
    const c = this.clock;
    if (!c || this.mode === 'online') return;
    const now = performance.now();
    c.remaining[rec.color] -= Math.max(0, now - c.since);
    c.remaining[rec.color] += this.opts.timeControl.inc || 0;
    c.running = rec.result ? null : this.game.turn;
    // 动画播放时间不计入对方用时
    c.since = now + this.app.fx.estimateDuration(rec) * 1000;
  }

  tickClock() {
    if (!this.clock || this.ended) return;
    const c = this.clock;
    if (c.running === null) return;
    if (this.mode !== 'online' && this.clockRemaining(c.running) <= 0) {
      this.game.setResult(c.running ^ 1, 'timeout');
      this.finish(this.game.result);
      return;
    }
    this.app.ui.hud.updateClocks(this);
  }

  // ---------- 结算 ----------
  async finish(result) {
    if (this.ended) return;
    this.ended = true;
    this.stopClockTimer();
    this.ai?.cancel();
    this.deselect();
    this.updateHud();
    await this.visualQueue;
    if (this.disposed) return;
    this.app.ui.hud.setTurnBanner(null);
    await this.app.onMatchEnd(this, result);
  }

  resultText(result) {
    return RESULT_TEXT[result.reason] || '';
  }

  // ---------- HUD ----------
  updateHud() {
    if (this.disposed) return;
    this.app.ui.hud.update(this);
  }

  capturedBy(color) {
    // color 方吃掉的子
    return this.game.history.filter((h) => h.captured && h.color === color).map((h) => h.captured);
  }

  isKingSquare(s) {
    return (this.game.board[s] & 7) === KING;
  }
}

export { RED, BLACK };
