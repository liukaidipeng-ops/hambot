// 程序化音效与配乐（Web Audio 实时合成，无外部音频文件）
import { settings } from '../core/settings.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.music = null;
    const unlock = () => {
      this.unlock();
      if (this.ready) {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    settings.onChange((k) => {
      if (k === 'sfx' || k === 'music') this.applyVolumes();
    });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    ctx.resume();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.4);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfxVerb = ctx.createGain();
    this.sfxVerb.gain.value = 0.22;
    this.sfx.connect(this.sfxVerb);
    this.sfxVerb.connect(this.reverb);

    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.musicVerb = ctx.createGain();
    this.musicVerb.gain.value = 0.45;
    this.musicBus.connect(this.musicVerb);
    this.musicVerb.connect(this.reverb);

    this.noiseBuf = { white: this.makeNoise('white'), pink: this.makeNoise('pink'), brown: this.makeNoise('brown') };
    this.ready = true;
    this.applyVolumes();
    this.music = new Music(this);
    if (this.pendingMood) this.setMood(this.pendingMood);
    if (this.pendingAmbience) this.ambience(this.pendingAmbience);
    this.unlockSpeech();
  }

  unlockSpeech() {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch {}
  }

  applyVolumes() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(settings.get('sfx') * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.get('music') * 0.55, t, 0.2);
  }

  impulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise(type) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  // ---------- 基础构件 ----------
  noise(type = 'white', t = this.ctx.currentTime, dur = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf[type];
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.1);
    return src;
  }

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  osc(type, freq, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // 冲击包络
  perc(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  out(node, verb = 0, pan = 0) {
    let n = node;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      n.connect(p);
      n = p;
    }
    n.connect(this.sfx);
    if (verb) {
      const s = this.gain(verb);
      n.connect(s);
      s.connect(this.reverb);
    }
  }

  // ---------- 音效入口 ----------
  play(name, opts = {}) {
    if (!this.ready || settings.get('sfx') <= 0.001) return;
    const fn = this['sfx_' + name];
    if (!fn) return;
    try {
      fn.call(this, this.ctx.currentTime + (opts.delay || 0), opts);
    } catch (e) {
      console.warn('sfx', name, e);
    }
  }

  // 木子落盘：清脆的“啪”
  sfx_clack(t, { strength = 1 } = {}) {
    const s = Math.min(1.4, strength);
    const n = this.noise('white', t, 0.12);
    const bp = this.filter('bandpass', rand(1900, 2500), 1.4);
    const g = this.gain();
    n.connect(bp).connect(g);
    this.perc(g, t, 0.9 * s, 0.001, 0.05);
    this.out(g, 0.15);
    const f0 = rand(900, 1050);
    for (const [mul, amp, dec] of [[1, 0.35, 0.09], [1.63, 0.2, 0.06], [2.7, 0.1, 0.04]]) {
      const o = this.osc('sine', f0 * mul, t, dec + 0.05);
      const og = this.gain();
      o.connect(og);
      this.perc(og, t, amp * s, 0.001, dec);
      this.out(og, 0.2);
    }
    const th = this.osc('sine', 170, t, 0.15);
    th.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    const tg = this.gain();
    th.connect(tg);
    this.perc(tg, t, 0.6 * s, 0.002, 0.12);
    this.out(tg);
  }

  sfx_pick(t) {
    const o = this.osc('triangle', 1900, t, 0.06);
    o.frequency.exponentialRampToValueAtTime(1300, t + 0.05);
    const g = this.gain();
    o.connect(g);
    this.perc(g, t, 0.18, 0.001, 0.05);
    this.out(g, 0.2);
    const n = this.noise('white', t, 0.03);
    const hp = this.filter('highpass', 4000);
    const ng = this.gain();
    n.connect(hp).connect(ng);
    this.perc(ng, t, 0.12, 0.001, 0.02);
    this.out(ng);
  }

  sfx_click(t) {
    const o = this.osc('sine', 1300, t, 0.05);
    const g = this.gain();
    o.connect(g);
    this.perc(g, t, 0.12, 0.001, 0.04);
    this.out(g, 0.1);
  }

  sfx_deny(t) {
    for (const [dt, f] of [[0, 220], [0.09, 180]]) {
      const o = this.osc('triangle', f, t + dt, 0.1);
      const g = this.gain();
      o.connect(g);
      this.perc(g, t + dt, 0.2, 0.002, 0.08);
      this.out(g);
    }
  }

  sfx_whoosh(t, { dur = 0.5, from = 400, to = 2600, vol = 0.5 } = {}) {
    const n = this.noise('pink', t, dur);
    const bp = this.filter('bandpass', from, 1.2);
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(from * 0.8, t + dur);
    const g = this.gain();
    n.connect(bp).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.out(g, 0.2);
  }

  // 炮声
  sfx_boom(t, { size = 1 } = {}) {
    const sub = this.osc('sine', 120, t, 1.6);
    sub.frequency.exponentialRampToValueAtTime(32, t + 1.0);
    const sg = this.gain();
    sub.connect(sg);
    this.perc(sg, t, 1.2 * size, 0.004, 1.4);
    this.out(sg, 0.3);
    const n = this.noise('brown', t, 2.2);
    const lp = this.filter('lowpass', 1400, 0.7);
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 1.6);
    const ng = this.gain();
    n.connect(lp).connect(ng);
    this.perc(ng, t, 1.1 * size, 0.003, 2.0);
    this.out(ng, 0.6);
    const c = this.noise('white', t, 0.15);
    const hp = this.filter('highpass', 900);
    const cg = this.gain();
    c.connect(hp).connect(cg);
    this.perc(cg, t, 0.7 * size, 0.001, 0.1);
    this.out(cg, 0.4);
  }

  sfx_explosion(t, { size = 1 } = {}) {
    this.sfx_boom(t, { size: size * 0.9 });
    // 碎屑噼啪
    for (let i = 0; i < 14; i++) {
      const tt = t + 0.05 + Math.random() * 0.9;
      const n = this.noise('white', tt, 0.04);
      const bp = this.filter('bandpass', rand(1500, 4500), 2);
      const g = this.gain();
      n.connect(bp).connect(g);
      this.perc(g, tt, rand(0.05, 0.2) * size, 0.001, rand(0.02, 0.05));
      this.out(g, 0.3, rand(-0.6, 0.6));
    }
  }

  sfx_fuse(t, { dur = 0.6 } = {}) {
    const n = this.noise('white', t, dur);
    const hp = this.filter('highpass', 3500);
    const g = this.gain();
    n.connect(hp).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < dur * 30; k++) g.gain.setValueAtTime(rand(0.02, 0.12), t + k / 30);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.out(g);
  }

  // 马蹄
  sfx_gallop(t, { dur = 1.5, rate = 1, vol = 0.6, dist = 1 } = {}) {
    const pattern = [0, 0.09, 0.2, 0.26];
    const cycle = 0.42 / rate;
    for (let c = 0; c * cycle < dur; c++) {
      for (const off of pattern) {
        const tt = t + c * cycle + (off / rate) + rand(-0.008, 0.008);
        if (tt > t + dur) break;
        const n = this.noise('brown', tt, 0.08);
        const lp = this.filter('lowpass', rand(500, 800));
        const g = this.gain();
        n.connect(lp).connect(g);
        const fade = Math.min(1, (t + dur - tt) / 0.4) * dist;
        this.perc(g, tt, vol * fade * rand(0.6, 1), 0.002, 0.07);
        this.out(g, 0.15);
        const o = this.osc('sine', rand(80, 110), tt, 0.08);
        const og = this.gain();
        o.connect(og);
        this.perc(og, tt, vol * 0.5 * fade, 0.002, 0.06);
        this.out(og);
      }
    }
  }

  sfx_neigh(t, { vol = 0.25 } = {}) {
    const g = this.gain();
    const f1 = this.filter('bandpass', 1100, 3);
    const f2 = this.filter('bandpass', 2400, 4);
    const mix = this.gain(1);
    f1.connect(mix);
    f2.connect(mix);
    mix.connect(g);
    for (const det of [-6, 7]) {
      const o = this.osc('sawtooth', 520, t, 1.2);
      o.detune.value = det;
      o.frequency.setValueAtTime(480, t);
      o.frequency.linearRampToValueAtTime(980, t + 0.18);
      o.frequency.linearRampToValueAtTime(760, t + 0.7);
      o.frequency.linearRampToValueAtTime(520, t + 1.1);
      const lfo = this.osc('sine', 22, t, 1.2);
      const lg = this.gain(70);
      lfo.connect(lg).connect(o.frequency);
      o.connect(f1);
      o.connect(f2);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    this.out(g, 0.3);
  }

  // 战车隆隆
  sfx_chariot(t, { dur = 2 } = {}) {
    const n = this.noise('brown', t, dur);
    const lp = this.filter('lowpass', 260, 0.8);
    const am = this.gain(0.5);
    const lfo = this.osc('square', 11, t, dur);
    const lg = this.gain(0.35);
    lfo.connect(lg).connect(am.gain);
    const g = this.gain();
    n.connect(lp).connect(am).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.out(g, 0.2);
    for (let i = 0; i < dur * 14; i++) {
      const tt = t + i / 14 + rand(0, 0.03);
      const k = this.noise('white', tt, 0.03);
      const bp = this.filter('bandpass', rand(700, 1600), 3);
      const kg = this.gain();
      k.connect(bp).connect(kg);
      this.perc(kg, tt, rand(0.04, 0.12) * Math.sin((i / (dur * 14)) * Math.PI), 0.001, 0.03);
      this.out(kg);
    }
    this.sfx_gallop(t, { dur, rate: 1.3, vol: 0.45 });
  }

  // 刀剑挥砍
  sfx_slash(t, { vol = 0.7 } = {}) {
    const n = this.noise('white', t, 0.3);
    const bp = this.filter('bandpass', 700, 2.5);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(6500, t + 0.12);
    const g = this.gain();
    n.connect(bp).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    this.out(g, 0.25);
    this.sfx_ring(t + 0.08, { vol: vol * 0.45 });
  }

  sfx_ring(t, { vol = 0.3, base = 2200 } = {}) {
    for (const [m, a, d] of [[1, 1, 0.9], [1.51, 0.6, 0.7], [2.32, 0.4, 0.5], [3.1, 0.25, 0.35]]) {
      const o = this.osc('sine', base * m, t, d + 0.1);
      const g = this.gain();
      o.connect(g);
      this.perc(g, t, vol * a * 0.4, 0.001, d);
      this.out(g, 0.4);
    }
  }

  sfx_clang(t, { vol = 0.6 } = {}) {
    this.sfx_ring(t, { vol, base: 820 });
    const n = this.noise('white', t, 0.06);
    const g = this.gain();
    n.connect(this.filter('highpass', 2000)).connect(g);
    this.perc(g, t, vol * 0.6, 0.001, 0.05);
    this.out(g, 0.3);
  }

  sfx_thud(t, { vol = 1 } = {}) {
    const o = this.osc('sine', 90, t, 0.5);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = this.gain();
    o.connect(g);
    this.perc(g, t, vol, 0.003, 0.4);
    this.out(g, 0.3);
    const n = this.noise('brown', t, 0.4);
    const ng = this.gain();
    n.connect(this.filter('lowpass', 500)).connect(ng);
    this.perc(ng, t, vol * 0.8, 0.002, 0.3);
    this.out(ng, 0.3);
  }

  sfx_capture(t) {
    this.sfx_thud(t, { vol: 0.7 });
    this.sfx_clack(t, { strength: 1.3 });
    this.sfx_explosion(t, { size: 0.25 });
  }

  // 战鼓
  sfx_drum(t, { vol = 0.9, pitch = 1 } = {}) {
    const o = this.osc('sine', 95 * pitch, t, 1.0);
    o.frequency.exponentialRampToValueAtTime(52 * pitch, t + 0.35);
    const g = this.gain();
    o.connect(g);
    this.perc(g, t, vol, 0.003, 0.9);
    this.out(g, 0.5);
    const n = this.noise('pink', t, 0.2);
    const ng = this.gain();
    n.connect(this.filter('lowpass', 1100)).connect(ng);
    this.perc(ng, t, vol * 0.5, 0.001, 0.12);
    this.out(ng, 0.5);
  }

  sfx_drumroll(t, { dur = 1.2, vol = 0.7 } = {}) {
    let tt = t;
    let gap = 0.16;
    while (tt < t + dur) {
      this.sfx_drum(tt, { vol: vol * rand(0.6, 1), pitch: rand(0.95, 1.08) });
      tt += gap;
      gap = Math.max(0.07, gap * 0.9);
    }
    this.sfx_drum(tt, { vol: vol * 1.3, pitch: 0.9 });
  }

  // 铜锣
  sfx_gong(t, { vol = 0.6, base = 140, dur = 4 } = {}) {
    const partials = [1, 1.48, 1.98, 2.52, 2.9, 3.6, 4.4, 5.3];
    partials.forEach((m, i) => {
      const o = this.osc('sine', base * m, t, dur);
      o.frequency.setValueAtTime(base * m * 0.985, t);
      o.frequency.linearRampToValueAtTime(base * m, t + 0.6);
      const g = this.gain();
      o.connect(g);
      const a = vol * (0.5 / (1 + i * 0.35));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + 0.02 + i * 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - i * 0.07));
      this.out(g, 0.6, i % 2 ? 0.2 : -0.2);
    });
    const n = this.noise('white', t, 1.2);
    const ng = this.gain();
    n.connect(this.filter('bandpass', 3500, 0.8)).connect(ng);
    this.perc(ng, t, vol * 0.15, 0.005, 1.0);
    this.out(ng, 0.5);
  }

  sfx_check(t) {
    this.sfx_drum(t, { vol: 1 });
    this.sfx_drum(t + 0.16, { vol: 1.1, pitch: 0.92 });
    this.sfx_gong(t + 0.3, { vol: 0.5, base: 190, dur: 2.5 });
  }

  sfx_mate(t) {
    this.sfx_drumroll(t, { dur: 0.9, vol: 0.8 });
    this.sfx_gong(t + 1.0, { vol: 0.9, base: 110, dur: 6 });
  }

  // 号角
  sfx_horn(t, { dur = 1.4, vol = 0.35, base = 110 } = {}) {
    const g = this.gain();
    const lp = this.filter('lowpass', 900, 1);
    lp.connect(g);
    for (const det of [-5, 5, 0]) {
      const o = this.osc('sawtooth', base, t, dur);
      o.detune.value = det;
      o.frequency.setValueAtTime(base * 0.94, t);
      o.frequency.linearRampToValueAtTime(base, t + 0.2);
      o.frequency.setValueAtTime(base, t + dur * 0.55);
      o.frequency.linearRampToValueAtTime(base * 1.335, t + dur * 0.62);
      const lfo = this.osc('sine', 5.5, t, dur);
      const lg = this.gain(2.5);
      lfo.connect(lg).connect(o.frequency);
      o.connect(lp);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
    g.gain.setValueAtTime(vol, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.out(g, 0.6);
  }

  // 弓弦 + 箭雨
  sfx_arrows(t, { count = 16, spread = 0.7 } = {}) {
    const tw = this.osc('triangle', 180, t, 0.2);
    tw.frequency.exponentialRampToValueAtTime(120, t + 0.15);
    const tg = this.gain();
    tw.connect(tg);
    this.perc(tg, t, 0.5, 0.001, 0.15);
    this.out(tg, 0.3);
    for (let i = 0; i < count; i++) {
      const tt = t + 0.05 + Math.random() * spread;
      const n = this.noise('white', tt, 0.35);
      const bp = this.filter('bandpass', 5000, 6);
      bp.frequency.setValueAtTime(rand(5000, 7000), tt);
      bp.frequency.exponentialRampToValueAtTime(rand(1800, 2600), tt + 0.3);
      const g = this.gain();
      n.connect(bp).connect(g);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.12, tt + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.32);
      this.out(g, 0.2, rand(-0.7, 0.7));
    }
  }

  sfx_thunks(t, { count = 10, spread = 0.4 } = {}) {
    for (let i = 0; i < count; i++) {
      const tt = t + Math.random() * spread;
      const o = this.osc('sine', rand(260, 380), tt, 0.08);
      const g = this.gain();
      o.connect(g);
      this.perc(g, tt, 0.25, 0.001, 0.06);
      this.out(g, 0.1, rand(-0.5, 0.5));
      const n = this.noise('white', tt, 0.03);
      const ng = this.gain();
      n.connect(this.filter('bandpass', 1500, 2)).connect(ng);
      this.perc(ng, tt, 0.15, 0.001, 0.025);
      this.out(ng);
    }
  }

  // 战象长鸣
  sfx_trumpet(t, { vol = 0.4 } = {}) {
    const ws = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    ws.curve = curve;
    const bp = this.filter('bandpass', 1000, 1.5);
    const g = this.gain();
    ws.connect(bp).connect(g);
    const o = this.osc('sawtooth', 300, t, 1.6);
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(560, t + 0.25);
    o.frequency.linearRampToValueAtTime(500, t + 1.0);
    o.frequency.exponentialRampToValueAtTime(380, t + 1.5);
    const lfo = this.osc('sine', 9, t, 1.6);
    const lg = this.gain(18);
    lfo.connect(lg).connect(o.frequency);
    o.connect(ws);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    g.gain.setValueAtTime(vol * 0.9, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
    this.out(g, 0.5);
  }

  // 行军脚步 + 甲片
  sfx_march(t, { dur = 1.6, bpm = 132 } = {}) {
    const step = 60 / bpm;
    for (let i = 0; i * step < dur; i++) {
      const tt = t + i * step;
      const n = this.noise('brown', tt, 0.1);
      const g = this.gain();
      n.connect(this.filter('lowpass', 420)).connect(g);
      this.perc(g, tt, i % 2 ? 0.55 : 0.75, 0.003, 0.09);
      this.out(g, 0.2);
      const j = this.noise('white', tt + 0.02, 0.06);
      const jg = this.gain();
      j.connect(this.filter('highpass', 6000)).connect(jg);
      this.perc(jg, tt + 0.02, 0.06, 0.001, 0.05);
      this.out(jg);
    }
    this.sfx_drum(t, { vol: 0.5 });
    this.sfx_drum(t + step * 2, { vol: 0.4 });
  }

  sfx_splash(t, { vol = 0.5 } = {}) {
    const n = this.noise('white', t, 0.6);
    const lp = this.filter('lowpass', 2500);
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = this.gain();
    n.connect(lp).connect(g);
    this.perc(g, t, vol, 0.01, 0.5);
    this.out(g, 0.3);
  }

  sfx_oar(t, { vol = 0.25 } = {}) {
    const n = this.noise('pink', t, 0.5);
    const bp = this.filter('bandpass', 800, 1);
    const g = this.gain();
    n.connect(bp).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    this.out(g, 0.3);
  }

  // 召唤（金光）
  sfx_summon(t, { vol = 0.18 } = {}) {
    const notes = [587.3, 659.3, 880, 987.8, 1174.7, 1318.5];
    notes.forEach((f, i) => {
      const tt = t + i * 0.05;
      const o = this.osc('sine', f, tt, 1.2);
      const g = this.gain();
      o.connect(g);
      this.perc(g, tt, vol, 0.005, 1.0);
      this.out(g, 0.8);
    });
    this.sfx_whoosh(t, { dur: 0.7, from: 300, to: 3500, vol: 0.25 });
  }

  sfx_victory(t) {
    this.sfx_drumroll(t, { dur: 0.6, vol: 0.6 });
    this.sfx_gong(t + 0.8, { vol: 0.6, base: 180, dur: 4 });
  }

  // ---------- 环境声 ----------
  ambience(kind) {
    if (!this.ready) {
      this.pendingAmbience = kind;
      return;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.amb) {
      const old = this.amb;
      old.g.gain.setTargetAtTime(0.0001, t, 0.5);
      setTimeout(() => old.nodes.forEach((n) => n.stop?.()), 2500);
      this.amb = null;
    }
    if (!kind) return;
    const g = this.gain(0.0001);
    g.connect(this.sfx);
    const nodes = [];
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf.pink;
    src.loop = true;
    const bp = this.filter('bandpass', kind === 'wind' ? 380 : 800, kind === 'wind' ? 0.6 : 0.9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = kind === 'wind' ? 0.12 : 0.25;
    const lg = this.gain(kind === 'wind' ? 220 : 300);
    lfo.connect(lg).connect(bp.frequency);
    src.connect(bp).connect(g);
    src.start();
    lfo.start();
    nodes.push(src, lfo);
    if (kind === 'river') {
      const fall = this.ctx.createBufferSource();
      fall.buffer = this.noiseBuf.brown;
      fall.loop = true;
      const fg = this.gain(0.5);
      fall.connect(this.filter('lowpass', 600)).connect(fg).connect(g);
      fall.start();
      nodes.push(fall);
    }
    g.gain.setTargetAtTime(kind === 'wind' ? 0.16 : 0.07, t, 1.2);
    this.amb = { g, nodes };
  }

  setMood(mood) {
    if (!this.ready) {
      this.pendingMood = mood;
      return;
    }
    this.music.setMood(mood);
  }

  // ---------- 语音 ----------
  speak(text, { rate = 0.82, pitch = 0.7, onEnd } = {}) {
    if (!settings.get('voice') || !window.speechSynthesis) {
      onEnd?.();
      return false;
    }
    try {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const zh = voices.filter((v) => /zh[-_]CN|cmn|Chinese|普通话|中文/i.test(v.lang + v.name));
      const male = zh.find((v) => /male|男|Yunxi|Yunyang|Kangkang|Yunjian/i.test(v.name) && !/female/i.test(v.name));
      u.voice = male || zh[0] || null;
      u.lang = 'zh-CN';
      u.rate = rate;
      u.pitch = pitch;
      u.volume = Math.min(1, settings.get('sfx') + 0.2);
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
      synth.speak(u);
      return true;
    } catch {
      onEnd?.();
      return false;
    }
  }

  stopSpeech() {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }
}

// ================= 生成式古筝配乐 =================
const SCALES = {
  // 宫调式 D 宫
  gong: [0, 2, 4, 7, 9],
  // 羽调式（更悲凉）
  yu: [0, 3, 5, 7, 10],
};

class Music {
  constructor(engine) {
    this.e = engine;
    this.ctx = engine.ctx;
    this.mood = null;
    this.buffers = new Map();
    this.timer = null;
    this.step = 0;
  }

  // Karplus-Strong 拨弦
  pluckBuffer(freq) {
    const key = Math.round(freq * 10);
    if (this.buffers.has(key)) return this.buffers.get(key);
    const sr = this.ctx.sampleRate;
    const dur = 3.2;
    const len = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      lp = lp * 0.55 + w * 0.45; // 拨弦位置造成的柔化
      line[i] = lp;
    }
    let idx = 0;
    let prev = 0;
    const decay = 0.9985 - Math.min(0.004, freq / 400000);
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const next = 0.5 * (cur + prev) * decay;
      prev = cur;
      line[idx] = next;
      d[i] = cur;
      idx = (idx + 1) % N;
    }
    // 起音更亮
    for (let i = 0; i < Math.min(len, 400); i++) d[i] *= 1 + (1 - i / 400) * 0.6;
    this.buffers.set(key, buf);
    return buf;
  }

  note(freq, t, { vol = 0.3, pan = 0, slide = 0, vibrato = 0, dur = 2.8 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(freq);
    if (slide) {
      src.playbackRate.setValueAtTime(Math.pow(2, slide / 12), t);
      src.playbackRate.exponentialRampToValueAtTime(1, t + 0.09);
    }
    if (vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(vibrato * 0.012, t + 0.5);
      lfo.connect(lg).connect(src.playbackRate);
      lfo.start(t);
      lfo.stop(t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0.0001, t + dur - 0.6, 0.25);
    let node = src.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(this.e.musicBus);
    src.start(t);
    src.stop(t + dur);
  }

  // 箫声（悲情段落）
  flute(freq, t, dur, vol = 0.1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.8;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
    lfo.connect(lg).connect(o.frequency);
    const n = ctx.createBufferSource();
    n.buffer = this.e.noiseBuf.white;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * 2;
    bp.Q.value = 8;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.35);
    g.gain.setValueAtTime(vol * 0.9, t + dur - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o2.connect(g2).connect(g);
    n.connect(bp).connect(ng).connect(g);
    g.connect(this.e.musicBus);
    for (const s of [o, o2, lfo, n]) {
      s.start(t);
      s.stop(t + dur + 0.1);
    }
  }

  freqOf(deg, scale, root = 146.83) {
    const n = scale.length;
    const oct = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    return root * Math.pow(2, (scale[idx] + 12 * oct) / 12);
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!mood) return;
    const cfg = {
      calm: { bpm: 66, scale: SCALES.gong, density: 0.55, gliss: 0.12, drums: 0, flute: 0 },
      battle: { bpm: 84, scale: SCALES.gong, density: 0.5, gliss: 0.1, drums: 0.35, flute: 0 },
      sad: { bpm: 52, scale: SCALES.yu, density: 0.35, gliss: 0.04, drums: 0, flute: 0.5, root: 138.59 },
      triumph: { bpm: 92, scale: SCALES.gong, density: 0.7, gliss: 0.25, drums: 0.6, flute: 0 },
    }[mood];
    this.cfg = cfg;
    this.deg = 5;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.3;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  schedule() {
    const cfg = this.cfg;
    if (!cfg) return;
    const ctx = this.ctx;
    const spb = 60 / cfg.bpm / 2; // 八分音符
    const root = cfg.root || 146.83;
    while (this.nextTime < ctx.currentTime + 0.5) {
      const t = this.nextTime;
      const s = this.step;
      const bar = Math.floor(s / 8);
      const beat = s % 8;
      // 低音
      if (beat === 0) {
        const bassDeg = [0, 0, 3, 4][bar % 4];
        this.note(this.freqOf(bassDeg - 5, cfg.scale, root), t, { vol: 0.28, pan: -0.2, dur: 3 });
        if (cfg.drums && Math.random() < cfg.drums) this.e.sfx_drum(t, { vol: 0.35, pitch: 0.9 });
      }
      if (cfg.drums && beat === 4 && Math.random() < cfg.drums * 0.6) this.e.sfx_drum(t, { vol: 0.22 });
      // 刮奏
      if (beat === 6 && bar % 4 === 3 && Math.random() < cfg.gliss * 3) {
        for (let k = 0; k < 9; k++) this.note(this.freqOf(3 + k, cfg.scale, root), t + k * 0.035, { vol: 0.1 + k * 0.012, pan: -0.4 + k * 0.1, dur: 2 });
      } else if (Math.random() < cfg.density * (beat % 2 === 0 ? 1.2 : 0.6)) {
        // 旋律随机游走
        const r = Math.random();
        let step = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.94 ? -2 : 0;
        if (this.deg > 11) step = -Math.abs(step) - 1;
        if (this.deg < 3) step = Math.abs(step) + 1;
        this.deg += step;
        const long = beat === 0 || beat === 4;
        const f = this.freqOf(this.deg, cfg.scale, root);
        this.note(f, t, {
          vol: long ? 0.3 : 0.22,
          pan: rand(-0.3, 0.35),
          slide: Math.random() < 0.18 ? -2 : 0,
          vibrato: long && Math.random() < 0.6 ? 1 : 0,
        });
        if (Math.random() < 0.15) this.note(f * 2, t + 0.02, { vol: 0.08, pan: 0.3 });
      }
      if (cfg.flute && beat === 0 && bar % 2 === 0 && Math.random() < cfg.flute) {
        const fd = this.freqOf(5 + [0, 2, 1, 3, 4][Math.floor(Math.random() * 5)], cfg.scale, root);
        this.flute(fd, t + spb, spb * 6, 0.07);
      }
      this.nextTime += spb * (beat % 2 === 0 ? 1.04 : 0.96); // 轻微摇摆
      this.step++;
    }
  }
}
