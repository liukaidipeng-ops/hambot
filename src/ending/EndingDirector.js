// 结局电影：将死后，败方历史人物登场（项羽乌江 / 刘邦彭城）
import * as THREE from 'three';
import { RED, BLACK } from '../../shared/xiangqi.js';
import { buildWujiang, buildPengcheng } from './scenes.js';
import { Ease } from '../core/anim.js';
import { h } from '../ui/UI.js';

const SCRIPTS = {
  // 楚（黑方）败：项羽 · 乌江
  [BLACK]: {
    year: '公元前二〇二年',
    place: '乌 江',
    lines: [
      { who: '旁白', text: '垓下兵败，四面楚歌。项王溃围南出，至乌江。', voice: { rate: 0.9, pitch: 0.9 } },
      { who: '乌江亭长', text: '江东虽小，地方千里，众数十万人，亦足王也。愿大王急渡。', voice: { rate: 0.95, pitch: 1.1 } },
      { who: '西楚霸王 · 项羽', text: '天之亡我，我何渡为！', voice: { rate: 0.75, pitch: 0.55 }, shot: 'close' },
      { who: '西楚霸王 · 项羽', text: '且籍与江东子弟八千人渡江而西，今无一人还。', voice: { rate: 0.8, pitch: 0.55 }, shot: 'close2' },
      { who: '西楚霸王 · 项羽', text: '纵江东父兄怜而王我，我何面目见之？', voice: { rate: 0.78, pitch: 0.5 }, shot: 'raise' },
    ],
    poem: ['力拔山兮气盖世', '时不利兮骓不逝', '骓不逝兮可奈何', '虞兮虞兮奈若何'],
    poemTitle: '《垓下歌》',
    epilogue: '胜败兵家事不期，包羞忍耻是男儿。\n江东子弟多才俊，卷土重来未可知。',
    epilogueBy: '—— 杜牧《题乌江亭》',
  },
  // 汉（红方）败：刘邦 · 彭城
  [RED]: {
    year: '公元前二〇五年',
    place: '彭 城',
    lines: [
      { who: '旁白', text: '项王以精兵三万，大破汉军五十六万于彭城，睢水为之不流。', voice: { rate: 0.92, pitch: 0.9 } },
      { who: '旁白', text: '大风从西北而起，折木发屋，扬沙石，窈冥昼晦。汉王乃得与数十骑遁去。', voice: { rate: 0.95, pitch: 0.9 }, wind: true },
      { who: '汉王 · 刘邦', text: '吾欲捐关以东等弃之，谁可与共功者？', voice: { rate: 0.85, pitch: 0.75 }, shot: 'close' },
      { who: '汉王 · 刘邦', text: '吾宁斗智，不能斗力！', voice: { rate: 0.8, pitch: 0.7 }, shot: 'close2' },
    ],
    poem: null,
    epilogue: '汉王收散卒，复振于荥阳。\n胜败乃兵家常事，大丈夫当卷土重来。',
    epilogueBy: '',
  },
};

export class EndingDirector {
  constructor(app) {
    this.app = app;
    this.active = null;
  }

  stop() {
    if (this.active) this.active.abort = true;
  }

