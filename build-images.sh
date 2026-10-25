#!/usr/bin/env bash
# ==========================================================================
#  build-images.sh — фото, документы, og-cover, favicon
#  --------------------------------------------------------------------------
#  Исходники — в assets/img/src/ (в git и на сервер не попадают):
#
#  1. hero-cutout.png — портрет БЕЗ ФОНА для первого экрана (делается из
#     hero.jpg скриптом tools/cutout.py) → hero-480|960.avif|webp с прозрачностью
#     и запасной hero-640.png. Пропорция — как у вырезки: снимок не обрезается.
#  2. about.jpg — фото для «Об адвокате» → about-640|1000.avif|webp + about.jpg.
#  3. extra-1.jpg … extra-3.jpg — фото для групп направлений (поле photo
#     в tools/directions.json) → extra-N-640|1000.avif|webp + extra-N.jpg.
#     contacts-dark.jpg — фото для тёмных «Контактов» → contacts-dark-…
#  4. assets/img/docs/src/* — сканы дипломов и сертификатов → docs/<имя>-480.webp
#     (превью) и docs/<имя>-1600.webp (для увеличения). Номера и серии
#     размываются по координатам из tools/docs-blur.json.
#  5. assets/img/og-cover.jpg (1200 × 630) — превью ссылки в мессенджерах:
#     имя, направления, телефон; есть портрет — он справа.
#  6. favicon.ico (16, 32, 48 px) и apple-touch-icon.png (180 px).
#
#  Пропорции фото скрипт сам вписывает в width/height у <img> в index.html
#  (hero__img, about__img, contacts__img) — место под фото резервируется без сдвигов (CLS).
#  Нет исходника — набор пропускается, остальное собирается.
#
#  Запуск:   bash build-images.sh   (потом bash build.sh)
#  Нужен Node.js 18+. sharp, fontkit и wawoff2 ставятся во временную папку
#  при каждом запуске (npm берёт их из кэша) — в проекте нет node_modules.
#
#  Метаданные фото (EXIF с геометкой и моделью телефона) удаляются: sharp
#  не переносит их без явного запроса. Поворот по EXIF применяется к пикселям
#  до удаления — снимок с телефона не ляжет набок.
# ==========================================================================

set -euo pipefail

# Работаем из папки скрипта: пути не зависят от того, откуда его запустили
cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "Ошибка: не найден npm. Установите Node.js 18+ (https://nodejs.org)." >&2
  exit 1
fi

# Временная папка под зависимости и сам скрипт; удаляется при любом выходе
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ sharp, fontkit, wawoff2: установка во временную папку"
npm install --prefix "$TMP" --no-save --no-audit --no-fund --loglevel=error \
  sharp@0.34 fontkit@2 wawoff2@2 >/dev/null

cat > "$TMP/build-images.cjs" <<'NODE'
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const fontkit = require('fontkit');
const wawoff2 = require('wawoff2');

const IMG = 'assets/img';
const SRC = path.join(IMG, 'src');
const DOCS = path.join(IMG, 'docs');
const FONTS = 'assets/fonts';

// Цвета — те же, что в css/style.css
const C = { stone: '#F6F5F2', ink: '#22252A', soft: '#5E636B', goldLine: '#D8C49B', goldText: '#8A6A33', dark: '#1F2226', onDark: '#F2F1EE' };

const kb = (file) => (fs.statSync(file).size / 1024).toFixed(1).padStart(8);
const log = (file, w, h) => console.log(`  ${path.relative(IMG, file).padEnd(24)} ${String(w).padStart(5)} x ${String(h).padEnd(5)} ${kb(file)} KB`);

