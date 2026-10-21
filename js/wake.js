/* Background scene for every page without a creature of its own: still water
   that the pointer cuts through, leaving a wake.

   The wake is laid down in place, not drawn from where the pointer is now.
   Every step the pointer takes records a mark that keeps its own position,
   its own heading and its own age; the crest belonging to that mark drifts
   sideways as it ages, at that moment's speed times tan(19.47 deg). Two
   things fall out of that:

     - the V is the right shape and stays the right shape through turns,
       because each mark spread from the heading it was actually made with;
     - it stays where it was made. Stop the pointer and the trail does not
       follow or freeze: it goes on opening and fading where it lies.

   An earlier attempt measured the offset as arc length back from the
   pointer, which recomputed the whole V against the live cursor every frame
   and so dragged it along. Anchoring the offset to each mark's own age is
   the whole difference between a trail and a shape following a mouse.

   The 19.47 deg half-angle is arcsin(1/3), from deep-water dispersion -
   group velocity being half the phase velocity. It does not depend on speed:
   a faster boat makes a stronger wake, not a wider one. Speed sets how fast
   each crest walks outward, which is what keeps the angle constant.

   Registers itself with BrailleBG and shares that module's dot buffer. */
(() => {
'use strict';

const BG = window.BrailleBG;
if (!BG) return;

/* Neutral, not blue. The dot buffer uses alpha for dithering and writes the
   colour as given, so these are exactly how bright each thing looks — the
   values are picked so the wake stays clear of the swell and the particulate
   rather than to tint anything. */
const FOAM  = [236, 238, 240];   // close in, still sharp
const CREST = [172, 176, 178];   // once it has spread and lost its energy
const SPECK = [142, 144, 146];   // suspended particulate, so still water is not dead

/* How fast a crest walks aside, as a fraction of the pointer's own speed.
   The physical value is tan(19.47 deg) = 0.3536, the Kelvin half-angle. That
   is right for a hull on open water and far too wide for a cursor on a page:
   the V swallows the screen and stops reading as a trail. This is a deliberate
   departure, not an approximation of it. */
const SPREAD = 0.16;       // about 9 degrees
const LIFE = 2.9;          // seconds a mark stays on the water
const MIN_STEP = 3.6;      // visual units of travel between marks
const MARKS = 190;
const SPEED_CAP = 420;     // visual units/sec; a flick should not tear the water open
const FAST = 170;          // what counts as full strength
const CROSS_EVERY = 13;    // visual units between transverse crests
const SPECKS = 24;

/* The open water: a Tessendorf spectral ocean.

   The earlier version summed four sine waves of fixed direction and speed.
   That is a rigid pattern translating across the page, which is exactly what
   it looked like. Real water does not do that, and the reason is dispersion:
   in deep water a wave of number k travels at omega = sqrt(g k), so long
   waves outrun short ones and the surface is forever rearranging itself. No
   fixed set of sines can show that, however many you add.

   So the field is built the way ocean rendering has done it since Tessendorf:
   draw a random spectrum once, advance each mode by its own dispersion, and
   inverse-FFT the whole lot back into a height field every frame.

     h0(k)   = (1/sqrt 2)(xr + i xi) sqrt(P(k))     amplitudes, drawn once
     P(k)    = A exp(-1/(kL)^2) / k^4 |k.w|^2       Phillips, L = V^2/g
     omega   = sqrt(g k)                            deep-water dispersion
     h(k,t)  = h0(k) e^(i omega t) + h0*(-k) e^(-i omega t)
     h(x,t)  = IFFT[ h(k,t) ]

   The conjugate term is what keeps the result real. Cost is one N x N inverse
   FFT per frame rather than a sine evaluation per pixel, which is why this is
   cheaper than the four-wave version it replaces despite being a spectrum of
   several thousand modes. It needs no interaction and no state carried frame
   to frame: t alone drives it. */
const N = 64;                   // spectrum grid, power of two
const G = 9.81;
/* Sets the dominant wavelength. Phillips peaks at k = 0.707/L with L = V^2/g,
   so the wavelength carrying most of the energy is about 8.9 L. At V = 31
   that is ~870 units against a ~400 unit viewport: a single swell filling a
   third of the page and flat water elsewhere. V = 9.5 puts the peak near 80
   units, which is five or six waves across the screen. */
const WIND_SPEED = 9.5;
const WIND_DIR = 0.42;          // radians
const CAPILLARY = 3.5;          // visual units; shorter waves are damped out
const SWELL = [134, 137, 139];  // the open water; the wake rides brighter on top
const CREST_T = 0.28;           // a little under 1 sigma of the normalised height
const SWELL_A = 66;             // alpha at a full crest

/* How far a crest gets before it is spent. This is a fade, not a clamp: pin
   the offset instead and a crest stops moving on reaching it, sitting visible
   for seconds — frozen, then gone. Tying the fade to the spread means a crest
   is always travelling while it can be seen, and the energy it spends opening
   the V is the energy it runs out of.

   The reach is proportional to the speed at that moment, which is what makes
   a quick flick throw a wake right across the page and a slow drag leave a
   short one. Worth seeing why: a crest walks aside at speed * SPREAD, so a
   reach of speed * REACH_T is spent after REACH_T / SPREAD seconds whatever
   the speed — a constant lifetime. Length is speed * lifetime, so it scales
   with speed, and width does too. The V keeps its angle and simply gets
   bigger, which is what a faster hull does.

   With a fixed reach instead, the two cancel and every wake comes out the
   same length however fast the pointer went.

   REACH_T sets the width, and the width alone: length is REACH_T / SPREAD, so
   trimming one while trimming the other keeps the trail long and makes it
   thin, rather than simply shrinking the whole thing. */
const REACH_T = 0.14;      // seconds of travel a crest is worth
const REACH_MIN = 0.015;   // of visW, so a crawl still marks the water
const REACH_MAX = 0.14;    // of visW, so a flick does not swallow the page

const marks = [];
const specks = [];
let t = 0;

function dims() { return BG.dims(); }

/* ---------------------------------------------------------------- pointer */

let lastX = 0, lastY = 0, lastAt = 0, sinceCross = 0, seen = false;

/* Heading and speed are smoothed before a mark is made. Taken raw between two
   consecutive samples the baseline is a few units long, so hand tremor swings
   the heading wildly — and since the crest offset is that heading's normal
   times age, the error grows with time. The trail came out as a sawtooth.
   An exponential mean over the recent path costs nothing and is what makes
   the two crest lines read as water rather than as a seismograph. */
let shx = 0, shy = 0, sspd = 0;

function onMove(ev) {
  if (ev.pointerType && ev.pointerType !== 'mouse') return;
  const d = dims();
  const x = ev.clientX / window.innerWidth * d.dotW;
  const y = ev.clientY / window.innerHeight * d.dotH;

  if (!seen) { seen = true; lastX = x; lastY = y; lastAt = t; return; }

  // Work in visual units, so a sideways move is not counted as larger than
  // the vertical one it matches on screen.
  const dx = (x - lastX) * d.aspect, dy = y - lastY;
  const step = Math.hypot(dx, dy);
  if (step < MIN_STEP) return;

  const dt = Math.max(1e-3, t - lastAt);
  const speed = Math.min(SPEED_CAP, step / dt);

  const ux = dx / step, uy = dy / step;
  if (!marks.length) {
    shx = ux; shy = uy; sspd = speed;
  } else {
    shx += (ux - shx) * 0.17;
    shy += (uy - shy) * 0.17;
    const n = Math.hypot(shx, shy) || 1;
    shx /= n; shy /= n;
    sspd += (speed - sspd) * 0.12;
  }

  sinceCross += step;
  const cross = sinceCross >= CROSS_EVERY;
  if (cross) sinceCross = 0;

  marks.push({
    x, y,
    hx: shx, hy: shy,                      // smoothed heading, unit, visual
    spread: sspd * SPREAD,                 // how fast this crest walks aside
    reach: Math.max(d.visW * REACH_MIN,
                    Math.min(d.visW * REACH_MAX, sspd * REACH_T)),
    v: Math.min(1, sspd / FAST),
    at: t,
    cross,
  });
  if (marks.length > MARKS) marks.shift();

  lastX = x; lastY = y; lastAt = t;
}

window.addEventListener('pointermove', onMove, { passive: true });

/* ------------------------------------------------------------------ setup */

/* ------------------------------------------------------------- spectrum */

/* Iterative radix-2 Cooley-Tukey, in place, with a positive exponent so it is
   the inverse transform. No normalisation: the field is scaled once against
   its own measured range instead, which also absorbs the spectrum amplitude. */
const LEVELS = Math.log2(N);
const REV = new Uint16Array(N);
for (let i = 0; i < N; i++) {
  let x = i, r = 0;
  for (let j = 0; j < LEVELS; j++) { r = (r << 1) | (x & 1); x >>= 1; }
  REV[i] = r;
}
const TW_C = new Float32Array(N / 2), TW_S = new Float32Array(N / 2);
for (let i = 0; i < N / 2; i++) {
  TW_C[i] = Math.cos(2 * Math.PI * i / N);
  TW_S[i] = Math.sin(2 * Math.PI * i / N);
}

function fft1d(re, im) {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) {
      let v = re[i]; re[i] = re[j]; re[j] = v;
      v = im[i]; im[i] = im[j]; im[j] = v;
    }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = i, k = 0; j < i + half; j++, k += step) {
        const c = TW_C[k], sn = TW_S[k];
        const ar = re[j + half], ai = im[j + half];
        const tr = ar * c - ai * sn, ti = ar * sn + ai * c;
        re[j + half] = re[j] - tr; im[j + half] = im[j] - ti;
        re[j] += tr; im[j] += ti;
      }
    }
  }
}

