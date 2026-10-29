/* ==========================================================================
   Адвокат Страховецкая Е. Р. — сценарии
   --------------------------------------------------------------------------
   Без зависимостей. Общий файл для главной, /privacy/ и 404. Каждая функция
   initXxx() отвечает за один модуль и молча выходит, если его разметки
   на странице нет. Сайт работает и без JS: всё здесь — надстройка.
   На сайт подключается main.min.js (bash build.sh).
   ========================================================================== */

'use strict';

/* Единственный источник контактов. Элементы с data-site="…" получают
   отсюда ссылку, с data-site-text — текст (ключ — значение атрибута,
   а если оно пустое — значение data-site). В HTML те же значения
   стоят как запасные: без JS сайт работает, а поисковики видят номер.
   Сменился телефон — правим здесь, в разметке, в JSON-LD в <head>
   и в tools/build-directions.mjs. */
const SITE = {
  phone: '+79112585934',
  phoneText: '+7 (911) 258-59-34',
  whatsapp: 'https://wa.me/79112585934',
  // Профиль в MAX: ссылку пришлёт клиент. Пока пусто, кнопок MAX нет нигде
  // (ни «#», ни пустых ссылок). Вписали ссылку — bash build.sh перенесёт
  // её в разметку всех страниц и в sameAs, кнопки появятся.
  max: 'https://max.ru/u/f9LHodD0cOIVmBwCmqbL6WuMIrYl8EcYiUHVnizhA8UzZi-aLdURLhYDtkc',
  email: 'strahovets@yandex.ru',
  vk: 'https://vk.ru/id124027365',
  // Простая метка без карточки организации: в карточке Яндекса другие
  // часы работы, чем на HARANT, — противоречие на сайте ни к чему
  map: 'https://yandex.ru/map-widget/v1/?ll=30.320962%2C59.872331&z=16&pt=30.320962%2C59.872331%2Cpm2dgm'
};

/* Якоря прошлых версий, которых на странице больше нет: по ним ещё могут
   приходить из рекламы и закладок. Срабатывают, только если элемента с таким
   id нет или он скрыт (как «Образование», пока нет сканов). */
const ANCHOR_ALIASES = {
  krazha: 'moshennichestvo',      // кража теперь в одной строке с мошенничеством
  otzyvy: 'proverka',             // отзывы — в разделе «Проверить адвоката»
  usloviya: 'stoimost',           // условия работы — в «Стоимости и условиях»
  obrazovanie: 'ob-advokate'
};

/* Яндекс.Метрика: номер счётчика строкой, например '12345678'.
   Пусто — Метрика не загружается совсем, и плашка о cookie не показывается
   (без Метрики сайт cookie не ставит). Цели — в README. */
const METRIKA_ID = '';

// Отметка о согласии на cookie — в localStorage (в браузере посетителя)
const CONSENT_KEY = 'cookie-consent';

// Цели, достигнутые до согласия на cookie (например, sec_<id> при переходе
// из рекламы — плашка ещё на экране): уходят в Метрику после «Понятно»
const pendingGoals = [];

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.addEventListener('DOMContentLoaded', () => {
  initSiteData();
  initMenu();
  initHeaderTone();
  initSmoothScroll();
  initHashOnLoad();
  initCaseGoals();
  initHero();
  initEmbeds();
  initCallBar();
  initLightbox();
  initCookies();
  initGoals();
  initRevoke();
});


/* ---------- Контакты из SITE ---------- */

function initSiteData() {
  const href = {
    phone: () => 'tel:' + SITE.phone,
    email: () => 'mailto:' + SITE.email,
    whatsapp: () => SITE.whatsapp,
    vk: () => SITE.vk
  };
  const text = {
    phone: () => SITE.phoneText,
    email: () => SITE.email
  };

  document.querySelectorAll('[data-site]').forEach((el) => {
    const key = el.dataset.site;
    if (href[key]) el.setAttribute('href', href[key]());
  });

  // Текст — отдельно от ссылки: в шапке номер лежит в span внутри ссылки
  // вместе с часами работы, и textContent всей ссылки затёр бы часы
  document.querySelectorAll('[data-site-text]').forEach((el) => {
    const key = el.dataset.siteText || el.dataset.site;
    if (text[key]) el.textContent = text[key]();
  });

  // MAX: кнопки в разметке ставит build.sh — ссылкой, если SITE.max задан,
  // иначе скрытым <span>. Здесь только обновляем адрес у готовых ссылок.
  if (SITE.max) {
    document.querySelectorAll('a[data-site="max"]').forEach((el) => el.setAttribute('href', SITE.max));
  }
}


/* ---------- Меню на телефоне ---------- */

