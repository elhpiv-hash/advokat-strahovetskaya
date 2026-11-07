// Браузерная и файловая часть проверки сайта. Запускается из
// tools/final-check.sh, который передаёт MODE (live | files), PROD, OUT,
// ROOT, DEPS, ZIP, CURL_FAILS через окружение.
//
// MODE=files — «до заливки»: браузер открывает https://advokateva.ru, но
// все запросы к домену отдаются из dist/ (как отдал бы Apache: каталог →
// index.html, нет файла → 404.html с кодом 404). Внешние запросы (карта,
// MAX, Метрика) не уходят.
// MODE=live — боевой сайт; перехватывается только Метрика.

import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const MODE = process.env.MODE || 'live';
const FILES = MODE === 'files';
const PROD = (process.env.PROD || 'https://advokateva.ru').replace(/[/]$/, '');
const OUT = process.env.OUT || '.';
const ROOT = process.env.ROOT || '.';
const DEPS = process.env.DEPS;
const ZIP = process.env.ZIP;
const DIST = join(ROOT, 'dist');
const TEST_ID = '12345678';
const require = createRequire(join(DEPS, 'package.json'));
const { chromium } = require('playwright');

mkdirSync(join(OUT, 'shots'), { recursive: true });

const results = [];
const add = (group, name, status, note = '') => {
  results.push({ group, name, status, note });
  const mark = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗';
  console.log(`  ${mark} ${group}: ${name}${note ? ' — ' + note : ''}`);
};
const check = (group, name, ok, note = '', soft = false) => add(group, name, ok ? 'PASS' : soft ? 'WARN' : 'FAIL', note);
// \s в JS — и неразрывный пробел тоже (в подвале «в&nbsp;студии»)
const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

const ROWS = ['narkotiki-228', 'moshennichestvo', 'droppery', 'grabezh-razboy', 'tyazhkiy-vred', 'poddelka-dokumentov',
  'razdel-imushchestva', 'razvod', 'alimenty', 'opeka', 'administrativnye', 'voennoe-pravo', 'zashchita-potrebiteley'];
const GOALS = [
  ['phone_click', '#hero-actions a[href^="tel:"]'],
  ['whatsapp_click', '#hero-actions a[href*="wa.me/"]'],
  ['max_click', '#hero-actions a[data-site="max"]'],
  ['email_click', '#kontakty a[href^="mailto:"]'],
  ['vk_click', '#kontakty a[data-site="vk"]']
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const listFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? listFiles(p) : [relative(DIST, p).split('\\').join('/')];
});

