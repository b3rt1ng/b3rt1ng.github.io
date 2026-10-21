/* Shared across index.html, blog.html and writeups.html. Every renderer bails
   out when its container is absent, so each page only runs what it needs.
   Nodes are built with textContent rather than HTML strings, so post titles
   and code can contain < & " safely. */
(() => {
'use strict';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function extLink(label, href) {
  const a = el('a', null, label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ------------------------------------------------------------------ hero */

// Trusted constants, never built from data — safe to drop in as markup.
const ICONS = {
  tools: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 6.4a3.6 3.6 0 0 0 4.7 4.7l2.1 2.1a2 2 0 0 1-2.8 2.8l-2.1-2.1a3.6 3.6 0 0 1-4.7-4.7z"/><path d="M11.6 11.2 4.3 18.5a1.9 1.9 0 0 0 2.7 2.7l7.3-7.3"/><path d="M14.4 6.4 17 3.8l3.2 3.2-2.6 2.6"/></svg>',
  writeups: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.8 2.8h6.6L18 7.4v13.8H6.8z"/><path d="M13.2 2.8v4.8H18"/><path d="M9.8 12.2h5M9.8 15.2h5M9.8 18.2h3"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  htb: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="m22.5106 6.4566.0008-.0123a.888.888 0 0 0-.2717-.6384c-.0084-.0084-.018-.0155-.0267-.0235-.0186-.0166-.0371-.0333-.0572-.0484-.0193-.0147-.04-.0276-.0607-.0406-.0096-.006-.0182-.0131-.0281-.0188L12.4576.1266a.891.891 0 0 0-.9223.0043L1.933 5.6744c-.0107.0062-.0203.014-.0307.0205-.0073.0047-.015.008-.0223.0128-.007.0047-.013.0106-.02.0155a.8769.8769 0 0 0-.147.1333l-.0026.003a.8872.8872 0 0 0-.2218.5847l.0009.014c-.0002.0088-.0015.0176-.0015.0264v11.0708c0 .3277.1802.6288.469.7836l9.5986 5.5417c.0076.0044.0158.0075.0236.0117a.8754.8754 0 0 0 .166.0687c.0134.004.0266.0083.0401.0117a.8793.8793 0 0 0 .072.0142c.0117.0019.0232.0045.0349.006a.835.835 0 0 0 .2157 0c.0117-.0015.0232-.0041.0348-.006a.9.9 0 0 0 .072-.0142c.0135-.0034.0267-.0077.04-.0117a.895.895 0 0 0 .0646-.0217.9134.9134 0 0 0 .1015-.047c.0078-.0042.016-.0072.0236-.0117l9.5986-5.5417a.8888.8888 0 0 0 .469-.7836V6.4779c0-.0071-.0012-.0142-.0014-.0213zM5.2543 6.0822l6.5367-3.774a.4182.4182 0 0 1 .4182 0l6.5366 3.774a.4182.4182 0 0 1 0 .7243l-6.5367 3.774a.4182.4182 0 0 1-.4182 0l-6.5366-3.774a.4182.4182 0 0 1 0-.7243zm5.6134 14.3449a.4172.4172 0 0 1-.626.3613L3.718 17.0218a.4173.4173 0 0 1-.2086-.3613V9.1279a.4172.4172 0 0 1 .6258-.3613l6.524 3.7666a.4172.4172 0 0 1 .2086.3614v7.5325zm9.623-3.7666a.4173.4173 0 0 1-.2086.3613l-6.5239 3.7666a.4172.4172 0 0 1-.6259-.3613v-7.5325c0-.149.0796-.2868.2087-.3614l6.5239-3.7666a.4172.4172 0 0 1 .6258.3613v7.5326z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
};

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ROLE_HOLD = 3400;   // ms a role sits still
const ROLE_SLIDE = 420;   // ms of travel, matches the CSS transition

// One role at a time: the current one drifts right and fades out, the next
// fades in arriving from the left.
function cycleRoles(host, roles) {
  let i = 0;
  host.textContent = roles[0];
  host.classList.add('role--cycle');

  setInterval(() => {
    host.classList.add('is-out');

    setTimeout(() => {
      i = (i + 1) % roles.length;
      host.textContent = roles[i];
      // Jump to the entry position with the transition switched off, then
      // release it so the next frame animates the arrival instead of
      // sliding the old text backwards.
      host.classList.add('is-skip', 'is-in');
      host.classList.remove('is-out');
      void host.offsetWidth;
      host.classList.remove('is-skip', 'is-in');
    }, ROLE_SLIDE);
  }, ROLE_HOLD + ROLE_SLIDE);
}

// Fallback, also used when the viewer asked for less motion: all the roles
// at once, breaking only at the separators.
function staticRoles(host, roles) {
  host.textContent = '';
  roles.forEach((p, i) => {
    // Real spaces around the separator: adjacent spans with no whitespace
    // between them give the line no break opportunity at all.
    if (i) host.append(' ', el('span', 'role__sep', '·'), ' ');
    host.append(el('span', roles.length > 1 ? 'role__part' : null, p));
  });
}

function renderHero() {
  const role = document.getElementById('hero-role');
  if (role) {
    const roles = PROFILE.role.split('·').map(p => p.trim()).filter(Boolean);
    if (roles.length > 1 && !REDUCED) cycleRoles(role, roles);
    else staticRoles(role, roles);
  }

  const links = document.getElementById('hero-links');
  if (!links) return;

  const hint = document.getElementById('icon-hint');
  const row = (typeof SITE_LINKS === 'undefined' ? [] : SITE_LINKS).concat(SOCIALS);
  for (const s of row) {
    if (typeof s.url !== 'string' || !s.url.trim()) continue;   // not set yet
    const icon = ICONS[s.icon];
    if (!icon) continue;

    const a = el('a');
    a.href = s.url;
    if (!s.internal) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.setAttribute('aria-label', `${s.name}, ${s.handle}`);
    a.innerHTML = icon;

    if (hint) {
      // Pointer and keyboard both drive it, so tabbing announces the same
      // destination a hover would.
      const show = () => {
        hint.textContent = '';
        hint.append(el('span', 'icon-hint__name', s.name));
        hint.append(el('span', 'icon-hint__sep', '→'));
        hint.append(el('span', 'icon-hint__to', s.handle));
        hint.classList.add('is-on');
      };
      const hide = () => hint.classList.remove('is-on');
      a.addEventListener('mouseenter', show);
      a.addEventListener('focus', show);
      a.addEventListener('mouseleave', hide);
      a.addEventListener('blur', hide);
    }

    links.append(a);
  }
}

/* -------------------------------------------------------------- projects */

function renderProjects() {
  const host = document.getElementById('projects-list');
  if (!host) return;

  for (const p of PROJECTS) {
    const card = el('article', 'card');
    card.append(el('span', 'card__label', p.name));

    if (p.tagline) card.append(el('p', 'card__tagline', p.tagline));

    const meta = el('div', 'card__meta');
    if (p.status) meta.append(el('span', 'chip chip--on', p.status));
    if (p.version) meta.append(el('span', 'chip', 'v' + p.version));
    for (const s of p.stack || []) meta.append(el('span', 'chip', s));
    if (meta.childElementCount) card.append(meta);

    if (p.summary) card.append(el('p', 'card__summary', p.summary));

    if (p.highlights && p.highlights.length) {
      const rows = el('div', 'rows');
      for (const [k, v] of p.highlights) {
        const row = el('div', 'row');
        row.append(el('span', 'row__k', k), el('span', 'row__v', v));
        rows.append(row);
      }
      card.append(rows);
    }

    if (p.install) {
      const pre = el('pre', 'cmd');
      pre.append(el('code', null, p.install));
      card.append(pre);
    }

    if (p.links && p.links.length) {
      const links = el('div', 'card__links');
      for (const [label, href] of p.links) links.append(extLink(label, href));
      card.append(links);
    }

    host.append(card);
  }
}

/* ------------------------------------------------------------------ blog */

function renderBlock(b) {
  if (typeof b === 'string') return el('p', null, b);
  if (b.h) return el('h4', null, b.h);
  if (b.list) {
    const ul = el('ul');
    for (const item of b.list) ul.append(el('li', null, item));
    return ul;
  }
  if (b.code) {
    const pre = el('pre');
    pre.append(el('code', b.lang ? 'lang-' + b.lang : null, b.code));
    return pre;
  }
  return el('p', null, String(b));
}

function buildPost(post) {
  const art = el('article', 'post');
  art.id = post.slug;

  const head = el('button', 'post__head');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'false');
  head.append(el('span', 'post__marker', '▸'), el('h3', 'post__title', post.title));

  const sub = el('div', 'post__sub');
  if (post.date) {
    const t = el('time', null, formatDate(post.date));
    t.dateTime = post.date;
    sub.append(t);
  }
  for (const tag of post.tags || []) sub.append(el('span', 'post__tag', tag));
  if (sub.childElementCount) head.append(sub);

  if (post.excerpt) head.append(el('p', 'post__excerpt', post.excerpt));

  const body = el('div', 'post__body');
  body.id = post.slug + '--body';
  for (const block of post.body || []) body.append(renderBlock(block));
  head.setAttribute('aria-controls', body.id);

  head.addEventListener('click', () => {
    const open = art.classList.toggle('is-open');
    head.setAttribute('aria-expanded', String(open));
    // Make the open post linkable without jumping the scroll position.
    history.replaceState(null, '', open ? '#' + post.slug : location.pathname + location.search);
  });

  art.append(head, body);
  return art;
}

function renderPosts() {
  const host = document.getElementById('posts-list');
  if (!host) return;

  if (!POSTS.length) {
    host.append(el('p', 'empty', 'Nothing published yet. Check back later.'));
    return;
  }
  for (const post of POSTS) host.append(buildPost(post));
}

// A bare #slug in the URL opens that post on load.
function openFromHash() {
  const slug = decodeURIComponent(location.hash.slice(1));
  if (!slug) return;
  const art = document.getElementById(slug);
  if (!art || !art.classList.contains('post')) return;
  art.classList.add('is-open');
  art.querySelector('.post__head').setAttribute('aria-expanded', 'true');
  art.scrollIntoView({ block: 'start' });
}

/* ------------------------------------------------------------- page fade */

/* The backdrop fades in on arrival and back out before leaving, so moving
   between pages is a dissolve rather than a cut. Outgoing has to be done by
   intercepting the click: by the time unload fires there is nothing left to
   animate. */
const bgCanvas = document.getElementById('c');

function bgIn() {
  if (bgCanvas) requestAnimationFrame(() => bgCanvas.classList.add('is-in'));
}

function bgOut(then) {
  if (!bgCanvas) return then();
  bgCanvas.classList.remove('is-in');
  let fired = false;
  const go = () => { if (!fired) { fired = true; then(); } };
  bgCanvas.addEventListener('transitionend', go, { once: true });
  // A transition that never runs (reduced motion, a hidden tab) must not
  // strand the navigation.
  setTimeout(go, 500);
}

window.PageFade = {
  out: bgOut,
  // Dip the backdrop, change what it draws, bring it back.
  swap(change) {
    bgOut(() => { change(); bgIn(); });
  },
};

document.addEventListener('click', ev => {
  if (ev.defaultPrevented || ev.button !== 0) return;
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = ev.target.closest && ev.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;

  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  // Same document: that is in-page routing, which has its own transition.
  if (url.pathname === location.pathname) return;

  ev.preventDefault();
  bgOut(() => { location.href = a.href; });
});

/* ------------------------------------------------------------------ boot */

/* Each page names its backdrop on <body>. Applied here rather than in koi.js
   because the scenes register themselves from their own scripts, and this one
   runs after all of them. A page that names nothing keeps the default. */
function applyPageScene() {
  const BG = window.BrailleBG;
  if (!BG) return;
  const want = document.body.dataset.scene;
  // koi.js now idles rather than starting on its own scene, so a page whose
  // backdrop script failed to load would sit on an empty canvas forever. Fall
  // back to the one scene that is always there.
  BG.use(BG.scenes[want] || BG.scenes.koi);
}

applyPageScene();
// Only now is the backdrop showing what this page asked for; fading in any
// earlier shows whatever the renderer happened to start on.
bgIn();
renderHero();
renderProjects();
renderPosts();
openFromHash();

})();