function initMenu() {
  const button = document.querySelector('.header__burger');
  const nav = document.getElementById('nav');
  if (!button || !nav) return;

  const header = button.closest('.header');
  const desktop = window.matchMedia('(min-width: 80em)');
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';

  const setOpen = (open, returnFocus) => {
    button.setAttribute('aria-expanded', String(open));
    header.classList.toggle('is-menu-open', open);
    root.classList.toggle('is-locked', open);
    if (open) {
      // Фокус — на первый пункт: иначе после Tab он уйдёт в страницу под меню
      const first = nav.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    } else if (returnFocus) {
      button.focus();
    }
  };

  button.addEventListener('click', () => setOpen(!isOpen(), false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) setOpen(false, true);
  });

  // Пункт выбран — меню закрываем, прокрутку сделает initSmoothScroll
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a') && isOpen()) setOpen(false, false);
  });

  // Повернули планшет до десктопной ширины с открытым меню
  desktop.addEventListener('change', (event) => {
    if (event.matches && isOpen()) setOpen(false, false);
  });
}


/* ---------- Шапка над тёмным первым экраном ---------- */

// Пока под шапкой первый экран, она тёмная (класс header--dark стоит
// в разметке главной), ниже — белая. Проверка при прокрутке через rAF:
// одно getBoundingClientRect за кадр — дёшево.
function initHeaderTone() {
  const header = document.querySelector('.header--dark');
  const stage = document.querySelector('.hero__stage');
  if (!header || !stage) return;

  let queued = false;
  const update = () => {
    queued = false;
    header.classList.toggle('header--dark', stage.getBoundingClientRect().bottom > header.offsetHeight);
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
}


/* ---------- Плавный переход по якорям ---------- */

// Элемент по якорю — с учётом старых якорей. Скрытый (hidden) не годится:
// к нему не прокрутить.
function findTarget(id) {
  const visible = (el) => (el && !el.closest('[hidden]') ? el : null);
  if (!id) return null;
  return visible(document.getElementById(id)) || visible(document.getElementById(ANCHOR_ALIASES[id] || ''));
}

// Отступ под шапку задаёт CSS (scroll-margin-top), поэтому scrollIntoView
// ставит раздел или строку ровно под шапку — так же, как браузер
// при открытии ссылки с #якорем из рекламы
function scrollToTarget(target, smooth) {
  target.scrollIntoView({ block: 'start', behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
}

// «Подробнее», раскрытые скриптом (переход по якорю), а не человеком:
// для них цель open_<id> не отправляется
const autoOpened = new WeakSet();
const flashTimers = new WeakMap();

// Строку направления раскрываем до прокрутки: её высота должна быть
// окончательной, иначе строка уедет из-под шапки
function openCase(target) {
  if (!target.classList.contains('case')) return false;
  const details = target.querySelector('details');
  if (details && !details.open) {
    autoOpened.add(details);
    details.open = true;
  }
  return true;
}

// Подсветка на ~2 с (анимация — в CSS) и цель Метрики sec_<id>: человек
// пришёл в строку по якорю — из рекламы или из карточки «Направлений»
function flashCase(target) {
  target.classList.remove('is-flash');
  void target.offsetWidth;   // перезапуск анимации, если строку только что подсвечивали
  target.classList.add('is-flash');
  clearTimeout(flashTimers.get(target));
  flashTimers.set(target, setTimeout(() => target.classList.remove('is-flash'), 3000));
  reachGoal('sec_' + target.id.replace(/-/g, '_'));
}

function goTo(target, smooth) {
  const isCase = openCase(target);
  if (target.id === 'hero') window.scrollTo({ top: 0, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
  else scrollToTarget(target, smooth);
  if (isCase) flashCase(target);
  return isCase;
}

function initSmoothScroll() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const target = findTarget(decodeURIComponent(link.getAttribute('href').slice(1)));
    if (!target) return;

    event.preventDefault();
    const isCase = goTo(target, true);

    // replaceState, а не pushState: utm-метки в адресе сохраняются,
    // а «Назад» уводит со страницы, а не прыгает по разделам
    history.replaceState(null, '', '#' + target.id);

    // Переносим фокус: следующий Tab должен идти отсюда, а не с начала.
    // В строке направления — на её «Подробнее»: его можно сразу свернуть.
    const focusable = isCase ? target.querySelector('summary') : target;
    if (!isCase && !focusable.hasAttribute('tabindex')) focusable.setAttribute('tabindex', '-1');
    focusable.focus({ preventScroll: true });
  });

  // Якорь сменили руками в адресной строке
  window.addEventListener('hashchange', () => {
    const target = findTarget(decodeURIComponent(window.location.hash.slice(1)));
    if (target) goTo(target, false);
  });
}


/* ---------- Ссылка с #якорем из рекламы ---------- */

// Браузер прокручивает к #якорю сразу, по раскладке до загрузки шрифтов.
// Потом приходят шрифты, строки выше переносятся иначе, и цель уезжает
// из-под шапки. Поэтому после загрузки шрифтов и страницы ставим её на
// место ещё раз — если человек сам не начал прокручивать. Старый якорь
// (#krazha) браузер не находит вовсе — к нему прокручиваем только мы.
function initHashOnLoad() {
  const target = findTarget(decodeURIComponent(window.location.hash.slice(1)));
  if (!target || target.id === 'hero') return;

  const isCase = openCase(target);

  let userMoved = false;
  const stop = () => { userMoved = true; };
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((type) => {
    window.addEventListener(type, stop, { once: true, passive: true });
  });

  const settle = () => {
    if (!userMoved) scrollToTarget(target, false);
  };

  settle();
  // Подсветка — когда шрифты на месте: до этого страница может быть
  // ещё не отрисована, и человек её не увидел бы
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => {
    settle();
    if (isCase) flashCase(target);
  });
  window.addEventListener('load', settle, { once: true });
}


/* ---------- Первый экран: проявление ---------- */

function initHero() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  // Проявление запускает класс is-hero-ready — после загрузки портрета,
  // чтобы не проявлять пустое место. Нет портрета — сразу. Страховочный
  // таймер на случай зависшей загрузки стоит в <head>.
  const ready = () => root.classList.add('is-hero-ready');
  const img = hero.querySelector('.hero__img');
  if (!img || img.complete) {
    ready();
  } else {
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', ready, { once: true });
  }
}