/* omega differs per cell, so the phase cannot be advanced incrementally
   without drift. A table costs one multiply and a mask per cell instead of a
   sine and a cosine; at 2048 steps the error is 0.003 rad, which no dithered
   dot will ever show. */
const PH = 2048, PH_K = PH / (2 * Math.PI);
const PH_C = new Float32Array(PH), PH_S = new Float32Array(PH);
for (let i = 0; i < PH; i++) {
  PH_C[i] = Math.cos(2 * Math.PI * i / PH);
  PH_S[i] = Math.sin(2 * Math.PI * i / PH);
}

const h0r = new Float32Array(N * N), h0i = new Float32Array(N * N);
const h1r = new Float32Array(N * N), h1i = new Float32Array(N * N);   // conj of -k
const omega = new Float32Array(N * N);
const fr = new Float32Array(N * N), fi = new Float32Array(N * N);
const colR = new Float32Array(N), colI = new Float32Array(N);
const height = new Float32Array(N * N);
let patch = 1, hScale = 1;

/* Which two cells each dot row and column falls between, and how far. These
   depend only on the viewport and the patch, so recomputing them per frame
   was 60k floors and divisions spent rediscovering a constant. */
let sampXA = null, sampXB = null, sampXT = null;
let sampYA = null, sampYB = null, sampYT = null;

