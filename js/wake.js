(() => {
'use strict';

const BG = window.BrailleBG;
if (!BG) return;

const FOAM  = [236, 238, 240];
const CREST = [172, 176, 178];
const SPECK = [142, 144, 146];

const SPREAD = 0.16;
const LIFE = 2.9;
const MIN_STEP = 3.6;
const MARKS = 190;
const SPEED_CAP = 420;
const FAST = 170;
const CROSS_EVERY = 13;
const SPECKS = 24;

const N = 64;
const G = 9.81;

const WIND_SPEED = 9.5;
const WIND_DIR = 0.42;
const CAPILLARY = 3.5;
const SWELL_LOW = [116, 119, 121];
const SWELL_HIGH = [164, 168, 171];
const CREST_T = 0.28;
const SWELL_A = 66;

const REACH_T = 0.14;
const REACH_MIN = 0.015;
const REACH_MAX = 0.14;

const marks = [];
const specks = [];
let t = 0;

function dims() { return BG.dims(); }

let lastX = 0, lastY = 0, lastAt = 0, sinceCross = 0, seen = false;

let shx = 0, shy = 0, sspd = 0;

function onMove(ev) {
  if (ev.pointerType && ev.pointerType !== 'mouse') return;
  const d = dims();
  const x = ev.clientX / window.innerWidth * d.dotW;
  const y = ev.clientY / window.innerHeight * d.dotH;

  if (!seen) { seen = true; lastX = x; lastY = y; lastAt = t; return; }

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
    hx: shx, hy: shy,
    spread: sspd * SPREAD,
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

const PH = 2048, PH_K = PH / (2 * Math.PI);
const PH_C = new Float32Array(PH), PH_S = new Float32Array(PH);
for (let i = 0; i < PH; i++) {
  PH_C[i] = Math.cos(2 * Math.PI * i / PH);
  PH_S[i] = Math.sin(2 * Math.PI * i / PH);
}

const h0r = new Float32Array(N * N), h0i = new Float32Array(N * N);
const h1r = new Float32Array(N * N), h1i = new Float32Array(N * N);
const omega = new Float32Array(N * N);
const fr = new Float32Array(N * N), fi = new Float32Array(N * N);
const colR = new Float32Array(N), colI = new Float32Array(N);
const height = new Float32Array(N * N);
let patch = 1, hScale = 1;

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
  const L = WIND_SPEED * WIND_SPEED / G;
  const dot = (kx / k) * Math.cos(WIND_DIR) + (kz / k) * Math.sin(WIND_DIR);

  return Math.exp(-1 / (k2 * L * L)) / (k2 * k2) * dot * dot *
         Math.exp(-k2 * CAPILLARY * CAPILLARY);
}

function buildSpectrum(d) {
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
      h1i[i] = -gauss() * b;

      omega[i] = Math.sqrt(G * Math.hypot(kx, kz));
    }
  }

  hScale = 1;
  evolve(0);
  let sum = 0;
  for (let i = 0; i < N * N; i++) sum += height[i] * height[i];
  hScale = 1 / (3 * Math.max(1e-9, Math.sqrt(sum / (N * N))));

  buildSampling(d);
}

function evolveRows(time) {
  for (let i = 0; i < N * N; i++) {
    const idx = ((omega[i] * time * PH_K) | 0) & (PH - 1);
    const c = PH_C[idx], sn = PH_S[idx];

    fr[i] = (h0r[i] * c - h0i[i] * sn) + (h1r[i] * c + h1i[i] * sn);
    fi[i] = (h0r[i] * sn + h0i[i] * c) + (h1i[i] * c - h1r[i] * sn);
  }

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

const swell = [0, 0, 0];

function drawSwell() {
  const d = dims();
  if (!patch) return;

  pumpOcean(t);

  if (!sampXA || sampXA.length !== d.dotW) buildSampling(d);

  const span = 1 / (1 - CREST_T);

  for (let y = 0; y < d.dotH; y++) {
    const ty = sampYT[y], uy = 1 - ty;
    const rowA = sampYA[y] * N, rowB = sampYB[y] * N;

    for (let x = 0; x < d.dotW; x++) {
      const tx = sampXT[x], ux = 1 - tx;
      const xa = sampXA[x], xb = sampXB[x];

      const h = (height[rowA + xa] * ux + height[rowA + xb] * tx) * uy +
                (height[rowB + xa] * ux + height[rowB + xb] * tx) * ty;

      if (h <= CREST_T) continue;

      const u = Math.min(1, (h - CREST_T) * span);
      swell[0] = SWELL_LOW[0] + (SWELL_HIGH[0] - SWELL_LOW[0]) * u;
      swell[1] = SWELL_LOW[1] + (SWELL_HIGH[1] - SWELL_LOW[1]) * u;
      swell[2] = SWELL_LOW[2] + (SWELL_HIGH[2] - SWELL_LOW[2]) * u;
      dot(x, y, swell, SWELL_A * Math.sqrt(u));
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

function crestsOf(m, d, out) {
  const age = t - m.at;
  const off = m.spread * age;

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

    const spent = 1 - cur.off / m.reach;
    const life = Math.min(spent, 1 - cur.age / LIFE);
    if (life <= 0) { have = false; continue; }

    const alpha = 235 * Math.pow(life, 1.15) * (0.22 + 0.78 * m.v);

    mix(FOAM, CREST, Math.min(1, cur.off / (d.visW * 0.22)));

    if (have && alpha >= 4) {
      stroke(prev.lx, prev.ly, cur.lx, cur.ly, col, alpha);
      stroke(prev.rx, prev.ry, cur.rx, cur.ry, col, alpha);
    }

    if (m.cross && alpha >= 5 && cur.off > 1.5) {
      const bx = -m.hx * cur.off * 0.5 / d.aspect, by = -m.hy * cur.off * 0.5;
      const cx = m.x + bx, cy = m.y + by;
      let px = cur.lx, py = cur.ly;
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, w = 1 - u;

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

  const head = marks[marks.length - 1];
  if (t - head.at < 0.3) {
    dot(head.x, head.y, FOAM, 170 * head.v);
    dot(head.x + 1, head.y, FOAM, 100 * head.v);
    dot(head.x - 1, head.y, FOAM, 100 * head.v);
  }
}

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
