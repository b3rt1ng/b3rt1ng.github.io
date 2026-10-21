(() => {
'use strict';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

const FONT_SIZE = 15;
const FONT = `${FONT_SIZE}px "DejaVu Sans Mono","Liberation Mono",Menlo,Consolas,monospace`;

const BRAILLE_BASE = 0x2800;
const BIT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5].map(v => (v + 0.5) * 16);

let CHAR_W, CHAR_H, DOT_ASPECT;
let cols, rows, dotW, dotH;
let DPR = 1;

const POND = '#1e1e1e';

// Cell boundaries land on fractional pixels (CHAR_W is not an integer), and a
// fractional fillRect edge only partially covers its boundary pixel. That
// leaves a 1px seam that never clears, so snap the rect outwards.
function eraseRect(x, y, w, h) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.ceil(x + w), y1 = Math.ceil(y + h);
  ctx.fillStyle = POND;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}
let bufR, bufG, bufB, bufA;
let visW, visH;

// ---------------------------------------------------------------- buffers

function setDot(x, y, r, g, b, a) {
  if (x < 0 || x >= dotW || y < 0 || y >= dotH) return;
  const i = y * dotW + x;
  bufR[i] = r; bufG[i] = g; bufB[i] = b; bufA[i] = a;
}

let bbX0, bbY0, bbX1, bbY1;
function resetBBox() { bbX0 = dotW; bbY0 = dotH; bbX1 = -1; bbY1 = -1; }
function touch(x, y) {
  if (x < bbX0) bbX0 = x;
  if (x > bbX1) bbX1 = x;
  if (y < bbY0) bbY0 = y;
  if (y > bbY1) bbY1 = y;
}

// ------------------------------------------------------- triangle raster
// Barycentric fill, interpolating two attributes (s along body, v across).

function tri(x0,y0,s0,v0, x1,y1,s1,v1, x2,y2,s2,v2, shade) {
  let minX = Math.floor(Math.min(x0,x1,x2)); if (minX < 0) minX = 0;
  let maxX = Math.ceil (Math.max(x0,x1,x2)); if (maxX > dotW-1) maxX = dotW-1;
  let minY = Math.floor(Math.min(y0,y1,y2)); if (minY < 0) minY = 0;
  let maxY = Math.ceil (Math.max(y0,y1,y2)); if (maxY > dotH-1) maxY = dotH-1;
  if (minX > maxX || minY > maxY) return;

  const area = (x1-x0)*(y2-y0) - (x2-x0)*(y1-y0);
  if (area > -1e-9 && area < 1e-9) return;
  const inv = 1 / area;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((x1-x)*(y2-y) - (x2-x)*(y1-y)) * inv;
      if (w0 < -1e-6) continue;
      const w1 = ((x2-x)*(y0-y) - (x0-x)*(y2-y)) * inv;
      if (w1 < -1e-6) continue;
      const w2 = 1 - w0 - w1;
      if (w2 < -1e-6) continue;
      shade(x, y, w0*s0 + w1*s1 + w2*s2, w0*v0 + w1*v1 + w2*v2);
    }
  }
}

function quad(a, b, c, d, shade) {
  tri(a[0],a[1],a[2],a[3], b[0],b[1],b[2],b[3], c[0],c[1],c[2],c[3], shade);
  tri(a[0],a[1],a[2],a[3], c[0],c[1],c[2],c[3], d[0],d[1],d[2],d[3], shade);
}

// ------------------------------------------------------------------ rng

function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ koi body

// Half-width profile: blunt snout, widest just behind the head, slim peduncle.
const SHOULDER = 0.30;
const PEDUNCLE = 0.085;
function widthProfile(s) {
  if (s < SHOULDER) {
    const u = (SHOULDER - s) / (SHOULDER + 0.038);
    return Math.sqrt(Math.max(0, 1 - u * u));
  }
  const u = (s - SHOULDER) / (1 - SHOULDER);
  return Math.pow(1 - u, 0.62) * (1 - PEDUNCLE) + PEDUNCLE;
}

// Videler's carangiform amplitude envelope, normalised to body length.
function envelope(s) { return 0.02 - 0.0825 * s + 0.1625 * s * s; }

// ---------------------------------------------------- pattern (baked LUT)

const PW = 256, PH = 72;
let AR, AG, AB;        // albedo of whichever koi is currently being drawn
let shadeLUT;

// Palette lifted from the koi CLI (~/.koi/config.json).
const C_WHITE   = [255, 255, 255];
const C_SILVER  = [169, 169, 169];
const C_PUMPKIN = [248, 101, 70];
const C_CORAL   = [235, 111, 92];
const C_UMBER   = [123, 62, 0];

// Brown markings, built around the palette's umber. Umber on its own is dark
// enough to sink into the pond once the body shading knocks it down, so the
// patch itself runs lighter and keeps true umber for its edge.
const BROWN_LO   = [132, 72, 18];
const BROWN_HI   = [176, 103, 36];
const BROWN_EDGE = C_UMBER;