  async play({ loser }) {
    const app = this.app;
    ANIM = app.anim;
    const stage = app.stage;
    const script = SCRIPTS[loser];
    const run = { abort: false };
    this.active = run;
    const aborted = () => run.abort;

    // ---- 转场：黑场 ----
    const ov = h('div', { class: 'cine' });
    const bars = h('div', { class: 'cine-bars' });
    const fade = h('div', { class: 'cine-fade on' });
    const title = h('div', { class: 'cine-title' }, h('div', { class: 'yr' }, script.year), h('div', { class: 'pl' }, script.place));
    const who = h('div', { class: 'cine-who' });
    const line = h('div', { class: 'cine-line' });
    const sub = h('div', { class: 'cine-sub' }, who, line);
    const skip = h('button', { class: 'cine-skip', onclick: () => (run.abort = true) }, '跳过 ›');
    const poem = h('div', { class: 'poem' });
    ov.append(bars, title, sub, poem, fade, skip);
    fade.style.transition = 'opacity .9s ease';
    fade.classList.remove('on');
    fade.style.opacity = '0';
    document.body.appendChild(ov);
    await sleep(20);
    fade.style.opacity = '1';
    await sleep(900);

    // ---- 构建场景 ----
    const built = loser === BLACK ? buildWujiang(stage) : buildPengcheng(stage);
    const cam = new THREE.PerspectiveCamera(38, stage.width / stage.height, 0.1, 600);
    const onResize = () => {
      cam.aspect = stage.width / stage.height;
      cam.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    const prevExposure = stage.renderer.toneMappingExposure;
    stage.renderer.toneMappingExposure = 1.05;
    stage.setView(built.scene, cam);
    let t0 = stage.time;
    const look = new THREE.Vector3();
    const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    const stopUpdate = stage.add((dt, t) => {
      built.update(dt, t - t0);
      cam.position.copy(camState.pos);
      look.copy(camState.look);
      cam.lookAt(look);
    });
    const hero = built.hero;
    const heroPos = hero.root.position.clone();
    const xy = loser === BLACK;
    // 镜头关键帧
    const shots = xy
      ? {
          wide: { pos: new THREE.Vector3(3.5, 2.4, 9), look: new THREE.Vector3(-0.5, 1.2, -4) },
          mid: { pos: new THREE.Vector3(2.2, 1.7, 4.2), look: new THREE.Vector3(-0.2, 1.5, -1.5) },
          close: { pos: new THREE.Vector3(0.8, 1.8, 1.3), look: heroPos.clone().add(new THREE.Vector3(0, 1.62, 0)) },
          close2: { pos: new THREE.Vector3(-0.6, 1.72, 0.7), look: heroPos.clone().add(new THREE.Vector3(0, 1.68, 0)) },
          raise: { pos: new THREE.Vector3(0.6, 0.55, 2.6), look: heroPos.clone().add(new THREE.Vector3(0, 1.8, -0.5)) },
          end: { pos: new THREE.Vector3(-2.5, 1.2, 6), look: new THREE.Vector3(0, 1.6, -6) },
        }
      : {
          wide: { pos: new THREE.Vector3(-4, 2.2, 8), look: new THREE.Vector3(0, 1.5, -10) },
          mid: { pos: new THREE.Vector3(-1.6, 1.3, 3.8), look: new THREE.Vector3(0, 0.8, 0) },
          close: { pos: new THREE.Vector3(0.9, 1.25, 1.9), look: heroPos.clone().add(new THREE.Vector3(0, 1.05, 0)) },
          close2: { pos: new THREE.Vector3(-0.7, 1.1, 1.6), look: heroPos.clone().add(new THREE.Vector3(0, 1.1, 0)) },
          raise: { pos: new THREE.Vector3(0.5, 0.7, 2.4), look: heroPos.clone().add(new THREE.Vector3(0, 1.3, 0)) },
          end: { pos: new THREE.Vector3(3, 2.5, 7), look: new THREE.Vector3(0, 1, -8) },
        };
    camState.pos.copy(shots.wide.pos).add(new THREE.Vector3(0, 0.6, 3));
    camState.look.copy(shots.wide.look);
    const moveCam = (shot, dur, ease = Ease.inOutSine) => {
      const p0 = camState.pos.clone();
      const l0 = camState.look.clone();
      return app.anim.tween(dur, (t) => {
        camState.pos.lerpVectors(p0, shot.pos, t);
        camState.look.lerpVectors(l0, shot.look, t);
      }, ease);
    };

    app.audio.setMood('sad');
    app.audio.ambience('wind');
    ov.classList.add('bars');
    await sleep(200);
    fade.style.transition = 'opacity 2.2s ease';
    fade.style.opacity = '0';
    moveCam(shots.wide, 5, Ease.outSine);
    title.classList.add('in');
    app.audio.play('gong', { vol: 0.5, base: 90, dur: 5 });
    await waitOr(3000, aborted);
    title.classList.remove('in');

    // ---- 台词 ----
    for (const [i, L] of script.lines.entries()) {
      if (aborted()) break;
      const shot = shots[L.shot] || (i === 0 ? shots.wide : shots.mid);
      moveCam(shot, L.shot ? 2.2 : 4.5);
      if (L.wind && built.sand) {
        app.audio.play('whoosh', { dur: 3, from: 200, to: 900, vol: 0.4 });
        app.anim.tween(2, (t) => (built.sand.material.uniforms.uOpacity.value = 0.45 + t * 0.45), Ease.inOutSine);
      }
      if (L.shot === 'close' && xy) {
        // 回身面对追兵
        const r0 = hero.root.rotation.y;
        app.anim.tween(2.4, (t) => (hero.root.rotation.y = r0 + (0.25 - r0) * t), Ease.inOutCubic);
      }
      if (!xy && L.shot === 'close') app.anim.tween(1.5, (t) => {
        hero.head.rotation.x = 0.35 * (1 - t) - 0.15 * t;
        hero.chest.rotation.x = 0.25 * (1 - t) + 0.05 * t;
      }, Ease.inOutSine);
      if (L.shot === 'raise' && xy) {
        app.anim.tween(2.2, (t) => hero.raiseSword(t), Ease.inOutCubic);
        app.anim.tween(1.6, (t) => (hero.head.rotation.x = -0.25 * t), Ease.inOutSine);
      }
      await this.showLine(L, who, line, run);
    }
    who.classList.remove('on');
    line.innerHTML = '';

    // ---- 诗 ----
    if (script.poem && !aborted()) {
      moveCam(shots.end, 7, Ease.inOutSine);
      poem.innerHTML = '';
      const spans = script.poem.map((p) => h('span', {}, p));
      poem.append(...spans, h('span', { class: 'by', style: { fontSize: '0.6em', opacity: 0.75 } }, script.poemTitle));
      for (const s of poem.children) {
        if (aborted()) break;
        s.classList.add('on');
        await waitOr(1100, aborted);
      }
      if (!aborted()) {
        app.audio.speak(script.poem.join('，'), { rate: 0.7, pitch: 0.5 });
        await waitOr(3200, aborted);
      }
    } else if (!aborted()) {
      moveCam(shots.end, 5, Ease.inOutSine);
      await waitOr(1500, aborted);
    }

    // ---- 收尾 ----
    app.audio.stopSpeech();
    fade.style.transition = 'opacity 1.4s ease';
    fade.style.opacity = '1';
    poem.style.transition = 'opacity 1s';
    poem.style.opacity = '0';
    await sleep(1400);
    if (!aborted()) {
      const ep = h('div', { class: 'cine-title in', style: { top: '38vh' } },
        ...script.epilogue.split('\n').map((l) => h('div', { class: 'cine-line', style: { opacity: 1 } }, l)),
        script.epilogueBy ? h('div', { class: 'yr', style: { marginTop: '12px' } }, script.epilogueBy) : null);
      ov.appendChild(ep);
      await waitOr(3600, aborted);
      ep.style.transition = 'opacity 1s';
      ep.style.opacity = '0';
      await sleep(900);
    }
    // 回到棋盘
    stopUpdate();
    window.removeEventListener('resize', onResize);
    stage.setView(stage.scene, stage.camera);
    stage.renderer.toneMappingExposure = prevExposure;
    app.audio.ambience('river');
    disposeScene(built.scene);
    ov.classList.remove('bars');
    fade.style.transition = 'opacity 1.2s ease';
    fade.style.opacity = '0';
    skip.remove();
    await sleep(1200);
    ov.remove();
    this.active = null;
    t0 = 0;
  }

  async showLine(L, who, line, run) {
    who.textContent = L.who;
    who.classList.add('on');
    line.innerHTML = '';
    const chars = [...L.text].map((c) => h('span', { class: 'ch' }, c));
    line.append(...chars);
    let spoken = false;
    let speechDone = false;
    spoken = this.app.audio.speak(L.text, { ...L.voice, onEnd: () => (speechDone = true) });
    const per = 90;
    for (const c of chars) {
      if (run.abort) break;
      c.classList.add('on');
      await sleep(per);
    }
    const minHold = 1400 + L.text.length * 40;
    let el = 0;
    while (!run.abort) {
      if (el > minHold && (!spoken || speechDone || el > minHold + 6000)) break;
      await sleep(100);
      el += 100;
    }
    this.app.audio.stopSpeech();
  }
}

// 以引擎时间计时（不受慢动作影响；标签页隐藏时自动暂停）
let ANIM = null;
function sleep(ms) {
  return ANIM ? ANIM.waitReal(ms / 1000) : new Promise((r) => setTimeout(r, ms));
}

async function waitOr(ms, cond) {
  let el = 0;
  while (el < ms) {
    if (cond()) return;
    await sleep(80);
    el += 80;
  }
}

function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose?.();
    }
  });
}
