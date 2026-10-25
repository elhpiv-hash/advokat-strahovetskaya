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
| Секции направлений | `tools/directions.json` — тексты, пункты «что делаю», цены, порядок | `bash build.sh` |

Шапка, подвал и плашка cookie повторены в трёх страницах (`index.html`,
`privacy/index.html`, `404.html`) — при правке меняйте все три.
У `404.html` пути от корня (`/css/…`): она открывается по любому адресу.

## Направления и реклама

У каждого направления своя секция с якорем — это адрес для объявления в Директе:

```
https://example.ru/?utm_source=yandex&utm_medium=cpc&utm_campaign=…#narkotiki-228
```

Якоря: `#narkotiki-228`, `#moshennichestvo`, `#tyazhkiy-vred`, `#grabezh-razboy`,
`#krazha`, `#poddelka-dokumentov`, `#ugolovnye-dela`, `#razdel-imushchestva`,
`#razvod`, `#alimenty`, `#opeka`, `#administrativnye`, `#voennoe-pravo`,
`#zashchita-potrebiteley`. Ссылка открывает секцию ровно под шапкой; после загрузки
шрифтов скрипт доводит её на место ещё раз (если человек сам не начал листать).

Секции и оглавление собирает `tools/build-directions.mjs` из `tools/directions.json`
(его запускает `build.sh`): блоки между метками `directions:*` в `index.html` руками
не правят. Порядок секций — порядок `id` в `groups[].items`. Тексты сейчас временные
(из профиля на HARANT и прайса) — заменить текстами клиента из `assets/content/`,
правя только опечатки и разметку.

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
| `sec_narkotiki_228`, `sec_moshennichestvo`, `sec_tyazhkiy_vred`, `sec_grabezh_razboy`, `sec_krazha`, `sec_poddelka_dokumentov`, `sec_ugolovnye_dela`, `sec_razdel_imushchestva`, `sec_razvod`, `sec_alimenty`, `sec_opeka`, `sec_administrativnye`, `sec_voennoe_pravo`, `sec_zashchita_potrebiteley` | «Позвонить» или WhatsApp внутри секции этого направления (вместе с общей целью) |

## Фото

Исходники — в `assets/img/src/` (в git и на сервер не попадают). Сейчас там фото
клиента: `hero.jpg`, `about.jpg`, `extra-1…3.jpg` и `contacts-dark.jpg` (последний
не используется: по заданию — только для тёмной секции, а её на сайте нет).

- `hero.jpg` — портрет для первого экрана, фон вырезается:
  ```bash
  pip install "rembg[cpu]"
  python tools/cutout.py      # hero.jpg → hero-cutout.png
  bash build-images.sh
  ```
  Модель портретов (birefnet-portrait) видит только человека: книгу под руками
  она убирает, а кусок рамы стола оставляет. Поэтому в `tools/cutout.py` есть
  контуры `KEEP` (книга) и `REMOVE` (рама) в пикселях `hero.jpg` — для другого
  снимка их пересчитать. Маска rembg кешируется в `hero-mask.png` (повторный прогон —
  секунды); удалите её, если заменили `hero.jpg` тем же именем и датой.
- `about.jpg` — «Об адвокате».
- `extra-1.jpg` … `extra-3.jpg` — фото секций направлений: какая секция получает какое
  фото, задаёт поле `photo` в `tools/directions.json` (сейчас наркотики, мошенничество,
  раздел имущества).

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
