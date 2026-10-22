(() => {
'use strict';

const BG = window.BrailleBG;
if (!BG) return;

const ORANGE       = [233, 103,  54];
const PEACH        = [229, 124,  71];
const LIGHT_ORANGE = [242, 168, 153];
const LIGHT_PEACH  = [217, 173, 138];
const PURPLE       = [228, 207, 228];

const RAMP = [
  [0.00, ORANGE],
  [0.45, PEACH],
  [0.72, LIGHT_ORANGE],
  [1.00, PURPLE],
];

const ARMS = 8;
const SEG = 54;
const SUCKER_EVERY = 3;

const TRIES = 30;
const STRIDE = 6;
const PAD = 2.5;

const COIL_LO = 0.72, COIL_HI = 1.04;
const REACH_LO = 0.72, REACH_HI = 1.0;

const BUBBLES = 20;
const BUB_PALE = [236, 226, 240];
const BUB_FADE = 0.12;

const arms = [];
const bubbles = [];
let unit = 20;
let t = 0;

function dims() { return BG.dims(); }

function ramp(s, out) {
  let i = 1;
  while (i < RAMP.length - 1 && s > RAMP[i][0]) i++;
  const [s0, c0] = RAMP[i - 1];
  const [s1, c1] = RAMP[i];
  const u = (s - s0) / (s1 - s0);
  out[0] = c0[0] + (c1[0] - c0[0]) * u;
  out[1] = c0[1] + (c1[1] - c0[1]) * u;
  out[2] = c0[2] + (c1[2] - c0[2]) * u;
}

function walk(arm, coilMul, sweep, reachMul, wob, cb) {
  const d = dims();
  const ax = 1 / d.aspect;

  const len = arm.len * reachMul;
  const coil = arm.curl * coilMul;

  let x = arm.x, y = arm.y;
  let theta = arm.base + sweep;

  for (let i = 1; i <= SEG; i++) {
    const s = i / SEG;

    const ds = (len / SEG) * (1 - 0.42 * Math.pow(s, 1.3));

    let turn = coil * Math.pow(s, 1.5) * (wob ? wob(s) : 1);

    if (arm.sBend && s < arm.sPoint) {
      turn -= arm.sBend * coil * Math.sin(Math.PI * s / arm.sPoint);
    }

    theta += arm.dir * turn;

    x += Math.cos(theta) * ds * ax;
    y += Math.sin(theta) * ds;

    const w = Math.max(0.8, arm.girth * Math.pow(1 - s, 0.55));
    cb(x, y, w, s, theta);
  }
}

function pathOf(arm, coilMul, sweep, reachMul) {
  const out = [];
  let n = 0;
  walk(arm, coilMul, sweep, reachMul, null, (x, y, w) => {
    if (n++ % STRIDE === 0) out.push(x, y, w);
  });
  return out;
}

function envelope(arm) {
  return [
    pathOf(arm, COIL_LO, -arm.sweepAmp, REACH_LO),
    pathOf(arm, 1, 0, (REACH_LO + REACH_HI) / 2),
    pathOf(arm, COIL_HI, arm.sweepAmp, REACH_HI),
  ];
}

function clearance(pa, pb, aspect) {
  let best = Infinity;
  for (let i = 0; i < pa.length; i += 3) {
    for (let j = 0; j < pb.length; j += 3) {
      const dx = (pa[i] - pb[j]) * aspect;
      const dy = pa[i + 1] - pb[j + 1];
      const gap = Math.hypot(dx, dy) - pa[i + 2] - pb[j + 2];
      if (gap < best) {
        best = gap;
        if (best < -1e3) return best;
      }
    }
  }
  return best;
}

function candidate(i, d) {
  const right = i % 2 === 0;
  const margin = unit * 0.35;

  return {
    x: right ? d.dotW + margin / d.aspect : -margin / d.aspect,

    y: d.dotH * (0.06 + 0.88 * ((i + 0.5) / ARMS))
       + (Math.random() - 0.5) * d.dotH * 0.16,

    base: (right ? Math.PI : 0) + (Math.random() - 0.5) * 1.1,

    len: d.visW * (0.34 + Math.random() * 0.28),
    girth: unit * (0.30 + Math.random() * 0.10),

    curl: 0.22 + Math.random() * 0.12,
    dir: Math.random() < 0.5 ? -1 : 1,

    sBend: Math.random() < 0.45 ? 0.25 + Math.random() * 0.2 : 0,
    sPoint: 0.38 + Math.random() * 0.16,
    freq: 0.22 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    sweepAmp: 0.07 + Math.random() * 0.09,
    sweepFreq: 0.06 + Math.random() * 0.1,
    coilPhase: Math.random() * Math.PI * 2,
    reachPhase: Math.random() * Math.PI * 2,
  };
}

function enter() {
  const d = dims();
  unit = Math.max(13, Math.min(d.visW * 0.055, d.visH * 0.105));

  arms.length = 0;
  const placed = [];

  for (let i = 0; i < ARMS; i++) {
    let best = null, bestGap = -Infinity;

    for (let k = 0; k < TRIES; k++) {
      const arm = candidate(i, d);
      const env = envelope(arm);

      let gap = Infinity;
      for (const other of placed) {
        for (const a of env) {
          for (const b of other) {
            const g = clearance(a, b, d.aspect);
            if (g < gap) gap = g;
          }
        }
        if (gap < PAD) break;
      }

      if (gap > bestGap) { bestGap = gap; best = { arm, env }; }
      if (gap >= PAD) break;
    }

    arms.push(best.arm);
    placed.push(best.env);
  }

  seedBubbles(d);
}

function spawnBubble(b, d, seeded) {
  b.x = Math.random() * d.dotW;
  b.up = seeded ? Math.random() : 0;

  b.r = 0.9 + Math.pow(Math.random(), 2.2) * 3.9;

  b.speed = (6.5 + b.r * 3.2) / d.visH;
  b.sway = 1.4 + Math.random() * 3.2;
  b.swayFreq = 0.25 + Math.random() * 0.6;
  b.phase = Math.random() * Math.PI * 2;
  b.alpha = 120 + Math.random() * 90;
  return b;
}

function seedBubbles(d) {
  bubbles.length = 0;
  for (let i = 0; i < BUBBLES; i++) bubbles.push(spawnBubble({}, d, true));
}

function updateBubbles(dt) {
  const d = dims();
  for (const b of bubbles) {
    b.up += b.speed * dt;
    if (b.up > 1) spawnBubble(b, d, false);
  }
}

function drawBubbles() {
  const d = dims();

  for (const b of bubbles) {
    const edge = Math.min(b.up, 1 - b.up) / BUB_FADE;
    const alpha = b.alpha * Math.max(0, Math.min(1, edge));
    if (alpha < 6) continue;

    const y = d.dotH * (1 - b.up) + b.r;
    const x = b.x + Math.sin(t * b.swayFreq * Math.PI * 2 + b.phase) * b.sway;

    ring(x, y, b.r, BUB_PALE, alpha);
  }
}

function dot(x, y, col, alpha) {
  const ix = Math.round(x), iy = Math.round(y);
  BG.setDot(ix, iy, col[0], col[1], col[2], alpha);
  BG.touch(ix, iy);
}

function disc(x0, y0, r, col, alpha) {
  const d = dims();
  const rx = r / d.aspect;
  const a = Math.max(0, Math.floor(x0 - rx)), b = Math.min(d.dotW - 1, Math.ceil(x0 + rx));
  const c = Math.max(0, Math.floor(y0 - r)), e = Math.min(d.dotH - 1, Math.ceil(y0 + r));
  for (let y = c; y <= e; y++) {
    for (let x = a; x <= b; x++) {
      const dx = (x - x0) / rx, dy = (y - y0) / r;
      const q = dx * dx + dy * dy;
      if (q > 1) continue;

      dot(x, y, col, alpha * (0.88 + 0.12 * (1 - q)));
    }
  }
}

function ring(x0, y0, r, col, alpha) {
  const d = dims();
  if (r < 1.4) { dot(x0, y0, col, alpha); return; }

  const rx = r / d.aspect;
  const inner = Math.max(0, (r - 1.05) / r);
  const a = Math.max(0, Math.floor(x0 - rx)), b = Math.min(d.dotW - 1, Math.ceil(x0 + rx));
  const c = Math.max(0, Math.floor(y0 - r)), e = Math.min(d.dotH - 1, Math.ceil(y0 + r));

  for (let y = c; y <= e; y++) {
    for (let x = a; x <= b; x++) {
      const dx = (x - x0) / rx, dy = (y - y0) / r;
      const q = Math.sqrt(dx * dx + dy * dy);
      if (q > 1 || q < inner) continue;

      const sheen = 0.72 + 0.28 * ((-dx - dy) * 0.5 + 0.5);
      dot(x, y, col, alpha * sheen);
    }
  }
}

const col = [0, 0, 0];
const lit = [0, 0, 0];

function drawArm(arm) {
  const d = dims();
  const ax = 1 / d.aspect;

  const reach = (REACH_LO + REACH_HI) / 2
              + (REACH_HI - REACH_LO) / 2 * Math.sin(t * arm.freq * 0.8 + arm.reachPhase);

  const coilMul = (COIL_LO + COIL_HI) / 2
                + (COIL_HI - COIL_LO) / 2 * Math.sin(t * arm.freq * 0.55 + arm.coilPhase);

  const sweep = Math.sin(t * arm.sweepFreq * Math.PI * 2 + arm.phase) * arm.sweepAmp;

  const wob = (s) => 1 + 0.16 * Math.sin(s * 5.5 - t * arm.freq * Math.PI * 2 + arm.phase);

  let px = arm.x, py = arm.y;

  let i = 0;
  walk(arm, coilMul, sweep, reach, wob, (x, y, w, s, theta) => {
    i++;
    ramp(s, col);
    const alpha = 252 - 26 * s;

    const dx = x - px, dy = y - py;
    const span = Math.hypot(dx * d.aspect, dy);
    const steps = Math.max(1, Math.ceil(span / Math.max(0.8, w * 0.55)));
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      disc(px + dx * u, py + dy * u, w, col, alpha);
    }

    if (w > 1.3) {
      const nx = -Math.sin(theta), ny = Math.cos(theta);
      lit[0] = col[0] + (LIGHT_ORANGE[0] - col[0]) * 0.55;
      lit[1] = col[1] + (LIGHT_ORANGE[1] - col[1]) * 0.55;
      lit[2] = col[2] + (LIGHT_ORANGE[2] - col[2]) * 0.55;
      disc(x + nx * w * 0.33 * ax, y + ny * w * 0.33, w * 0.4, lit, alpha);
    }

    if (i % SUCKER_EVERY === 0 && s > 0.08 && s < 0.96) {
      const nx = Math.sin(theta), ny = -Math.cos(theta);
      dot(x + nx * w * 0.78 * ax, y + ny * w * 0.78,
          LIGHT_PEACH, 150 + 60 * (1 - s));
    }

    px = x; py = y;
  });
}

BG.scenes.octopus = {
  enter,
  update(dt) { t += dt; updateBubbles(dt); },
  draw() {
    drawBubbles();
    for (const arm of arms) drawArm(arm);
  },
};
})();
