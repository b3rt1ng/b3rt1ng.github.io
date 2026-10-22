(() => {
'use strict';

const BIT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
const BRAILLE = 0x2800;

const dom = {
  index:   document.getElementById('tool-index'),
  grid:    document.getElementById('tool-grid'),
  doc:     document.getElementById('tool-doc'),
  klass:   document.getElementById('tool-doc-class'),
  name:    document.getElementById('tool-doc-name'),
  tagline: document.getElementById('tool-doc-tagline'),
  figures: document.getElementById('tool-figures'),
  install: document.getElementById('tool-doc-install'),
  links:   document.getElementById('tool-doc-links'),
  rows:    document.getElementById('tool-doc-rows'),
  body:    document.getElementById('tool-doc-body'),
  demo:    document.getElementById('tool-demo'),
  demoImg: document.getElementById('tool-demo-img'),
};

if (typeof TOOLS === 'undefined') {
  const box = document.getElementById('tool-grid');
  if (box) {
    box.textContent = 'Tool data failed to load. js/data.js may be a stale cached copy.';
    box.className = 'wu-error';
  }
  return;
}

const bySlug = new Map(TOOLS.map(t => [t.slug, t]));

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIGIL_ART = {
  octopus: typeof OCTO_SIGIL === 'undefined' ? null : OCTO_SIGIL,
  koi:     typeof KOI_SIGIL === 'undefined' ? null : KOI_SIGIL,
};

function sigil(slug) {
  const rnd = mulberry32(hashStr(slug));
  const BW = 2, BH = 6;
  const W = BW * 2 * 2;
  const H = BH * 2;
  const on = new Uint8Array(W * H);

  for (let by = 0; by < BH; by++) {
    for (let bx = 0; bx < BW; bx++) {
      if (rnd() > 0.54) continue;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx * 2 + dx, y = by * 2 + dy;
          on[y * W + x] = 1;
          on[y * W + (W - 1 - x)] = 1;
        }
      }
    }
  }

  let out = '';
  for (let r = 0; r < H / 4; r++) {
    for (let c = 0; c < W / 2; c++) {
      let bits = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (on[(r * 4 + dy) * W + (c * 2 + dx)]) bits |= BIT[dy][dx];
        }
      }
      out += String.fromCharCode(BRAILLE + bits);
    }
    if (r < H / 4 - 1) out += '\n';
  }
  return out;
}

function renderGrid() {
  dom.grid.textContent = '';

  for (const t of TOOLS) {
    const card = el('a', 'tool-card');
    card.href = '/' + t.slug + '/';
    card.dataset.slug = t.slug;
    card.addEventListener('click', ev => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
      ev.preventDefault();
      open(t.slug);
    });

    const art = t.sigil && SIGIL_ART[t.sigil];
    const crest = el('pre', 'tool-card__sigil', art ? art.join('\n') : sigil(t.slug));
    if (art) crest.classList.add('tool-card__sigil--art');
    crest.setAttribute('aria-hidden', 'true');
    card.append(crest);

    card.append(el('span', 'tool-card__class', t.klass));
    card.append(el('h3', 'tool-card__name', t.name));
    card.append(el('p', 'tool-card__tagline', t.tagline));

    const foot = el('span', 'tool-card__foot');
    if (t.status) foot.append(el('span', 'chip chip--on', t.status));
    const pkg = pypiName(t);
    const versionChip = t.version || pkg ? el('span', 'chip', t.version ? 'v' + t.version : 'v...') : null;
    if (versionChip) foot.append(versionChip);
    card.append(foot);

    if (pkg && versionChip) {
      pkgVersion(pkg).then(v => {
        versionChip.textContent = 'v' + v;
      }).catch(() => {  });
    }

    dom.grid.append(card);
  }
}

const GH_TTL = 15 * 60 * 1000;

function cacheGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function cacheSet(k, v) { try { sessionStorage.setItem(k, v); } catch {  } }

async function repoStats(repo) {
  const key = 'gh:' + repo;
  const hit = cacheGet(key);
  if (hit) {
    try {
      const { at, data } = JSON.parse(hit);
      if (Date.now() - at < GH_TTL) return data;
    } catch {  }
  }

  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(String(res.status));
  const j = await res.json();
  const data = {
    stars: j.stargazers_count,
    forks: j.forks_count,
    language: j.language,
    license: j.license && j.license.spdx_id,
    pushed: j.pushed_at,
  };
  cacheSet(key, JSON.stringify({ at: Date.now(), data }));
  return data;
}