function bakePattern(seed) {
  const rnd = mulberry32(seed);

  // Kohaku-style stepped patches running down the back.
  const blobs = [];
  let s = 0.04 + rnd() * 0.10;
  while (s < 0.94) {
    const len = 0.12 + rnd() * 0.17;
    blobs.push({
      s: s + len * 0.5,
      v: (rnd() - 0.5) * 0.55,
      rs: len * 0.5,
      rv: 0.70 + rnd() * 0.55,
      p1: rnd() * 6.283, p2: rnd() * 6.283, p3: rnd() * 6.283,
      // Roughly a third of the markings come out brown instead of orange,
      // rolled per patch so no two koi share a layout.
      brown: rnd() < 0.36,
    });
    s += len + 0.07 + rnd() * 0.15;
  }

  const R = new Uint8Array(PW * PH);
  const G = new Uint8Array(PW * PH);
  const B = new Uint8Array(PW * PH);

  // Returns how strongly this point is covered, and by which patch — the
  // winner decides whether the marking is orange or brown.
  let hitBlob = null;
  const coverage = (set, s, v, soft) => {
    let m = 0;
    hitBlob = null;
    for (let i = 0; i < set.length; i++) {
      const b = set[i];
      const ds = (s - b.s) / b.rs;
      const dv = (v - b.v) / b.rv;
      const d = Math.sqrt(ds * ds + dv * dv);
      if (d > 2.2) continue;
      const ang = Math.atan2(dv, ds);
      // Irregular, hand-drawn edge (kiwa) from a few harmonics.
      const th = 1 + 0.21 * Math.sin(3 * ang + b.p1)
                   + 0.13 * Math.sin(5 * ang + b.p2)
                   + 0.07 * Math.sin(9 * ang + b.p3);
      const e = (th - d) / soft;
      if (e > m) { m = e; hitBlob = b; }
    }
    return m > 1 ? 1 : m;
  };

  for (let j = 0; j < PH; j++) {
    const v = (j / (PH - 1)) * 2 - 1;
    for (let i = 0; i < PW; i++) {
      const sv = i / (PW - 1);
      const idx = j * PW + i;

      // Tight edge: the patches should read as drawn shapes with a clear
      // boundary, not as a wash fading into the white.
      const red = coverage(blobs, sv, v, 0.045);

      const brown = hitBlob && hitBlob.brown;
      const lo = brown ? BROWN_LO : C_CORAL;
      const hi = brown ? BROWN_HI : C_PUMPKIN;
      const edge = brown ? BROWN_EDGE : C_UMBER;

      // Drift between the two tones so a patch is not a flat fill.
      const warm = 0.5 + 0.5 * Math.sin(sv * 19 + v * 5.5);
      let r = lo[0] + (hi[0] - lo[0]) * warm;
      let g = lo[1] + (hi[1] - lo[1]) * warm;
      let b = lo[2] + (hi[2] - lo[2]) * warm;

      // Darker banding where a patch meets white sharpens the kiwa edge.
      const rim = red * (1 - red) * 4;
      r += (edge[0] - r) * rim * 0.15;
      g += (edge[1] - g) * rim * 0.15;
      b += (edge[2] - b) * rim * 0.15;

      r = C_WHITE[0] + (r - C_WHITE[0]) * red;
      g = C_WHITE[1] + (g - C_WHITE[1]) * red;
      b = C_WHITE[2] + (b - C_WHITE[2]) * red;

      R[idx] = r; G[idx] = g; B[idx] = b;
    }
  }

  return { R, G, B };
}

// Lambert-ish cylinder shading + sheen, keyed on lateral position only. It
// depends on the viewing angle alone, so every koi shares one table.
function buildShadeLUT() {
  shadeLUT = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    const v = (i / 511) * 2 - 1;
    const round = Math.sqrt(Math.max(0, 1 - v * v));
    const spec = Math.exp(-((v + 0.34) * (v + 0.34)) / 0.018) * 0.30;
    // Crisp rim: the last sliver of the silhouette drops off hard.
    const rim = Math.min(1, (1 - Math.abs(v)) / 0.07);
    // Floor raised so the silhouette still reads against a grey pond.
    shadeLUT[i] = (0.60 + 0.40 * Math.pow(round, 0.5) + spec) * (0.78 + 0.22 * rim);
  }
}

function albedoAt(s, v, out) {
  let fi = s * (PW - 1); if (fi < 0) fi = 0; else if (fi > PW - 1) fi = PW - 1;
  let fj = (v * 0.5 + 0.5) * (PH - 1); if (fj < 0) fj = 0; else if (fj > PH - 1) fj = PH - 1;
  const i0 = fi | 0, j0 = fj | 0;
  const i1 = i0 < PW - 1 ? i0 + 1 : i0, j1 = j0 < PH - 1 ? j0 + 1 : j0;
  const tx = fi - i0, ty = fj - j0;
  const a = j0 * PW + i0, b = j0 * PW + i1, c = j1 * PW + i0, d = j1 * PW + i1;
  const w0 = (1-tx)*(1-ty), w1 = tx*(1-ty), w2 = (1-tx)*ty, w3 = tx*ty;
  out[0] = AR[a]*w0 + AR[b]*w1 + AR[c]*w2 + AR[d]*w3;
  out[1] = AG[a]*w0 + AG[b]*w1 + AG[c]*w2 + AG[d]*w3;
  out[2] = AB[a]*w0 + AB[b]*w1 + AB[c]*w2 + AB[d]*w3;
}

// ------------------------------------------------------------------ fish

// The head leaves a trail and the body is laid along it, so a turn bends the
// koi instead of swinging it round like a stick. PATH_N samples at L/60 apart
// cover a little over two body lengths — comfortably more than the 1.42 the
// body plus caudal fin needs.
const PATH_N = 128;
const PATH_STEP = 1 / 60;

const RAW = 180;       // dense samples of the raw wave curve
const SEG = 60;        // body spine points after arc-length resampling
const FIN_SEG = 20;    // caudal axis points

const rawX = new Float64Array(RAW + 1);
const rawY = new Float64Array(RAW + 1);
const rawL = new Float64Array(RAW + 1);

const spX = new Float64Array(SEG + 1), spY = new Float64Array(SEG + 1);
const spNX = new Float64Array(SEG + 1), spNY = new Float64Array(SEG + 1);
const spTX = new Float64Array(SEG + 1), spTY = new Float64Array(SEG + 1);
const finX = new Float64Array(FIN_SEG + 1), finY = new Float64Array(FIN_SEG + 1);
const finNX = new Float64Array(FIN_SEG + 1), finNY = new Float64Array(FIN_SEG + 1);

