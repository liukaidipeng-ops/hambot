// 联机房间（权威逻辑）：Node 服务器与浏览器房主（MQTT 中继模式）共用
import { XiangqiGame, RED, BLACK, PAWN, sqOf } from './xiangqi.js';

export const PROTOCOL = 1;
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(len = 6, first = null) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const idx = i === 0 && first !== null ? first : Math.floor(Math.random() * CODE_ALPHABET.length);
    s += CODE_ALPHABET[idx];
  }
  return s;
}

// 动画宽限：对方开始计时前的动画播放时间（与客户端特效时长大致一致）
export function animGraceMs(rec) {
  if (!rec) return 0;
  if (rec.captured) return 4500;
  if (rec.crossesRiver) return 2600;
  if ((rec.piece & 7) === PAWN) return 2000;
  return 800;
}

const OFFLINE_FORFEIT_MS = 180000;

export class RoomHost {
  // opts: { code, color: 'random'|'red'|'black', minutes, creatorId, now }
  constructor(opts) {
    this.code = opts.code;
    this.minutes = opts.minutes || 0;
    this.creatorId = opts.creatorId;
    this.now = opts.now || (() => Date.now());
    const c = opts.color === 'red' ? RED : opts.color === 'black' ? BLACK : Math.random() < 0.5 ? RED : BLACK;
    this.creatorColor = c;
    this.seats = [null, null]; // clientId
    this.clients = new Map(); // clientId -> {id, name, online, lastSeen}
    this.round = 1;
    this.resetGame();
    this.send = () => {};
    this.lastActive = this.now();
  }

  resetGame() {
    this.game = new XiangqiGame();
    this.result = null;
    this.pending = null;
    this.started = false;
    const base = this.minutes * 60000;
    this.clock = base ? { remaining: [base, base], running: null, since: 0 } : null;
  }

  // ---------- 连接 ----------
  handle(clientId, msg) {
    this.lastActive = this.now();
    const c = this.clients.get(clientId);
    if (c) {
      c.lastSeen = this.now();
      if (!c.online && msg.t !== 'bye') {
        c.online = true;
        this.broadcastPresence();
      }
    }
    switch (msg.t) {
      case 'hello':
        return this.onHello(clientId, msg);
      case 'move':
        return this.onMove(clientId, msg);
      case 'req':
        return this.onRequest(clientId, msg);
      case 'resp':
        return this.onResponse(clientId, msg);
      case 'resign':
        return this.onResign(clientId);
      case 'chat':
        return this.onChat(clientId, msg);
      case 'sync':
        return this.sendState(clientId);
      case 'ping':
        return this.send(clientId, { t: 'pong', ts: msg.ts });
      case 'bye':
        return this.disconnect(clientId);
      default:
        return undefined;
    }
  }

  onHello(clientId, msg) {
    const name = String(msg.name || '无名氏').slice(0, 16);
    let c = this.clients.get(clientId);
    if (!c) {
      c = { id: clientId, name, online: true, lastSeen: this.now() };
      this.clients.set(clientId, c);
    }
    c.name = name;
    c.online = true;
    // 入座
    if (!this.seats.includes(clientId)) {
      if (clientId === this.creatorId) {
        if (this.seats[this.creatorColor] === null) this.seats[this.creatorColor] = clientId;
      } else if (this.seats[this.creatorColor ^ 1] === null) {
        this.seats[this.creatorColor ^ 1] = clientId;
      }
      // 座位已满者为观战
    }
    if (!this.started && this.seats[RED] && this.seats[BLACK]) {
      this.started = true;
      this.startClock();
    }
    this.broadcastState();
  }

  disconnect(clientId) {
    const c = this.clients.get(clientId);
    if (!c) return;
    c.online = false;
    c.offlineSince = this.now();
    this.broadcastPresence();
  }

  colorOf(clientId) {
    if (this.seats[RED] === clientId) return RED;
    if (this.seats[BLACK] === clientId) return BLACK;
    return null;
  }

