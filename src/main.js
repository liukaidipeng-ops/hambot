import './ui/style.css';
import { App } from './App.js';

const app = new App();
app.boot().catch((e) => {
  console.error(e);
  const tip = document.querySelector('.ld-tip');
  const noGL = /WebGL|context/i.test(String(e?.message || e));
  if (tip) {
    tip.textContent = noGL
      ? '当前浏览器无法启用 3D（WebGL）。请使用最新版 Chrome、Edge、Safari 或微信内置浏览器打开，并开启硬件加速。'
      : '加载失败：' + (e?.message || e) + '（请刷新重试）';
    tip.style.opacity = '1';
    tip.style.maxWidth = '86vw';
    tip.style.textAlign = 'center';
    tip.style.lineHeight = '1.7';
  }
});
window.__app = app;
window.__showcase = (team = 0) => import('./fx/debug.js').then((m) => m.showcase(app, team));
