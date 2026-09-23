# -*- coding: utf-8 -*-
"""
视频底图生成（Pillow 版，无第三方下载依赖）
用法:
  python scene.py --preset xiaoxuan --out base.png --aspect 9:16
  python scene.py --image photo.jpg --out base.png --aspect 16:9
输出: 与 ffmpeg 对接的 RGBA/BMP PNG 底图（数字人 + 渐变背景 + 光斑装饰）
"""
import argparse
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

# ---------- 数字人预设（与前端 SVG 形象一致） ----------
PRESETS = {
    'xiaoxuan': dict(gender='f', skin=(246, 215, 195), hair=(74, 52, 42), hair_style='long',
                     top=(243, 239, 233), inner=(255, 255, 255), lapel=(226, 220, 210),
                     bg=((139, 124, 246), (74, 62, 160))),
    'haoran': dict(gender='m', skin=(239, 197, 165), hair=(36, 28, 22), hair_style='short',
                   top=(46, 62, 92), inner=(255, 255, 255), lapel=(30, 42, 66), tie=(79, 111, 224),
                   bg=((91, 141, 239), (40, 68, 160))),
    'siyu': dict(gender='f', skin=(248, 220, 200), hair=(92, 58, 40), hair_style='bob',
                 top=(245, 217, 200), inner=None, lapel=(226, 190, 172),
                 bg=((242, 151, 124), (190, 92, 66))),
    'kaiwen': dict(gender='m', skin=(237, 190, 156), hair=(58, 42, 30), hair_style='side',
                   top=(126, 203, 239), inner=(150, 210, 245), lapel=(96, 168, 205), strings=True,
                   bg=((79, 195, 200), (30, 118, 128))),
    'luna': dict(gender='f', skin=(246, 211, 188), hair=(32, 25, 26), hair_style='bun',
                 top=(42, 42, 51), inner=None, lapel=(58, 58, 70), earring=True,
                 bg=((232, 111, 164), (166, 42, 96))),
    'yunjie': dict(gender='m', skin=(232, 192, 154), hair=(43, 35, 32), hair_style='short',
                   top=(233, 237, 245), inner=None, lapel=(198, 206, 222), glasses=True,
                   bg=((108, 123, 232), (58, 66, 168))),
    'anqi': dict(gender='f', skin=(243, 207, 180), hair=(62, 42, 34), hair_style='curly',
                 top=(217, 181, 143), inner=(255, 247, 236), lapel=(190, 152, 112),
                 bg=((232, 164, 76), (168, 112, 30))),
    'zimo': dict(gender='m', skin=(241, 201, 165), hair=(31, 27, 24), hair_style='short',
                 top=(191, 227, 192), inner=(205, 235, 206), lapel=(150, 195, 152), strings=True,
                 bg=((93, 190, 138), (40, 124, 84))),
}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_bg(w, h, c0, c1):
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(c0, c1, (y / max(h - 1, 1)) ** 0.85))
    return img


def add_glow(img, cx, cy, r, alpha=70):
    glow = Image.new('L', img.size, 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=alpha)
    glow = glow.filter(ImageFilter.GaussianBlur(r * 0.45))
    white = Image.new('RGB', img.size, (255, 255, 255))
    img.paste(white, (0, 0), glow)
    return img


def shade(c, pct):
    return lerp(c, (0, 0, 0) if pct < 0 else (255, 255, 255), abs(pct) / 100)


class Painter:
    """在 400x400 逻辑坐标系内绘制人物，支持整体缩放/平移。"""

    def __init__(self, draw, ox, oy, s):
        self.d = draw
        self.ox, self.oy, self.s = ox, oy, s

    def _xy(self, cx, cy, rx, ry):
        s, ox, oy = self.s, self.ox, self.oy
        return [ox + (cx - rx) * s, oy + (cy - ry) * s, ox + (cx + rx) * s, oy + (cy + ry) * s]

    def ellipse(self, cx, cy, rx, ry, fill):
        self.d.ellipse(self._xy(cx, cy, rx, ry), fill=fill)

    def poly(self, pts, fill):
        s, ox, oy = self.s, self.ox, self.oy
        self.d.polygon([(ox + x * s, oy + y * s) for x, y in pts], fill=fill)

    def line(self, pts, fill, w):
        s, ox, oy = self.s, self.ox, self.oy
        self.d.line([(ox + x * s, oy + y * s) for x, y in pts], fill=fill, width=max(1, int(w * s)))

    def arc(self, cx, cy, rx, ry, a0, a1, fill, w):
        s, ox, oy = self.s, self.ox, self.oy
        self.d.arc(self._xy(cx, cy, rx, ry), a0, a1, fill=fill, width=max(1, int(w * s)))

    def round_rect(self, cx, cy, rx, ry, rad, fill):
        self.d.rounded_rectangle(self._xy(cx, cy, rx, ry), radius=rad * self.s, fill=fill)


