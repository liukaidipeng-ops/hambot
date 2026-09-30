import './ui/style.css';
import { App } from './App.js';

const app = new App();
app.boot().catch((e) => {
  console.error(e);
  const tip = document.querySelector('.ld-tip');
  if (tip) tip.textContent = '加载失败：' + (e?.message || e);
});
window.__app = app;
window.__showcase = (team = 0) => import('./fx/debug.js').then((m) => m.showcase(app, team));
