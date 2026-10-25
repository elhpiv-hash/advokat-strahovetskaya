# Сайт адвоката Страховецкой Е. Р. — светлая версия под Яндекс.Директ

Статичный сайт без фреймворков: главная `index.html`, политика `privacy/index.html`,
страница ошибки `404.html`; стили `css/style.css`, скрипт `js/main.js`.
Хостинг — Apache, настройки в `.htaccess`. Дизайн-решения — в `DESIGN.md`.

## Сборка

```bash
bash build-images.sh   # фото (AVIF/WebP), документы, og-cover, favicon
bash build.sh          # направления, CSS/JS → *.min.*, домен, ?v=, CSP, sitemap, dist/ и zip
```

Нужен Node.js 18+; инструменты npx/npm скачивает сам, в проекте нет `node_modules`.
На сервер — содержимое **`dist/`** или **`advokat-strahovetskaya.zip`** (без `.git`,
README, `*.sh`, `tools/`, исходников фото и сканов).

## Настройки — где что менять

| Что | Где | После правки |
|---|---|---|
| Домен | `SITE_URL` в начале `build.sh` (сейчас `https://example.ru`) | `bash build.sh` |
| Яндекс.Метрика | `METRIKA_ID` в начале `js/main.js` (пусто — Метрики и плашки cookie нет) | `bash build.sh` |
| Яндекс.Вебмастер | `YANDEX_VERIFICATION` в `build.sh` — только значение `content` | `bash build.sh` |
| Ссылка на студию в подвале | `STUDIO_URL` в `build.sh` (пусто — просто текст) | `bash build.sh` |
| Телефон, мессенджеры, почта | объект `SITE` в `js/main.js` + запасные значения в разметке, JSON-LD и `tools/build-directions.mjs` | `bash build.sh` |
| Направления | `tools/directions.json` — группы, строки, тексты «Подробнее», цены групп, порядок | `bash build.sh` |

Шапка, подвал и плашка cookie повторены в трёх страницах (`index.html`,
`privacy/index.html`, `404.html`) — при правке меняйте все три.
У `404.html` пути от корня (`/css/…`): она открывается по любому адресу.

## Направления и реклама

Направления собраны в три группы — «Уголовные дела», «Семейные дела», «Другие
дела». У каждой строки направления свой якорь — это адрес для объявления в Директе:

```
https://example.ru/?utm_source=yandex&utm_medium=cpc&utm_campaign=…#narkotiki-228
```

| Группа (якорь) | Строки (якоря) |
|---|---|
| Уголовные дела `#ugolovnye-dela` | `#narkotiki-228` (ст. 228, 228.1), `#moshennichestvo` (мошенничество, кража, растрата, ст. 158–160), `#grabezh-razboy` (ст. 161, 162), `#tyazhkiy-vred` (ст. 111), `#poddelka-dokumentov` (ст. 327) |
| Семейные дела `#semeynye-dela` | `#razdel-imushchestva`, `#razvod`, `#alimenty`, `#opeka` (опека, усыновление, родительские права) |
| Другие дела `#drugie-dela` | `#administrativnye`, `#voennoe-pravo`, `#zashchita-potrebiteley` |

Переход по якорю строки (из рекламы — и с utm-метками, из карточек «Направлений»)
ставит строку ровно под шапку, раскрывает её «Подробнее» и подсвечивает на ~2 с;
после загрузки шрифтов скрипт доводит строку на место ещё раз (если человек сам
не начал листать). Без JS строку подсвечивает CSS (`:target`), «Подробнее» закрыто.

Разделы: `#napravleniya`, `#praktika`, `#ob-advokate`, `#stoimost`, `#proverka`,
`#otzyvy` (отзывы — правая колонка «Проверить адвоката»), `#kontakty`.

**Старые якоря** (версия 3) ещё работают — `main.js` (`ANCHOR_ALIASES`) ведёт их на
новое место, если элемента с таким id нет или он скрыт:

| Было | Стало |
|---|---|
| `#krazha` | `#moshennichestvo` (кража теперь в одной строке с мошенничеством) |
| `#ugolovnye-dela` | id группы «Уголовные дела» — алиас не нужен |
| `#otzyvy` | блок «Отзывы» в `#proverka` (если его уберут — `#proverka`) |
| `#usloviya` | `#stoimost` (условия работы теперь там) |
| `#obrazovanie` | `#ob-advokate`, пока «Образование» скрыто |

Карточки «Направлений» и секции групп собирает `tools/build-directions.mjs` из
`tools/directions.json` (его запускает `build.sh`): блоки между метками
`directions:cards:*` и `directions:groups:*` в `index.html` руками не правят.
Структура: `groups[]` — `id`, `title`, `lead`, `pricesTitle`, `prices`, `photo`,
`also` и `items[]` — `id`, `title`, `article`, `text`, `points[]`. Тексты строк сейчас
временные (из профиля на HARANT и прайса) — заменить текстами клиента, правя только
опечатки и разметку. Цены — только в таблицах групп и в общем прайсе «Стоимость
и условия», не в строках.

