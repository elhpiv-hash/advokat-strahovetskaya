#!/usr/bin/env bash
# ==========================================================================
#  build.sh — сборка сайта
#  --------------------------------------------------------------------------
#  0. Секции направлений и оглавление — из tools/directions.json
#     (tools/build-directions.mjs).
#  1. css/style.css → css/style.min.css   (clean-css-cli 5)
#  2. js/main.js    → js/main.min.js      (terser 5)
#  3. Адрес сайта из SITE_URL — в canonical, Open Graph, Twitter, JSON-LD
#     всех страниц (index.html, privacy/index.html, 404.html) и домен в их
#     тексте, robots.txt, sitemap.xml.
#  4. ?v= у style.min.css и main.min.js — хеш содержимого: статика кэшируется
#     на год (immutable), новый хеш сразу обходит кэш. Вручную не трогать.
#  5. sha256 встроенного скрипта из <head> — в CSP (.htaccess).
#  6. lastmod в sitemap.xml — сегодняшняя дата.
#  7. Код Яндекс.Вебмастера (YANDEX_VERIFICATION) — meta в index.html,
#     пустой — meta нет. Ссылка на студию (STUDIO_URL) — в подвале.
#     Ссылка на MAX (SITE.max в js/main.js) — в href всех кнопок MAX и в
#     sameAs JSON-LD; пустая — кнопки MAX скрыты (hidden, без href).
#  8. dist/ — только файлы для сервера, и архив $ZIP_NAME
#     (без .git, README, *.sh, tools/, assets/img/src/, assets/content/).
#
#  Запуск:   bash build.sh
#  Нужен Node.js 18+ — npx сам скачает инструменты при первом запуске.
#  Фото, og-cover и favicon собирает отдельный скрипт: build-images.sh.
# ==========================================================================

set -euo pipefail

# Работаем из папки скрипта: пути не зависят от того, откуда его запустили
cd "$(dirname "$0")"

# ----- Настройки --------------------------------------------------------------

# Адрес сайта — ЕДИНСТВЕННОЕ место, где задаётся домен. Поменяйте строку
# и запустите bash build.sh — адрес обновится во всех файлах сразу.
SITE_URL="https://example.ru"

# Код подтверждения Яндекс.Вебмастера: только значение content из
# <meta name="yandex-verification" content="…">. Пусто — meta не выводится.
YANDEX_VERIFICATION=""

# Ссылка «Сайт сделан в студии elhpiv» в подвале. Пусто — просто текст.
STUDIO_URL=""

# Архив для выкладки
ZIP_NAME="advokat-strahovetskaya.zip"

CSS_SRC="css/style.css"
CSS_MIN="css/style.min.css"
JS_SRC="js/main.js"
JS_MIN="js/main.min.js"
PAGES="index.html privacy/index.html 404.html"

if ! command -v npx >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo "Ошибка: не найден Node.js (node, npx). Установите Node.js 18+ (https://nodejs.org)." >&2
  exit 1
fi

for file in "$CSS_SRC" "$JS_SRC" $PAGES robots.txt sitemap.xml .htaccess tools/directions.json; do
  [ -f "$file" ] || { echo "Ошибка: нет файла $file" >&2; exit 1; }
done

echo "→ Направления: tools/directions.json → index.html"
node tools/build-directions.mjs

# Версии зафиксированы мажором (@5): сборка воспроизводима и не сломается
# от несовместимого релиза. --yes — не спрашивать подтверждение установки.

echo "→ CSS: clean-css"
# -O1 — только безопасные сокращения внутри правил. -O2 умеет сливать
# и переставлять правила, а это может незаметно поменять каскад.
npx --yes --package=clean-css-cli@5 cleancss -O1 -o "$CSS_MIN" "$CSS_SRC"

