#!/usr/bin/env bash
# ==========================================================================
#  tools/publish-pages.sh — демо сайта на GitHub Pages для показа клиенту
#  --------------------------------------------------------------------------
#  Собирает сайт (build.sh) и публикует копию dist/ в ветку gh-pages:
#      https://elhpiv-hash.github.io/advokat-strahovetskaya/
#
#  Отличия демо от боевой сборки (сами исходники и dist/ не меняются):
#  • абсолютные URL (canonical, Open Graph, JSON-LD, sitemap) — на адрес Pages,
#    чтобы превью ссылки в мессенджерах показывало картинку;
#  • noindex на всех страницах и «Disallow: /» в robots.txt — копия не попадёт
#    в поиск и не будет конкурировать с боевым сайтом;
#  • 404.html — пути с префиксом /advokat-strahovetskaya/ (сайт в подпапке);
#  • .htaccess убран (на Pages не действует), добавлен .nojekyll.
#
#  Запуск:   bash tools/publish-pages.sh
#  Ветка gh-pages целиком генерируется этим скриптом: каждый запуск — новый
#  коммит поверх неё с текущим содержимым dist/ (без push --force). Руками
#  её не правят.
# ==========================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

REPO="elhpiv-hash/advokat-strahovetskaya"
PAGES_URL="https://elhpiv-hash.github.io/advokat-strahovetskaya/"

bash build.sh >/dev/null
echo "→ сборка: dist/ готов"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R dist/. "$TMP/"
rm -f "$TMP/.htaccess"
touch "$TMP/.nojekyll"

node - "$TMP" "$PAGES_URL" <<'NODE'
const fs = require('fs');
const path = require('path');
const [dir, pagesUrl] = process.argv.slice(2);
const prefix = new URL(pagesUrl).pathname;            // /advokat-strahovetskaya/
const file = (rel) => path.join(dir, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');

const prodUrl = read('index.html').match(/<link rel="canonical" href="([^"]+)">/)[1];
const swap = (text) => text.split(prodUrl).join(pagesUrl);
const noindex = '\n  <meta name="robots" content="noindex, nofollow">';

for (const rel of ['index.html', 'privacy/index.html', '404.html']) {
  let html = swap(read(rel));
  html = html.replace(/\n {2}<meta name="robots" content="[^"]*">/, '');
  html = html.replace(/(<meta name="viewport"[^>]*>)/, `$1${noindex}`);
  if (rel === '404.html') {
    // пути от корня домена → от корня демо (/advokat-strahovetskaya/…)
    html = html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${prefix}`);
  }
  fs.writeFileSync(file(rel), html);
}
fs.writeFileSync(file('sitemap.xml'), swap(read('sitemap.xml')));
fs.writeFileSync(file('robots.txt'), '# Демо для показа — в поиск не нужно\nUser-agent: *\nDisallow: /\n');
console.log(`→ демо: ${prodUrl} → ${pagesUrl}, noindex`);
NODE

# Рабочая копия ветки gh-pages: существующая — забираем, нет — создаём новую
REMOTE="https://github.com/$REPO.git"
WORK="$(mktemp -d)"
trap 'rm -rf "$TMP" "$WORK"' EXIT
if git ls-remote --exit-code --heads "$REMOTE" gh-pages >/dev/null 2>&1; then
  git clone -q --depth 1 --branch gh-pages "$REMOTE" "$WORK"
else
  git init -q "$WORK"
  git -C "$WORK" checkout -q -b gh-pages
fi

# Содержимое ветки = текущее демо (всё, кроме .git, заменяется)
find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$TMP"/. "$WORK"/

git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
  echo "→ изменений нет — публиковать нечего"
  exit 0
fi
git -C "$WORK" commit -q -m "Демо для показа: $(date '+%Y-%m-%d %H:%M')

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C "$WORK" push -q "$REMOTE" gh-pages
echo "→ опубликовано: $PAGES_URL (обновление Pages — около минуты)"
