/* The way back, on every page but the landing one.

   There is no header anywhere: bring the pointer near the left or right edge
   and that edge lights up with "go back". Where back leads is the page's
   business — a page with its own in-page state registers a handler through
   EdgeBack.onBack() and returns true once it has handled the step itself.
   Anything unhandled falls through to the landing page, so the chain on
   tools.html runs tool -> card grid -> home.

   Included by the inner pages only. index.html has nowhere to go back to. */
(() => {
'use strict';

const ZONE = 170;          // px from the edge where the halo starts to show
const LIVE = 0.22;         // below this the strip stops taking clicks

let handler = null;
let edgeMode = false;
const sides = [];

function activate() {
  // A handler that returns true has consumed this step; otherwise it is a
  // step out of the page altogether.
  if (handler && handler()) return;
  const go = () => { location.href = 'index.html'; };
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
  // The strips are fixed and full height, so while they are invisible they
  // would still swallow clicks meant for the page underneath.
  el.classList.toggle('is-live', v >= LIVE);
}

/* ------------------------------------------------------------------ mount */

/* Proximity is only meaningful for a pointer that hovers, so the edge strips
   stay off until a mouse actually moves. The media query for this reports
   hover:none in some browsers (headless Chromium among them) even with a
   mouse attached, so the event is the evidence, not the query. */
function upgrade() {
  if (edgeMode) return;
  edgeMode = true;
  for (const el of sides) el.classList.add('is-edge');
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

  // The query is a hint, not the authority: trusting it alone put a corner
  // pill on desktops whose browser mis-reports hover (headless Chromium does),
  // and distrusting it entirely flashed that pill on every load until the
  // first mouse move. Take it when it says yes; let the event correct it.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) upgrade();

  window.addEventListener('pointermove', onMove, { passive: true });
  // Leaving the window should not leave a halo burning on the edge.
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
