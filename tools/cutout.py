"""Вырезка фона у фото для первого экрана.

    assets/img/src/hero-full.jpg → assets/img/src/hero-cutout.png (человек на прозрачном фоне)

hero-full.jpg — снимок клиента в рост (extra-2 из eva-photos.zip без чёрной
полосы снизу). Ступней нет ни на одном снимке: кадр кончается выше колена,
и на сайте этот срез прячется за полосой цифр — фигура «стоит» на ней.

Запуск (на сервер скрипт не попадает — папка tools/ в dist не входит):

    pip install "rembg[cpu]"
    python tools/cutout.py
    bash build-images.sh

1. Маска — rembg, модель birefnet-portrait (обучена на портретах: волосы и плечи
   чище, чем у u2net/isnet). Модель rembg скачивает при первом запуске (~1 ГБ).
2. Очистка цвета краёв: в полупрозрачных пикселях (волосы, край одежды)
   смешаны человек и фон снимка. Фон под человеком восстанавливается размытием
   «фоновой» части снимка и вычитается: F = (I − (1 − α)·B) / α. Без этого
   на светлом фоне сайта по контуру остался бы тёмный ореол стенных панелей.
3. Контур 3 px получает цвет изнутри фигуры (как «Defringe» в Photoshop).
4. Кадр обрезается по фигуре: сверху поле 3 % высоты над головой, по бокам
   по 3 % ширины от локтей, снизу — ровный срез (его закрывает полоса цифр).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'img' / 'src' / 'hero-full.jpg'
OUT = ROOT / 'assets' / 'img' / 'src' / 'hero-cutout.png'
# Маска rembg считается ~3 минуты на CPU; при повторных прогонах (подбор
# контуров KEEP/REMOVE) берётся сохранённая, пока снимок не новее её
MASK = ROOT / 'assets' / 'img' / 'src' / 'hero-full-mask.png'
PLATE = (0xF6, 0xF5, 0xF2)      # фон первого экрана (--c-stone в css/style.css)

MARGIN_TOP = 0.03               # доля высоты: поле над головой
MARGIN_SIDE = 0.03              # доля ширины: поле от локтей до края кадра
BOTTOM_CUT = 6                  # px: срезать снизу — край бывшей чёрной полосы

# Что оставить в кадре сверх человека и что убрать, хотя модель сочла это
# человеком, — многоугольники в пикселях hero-full.jpg. Для другого снимка —
# пересчитать или оставить пустыми.
KEEP = []
# Лист пальмы вдоль левого рукава (справа на снимке): модель приклеила его
# к рукаву. Контур идёт в 2 px от края рукава.
REMOVE = [
    [(543, 694), (556, 726), (568, 756), (583, 786), (597, 808), (603, 818), (618, 818),
     (614, 766), (594, 726), (574, 696), (554, 686)],
]


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


def person_mask(image):
    if MASK.exists() and MASK.stat().st_mtime >= SRC.stat().st_mtime:
        return Image.open(MASK).convert('L')
    from rembg import new_session, remove   # тяжёлый импорт — только когда нужен
    mask = remove(image, session=new_session('birefnet-portrait'), only_mask=True, post_process_mask=False)
    mask.convert('L').save(MASK)
    return mask.convert('L')


def poly_mask(size, polygons):
    """Многоугольники — маска с краем в 1 px, чтобы контур не был зубчатым."""
    canvas = Image.new('L', size, 0)
    draw = ImageDraw.Draw(canvas)
    for poly in polygons:
        draw.polygon(poly, fill=255)
    return np.asarray(canvas.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32)[..., None] / 255


def main():
    image = Image.open(SRC).convert('RGB')
    mask = person_mask(image)

    I = np.asarray(image, dtype=np.float32) / 255
    a = np.asarray(mask, dtype=np.float32)[..., None] / 255
    if KEEP:
        a = np.maximum(a, poly_mask(image.size, KEEP))
    if REMOVE:
        a = a * (1 - poly_mask(image.size, REMOVE))

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

    # кадр по фигуре: поле над головой и по бокам, ровный срез снизу
    h0, w0 = a.shape[:2]
    body = a[..., 0] > 0.5
    rows = np.nonzero(body.any(axis=1))[0]
    cols = np.nonzero(body.any(axis=0))[0]
    top = max(0, rows[0] - round(MARGIN_TOP * h0))
    bottom = h0 - BOTTOM_CUT
    left = max(0, cols[0] - round(MARGIN_SIDE * w0))
    right = min(w0, cols[-1] + 1 + round(MARGIN_SIDE * w0))
    F, a = F[top:bottom, left:right], a[top:bottom, left:right]
    h, w = a.shape[:2]

    # Полностью прозрачные пиксели не видны, но их цвет кодируется: пёстрый
    # фон снимка утяжелял бы AVIF в разы. Заливаем ровным цветом фона сайта.
    F = np.where(a * 255 < 0.5, np.array(PLATE, dtype=np.float32) / 255, F)

    rgba = np.concatenate([F, a], axis=-1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), mode='RGBA').save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)}: {w} x {h} (кадр: x {left}–{right}, y {top}–{bottom} из {w0} x {h0})')


if __name__ == '__main__':
    main()