function buildSampling(d) {
  const mk = (n, scale) => {
    const a = new Uint16Array(n), b = new Uint16Array(n), tt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f = i * scale;
      const i0 = Math.floor(f);
      tt[i] = f - i0;
      a[i] = ((i0 % N) + N) % N;
      b[i] = (a[i] + 1) % N;
    }
    return [a, b, tt];
  };
  [sampXA, sampXB, sampXT] = mk(d.dotW, N / patch * d.aspect);
  [sampYA, sampYB, sampYT] = mk(d.dotH, N / patch);
}

// Box-Muller: the spectrum wants Gaussian draws, not uniform ones.
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function phillips(kx, kz) {
  const k2 = kx * kx + kz * kz;
  if (k2 < 1e-12) return 0;
  const k = Math.sqrt(k2);
  const L = WIND_SPEED * WIND_SPEED / G;          // largest wave the wind raises
  const dot = (kx / k) * Math.cos(WIND_DIR) + (kz / k) * Math.sin(WIND_DIR);
  // Directional, suppressed above L, and damped below the capillary cutoff.
  return Math.exp(-1 / (k2 * L * L)) / (k2 * k2) * dot * dot *
         Math.exp(-k2 * CAPILLARY * CAPILLARY);
}

function buildSpectrum(d) {
  // One patch covering the viewport: tiling a smaller one shows its seams.
  patch = Math.max(d.visW, d.visH) * 1.15;
  const dk = 2 * Math.PI / patch;

  for (let z = 0; z < N; z++) {
    const kz = (z - N / 2) * dk;
    for (let x = 0; x < N; x++) {
      const kx = (x - N / 2) * dk;
      const i = z * N + x;

      const a = Math.sqrt(phillips(kx, kz) / 2);
      h0r[i] = gauss() * a;
      h0i[i] = gauss() * a;

      const b = Math.sqrt(phillips(-kx, -kz) / 2);
      h1r[i] = gauss() * b;
      h1i[i] = -gauss() * b;                       // stored already conjugated

      omega[i] = Math.sqrt(G * Math.hypot(kx, kz));
    }
  }

  /* One pass to learn the field's spread. Scaling on the single highest peak
     was the first attempt and left the page nearly empty: Phillips puts most
     of its energy in the longest few waves, so one hump towers over the rest
     and everything else sits far below any useful threshold. The standard
     deviation is the honest measure of how high the water usually is, and
     3 sigma lands the normal range inside [-1, 1]. */
  hScale = 1;
  evolve(0);
  let sum = 0;
  for (let i = 0; i < N * N; i++) sum += height[i] * height[i];
  hScale = 1 / (3 * Math.max(1e-9, Math.sqrt(sum / (N * N))));

  buildSampling(d);
}

