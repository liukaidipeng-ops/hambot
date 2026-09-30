#!/usr/bin/env python3
"""按游戏实际用到的文字对中文字体做子集化，生成 public/fonts/*.woff2。

用法：python3 scripts/subset-fonts.py
依赖：pip install fonttools brotli
字体来源（均为 SIL OFL 开源授权）：
  - 霞鹜文楷 LXGW WenKai  https://github.com/lxgw/LxgwWenKai
  - 马善政毛笔楷书 Ma Shan Zheng  https://github.com/google/fonts/tree/main/ofl/mashanzheng
"""
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'fonts')
OUT = os.path.join(ROOT, 'public', 'fonts')

FONTS = {
    'wenkai': 'https://raw.githubusercontent.com/lxgw/LxgwWenKai/main/fonts/TTF/LXGWWenKai-Medium.ttf',
    'mashanzheng': 'https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf',
}

SCAN_DIRS = ['src', 'shared', 'server']
SCAN_FILES = ['index.html']
EXTS = ('.js', '.html', '.css', '.json')

# 额外保底字符：常用标点、数字、字母、昵称生成可能用到的字
EXTRA = (
    '，。、；：？！“”‘’（）《》【】—…·「」『』～'
    '0123456789０１２３４５６７８９'
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
    '一二三四五六七八九十百千万零'
    '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥'
)


def collect_chars():
    chars = set(EXTRA)
    paths = [os.path.join(ROOT, f) for f in SCAN_FILES]
    for d in SCAN_DIRS:
        for base, _, files in os.walk(os.path.join(ROOT, d)):
            for f in files:
                if f.endswith(EXTS):
                    paths.append(os.path.join(base, f))
    for p in paths:
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8') as fh:
            text = fh.read()
        for ch in text:
            if ord(ch) > 0x2000:
                chars.add(ch)
    return ''.join(sorted(chars))


def ensure_font(name, url):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, os.path.basename(url))
    if not os.path.exists(path):
        print('downloading', url)
        urllib.request.urlretrieve(url, path)
    return path


def main():
    try:
        from fontTools import subset
    except ImportError:
        print('请先安装：pip install fonttools brotli')
        sys.exit(1)
    chars = collect_chars()
    print('characters:', len(chars))
    os.makedirs(OUT, exist_ok=True)
    for name, url in FONTS.items():
        src = ensure_font(name, url)
        out = os.path.join(OUT, name + '.woff2')
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        font = subset.load_font(src, opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=chars)
        sub.subset(font)
        subset.save_font(font, out, opts)
        print(name, '->', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