// ---------- 1. Файлы (до заливки) ----------
if (FILES) {
  const G = 'Файлы';
  const read = (rel) => readFileSync(join(DIST, rel), 'utf8');
  const distFiles = listFiles(DIST).sort();

  const robots = read('robots.txt').split(/\r?\n/).filter(Boolean);
  check(G, 'robots.txt: User-agent: *, Allow: /, Sitemap', robots.join('|') === `User-agent: *|Allow: /|Sitemap: ${PROD}/sitemap.xml`, robots.join(' | '));

  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<[/]loc>/g)].map((m) => m[1]);
  check(G, 'sitemap.xml: только адреса advokateva.ru', locs.length === 2 && locs.every((l) => l.startsWith(PROD + '/')), locs.join(', '));
  check(G, 'sitemap.xml: lastmod у каждого адреса', (sitemap.match(/<lastmod>/g) || []).length === locs.length);

  const ht = read('.htaccess');
  const has = (re) => re.test(ht);
  check(G, '.htaccess: http → https на https://advokateva.ru', has(/RewriteCond %[{]ENV:EVA_HTTPS[}] !=1/) && has(/RewriteRule [\^] https:[/][/]advokateva[.]ru%[{]REQUEST_URI[}] [[]R=301/));
  check(G, '.htaccess: www → без www', has(/RewriteCond %[{]HTTP_HOST[}] [\^]www/));
  check(G, '.htaccess: /index.html → / через THE_REQUEST, сразу на домен', has(/THE_REQUEST/) && has(/RewriteRule [\^] https:[/][/]advokateva[.]ru[/]%1 [[]R=301/));
  check(G, '.htaccess: признаки https за прокси (X-Forwarded-Proto, порт 443)', has(/X-Forwarded-Proto/) && has(/SERVER_PORT[}] =443/));
  check(G, '.htaccess: служебные файлы закрыты (md, sh, zip, sql, bak, ~, README, .git)', ht.includes('<FilesMatch "(?i)(^') && ['sh', 'md', 'zip', 'sql', 'bak'].every((e) => ht.includes('|' + e) || ht.includes('(' + e)) && has(/~[$]/) && has(/readme/));
  check(G, '.htaccess: кэш статики и no-cache для HTML', has(/max-age=31536000, immutable/) && has(/Cache-Control "no-cache"/) && has(/ExpiresActive On/));
  check(G, '.htaccess: своя страница 404', has(/ErrorDocument 404 [/]404[.]html/));
  check(G, '.htaccess: CSP с хешем встроенного скрипта', has(/'sha256-[A-Za-z0-9+/=]+'/));

  const textFiles = distFiles.filter((f) => /[.](html|css|js|txt|xml)$/.test(f) || f === '.htaccess');
  const hits = (re) => textFiles.filter((f) => re.test(read(f)));
  check(G, 'нет следов превью и прежнего адреса (github.io, example.ru, /advokat-strahovetskaya/)', hits(/github[.]io|example[.]ru|[/]advokat-strahovetskaya[/]/).length === 0, hits(/github[.]io|example[.]ru|[/]advokat-strahovetskaya[/]/).join(', '));
  check(G, 'noindex только на 404.html', hits(/noindex|nofollow/).join(',') === '404.html', hits(/noindex|nofollow/).join(', '));
  check(G, 'нет Telegram', hits(/telegram|t[.]me[/]/i).length === 0, hits(/telegram|t[.]me[/]/i).join(', '));
  check(G, 'нет <noscript> (Метрика без пикселя)', hits(/<noscript/i).length === 0);

  // Все локальные ссылки на файлы из HTML и CSS существуют в dist/
  const missing = [];
  for (const page of ['index.html', 'privacy/index.html', '404.html']) {
    // ссылки внутри HTML-комментариев (заготовка блока «Образование») не считаем
    const html = read(page).replace(/<!--[^]*?-->/g, '');
    const base = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : '';
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g), ...html.matchAll(/srcset="([^"]+)"/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim().split(' ')[0]))
      .filter((u) => u && !/^(https?:|mailto:|tel:|data:|[/][/])/.test(u));
    for (const u of refs) {
      const clean = u.split('?')[0];
      let rel = clean.startsWith('/') ? clean.slice(1) : join(base, clean).split('\\').join('/');
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      if (!existsSync(join(DIST, rel))) missing.push(`${page}: ${u}`);
    }
  }
  const css = read('css/style.min.css');
  for (const m of css.matchAll(/url[(]['"]?([^'")]+)['"]?[)]/g)) {
    if (/^data:/.test(m[1])) continue;
    const rel = join('css', m[1]).split('\\').join('/');
    if (!existsSync(join(DIST, rel))) missing.push(`style.min.css: ${m[1]}`);
  }
  check(G, 'все файлы, на которые ссылаются страницы и стили, есть в сборке', missing.length === 0, missing.slice(0, 6).join('; '));

  // Архив: состав = dist/, ничего лишнего
  const buf = readFileSync(ZIP);
  const entries = [];
  let pos = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(pos + 10);
  let p = buf.readUInt32LE(pos + 16);
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const size = buf.readUInt32LE(p + 24);
    entries.push({ name, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const zipNames = entries.map((e) => e.name).sort();
  check(G, `архив upload-advokateva.zip = dist/ (${zipNames.length} файлов)`, JSON.stringify(zipNames) === JSON.stringify(distFiles),
    zipNames.filter((n) => !distFiles.includes(n)).concat(distFiles.filter((n) => !zipNames.includes(n)).map((n) => 'нет в архиве: ' + n)).join(', '));
  const sameBytes = entries.every((e) => {
    const nl = buf.readUInt16LE(e.local + 26), xl = buf.readUInt16LE(e.local + 28), csize = buf.readUInt32LE(e.local + 18);
    const data = inflateRawSync(buf.subarray(e.local + 30 + nl + xl, e.local + 30 + nl + xl + csize));
    return existsSync(join(DIST, e.name)) && data.equals(readFileSync(join(DIST, e.name)));
  });
  check(G, 'файлы в архиве побайтно совпадают с dist/', sameBytes);
  check(G, 'в архиве нет служебного (md, sh, mjs, src/, tools/, .git)', !zipNames.some((n) => /[.](md|sh|mjs|zip)$|(^|[/])(src|tools|\.git)[/]/.test(n)));
  check(G, 'в архиве пути от корня сайта (index.html, .htaccess в корне)', zipNames.includes('index.html') && zipNames.includes('.htaccess') && zipNames.includes('privacy/index.html'));
  check(G, 'ЗАЛИВКА.md лежит в проекте', existsSync(join(ROOT, 'ЗАЛИВКА.md')));
}

// ---------- 2. Браузер ----------
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
} catch (e) {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/kyzne/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
}