function findSource(dir, name) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const file = path.join(dir, `${name}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/* ----- Фото ----- */

// alpha — набор с прозрачностью: запасной формат PNG, а не JPG
const SETS = {
  hero: { widths: [480, 960], alpha: true },
  about: { widths: [640, 1000], alpha: false },
  'extra-1': { widths: [640, 1000], alpha: false },
  'extra-2': { widths: [640, 1000], alpha: false },
  'extra-3': { widths: [640, 1000], alpha: false },
  'contacts-dark': { widths: [640, 1000], alpha: false }
};
// Портрет без фона лежит под отдельным именем: hero.jpg — исходник для cutout.py
const SOURCE_NAME = { hero: 'hero-cutout' };

async function buildSet(name) {
  const { widths, alpha } = SETS[name];
  const file = findSource(SRC, SOURCE_NAME[name] || name);
  if (!file) {
    if (name === 'hero' && findSource(SRC, 'hero')) console.log('→ hero: есть hero.jpg, но нет hero-cutout.png — сначала python tools/cutout.py');
    else console.log(`→ ${name}: исходника нет — пропускаю`);
    return null;
  }

  console.log(`→ ${name}: ${file}`);
  const meta = await sharp(file).rotate().metadata();
  // Пропорция — как у исходника: снимок не обрезается
  const ratio = (meta.orientation >= 5 ? meta.width / meta.height : meta.height / meta.width);
  const height = (w) => Math.round(w * ratio);
  const need = widths[widths.length - 1];
  const srcWidth = meta.orientation >= 5 ? meta.height : meta.width;
  if (srcWidth < need) console.log(`  ! исходник ${srcWidth} px в ширину (нужно ${need}): крупная версия — ${srcWidth} px, без растягивания`);

  // Увеличивать снимок незачем: резче он не станет, а весить будет больше.
  // Имя файла остаётся по ширине из набора (hero-960), чтобы не менять разметку.
  const fit = (w) => Math.min(w, srcWidth);
  const make = (w) => sharp(file).rotate().resize(fit(w), height(fit(w)), { fit: 'fill' });

  for (const w of widths) {
    const avif = path.join(IMG, `${name}-${w}.avif`);
    // 4:2:0 — у AVIF по умолчанию 4:4:4: вдвое тяжелее при той же видимой разнице
    await make(w).avif({ quality: alpha ? 62 : 55, effort: 6, chromaSubsampling: '4:2:0' }).toFile(avif);
    log(avif, fit(w), height(fit(w)));
    const webp = path.join(IMG, `${name}-${w}.webp`);
    // alphaQuality 90 — край волос и пальцев без «ступенек»
    await make(w).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(webp);
    log(webp, fit(w), height(fit(w)));
  }

  if (alpha) {
    // Запасной PNG для браузеров без AVIF/WebP: палитра 256 цветов
    // с прозрачностью — в несколько раз легче полноцветного
    const png = path.join(IMG, `${name}-640.png`);
    await make(640).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toFile(png);
    log(png, fit(640), height(fit(640)));
  } else {
    const jpg = path.join(IMG, `${name}.jpg`);
    // mozjpeg + прогрессивная развёртка: меньше вес, снимок проявляется целиком сразу
    await make(1000).flatten({ background: C.stone }).jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(jpg);
    log(jpg, fit(1000), height(fit(1000)));
  }

  return { make, ratio, width: fit(need), height: height(fit(need)) };
}

// width/height у <img> в index.html — по пропорции исходника, чтобы браузер
// заранее зарезервировал место под фото (в том числе в закомментированной
// разметке: после снятия комментария размеры уже верные)
function patchSize(cls, width, height) {
  const file = 'index.html';
  const html = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`(<img class="${cls}"[^>]*?width=")[0-9]+(" height=")[0-9]+(")`);
  if (!re.test(html)) { console.log(`  ! в index.html нет <img class="${cls}"> с width/height`); return; }
  fs.writeFileSync(file, html.replace(re, `$1${width}$2${height}$3`));
  console.log(`  index.html: ${cls} ${width} x ${height}`);
}

/* ----- Документы ----- */

// Размытие номеров и серий: tools/docs-blur.json — { "имя-файла.jpg": [[x, y, w, h], …] },
// координаты в долях ширины и высоты скана (0…1), чтобы не зависеть от разрешения
async function buildDocs() {
  const dir = path.join(DOCS, 'src');
  if (!fs.existsSync(dir)) { console.log('→ документы: папки assets/img/docs/src нет — пропускаю'); return; }
  const files = fs.readdirSync(dir).filter((f) => /[.](jpe?g|png|webp)$/i.test(f)).sort();
  if (!files.length) { console.log('→ документы: сканов нет — пропускаю'); return; }

  const blurFile = 'tools/docs-blur.json';
  const regions = fs.existsSync(blurFile) ? JSON.parse(fs.readFileSync(blurFile, 'utf8')) : {};
  console.log(`→ документы: ${files.length}`);

  for (const f of files) {
    const base = f.replace(/[.][^.]+$/, '');
    let img = sharp(path.join(dir, f)).rotate();
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    const overlays = [];
    for (const [x, y, w, h] of regions[f] || []) {
      const box = { left: Math.round(x * info.width), top: Math.round(y * info.height), width: Math.round(w * info.width), height: Math.round(h * info.height) };
      const patch = await sharp(data).extract(box).blur(Math.max(8, box.height / 3)).toBuffer();
      overlays.push({ input: patch, left: box.left, top: box.top });
    }
    const clean = overlays.length ? await sharp(data).composite(overlays).toBuffer() : data;
    if (!regions[f]) console.log(`  ! ${f}: координат размытия нет — проверьте, не видны ли номера и серии`);

    const ratio = info.height / info.width;
    for (const w of [480, 1600]) {
      const out = path.join(DOCS, `${base}-${w}.webp`);
      await sharp(clean).resize(Math.min(w, info.width)).webp({ quality: 82, effort: 6 }).toFile(out);
      log(out, Math.min(w, info.width), Math.round(Math.min(w, info.width) * ratio));
    }
  }
}

/* ----- Текст → контуры (Spectral и Commissioner из woff2) ----- */

async function loadFont(names) {
  const fonts = [];
  for (const name of names) {
    const ttf = Buffer.from(await wawoff2.decompress(fs.readFileSync(path.join(FONTS, `${name}.woff2`))));
    fonts.push(fontkit.create(ttf));
  }
  return fonts;
}

// Строка в SVG-контур: для каждого знака — первое подмножество шрифта, где он есть.
// Кернинг не применяется — на превью 1200 px разница не видна.
function textPath(fonts, str, { size, x, y, fill, tracking = 0 }) {
  let pen = x;
  let d = '';
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    const font = fonts.find((f) => f.hasGlyphForCodePoint(cp)) || fonts[0];
    const glyph = font.glyphForCodePoint(cp);
    const scale = size / font.unitsPerEm;
    d += glyph.path.scale(scale, -scale).translate(pen, y).toSVG();
    pen += glyph.advanceWidth * scale + tracking;
  }
  return { svg: `<path fill="${fill}" d="${d}"/>`, width: pen - x };
}

/* ----- og-cover ----- */

async function ogCover(portrait) {
  const serif = await loadFont(['spectral-cyrillic-500-normal', 'spectral-latin-500-normal']);
  const sans = await loadFont(['commissioner-cyrillic-400-normal', 'commissioner-latin-400-normal', 'commissioner-rub-400-normal']);
  const W = 1200, H = 630, x = 88;

  const parts = [
    textPath(sans, 'Адвокат, рег. № 78/5942', { size: 26, x, y: 150, fill: C.soft }),
    textPath(serif, 'Страховецкая', { size: 96, x: x - 3, y: 252, fill: C.ink, tracking: -1 }),
    textPath(serif, 'Ева Рубиновна', { size: 54, x, y: 322, fill: C.ink }),
    textPath(sans, 'Уголовные и семейные дела', { size: 32, x, y: 420, fill: C.ink }),
    textPath(sans, 'Санкт-Петербург, Московский пр., 186', { size: 24, x, y: 470, fill: C.soft }),
    textPath(serif, '+7 (911) 258-59-34', { size: 38, x, y: 548, fill: C.goldText })
  ];

  const layers = [];
  if (portrait) {
    // Портрет без фона стоит на нижнем крае справа, по высоте превью
    const ph = 600, pw = Math.round(ph / portrait.ratio);
    const photo = await portrait.make(pw).png().toBuffer();
    layers.push({ input: photo, left: W - pw - 40, top: H - ph });
    const widest = Math.max(...parts.map((p) => p.width));
    if (x + widest > W - pw - 40 + pw * 0.2) console.log(`  ! текст (${Math.round(x + widest)} px) заходит на портрет`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="${x}" y="350" width="72" height="2" fill="${C.goldLine}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${C.goldLine}"/>
  ${parts.map((p) => p.svg).join('\n  ')}
</svg>`;
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });

  const out = path.join(IMG, 'og-cover.jpg');
  await sharp({ create: { width: W, height: H, channels: 3, background: C.stone } })
    .composite(layers)
    .jpeg({ quality: 86, mozjpeg: true, progressive: true })
    .toFile(out);
  console.log(`→ og-cover${portrait ? ' (с портретом)' : ' (без портрета — портрета пока нет)'}`);
  log(out, W, H);
}