// Relative body lengths. Each entry becomes one koi with its own markings,
// size and tail cadence, so the two never fall into step with each other.
const SCALES = [1.0, 0.84, 0.70];

const fishes = SCALES.map(scale => ({
  x: 0, y: 0,
  heading: 0,
  targetHeading: 0,
  turnRate: 0,
  roll: 0,
  phase: Math.random() * Math.PI * 2,
  beat: 0.86 + Math.random() * 0.24,   // tail beats per second
  amp: 1,                              // beat-and-glide amplitude envelope
  speed: 0,
  scale,
  L: 0, W: 0, finLen: 0, finSpan: 0,
  px: new Float64Array(PATH_N),   // head trail, newest at pHead,
  py: new Float64Array(PATH_N),   // walking back in time with ++index
  pHead: 0,
  glideTimer: 0,
  gliding: false,
  wander: 0,
  pattern: bakePattern((Math.random() * 1e9) | 0),
}));

function resetFish() {
  const base = Math.max(55, Math.min(visW * 0.27, visH * 0.35));
  fishes.forEach((f, i) => {
    f.L = base * f.scale;
    f.W = f.L * 0.135;
    f.finLen = f.L * 0.28;
    f.finSpan = f.L * 0.20;
    // Spread evenly across the width and alternate between the upper and
    // lower lane, so the scene never opens with koi stacked on each other.
    // Same-lane neighbours face the same way, so they do not swim head-on.
    const rightward = i % 2 === 0;
    f.x = visW * (0.18 + 0.64 * ((i + 0.5) / fishes.length));
    f.y = visH * (rightward ? 0.38 : 0.62);
    // Enter broadside so the first seconds already read as a crossing koi.
    f.heading = (rightward ? 0 : Math.PI) + (Math.random() - 0.5) * 0.4;
    f.targetHeading = f.heading;
    f.amp = 1;
    f.speed = 0;
    f.turnRate = 0;
    f.roll = 0;
    seedPath(f);
    f.gliding = false;
    f.glideTimer = 3 + Math.random() * 5;
    f.wander = 2 + Math.random() * 6;
  });
}

function updateFish(f, dt) {
  // --- beat and glide: bursts of tail beats, then coasting ---
  f.glideTimer -= dt;
  if (f.glideTimer <= 0) {
    f.gliding = !f.gliding;
    f.glideTimer = f.gliding ? 1.8 + Math.random() * 3.2
                                   : 4.0 + Math.random() * 5.5;
  }
  const targetAmp = f.gliding ? 0.18 : 1.0;
  f.amp += (targetAmp - f.amp) * Math.min(1, dt * 0.9);

  // --- heading: slow wander plus occasional deliberate turns ---
  f.wander -= dt;
  if (f.wander <= 0) {
    f.targetHeading += (Math.random() - 0.5) * 1.4;
    f.wander = 6 + Math.random() * 8;
  }

  // Stay in frame. Steer on the body's midpoint rather than the snout, and
  // repel continuously from each wall so turns start early and stay smooth.
  const bx = f.x - Math.cos(f.heading) * f.L * 0.5;
  const by = f.y - Math.sin(f.heading) * f.L * 0.5;
  const mx = f.L * 0.80, my = f.L * 1.00;
  let rx = 0, ry = 0;
  if (bx < mx)        rx += (mx - bx) / mx;
  if (bx > visW - mx) rx -= (bx - visW + mx) / mx;
  if (by < my)        ry += (my - by) / my;
  if (by > visH - my) ry -= (by - visH + my) / my;
  if (rx !== 0 || ry !== 0) {
    const push = Math.min(1.5, Math.sqrt(rx * rx + ry * ry));
    const want = Math.atan2(ry, rx);
    let d = want - f.targetHeading;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    f.targetHeading += d * Math.min(1, dt * 2.0 * push);
  }

  // Lean toward broadside travel: a koi crossing a wide canvas reads better
  // than one swimming at the viewer, and it keeps turns inside the frame.
  const level = Math.cos(f.targetHeading) >= 0 ? 0 : Math.PI;
  let hb = level - f.targetHeading;
  while (hb >  Math.PI) hb -= Math.PI * 2;
  while (hb < -Math.PI) hb += Math.PI * 2;
  f.targetHeading += hb * Math.min(1, dt * 0.26);

  let diff = f.targetHeading - f.heading;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // A koi cannot pivot tighter than its own body. Cap the turn so the arc it
  // traces stays wider than ~0.8 body lengths: any tighter and the trail
  // curls up smaller than the body is long, and the spine folds back on
  // itself. The floor lets a gliding fish still drift round slowly.
  let turn = diff * Math.min(1, dt * 0.95);
  const lim = Math.max(0.14, f.speed / (f.L * 0.8)) * dt;
  if (turn >  lim) turn =  lim;
  if (turn < -lim) turn = -lim;
  f.heading += turn;

  // Body curls into the turn; the tail trails to the outside. The gain is
  // raised to keep the curl visible now that turns are gentler.
  f.turnRate += (turn / Math.max(dt, 1e-4) - f.turnRate) * Math.min(1, dt * 2.2);
  f.roll += (-f.turnRate * 0.5 - f.roll) * Math.min(1, dt * 3);

  // Thrust follows the tail beat; drag does the rest.
  const thrust = f.amp * f.amp * f.L * 0.20;
  f.speed += (thrust - f.speed) * Math.min(1, dt * 0.7);

  f.phase += dt * f.beat * Math.PI * 2 * (0.55 + 0.45 * f.amp);
  f.x += Math.cos(f.heading) * f.speed * dt;
  f.y += Math.sin(f.heading) * f.speed * dt;

  // Drop a breadcrumb once the head has pulled far enough from the last one.
  const stepSq = (f.L * PATH_STEP) * (f.L * PATH_STEP);
  const dx = f.x - f.px[f.pHead], dy = f.y - f.py[f.pHead];
  if (dx * dx + dy * dy >= stepSq) {
    f.pHead = (f.pHead - 1 + PATH_N) % PATH_N;
    f.px[f.pHead] = f.x;
    f.py[f.pHead] = f.y;
  }
}

