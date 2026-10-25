// ==========================================================================
//  tools/build-directions.mjs — секции направлений и оглавление на главной
//  --------------------------------------------------------------------------
//  Источник — tools/directions.json. Скрипт пересобирает в index.html два
//  блока между метками:
//    <!-- directions:toc:start -->      … <!-- directions:toc:end -->
//    <!-- directions:sections:start --> … <!-- directions:sections:end -->
//  Руками эти блоки не правят: следующий запуск build.sh их перезапишет.
//
//  Зачем генератор, а не готовая разметка: у 14 секций один скелет, а якорь
//  каждой — это адрес из рекламы, ссылка из оглавления и цель Метрики.
//  Из одного JSON они не разойдутся, а смена порядка — перестановка id.
//
//  Запуск: node tools/build-directions.mjs (его вызывает build.sh)
// ==========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'tools/directions.json'), 'utf8'));
const indexFile = path.join(root, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');

// Запасные значения ссылок для работы без JS; main.js подставит их из SITE
const TEL = 'tel:+79112585934';
const WHATSAPP = 'https://wa.me/79112585934';

const fail = (msg) => { console.error('Ошибка: ' + msg); process.exit(1); };

// ----- Проверка данных -----

const order = data.groups.flatMap((group) => group.items);
const known = Object.keys(data.directions);
for (const id of order) {
  if (!data.directions[id]) fail(`в groups есть «${id}», а в directions его нет`);
  if (!/^[a-z0-9-]+$/.test(id)) fail(`якорь «${id}» — только латиница, цифры и дефис`);
}
for (const id of known) {
  if (!order.includes(id)) fail(`направление «${id}» не стоит ни в одной группе`);
}
if (new Set(order).size !== order.length) fail('один и тот же якорь стоит в groups дважды');
for (const id of order) {
  const d = data.directions[id];
  if (!data.prices[d.prices]) fail(`у «${id}» набор цен «${d.prices}», а в prices его нет`);
  if (d.points.length < 3 || d.points.length > 5) console.warn(`  ! у «${id}» ${d.points.length} пунктов «что делаю» — по заданию 3–5`);
}

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
    .replace(/Санкт-Петербург[а-я]*/g, '<span class="nowrap">$&</span>');
}

// ----- Оглавление -----

const toc = data.groups.map((group) => {
  const links = group.items.map((id) => {
    const d = data.directions[id];
    const law = d.law ? ` <span class="toc__law">${typo(d.law)}</span>` : '';
    return `          <li><a class="toc__link" href="#${id}"><span class="toc__name">${typo(d.toc)}</span>${law}</a></li>`;
  }).join('\n');
  return [
    '      <div class="toc__group">',
    `        <h3 class="toc__title">${typo(group.title)}</h3>`,
    '        <ul class="toc__list">',
    links,
    '        </ul>',
    '      </div>'
  ].join('\n');
}).join('\n');

// ----- Секции -----

const sections = order.map((id, index) => {
  const d = data.directions[id];
  // Фон чередуется: граница между запросами видна без линий-разделителей
  const tone = index % 2 === 0 ? 'section--white' : 'section--stone';
  const text = d.text.map((p) => `            <p>${typo(p)}</p>`).join('\n');
  const points = d.points.map((p) => `            <li>${typo(p)}</li>`).join('\n');
  const prices = data.prices[d.prices].map(([name, value]) => {
    const note = /\d/.test(value) ? '' : ' class="direction__note"';
    return `            <div><dt>${typo(name)}</dt><dd${note}>${typo(value)}</dd></div>`;
  }).join('\n');

  return `    <!-- ${id} -->
    <section class="section direction ${tone}" id="${id}" aria-labelledby="${id}-title" data-direction="${id}">
      <div class="container direction__inner">
        <h2 class="direction__title" id="${id}-title">${typo(d.title)}</h2>
        <div class="direction__body">
          <div class="direction__text">
${text}
          </div>
          <ul class="direction__points" aria-label="Что делаю">
${points}
          </ul>
        </div>
        <div class="direction__offer">
          <dl class="direction__prices">
${prices}
          </dl>
          <div class="direction__actions">
            <a class="btn btn--primary" href="${TEL}" data-site="phone">Позвонить</a>
            <a class="btn btn--outline" href="${WHATSAPP}" data-site="whatsapp" target="_blank" rel="noopener">WhatsApp</a>
          </div>
        </div>
      </div>
    </section>`;
}).join('\n\n');

if (order.length % 2 === 1) {
  console.warn('  ! нечётное число направлений: последняя секция белая, как и «Об адвокате» после неё — поменяйте фон «Об адвокате»');
}

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

put('toc', toc);
put('sections', sections);
fs.writeFileSync(indexFile, html);
console.log(`  направления: ${order.length} секций, оглавление — ${data.groups.length} группы`);
