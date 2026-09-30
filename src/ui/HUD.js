// 对局界面：双方信息卡、计时、吃子、操作按钮、棋谱、快捷聊天
import { h } from './UI.js';
import { RED, BLACK, PIECE_CHARS, pieceColor, pieceType } from '../../shared/xiangqi.js';

export const QUICK_PHRASES = [
  '承让承让', '好棋！', '且慢，容我三思', '快点吧，我等得花都谢了', '失误了……', '这步棋妙啊', '再来一局！', '我的炮已饥渴难耐',
  '看我铁骑踏平楚营', '力拔山兮气盖世', '大意了，没有闪', '兵贵神速',
];

function fmtClock(ms) {
  if (ms == null) return '';
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class HUD {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.el = null;
    this.match = null;
  }

  card(side) {
    const el = h('div', { class: 'pcard ' + side },
      h('div', { class: 'seal' }, ''),
      h('div', { class: 'pinfo' },
        h('div', { class: 'pname' }, h('span', { class: 'nm' }, ''), h('span', { class: 'ptag' }, '')),
        h('div', { class: 'pmeta' }, h('span', { class: 'clock' }, ''), h('span', { class: 'status' }, '')),
        h('div', { class: 'captured' })),
      h('div', { class: 'bubble' }));
    return el;
  }

  actionBtn(glyph, label, onclick, cls = '') {
    return h('button', { class: 'act ' + cls, onclick, title: label, 'aria-label': label }, h('span', { class: 'glyph' }, glyph), h('span', { class: 'lbl' }, label));
  }

  show(match) {
    this.match = match;
    this.hide();
    const app = this.app;
    const mode = match.mode;
    this.top = this.card('opp');
    this.bottom = this.card('me');
    const acts = [];
    acts.push(this.actionBtn('悔', '悔棋', () => app.actions.undo()));
    if (mode === 'online') acts.push(this.actionBtn('和', '求和', () => app.actions.draw()));
    if (mode !== 'online') acts.push(this.actionBtn('谋', '提示', () => match.hint()));
    acts.push(this.actionBtn('降', '认输', () => app.actions.resign()));
    if (mode === 'online') acts.push(this.actionBtn('言', '聊天', () => this.openChat()));
    acts.push(this.actionBtn('谱', '棋谱', () => this.toggleHistory()));
    acts.push(this.actionBtn('视', '视角', () => app.actions.view()));
    this.historyEl = h('div', { class: 'history panel' }, h('div', { class: 'history-title' }, '棋 谱'), h('ol', { class: 'moves' }));
    this.banner = h('div', { class: 'turn-banner' });
    this.roomTag = h('div', { class: 'room-tag' });
    this.el = h('div', { class: 'hud' },
      h('div', { class: 'hud-top' }, this.top,
        h('div', { class: 'hud-sys' },
          this.roomTag,
          h('button', { class: 'sys', title: '设置', onclick: () => app.actions.settings() }, '设'),
          h('button', { class: 'sys', title: '退出', onclick: () => app.actions.exit() }, '退'))),
      this.banner,
      h('div', { class: 'hud-bottom' }, this.bottom, h('div', { class: 'hud-actions' }, acts)),
      this.historyEl);
    this.ui.root.appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('in'));
    this.lastTurn = null;
    this.updateSafeArea();
    this._onResize = () => this.updateSafeArea();
    window.addEventListener('resize', this._onResize);
  }

  // 告诉镜头 HUD 占用的屏幕区域
  updateSafeArea() {
    if (!this.el) return;
    requestAnimationFrame(() => {
      const H = window.innerHeight;
      const W = window.innerWidth;
      const topR = this.el.querySelector('.hud-top').getBoundingClientRect();
      const botR = this.el.querySelector('.hud-bottom').getBoundingClientRect();
      const portrait = H > W;
      this.app.rig.setSafeArea({
        top: portrait ? (topR.bottom + 6) / H : 0.04,
        bottom: portrait ? (H - botR.top + 6) / H : 0.04,
        left: portrait ? 0.02 : 0.2,
        right: portrait ? 0.02 : 0.2,
      });
    });
  }

  hide() {
    if (this.el) {
      const el = this.el;
      el.classList.remove('in');
      setTimeout(() => el.remove(), 300);
      this.el = null;
    }
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.app.rig?.setSafeArea({ top: 0.08, bottom: 0.08, left: 0.03, right: 0.03 });
  }

  // 哪一方显示在底部
  bottomColor(m) {
    if (m.mode === 'local') return RED;
    return m.myColor ?? RED;
  }

  fillCard(el, color, m) {
    const p = m.players[color] || {};
    const seal = el.querySelector('.seal');
    seal.textContent = color === RED ? '汉' : '楚';
    seal.className = 'seal ' + (color === RED ? 'red' : 'black');
    el.querySelector('.nm').textContent = p.name || (color === RED ? '红方' : '黑方');
    let tag = color === RED ? '执红' : '执黑';
    if (m.mode === 'ai' && color !== m.myColor) tag = 'AI · ' + (m.aiLabel || '');
    if (m.mode !== 'local' && color === m.myColor) tag += ' · 我';
    el.querySelector('.ptag').textContent = tag;
    const active = !m.ended && !m.game.result && m.game.turn === color;
    el.classList.toggle('active', active);
    el.classList.toggle('offline', p.online === false);
    let status = '';
    if (p.online === false) status = '已离线';
    else if (active) {
      if (m.mode === 'ai' && color !== m.myColor) status = '运筹中…';
      else if (m.mode === 'online' && color !== m.myColor) status = '思考中…';
      else status = '请走棋';
    }
    el.querySelector('.status').textContent = status;
    const cap = el.querySelector('.captured');
    const caps = m.capturedBy(color);
    const key = caps.join(',');
    if (cap.dataset.key !== key) {
      cap.dataset.key = key;
      cap.innerHTML = '';
      const order = [5, 4, 6, 3, 2, 7, 1];
      caps.sort((a, b) => order.indexOf(pieceType(a)) - order.indexOf(pieceType(b)));
      for (const p2 of caps) {
        cap.appendChild(h('span', { class: 'tok ' + (pieceColor(p2) === RED ? 'r' : 'b') }, PIECE_CHARS[pieceColor(p2)][pieceType(p2)]));
      }
    }
  }

  update(m) {
    if (!this.el || m !== this.match) return;
    const bc = this.bottomColor(m);
    this.fillCard(this.bottom, bc, m);
    this.fillCard(this.top, bc ^ 1, m);
    this.updateClocks(m);
    // 棋谱
    const ol = this.historyEl.querySelector('.moves');
    const hist = m.game.history;
    if (ol.childElementCount !== Math.ceil(hist.length / 2) || this._histLen !== hist.length) {
      this._histLen = hist.length;
      ol.innerHTML = '';
      for (let i = 0; i < hist.length; i += 2) {
        const a = hist[i];
        const b = hist[i + 1];
        ol.appendChild(h('li', {}, h('span', { class: 'mv ' + (a.color === RED ? 'r' : 'b') }, a.notation), b ? h('span', { class: 'mv ' + (b.color === RED ? 'r' : 'b') }, b.notation) : null));
      }
      ol.scrollTop = ol.scrollHeight;
    }
    // 轮次提示
    const turnKey = m.game.history.length + ':' + m.ended;
    if (turnKey !== this.lastTurn && !m.ended && !m.game.result) {
      this.lastTurn = turnKey;
      if (m.mode === 'local') this.setTurnBanner(m.game.turn === RED ? '红方走棋' : '黑方走棋');
      else if (m.isMyTurn() && m.game.history.length > 0) this.setTurnBanner('轮到你了');
      else if (m.isMyTurn()) this.setTurnBanner(m.myColor === RED ? '执红先行' : '请走棋');
      else this.setTurnBanner(null);
    }
    const undoBtn = this.el.querySelector('.act[title="悔棋"]');
    if (undoBtn) undoBtn.disabled = m.ended || m.game.history.length === 0;
    if (m.roomCode) this.roomTag.textContent = '房间 ' + m.roomCode;
  }

  setTurnBanner(text) {
    if (!this.banner) return;
    clearTimeout(this._bannerT);
    if (!text) {
      this.banner.classList.remove('in');
      return;
    }
    this.banner.textContent = text;
    this.banner.classList.remove('in');
    void this.banner.offsetWidth;
    this.banner.classList.add('in');
    this._bannerT = setTimeout(() => this.banner.classList.remove('in'), 1800);
  }

  updateClocks(m) {
    if (!this.el || m !== this.match) return;
    const bc = this.bottomColor(m);
    for (const [el, color] of [[this.bottom, bc], [this.top, bc ^ 1]]) {
      const c = el.querySelector('.clock');
      const r = m.clockRemaining(color);
      c.textContent = r == null ? '' : fmtClock(r);
      c.classList.toggle('low', r != null && r < 30000);
    }
  }

  toggleHistory() {
    this.historyEl.classList.toggle('open');
  }

  // 聊天气泡
  bubble(color, text) {
    if (!this.el || !this.match) return;
    const el = color === this.bottomColor(this.match) ? this.bottom : this.top;
    const b = el.querySelector('.bubble');
    b.textContent = text;
    b.classList.remove('in');
    void b.offsetWidth;
    b.classList.add('in');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('in'), 4200);
  }

  openChat() {
    const list = h('div', { class: 'phrases' }, QUICK_PHRASES.map((p) => h('button', {
      class: 'phrase',
      onclick: () => {
        this.app.actions.chat(p);
        m.close();
      },
    }, p)));
    const m = this.ui.modal(list, { title: '传 书', cls: 'chat-modal' });
  }
}
