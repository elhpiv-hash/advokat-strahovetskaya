// ==========================================================================
//  tools/build-directions.mjs — направления на главной
//  --------------------------------------------------------------------------
//  Источник — tools/directions.json. Скрипт пересобирает в index.html два
//  блока между метками:
//    <!-- directions:cards:start -->  … <!-- directions:cards:end -->
//        три карточки групп в разделе «Направления»;
//    <!-- directions:groups:start --> … <!-- directions:groups:end -->
//        три секции-группы: строки направлений слева, «Стоимость» справа.
//  Руками эти блоки не правят: следующий запуск build.sh их перезапишет.
//
//  Зачем генератор, а не готовая разметка: id строки — это адрес из рекламы,
//  ссылка из карточки и цели Метрики (sec_<id>, open_<id>). Из одного JSON
//  они не разойдутся, а смена порядка — перестановка строк в JSON.
//
//  Запуск: node tools/build-directions.mjs (его вызывает build.sh)
// ==========================================================================

import fs from 'node:fs';
import path from 'node:path';

// Корень проекта — от пути к самому скрипту (tools/…), а не от папки запуска
const root = path.resolve(path.dirname(process.argv[1]), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'tools/directions.json'), 'utf8'));
const indexFile = path.join(root, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');

// Запасные значения ссылок для работы без JS; main.js подставит их из SITE
const TEL = 'tel:+79112585934';
const WHATSAPP = 'https://wa.me/79112585934';

const fail = (msg) => { console.error('Ошибка: ' + msg); process.exit(1); };

// ----- Проверка данных -----

const ids = [];
for (const group of data.groups) {
  ids.push(group.id);
  if (!group.items || !group.items.length) fail(`в группе «${group.id}» нет строк`);
  if (!group.prices || !group.prices.length) fail(`в группе «${group.id}» нет цен`);
  for (const item of group.items) {
    ids.push(item.id);
    if (!item.title || !item.text || !item.points) fail(`у строки «${item.id}» нет title, text или points`);
    if (item.points.length < 3 || item.points.length > 4) console.warn(`  ! у «${item.id}» ${item.points.length} пунктов «что делаю» — по заданию 3–4`);
  }
}
for (const id of ids) {
  if (!/^[a-z0-9-]+$/.test(id)) fail(`якорь «${id}» — только латиница, цифры и дефис`);
}
if (new Set(ids).size !== ids.length) fail('один и тот же якорь встречается в directions.json дважды');

// ----- Типографика -----

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Короткое слово не остаётся в конце строки. Два прохода: в «и в суде»
// второе слово ловится только после того, как первое уже склеено.
const glueShort = (s) => s.replace(
  /(^|[\s(«;])(в|во|и|с|со|к|ко|о|об|у|на|по|за|из|от|до|не|ни|а|но|без|для|при|либо)\s/giu,
  '$1$2&nbsp;'
);

function typo(text) {
  let s = esc(text);
  s = glueShort(glueShort(s));
  return s
    .replace(/ — /g, '&nbsp;— ')                 // тире не начинает строку
    .replace(/ст\. (\d)/g, 'ст.&nbsp;$1')        // «ст. 228» не разрывается
    .replace(/(\d) УК РФ/g, '$1&nbsp;УК РФ')     // номер статьи не отрывается от «УК РФ»
    .replace(/УК РФ/g, 'УК&nbsp;РФ')
    .replace(/(\d) (\d{3})/g, '$1&nbsp;$2')       // «10 000»
    .replace(/ ₽/g, '&nbsp;₽')
    .replace(/ \/ /g, '&nbsp;/ ')
    .replace(/Санкт-Петербург[а-я]*/g, '<span class="nowrap">$&</span>');
}

const CHEVRON = '<svg class="case__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>';

// ----- Карточки групп (раздел «Направления») -----

const cards = data.groups.map((group) => {
  const links = group.items.map((item) => {
    const law = item.article ? ` <span class="area__law">${typo(item.article)}</span>` : '';
    return `            <li><a class="area__link" href="#${item.id}"><span class="area__name">${typo(item.title)}</span>${law}</a></li>`;
  }).join('\n');
  return [
    '        <li class="area">',
    `          <h3 class="area__title">${typo(group.title)}</h3>`,
    '          <ul class="area__list">',
    links,
    '          </ul>',
    `          <a class="area__more" href="#${group.id}">Цены и&nbsp;подробности</a>`,
    '        </li>'
  ].join('\n');
}).join('\n');

// ----- Секции групп -----

function photoFigure(group) {
  if (!group.photo) return '';
  // Фото — только если build-images.sh уже собрал его файлы: иначе на
  // странице была бы битая картинка
  const base = `assets/img/${group.photo}`;
  if (!fs.existsSync(path.join(root, `${base}.jpg`))) {
    console.warn(`  ! у «${group.id}» фото ${group.photo}, но ${base}.jpg нет — сначала bash build-images.sh; группа без фото`);
    return '';
  }
  const set = (ext) => `${base}-640.${ext} 640w, ${base}-1000.${ext} 1000w`;
  // Кадр виден только на десктопе (≥ 1024 px) и не шире 13rem
  return `
        <figure class="group__photo">
          <picture>
            <source type="image/avif" srcset="${set('avif')}" sizes="13rem">
            <source type="image/webp" srcset="${set('webp')}" sizes="13rem">
            <img src="${base}.jpg" width="1000" height="1250" alt="Адвокат Страховецкая Ева Рубиновна" loading="lazy" decoding="async">
          </picture>
        </figure>`;
}

const groups = data.groups.map((group, index) => {
  // Фон чередуется: белая, светло-серая, белая — соседние группы не сливаются
  const tone = index % 2 === 0 ? 'section--white' : 'section--stone';

  const rows = group.items.map((item) => {
    const law = item.article ? `\n                  <span class="case__law">${typo(item.article)}</span>` : '';
    const text = item.text.map(typo).join(' ');
    const points = item.points.map((p) => `                  <li>${typo(p)}</li>`).join('\n');
    return `          <li class="case" id="${item.id}">
            <details class="case__details">
              <summary class="case__head">
                <span class="case__name">
                  <span class="case__title">${typo(item.title)}</span>${law}
                </span>
                <span class="case__more"><span class="case__open">Подробнее</span><span class="case__close">Свернуть</span>${CHEVRON}</span>
              </summary>
              <div class="case__body">
                <p>${text}</p>
                <ul class="case__points" aria-label="Что делаю">
${points}
                </ul>
              </div>
            </details>
          </li>`;
  }).join('\n');

  const also = group.also ? `\n          <li class="case case--also">${typo(group.also)}</li>` : '';

  const prices = group.prices.map(([name, value]) => {
    const note = /\d/.test(value) ? '' : ' class="tariff__note"';
    return `            <div class="tariff__row"><dt>${typo(name)}</dt><dd${note}>${typo(value)}</dd></div>`;
  }).join('\n');

  return `    <!-- ${group.id} -->
    <section class="section group ${tone}" id="${group.id}" aria-labelledby="${group.id}-title">
      <div class="container group__inner">
        <div class="group__main">
          <h2 class="section__title" id="${group.id}-title">${typo(group.title)}</h2>
          <p class="group__lead">${group.lead.map(typo).join(' ')}</p>
          <ul class="cases">
${rows}${also}
          </ul>
        </div>

        <div class="group__aside">
        <aside class="tariff" aria-labelledby="${group.id}-prices">
          <h3 class="tariff__title" id="${group.id}-prices">${typo(group.pricesTitle)}</h3>
          <dl class="tariff__list">
${prices}
          </dl>
          <div class="tariff__actions">
            <a class="btn btn--primary" href="${TEL}" data-site="phone">Позвонить</a>
            <a class="btn btn--outline" href="${WHATSAPP}" data-site="whatsapp" target="_blank" rel="noopener">WhatsApp</a>
          </div>
        </aside>${photoFigure(group)}
        </div>
      </div>
    </section>`;
}).join('\n\n');

// ----- Запись -----

// Поиск меток через indexOf, а не RegExp: в шаблоне регулярки пришлось бы
// экранировать обратные слэши, а это частый источник тихих ошибок
function put(name, content) {
  const start = `<!-- directions:${name}:start -->`;
  const end = `<!-- directions:${name}:end -->`;
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < a) fail(`в index.html нет меток ${start} / ${end}`);
  // отступ закрывающей метки сохраняем как был
  const lineStart = html.lastIndexOf('\n', b) + 1;
  const indent = html.slice(lineStart, b);
  html = html.slice(0, a + start.length) + '\n' + content + '\n' + indent + html.slice(b);
}

put('cards', cards);
put('groups', groups);
fs.writeFileSync(indexFile, html);
const rowsCount = data.groups.reduce((n, g) => n + g.items.length, 0);
console.log(`  направления: ${data.groups.length} группы, ${rowsCount} строк с якорями`);