function pypiName(t) {
  const hit = (t.links || []).find(([label]) => label === 'pypi');
  if (!hit) return null;
  const m = /pypi\.org\/project\/([^/?#]+)/.exec(hit[1]);
  return m ? m[1] : null;
}

async function pkgVersion(name) {
  const key = 'pypi:' + name;
  const hit = cacheGet(key);
  if (hit) {
    try {
      const { at, data } = JSON.parse(hit);
      if (Date.now() - at < GH_TTL) return data;
    } catch {  }
  }

  const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()).info.version;
  cacheSet(key, JSON.stringify({ at: Date.now(), data }));
  return data;
}

async function readmeImage(repo) {
  const key = 'demo:' + repo;
  const hit = cacheGet(key);
  if (hit) {
    try {
      const { at, data } = JSON.parse(hit);
      if (Date.now() - at < GH_TTL) return data;
    } catch {  }
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/readme`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(String(res.status));
  const j = await res.json();

  let md = '';
  if (j.encoding === 'base64' && j.content) {
    const bytes = Uint8Array.from(atob(j.content.replace(/\s/g, '')), c => c.charCodeAt(0));
    md = new TextDecoder().decode(bytes);
  } else if (j.download_url) {
    md = await (await fetch(j.download_url)).text();
  }

  const m = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(md);
  let data = null;
  if (m) {
    const raw = m[1].trim();
    if (/^https?:\/\//i.test(raw)) {
      data = raw;
    } else if (j.download_url) {
      data = new URL(raw, j.download_url).href;
    }
  }

  cacheSet(key, JSON.stringify({ at: Date.now(), data }));
  return data;
}

function figure(value, label, cls) {
  const box = el('div', 'figure' + (cls ? ' ' + cls : ''));
  box.append(el('span', 'figure__v', value));
  box.append(el('span', 'figure__k', label));
  return box;
}

function renderFigures(t) {
  const host = dom.figures;
  host.textContent = '';

  if (t.repo) host.append(figure('…', 'stars', 'figure--live'));
  if (t.version) host.append(figure('v' + t.version, '', 'figure--version'));

  const pkg = pypiName(t);
  if (pkg) {
    pkgVersion(pkg).then(v => {
      if (currentSlug !== t.slug) return;
      const cell = host.querySelector('.figure--version .figure__v');
      if (cell) cell.textContent = 'v' + v;
    }).catch(() => {  });
  }

  if (!t.repo) return;

  repoStats(t.repo).then(d => {
    if (currentSlug !== t.slug) return;
    const live = host.querySelector('.figure--live .figure__v');
    if (live) live.textContent = String(d.stars);
  }).catch(() => {
    if (currentSlug !== t.slug) return;
    const live = host.querySelector('.figure--live .figure__v');
    if (live) live.textContent = 'n/a';
  });
}

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

let currentSlug = null;

function showTool(slug) {
  const t = bySlug.get(slug);
  currentSlug = slug;

  dom.index.hidden = true;
  dom.doc.hidden = false;
  window.scrollTo(0, 0);
  play(dom.doc);

  if (!t) {
    dom.klass.textContent = '';
    dom.name.textContent = 'Not found';
    dom.tagline.textContent = `No tool called "${slug}".`;
    for (const n of [dom.figures, dom.links, dom.rows, dom.body]) n.textContent = '';
    dom.install.textContent = '';
    return;
  }

  dom.klass.textContent = t.klass;
  dom.name.textContent = t.name;
  dom.tagline.textContent = t.tagline;

  renderFigures(t);

  dom.install.textContent = t.install || '';
  dom.install.parentElement.hidden = !t.install;

  dom.links.textContent = '';
  for (const [label, href] of t.links || []) {
    const a = el('a', 'tool-link', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    dom.links.append(a);
  }

  dom.demo.hidden = true;
  dom.demoImg.removeAttribute('src');
  if (t.repo) {
    readmeImage(t.repo).then(src => {
      if (!src || currentSlug !== t.slug) return;
      dom.demoImg.alt = t.name + ' demo';

      dom.demoImg.referrerPolicy = 'no-referrer';
      dom.demoImg.src = src;
      dom.demo.hidden = false;
    }).catch(() => {  });
  }

  dom.rows.textContent = '';
  for (const [k, v] of t.highlights || []) {
    const feat = el('div', 'feat');
    feat.append(el('span', 'feat__k', k), el('span', 'feat__v', v));
    dom.rows.append(feat);
  }
  dom.rows.parentElement.hidden = !(t.highlights || []).length;

  dom.body.textContent = '';
  if (t.summary) dom.body.append(el('p', 'tool-about__lede', t.summary));
  for (const block of t.body || []) dom.body.append(renderBlock(block));
}

function showGrid() {
  currentSlug = null;
  dom.doc.hidden = true;
  dom.index.hidden = false;
  play(dom.index);
}

function applyScene(slug) {
  const BG = window.BrailleBG;
  if (!BG) return;
  const want = (slug && bySlug.get(slug) || {}).scene;
  const page = document.body.dataset.scene;
  const next = BG.scenes[want] || BG.scenes[page] || BG.scenes.koi;
  if (BG.current && BG.current() === next) return;

  if (window.PageFade) window.PageFade.swap(() => BG.use(next));
  else BG.use(next);
}

function slugFromPath() {
  const seg = decodeURIComponent(location.pathname)
    .replace(/\/index\.html$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .pop();
  return bySlug.has(seg) ? seg : '';
}

function route() {
  const slug = slugFromPath();
  if (slug) showTool(slug);
  else showGrid();
  applyScene(slug);
}

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function play(el) {
  if (!el || REDUCED) return;
  el.classList.remove('is-entering');
  void el.offsetWidth;
  el.classList.add('is-entering');

  const BG = window.BrailleBG;
  if (!BG || !BG.pause) return;
  BG.pause();
  const wake = () => { BG.resume(); el.removeEventListener('animationend', wake); };
  el.addEventListener('animationend', wake);
  setTimeout(wake, 600);
}

function open(slug) {
  history.pushState(null, '', '/' + slug + '/');
  route();
}

function toGrid() {
  history.pushState(null, '', '/tools/');
  route();
}

if (window.EdgeBack) {
  window.EdgeBack.onBack(() => {
    if (!currentSlug) return false;
    toGrid();
    return true;
  });
}

renderGrid();
route();
window.addEventListener('popstate', route);
})();
