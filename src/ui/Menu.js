// 主菜单、人机设置、联机大厅、设置、玩法说明
import { h } from './UI.js';
import { settings } from '../core/settings.js';
import { AI_LEVELS } from '../../shared/ai.js';
import qrcode from 'qrcode-generator';

function seg(options, value, onChange) {
  const el = h('div', { class: 'seg' });
  const render = (v) => {
    el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  };
  for (const [v, label] of options) {
    el.appendChild(h('button', {
      'data-v': String(v),
      onclick: () => {
        render(v);
        onChange(v);
      },
    }, label));
  }
  render(value);
  return el;
}

export class MainMenu {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
  }

  show() {
    const app = this.app;
    const nameEl = h('span', { class: 'nm' }, settings.get('name'));
    const el = h('div', { class: 'screen menu' },
      h('div', { class: 'menu-head' },
        h('div', { class: 'menu-seal' }, '楚', h('br'), '漢'),
        h('h1', { class: 'menu-title' }, '楚河汉界'),
        h('div', { class: 'menu-sub' }, '三 维 象 棋 · 楚 汉 争 霸')),
      h('div', { class: 'menu-btns' },
        h('button', { class: 'btn big primary', onclick: () => this.online() }, h('b', {}, '联机对战'), h('small', {}, '邀好友 · 一决雌雄')),
        h('button', { class: 'btn big', onclick: () => this.aiSetup() }, h('b', {}, '人机对战'), h('small', {}, '挑战 AI 军师')),
        h('button', { class: 'btn big', onclick: () => app.startLocal() }, h('b', {}, '同屏对弈'), h('small', {}, '一台设备 · 两人轮流'))),
      h('div', { class: 'menu-foot' },
        h('button', { class: 'link', onclick: () => this.editName(nameEl) }, '名号：', nameEl, ' ✎'),
        h('span', { class: 'dot' }, '·'),
        h('button', { class: 'link', onclick: () => this.settings() }, '设置'),
        h('span', { class: 'dot' }, '·'),
        h('button', { class: 'link', onclick: () => this.rules() }, '玩法')));
    this.el = el;
    this.ui.showScreen(el);
  }

  hide() {
    this.ui.clearScreens();
  }

  editName(nameEl) {
    const input = h('input', { class: 'text-in', maxlength: 12, value: settings.get('name') });
    const m = this.ui.modal(h('div', { class: 'form' },
      h('label', {}, '你的名号（对手可见）'),
      input,
      h('div', { class: 'btn-row' }, h('button', {
        class: 'btn primary',
        onclick: () => {
          const v = input.value.trim().slice(0, 12);
          if (v) {
            settings.set('name', v);
            nameEl.textContent = v;
          }
          m.close();
        },
      }, '确定'))), { title: '更 名' });
    setTimeout(() => input.focus(), 100);
  }

  aiSetup() {
    let level = settings.get('aiLevel') || 'medium';
    let side = 'red';
    const cards = h('div', { class: 'choices' });
    const desc = { easy: '初学者友好，偶有失误', medium: '攻守兼备，需要思考', hard: '深谋远虑，步步杀机' };
    const render = () => cards.querySelectorAll('.choice').forEach((c) => c.classList.toggle('on', c.dataset.v === level));
    for (const [k, v] of Object.entries(AI_LEVELS)) {
      cards.appendChild(h('div', {
        class: 'choice',
        'data-v': k,
        onclick: () => {
          level = k;
          render();
        },
      }, h('b', {}, v.label), h('small', {}, desc[k])));
    }
    render();
    const m = this.ui.modal(h('div', { class: 'form' },
      h('label', {}, '军师难度'), cards,
      h('label', {}, '执子'),
      seg([['red', '执红 · 先手'], ['black', '执黑 · 后手'], ['random', '随机']], side, (v) => (side = v)),
      h('div', { class: 'btn-row' }, h('button', {
        class: 'btn primary wide',
        onclick: () => {
          settings.set('aiLevel', level);
          m.close();
          const color = side === 'random' ? (Math.random() < 0.5 ? 0 : 1) : side === 'red' ? 0 : 1;
          this.app.startAI(level, color);
        },
      }, '开 战'))), { title: '人 机 对 战' });
  }

  online() {
    const m = this.ui.modal(h('div', { class: 'form online-home' },
      h('div', { class: 'online-opts' },
        h('button', { class: 'btn big primary', onclick: () => { m.close(); this.createRoom(); } }, h('b', {}, '创建房间'), h('small', {}, '生成邀请链接，发给好友')),
        h('button', { class: 'btn big', onclick: () => { m.close(); this.joinRoom(); } }, h('b', {}, '加入房间'), h('small', {}, '输入好友给的房间号'))),
      h('p', { class: 'hint' }, '好友打开你分享的链接即可直接入座，无需注册下载。')), { title: '联 机 对 战' });
  }

  createRoom() {
    let color = 'random';
    let time = 0;
    const m = this.ui.modal(h('div', { class: 'form' },
      h('label', {}, '我方执子'),
      seg([['random', '随机'], ['red', '执红'], ['black', '执黑']], color, (v) => (color = v)),
      h('label', {}, '每方用时'),
      seg([[0, '不限时'], [5, '5 分钟'], [10, '10 分钟'], [20, '20 分钟']], time, (v) => (time = v)),
      h('div', { class: 'btn-row' }, h('button', {
        class: 'btn primary wide',
        onclick: () => {
          m.close();
          this.app.createRoom({ color, minutes: time });
        },
      }, '创 建'))), { title: '创 建 房 间' });
  }

  joinRoom(prefill = '') {
    const input = h('input', { class: 'text-in code', maxlength: 6, value: prefill, placeholder: '六位房间号', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    const go = () => {
      const code = input.value.trim();
      if (code.length < 4) {
        this.ui.toast('请输入正确的房间号');
        return;
      }
      m.close();
      this.app.joinRoom(code);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
    const m = this.ui.modal(h('div', { class: 'form' },
      h('label', {}, '房间号'), input,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary wide', onclick: go }, '入 座'))), { title: '加 入 房 间' });
    setTimeout(() => input.focus(), 150);
  }

  // 等待好友加入
  waiting(code, link, onCancel) {
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const qrEl = h('div', { class: 'qr', html: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) });
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(`来和我下一盘三维象棋！房间号 ${code}，点击入座：${link}`);
        this.ui.toast('邀请已复制，发给好友吧');
      } catch {
        prompt('复制下面的邀请链接：', link);
      }
    };
    const share = async () => {
      try {
        await navigator.share({ title: '楚河汉界 · 三维象棋', text: `来和我下一盘三维象棋！房间号 ${code}`, url: link });
      } catch {}
    };
    const status = h('div', { class: 'wait-status' }, h('i', { class: 'ink-spin' }), '等待好友入座……');
    const m = this.ui.modal(h('div', { class: 'form waiting' },
      h('div', { class: 'room-code' }, [...code].map((c) => h('span', {}, c))),
      qrEl,
      h('div', { class: 'link-box' }, link),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', onclick: copy }, '复制邀请'),
        navigator.share ? h('button', { class: 'btn', onclick: share }, '分享…') : null),
      status,
      h('p', { class: 'hint' }, '好友可扫码、打开链接，或在“加入房间”输入房间号。')), {
      title: '房 间 已 开',
      onClose: (v) => {
        if (v !== 'joined') onCancel?.();
      },
    });
    return { close: (v) => m.close(v), setStatus: (t) => (status.lastChild.textContent = t) };
  }

  settings() {
    const s = settings;
    const app = this.app;
    const slider = (key) => {
      const i = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.get(key) });
      i.addEventListener('input', () => s.set(key, +i.value));
      return i;
    };
    const toggle = (key) => seg([[true, '开'], [false, '关']], s.get(key), (v) => s.set(key, v));
    this.ui.modal(h('div', { class: 'form settings' },
      h('label', {}, '战斗特效'),
      seg([['full', '完整电影'], ['lite', '精简'], ['off', '关闭']], s.get('effects'), (v) => s.set('effects', v)),
      h('label', {}, '画质'),
      seg([['auto', '自动'], ['high', '高'], ['medium', '中'], ['low', '低']], s.get('quality'), (v) => {
        s.set('quality', v);
        app.applyQuality();
      }),
      h('label', {}, '音效'), slider('sfx'),
      h('label', {}, '配乐'), slider('music'),
      h('label', {}, '人物语音（结算台词朗读）'), toggle('voice'),
      h('label', {}, '同屏对弈自动翻转视角'), toggle('autoFlip')), { title: '设 置' });
  }

  rules() {
    this.ui.modal(h('div', { class: 'rules' },
      h('h3', {}, '怎么玩'),
      h('p', {}, '点击己方棋子，再点击发光的落点即可走棋。拖动空白处可旋转视角，双指或滚轮缩放。'),
      h('h3', {}, '联机'),
      h('p', {}, '“联机对战 → 创建房间”，把邀请链接或二维码发给好友，好友打开即可入座。断线后重新打开同一链接可自动重连。'),
      h('h3', {}, '战场特效'),
      h('ul', {},
        h('li', {}, '炮 —— 青铜火炮轰击，炮弹越过炮架直取敌营'),
        h('li', {}, '车 —— 驷马战车冲锋碾压'),
        h('li', {}, '马 —— 重甲铁骑突袭斩杀'),
        h('li', {}, '兵 —— 步卒列阵行进，长矛突刺'),
        h('li', {}, '相 —— 战象践踏'),
        h('li', {}, '士 —— 弓弩手万箭齐发'),
        h('li', {}, '帅 —— 天子之剑从天而降'),
        h('li', {}, '过河 —— 乘舟横渡楚河汉界')),
      h('h3', {}, '规则要点'),
      h('ul', {},
        h('li', {}, '将帅不可照面；被将死或无子可走（困毙）均判负。'),
        h('li', {}, '同一局面重复三次：一方长将判负，否则和棋。'),
        h('li', {}, '六十回合无吃子判和。')),
      h('p', { class: 'credit' }, '字体：霞鹜文楷、马善政毛笔楷书（SIL OFL）。全部模型、贴图、音效与配乐均为程序实时生成。')), { title: '玩 法', cls: 'rules-modal' });
  }
}