// Lay a straight trail behind the head so the buffer is never short; the real
// path overwrites it within a couple of body lengths of swimming.
function seedPath(f) {
  const cx = Math.cos(f.heading), cy = Math.sin(f.heading);
  const step = f.L * PATH_STEP;
  for (let i = 0; i < PATH_N; i++) {
    const d = (i + 1) * step;
    f.px[i] = f.x - cx * d;
    f.py[i] = f.y - cy * d;
  }
  f.pHead = 0;
}

// Build the spine: sample the travelling wave densely, then resample by arc
// length so the body keeps a constant length (fish bodies do not stretch).
function buildSpine(f) {
  const L = f.L;
  const k = Math.PI * 2 / 0.95;        // wavelength ~ 0.95 body lengths
  const sMax = 1.42;
  const ampScale = 1.2 * f.amp;

  // Centreline straight off the head's own track: walk the trail backwards,
  // asking for steadily greater distances, and hang the travelling wave off
  // it as a perpendicular offset. The body therefore lies where the head has
  // actually been, so a turn curves it instead of rotating it rigidly.
  let aX = f.x, aY = f.y, aD = 0;        // near end of the current trail span
  let bi = f.pHead;
  let bX = f.px[bi], bY = f.py[bi];
  let bD = Math.hypot(bX - aX, bY - aY);
  let back = 0;

  for (let i = 0; i <= RAW; i++) {
    const s = sMax * i / RAW;
    const want = s * L;

    while (bD < want && back < PATH_N - 2) {
      aX = bX; aY = bY; aD = bD;
      bi = (bi + 1) % PATH_N; back++;
      bX = f.px[bi]; bY = f.py[bi];
      bD = aD + Math.hypot(bX - aX, bY - aY);
    }

    const span = bD - aD;
    const t = span > 1e-9 ? (want - aD) / span : 0;
    const cx = aX + (bX - aX) * t;
    const cy = aY + (bY - aY) * t;

    // Tangent points forward along the trail, so the normal sign is stable.
    // The span can be exactly zero on the frame a breadcrumb is dropped, when
    // the head still sits on top of it; the heading is the right direction to
    // fall back on, and without it the normal collapses and the wave offset
    // vanishes for that one sample, kinking the nose.
    let tx = aX - bX, ty = aY - bY;
    let tl = Math.hypot(tx, ty);
    if (tl < 1e-6) { tx = Math.cos(f.heading); ty = Math.sin(f.heading); tl = 1; }
    tx /= tl; ty /= tl;

    const h = envelope(s) * ampScale * L * Math.sin(k * s - f.phase);
    rawX[i] = cx - ty * h;
    rawY[i] = cy + tx * h;
  }

  rawL[0] = 0;
  for (let i = 1; i <= RAW; i++) {
    const dx = rawX[i] - rawX[i-1], dy = rawY[i] - rawY[i-1];
    rawL[i] = rawL[i-1] + Math.sqrt(dx * dx + dy * dy);
  }

  // The wave adds length, so resample to pin the body back to exactly L.
  const ax = 1 / DOT_ASPECT;
  let cursor = 0;

  const place = (dist, outX, outY, idx) => {
    while (cursor < RAW - 1 && rawL[cursor + 1] < dist) cursor++;
    const seg = rawL[cursor + 1] - rawL[cursor];
    const t = seg > 1e-9 ? (dist - rawL[cursor]) / seg : 0;
    outX[idx] = rawX[cursor] + (rawX[cursor+1] - rawX[cursor]) * t;
    outY[idx] = rawY[cursor] + (rawY[cursor+1] - rawY[cursor]) * t;
  };

  for (let i = 0; i <= SEG; i++) place(L * i / SEG, spX, spY, i);
  for (let j = 0; j <= FIN_SEG; j++) place(L + f.finLen * j / FIN_SEG, finX, finY, j);

  // Visual space -> dot space happens here, once.
  for (let i = 0; i <= SEG; i++) spX[i] *= ax;
  for (let j = 0; j <= FIN_SEG; j++) finX[j] *= ax;

  frames(spX, spY, spTX, spTY, spNX, spNY, SEG);
  frames(finX, finY, null, null, finNX, finNY, FIN_SEG);
}

function frames(px, py, tx, ty, nx, ny, n) {
  for (let i = 0; i <= n; i++) {
    const a = i > 0 ? i - 1 : 0;
    const b = i < n ? i + 1 : n;
    let dx = (px[b] - px[a]) * DOT_ASPECT;   // measure in isotropic space
    let dy = py[b] - py[a];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    if (tx) { tx[i] = dx; ty[i] = dy; }
    nx[i] = -dy; ny[i] = dx;
  }
}

// ---------------------------------------------------------------- shading

const rgb = [0, 0, 0];

// Halftone, not a fill. Coverage follows luminance, so the pale flanks stay
// dense while the orange and brown markings thin out — the colours end up
// separated by dot density as much as by hue, which is what makes the shapes
// read as distinct regions instead of one solid Braille block.
const DOT_FLOOR = 22;   // keeps the silhouette continuous in the dark areas
const DOT_RANGE = 162;

