/* Background scene for octocrawl: tentacles reaching in from the screen edges.

   The repo explains the name — "the multithreading pattern looks like an
   octopus trying to find its path" — so the arms are the whole point and the
   body is not. Each arm is anchored just past the edge of the viewport; only
   the part that has crept in is ever visible.

   Shape and colour follow the artwork octocrawl prints at startup (see
   display_art() in src/octocrawl/ui.py): thick ribbons that taper, ending in
   an open volute, warm orange at the root cooling to pale lilac at the curled
   tip. That art is the reference, not the source — nothing here copies it.

   Registers itself with BrailleBG and shares that module's dot buffer, so none
   of the braille machinery is duplicated here. */
(() => {
'use strict';

const BG = window.BrailleBG;
if (!BG) return;

// octocrawl's own palette, src/octocrawl/ui.py.
const ORANGE       = [233, 103,  54];
const PEACH        = [229, 124,  71];
const LIGHT_ORANGE = [242, 168, 153];
const LIGHT_PEACH  = [217, 173, 138];
const PURPLE       = [228, 207, 228];

// Root to tip. The arm warms through peach and cools into the pale lilac the
// CLI art uses for the curled ends.
const RAMP = [
  [0.00, ORANGE],
  [0.45, PEACH],
  [0.72, LIGHT_ORANGE],
  [1.00, PURPLE],
];

const ARMS = 8;            // an octopus has eight
const SEG = 54;            // samples along one arm
const SUCKER_EVERY = 3;    // in segments

// Placement: candidates are re-rolled until one clears every arm already
// placed, the same way the koi scene places its ripples.
const TRIES = 30;
const STRIDE = 6;          // segments between collision samples
const PAD = 2.5;           // visual units of daylight between two arms

// The animation envelopes. Collision is tested at the corners of these, so
// they are deliberately narrow: an arm that wandered far from its mean path
// could not be kept clear of its neighbours by any static check.
const COIL_LO = 0.72, COIL_HI = 1.04;
const REACH_LO = 0.72, REACH_HI = 1.0;

// Air rising past the arms. Drawn as rings rather than filled discs: a solid
// blob reads as a pellet, and it is the empty middle that says "bubble".
const BUBBLES = 20;
const BUB_PALE = [236, 226, 240];   // a shade off PURPLE, so they read as air
const BUB_FADE = 0.12;              // fraction of the climb spent fading in/out

const arms = [];
const bubbles = [];
let unit = 20;             // size reference, in visual units
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

/* ------------------------------------------------------------------- walk */

/* The one place an arm's shape is defined. Both the drawing and the placement
   test run through here, so the curve that gets checked for overlap is by
   construction the curve that gets drawn.

   cb(x, y, w, s, theta) is called once per segment. `wob` is the travelling
   ripple, left out when sampling because it is a function of time. */
function walk(arm, coilMul, sweep, reachMul, wob, cb) {
  const d = dims();
  const ax = 1 / d.aspect;

  const len = arm.len * reachMul;
  const coil = arm.curl * coilMul;

  let x = arm.x, y = arm.y;
  let theta = arm.base + sweep;

  for (let i = 1; i <= SEG; i++) {
    const s = i / SEG;

    // Steps shorten toward the tip while the turn rate climbs; together they
    // make the end coil. The shrink is mild on purpose - at the 0.7 it used to
    // be, the tip advanced so little per turn that successive turns touched
    // and the volute filled in as a solid ball instead of a spiral.
    const ds = (len / SEG) * (1 - 0.42 * Math.pow(s, 1.3));

    // Turn rate: nothing at the edge, a volute at the end.
    let turn = coil * Math.pow(s, 1.5) * (wob ? wob(s) : 1);

    // S arms: one lobe of opposite curvature over the first stretch, which
    // bends the arm one way before the tip winds back the other. A lobe rather
    // than a sign flip, so the two arcs meet without a kink.
    if (arm.sBend && s < arm.sPoint) {
      turn -= arm.sBend * coil * Math.sin(Math.PI * s / arm.sPoint);
    }

    theta += arm.dir * turn;

    x += Math.cos(theta) * ds * ax;
    y += Math.sin(theta) * ds;

    // Gentle taper with a floor under it: a steeper one put the volute exactly
    // where the arm had run out of width.
    const w = Math.max(0.8, arm.girth * Math.pow(1 - s, 0.55));
    cb(x, y, w, s, theta);
  }
}

/* -------------------------------------------------------------- placement */

// Flat [x, y, w, ...] in dot coordinates, every STRIDE segments.
function pathOf(arm, coilMul, sweep, reachMul) {
  const out = [];
  let n = 0;
  walk(arm, coilMul, sweep, reachMul, null, (x, y, w) => {
    if (n++ % STRIDE === 0) out.push(x, y, w);
  });
  return out;
}

// The three corners of the animation envelope. Anything the arm does at any
// moment lies close to one of these.
function envelope(arm) {
  return [
    pathOf(arm, COIL_LO, -arm.sweepAmp, REACH_LO),
    pathOf(arm, 1, 0, (REACH_LO + REACH_HI) / 2),
    pathOf(arm, COIL_HI, arm.sweepAmp, REACH_HI),
  ];
}

// Smallest gap between two sampled paths, in visual units, girth removed.
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
  // Alternate edges, and anchor just outside: the root is never meant to be
  // seen, only the part that has crept in.
  const right = i % 2 === 0;
  const margin = unit * 0.35;

  return {
    x: right ? d.dotW + margin / d.aspect : -margin / d.aspect,
    // Spread down the edge, jittered so they are not evenly stacked.
    y: d.dotH * (0.06 + 0.88 * ((i + 0.5) / ARMS))
       + (Math.random() - 0.5) * d.dotH * 0.16,
    // Pointing inward, with a good spread of entry angles.
    base: (right ? Math.PI : 0) + (Math.random() - 0.5) * 1.1,
    // Step shrinkage costs about 18% of this, so the drawn arm runs to
    // roughly 0.82 of the figure.
    len: d.visW * (0.34 + Math.random() * 0.28),
    girth: unit * (0.30 + Math.random() * 0.10),
    // Per-step turn coefficient. Integrated over the arm with the s^1.5
    // weighting in walk(), this comes to about 0.55 to 1.2 full turns - an
    // open curl. Past roughly 1.5 turns the spiral closes on itself and reads
    // as a bead on the end of the arm.
    curl: 0.22 + Math.random() * 0.12,
    dir: Math.random() < 0.5 ? -1 : 1,
    // Some arms lead with a counter-curve before the tip coils the other way,
    // which draws an S. 0 leaves the arm a plain spiral.
    sBend: Math.random() < 0.45 ? 0.25 + Math.random() * 0.2 : 0,
    sPoint: 0.38 + Math.random() * 0.16,
    freq: 0.22 + Math.random() * 0.3,             // its own cadence
    phase: Math.random() * Math.PI * 2,
    sweepAmp: 0.07 + Math.random() * 0.09,        // slow fan either side
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

    // If nothing cleared, the roomiest candidate still beats a random one.
    arms.push(best.arm);
    placed.push(best.env);
  }

  seedBubbles(d);
}

/* ------------------------------------------------------------------ air */

// `up` is how far along its climb the bubble is, 0 at the bottom edge and 1
// just past the top, which is what drives the fade at both ends.
function spawnBubble(b, d, seeded) {
  b.x = Math.random() * d.dotW;
  b.up = seeded ? Math.random() : 0;
  // Weighted small: a field of big rings looks like a chain of beads.
  b.r = 0.9 + Math.pow(Math.random(), 2.2) * 3.9;
  // Bigger bubbles climb faster, as they do in water.
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
    // Fade in off the bottom edge and out at the top, so none of them blinks
    // into or out of existence mid-screen.
    const edge = Math.min(b.up, 1 - b.up) / BUB_FADE;
    const alpha = b.alpha * Math.max(0, Math.min(1, edge));
    if (alpha < 6) continue;

    const y = d.dotH * (1 - b.up) + b.r;
    const x = b.x + Math.sin(t * b.swayFreq * Math.PI * 2 + b.phase) * b.sway;

    ring(x, y, b.r, BUB_PALE, alpha);
  }
}

