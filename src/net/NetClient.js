// 联机客户端：把房间消息映射到对局控制器
import { settings } from '../core/settings.js';
import { detectServer, ServerTransport, RelayTransport } from './transports.js';
import { RED } from '../../shared/xiangqi.js';

export class NetClient {
  constructor(app) {
    this.app = app;
    this.clientId = settings.get('clientId');
    this.closed = false;
    this.state = null;
  }

  get match() {
    const m = this.app.match;
    return m && m.opts.net === this ? m : null;
  }

  async makeTransport() {
    const url = await detectServer();
    const t = url ? new ServerTransport(url, this.clientId) : new RelayTransport(this.clientId);
    this.mode = url ? 'server' : 'relay';
    t.onMessage = (m) => this.onMessage(m);
    t.onStatus = (s) => this.onStatus(s);
    this.t = t;
    return t;
  }

  link(code) {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('room', code);
    const cur = new URLSearchParams(location.search);
    for (const k of ['server', 'broker', 'relay']) if (cur.get(k)) u.searchParams.set(k, cur.get(k));
    return u.href;
  }

  async create(opts) {
    const t = await this.makeTransport();
    const code = await t.create(opts);
    this.code = code;
    this.hello();
    return { code, link: this.link(code) };
  }

  async join(code) {
    const t = await this.makeTransport();
    this.code = await t.join(code);
    this.hello();
    // 等待房间回应（房主可能正切在微信里发链接，最多等一分钟）
    const limit = this.mode === 'server' ? 10000 : 60000;
    await new Promise((resolve, reject) => {
      const t0 = Date.now();
      let lastHello = t0;
      let hinted = false;
      const iv = setInterval(() => {
        const el = Date.now() - t0;
        if (this.state) {
          clearInterval(iv);
          resolve();
        } else if (this.closed) {
          clearInterval(iv);
          reject(new Error('已取消'));
        } else if (el > limit) {
          clearInterval(iv);
          reject(new Error('房间不存在，或房主已离开。请确认房间号后重试。'));
        } else {
          if (Date.now() - lastHello > 3000) {
            lastHello = Date.now();
            this.hello();
          }
          if (!hinted && el > 8000) {
            hinted = true;
            this.app.ui.toast('正在等待房主响应……（请房主回到游戏页面）', 5000);
          }
        }
      }, 300);
    });
  }

  hello() {
    this.t.send({ t: 'hello', name: settings.get('name'), clientId: this.clientId });
  }

  // ---------- 发送 ----------
  sendMove(from, to, ply) {
    this.lastMoveSent = { from, to, ply, at: Date.now() };
    this.t.send({ t: 'move', from, to, ply });
  }

  // 房主心跳：比对手数，补发丢失的走子或请求同步
  onBeat(b) {
    const m = this.match;
    if (!m) {
      if (b.started && this.state && !this.state.started) this.t.send({ t: 'sync' });
      return;
    }
    const local = m.game.history.length;
    if (b.ply === local) return;
    const lm = this.lastMoveSent;
    if (b.ply === local - 1 && lm && lm.ply === b.ply && Date.now() - lm.at > 2500) {
      lm.at = Date.now();
      this.t.send({ t: 'move', from: lm.from, to: lm.to, ply: lm.ply });
    } else if (b.ply > local || (b.ply < local - 1)) {
      this.t.send({ t: 'sync' });
    }
  }

  request(kind) {
    this.t.send({ t: 'req', kind });
  }

  respond(kind, accept) {
    this.t.send({ t: 'resp', kind, accept });
  }

  resign() {
    this.t.send({ t: 'resign' });
  }

  chat(text) {
    this.t.send({ t: 'chat', text });
  }

  close() {
    this.closed = true;
    this.t?.close();
  }

  // ---------- 接收 ----------
  onStatus(s) {
    if (this.closed) return;
    const ui = this.app.ui;
    if (s === 'offline') ui.toast('网络中断，正在重连……', 2500);
    else if (s === 'reconnected') {
      ui.toast('已重新连接', 1500);
      this.hello();
    } else if (s === 'host_offline' && this.match) ui.toast('房主连接中断，等待其返回……', 3000);
  }

