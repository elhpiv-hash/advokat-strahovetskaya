"""Вырезка фона у портрета для первого экрана.

    assets/img/src/hero.jpg → assets/img/src/hero-cutout.png (человек на прозрачном фоне)

Запуск (на сервер скрипт не попадает — папка tools/ в dist не входит):

    pip install "rembg[cpu]"
    python tools/cutout.py
    bash build-images.sh

1. Маска — rembg, модель birefnet-portrait (обучена на портретах: волосы и плечи
   чище, чем у u2net/isnet). Модель rembg скачивает при первом запуске (~1 ГБ).
2. Очистка цвета краёв: в полупрозрачных пикселях (волосы, край одежды)
   смешаны человек и фон снимка. Фон под человеком восстанавливается размытием
   «фоновой» части снимка и вычитается: F = (I − (1 − α)·B) / α. Без этого
   на светлом фоне сайта по контуру остался бы ореол цвета старого фона.
3. Контур 3 px получает цвет изнутри фигуры (как «Defringe» в Photoshop).
4. Пустое поле над головой срезается (запас 3 % высоты). Там, где фигура
   упирается в край кадра, прозрачность плавно растёт к краю: без рамки срез
   кадра читался бы как прямая линия. Снизу растушёвка короткая (BOTTOM_FADE):
   руки и книга внизу кадра должны остаться видны — по заданию их не обрезаем.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'img' / 'src' / 'hero.jpg'
OUT = ROOT / 'assets' / 'img' / 'src' / 'hero-cutout.png'
PLATE = (0xF6, 0xF5, 0xF2)      # фон первого экрана (--c-stone в css/style.css)

SIDE_FADE = 0.08                # доля ширины: растушёвка у боковых краёв кадра
BOTTOM_FADE = 0.10              # доля высоты: растушёвка у нижнего края


def box(arr, r):
    """Box-размытие по обеим осям через кумулятивные суммы (r — радиус)."""
    for axis in (0, 1):
        pad = [(0, 0)] * arr.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(arr, pad, mode='edge'), axis=axis)
        hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
        lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
        arr = (hi - lo) / (2 * r + 1)
    return arr


def blur(arr, r):
    for _ in range(3):          # три прохода box ≈ гауссово размытие
        arr = box(arr, r)
    return arr


def erode(mask, r):
    """Сужение маски на r px: пиксель остаётся, если весь квадрат вокруг — маска."""
    return box(mask.astype(np.float32), r) > 0.999


def main():
    image = Image.open(SRC).convert('RGB')
    mask = remove(image, session=new_session('birefnet-portrait'), only_mask=True, post_process_mask=False)

    I = np.asarray(image, dtype=np.float32) / 255
    a = np.asarray(mask.convert('L'), dtype=np.float32)[..., None] / 255

    # фон под человеком — нормированная свёртка по пикселям «точно фон»
    bg = (a < 0.02).astype(np.float32)
    B = blur(I * bg, 24) / np.maximum(blur(bg, 24), 1e-4)

    F = np.where(a > 0.02, (I - (1 - a) * B) / np.maximum(a, 0.02), I)
    F = np.where(a >= 0.98, I, np.clip(F, 0, 1))

    # контур: цвет из «точно фигуры» в 3 px глубже — нормированная свёртка
    solid = a[..., 0] >= 0.98
    inner = erode(solid, 3).astype(np.float32)[..., None]
    edge = (a[..., 0] > 0.02) & ~erode(solid, 3)
    G = blur(F * inner, 3) / np.maximum(blur(inner, 3), 1e-4)
    known = blur(inner, 3) > 1e-3
    F = np.where((edge & known[..., 0])[..., None], G, F)

    # пустое поле над головой — прочь, с запасом 3 % высоты
    rows = np.nonzero((a[..., 0] > 0.5).any(axis=1))[0]
    top = max(0, rows[0] - round(0.03 * a.shape[0]))
    F, a = F[top:], a[top:]
    h, w = a.shape[:2]

    # растушёвка там, где тело упирается в край кадра (smoothstep — без
    # заметной границы начала)
    def ramp(n, size):
        t = np.clip(np.arange(n) / max(size, 1), 0, 1)
        return t * t * (3 - 2 * t)
    fx = np.minimum(ramp(w, SIDE_FADE * w), ramp(w, SIDE_FADE * w)[::-1])
    fy = ramp(h, BOTTOM_FADE * h)[::-1]
    a = a * (fy[:, None] * fx[None, :])[..., None]

    # Полностью прозрачные пиксели не видны, но их цвет кодируется: пёстрый
    # фон снимка утяжелял бы AVIF в разы. Заливаем ровным цветом фона сайта.
    F = np.where(a * 255 < 0.5, np.array(PLATE, dtype=np.float32) / 255, F)

    rgba = np.concatenate([F, a], axis=-1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), mode='RGBA').save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)}: {w} x {h} (срезано сверху {top} px)')


if __name__ == '__main__':
    main()
