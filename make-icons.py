#!/usr/bin/env python3
"""Генерирует иконки «Дашиной Игры»: icon-180.png и icon-512.png.

Без внешних зависимостей — PNG пишется вручную через zlib.
Логотип: белая буква «Д» на цветном градиенте, который плавно перетекает
между четырьмя углами (как на игровом поле). Буква собрана из скруглённых
отрезков — шрифт не нужен — и укладывается в безопасную зону maskable
(круг радиусом 40% от центра).

Запуск: python3 make-icons.py
"""
import math
import os
import struct
import zlib

# Углы градиента: левый верх, правый верх, левый низ, правый низ
CORNERS = [(0xFF, 0xB3, 0x47), (0xFF, 0x5C, 0x8A), (0xB6, 0x6D, 0xFF), (0x5B, 0x6C, 0xFF)]
INK = (0xFF, 0xFF, 0xFF)
SHADOW = (0x14, 0x12, 0x1A)

# «Д» в долях стороны иконки: отрезки (x1, y1, x2, y2) одной толщины
STROKE = 0.078
TOP, BASE, FOOT = 0.29, 0.63, 0.73
LEFT_TOP, LEFT_BASE, RIGHT = 0.425, 0.345, 0.655
BAR_L, BAR_R = 0.27, 0.73
SEGMENTS = [
    (LEFT_TOP, TOP, RIGHT, TOP),          # верхняя перекладина
    (LEFT_TOP, TOP, LEFT_BASE, BASE),     # левая наклонная ножка
    (RIGHT, TOP, RIGHT, BASE),            # правая ножка
    (BAR_L, BASE, BAR_R, BASE),           # основание
    (BAR_L, BASE, BAR_L, FOOT),           # левый выносной элемент
    (BAR_R, BASE, BAR_R, FOOT),           # правый выносной элемент
]


def to_lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_srgb(x):
    x = min(1.0, max(0.0, x))
    return 255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)


LIN = [[to_lin(ch) for ch in c] for c in CORNERS]


def gradient(u, v):
    """Билинейная смесь углов в линейном RGB."""
    tl, tr, bl, br = LIN
    out = []
    for i in range(3):
        top = tl[i] + (tr[i] - tl[i]) * u
        bot = bl[i] + (br[i] - bl[i]) * u
        out.append(to_srgb(top + (bot - top) * v))
    return out


def seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - x1 - dx * t, py - y1 - dy * t)


def letter_sdf(px, py):
    """Расстояние до контура буквы в долях стороны: < 0 — внутри."""
    return min(seg_dist(px, py, *s) for s in SEGMENTS) - STROKE / 2


def mix(a, b, k):
    return [a[i] + (b[i] - a[i]) * k for i in range(3)]


def render(size):
    rows = []
    shadow_dy = 0.018   # тень чуть ниже буквы
    blur = 0.03
    for y in range(size):
        row = bytearray([0])     # фильтр строки PNG: None
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            pix = gradient(u, v)
            # Мягкая тень
            ds = letter_sdf(u, v - shadow_dy)
            if ds < blur:
                pix = mix(pix, SHADOW, 0.22 * min(1.0, (blur - ds) / blur) ** 2)
            # Буква со сглаживанием по краю (в пикселях)
            cov = min(1.0, max(0.0, 0.5 - letter_sdf(u, v) * size))
            if cov:
                pix = mix(pix, INK, cov)
            row += bytes(int(round(min(255, max(0, ch)))) for ch in pix)
        rows.append(bytes(row))
    return b''.join(rows)


def write_png(path, size, raw):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    for s in (180, 512):
        out = os.path.join(here, f'icon-{s}.png')
        write_png(out, s, render(s))
        print('saved', out)