  applyClock(clock) {
    const m = this.match;
    if (!m || !clock) return;
    if (!m.clock) m.clock = { remaining: [0, 0], running: null, since: 0 };
    m.clock.remaining = clock.remaining.slice();
    m.clock.running = clock.running;
    m.clock.since = performance.now() + (clock.grace || 0);
    if (!m.clockTimer && !m.ended) m.clockTimer = setInterval(() => m.tickClock(), 250);
  }

  onMessage(msg) {
    if (this.closed) return;
    const app = this.app;
    const m = this.match;
    switch (msg.t) {
      case 'state':
        return this.onState(msg);
      case 'beat':
        return this.onBeat(msg);
      case 'move': {
        if (!m) return;
        const g = m.game;
        if (msg.ply < g.history.length) {
          const h = g.history[msg.ply];
          if (!h || h.from !== msg.from || h.to !== msg.to) this.t.send({ t: 'sync' });
        } else if (msg.ply === g.history.length) {
          m.applyMove(msg.from, msg.to, 'remote');
        } else this.t.send({ t: 'sync' });
        this.applyClock(msg.clock);
        return;
      }
      case 'req': {
        if (!m) return;
        if (msg.by === m.myColor) return;
        const text = { undo: '对方请求悔棋，是否同意？', draw: '对方提议和棋，是否同意？', rematch: '对方邀请再战一局（交换先后手），是否应战？' }[msg.kind];
        app.audio.play('gong', { vol: 0.25 });
        app.ui.confirm({ undo: '悔 棋', draw: '议 和', rematch: '再 战' }[msg.kind], text, [
          { label: '拒绝', value: false }, { label: '同意', value: true, primary: true }], { timeout: 30000 }).then((ok) => this.respond(msg.kind, !!ok));
        return;
      }
      case 'resp': {
        if (!m || msg.by === m.myColor) return;
        const names = { undo: '悔棋', draw: '和棋', rematch: '再战' };
        app.ui.toast(`对方${msg.accept ? '同意' : '拒绝'}了${names[msg.kind]}`, 1800);
        return;
      }
      case 'chat':
        if (!m || msg.from === this.clientId) return;
        app.ui.hud.bubble(msg.color ?? RED, msg.text);
        app.audio.play('pick');
        return;
      case 'result':
        if (!m) return;
        if (!m.ended) {
          m.game.setResult(msg.result.winner, msg.result.reason);
          m.finish(msg.result);
        }
        return;
      case 'presence': {
        if (!m) return;
        const before = m.players.map((p) => p.online);
        m.players = msg.players;
        const opp = m.myColor ^ 1;
        if (before[opp] !== msg.players[opp].online && !msg.players[opp].empty) {
          app.ui.toast(msg.players[opp].online ? '对方已重新连线' : '对方已离线，等待其重连……', 2200);
        }
        m.updateHud();
        return;
      }
      case 'error':
        app.ui.toast(msg.msg || '联机错误', 2500);
        return;
      default:
    }
  }

  onState(s) {
    const first = !this.state;
    this.state = s;
    const app = this.app;
    if (first && app.waitUI && !s.started) app.waitUI.setStatus('等待好友入座……');
    if (!s.started) {
      if (s.you === null) app.ui.toast('房间已满，你正在观战', 2000);
      return;
    }
    let m = this.match;
    const info = {
      code: s.code,
      color: s.you === null ? RED : s.you,
      spectator: s.you === null,
      players: s.players,
      minutes: s.minutes,
      moves: s.moves,
      result: s.result,
    };
    if (!m || s.rematch || m.round !== s.round) {
      m = app.onOnlineStart(info);
      m.round = s.round;
      m.spectator = info.spectator;
    } else {
      m.players = s.players;
      const local = m.game.moveList();
      const same = local.length === s.moves.length && local.every((mv, i) => mv[0] === s.moves[i][0] && mv[1] === s.moves[i][1]);
      if (!same) {
        const isPrefix = s.moves.length < local.length && s.moves.every((mv, i) => mv[0] === local[i][0] && mv[1] === local[i][1]);
        if (isPrefix) {
          // 悔棋
          m.undo(local.length - s.moves.length);
        } else m.syncState(s.moves, s.result);
      }
      if (s.result && !m.ended) {
        m.game.setResult(s.result.winner, s.result.reason);
        m.finish(s.result);
      }
      m.updateHud();
    }
    this.applyClock(s.clock);
  }
}
