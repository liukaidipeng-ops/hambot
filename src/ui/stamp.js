// 屏幕中央的书法印章特效（将军 / 绝杀 / 胜 / 败）
export function stampText(text, { color = '#c0271b', sub = '', duration = 1200, big = false } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'stamp' + (big ? ' big' : '');
    el.innerHTML = `
      <div class="stamp-ink" style="--c:${color}">
        <svg class="stamp-splash" viewBox="0 0 200 200" aria-hidden="true">${splashPath()}</svg>
        <span class="stamp-char">${text}</span>
      </div>
      ${sub ? `<div class="stamp-sub">${sub}</div>` : ''}`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => el.classList.add('out'), duration);
    setTimeout(() => {
      el.remove();
      resolve();
    }, duration + 450);
  });
}

// 随机墨迹飞溅
function splashPath() {
  let s = '';
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 38;
    const x = 100 + Math.cos(a) * r;
    const y = 100 + Math.sin(a) * r;
    const size = 2 + Math.random() * 7;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" />`;
  }
  // 笔触圆环
  s += `<path d="M 40 110 C 30 60, 90 25, 140 45 C 185 65, 180 140, 130 160 C 90 178, 45 160, 38 125" fill="none" stroke-width="14" stroke-linecap="round" opacity=".85"/>`;
  return s;
}
