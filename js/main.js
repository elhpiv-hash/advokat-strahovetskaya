/* ==========================================================================
   Адвокат Страховецкая Е. Р. — сценарии
   --------------------------------------------------------------------------
   Без зависимостей. Каждая функция initXxx() отвечает за один модуль
   и молча выходит, если его разметки на странице нет.
   На сайт подключается main.min.js (bash build.sh).
   ========================================================================== */

'use strict';

/* Единственный источник контактов. Элементы с data-site="…" получают
   отсюда ссылку, с data-site-text — текст (ключ — значение атрибута,
   а если оно пустое — значение data-site). В HTML те же значения
   стоят как запасные: без JS сайт работает, а поисковики видят номер.
   Сменился телефон — правим здесь, в разметке и в JSON-LD в <head>. */
const SITE = {
  phone: '+79112585934',
  phoneText: '+7 (911) 258-59-34',
  whatsapp: 'https://wa.me/79112585934',
  telegram: 'https://t.me/advokatstrahovetskaya',
  email: 'strahovets@yandex.ru',
  vk: 'https://vk.ru/id124027365',
  // Простая метка без карточки организации: в карточке Яндекса другие
  // часы работы, чем на HARANT, — противоречие на сайте ни к чему
  map: 'https://yandex.ru/map-widget/v1/?ll=30.320962%2C59.872331&z=16&pt=30.320962%2C59.872331%2Cpm2dgm',
  // Официальный виджет отзывов карточки организации (id 192041376690)
  yandexReviews: 'https://yandex.ru/maps-reviews-widget/192041376690?comments'
};

document.addEventListener('DOMContentLoaded', () => {
  initSiteData();
  initHeader();
  initMenu();
  initSmoothScroll();
  initHero();
  initEmbeds();
  initCallBar();
});


/* ---------- Контакты из SITE ---------- */

function initSiteData() {
  const href = {
    phone: () => 'tel:' + SITE.phone,
    email: () => 'mailto:' + SITE.email,
    whatsapp: () => SITE.whatsapp,
    telegram: () => SITE.telegram,
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
}


/* ---------- Шапка: прозрачная над первым экраном, белая при прокрутке ---------- */

function initHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  // Датчик высотой 24 px в начале страницы. IntersectionObserver вызывает
  // колбэк только при пересечении порога — дешевле, чем слушать каждый scroll
  const sentinel = document.createElement('div');
  sentinel.className = 'scroll-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  document.body.prepend(sentinel);

  new IntersectionObserver(([entry]) => {
    header.classList.toggle('is-solid', !entry.isIntersecting);
  }).observe(sentinel);
}


/* ---------- Меню на телефоне ---------- */

function initMenu() {
  const button = document.querySelector('.header__burger');
  const nav = document.getElementById('nav');
  if (!button || !nav) return;

  const header = button.closest('.header');
  const root = document.documentElement;
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


/* ---------- Плавный переход по якорям с учётом фиксированной шапки ---------- */

function initSmoothScroll() {
  const header = document.querySelector('.header');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;

    event.preventDefault();

    // Высоту шапки меряем в момент клика: она разная на телефоне и десктопе,
    // а на iPhone к ней добавляется safe-area
    const offset = header ? header.offsetHeight : 0;
    const top = id === 'hero' ? 0 : target.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({ top: Math.max(0, top), behavior: reduce.matches ? 'auto' : 'smooth' });
    history.pushState(null, '', '#' + id);

    // Переносим фокус в раздел: следующий Tab должен идти отсюда, а не с начала
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}


/* ---------- Первый экран: проявление и параллакс ---------- */

function initHero() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  // Проявление запускает класс is-hero-ready — после загрузки фото, чтобы
  // не проявлять пустое место. Нет фото (заглушка) — сразу. Страховочный
  // таймер на случай зависшей загрузки стоит в <head>.
  const ready = () => document.documentElement.classList.add('is-hero-ready');
  const img = hero.querySelector('.hero__img');
  if (!img || img.complete) {
    ready();
  } else {
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', ready, { once: true });
  }

  const layer = hero.querySelector('.hero__parallax');
  if (!layer) return;

  // Параллакс — только мышь и широкий экран: на телефоне он дёргается
  // вместе с адресной строкой и только мешает
  const allowed = window.matchMedia('(min-width: 60em) and (hover: hover) and (prefers-reduced-motion: no-preference)');
  const MAX_SHIFT = 40;
  let inView = true;
  let queued = false;

  const update = () => {
    queued = false;
    const progress = Math.min(1, window.scrollY / hero.offsetHeight);
    layer.style.transform = 'translate3d(0,' + (progress * MAX_SHIFT).toFixed(1) + 'px,0)';
  };

  const onScroll = () => {
    if (inView && !queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  // Ушли ниже первого экрана — сдвиг не считаем вовсе
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
  }).observe(hero);

  const toggle = () => {
    if (allowed.matches) {
      window.addEventListener('scroll', onScroll, { passive: true });
      update();
    } else {
      window.removeEventListener('scroll', onScroll);
      layer.style.transform = '';
    }
  };

  allowed.addEventListener('change', toggle);
  toggle();
}


/* ---------- Виджеты Яндекса: подгрузка при подходе к блоку ---------- */

// Карта и отзывы — сторонние iframe, каждый тяжелее всей страницы.
// В разметке только пустой блок с data-embed, iframe появляется, когда
// блок подходит к экрану: первый экран за них не платит.
function initEmbeds() {
  const EMBEDS = {
    map: { src: SITE.map, title: 'Карта: Санкт-Петербург, Московский проспект, 186' },
    reviews: { src: SITE.yandexReviews, title: 'Отзывы об адвокате Страховецкой Е. Р. на Яндекс Картах' }
  };

  const boxes = document.querySelectorAll('[data-embed]');
  if (!boxes.length) return;

  const load = (box) => {
    const embed = EMBEDS[box.dataset.embed];
    if (!embed) return;
    const frame = document.createElement('iframe');
    frame.src = embed.src;
    frame.title = embed.title;
    frame.loading = 'lazy';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    box.append(frame);
  };

  // За 400 px до появления: к тому моменту, как блок въедет в экран,
  // виджет уже успеет отрисоваться
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      load(entry.target);
    });
  }, { rootMargin: '400px 0px' });

  boxes.forEach((box) => observer.observe(box));
}


/* ---------- Мобильная кнопка «Позвонить» ---------- */

function initCallBar() {
  const bar = document.getElementById('callbar');
  if (!bar) return;

  const actions = document.getElementById('hero-actions');
  let pastHero = !actions;
  let keyboard = false;

  const render = () => {
    bar.classList.toggle('is-visible', pastHero && !keyboard);
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