/* ---------------------------------------------------------------- drawing */

function dot(x, y, col, alpha) {
  const ix = Math.round(x), iy = Math.round(y);
  BG.setDot(ix, iy, col[0], col[1], col[2], alpha);
  BG.touch(ix, iy);
}

// Filled ellipse in dot space, corrected so it reads round on screen.
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
      // Nearly flat on purpose. Discs are stamped in sequence and the later
      // one's rim overwrites the earlier one's core, so any real falloff here
      // mottles the arm instead of shading it. The edge comes from the
      // silhouette; the shading comes from the lighter core stamped after.
      dot(x, y, col, alpha * (0.88 + 0.12 * (1 - q)));
    }
  }
}

// Hollow counterpart to disc(). Below about 1.4 units there is no room for a
// wall and a hole both, so the smallest bubbles collapse to a single dot.
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
      // Brightest on the upper left, the way a lit bubble catches the light.
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

  // Reach breathes: the arm extends, hesitates, draws back.
  const reach = (REACH_LO + REACH_HI) / 2
              + (REACH_HI - REACH_LO) / 2 * Math.sin(t * arm.freq * 0.8 + arm.reachPhase);

  // The coil itself rolls up and unrolls. This is what sells it as an arm
  // rather than a drawn spiral: the curvature is alive, not fixed.
  const coilMul = (COIL_LO + COIL_HI) / 2
                + (COIL_HI - COIL_LO) / 2 * Math.sin(t * arm.freq * 0.55 + arm.coilPhase);

  // Slow fan, so the whole arm sweeps rather than only rippling.
  const sweep = Math.sin(t * arm.sweepFreq * Math.PI * 2 + arm.phase) * arm.sweepAmp;

  // The travelling ripple. Kept small: it is left out of the collision test,
  // so whatever it adds has to stay inside PAD.
  const wob = (s) => 1 + 0.16 * Math.sin(s * 5.5 - t * arm.freq * Math.PI * 2 + arm.phase);

  let px = arm.x, py = arm.y;

  let i = 0;
  walk(arm, coilMul, sweep, reach, wob, (x, y, w, s, theta) => {
    i++;
    ramp(s, col);
    const alpha = 252 - 26 * s;

    // Stroke the span as a run of discs; cheaper than meshing a ribbon, and
    // the dithering hides the overlap. Spacing tracks the girth so a thick
    // root is not stamped dozens of times over.
    const dx = x - px, dy = y - py;
    const span = Math.hypot(dx * d.aspect, dy);
    const steps = Math.max(1, Math.ceil(span / Math.max(0.8, w * 0.55)));
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      disc(px + dx * u, py + dy * u, w, col, alpha);
    }

    // A lighter core offset to one side: the CLI art shades its arms rather
    // than filling them flat, and this is what gives them their roundness.
    if (w > 1.3) {
      const nx = -Math.sin(theta), ny = Math.cos(theta);
      lit[0] = col[0] + (LIGHT_ORANGE[0] - col[0]) * 0.55;
      lit[1] = col[1] + (LIGHT_ORANGE[1] - col[1]) * 0.55;
      lit[2] = col[2] + (LIGHT_ORANGE[2] - col[2]) * 0.55;
      disc(x + nx * w * 0.33 * ax, y + ny * w * 0.33, w * 0.4, lit, alpha);
    }

    // Suckers: a pale bead every few segments down the inner edge.
    if (i % SUCKER_EVERY === 0 && s > 0.08 && s < 0.96) {
      const nx = Math.sin(theta), ny = -Math.cos(theta);
      dot(x + nx * w * 0.78 * ax, y + ny * w * 0.78,
          LIGHT_PEACH, 150 + 60 * (1 - s));
    }

    px = x; py = y;
  });
}

/* ------------------------------------------------------------------ scene */

BG.scenes.octopus = {
  enter,
  update(dt) { t += dt; updateBubbles(dt); },
  draw() {
    // Air first, so an arm passing in front of a bubble hides it rather than
    // the other way round.
    drawBubbles();
    for (const arm of arms) drawArm(arm);
  },
};

})();
