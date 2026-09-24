# -*- coding: utf-8 -*-
"""检查新增文案里的字，在 Noto Serif SC 子集与 TeaHand 手写体里是否都存在"""
import io, os
from fontTools.ttLib import TTFont

BASE = r'C:\Users\Admin\Desktop\web-work\p1-lesson-03'
FONTS = {
    'noto-400': os.path.join(BASE, 'assets', 'noto-serif-sc-400.woff2'),
    'noto-600': os.path.join(BASE, 'assets', 'noto-serif-sc-600.woff2'),
    'teahand':  os.path.join(BASE, 'FuLuLingGanHeChaTi-2.ttf'),
}

TEXT = u'另有一本《拍照手札》翻开看看摄影兴趣爱好追剧音乐动物'


def cmap_set(path):
    f = TTFont(path, fontNumber=0)
    s = set()
    for t in f['cmap'].tables:
        s.update(t.cmap.keys())
    return s


for name, p in FONTS.items():
    if not os.path.exists(p):
        print('%-9s MISSING  %s' % (name, p))
        continue
    cs = cmap_set(p)
    miss = [c for c in TEXT if ord(c) not in cs]
    print('%-9s 字形 %5d  缺字: %s' % (name, len(cs), ''.join(miss) if miss else u'无'))
