#!/usr/bin/env bash
# ==========================================================================
#  build.sh — минификация и пересчёт CSP
#  --------------------------------------------------------------------------
#  css/style.css → css/style.min.css   (clean-css-cli 5)
#  js/main.js    → js/main.min.js      (terser 5)
#  sha256 встроенного <script> из index.html → CSP в .htaccess
#
#  Запуск:   bash build.sh
#  Нужен Node.js 18+ — npx сам скачает инструменты при первом запуске.
#  После правок в CSS/JS увеличьте ?v= у style.min.css и main.min.js
#  в index.html: статика кэшируется на год, без смены ?v= браузеры
#  постоянных посетителей покажут старую версию.
# ==========================================================================

set -euo pipefail

# Работаем из папки скрипта: пути не зависят от того, откуда его запустили
cd "$(dirname "$0")"

CSS_SRC="css/style.css"
CSS_MIN="css/style.min.css"
JS_SRC="js/main.js"
JS_MIN="js/main.min.js"

if ! command -v npx >/dev/null 2>&1; then
  echo "Ошибка: не найден npx. Установите Node.js 18+ (https://nodejs.org)." >&2
  exit 1
fi

for file in "$CSS_SRC" "$JS_SRC" index.html .htaccess; do
  [ -f "$file" ] || { echo "Ошибка: нет файла $file" >&2; exit 1; }
done

# Версии зафиксированы мажором (@5): сборка воспроизводима и не сломается
# от несовместимого релиза. --yes — не спрашивать подтверждение установки.

echo "→ CSS: clean-css"
# -O1 — только безопасные сокращения внутри правил. -O2 умеет сливать
# и переставлять правила, а это может незаметно поменять каскад.
npx --yes --package=clean-css-cli@5 cleancss -O1 -o "$CSS_MIN" "$CSS_SRC"

echo "→ JS: terser"
# passes=2 — второй проход находит то, что открылось после первого.
# Комментарии нужны в исходнике, а не в браузере.
npx --yes --package=terser@5 terser "$JS_SRC" \
  --compress passes=2 \
  --mangle \
  --comments false \
  --output "$JS_MIN"

echo "→ CSP: sha256 встроенного скрипта"
# Поменяли хоть символ во встроенном <script> — старый хеш перестанет
# совпадать, и браузер молча не выполнит скрипт. Поэтому хеш не правится
# руками, а пересчитывается при каждой сборке.
node - <<'NODE'
const fs = require('fs');
const crypto = require('crypto');

const html = fs.readFileSync('index.html', 'utf8');
// Только <script> без атрибутов: у JSON-LD есть type, у main.min.js — src
const inline = html.match(/<script>([\s\S]*?)<\/script>/);
if (!inline) {
  console.error('  Ошибка: в index.html нет встроенного <script>');
  process.exit(1);
}

const hash = "'sha256-" + crypto.createHash('sha256').update(inline[1], 'utf8').digest('base64') + "'";
const conf = fs.readFileSync('.htaccess', 'utf8');
const next = conf.replace(/'sha256-[A-Za-z0-9+/=]+'/, hash);

if (next === conf) {
  console.log('  без изменений: ' + hash);
} else {
  fs.writeFileSync('.htaccess', next);
  console.log('  обновлён в .htaccess: ' + hash);
}
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

fonts=0
for f in assets/fonts/*.woff2; do fonts=$((fonts + $(bytes "$f"))); done
printf '  %-20s %14s %14s %14s %10s\n' "assets/fonts" "$(kb "$fonts")" "-" "-" "-"

echo
echo "Готово. Если меняли CSS или JS — увеличьте ?v= в index.html."