/* ---------- Виджеты Яндекса: подгрузка при подходе к блоку ---------- */

// Карта — сторонний iframe тяжелее всей страницы. В разметке только блок
// с data-embed, iframe появляется, когда блок подходит к экрану: первый
// экран за неё не платит. Пустого прямоугольника нет: до загрузки в блоке
// видны адрес и ссылка на Яндекс Карты.
function initEmbeds() {
  const EMBEDS = {
    map: { src: SITE.map, title: 'Карта: Санкт-Петербург, Московский проспект, 186' }
  };

  const boxes = document.querySelectorAll('[data-embed]');
  if (!boxes.length) return;

  const load = (box) => {
    const embed = EMBEDS[box.dataset.embed];
    if (!embed) return;
    const frame = document.createElement('iframe');
    frame.src = embed.src;
    frame.title = embed.title;
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.addEventListener('load', () => box.classList.add('is-loaded'), { once: true });
    box.append(frame);
  };

  // За 600 px до появления: к тому моменту, как блок въедет в экран,
  // карта уже успеет отрисоваться
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      entry.target.querySelectorAll('[data-embed]').forEach(load);
    });
  }, { rootMargin: '600px 0px' });

  const watched = new Set();
  boxes.forEach((box) => watched.add(box.closest('section') || box.parentElement));
  watched.forEach((el) => observer.observe(el));
}


/* ---------- Мобильная панель «Позвонить» + WhatsApp ---------- */

function initCallBar() {
  const bar = document.getElementById('callbar');
  if (!bar) return;

  const actions = document.getElementById('hero-actions');
  let pastHero = !actions;
  let keyboard = false;

  const render = () => {
    const visible = pastHero && !keyboard;
    bar.classList.toggle('is-visible', visible);
    // CSS поднимает плашку cookie над панелью, пока та видна
    root.classList.toggle('has-callbar', visible);
  };

  // Пока видны кнопки первого экрана, вторая «Позвонить» — дубль.
  // top < 0 — кнопки ушли вверх, а не ещё не доехали снизу
  if (actions) {
    new IntersectionObserver(([entry]) => {
      pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      render();
    }).observe(actions);
  }

  // Клавиатура на телефоне съедает нижнюю часть экрана — visualViewport
  // становится ниже окна. Умножение на scale отделяет клавиатуру от зума.
  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener('resize', () => {
      keyboard = window.innerHeight - viewport.height * viewport.scale > 150;
      render();
    });
  }

  render();
}


/* ---------- Увеличение документов ---------- */

