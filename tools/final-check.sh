#!/usr/bin/env bash
# ==========================================================================
#  tools/final-check.sh — проверка сайта https://advokateva.ru
#  --------------------------------------------------------------------------
#    bash tools/final-check.sh            после заливки: боевой сайт
#                                         (curl + браузер по настоящему домену)
#    bash tools/final-check.sh --files    до заливки: файлы сборки dist/ и архив
#                                         ../upload-advokateva.zip. Браузер
#                                         открывает dist/ под адресом
#                                         https://advokateva.ru — запросы к домену
#                                         подменяются файлами, сайт в сеть не ходит.
#
#  curl (только после заливки): коды ответа, перенаправления http→https,
#  www→без www, /index.html→/ одним шагом, robots.txt, sitemap.xml,
#  закрытые служебные файлы, своя страница 404, заголовки кэша.
#  Файлы (до заливки): robots.txt, sitemap.xml, правила .htaccess, нет
#  следов превью и чужого домена, все ссылки на файлы существуют,
#  архив совпадает с dist/ и не содержит лишнего.
#  Браузер (оба режима): title, description, один H1, canonical, og,
#  JSON-LD, noindex только на 404, картинки, якоря направлений из рекламы,
#  Метрика — до согласия не грузится, после кнопки — init без Вебвизора
#  и цели phone/whatsapp/max/email/vk_click; нет Telegram; нет
#  горизонтальной прокрутки на 375/390/768/1440; ошибки консоли.
#
#  Ничего не меняет ни в файлах, ни на хостинге. В Метрику ничего не
#  уходит: tag.js подменяется пустой заглушкой, вызовы ym() проверяются
#  по очереди window.ym.a. Пока номер счётчика не вписан, логика Метрики
#  проверяется на исходном js/main.js с тестовым номером 12345678.
#
#  Результат: reports/final-check/<режим>_<дата_время>/report.md (+ shots/).
#  Код выхода 1, если есть ошибки.
#
#  Нужны: bash, curl, node 18+, Google Chrome. Playwright ставится один раз
#  в ~/.cache/strahovetskaya-tools (другое место — переменная FINAL_CHECK_DEPS).
# ==========================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="live"
[ "${1:-}" = "--files" ] && MODE="files"
PROD="https://advokateva.ru"
ZIP="$ROOT/../upload-advokateva.zip"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="${FINAL_CHECK_OUT:-$ROOT/reports/final-check/${MODE}_$STAMP}"
DEPS="${FINAL_CHECK_DEPS:-$HOME/.cache/strahovetskaya-tools}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

# В Git Bash на Windows node не понимает пути вида /c/Users/…
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

mkdir -p "$OUT/raw" "$OUT/shots"

if [ ! -d "$DEPS/node_modules/playwright" ]; then
  echo "Ставлю Playwright в $DEPS (один раз)…"
  mkdir -p "$DEPS"
  [ -f "$DEPS/package.json" ] || echo '{"name":"strahovetskaya-tools","private":true}' > "$DEPS/package.json"
  # Браузер не скачиваем: используется установленный Google Chrome
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$DEPS" --no-audit --no-fund --silent playwright@1.64.1
fi

FAILS=0
MD="$OUT/curl.md"
: > "$MD"

if [ "$MODE" = "files" ]; then
  [ -f "$ROOT/dist/index.html" ] || { echo "Нет dist/ — сначала bash build.sh" >&2; exit 1; }
  [ -f "$ZIP" ] || { echo "Нет $ZIP — сначала bash build.sh" >&2; exit 1; }