const SRC_METRIKA = /const METRIKA_ID = '([^']*)'/.exec(readFileSync(join(ROOT, 'js/main.js'), 'utf8'))[1];

async function newContext({ testMetrika = false, viewport = { width: 1440, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU' });
  const log = { metrika: [], errors: [], status: {} };
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (/mc[.]yandex[.](ru|com)$/.test(url.hostname)) {
      log.metrika.push(url.href);
      if (url.pathname.endsWith('/metrika/tag.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* заглушка tag.js */' });
      return route.abort();
    }
    // Логика Метрики, пока номер не вписан: исходный main.js с тестовым номером
    if (testMetrika && !SRC_METRIKA && url.origin === PROD && url.pathname === '/js/main.min.js') {
      const body = readFileSync(join(ROOT, 'js/main.js'), 'utf8').replace("const METRIKA_ID = '';", `const METRIKA_ID = '${TEST_ID}';`);
      return route.fulfill({ status: 200, contentType: 'text/javascript', body });
    }
    if (FILES) {
      if (url.origin !== PROD) return route.abort();
      let rel = decodeURIComponent(url.pathname).slice(1);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      let file = join(DIST, rel);
      let status = 200;
      if (!existsSync(file) || statSync(file).isDirectory()) { file = join(DIST, '404.html'); status = 404; }
      return route.fulfill({ status, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    }
    if (url.origin !== PROD) return route.abort();
    return route.continue();
  });
  ctx.on('page', (pg) => {
    pg.on('pageerror', (e) => log.errors.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error' && !/404 [(]Not Found[)]|status of 404/.test(m.text())) log.errors.push(m.text()); });
  });
  return { ctx, log };
}

// --- страницы: заголовки, canonical, og, JSON-LD, картинки ---
{
  const { ctx, log } = await newContext();
  const page = await ctx.newPage();
  for (const [path, canon, isHome, is404] of [['/', PROD + '/', true, false], ['/privacy/', PROD + '/privacy/', false, false], ['/nope-404-check/', null, false, true]]) {
    const G = `Страница ${path}`;
    const resp = await page.goto(PROD + path, { waitUntil: 'load' });
    check(G, 'код ответа', resp.status() === (is404 ? 404 : 200), String(resp.status()));
    const info = await page.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content || '',
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent),
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      studio: document.querySelector('.footer__studio')?.textContent || ''
    }));
    check(G, 'title', info.title.length > 10, norm(info.title));
    check(G, 'один H1', info.h1.length === 1, norm(info.h1[0]));
    check(G, 'подвал: «Сайт сделан в студии elhpiv»', norm(info.studio) === 'Сайт сделан в студии elhpiv');
    if (is404) {
      check(G, 'noindex на странице ошибки', /noindex/.test(info.robots));
      continue;
    }
    check(G, 'description', info.desc.length > 50, `${info.desc.length} симв.`);
    check(G, 'canonical на боевой адрес', info.canonical === canon, info.canonical);
    check(G, 'нет noindex/nofollow', !/noindex|nofollow/.test(info.robots));
    if (isHome) {
      check(G, 'og:url и og:image на домене', info.ogUrl === PROD + '/' && info.ogImage === PROD + '/assets/img/og-cover.jpg', `${info.ogUrl} | ${info.ogImage}`);
      // fetch из страницы: до заливки он идёт через подмену файлами, а не в сеть
      const status = (u) => page.evaluate((u) => fetch(u, { redirect: 'manual' }).then((r) => r.status, () => 0), u);
      const ogStatus = await status(info.ogImage);
      check(G, 'og:image открывается', ogStatus === 200, String(ogStatus));
      let ld = null;
      try { ld = JSON.parse(info.ld[0]); } catch (e) {}
      check(G, 'JSON-LD разбирается', !!ld);
      if (ld) {
        check(G, 'JSON-LD: url и image на домене', ld.url === PROD + '/' && ld.image === PROD + '/assets/img/og-cover.jpg', `${ld.url} | ${ld.image}`);
        check(G, 'JSON-LD: sameAs с профилем MAX, без Telegram', (ld.sameAs || []).some((u) => u.includes('max.ru/')) && !(ld.sameAs || []).some((u) => /t[.]me/.test(u)));
        check(G, 'JSON-LD: areaServed', (ld.areaServed || []).length === 4, (ld.areaServed || []).join(', '));
      }
      // картинки: alt, размеры, загрузка (после прокрутки до конца)
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
      await page.waitForTimeout(800);
      const imgs = await page.evaluate(() => [...document.images].filter((i) => i.offsetParent !== null).map((i) => ({ src: i.currentSrc || i.src, alt: i.getAttribute('alt'), w: i.getAttribute('width'), h: i.getAttribute('height'), ok: i.complete && i.naturalWidth > 0 })));
      check(G, `картинки: alt и width/height (${imgs.length})`, imgs.every((i) => i.alt !== null && i.w && i.h));
      check(G, 'картинки загружаются', imgs.every((i) => i.ok), imgs.filter((i) => !i.ok).map((i) => i.src).join(', '));
      const links = await page.evaluate((prod) => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => h.startsWith(prod)).map((h) => h.split('#')[0]))], PROD);
      const bad = [];
      for (const l of links) { const st = await status(l); if (st !== 200) bad.push(`${l} ${st || 'нет ответа'}`); }
      check(G, `внутренние ссылки открываются (${links.length})`, bad.length === 0, bad.join('; '));
      const tg = await page.evaluate(() => /telegram|t[.]me[/]/i.test(document.documentElement.outerHTML));
      check(G, 'нет Telegram', !tg);
      const max = await page.evaluate(() => [...document.querySelectorAll('[data-site="max"]')].map((a) => ({ tag: a.tagName, href: a.getAttribute('href') || '', t: a.target, rel: a.rel })));
      check(G, 'MAX: ссылки на профиль, в новой вкладке', max.length >= 4 && max.every((m) => m.tag === 'A' && m.href.includes('max.ru/') && m.t === '_blank' && m.rel === 'noopener'), `${max.length} шт.`);
    }
  }
  check('Консоль', 'нет ошибок на страницах', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// --- якоря направлений из рекламы ---
{
  const G = 'Якоря';
  const { ctx } = await newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const bad = [];
  for (const id of [...ROWS, 'krazha']) {
    await page.goto(`${PROD}/?utm_source=yandex&utm_medium=cpc#${id}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    const r = await page.evaluate((id) => {
      const el = document.getElementById(id === 'krazha' ? 'moshennichestvo' : id);
      const top = el.getBoundingClientRect().top, head = document.querySelector('.header').getBoundingClientRect().bottom;
      return { ok: el.querySelector('details').open && el.classList.contains('is-flash') && top >= head - 1 && top <= head + 24, top, head };
    }, id);
    if (!r.ok) bad.push(`${id} (верх ${Math.round(r.top)}, шапка ${Math.round(r.head)})`);
  }
  check(G, `${ROWS.length} строк и старый #krazha: под шапкой, раскрыты, подсвечены`, bad.length === 0, bad.join(', '));
  await ctx.close();
}

// --- Метрика ---
{
  const G = 'Метрика';
  if (!SRC_METRIKA) add(G, 'номер счётчика в js/main.js', 'WARN', 'плейсхолдер пуст — плашки и Метрики на сайте не будет, пока номер не вписан; логика проверена с тестовым номером');
  else check(G, 'номер счётчика в js/main.js', /^[0-9]+$/.test(SRC_METRIKA), SRC_METRIKA);
  const { ctx, log } = await newContext({ testMetrika: true });
  const page = await ctx.newPage();
  await page.goto(PROD + '/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  check(G, 'до согласия запросов к mc.yandex.ru нет', log.metrika.length === 0, log.metrika.slice(0, 2).join(', '));
  const banner = await page.evaluate(() => { const b = document.querySelector('[data-cookie]'); return b && !b.hidden ? norm(b.textContent) : ''; function norm(t) { return t.replace(/\s+/g, ' ').trim(); } });
  check(G, 'плашка cookie видна, есть ссылка на политику', /cookie/.test(banner) && /Политик/.test(banner), banner.slice(0, 90));
  await page.screenshot({ path: join(OUT, 'shots', 'cookie-1440.png') });
  await page.click('[data-cookie-accept]');
  await page.waitForTimeout(500);
  const id = SRC_METRIKA || TEST_ID;
  check(G, `после кнопки загружается tag.js?id=${id}`, log.metrika.some((u) => u.includes('/metrika/tag.js?id=' + id)), log.metrika.filter((u) => u.includes('tag.js')).join(', '));
  const init = await page.evaluate(() => (window.ym && window.ym.a ? [...window.ym.a].find((a) => a[1] === 'init') : null));
  const o = init && init[2] ? init[2] : {};
  // Параметры — как в коде счётчика из кабинета, строго без webvisor и ecommerce
  check(G, `init(${init ? init[0] : '—'}): ssr, clickmap, referrer, url, accurateTrackBounce, trackLinks; без webvisor и ecommerce`,
    !!init && String(init[0]) === id && o.ssr === true && o.clickmap === true && 'referrer' in o && typeof o.url === 'string' && o.url.startsWith(PROD)
      && o.accurateTrackBounce === true && o.trackLinks === true && !('webvisor' in o) && !('ecommerce' in o),
    JSON.stringify(o));
  await page.evaluate(() => document.addEventListener('click', (e) => { if (e.target.closest('a[href^="tel:"], a[href^="mailto:"], a[target="_blank"]')) e.preventDefault(); }, true));
  for (const [goal, sel] of GOALS) {
    await page.$eval(sel, (a) => a.click());
    const got = await page.evaluate((g) => [...window.ym.a].some((a) => a[1] === 'reachGoal' && a[2] === g), goal);
    check(G, `цель ${goal}`, got, sel);
  }
  const html = await page.content();
  check(G, 'нет <noscript>', !/<noscript/i.test(html));
  await ctx.close();
}

// --- адаптив и снимки ---
{
  const G = 'Экраны';
  for (const [w, h] of [[375, 812], [390, 844], [768, 1024], [1440, 900]]) {
    const { ctx, log } = await newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(PROD + '/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      call: Math.round(document.querySelector('#hero-actions .btn--primary').getBoundingClientRect().bottom)
    }));
    check(G, `${w}×${h}: нет горизонтальной прокрутки`, r.overflow <= 0, `${r.overflow} px`);
    if (w < 768) check(G, `${w}×${h}: «Позвонить» в первом экране`, r.call <= h, `низ ${r.call}`);
    await page.screenshot({ path: join(OUT, 'shots', `${w}-первый-экран.png`) });
    check(G, `${w}×${h}: нет ошибок в консоли`, log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

await browser.close();

// ---------- отчёт ----------
const fail = results.filter((r) => r.status === 'FAIL').length;
const warn = results.filter((r) => r.status === 'WARN').length;
const pass = results.filter((r) => r.status === 'PASS').length;
const curlMd = existsSync(join(OUT, 'curl.md')) ? readFileSync(join(OUT, 'curl.md'), 'utf8') : '';
const curlFails = Number(process.env.CURL_FAILS || 0);
const md = [
  `# final-check advokateva.ru — ${FILES ? 'до заливки (файлы сборки)' : 'боевой сайт'}`,
  '',
  `Дата: ${new Date().toLocaleString('ru-RU')}. ${FILES ? 'Браузер открывал dist/ под адресом ' + PROD + ' (запросы подменялись файлами).' : 'Адрес: ' + PROD + '.'}`,
  `Итог: ${pass} пройдено, ${warn} замечаний, ${fail} ошибок${curlFails ? `, ошибок curl: ${curlFails}` : ''}.`,
  '',
  curlMd,
  '## Проверки',
  '',
  '| | Группа | Проверка | Примечание |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '!' : '✗'} | ${r.group} | ${r.name} | ${String(r.note).replace(/[|]/g, '/')} |`),
  '',
  'Снимки — shots/.',
  ''
].join('\n');
writeFileSync(join(OUT, 'report.md'), md);
console.log(`\nИтог: ${pass} ✓, ${warn} !, ${fail} ✗`);
process.exit(fail ? 1 : 0);