// Нативный <dialog>: showModal() уводит фокус внутрь и делает страницу
// недоступной для Tab, Esc закрывает его без нашего кода. Остаётся
// закрытие по клику на фон и возврат фокуса на превью.
function initLightbox() {
  const dialog = document.querySelector('[data-lightbox]');
  const openers = document.querySelectorAll('[data-full]');
  if (!dialog || !openers.length || typeof dialog.showModal !== 'function') return;

  const img = dialog.querySelector('.lightbox__img');
  const caption = dialog.querySelector('.lightbox__caption');
  let opener = null;

  openers.forEach((button) => {
    button.addEventListener('click', () => {
      opener = button;
      const thumb = button.querySelector('img');
      img.src = button.dataset.full;
      img.alt = thumb ? thumb.alt : '';
      caption.textContent = button.dataset.caption || '';
      dialog.showModal();
    });
  });

  dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());

  // Клик по затемнению: целью события становится сам <dialog>,
  // а не картинка или подпись внутри него
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    img.src = 'data:,';
    if (opener) opener.focus();
  });
}


/* ---------- Cookie и Яндекс.Метрика ---------- */

// localStorage бывает недоступен (приватный режим, запрет в настройках) —
// поэтому только в try/catch. Без хранилища согласие живёт до перезагрузки.
function hasConsent() {
  try { return window.localStorage.getItem(CONSENT_KEY) === '1'; } catch (error) { return false; }
}

function saveConsent() {
  try { window.localStorage.setItem(CONSENT_KEY, '1'); } catch (error) { /* без хранилища */ }
}

// Официальный код счётчика, разобранный по шагам: очередь вызовов ym()
// до загрузки tag.js, сам скрипт и инициализация. Вебвизор и карта кликов
// выключены — политика конфиденциальности их не описывает.
function loadMetrika() {
  if (!METRIKA_ID || typeof window.ym === 'function') return;

  window.ym = function () {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = Date.now();

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(script);

  window.ym(Number(METRIKA_ID), 'init', {
    clickmap: false,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false
  });
  pendingGoals.splice(0).forEach((name) => window.ym(Number(METRIKA_ID), 'reachGoal', name));
}

// Цель Метрики. Пока счётчика нет (нет согласия) — в очередь.
function reachGoal(name) {
  if (!METRIKA_ID) return;
  if (typeof window.ym === 'function') window.ym(Number(METRIKA_ID), 'reachGoal', name);
  else pendingGoals.push(name);
}

// Плашка показывается, только если Метрика настроена и согласия ещё нет
function initCookies() {
  if (!METRIKA_ID) return;
  if (hasConsent()) {
    loadMetrika();
    return;
  }

  const banner = document.querySelector('[data-cookie]');
  const accept = banner && banner.querySelector('[data-cookie-accept]');
  if (!accept) return;

  banner.hidden = false;
  accept.addEventListener('click', () => {
    saveConsent();
    banner.hidden = true;
    loadMetrika();
  });
}

// Цели Метрики — клики по способам связи. Цели строк направлений —
// в flashCase (sec_<id>, переход по якорю) и initCaseGoals (open_<id>).
// В Метрику уходят только после согласия на cookie.
function initGoals() {
  const goals = [
    ['a[href^="tel:"]', 'click_phone'],
    ['a[href*="wa.me/"]', 'click_whatsapp'],
    ['a[data-site="max"]', 'click_max'],
    ['a[href^="mailto:"]', 'click_email']
  ];

  document.addEventListener('click', (event) => {
    for (const [selector, goal] of goals) {
      if (!event.target.closest(selector)) continue;
      reachGoal(goal);
      return;
    }
  });
}

// open_<id> — человек сам раскрыл «Подробнее» в строке направления.
// Раскрытие по якорю (из рекламы) не считается: для него есть sec_<id>.
function initCaseGoals() {
  document.querySelectorAll('.case__details').forEach((details) => {
    details.addEventListener('toggle', () => {
      const auto = autoOpened.has(details);
      autoOpened.delete(details);
      if (details.open && !auto) reachGoal('open_' + details.closest('.case').id.replace(/-/g, '_'));
    });
  });
}

// «Отозвать согласие» на странице политики: удаляет отметку о согласии,
// cookie и записи Метрики (_ym…) этого сайта и перезагружает страницу
function initRevoke() {
  const box = document.querySelector('[data-cookie-revoke]');
  if (!box || !METRIKA_ID || !hasConsent()) return;

  box.hidden = false;
  box.querySelector('button').addEventListener('click', () => {
    try { window.localStorage.removeItem(CONSENT_KEY); } catch (error) { /* без хранилища */ }

    const host = window.location.hostname.replace(/^www\./, '');
    document.cookie.split(';').forEach((part) => {
      const name = part.split('=')[0].trim();
      if (name.indexOf('_ym') !== 0) return;
      ['', host, '.' + host].forEach((domain) => {
        document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
      });
    });
    try {
      Object.keys(window.localStorage).forEach((key) => {
        if (key.indexOf('_ym') === 0) window.localStorage.removeItem(key);
      });
    } catch (error) { /* без хранилища */ }

    window.location.reload();
  });
}
