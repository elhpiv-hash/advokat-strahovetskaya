#!/usr/bin/env bash
# ==========================================================================
#  build-images.sh — подготовка фотографий
#  --------------------------------------------------------------------------
#  assets/img/src/hero.jpg   → hero-640/1000/1600.webp + hero.jpg     (4 : 5)
#  assets/img/src/work.jpg   → work-640/1000/1600.webp + work.jpg     (3 : 2)
#  assets/img/src/office.jpg → office-640/1000/1600.webp + office.jpg (4 : 3)
#  (office.jpg — необязательный: вход или здание офиса для «Контактов»)
#
#  Запуск:   bash build-images.sh
#  Нужен Node.js 18+. Библиотека sharp ставится во временную папку при
#  каждом запуске (npm берёт её из кэша) — в проекте нет package.json
#  и node_modules, как и у build.sh.
#
#  Что делает и почему:
#  • Кадрирует в фиксированную пропорцию. Тогда width/height в разметке
#    всегда верные, место под фото резервируется заранее и вёрстка не
#    прыгает при загрузке (CLS).
#  • Портрет кадрируется от верхнего края (position: north): у снимка
#    по пояс жертвовать лучше поясом, чем головой.
#  • У портрета снижает насыщенность на 15 %: тёплые тона кожи и фона
#    иначе спорят с холодным графитом первого экрана.
#  • WebP с качеством 80 — на треть-половину легче JPEG того же вида;
#    JPEG 1000 px — запасной вариант для браузеров без WebP.
#  • Удаляет метаданные: sharp не переносит EXIF (а с ним геометку
#    и модель телефона) и ICC без явного запроса. Поворот по EXIF
#    применяется к пикселям до удаления — снимок не ляжет набок.
#
#  После запуска — убрать заглушки и снять комментарии с <picture>
#  в index.html (инструкции — в комментариях рядом с каждой заглушкой).
#  Исходники из assets/img/src не публикуются: .htaccess отдаёт на них 404,
#  .gitignore не пускает их в репозиторий.
# ==========================================================================

set -euo pipefail

# Работаем из папки скрипта: пути не зависят от того, откуда его запустили
cd "$(dirname "$0")"

SRC="assets/img/src"
OUT="assets/img"

if ! command -v npm >/dev/null 2>&1; then
  echo "Ошибка: не найден npm. Установите Node.js 18+ (https://nodejs.org)." >&2
  exit 1
fi

if [ ! -f "$SRC/hero.jpg" ] && [ ! -f "$SRC/work.jpg" ] && [ ! -f "$SRC/office.jpg" ]; then
  echo "Ошибка: в $SRC нет ни hero.jpg, ни work.jpg, ни office.jpg — нечего обрабатывать." >&2
  exit 1
fi

# Временная папка под sharp и сам скрипт; удаляется при любом выходе
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ sharp: установка во временную папку"
# Версия зафиксирована минором (0.34): сборка воспроизводима
npm install --prefix "$TMP" --no-save --no-audit --no-fund --loglevel=error sharp@0.34 >/dev/null

cat > "$TMP/build-images.cjs" <<'NODE'
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const [src, out] = process.argv.slice(2);
const WIDTHS = [640, 1000, 1600];
const FALLBACK = 1000;

// ratio — высота к ширине; position — что сохранить при обрезке
const PHOTOS = [
  { name: 'hero',   ratio: 5 / 4, position: 'north',  saturation: 0.85 },
  { name: 'work',   ratio: 2 / 3, position: 'centre', saturation: 1 },
  { name: 'office', ratio: 3 / 4, position: 'centre', saturation: 1 }
];

const kb = (file) => (fs.statSync(file).size / 1024).toFixed(1).padStart(8);
const log = (file, w, h) => console.log(`  ${path.basename(file).padEnd(18)} ${String(w).padStart(5)} x ${String(h).padEnd(5)} ${kb(file)} KB`);

async function build({ name, ratio, position, saturation }) {
  const file = path.join(src, `${name}.jpg`);
  if (!fs.existsSync(file)) {
    console.log(`→ ${name}.jpg — нет, пропускаю`);
    return;
  }
  console.log(`→ ${name}.jpg`);

  // Самый крупный вариант — 1600 px по ширине. Если исходник меньше,
  // его придётся растягивать, и на больших экранах фото будет мягким
  const meta = await sharp(file).rotate().metadata();
  const needH = Math.round(1600 * ratio);
  if (meta.width < 1600 || meta.height < needH) {
    console.log(`  ! исходник ${meta.width} x ${meta.height}: для резкости нужен от 1600 x ${needH}`);
  }

  const fit = (w) => {
    let img = sharp(file)
      .rotate()
      .resize(w, Math.round(w * ratio), { fit: 'cover', position, withoutEnlargement: false });
    if (saturation !== 1) img = img.modulate({ saturation });
    return img;
  };

  for (const w of WIDTHS) {
    const dst = path.join(out, `${name}-${w}.webp`);
    await fit(w).webp({ quality: 80, effort: 6 }).toFile(dst);
    log(dst, w, Math.round(w * ratio));
  }

  const jpg = path.join(out, `${name}.jpg`);
  // mozjpeg + прогрессивная развёртка: меньше вес, снимок проявляется целиком сразу
  await fit(FALLBACK).jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(jpg);
  log(jpg, FALLBACK, Math.round(FALLBACK * ratio));
}

(async () => {
  for (const photo of PHOTOS) await build(photo);
})().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
NODE

node "$TMP/build-images.cjs" "$SRC" "$OUT"

echo
echo "Готово. Теперь в index.html удалите заглушки и снимите комментарии"
echo "с разметки <picture> (и с preload портрета в <head>)."