def draw_figure(d_img, size, p, ox, oy, s):
    """绘制数字人半身像（400x400 逻辑坐标）。"""
    P = Painter(d_img, ox, oy, s)
    skin, hair = p['skin'], p['hair']
    hs = p['hair_style']

    # ---- 后层头发 ----
    if hs == 'long':
        P.ellipse(200, 205, 82, 118, shade(hair, -8))
        P.ellipse(152, 250, 26, 80, shade(hair, -8))
        P.ellipse(248, 250, 26, 80, shade(hair, -8))
    elif hs == 'bob':
        P.ellipse(200, 195, 78, 92, shade(hair, -8))
    elif hs == 'bun':
        P.ellipse(200, 66, 28, 28, shade(hair, -6))
        P.ellipse(200, 192, 76, 96, shade(hair, -8))
    elif hs == 'curly':
        for (x, y, r) in [(140, 128, 27), (158, 98, 27), (200, 86, 28), (242, 98, 27),
                          (260, 128, 27), (128, 162, 21), (272, 162, 21), (126, 200, 20), (274, 200, 20)]:
            P.ellipse(x, y, r, r, shade(hair, -6))

    # ---- 脖子与阴影 ----
    P.round_rect(200, 243, 21, 27, 17, lerp(skin, (0, 0, 0), 0.12))
    P.ellipse(200, 268, 20, 8, lerp(skin, (40, 40, 60), 0.18))

    # ---- 身体 ----
    P.poly([(112, 400), (116, 322), (166, 278), (200, 300), (234, 278), (284, 322), (288, 400)], p['top'])
    # 内搭 / 领口
    if p['inner']:
        P.poly([(200, 300), (172, 282), (170, 400), (230, 400), (228, 282)], p['inner'])
    else:
        P.poly([(200, 300), (170, 280), (166, 400), (234, 400), (230, 280)], shade(p['top'], -8))
    # 翻领
    P.poly([(166, 278), (200, 300), (180, 340), (152, 296)], shade(p['top'], -14))
    P.poly([(234, 278), (200, 300), (220, 340), (248, 296)], shade(p['top'], -14))
    # 领带
    if p.get('tie'):
        P.poly([(200, 296), (188, 296), (200, 316), (212, 296)], shade(p['tie'], -18))
        P.poly([(188, 302), (212, 302), (206, 380), (194, 380)], p['tie'])
    # 装饰线（针织/卫衣抽绳）
    if p.get('strings'):
        P.line([(188, 322), (188, 376)], shade(p['top'], -18), 6)
        P.line([(212, 322), (212, 376)], shade(p['top'], -18), 6)

    # ---- 头 ----
    P.ellipse(139, 172, 11, 16, skin)
    P.ellipse(261, 172, 11, 16, skin)
    if p.get('earring'):
        P.ellipse(139, 192, 5, 5, (242, 200, 121))
        P.ellipse(261, 192, 5, 5, (242, 200, 121))
    P.ellipse(200, 165, 62, 70, skin)

    # ---- 五官 ----
    eye = (42, 33, 25)
    P.arc(179, 145, 16, 10, 200, 340, shade(hair, -8), 6)
    P.arc(221, 145, 16, 10, 200, 340, shade(hair, -8), 6)
    P.ellipse(178, 168, 8, 10, eye)
    P.ellipse(222, 168, 8, 10, eye)
    P.ellipse(181, 164, 3, 3, (255, 255, 255))
    P.ellipse(225, 164, 3, 3, (255, 255, 255))
    P.arc(196, 176, 7, 9, 300, 80, lerp(skin, (0, 0, 0), 0.35), 4)
    P.arc(200, 196, 20, 16, 20, 160, (180, 83, 75), 6)
    blush = lerp(skin, (242, 120, 110), 0.35)
    P.ellipse(158, 190, 12, 7, blush)
    P.ellipse(242, 190, 12, 7, blush)

    if p.get('glasses'):
        P.round_rect(177, 167, 20, 14, 10, (255, 255, 255))
        P.round_rect(223, 167, 20, 14, 10, (255, 255, 255))
        P.line([(197, 166), (203, 166)], (46, 52, 64), 5)
        P.arc(177, 167, 20, 14, 0, 360, (46, 52, 64), 5)
        P.arc(223, 167, 20, 14, 0, 360, (46, 52, 64), 5)

    # ---- 前层头发 ----
    if hs == 'long':
        P.pieslice_top(200, 150, 64, 62, hair)
        P.ellipse(176, 118, 30, 22, shade(hair, 10))
    elif hs == 'bob':
        P.pieslice_top(200, 152, 65, 60, hair)
    elif hs == 'bun':
        P.arc(200, 160, 63, 66, 180, 360, hair, 26)
    elif hs == 'short':
        P.pieslice_top(200, 158, 63, 60, hair)
        P.ellipse(228, 118, 34, 18, shade(hair, 12))
    elif hs == 'side':
        P.pieslice_top(200, 156, 63, 60, hair)
        P.ellipse(238, 122, 28, 16, shade(hair, 12))
    elif hs == 'curly':
        P.pieslice_top(200, 152, 62, 56, hair)

    return size