/* Split in two so the transform never lands whole on one frame. The rows go
   in one pass and the columns in the next, which updates the surface every
   other frame — the 30Hz it was being throttled to anyway — but at half the
   cost each time. Doing it in one go left a visible spike every other frame;
   the work is identical, only its distribution changed. */
function evolveRows(time) {
  for (let i = 0; i < N * N; i++) {
    const idx = ((omega[i] * time * PH_K) | 0) & (PH - 1);
    const c = PH_C[idx], sn = PH_S[idx];
    // h0 e^{iwt} + conj(h0(-k)) e^{-iwt}
    fr[i] = (h0r[i] * c - h0i[i] * sn) + (h1r[i] * c + h1i[i] * sn);
    fi[i] = (h0r[i] * sn + h0i[i] * c) + (h1i[i] * c - h1r[i] * sn);
  }

  // Copy rows through the scratch pair rather than handing fft1d a subarray:
  // a subarray allocates two views per call, 128 per transform, which at 30
  // transforms a second is enough garbage to show up as dropped frames.
  for (let z = 0; z < N; z++) {
    const off = z * N;
    for (let x = 0; x < N; x++) { colR[x] = fr[off + x]; colI[x] = fi[off + x]; }
    fft1d(colR, colI);
    for (let x = 0; x < N; x++) { fr[off + x] = colR[x]; fi[off + x] = colI[x]; }
  }
}

function evolveCols() {
  for (let x = 0; x < N; x++) {
    for (let z = 0; z < N; z++) { colR[z] = fr[z * N + x]; colI[z] = fi[z * N + x]; }
    fft1d(colR, colI);
    for (let z = 0; z < N; z++) { fr[z * N + x] = colR[z]; fi[z * N + x] = colI[z]; }
  }

  // The spectrum is stored with k = 0 at the centre, so the transform comes
  // back with its quadrants swapped; the checkerboard sign puts it right.
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      height[i] = fr[i] * (1 - 2 * ((x + z) & 1)) * hScale;
    }
  }
}

let half = 0;

function pumpOcean(time) {
  if (half === 0) { evolveRows(time); half = 1; }
  else { evolveCols(); half = 0; }
}

function evolve(time) { evolveRows(time); evolveCols(); }

function enter() {
  const d = dims();
  buildSpectrum(d);
  half = 0;
  marks.length = 0;
  seen = false;
  sinceCross = 0;

  specks.length = 0;
  for (let i = 0; i < SPECKS; i++) {
    specks.push({
      x: Math.random() * d.dotW,
      y: Math.random() * d.dotH,
      drift: 0.9 + Math.random() * 2.4,
      rise: -0.25 - Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      freq: 0.12 + Math.random() * 0.3,
      alpha: 26 + Math.random() * 40,
    });
  }
}

/* ---------------------------------------------------------------- drawing */

function dot(x, y, col, alpha) {
  const d = dims();
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= d.dotW || iy >= d.dotH || alpha < 4) return;
  BG.setDot(ix, iy, col[0], col[1], col[2], alpha);
  BG.touch(ix, iy);
}

function stroke(x0, y0, x1, y1, col, alpha) {
  const d = dims();
  const len = Math.hypot((x1 - x0) * d.aspect, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / 0.75));
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    dot(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, col, alpha);
  }
}

const col = [0, 0, 0];

function mix(a, b, u) {
  col[0] = a[0] + (b[0] - a[0]) * u;
  col[1] = a[1] + (b[1] - a[1]) * u;
  col[2] = a[2] + (b[2] - a[2]) * u;
}

