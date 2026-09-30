// UI 管理：屏幕切换、弹窗、提示
import { HUD } from './HUD.js';
import { MainMenu } from './Menu.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.layer = h('div', { class: 'screen-layer' });
    this.modalLayer = h('div', { class: 'modal-layer' });
    this.toastLayer = h('div', { class: 'toast-layer' });
    this.root.append(this.layer, this.modalLayer, this.toastLayer);
    this.hud = new HUD(this);
    this.menu = new MainMenu(this);
    this.modals = [];
    // 通用按键音
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .choice, .seg button')) app.audio.play('click');
    });
  }

  get modalOpen() {
    return this.modals.length > 0;
  }

  showScreen(el) {
    this.layer.querySelectorAll('.screen').forEach((s) => {
      if (s !== el) {
        s.classList.remove('in');
        setTimeout(() => s.remove(), 400);
      }
    });
    if (el && !el.parentNode) {
      this.layer.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    }
  }

  clearScreens() {
    this.showScreen(null);
  }

  toast(text, ms = 1600) {
    const el = h('div', { class: 'toast' }, text);
    this.toastLayer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 350);
    }, ms);
  }

  // 弹窗：content 可为元素；返回 {el, close}
  modal(content, { title, closable = true, cls = '', onClose } = {}) {
    const box = h('div', { class: 'panel modal ' + cls }, title ? h('div', { class: 'modal-title' }, title) : null, content);
    const back = h('div', { class: 'modal-back' }, box);
    const close = (v) => {
      if (!back.parentNode) return;
      back.classList.remove('in');
      this.modals = this.modals.filter((m) => m !== handle);
      setTimeout(() => back.remove(), 300);
      onClose?.(v);
    };
    if (closable) {
      const x = h('button', { class: 'modal-x', 'aria-label': '关闭', onclick: () => close() }, '×');
      box.appendChild(x);
      back.addEventListener('pointerdown', (e) => {
        if (e.target === back) close();
      });
    }
    const handle = { el: box, close };
    this.modals.push(handle);
    this.modalLayer.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    return handle;
  }

  // 确认框：buttons = [{label, value, primary}]
  confirm(title, text, buttons = [{ label: '取消', value: false }, { label: '确定', value: true, primary: true }], opts = {}) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        m.close(v);
        resolve(v);
      };
      const row = h('div', { class: 'btn-row' }, buttons.map((b) => h('button', { class: 'btn ' + (b.primary ? 'primary' : 'ghost'), onclick: () => finish(b.value) }, b.label)));
      const body = h('div', { class: 'confirm-body' }, text ? h('p', {}, text) : null, row);
      const m = this.modal(body, {
        title,
        closable: opts.closable !== false,
        onClose: (v) => {
          if (!done) {
            done = true;
            resolve(v ?? false);
          }
        },
      });
      if (opts.timeout) setTimeout(() => finish(opts.timeoutValue ?? false), opts.timeout);
      this._lastConfirm = { finish };
    });
  }
}