function shadeBody(x, y, s, v) {
  albedoAt(s, v, rgb);
  let li = ((v * 0.5 + 0.5) * 511) | 0;
  if (li < 0) li = 0; else if (li > 511) li = 511;
  // Fade very slightly toward the tail for depth.
  const k = shadeLUT[li] * (1 - 0.10 * s);

  // Sparse dots lose their colour fast, so the ink keeps more of its punch
  // than the shading alone would give it; the shading rides on coverage.
  const kc = Math.sqrt(k);
  let r = rgb[0] * kc, g = rgb[1] * kc, b = rgb[2] * kc;
  if (r > 255) r = 255;
  if (g > 255) g = 255;
  if (b > 255) b = 255;

  // Coverage tracks the body shading only, never the hue: keying it on
  // luminance drains the orange and brown patches of dots and they stop
  // reading as regions at all. Every colour gets the same density, so the
  // boundaries come from hue against a uniform stipple.
  setDot(x, y, r, g, b, DOT_FLOOR + k * DOT_RANGE);
  touch(x, y);
}

function makeFinShader(sBase, sSpan, rayCount, baseAlpha, tint, pale) {
  return (x, y, u, a) => {
    albedoAt(sBase + sSpan * u, a * 0.85, rgb);
    // Fin rays read as fine bright lines fanning from the base.
    const ray = Math.pow(Math.abs(Math.cos(a * rayCount * Math.PI)), 6);
    const k = (0.58 + 0.26 * ray) * tint;
    // Membranes wash out toward the trailing edge, as thin tissue does.
    const p = pale * u;
    let r = rgb[0] * k, g = rgb[1] * k, b = rgb[2] * k;
    r += (C_WHITE[0] - r) * p;
    g += (C_WHITE[1] - g) * p;
    b += (C_WHITE[2] - b) * p;
    let alpha = baseAlpha * (1 - 0.34 * u) * (1 - 0.14 * Math.abs(a)) * (0.76 + 0.24 * ray);
    if (alpha < 12) return;
    if (alpha > 255) alpha = 255;
    setDot(x, y, r, g, b, alpha);
    touch(x, y);
  };
}

// Built once: they read the current koi through AR/AG/AB, so one instance
// each serves every fish and no closures are allocated per frame.
const SHADE_CAUDAL = makeFinShader(0.90, 0.10, 9, 240, 1.10, 0.52);
const SHADE_PAIRED = makeFinShader(0.40, 0.08, 5, 205, 1.05, 0.55);
const SHADE_DORSAL = makeFinShader(0.45, 0.25, 7, 240, 0.70, 0.12);

// ------------------------------------------------------------------ draw

function sampleFinAxis(t, out) {
  const f = t * FIN_SEG;
  let i = f | 0; if (i > FIN_SEG - 1) i = FIN_SEG - 1;
  const k = f - i;
  out[0] = finX[i] + (finX[i+1] - finX[i]) * k;
  out[1] = finY[i] + (finY[i+1] - finY[i]) * k;
  out[2] = finNX[i] + (finNX[i+1] - finNX[i]) * k;
  out[3] = finNY[i] + (finNY[i+1] - finNY[i]) * k;
}

const AX = [0, 0, 0, 0];
const NA = 18, NU = 8;
const ptsA = new Float64Array((NA + 1) * (NU + 1) * 2);

function drawCaudal(f) {
  const ax = 1 / DOT_ASPECT;
  const shade = SHADE_CAUDAL;
  const pedW = f.W * PEDUNCLE;

  for (let ia = 0; ia <= NA; ia++) {
    const a = (ia / NA) * 2 - 1;
    const aa = Math.abs(a);
    // Forked tail: the outer lobes reach further back than the centre notch.
    const reach = 0.68 + 0.32 * Math.pow(aa, 1.3);
    for (let iu = 0; iu <= NU; iu++) {
      const u = iu / NU;
      sampleFinAxis(u * reach, AX);
      // Start at the peduncle's own width so the fin joins the body cleanly.
      const spread = a * (pedW + (f.finSpan - pedW) * Math.pow(u, 0.8));
      const o = (ia * (NU + 1) + iu) * 2;
      ptsA[o]     = AX[0] + AX[2] * spread * ax;
      ptsA[o + 1] = AX[1] + AX[3] * spread;
    }
  }

  const A = [0,0,0,0], B = [0,0,0,0], C = [0,0,0,0], D = [0,0,0,0];
  for (let ia = 0; ia < NA; ia++) {
    const a0 = (ia / NA) * 2 - 1, a1 = ((ia + 1) / NA) * 2 - 1;
    for (let iu = 0; iu < NU; iu++) {
      const u0 = iu / NU, u1 = (iu + 1) / NU;
      const p00 = (ia * (NU + 1) + iu) * 2;
      const p01 = (ia * (NU + 1) + iu + 1) * 2;
      const p11 = ((ia + 1) * (NU + 1) + iu + 1) * 2;
      const p10 = ((ia + 1) * (NU + 1) + iu) * 2;
      A[0] = ptsA[p00]; A[1] = ptsA[p00+1]; A[2] = u0; A[3] = a0;
      B[0] = ptsA[p01]; B[1] = ptsA[p01+1]; B[2] = u1; B[3] = a0;
      C[0] = ptsA[p11]; C[1] = ptsA[p11+1]; C[2] = u1; C[3] = a1;
      D[0] = ptsA[p10]; D[1] = ptsA[p10+1]; D[2] = u0; D[3] = a1;
      quad(A, B, C, D, shade);
    }
  }
}