def _pieslice_top(self, cx, cy, rx, ry, fill):
    """头顶发型：上半椭圆。"""
    bbox = self._xy(cx, cy, rx, ry)
    self.d.pieslice(bbox, 180, 360, fill=fill)


Painter.pieslice_top = _pieslice_top


def preset_scene(preset_id, out_path, aspect):
    p = PRESETS.get(preset_id, PRESETS['xiaoxuan'])
    W, H = (1920, 1080) if aspect == '16:9' else (1080, 1920)
    img = gradient_bg(W, H, p['bg'][0], shade(p['bg'][1], -8))
    img = add_glow(img, int(W * 0.82), int(H * 0.12), int(W * 0.28), 55)
    img = add_glow(img, int(W * 0.1), int(H * 0.88), int(W * 0.22), 40)
    d = ImageDraw.Draw(img)
    # 装饰圆环
    r1 = int(W * 0.045)
    d.ellipse([W * 0.16 - r1, H * 0.18 - r1, W * 0.16 + r1, H * 0.18 + r1], outline=(255, 255, 255, 46), width=4)
    # 人物
    if aspect == '16:9':
        scale = 1.85 * W / 1080
        ox, oy = W - 400 * scale - 60, (H - 400 * scale) / 2 + 20
    else:
        scale = 2.18 * W / 1080
        ox, oy = (W - 400 * scale) / 2, H * 0.115
    draw_figure(d, img.size, p, ox, oy, scale)
    img.save(out_path)
    return out_path


def photo_scene(photo, out_path, aspect):
    W, H = (1920, 1080) if aspect == '16:9' else (1080, 1920)
    img = gradient_bg(W, H, (124, 108, 240), (59, 47, 134))
    img = add_glow(img, int(W * 0.82), int(H * 0.12), int(W * 0.28), 55)
    img = add_glow(img, int(W * 0.1), int(H * 0.88), int(W * 0.22), 40)
    d = ImageDraw.Draw(img)
    size = int(W * 0.52)
    r = size // 2
    cx = int(W - W * 0.32) if aspect == '16:9' else W // 2
    cy = int(H * 0.44) if aspect == '16:9' else int(H * 0.35)
    # 外环
    for rr, wdt, alpha in [(r + 18, 7, 150), (r + 40, 3, 70)]:
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(255, 255, 255), width=wdt)
    # 圆形照片
    ph = Image.open(photo).convert('RGB')
    ph = ImageOps.exif_transpose(ph)
    ph = ImageOps.fit(ph, (size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    img.paste(ph, (cx - r, cy - r), mask)
    img.save(out_path)
    return out_path


def sub_png(text, out_path, fontsize=56, max_width=980):
    """渲染单行字幕 PNG（透明底、白字、深色描边、半透明圆角底框）。"""
    img = Image.new('RGBA', (1100, 220), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', fontsize)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = img.width // 2, img.height // 2
    d.rounded_rectangle(
        [(cx - tw // 2 - 26, cy - th // 2 - 20), (cx + tw // 2 + 26, cy + th // 2 + 20)],
        radius=18, fill=(16, 21, 46, 112))
    d.text((cx - tw // 2 - bbox[0], cy - th // 2 - bbox[1]), text, font=font,
           fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(16, 21, 46, 215))
    img.save(out_path)
    return out_path


def wm_png(text, out_path, fontsize=34):
    """渲染水印 PNG（@账号名，右上角）。"""
    img = Image.new('RGBA', (700, 90), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', fontsize)
    d.text((10, 10), text, font=font, fill=(255, 255, 255, 205))
    img.save(out_path)
    return out_path

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preset')
    ap.add_argument('--image')
    ap.add_argument('--sub')      # 字幕模式: 文本内容
    ap.add_argument('--wm')       # 水印模式: 文本内容
    ap.add_argument('--out', required=True)
    ap.add_argument('--aspect', default='9:16')
    a = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    if a.sub:
        sub_png(a.sub, a.out)
    elif a.wm:
        wm_png(a.wm, a.out)
    elif a.image:
        photo_scene(a.image, a.out, a.aspect)
    else:
        preset_scene(a.preset, a.out, a.aspect)
    print('OK', a.out)

