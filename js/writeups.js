/* Reads the writeup repo straight from GitHub at page load, so pushing a new
   markdown file is all it takes to publish one here.

   Layout it expects:  <Platform>/<Challenge>/README[.<lang>].md
   Anything else in the repo (assets, solver scripts, the root readme) is
   ignored by the index but still reachable through the rendered links. */
(() => {
'use strict';

const { owner, name, branch } = WRITEUPS_REPO;
const API  = `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`;
const RAW  = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/`;
const BLOB = `https://github.com/${owner}/${name}/blob/${branch}/`;
const REPO_URL = `https://github.com/${owner}/${name}`;

const LANGS = {
  en: 'English', fr: 'Français', ja: '日本語', es: 'Español', de: 'Deutsch',
  it: 'Italiano', pt: 'Português', zh: '中文', ko: '한국어', ru: 'Русский',
  nl: 'Nederlands',
};
// The repo spells Japanese both ways; fold them together.
const LANG_ALIAS = { jp: 'ja' };

const TREE_TTL = 10 * 60 * 1000;   // the API allows 60 calls/hour per IP

const dom = {
  index:    document.getElementById('wu-index'),
  status:   document.getElementById('wu-status'),
  tree:     document.getElementById('wu-tree'),
  doc:      document.getElementById('wu-doc'),
  platform: document.getElementById('wu-doc-platform'),
  title:    document.getElementById('wu-doc-title'),
  source:   document.getElementById('wu-doc-source'),
  body:     document.getElementById('wu-doc-body'),
  langs:    document.getElementById('wu-langs'),
};

let folders = new Map();   // "Platform/Challenge" -> entry

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// sessionStorage is unavailable in some private modes; never let it break a read.
function cacheGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function cacheSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* quota or blocked */ }
}

/* ----------------------------------------------------------- index model */

function parseTree(tree) {
  const out = new Map();

  for (const item of tree) {
    if (item.type !== 'blob') continue;

    const parts = item.path.split('/');
    if (parts.length < 2) continue;              // repo's own README, etc.

    const m = /^(.+?)(?:\.([A-Za-z]{2}))?\.md$/i.exec(parts[parts.length - 1]);
    if (!m) continue;

    let base = m[1];
    let lang = 'en';
    if (m[2]) {
      const code = m[2].toLowerCase();
      if (code in LANGS || code in LANG_ALIAS) lang = LANG_ALIAS[code] || code;
      else base = `${m[1]}.${m[2]}`;             // ".v2" is a name, not a language
    }

    const folder = parts.slice(0, -1).join('/');
    const challenge = parts[parts.length - 2];
    const platform = parts.slice(0, -2).join('/') || 'other';

    if (!out.has(folder)) out.set(folder, { folder, platform, challenge, docs: new Map() });

    const entry = out.get(folder);
    const isReadme = /^readme$/i.test(base);
    const prev = entry.docs.get(lang);
    // A README wins over any other markdown sitting beside it.
    if (!prev || (isReadme && !prev.isReadme)) {
      entry.docs.set(lang, { path: item.path, size: item.size || 0, isReadme });
    }
  }

  return out;
}

function pickLang(entry, wanted) {
  if (wanted && entry.docs.has(wanted)) return wanted;
  if (entry.docs.has('en')) return 'en';
  return entry.docs.keys().next().value;
}

/* ----------------------------------------------------------------- fetch */

async function loadTree() {
  const key = `wu:tree:${owner}/${name}@${branch}`;
  const hit = cacheGet(key);
  if (hit) {
    try {
      const { at, tree } = JSON.parse(hit);
      if (Date.now() - at < TREE_TTL) return tree;
    } catch { /* corrupt entry, refetch */ }
  }

  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub is rate-limiting this address. Try again in a few minutes.');
    }
    if (res.status === 404) {
      throw new Error(`Repository ${owner}/${name} or branch "${branch}" not found.`);
    }
    throw new Error(`GitHub replied ${res.status}.`);
  }

  const data = await res.json();
  // Only the paths matter; drop the rest so the cache stays small.
  const tree = (data.tree || []).map(t => ({ path: t.path, type: t.type, size: t.size }));
  cacheSet(key, JSON.stringify({ at: Date.now(), tree }));
  if (data.truncated) console.warn('writeups: GitHub truncated the tree listing');
  return tree;
}

async function loadMarkdown(path) {
  const key = `wu:md:${path}`;
  const hit = cacheGet(key);
  if (hit !== null) return hit;

  const res = await fetch(RAW + path.split('/').map(encodeURIComponent).join('/'));
  if (!res.ok) throw new Error(`Could not fetch ${path} (${res.status}).`);
  const text = await res.text();
  cacheSet(key, text);
  return text;
}

/* --------------------------------------------------------------- the list */