// A fan of rays rooted on the body edge: pectorals and pelvics.
function drawPairedFin(f, sPos, side, length, phi0, phi1, flap, shade) {
  const ax = 1 / DOT_ASPECT;
  const i = Math.round(sPos * SEG);
  const bx = spX[i] + spNX[i] * side * widthProfile(sPos) * f.W * 0.95 * ax;
  const by = spY[i] + spNY[i] * side * widthProfile(sPos) * f.W * 0.95;
  const tx = spTX[i], ty = spTY[i];                // tangent already runs aft
  const nx = spNX[i] * side, ny = spNY[i] * side;  // pointing outboard

  const RA = 12, RU = 6;
  const root = length * 0.26;   // fins hinge along a line, not a single point
  const A = [0,0,0,0], B = [0,0,0,0], C = [0,0,0,0], D = [0,0,0,0];
  const px = (u, a) => {
    const phi = phi0 + (phi1 - phi0) * (a * 0.5 + 0.5) + flap;
    const dx = tx * Math.cos(phi) + nx * Math.sin(phi);
    const dy = ty * Math.cos(phi) + ny * Math.sin(phi);
    // Leading rays (most outboard) root forward; trailing rays sweep aft.
    const ox = bx - tx * a * root * 0.5 * ax;
    const oy = by - ty * a * root * 0.5;
    const r = length * u * (0.80 + 0.20 * Math.cos(a * 1.4));
    return [ox + dx * r * ax, oy + dy * r];
  };

  for (let ia = 0; ia < RA; ia++) {
    const a0 = (ia / RA) * 2 - 1, a1 = ((ia + 1) / RA) * 2 - 1;
    for (let iu = 0; iu < RU; iu++) {
      const u0 = iu / RU, u1 = (iu + 1) / RU;
      const q00 = px(u0, a0), q01 = px(u1, a0), q11 = px(u1, a1), q10 = px(u0, a1);
      A[0]=q00[0]; A[1]=q00[1]; A[2]=u0; A[3]=a0;
      B[0]=q01[0]; B[1]=q01[1]; B[2]=u1; B[3]=a0;
      C[0]=q11[0]; C[1]=q11[1]; C[2]=u1; C[3]=a1;
      D[0]=q10[0]; D[1]=q10[1]; D[2]=u0; D[3]=a1;
      quad(A, B, C, D, shade);
    }
  }
}

function drawDorsal(f) {
  // Seen from above the dorsal reads as a low ridge leaning with the roll.
  const ax = 1 / DOT_ASPECT;
  const s0 = 0.33, s1 = 0.70;
  const lean = f.roll * 0.8;
  const shade = SHADE_DORSAL;
  const N = 14;
  const A = [0,0,0,0], B = [0,0,0,0], C = [0,0,0,0], D = [0,0,0,0];

  // A narrow crest straddling the spine, leaning with the roll.
  const pt = (t, h) => {
    const s = s0 + (s1 - s0) * t;
    const i = Math.round(s * SEG);
    const height = Math.sin(Math.PI * Math.pow(t, 0.75)) * f.W * 0.09;
    const off = lean * f.W * 1.15 + h * height;
    return [spX[i] + spNX[i] * off * ax, spY[i] + spNY[i] * off];
  };

  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const q00 = pt(t0, -1), q01 = pt(t1, -1), q11 = pt(t1, 1), q10 = pt(t0, 1);
    A[0]=q00[0]; A[1]=q00[1]; A[2]=t0; A[3]=-0.8;
    B[0]=q01[0]; B[1]=q01[1]; B[2]=t1; B[3]=-0.8;
    C[0]=q11[0]; C[1]=q11[1]; C[2]=t1; C[3]= 0.8;
    D[0]=q10[0]; D[1]=q10[1]; D[2]=t0; D[3]= 0.8;
    quad(A, B, C, D, shade);
  }
}

function drawBody(f) {
  const ax = 1 / DOT_ASPECT;
  const A = [0,0,0,0], B = [0,0,0,0], C = [0,0,0,0], D = [0,0,0,0];
  let pw = widthProfile(0) * f.W;
  let plx = spX[0] - spNX[0] * pw * ax, ply = spY[0] - spNY[0] * pw;
  let prx = spX[0] + spNX[0] * pw * ax, pry = spY[0] + spNY[0] * pw;

  for (let i = 1; i <= SEG; i++) {
    const s = i / SEG;
    const w = widthProfile(s) * f.W;
    const lx = spX[i] - spNX[i] * w * ax, ly = spY[i] - spNY[i] * w;
    const rx = spX[i] + spNX[i] * w * ax, ry = spY[i] + spNY[i] * w;
    const ps = (i - 1) / SEG;
    A[0]=plx; A[1]=ply; A[2]=ps; A[3]=-1;
    B[0]=lx;  B[1]=ly;  B[2]=s;  B[3]=-1;
    C[0]=rx;  C[1]=ry;  C[2]=s;  C[3]= 1;
    D[0]=prx; D[1]=pry; D[2]=ps; D[3]= 1;
    quad(A, B, C, D, shadeBody);
    plx = lx; ply = ly; prx = rx; pry = ry;
  }
}

function drawBarbels(f) {
  const ax = 1 / DOT_ASPECT;
  // The whiskers that make a koi a koi.
  const h = 0;
  const hw = widthProfile(0) * f.W;
  for (let side = -1; side <= 1; side += 2) {
    for (let b = 0; b < 2; b++) {
      const base = 0.55 + b * 0.35;
      const len = f.L * (b === 0 ? 0.055 : 0.038);
      const ang = 0.55 + Math.sin(f.phase * 0.8 + b * 2 + side) * 0.3;
      const dirx = -spTX[h] * Math.cos(ang) + spNX[h] * side * Math.sin(ang);
      const diry = -spTY[h] * Math.cos(ang) + spNY[h] * side * Math.sin(ang);
      const sx = spX[h] + spNX[h] * side * hw * base * ax;
      const sy = spY[h] + spNY[h] * side * hw * base;
      const steps = 6;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const x = Math.round(sx + dirx * len * t * ax);
        const y = Math.round(sy + diry * len * t);
        setDot(x, y, C_SILVER[0], C_SILVER[1], C_SILVER[2], 215 - t * 95);
        touch(x, y);
      }
    }
  }
}

// --------------------------------------------------------------- ripples

// Rain on the pond, drawn before the koi so they swim over it. Several rings
// can be open at once, but never on top of each other: a new drop is only
// placed where it has room to grow without touching a live one.
const ripples = [];
const MAX_RIPPLES = 4;
const PLACE_TRIES = 20;

