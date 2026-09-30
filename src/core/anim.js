// 基于舞台时间的补间与计时（受慢动作 timeScale 影响）
export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => --t * t * t + 1,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export class Animator {
  constructor() {
    this.items = [];
    this.time = 0;
  }

  update(dt, raw = dt) {
    this.time += dt;
    if (!this.items.length) return;
    const items = this.items;
    this.items = [];
    const keep = [];
    for (const it of items) {
      if (it.cancelled) continue;
      it.elapsed += it.real ? raw : dt;
      if (it.type === 'tween') {
        const raw = Math.min(1, it.elapsed / it.duration);
        try {
          it.onUpdate(it.ease(raw), raw);
        } catch (e) {
          console.error(e);
          it.resolve();
          continue;
        }
        if (raw >= 1) it.resolve();
        else keep.push(it);
      } else if (it.type === 'wait') {
        if (it.elapsed >= it.duration) it.resolve();
        else keep.push(it);
      } else if (it.type === 'loop') {
        const r = it.fn(dt, it.elapsed);
        if (r === false) it.resolve();
        else keep.push(it);
      }
    }
    // 回调中新增的条目追加在后
    this.items = keep.concat(this.items);
  }

  tween(duration, onUpdate, ease = Ease.inOutCubic, real = false) {
    return new Promise((resolve) => {
      if (duration <= 0) {
        onUpdate(1, 1);
        resolve();
        return;
      }
      this.items.push({ type: 'tween', duration, onUpdate, ease, elapsed: 0, resolve, real });
    });
  }

  wait(duration) {
    return new Promise((resolve) => {
      this.items.push({ type: 'wait', duration, elapsed: 0, resolve });
    });
  }

  // 不受慢动作影响的等待
  waitReal(duration) {
    return new Promise((resolve) => {
      this.items.push({ type: 'wait', duration, elapsed: 0, resolve, real: true });
    });
  }

  // fn(dt, elapsed) 返回 false 结束
  loop(fn) {
    let handle;
    const p = new Promise((resolve) => {
      handle = { type: 'loop', fn, elapsed: 0, resolve };
      this.items.push(handle);
    });
    p.cancel = () => {
      handle.cancelled = true;
      handle.resolve();
    };
    return p;
  }

  // 快进所有补间（用于跳过动画）
  finishAll() {
    for (let k = 0; k < 50 && this.items.length; k++) this.update(10);
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
