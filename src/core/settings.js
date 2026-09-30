// 本地设置（localStorage 持久化）
const KEY = 'chuhan3d.settings.v1';

const NAMES = ['韩信', '张良', '萧何', '樊哙', '英布', '彭越', '陈平', '曹参', '周勃', '灌婴', '夏侯婴', '郦食其',
  '范增', '钟离昧', '龙且', '季布', '项伯', '虞子期', '桓楚', '英姬', '吕雉', '纪信', '周苛', '卢绾'];

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
}

const defaults = () => ({
  name: NAMES[Math.floor(Math.random() * NAMES.length)] + '·' + Math.floor(Math.random() * 90 + 10),
  quality: 'auto', // auto | high | medium | low
  effects: 'full', // full | lite | off
  sfx: 0.9,
  music: 0.45,
  voice: true,
  muted: false,
  autoFlip: true,
  clientId: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 20),
  aiLevel: 'medium',
  tutorialSeen: false,
});

let data;
try {
  data = { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
} catch {
  data = defaults();
}

const listeners = new Set();

export const settings = {
  get(k) {
    return data[k];
  },
  set(k, v) {
    data[k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
    for (const fn of listeners) fn(k, v);
  },
  all() {
    return { ...data };
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  resolvedQuality() {
    const q = data.quality;
    if (q !== 'auto') return q;
    return isMobile() ? 'medium' : 'high';
  },
  isMobile,
};

// 首次保存默认值（确保 clientId 稳定）
settings.set('clientId', data.clientId);