// Preferred platforms first, in the order given; everything else A→Z.
function orderPlatforms(names) {
  const pref = WRITEUPS_REPO.order || [];
  const rank = n => {
    const i = pref.findIndex(p => p.toLowerCase() === n.toLowerCase());
    return i === -1 ? pref.length : i;
  };
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function renderIndex() {
  dom.tree.textContent = '';

  const byPlatform = new Map();
  for (const entry of folders.values()) {
    if (!byPlatform.has(entry.platform)) byPlatform.set(entry.platform, []);
    byPlatform.get(entry.platform).push(entry);
  }
  if (!byPlatform.size) {
    dom.status.textContent = 'No markdown writeups found in that repo yet.';
    return;
  }

  for (const platform of orderPlatforms([...byPlatform.keys()])) {
    const list = byPlatform.get(platform)
      .sort((a, b) => a.challenge.localeCompare(b.challenge, undefined, { numeric: true }));

    const group = el('section', 'wu-group');

    const head = el('h2', 'wu-group__head');
    head.append(el('span', 'wu-group__name', platform));
    head.append(el('span', 'wu-group__count', String(list.length)));
    group.append(head);

    const grid = el('div', 'wu-grid');
    for (const entry of list) {
      const card = el('a', 'wu-card');
      card.href = '#' + entry.folder;
      card.append(el('span', 'wu-card__name', entry.challenge.replace(/[_-]+/g, ' ')));

      const langs = el('span', 'wu-card__langs');
      for (const code of [...entry.docs.keys()].sort()) langs.append(el('span', 'wu-lang', code));
      card.append(langs);

      grid.append(card);
    }
    group.append(grid);

    dom.tree.append(group);
  }

  dom.status.hidden = true;
}

/* ----------------------------------------------------------- the document */

// Markdown in the repo links to files beside it; make those absolute.
function resolveUrls(root, folder) {
  const rawBase  = RAW + folder + '/';
  const blobBase = BLOB + folder + '/';
  const absolute = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src || absolute.test(src)) continue;
    img.src = new URL(src.replace(/^\.\//, ''), rawBase).href;
    img.loading = 'lazy';
    img.decoding = 'async';
  }

  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) continue;
    if (!absolute.test(href)) a.href = new URL(href.replace(/^\.\//, ''), blobBase).href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
}

function renderLangTabs(entry, current) {
  dom.langs.textContent = '';
  const codes = [...entry.docs.keys()].sort();
  if (codes.length < 2) return;

  for (const code of codes) {
    const a = el('a', 'wu-lang-tab' + (code === current ? ' is-on' : ''),
                 LANGS[code] || code.toUpperCase());
    a.href = `#${entry.folder}/${code}`;
    dom.langs.append(a);
  }
}

async function showDoc(folder, wantedLang) {
  const entry = folders.get(folder);

  dom.index.hidden = true;
  dom.doc.hidden = false;

  if (!entry) {
    dom.platform.textContent = '';
    dom.title.textContent = 'Not found';
    dom.source.textContent = '';
    dom.langs.textContent = '';
    dom.body.textContent = '';
    dom.body.append(el('p', null, `No writeup at "${folder}".`));
    return;
  }

  const lang = pickLang(entry, wantedLang);
  const doc = entry.docs.get(lang);

  dom.platform.textContent = entry.platform;
  dom.title.textContent = entry.challenge.replace(/[_-]+/g, ' ');
  dom.source.textContent = '';
  renderLangTabs(entry, lang);

  dom.body.textContent = '';
  dom.body.append(el('p', 'wu-status', 'Loading…'));
  window.scrollTo(0, 0);

  let md;
  try {
    md = await loadMarkdown(doc.path);
  } catch (err) {
    dom.body.textContent = '';
    dom.body.append(el('p', 'wu-error', err.message));
    return;
  }

  // Still the right document? The reader may have clicked away while fetching.
  if (routeOf(location.hash).folder !== folder) return;

  const html = marked.parse(md, { gfm: true });
  dom.body.innerHTML = DOMPurify.sanitize(html);

  // The file usually opens with its own title, though a badge image often
  // sits above it. Promote that heading instead of showing the folder name.
  const lead = [...dom.body.children].slice(0, 4).find(n => n.tagName === 'H1');
  if (lead) {
    const t = lead.textContent.trim();
    if (t) dom.title.textContent = t;
    lead.remove();
  }
  // Leave exactly one h1 on the page: the title above.
  for (const extra of [...dom.body.querySelectorAll('h1')]) {
    const h2 = document.createElement('h2');
    h2.append(...extra.childNodes);
    extra.replaceWith(h2);
  }

  resolveUrls(dom.body, entry.folder);

  const src = el('a', null, doc.path);
  src.href = BLOB + doc.path.split('/').map(encodeURIComponent).join('/');
  src.target = '_blank';
  src.rel = 'noopener noreferrer';
  dom.source.textContent = 'source: ';
  dom.source.append(src);
}

function showIndex() {
  dom.doc.hidden = true;
  dom.index.hidden = false;
}

/* --------------------------------------------------------------- routing */

function routeOf(hash) {
  const raw = decodeURIComponent(hash.replace(/^#/, ''));
  if (!raw) return { folder: null, lang: null };
  if (folders.has(raw)) return { folder: raw, lang: null };

  // Trailing segment may be a language: "Platform/Challenge/fr".
  const cut = raw.lastIndexOf('/');
  if (cut > 0) {
    const tail = raw.slice(cut + 1).toLowerCase();
    const head = raw.slice(0, cut);
    const code = LANG_ALIAS[tail] || tail;
    if (folders.has(head) && code in LANGS) return { folder: head, lang: code };
  }
  return { folder: raw, lang: null };
}

function route() {
  const { folder, lang } = routeOf(location.hash);
  if (folder) showDoc(folder, lang);
  else showIndex();
}

// The edge halo steps back one level at a time: an open writeup closes to the
// list, and the list itself falls through to the landing page.
if (window.EdgeBack) {
  window.EdgeBack.onBack(() => {
    if (!routeOf(location.hash).folder) return false;
    history.pushState(null, '', location.pathname);
    route();
    return true;
  });
}

/* ------------------------------------------------------------------ boot */

async function init() {
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    dom.status.textContent = 'Markdown renderer failed to load (js/vendor).';
    dom.status.className = 'wu-error';
    return;
  }

  try {
    folders = parseTree(await loadTree());
  } catch (err) {
    dom.status.textContent = '';
    dom.status.className = 'wu-error';
    dom.status.append(el('span', null, err.message + ' '));
    const a = el('a', null, 'Browse them on GitHub instead.');
    a.href = REPO_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    dom.status.append(a);
    return;
  }

  renderIndex();
  route();
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
}

init();

})();