## Яндекс.Метрика и cookie

Метрика загружается только после кнопки «Понятно» в плашке о cookie; согласие —
в `localStorage` (ключ `cookie-consent`). Пока `METRIKA_ID` пуст, плашки нет:
без Метрики сайт cookie не ставит. На `/privacy/` есть кнопка «Отозвать согласие».

Цели — в Метрике создать цели типа **«JavaScript-событие»**:

| Идентификатор | Клик |
|---|---|
| `click_phone` | любая ссылка «Позвонить» / номер телефона |
| `click_whatsapp` | WhatsApp |
| `click_telegram` | Telegram |
| `click_email` | адрес почты |
| `sec_narkotiki_228`, `sec_moshennichestvo`, `sec_grabezh_razboy`, `sec_tyazhkiy_vred`, `sec_poddelka_dokumentov`, `sec_razdel_imushchestva`, `sec_razvod`, `sec_alimenty`, `sec_opeka`, `sec_administrativnye`, `sec_voennoe_pravo`, `sec_zashchita_potrebiteley` | переход по якорю строки: ссылка из рекламы (в т. ч. старый `#krazha` → `sec_moshennichestvo`) или клик в карточке «Направлений» |
| `open_narkotiki_228`, `open_moshennichestvo` … `open_zashchita_potrebiteley` (те же 12 id) | человек сам раскрыл «Подробнее» в строке; раскрытие по якорю сюда не считается |

Цели, достигнутые до согласия на cookie (переход из рекламы, пока на экране плашка),
не теряются: `main.js` держит их в очереди и отправляет после «Понятно».

## Фото

Исходники — в `assets/img/src/` (в git и на сервер не попадают). Сейчас там фото
клиента: `hero.jpg`, `about.jpg`, `extra-1…3.jpg` и `contacts-dark.jpg`.

- `hero.jpg` — фото первого экрана, целиком, с родным фоном (не вырезка).
  `build-images.sh` делает из него `hero-<ширина>.avif|webp` (640, 960, 1280,
  но не шире исходника) и запасной `hero.jpg`, с лёгкой резкостью (sharpen 0,5).
  Ширины, которые реально получились, скрипт сам вписывает в `srcset`
  и `<link rel="preload">` в `index.html`, размеры — в `width`/`height`.
  Сейчас исходник 860 × 1280 (похоже, пережат мессенджером) — файлов два:
  640 и 860.

  **Если клиент пришлёт оригинал крупнее:**
  1. Положите его вместо `assets/img/src/hero.jpg` (то же имя).
  2. `bash build-images.sh`, затем `bash build.sh`.
  3. Если это **тот же снимок** — больше ничего не нужно: кадр привязан к
     пропорциям, а не к пикселям. Если **другой снимок** — поправьте в
     `css/style.css` (`.hero__img`, медиазапрос ≥ 64em) коэффициент `.221`
     = строка макушки / ширина снимка (у текущего 190 / 860), а на телефоне —
     `object-position: 50% 18%`; и подберите фон `.hero` под стену снимка.
  Снимок шире 1280 px скрипт уменьшит до 1280. Апскейл нейросетью не нужен.
- `about.jpg` — «Об адвокате».
- `extra-1.jpg` … `extra-3.jpg` — фото групп направлений: поле `photo` группы в
  `tools/directions.json`. Кадр стоит под таблицей «Стоимость» и виден только на
  десктопе. Сейчас одно — `extra-3` в «Уголовных делах»: там правая колонка короче
  строк, и высота секции от фото не растёт. В «Семейных» и «Других» места нет.
- `contacts-dark.jpg` — фото в тёмных «Контактах».

Самая крупная версия — не шире исходника (снимки клиента ~720–910 px). Пропорции
`build-images.sh` сам вписывает в `width`/`height` у `<img>`; og-cover собирается
с портретом.

## Образование и квалификация

Сканы — в `assets/img/docs/src/`. Номера и серии размываются по координатам из
`tools/docs-blur.json` (доли ширины и высоты скана):

```json
{ "diplom.jpg": [[0.62, 0.08, 0.30, 0.05]] }
```

`bash build-images.sh` делает превью и крупные версии; документы вписать в список
`.docs` по образцу в комментарии и снять `hidden` у секции `#obrazovanie`.
Увеличение — нативный `<dialog>`: Esc, клик по фону, работа с клавиатуры.

## Демо для показа клиенту

```bash
bash tools/publish-pages.sh
```

Собирает сайт и публикует копию `dist/` в ветку `gh-pages`:
https://elhpiv-hash.github.io/advokat-strahovetskaya/ — с noindex и `Disallow: /`,
адреса — на Pages. Исходники и `dist/` при этом не меняются.
