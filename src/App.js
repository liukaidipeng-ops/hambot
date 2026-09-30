// 应用主控：启动、菜单、对局、联机、结算
import { Stage } from './render/Stage.js';
import { Environment } from './render/Environment.js';
import { BoardView } from './render/BoardView.js';
import { PieceSet } from './render/Pieces.js';
import { CameraRig } from './render/CameraRig.js';
import { Animator } from './core/anim.js';
import { loadFonts } from './core/fonts.js';
import { settings } from './core/settings.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { FX } from './fx/FX.js';
import { registerCinematics } from './fx/cinematics/index.js';
import { UI, h } from './ui/UI.js';
import { MatchController } from './game/MatchController.js';
import { XiangqiGame, RED, BLACK, RESULT_TEXT } from '../shared/xiangqi.js';
import { AI_LEVELS } from '../shared/ai.js';
import { EndingDirector } from './ending/EndingDirector.js';
import { NetClient } from './net/NetClient.js';

function setProgress(p, tip) {
  const bar = document.querySelector('.ld-bar i');
  if (bar) bar.style.width = Math.round(p * 100) + '%';
  const t = document.querySelector('.ld-tip');
  if (t && tip !== undefined) t.textContent = tip;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class App {
  async boot() {
    setProgress(0.08, '研墨铺纸……');
    await loadFonts();
    setProgress(0.2, '雕琢棋子……');
    await nextFrame();
    const qParam = new URLSearchParams(location.search).get('q');
    this.stage = new Stage(document.getElementById('scene'), qParam || settings.resolvedQuality());
    this.anim = new Animator();
    this.stage.add((dt, t, raw) => this.anim.update(dt, raw));
    this.audio = new AudioEngine();
    this.env = new Environment(this.stage);
    setProgress(0.4, '引水成河……');
    await nextFrame();
    this.board = new BoardView(this.stage);
    this.stage.scene.add(this.board.group);
    setProgress(0.6, '排兵布阵……');
    await nextFrame();
    this.pieces = new PieceSet(this.stage, this.anim);
    this.stage.scene.add(this.pieces.group);
    this.rig = new CameraRig(this.stage, this.stage.canvas);
    this.fx = new FX(this);
    registerCinematics(this.fx);
    setProgress(0.8, '点将出征……');
    await nextFrame();
    this.ending = new EndingDirector(this);
    this.ui = new UI(this);
    this.actions = this.makeActions();
    this.pieces.sync(new XiangqiGame().board);
    this.stage.onFps = (fps) => this.autoQuality(fps);
    this.stage.start();
    // 预热一帧，编译着色器
    await nextFrame();
    setProgress(1, '');
    const ld = document.getElementById('loading');
    ld.classList.add('hide');
    setTimeout(() => ld.remove(), 1200);

    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (room) {
      this.showMenuBackdrop();
      this.joinRoom(room.toUpperCase());
    } else {
      this.showMenu();
    }
  }

  // ---------- 画质 ----------
  applyQuality() {
    const q = settings.resolvedQuality();
    this.stage.setQuality(q);
    this.ui.toast('画质已切换', 1000);
  }

  autoQuality(fps) {
    if (settings.get('quality') !== 'auto') return;
    this._lowFps = fps < 28 ? (this._lowFps || 0) + 1 : 0;
    if (this._lowFps >= 3 && this.stage.quality !== 'low') {
      const next = this.stage.quality === 'high' ? 'medium' : 'low';
      this.stage.setQuality(next);
      this._lowFps = 0;
      console.info('auto quality ->', next);
    }
  }

  // ---------- 菜单 ----------
  showMenuBackdrop() {
    this.rig.idleSpin = 0.06;
    this.rig.goal.polar = 0.95;
    this.rig._polarSetByUser = true;
    this.rig.userZoom = 1.25;
    this.rig.refit();
    this.audio.setMood('calm');
    this.audio.ambience('river');
  }

  showMenu() {
    this.ui.hud.hide();
    this.pieces.sync(new XiangqiGame().board);
    this.pieces.showLastMove(-1);
    this.showMenuBackdrop();
    this.ui.menu.show();
    if (location.search.includes('room=')) history.replaceState(null, '', location.pathname);
  }

  // ---------- 开局 ----------
  beginMatch(opts) {
    this.endMatch();
    this.ui.menu.hide();
    this.rig._polarSetByUser = false;
    this.rig.userZoom = 1;
    this.match = new MatchController(this, opts);
    this.match.aiLabel = opts.mode === 'ai' ? AI_LEVELS[opts.level]?.label : '';
    this.match.roomCode = opts.roomCode;
    this.match.start();
    this.audio.setMood('battle');
    this.audio.ambience('river');
    this.audio.play('drum', { delay: 0.1 });
    this.audio.play('gong', { delay: 0.35 });
    return this.match;
  }

  endMatch() {
    if (this.match) {
      this.match.dispose();
      this.match = null;
    }
    this.fx.debris.clear();
    this.ending.stop();
  }

  startAI(level, color) {
    const name = settings.get('name');
    const players = [];
    players[color] = { name };
    players[color ^ 1] = { name: 'AI 军师' };
    this.beginMatch({ mode: 'ai', myColor: color, level, players });
  }

  startLocal() {
    this.beginMatch({ mode: 'local', players: [{ name: '红方 · 汉' }, { name: '黑方 · 楚' }] });
  }

  // ---------- 联机 ----------
  async createRoom({ color, minutes }) {
    this.net?.close();
    this.net = new NetClient(this);
    try {
      this.ui.toast('正在开设房间……', 1200);
      const { code, link } = await this.net.create({ color, minutes });
      this.waitUI = this.ui.menu.waiting(code, link, () => {
        this.net?.close();
        this.net = null;
      });
    } catch (e) {
      console.error(e);
      this.ui.confirm('开房失败', '无法连接联机服务：' + (e.message || e) + '。请检查网络后重试。', [{ label: '好', value: true, primary: true }]);
      this.net?.close();
      this.net = null;
    }
  }

  async joinRoom(code) {
    this.net?.close();
    this.net = new NetClient(this);
    this.ui.toast('正在进入房间 ' + code + ' ……', 1500);
    try {
      await this.net.join(code);
      const st = this.net.state;
      if (st && !st.started && st.you !== null && !this.match) {
        // 房主刷新后回到自己的房间，继续等待
        this.ui.menu.show();
        this.waitUI = this.ui.menu.waiting(st.code, this.net.link(st.code), () => {
          this.net?.close();
          this.net = null;
        });
      }
    } catch (e) {
      console.error(e);
      await this.ui.confirm('入座失败', e.message || String(e), [{ label: '返回', value: true, primary: true }]);
      this.net?.close();
      this.net = null;
      this.showMenu();
    }
  }

  // 由 NetClient 调用：对局开始 / 重连
  onOnlineStart(info) {
    this.waitUI?.close('joined');
    this.waitUI = null;
    const m = this.beginMatch({
      mode: 'online',
      myColor: info.color,
      players: info.players,
      net: this.net,
      spectator: info.spectator,
      roomCode: info.code,
      timeControl: info.minutes ? { base: info.minutes * 60000, inc: 0 } : null,
    });
    if (info.moves?.length || info.result) m.syncState(info.moves, info.result);
    if (info.result) m.finish(info.result);
    return m;
  }

  // ---------- 操作 ----------
  makeActions() {
    const app = this;
    return {
      async undo() {
        const m = app.match;
        if (!m || m.ended) return;
        if (m.mode === 'online') {
          if (!m.game.history.length) return app.ui.toast('尚无可悔之棋');
          app.net.request('undo');
          app.ui.toast('已向对方请求悔棋……');
          return;
        }
        if (m.busy) return;
        await m.undo();
      },
      async draw() {
        const m = app.match;
        if (!m || m.ended) return;
        if (m.mode === 'online') {
          app.net.request('draw');
          app.ui.toast('已向对方提出和棋……');
        }
      },
      async resign() {
        const m = app.match;
        if (!m || m.ended) return;
        const ok = await app.ui.confirm('认 输', m.mode === 'local' ? `${m.game.turn === RED ? '红方' : '黑方'}确定认输吗？` : '胜败乃兵家常事，确定认输吗？', [
          { label: '再战', value: false }, { label: '认输', value: true, primary: true }]);
        if (!ok || !app.match || app.match.ended) return;
        if (m.mode === 'online') app.net.resign();
        else m.resign();
      },
      view() {
        const rig = app.rig;
        const m = app.match;
        // 在己方视角 / 对方视角 / 俯视间切换
        const states = ['mine', 'top', 'flip'];
        app._view = states[(states.indexOf(app._view || 'mine') + 1) % states.length];
        const mine = m && m.mode !== 'local' ? m.myColor : m?.game.turn ?? RED;
        rig._polarSetByUser = app._view === 'top';
        if (app._view === 'mine') {
          rig.setSide(mine);
          rig.resetView();
          app.ui.toast('己方视角', 800);
        } else if (app._view === 'top') {
          rig.setSide(mine);
          rig.goal.polar = 0.02;
          rig.goal.az = 0;
          rig.refit();
          app.ui.toast('俯瞰全局', 800);
        } else {
          rig.setSide(mine ^ 1);
          rig.resetView();
          app.ui.toast('对方视角', 800);
        }
      },
      settings() {
        app.ui.menu.settings();
      },
      async exit() {
        const m = app.match;
        if (m && !m.ended) {
          const ok = await app.ui.confirm('离 开', m.mode === 'online' ? '离开后对局将中断，确定离开吗？' : '确定结束本局返回主页吗？', [
            { label: '留下', value: false }, { label: '离开', value: true, primary: true }]);
          if (!ok) return;
        }
        app.leave();
      },
      chat(text) {
        const m = app.match;
        if (!m || m.mode !== 'online') return;
        app.net.chat(text);
        app.ui.hud.bubble(m.myColor, text);
      },
    };
  }

  leave() {
    this.net?.close();
    this.net = null;
    this.endMatch();
    this.ui.hud.hide();
    this.showMenu();
  }

  // ---------- 结算 ----------
  async onMatchEnd(match, result) {
    const winner = result.winner;
    if (result.reason === 'checkmate' || result.reason === 'stalemate') await this.fx.mateStamp(result);
    if (match !== this.match) return;
    const perspective = match.mode === 'local' ? null : match.myColor;
    this.ui.hud.el?.classList.remove('in');
    if (winner !== null && settings.get('effects') !== 'off') {
      await this.ending.play({ loser: winner ^ 1, winner, reason: result.reason, perspective });
    }
    if (match !== this.match) return;
    this.ui.hud.el?.classList.add('in');
    this.audio.setMood(winner === null ? 'calm' : perspective === null || perspective === winner ? 'triumph' : 'sad');
    this.showResult(match, result);
  }

  showResult(match, result) {
    const winner = result.winner;
    const me = match.mode === 'local' ? null : match.myColor;
    let seal;
    let cls = '';
    let title;
    if (winner === null) {
      seal = '和';
      cls = 'draw';
      title = '鸿沟为界 · 中分天下';
    } else if (me === null) {
      seal = '胜';
      title = winner === RED ? '汉军大获全胜' : '楚军大获全胜';
    } else if (winner === me) {
      seal = '胜';
      title = winner === RED ? '汉军大获全胜' : '西楚霸业可成';
    } else {
      seal = '败';
      cls = 'lose';
      title = winner === RED ? '楚歌四起 · 霸业成空' : '汉王败走 · 卷土重来';
    }
    const reason = RESULT_TEXT[result.reason] || '';
    const g = match.game;
    const moves = Math.ceil(g.history.length / 2);
    const caps = g.history.filter((x) => x.captured).length;
    const secs = Math.round((performance.now() - (match.startedAt || performance.now())) / 1000);
    const body = h('div', { class: 'result' },
      h('div', { class: 'result-seal ' + cls }, seal),
      h('h2', {}, title),
      h('div', { class: 'why' }, (winner === null ? '' : (winner === RED ? '红方' : '黑方') + '胜 · ') + reason),
      h('div', { class: 'stats' },
        h('div', {}, h('b', {}, moves), h('span', {}, '回合')),
        h('div', {}, h('b', {}, caps), h('span', {}, '吃子')),
        h('div', {}, h('b', {}, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`), h('span', {}, '用时'))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', onclick: () => { m.close('again'); this.rematch(match); } }, match.mode === 'online' ? '再战一局' : '再来一局'),
        h('button', { class: 'btn', onclick: () => m.close('board') }, '查看棋盘'),
        h('button', { class: 'btn ghost', onclick: () => { m.close('home'); this.leave(); } }, '返回主页')));
    const m = this.ui.modal(body, { closable: true });
  }

  rematch(match) {
    if (match.mode === 'online') {
      this.net?.request('rematch');
      this.ui.toast('已邀请对方再战一局……');
      return;
    }
    if (match.mode === 'ai') this.startAI(match.opts.level, match.myColor ^ 1);
    else this.startLocal();
  }
}