function drawSwell() {
  const d = dims();
  if (!patch) return;

  // Half a transform per frame: the surface lands every second frame, and the
  // sampling below still runs on every one, so nothing stutters.
  pumpOcean(t);

  if (!sampXA || sampXA.length !== d.dotW) buildSampling(d);

  const span = 1 / (1 - CREST_T);

  for (let y = 0; y < d.dotH; y++) {
    const ty = sampYT[y], uy = 1 - ty;
    const rowA = sampYA[y] * N, rowB = sampYB[y] * N;

    for (let x = 0; x < d.dotW; x++) {
      const tx = sampXT[x], ux = 1 - tx;
      const xa = sampXA[x], xb = sampXB[x];

      // Bilinear, or the 64-cell grid shows as blocks at this dot density.
      const h = (height[rowA + xa] * ux + height[rowA + xb] * tx) * uy +
                (height[rowB + xa] * ux + height[rowB + xb] * tx) * ty;

      if (h <= CREST_T) continue;
      /* sqrt, not linear. Most of the surface that clears the threshold only
         just clears it, and a linear ramp gives those cells an alpha near
         zero — which the dither turns into almost no dots at all. The square
         root lifts the low end so a crest reads from the moment it forms. */
      dot(x, y, SWELL, SWELL_A * Math.sqrt((h - CREST_T) * span));
    }
  }
}

function moveSpecks(dt) {
  const d = dims();
  for (const s of specks) {
    s.x += s.drift * dt;
    s.y += s.rise * dt;
    if (s.x > d.dotW + 2) s.x = -2;
    if (s.y < -2) s.y = d.dotH + 2;
  }
}

function drawSpecks() {
  for (const s of specks) {
    const sway = Math.sin(t * s.freq * Math.PI * 2 + s.phase) * 1.4;
    dot(s.x, s.y + sway, SPECK, s.alpha);
  }
}

// Where a mark's two crests have reached by now, in dot coords.
function crestsOf(m, d, out) {
  const age = t - m.at;
  const off = m.spread * age;        // never clamped: clamping is what froze it
  // Normal to this mark's own heading, which is what keeps the V correct
  // through a turn rather than smearing it.
  const ox = -m.hy * off / d.aspect, oy = m.hx * off;
  out.off = off;
  out.age = age;
  out.lx = m.x + ox; out.ly = m.y + oy;
  out.rx = m.x - ox; out.ry = m.y - oy;
  return out;
}

const cur = {}, prev = {};

function drawWake() {
  const d = dims();
  if (marks.length < 2) return;

  let have = false;

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    crestsOf(m, d, cur);

    // Spent by spreading, with the clock only as a backstop for a pointer
    // creeping so slowly that its crests would otherwise never go anywhere.
    const spent = 1 - cur.off / m.reach;
    const life = Math.min(spent, 1 - cur.age / LIFE);
    if (life <= 0) { have = false; continue; }

    const alpha = 235 * Math.pow(life, 1.15) * (0.22 + 0.78 * m.v);

    mix(FOAM, CREST, Math.min(1, cur.off / (d.visW * 0.22)));

    if (have && alpha >= 4) {
      stroke(prev.lx, prev.ly, cur.lx, cur.ly, col, alpha);
      stroke(prev.rx, prev.ry, cur.rx, cur.ry, col, alpha);
    }

    // Transverse crests: the arcs that run across the inside of the V,
    // bowed back from the heading.
    if (m.cross && alpha >= 5 && cur.off > 1.5) {
      const bx = -m.hx * cur.off * 0.5 / d.aspect, by = -m.hy * cur.off * 0.5;
      const cx = m.x + bx, cy = m.y + by;
      let px = cur.lx, py = cur.ly;
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, w = 1 - u;
        // Quadratic through left crest, a point pulled astern, right crest.
        const qx = w * w * cur.lx + 2 * w * u * cx + u * u * cur.rx;
        const qy = w * w * cur.ly + 2 * w * u * cy + u * u * cur.ry;
        stroke(px, py, qx, qy, col, alpha * 0.42);
        px = qx; py = qy;
      }
    }

    prev.lx = cur.lx; prev.ly = cur.ly;
    prev.rx = cur.rx; prev.ry = cur.ry;
    have = true;
  }

  // The disturbance under the pointer itself.
  const head = marks[marks.length - 1];
  if (t - head.at < 0.3) {
    dot(head.x, head.y, FOAM, 170 * head.v);
    dot(head.x + 1, head.y, FOAM, 100 * head.v);
    dot(head.x - 1, head.y, FOAM, 100 * head.v);
  }
}

/* ------------------------------------------------------------------ scene */

BG.scenes.wake = {
  enter,
  update(dt) {
    t += dt;
    moveSpecks(dt);
    while (marks.length && t - marks[0].at > LIFE) marks.shift();
  },
  draw() {
    drawSwell();
    drawSpecks();
    drawWake();
  },
};

})();