/* ----- favicon.ico и apple-touch-icon ----- */

async function favicon() {
  const serif = await loadFont(['spectral-cyrillic-500-normal']);
  // «С» Spectral на графитовом квадрате с золотой чертой снизу
  const letter = (size, box) => {
    const font = serif[0];
    const glyph = font.glyphForCodePoint('С'.codePointAt(0));
    const scale = size / font.unitsPerEm;
    const bb = glyph.bbox;
    const gx = (box - (bb.maxX - bb.minX) * scale) / 2 - bb.minX * scale;
    const gy = (box + (bb.maxY - bb.minY) * scale) / 2 - box * 0.04 + bb.minY * scale;
    return glyph.path.scale(scale, -scale).translate(gx, gy).toSVG();
  };
  const icon = (box, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}">
  <rect width="${box}" height="${box}" rx="${rounded ? box / 10 : 0}" fill="${C.ink}"/>
  <path fill="${C.onDark}" d="${letter(box * 0.78, box)}"/>
  <rect x="${box * 0.3}" y="${box * 0.82}" width="${box * 0.4}" height="${Math.max(1, box * 0.05)}" fill="${C.goldLine}"/>
</svg>`;

  const sizes = [16, 32, 48];
  const pngs = [];
  for (const s of sizes) pngs.push(await sharp(Buffer.from(icon(64, true)), { density: 72 * s / 64 * 4 }).resize(s, s).png().toBuffer());

  // ICO с PNG внутри (поддерживается всеми браузерами с Windows Vista и IE 9)
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s, e);
    header.writeUInt8(s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync('favicon.ico', Buffer.concat([header, ...pngs]));
  console.log('→ favicon.ico (16/32/48)');

  // apple-touch-icon: без прозрачности и скругления — iOS скругляет углы сам
  await sharp(Buffer.from(icon(180, false)), { density: 144 }).resize(180, 180).png().toFile('apple-touch-icon.png');
  console.log('→ apple-touch-icon.png (180)');
}

(async () => {
  const hero = await buildSet('hero');
  if (hero) patchSize('hero__img', hero.width, hero.height);
  const about = await buildSet('about');
  if (about) patchSize('about__img', about.width, about.height);
  for (const name of ['extra-1', 'extra-2', 'extra-3']) await buildSet(name);
  const contacts = await buildSet('contacts-dark');
  if (contacts) patchSize('contacts__img', contacts.width, contacts.height);
  await buildDocs();
  await ogCover(hero);
  await favicon();
})().catch((err) => { console.error('Ошибка:', err.message); process.exit(1); });
NODE

node "$TMP/build-images.cjs"

echo
echo "Готово. Дальше: bash build.sh"
