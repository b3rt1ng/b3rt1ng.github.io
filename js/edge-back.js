(() => {
'use strict';

const ZONE = 170;
const LIVE = 0.22;

const HINT_WAIT = 650;
const HINT_MS = 2200;

let handler = null;
let edgeMode = false;
let hinted = false;
const sides = [];

function activate() {
  if (handler && handler()) return;
  const go = () => { location.href = '/'; };
  if (window.PageFade) window.PageFade.out(go); else go();
}

function build(side) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'edge-back edge-back--' + side;
  b.setAttribute('aria-label', 'Go back');

  const label = document.createElement('span');
  label.className = 'edge-back__label';
  label.textContent = side === 'left' ? '← go back' : 'go back →';
  b.append(label);

  b.addEventListener('click', activate);
  b.side = side;
  return b;
}

function glow(el, v) {
  el.style.setProperty('--glow', v < 0.01 ? '0' : v.toFixed(3));

  el.classList.toggle('is-live', v >= LIVE);
}

function upgrade() {
  if (edgeMode) return;
  edgeMode = true;
  for (const el of sides) el.classList.add('is-edge');
  setTimeout(hint, HINT_WAIT);
}

function hint() {
  if (hinted || !edgeMode) return;
  hinted = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const el of sides) el.classList.add('is-hint', 'is-live');

  setTimeout(() => {
    for (const el of sides) {
      el.classList.remove('is-hint');
      const lit = parseFloat(el.style.getPropertyValue('--glow')) || 0;
      if (lit < LIVE) el.classList.remove('is-live');
    }
  }, HINT_MS);
}

let queued = false;
let mx = -1;

function apply() {
  queued = false;
  const w = window.innerWidth;
  for (const el of sides) {
    const dist = el.side === 'left' ? mx : w - mx;
    glow(el, mx < 0 ? 0 : 1 - Math.min(1, dist / ZONE));
  }
}

function onMove(ev) {
  if (ev.pointerType && ev.pointerType !== 'mouse') return;
  upgrade();
  mx = ev.clientX;
  if (queued) return;
  queued = true;
  requestAnimationFrame(apply);
}

function mount() {
  if (sides.length) return;
  for (const side of ['left', 'right']) {
    const el = build(side);
    sides.push(el);
    document.body.append(el);
  }

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) upgrade();

  window.addEventListener('pointermove', onMove, { passive: true });

  document.addEventListener('pointerleave', () => { mx = -1; apply(); });
}

window.EdgeBack = {
  onBack(fn) { handler = fn; },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
})();