  // ---------- 走子 ----------
  onMove(clientId, msg) {
    const color = this.colorOf(clientId);
    const g = this.game;
    if (color === null || !this.started || this.result) return this.sendState(clientId);
    if (g.turn !== color || msg.ply !== g.history.length) return this.sendState(clientId);
    this.chargeClock(color);
    if (this.result) return undefined;
    const rec = g.move(msg.from, msg.to);
    if (!rec) return this.sendState(clientId);
    this.pending = null;
    if (this.clock) {
      this.clock.running = g.result ? null : g.turn;
      this.clock.since = this.now() + animGraceMs(rec);
    }
    this.broadcast({ t: 'move', from: msg.from, to: msg.to, ply: rec.ply, clock: this.clockView() });
    if (g.result) this.setResult(g.result);
    return rec;
  }

  // ---------- 请求：悔棋 / 和棋 / 再战 ----------
  onRequest(clientId, msg) {
    const color = this.colorOf(clientId);
    if (color === null) return;
    const kind = msg.kind;
    if (kind === 'rematch') {
      if (!this.result) return;
    } else if (this.result || !this.started) return;
    if (kind === 'undo') {
      // 需要有己方走过的棋
      if (!this.game.history.some((h) => h.color === color)) return;
    }
    if (this.pending && this.pending.kind === kind && this.pending.by !== color) {
      // 双方同时请求：直接同意
      return this.onResponse(clientId, { kind, accept: true });
    }
    this.pending = { kind, by: color, ply: this.game.history.length };
    this.broadcast({ t: 'req', kind, by: color });
  }

  onResponse(clientId, msg) {
    const color = this.colorOf(clientId);
    const p = this.pending;
    if (color === null || !p || p.kind !== msg.kind || p.by === color) return;
    this.pending = null;
    if (!msg.accept) {
      this.broadcast({ t: 'resp', kind: p.kind, accept: false, by: color });
      return;
    }
    if (p.kind === 'undo') {
      const g = this.game;
      // 撤回到请求方上一次走棋之前
      let n = 0;
      for (let i = g.history.length - 1; i >= 0; i--) {
        n++;
        if (g.history[i].color === p.by) break;
      }
      for (let i = 0; i < n; i++) g.undo();
      if (this.clock) {
        this.clock.running = g.turn;
        this.clock.since = this.now();
      }
      this.broadcast({ t: 'resp', kind: 'undo', accept: true, by: color });
      this.broadcastState();
    } else if (p.kind === 'draw') {
      this.broadcast({ t: 'resp', kind: 'draw', accept: true, by: color });
      this.setResult({ winner: null, reason: 'agreement' });
    } else if (p.kind === 'rematch') {
      this.round++;
      // 交换座位
      this.seats = [this.seats[BLACK], this.seats[RED]];
      this.creatorColor ^= 1;
      this.resetGame();
      this.started = !!(this.seats[RED] && this.seats[BLACK]);
      if (this.started) this.startClock();
      this.broadcast({ t: 'resp', kind: 'rematch', accept: true, by: color });
      this.broadcastState({ rematch: true });
    }
  }

  onResign(clientId) {
    const color = this.colorOf(clientId);
    if (color === null || this.result || !this.started) return;
    this.setResult({ winner: color ^ 1, reason: 'resign' });
  }

  onChat(clientId, msg) {
    const color = this.colorOf(clientId);
    const c = this.clients.get(clientId);
    const text = String(msg.text || '').slice(0, 60);
    if (!text) return;
    this.broadcast({ t: 'chat', color, name: c?.name, text, from: clientId });
  }

  setResult(result) {
    this.result = result;
    this.game.result = result;
    if (this.clock) this.clock.running = null;
    this.pending = null;
    this.broadcast({ t: 'result', result });
  }