let nextDrop = 0.3 + Math.random() * 0.8;

function spawnRipple() {
  if (ripples.length >= MAX_RIPPLES) return;

  const max = 34 + Math.random() * 30;

  for (let t = 0; t < PLACE_TRIES; t++) {
    const x = Math.random() * dotW;
    const y = Math.random() * dotH;

    // Clear of every live ring at its own full size, so the two never meet.
    let clear = true;
    for (const rp of ripples) {
      const dx = (x - rp.x) * DOT_ASPECT;
      const dy = y - rp.y;
      if (Math.sqrt(dx * dx + dy * dy) < max + rp.max + 8) { clear = false; break; }
    }
    if (!clear) continue;

    ripples.push({
      x, y, r: 0, max,
      speed: 20 + Math.random() * 9,        // visual units per second
      thickness: 1.6 + Math.random() * 0.5,
    });
    return;
  }
  // Pond too crowded right now; the next tick tries again.
}

function updateRipples(dt) {
  nextDrop -= dt;
  if (nextDrop <= 0) {
    spawnRipple();
    nextDrop = 0.5 + Math.random();
  }

  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.r += rp.speed * dt;
    if (rp.r >= rp.max) ripples.splice(i, 1);
  }
}

function drawRipples() {
  for (const rp of ripples) {
    const life = 1 - rp.r / rp.max;
    if (life <= 0) continue;

    // Same aspect trick as the fish: x is measured in wider dots than y.
    const reach = (rp.r + rp.thickness + 1) / DOT_ASPECT;
    const x0 = Math.max(0, Math.floor(rp.x - reach));
    const x1 = Math.min(dotW - 1, Math.ceil(rp.x + reach));
    const y0 = Math.max(0, Math.floor(rp.y - rp.r - rp.thickness - 1));
    const y1 = Math.min(dotH - 1, Math.ceil(rp.y + rp.r + rp.thickness + 1));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - rp.x) * DOT_ASPECT;
        const dy = y - rp.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const edge = 1 - Math.abs(d - rp.r) / rp.thickness;
        if (edge <= 0) continue;
        const a = edge * life * life * 170;
        if (a < 10) continue;
        setDot(x, y, C_SILVER[0], C_SILVER[1], C_SILVER[2], a);
        touch(x, y);
      }
    }
  }
}


// ---------------------------------------------------------------- output

let prevX0 = 0, prevY0 = 0, prevX1 = -1, prevY1 = -1;

function present() {
  // Only repaint the cells the fish touches, plus whatever it just left.
  let c0 = 0, r0 = 0, c1 = -1, r1 = -1;
  if (bbX1 >= bbX0) {
    c0 = (bbX0 / 2) | 0; c1 = (bbX1 / 2) | 0;
    r0 = (bbY0 / 4) | 0; r1 = (bbY1 / 4) | 0;
  }

  const clrX0 = Math.min(c0, prevX0), clrY0 = Math.min(r0, prevY0);
  const clrX1 = Math.max(c1, prevX1), clrY1 = Math.max(r1, prevY1);
  if (clrX1 >= clrX0 && clrY1 >= clrY0) {
    eraseRect(clrX0 * CHAR_W, clrY0 * CHAR_H,
              (clrX1 - clrX0 + 1) * CHAR_W + 2, (clrY1 - clrY0 + 1) * CHAR_H + 2);
  }
  prevX0 = c0; prevY0 = r0; prevX1 = c1; prevY1 = r1;
  if (c1 < c0) return;

  ctx.font = FONT;
  ctx.textBaseline = 'top';

  for (let row = r0; row <= r1; row++) {
    const baseY = row * 4;
    let run = '';
    let runCol = -1;
    let runKey = -1;

    for (let col = c0; col <= c1; col++) {
      const baseX = col * 2;
      let bits = 0, sr = 0, sg = 0, sb = 0, n = 0;

      for (let dy = 0; dy < 4; dy++) {
        const py = baseY + dy;
        if (py >= dotH) break;
        const rowOff = py * dotW;
        for (let dx = 0; dx < 2; dx++) {
          const px = baseX + dx;
          if (px >= dotW) break;
          const idx = rowOff + px;
          const a = bufA[idx];
          if (a === 0) continue;
          // Ordered dithering turns alpha into dot density.
          if (a < BAYER[(py & 3) * 4 + (px & 3)]) continue;
          bits |= BIT[dy][dx];
          sr += bufR[idx]; sg += bufG[idx]; sb += bufB[idx]; n++;
        }
      }

      if (bits === 0) {
        if (runKey !== -1) { flush(run, runCol, row, runKey); run = ''; runKey = -1; }
        continue;
      }

      // Quantise so adjacent cells share a fill style and batch into one run.
      const q = 24;
      const r = Math.min(255, Math.round(sr / n / q) * q);
      const g = Math.min(255, Math.round(sg / n / q) * q);
      const b = Math.min(255, Math.round(sb / n / q) * q);
      const key = (r << 16) | (g << 8) | b;
      const ch = String.fromCharCode(BRAILLE_BASE + bits);

      if (key === runKey && col === runCol + run.length) {
        run += ch;
      } else {
        if (runKey !== -1) flush(run, runCol, row, runKey);
        run = ch; runCol = col; runKey = key;
      }
    }
    if (runKey !== -1) flush(run, runCol, row, runKey);
  }
}

// Colour strings are rebuilt and re-parsed on every run otherwise, and there
// are a few hundred runs per frame. Quantisation caps the set at ~1300.
const styleCache = new Map();

function flush(run, col, row, key) {
  let style = styleCache.get(key);
  if (style === undefined) {
    style = '#' + (key | 0x1000000).toString(16).slice(1);
    styleCache.set(key, style);
  }
  ctx.fillStyle = style;
  ctx.fillText(run, col * CHAR_W, row * CHAR_H);
}