else
  # ---------- curl: коды, перенаправления, заголовки ----------
  printf '## Ответы сервера\n\n| | Адрес | Ожидается | Получено |\n|---|---|---|---|\n' > "$MD"
  # row ИМЯ АДРЕС ОЖИДАЕМЫЙ_КОД [ОЖИДАЕМЫЙ_LOCATION]
  row() {
    local name="$1" url="$2" expect="$3" want_loc="${4:-}" hdr="$OUT/raw/$1.headers" code loc ok="✓"
    code="$(curl -sS -o "$OUT/raw/$1.body" -D "$hdr" -A "$UA" --max-time 30 -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
    loc="$(grep -i '^location:' "$hdr" 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r' || true)"
    if ! printf '%s' "$code" | grep -Eq "^($expect)$"; then ok="✗"; fi
    if [ -n "$want_loc" ] && [ "$loc" != "$want_loc" ]; then ok="✗"; fi
    [ "$ok" = "✗" ] && FAILS=$((FAILS + 1))
    printf '| %s | %s | %s%s | %s%s |\n' "$ok" "$url" "$expect" "${want_loc:+ → $want_loc}" "$code" "${loc:+ → $loc}" >> "$MD"
    printf '  %s %-15s %s %s\n' "$ok" "$name" "$code" "${loc:+→ $loc}"
  }
  note() { printf '| %s | %s | | |\n' "$1" "$2" >> "$MD"; [ "$1" = "✗" ] && FAILS=$((FAILS + 1)); printf '  %s %s\n' "$1" "$2"; }

  echo "curl: $PROD"
  row home         "$PROD/"                        200
  row privacy      "$PROD/privacy/"                200
  row robots       "$PROD/robots.txt"              200
  row sitemap      "$PROD/sitemap.xml"             200
  row favicon      "$PROD/favicon.ico"             200
  row apple-icon   "$PROD/apple-touch-icon.png"    200
  row og-cover     "$PROD/assets/img/og-cover.jpg" 200
  row css          "$PROD/css/style.min.css"       200
  row js           "$PROD/js/main.min.js"          200
  row not-found    "$PROD/nope-404-check/"         404
  grep -q 'Страница не' "$OUT/raw/not-found.body" && note "✓" "страница 404 — своя" || note "✗" "страница 404 — своя"

  row http-root    "http://advokateva.ru/"               301 "$PROD/"
  row www-root     "https://www.advokateva.ru/"         301 "$PROD/"
  row http-www     "http://www.advokateva.ru/"          301 "$PROD/"
  row http-path    "http://advokateva.ru/privacy/"      301 "$PROD/privacy/"
  row index-html   "$PROD/index.html"                   301 "$PROD/"
  row privacy-idx  "$PROD/privacy/index.html"           301 "$PROD/privacy/"
  row utm          "$PROD/?utm_source=check"            200
  hops="$(curl -sS -o /dev/null -L --max-redirs 10 -A "$UA" -w '%{num_redirects} %{http_code} %{url_effective}' "http://www.advokateva.ru/index.html?utm_source=check" 2>/dev/null || echo 'err')"
  if [ "${hops%% *}" = "1" ]; then note "✓" "http://www…/index.html → один шаг: $hops"; else note "!" "http://www…/index.html — шагов: $hops"; fi

  row deny-htaccess "$PROD/.htaccess"                  '403|404'
  row deny-readme   "$PROD/README.md"                  '403|404'
  row deny-build    "$PROD/build.sh"                   '403|404'
  row deny-tools    "$PROD/tools/final-check.sh"       '403|404'
  row deny-zip      "$PROD/upload-advokateva.zip"      '403|404'
  row deny-src      "$PROD/assets/img/src/hero.jpg"    '403|404'
  row deny-git      "$PROD/.git/HEAD"                  '403|404'

  if grep -qi '^cache-control:.*max-age' "$OUT/raw/css.headers"; then note "✓" "кэш статики: $(grep -i '^cache-control:' "$OUT/raw/css.headers" | tr -d '\r')"; else note "!" "у CSS нет Cache-Control с max-age"; fi
  if grep -qi '^cache-control:.*no-cache' "$OUT/raw/home.headers"; then note "✓" "HTML сверяется с сервером (no-cache)"; else note "!" "у HTML нет Cache-Control: no-cache"; fi
  grep -q "^Sitemap: $PROD/sitemap.xml" "$OUT/raw/robots.body" && ! grep -q '^Disallow: /$' "$OUT/raw/robots.body" \
    && note "✓" "robots.txt: индексация разрешена, указан sitemap" || note "✗" "robots.txt: индексация разрешена, указан sitemap"
fi

# ---------- Файлы и браузер ----------
export NODE_OPTIONS="--dns-result-order=ipv4first ${NODE_OPTIONS:-}"
set +e
MODE="$MODE" PROD="$PROD" OUT="$(winpath "$OUT")" ROOT="$(winpath "$ROOT")" DEPS="$(winpath "$DEPS")" ZIP="$(winpath "$ZIP")" CURL_FAILS="$FAILS" \
  node "$ROOT/tools/final-check.mjs"
NODE_EXIT=$?
set -e

echo
echo "Отчёт: $OUT/report.md"
if [ "$FAILS" -gt 0 ] || [ "$NODE_EXIT" -ne 0 ]; then exit 1; fi