  // ---------- 计时 ----------
  startClock() {
    if (!this.clock) return;
    this.clock.running = this.game.turn;
    this.clock.since = this.now() + 1500;
  }

  chargeClock(color) {
    const c = this.clock;
    if (!c || c.running !== color) return;
    const used = Math.max(0, this.now() - c.since);
    c.remaining[color] -= used;
    c.since = this.now();
    if (c.remaining[color] <= 0) {
      c.remaining[color] = 0;
      this.setResult({ winner: color ^ 1, reason: 'timeout' });
    }
  }

  clockView() {
    const c = this.clock;
    if (!c) return null;
    const now = this.now();
    const remaining = c.remaining.slice();
    let grace = 0;
    if (c.running !== null) {
      if (now < c.since) grace = c.since - now;
      else remaining[c.running] -= now - c.since;
    }
    return { remaining, running: c.running, grace };
  }

  // 定时调用：超时、离线判负
  tick() {
    const now = this.now();
    if (this.clock && this.clock.running !== null && !this.result) {
      const c = this.clock;
      if (now > c.since && c.remaining[c.running] - (now - c.since) <= 0) {
        this.chargeClock(c.running);
      }
    }
    if (this.started && !this.result) {
      for (const color of [RED, BLACK]) {
        const c = this.clients.get(this.seats[color]);
        if (c && !c.online && c.offlineSince && now - c.offlineSince > OFFLINE_FORFEIT_MS) {
          this.setResult({ winner: color ^ 1, reason: 'abandon' });
          break;
        }
      }
    }
  }

  // ---------- 状态 ----------
  playersView() {
    return [RED, BLACK].map((color) => {
      const id = this.seats[color];
      const c = id ? this.clients.get(id) : null;
      return c ? { name: c.name, online: c.online } : { name: color === this.creatorColor ? '房主' : '虚位以待', online: false, empty: true };
    });
  }

  snapshot(clientId) {
    return {
      t: 'state',
      proto: PROTOCOL,
      code: this.code,
      you: this.colorOf(clientId),
      players: this.playersView(),
      moves: this.game.moveList(),
      result: this.result,
      started: this.started,
      minutes: this.minutes,
      clock: this.clockView(),
      pending: this.pending,
      round: this.round,
    };
  }

  sendState(clientId, extra = {}) {
    this.send(clientId, { ...this.snapshot(clientId), ...extra });
  }

  broadcastState(extra = {}) {
    for (const id of this.clients.keys()) this.sendState(id, extra);
  }

  broadcastPresence() {
    this.broadcast({ t: 'presence', players: this.playersView() });
  }

  broadcast(msg) {
    for (const id of this.clients.keys()) this.send(id, msg);
  }

  // ---------- 持久化（浏览器房主刷新后恢复） ----------
  serialize() {
    return {
      code: this.code,
      minutes: this.minutes,
      creatorId: this.creatorId,
      creatorColor: this.creatorColor,
      seats: this.seats,
      clients: [...this.clients.values()].map((c) => ({ id: c.id, name: c.name })),
      moves: this.game.moveList(),
      result: this.result,
      started: this.started,
      clock: this.clock,
      round: this.round,
      savedAt: this.now(),
    };
  }

  static restore(data, now) {
    const r = new RoomHost({ code: data.code, minutes: data.minutes, creatorId: data.creatorId, color: 'red', now });
    r.creatorColor = data.creatorColor;
    r.seats = data.seats;
    for (const c of data.clients) r.clients.set(c.id, { id: c.id, name: c.name, online: false, offlineSince: r.now() });
    for (const [f, t] of data.moves) r.game.move(f, t);
    r.result = data.result;
    if (r.result) r.game.result = r.result;
    r.started = data.started;
    r.clock = data.clock;
    if (r.clock && r.clock.running !== null) r.clock.since = r.now() + 3000; // 刷新期间不计时
    r.round = data.round || 1;
    return r;
  }
}

export { sqOf };