// ------------------------------------------------------------------ boot

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  ctx.font = FONT;
  CHAR_W = ctx.measureText('⣿').width || FONT_SIZE * 0.6;
  CHAR_H = FONT_SIZE;
  DOT_ASPECT = (CHAR_W / 2) / (CHAR_H / 4);

  cols = Math.ceil(w / CHAR_W);
  rows = Math.ceil(h / CHAR_H);
  dotW = cols * 2;
  dotH = rows * 4;
  const total = dotW * dotH;
  bufR = new Uint8Array(total);
  bufG = new Uint8Array(total);
  bufB = new Uint8Array(total);
  bufA = new Uint8Array(total);

  visW = dotW * DOT_ASPECT;
  visH = dotH;
  ripples.length = 0;  // their centres are in dot coords, now stale

  eraseRect(0, 0, w, h);
  prevX0 = 0; prevY0 = 0; prevX1 = -1; prevY1 = -1;

  // Re-seed whichever scene is running: every scene stores positions in dot
  // coordinates, which the new grid has just invalidated.
  if (scene && scene.enter) scene.enter();
}

// --- scenes -------------------------------------------------------------
// The Braille framebuffer, the dirty-rect bookkeeping and the text output are
// generic; only what gets drawn into them is not. A scene owns that part, so
// another page can swap the koi pond for something else without duplicating
// any of the machinery below.

const koiScene = {
  enter() { resetFish(); ripples.length = 0; },
  update(dt) {
    for (const f of fishes) updateFish(f, dt);
    updateRipples(dt);
  },
  draw() { drawKoiScene(); },
};

/* A page names its backdrop on <body data-scene>. That scene registers itself
   from its own script, which loads after this one, so it cannot be selected
   here — but starting on the koi in the meantime paints a few frames of them
   before the real scene takes over. Hold the loop idle instead until the page
   applies its choice; only a page that asks for the koi, or asks for nothing,
   starts drawing straight away. */
const wanted = document.body && document.body.dataset.scene;
let scene = (!wanted || wanted === 'koi') ? koiScene : null;

function drawKoiScene() {
  drawRipples();

  for (const f of fishes) {
    // The spine scratch buffers and AR/AG/AB hold one koi at a time, so each
    // fish is rebuilt and drawn to completion before the next one starts.
    buildSpine(f);
    AR = f.pattern.R; AG = f.pattern.G; AB = f.pattern.B;

    // Painter's order: fins behind, body over them, dorsal and barbels on top.
    drawCaudal(f);
    const flapP = Math.sin(f.phase * 0.45) * 0.22;
    drawPairedFin(f, 0.57,  1, f.L * 0.15, 0.25, 0.85,  flapP, SHADE_PAIRED);
    drawPairedFin(f, 0.57, -1, f.L * 0.15, 0.25, 0.85, -flapP, SHADE_PAIRED);
    drawPairedFin(f, 0.30,  1, f.L * 0.19, 0.35, 1.30,  flapP, SHADE_PAIRED);
    drawPairedFin(f, 0.30, -1, f.L * 0.19, 0.35, 1.30, -flapP, SHADE_PAIRED);
    drawBody(f);
    drawDorsal(f);
    drawBarbels(f);
  }
}

let last = 0;
let paused = false;
let rafId = 0;

function frame(now) {
  // Stop requesting frames rather than idling through them: during a view
  // transition the browser is already snapshotting and compositing the whole
  // viewport, and this canvas is the heaviest thing in it.
  if (paused) { rafId = 0; return; }

  // Idle until the page has chosen its scene.
  if (!scene) { last = 0; rafId = requestAnimationFrame(frame); return; }

  const t = now * 0.001;
  let dt = last ? t - last : 0.016;
  last = t;
  if (dt > 0.05) dt = 0.05;

  scene.update(dt);

  // Clear only what was drawn last frame.
  if (bbX1 >= bbX0) {
    for (let y = Math.max(0, bbY0); y <= Math.min(dotH - 1, bbY1); y++) {
      bufA.fill(0, y * dotW + Math.max(0, bbX0), y * dotW + Math.min(dotW, bbX1 + 1));
    }
  }
  resetBBox();

  scene.draw();

  // Pad the box so dithered fringes are not clipped.
  if (bbX1 >= bbX0) { bbX0 -= 2; bbY0 -= 2; bbX1 += 2; bbY1 += 2; }

  present();
  rafId = STILL ? 0 : requestAnimationFrame(frame);
}

// A full-bleed animation is exactly what this setting is for: draw the koi
// once and leave them be.
const STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lastW = 0, lastH = 0, resizeTimer = 0;

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  // Mobile browsers fire resize as the URL bar slides away. The canvas sits on
  // a page of the same colour, so a height-only nudge is not worth restarting
  // the swim for.
  if (w === lastW && Math.abs(h - lastH) < 140) return;
  lastW = w; lastH = h;
  resize();
  if (STILL) requestAnimationFrame(frame);
}

buildShadeLUT();
lastW = window.innerWidth;
lastH = window.innerHeight;
resize();
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(onResize, 150);
});
requestAnimationFrame(frame);

// Minimal surface for other scenes: the drawing primitives plus a way to take
// over the loop. Everything here already works in dot coordinates.
window.BrailleBG = {
  scenes: { koi: koiScene },
  use(next) {
    if (!next || next === scene) return;
    scene = next;
    if (scene.enter) scene.enter();
    if (STILL) requestAnimationFrame(frame);
  },
  current: () => scene,
  pause() { paused = true; },
  resume() {
    if (!paused) return;
    paused = false;
    last = 0;                 // so the first frame back does not jump
    if (!rafId) rafId = requestAnimationFrame(frame);
  },
  setDot, touch, tri, quad,
  dims: () => ({ dotW, dotH, visW, visH, aspect: DOT_ASPECT }),
};
})();
