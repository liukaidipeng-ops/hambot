// 加载子集化中文字体（霞鹜文楷 / 马善政毛笔楷书）
const BASE = import.meta.env.BASE_URL || './';

export async function loadFonts(timeoutMs = 8000) {
  const faces = [
    new FontFace('WenKai', `url(${BASE}fonts/wenkai.woff2) format("woff2")`, { display: 'swap' }),
    new FontFace('MaShan', `url(${BASE}fonts/mashanzheng.woff2) format("woff2")`, { display: 'swap' }),
  ];
  const loads = faces.map((f) =>
    f.load().then((ff) => {
      document.fonts.add(ff);
      return true;
    }).catch((e) => {
      console.warn('font load failed', e);
      return false;
    }),
  );
  const timeout = new Promise((r) => setTimeout(() => r('timeout'), timeoutMs));
  await Promise.race([Promise.all(loads), timeout]);
}