echo "→ JS: terser"
# passes=2 — второй проход находит то, что открылось после первого.
# Пустой METRIKA_ID terser видит как константу и вырезает код Метрики целиком.
npx --yes --package=terser@5 terser "$JS_SRC" \
  --compress passes=2 \
  --mangle \
  --comments false \
  --output "$JS_MIN"

echo "→ HTML: адрес сайта, версии файлов, CSP, Вебмастер, студия"
# Замены делает Node, а не sed: у sed -i разный синтаксис в Linux и macOS,
# а в адресе бывают символы, которые sed понял бы как спецсимволы.
node - "$SITE_URL" "$YANDEX_VERIFICATION" "$STUDIO_URL" $PAGES <<'NODE'
const fs = require('fs');
const crypto = require('crypto');

const fail = (msg) => { console.error('Ошибка: ' + msg); process.exit(1); };
const read = (file) => fs.readFileSync(file, 'utf8');
const [rawUrl, verification, studioUrl, ...pages] = process.argv.slice(2);

const siteUrl = rawUrl.trim().replace(/\/+$/, '') + '/';
if (!/^https?:\/\/[^\s"'<>]+\/$/.test(siteUrl)) fail(`SITE_URL «${siteUrl}» — не похоже на адрес сайта`);
if (verification && !/^[\w-]+$/.test(verification)) fail('YANDEX_VERIFICATION — только значение content, без кавычек и тегов');
if (studioUrl && !/^https?:\/\/[^\s"'<>]+$/.test(studioUrl)) fail(`STUDIO_URL «${studioUrl}» — не похоже на адрес`);

const html = Object.fromEntries(pages.map((file) => [file, read(file)]));
let robots = read('robots.txt');
let sitemap = read('sitemap.xml');
let htaccess = read('.htaccess');

// Текущий адрес берём из canonical главной: так скрипт знает, что именно
// заменять, и повторный запуск с тем же SITE_URL ничего не меняет.
const canonical = html['index.html'].match(/<link rel="canonical" href="([^"]+)">/);
if (!canonical) fail('в index.html нет <link rel="canonical">');
const oldUrl = canonical[1];

if (oldUrl !== siteUrl) {
  const swap = (text) => text.split(oldUrl).join(siteUrl);
  const oldHost = new URL(oldUrl).host;
  const newHost = new URL(siteUrl).host;
  // в страницах — и полные адреса, и домен в тексте (например, в политике)
  for (const file of pages) html[file] = swap(html[file]).split(oldHost).join(newHost);
  robots = swap(robots);
  sitemap = swap(sitemap);
  console.log(`  адрес: ${oldUrl} → ${siteUrl}`);
} else {
  console.log(`  адрес: ${siteUrl} (без изменений)`);
}

// ?v= — первые 10 знаков sha256 минифицированного файла
const version = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
const cssV = version('css/style.min.css');
const jsV = version('js/main.min.js');
for (const file of pages) {
  html[file] = html[file]
    .replace(/(css\/style\.min\.css\?v=)[^"]*/, '$1' + cssV)
    .replace(/(js\/main\.min\.js\?v=)[^"]*/, '$1' + jsV);
}

// CSP: хеш текста встроенного скрипта без атрибутов (<script>…</script>).
// Он одинаковый на всех страницах — проверяем, чтобы CSP не сломалась.
const inline = pages.map((file) => {
  const m = html[file].match(/<script>([^<]*)<\/script>/);
  if (!m) fail(`в ${file} не найден встроенный скрипт <script>…</script>`);
  return m[1];
});
if (new Set(inline).size !== 1) fail('встроенный скрипт в <head> различается на страницах — CSP допускает только один');
const cspHash = crypto.createHash('sha256').update(inline[0]).digest('base64');
if (!/'sha256-[^']*'/.test(htaccess)) fail("в .htaccess не найден 'sha256-…' в CSP");
htaccess = htaccess.replace(/'sha256-[^']*'/, `'sha256-${cspHash}'`);

// Яндекс.Вебмастер: meta только на главной и только если код задан
html['index.html'] = html['index.html'].replace(/\n {2}<meta name="yandex-verification" content="[^"]*">/, '');
if (verification) {
  html['index.html'] = html['index.html'].replace(/(<link rel="canonical" href="[^"]+">)/,
    `$1\n  <meta name="yandex-verification" content="${verification}">`);
}

// Студия: ссылка, если задан адрес, иначе текст
const studio = studioUrl
  ? `<a class="footer__studio" href="${studioUrl}" target="_blank" rel="noopener">Сайт сделан в&nbsp;студии elhpiv</a>`
  : '<span class="footer__studio">Сайт сделан в&nbsp;студии elhpiv</span>';
for (const file of pages) {
  html[file] = html[file].replace(/<!-- studio -->[\s\S]*?<!-- \/studio -->/, `<!-- studio -->${studio}<!-- /studio -->`);
}

// MAX: ссылка на профиль — SITE.max в js/main.js. Пусто — кнопок MAX нет
// вовсе: на их месте скрытый <span hidden> (не <a> без href — такую
// «ссылку» Lighthouse считает неиндексируемой, и никаких «#»). Есть ссылка —
// там <a href> с target и rel, профиль добавлен в sameAs JSON-LD.
// Без обратных слэшей в шаблонах: [.] и [/] вместо экранирования.
const maxMatch = read('js/main.js').match(/max: '([^']*)'/);
if (!maxMatch) fail("в js/main.js нет SITE.max (строка max: '…')");
const maxUrl = maxMatch[1].trim();
if (maxUrl && !/^https:[/][/][^"'<>]+$/.test(maxUrl)) fail(`SITE.max «${maxUrl}» — не похоже на ссылку https://…`);
let maxCount = 0;
const maxEl = (all, attrs) => {
  maxCount++;
  const bare = attrs.replace(/ ?(href|target|rel)="[^"]*"/g, '').replace(/ ?hidden(?= |$)/, '').trim();
  return maxUrl
    ? `<a href="${maxUrl}" ${bare} target="_blank" rel="noopener">MAX</a>`
    : `<span ${bare} hidden>MAX</span>`;
};
for (const file of pages) {
  html[file] = html[file].replace(/<(?:a|span) ([^>]*data-site="max"[^>]*)>MAX<[/](?:a|span)>/g, maxEl);
}
html['index.html'] = html['index.html'].replace(/"sameAs": [[]([^]*?)]/, (all, body) => {
  const urls = (body.match(/"[^"]+"/g) || []).map((u) => u.slice(1, -1)).filter((u) => !u.includes('max.ru'));
  if (maxUrl) urls.push(maxUrl);
  return '"sameAs": [\n' + urls.map((u) => `      "${u}"`).join(',\n') + '\n    ]';
});

const today = new Date().toISOString().slice(0, 10);
sitemap = sitemap.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${today}</lastmod>`);

for (const file of pages) fs.writeFileSync(file, html[file]);
fs.writeFileSync('robots.txt', robots);
fs.writeFileSync('sitemap.xml', sitemap);
fs.writeFileSync('.htaccess', htaccess);
console.log(`  CSP: sha256-${cspHash}`);
console.log(`  Вебмастер: ${verification ? 'meta добавлена' : 'код не задан — meta нет'}; студия: ${studioUrl || 'без ссылки'}`);
console.log(`  MAX: ${maxUrl ? maxUrl + ` — кнопок ${maxCount}` : `ссылка не задана — ${maxCount} кнопок скрыты`}`);
NODE

echo "→ dist/ и $ZIP_NAME"
# Только то, что нужно серверу. Список явный: случайный файл в корне
# (заметки, бэкап) не уедет на хостинг.
rm -rf dist
mkdir -p dist/css dist/js dist/assets/img dist/privacy
cp index.html 404.html robots.txt sitemap.xml .htaccess favicon.ico apple-touch-icon.png dist/
cp privacy/index.html dist/privacy/
cp "$CSS_MIN" dist/css/
cp "$JS_MIN" dist/js/
cp -R assets/fonts dist/assets/
find assets/img -maxdepth 1 -type f ! -name '.gitkeep' -exec cp {} dist/assets/img/ \;
# Документы — только готовые превью и крупные версии, без исходных сканов
if [ -d assets/img/docs ]; then
  mkdir -p dist/assets/img/docs
  find assets/img/docs -maxdepth 1 -type f ! -name '.gitkeep' -exec cp {} dist/assets/img/docs/ \;
fi

# Архив пишет Node: zip-утилиты нет в Git Bash на Windows, а архив
# PowerShell (Compress-Archive) кладёт пути с «\» — на Linux-хостинге
# они распаковались бы в файлы с обратной косой чертой в имени.
node - dist "$ZIP_NAME" <<'NODE'
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const [dir, out] = process.argv.slice(2);

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = table[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

const files = [];
(function walk(rel) {
  for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (fs.statSync(path.join(dir, r)).isDirectory()) walk(r);
    else files.push(r);
  }
})('');

// Дата и время файлов в архиве — момент сборки (формат MS-DOS)
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const local = [];
const central = [];
let offset = 0;
for (const name of files) {
  const data = fs.readFileSync(path.join(dir, name));
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034B50, 0);
  head.writeUInt16LE(20, 4);              // версия для распаковки
  head.writeUInt16LE(0x0800, 6);          // имена в UTF-8
  head.writeUInt16LE(8, 8);               // deflate
  head.writeUInt16LE(dosTime, 10);
  head.writeUInt16LE(dosDate, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(nameBuf.length, 26);
  local.push(head, nameBuf, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014B50, 0);
  entry.writeUInt16LE(0x031E, 4);         // создан в Unix, версия 3.0
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(dosTime, 12);
  entry.writeUInt16LE(dosDate, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(nameBuf.length, 28);
  entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);   // права rw-r--r--
  entry.writeUInt32LE(offset, 42);
  central.push(entry, nameBuf);
  offset += head.length + nameBuf.length + packed.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054B50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);
fs.writeFileSync(out, Buffer.concat([...local, cd, end]));
console.log(`  ${files.length} файлов → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} КБ)`);
NODE

# ----- Таблица размеров -----
# gzip — ориентир того, сколько реально уйдёт по сети при сжатии на сервере

bytes() { wc -c < "$1" | tr -d ' '; }
gz()    { gzip -9 -c "$1" | wc -c | tr -d ' '; }
kb()    { awk -v b="$1" 'BEGIN { printf "%.1f", b / 1024 }'; }
saved() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.0f %%", (1 - b / a) * 100 }'; }

# printf выравнивает по байтам, а кириллическая буква в UTF-8 — два байта.
# Поэтому в строках таблицы только ASCII, а заголовок выровнен вручную.
row() {
  local src="$1" min="$2"
  local s m g
  s=$(bytes "$src"); m=$(bytes "$min"); g=$(gz "$min")
  printf '  %-20s %14s %14s %14s %10s\n' "$min" "$(kb "$s")" "$(kb "$m")" "$(kb "$g")" "$(saved "$s" "$m")"
}

echo
echo "  Файл                   исходник, КБ   минифиц., КБ     с gzip, КБ   экономия"
echo "  -------------------- -------------- -------------- -------------- ----------"
row "$CSS_SRC" "$CSS_MIN"
row "$JS_SRC"  "$JS_MIN"
printf '  %-20s %14s %14s %14s %10s\n' "index.html" "$(kb "$(bytes index.html)")" "-" "$(kb "$(gz index.html)")" "-"
echo
echo "Готово. На сервер — содержимое dist/ (или $ZIP_NAME)."
