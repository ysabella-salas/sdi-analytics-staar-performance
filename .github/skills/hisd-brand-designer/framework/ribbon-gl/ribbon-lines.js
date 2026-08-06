// ribbon-lines.js — the HISD Ribbon "line kit".
//
// The Ribbon device is a solid brand-color FIELD overlaid with soft, white,
// round-capped, low-opacity strokes that sweep BETWEEN TWO EDGES of the field
// like Houston's bayou currents. This module is the single source of truth for
// those strokes: a primitive that builds one edge-to-edge line, a DETERMINISTIC
// seeded generator that composes a whole field, and a curated PRESET selection.
//
// Zero dependencies, plain ESM. Used by:
//   - core.js (rung-2 WebGL): rasterizes the generated paths to the stroke texture
//   - scripts/gen_ribbon_fields.mjs: writes the committed assets/ribbon/*.svg variants
//   - the demo gallery
// Same seed → same composition, on every platform (reproducible).

export const VIEW = { w: 1920, h: 1080 };

// Edges: 0 top, 1 right, 2 bottom, 3 left. `t` runs 0..1 along the edge.
function edgePoint(edge, t, w, h) {
  switch (edge & 3) {
    case 0: return [t * w, 0];
    case 1: return [w, t * h];
    case 2: return [(1 - t) * w, h];
    default: return [0, (1 - t) * h];
  }
}
// Outward unit normal of each edge (points out of the field).
function outNormal(edge) { return [[0, -1], [1, 0], [0, 1], [-1, 0]][edge & 3]; }

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Build ONE ribbon line: a smooth cubic bezier sweeping from a point on one edge
 * to a point on another (or the same) edge. Endpoints overshoot the field so the
 * round caps are clipped off-canvas (the stroke runs cleanly off each edge).
 *
 * opts: { from:[edge,t], to:[edge,t], bow, bow2?, width, opacity, overshoot?, w?, h? }
 *   bow / bow2 = perpendicular bulge of the two control points as a fraction of the
 *   chord length. Same sign → a C-sweep; opposite signs → an S-curve. Same-edge
 *   endpoints bulge inward into the field (a loop).
 * returns { d, width, opacity }
 */
export function ribbonLine(opts) {
  const { from, to, bow = 0.3, bow2 = null, width = 96, opacity = 0.14,
    overshoot = 90, w = VIEW.w, h = VIEW.h } = opts;
  const [fe, ft] = from, [te, tt] = to;
  const na = outNormal(fe), nb = outNormal(te);
  let a = edgePoint(fe, ft, w, h), b = edgePoint(te, tt, w, h);
  a = [a[0] + na[0] * overshoot, a[1] + na[1] * overshoot];
  b = [b[0] + nb[0] * overshoot, b[1] + nb[1] * overshoot];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const dir = [dx / len, dy / len];
  const perp = [-dir[1], dir[0]];
  let p1 = bow, p2 = (bow2 == null ? bow : bow2);
  if ((fe & 3) === (te & 3)) {
    // loop: force both control points to bulge INTO the field, stronger.
    const inward = [-na[0], -na[1]];
    const sgn = (perp[0] * inward[0] + perp[1] * inward[1]) >= 0 ? 1 : -1;
    p1 = Math.abs(bow) * sgn * 1.5;
    p2 = Math.abs(p2) * sgn * 1.5;
  }
  const c1 = [a[0] + dir[0] * len * 0.33 + perp[0] * p1 * len, a[1] + dir[1] * len * 0.33 + perp[1] * p1 * len];
  const c2 = [b[0] - dir[0] * len * 0.33 + perp[0] * p2 * len, b[1] - dir[1] * len * 0.33 + perp[1] * p2 * len];
  return {
    d: `M${round1(a[0])},${round1(a[1])} C${round1(c1[0])},${round1(c1[1])} ${round1(c2[0])},${round1(c2[1])} ${round1(b[0])},${round1(b[1])}`,
    width, opacity,
    points: [a, c1, c2, b], // raw cubic control points (used for collision avoidance)
  };
}

// Sample a cubic bezier ([p0,c1,c2,p3]) into `n+1` points along its length.
function sampleBezier(pts, n = 18) {
  const [a, c1, c2, b] = pts, out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    const w0 = mt * mt * mt, w1 = 3 * mt * mt * t, w2 = 3 * mt * t * t, w3 = t * t * t;
    out.push([
      w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0],
      w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1],
    ]);
  }
  return out;
}
// Minimum point-to-point distance between two sampled polylines (a cheap proxy
// for how close two ribbon strokes run — used to keep them from colliding).
function minPolyDist(A, B) {
  let m = Infinity;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      const dx = A[i][0] - B[j][0], dy = A[i][1] - B[j][1];
      const d = dx * dx + dy * dy;
      if (d < m) m = d;
    }
  }
  return Math.sqrt(m);
}

// Deterministic PRNG (mulberry32) — small, fast, reproducible.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically generate a whole field composition from an integer seed.
 * Few strokes that generally DON'T collide: each candidate is rejected if it runs
 * closer than (halfWidths + minGap) to an already-placed stroke, so the currents
 * keep a clear channel between them (occasional near-touches at the edges only).
 * opts: { count?: number|[min,max], widthRange?, opacityRange?, loopChance?, minGap? }
 * returns [{ d, width, opacity, points }] sorted widest-first (wide strokes read under).
 */
export function generate(seed = 1, opts = {}) {
  // opacityRange is the PER-PATH alpha (near-solid); the tone-on-tone faintness
  // comes from the GROUP --ribbon-stroke-opacity token (~0.16), so the two must
  // NOT both be low or the strokes wash out.
  const { count = [3, 4], widthRange = [100, 172], opacityRange = [0.78, 1.0],
    loopChance = 0.22, minGap = 64, oppositeBias = 0.62,
    w = VIEW.w, h = VIEW.h } = opts;
  const rnd = mulberry32((Math.imul(seed | 0, 2654435761)) >>> 0);
  const lerp = (lo, hi) => lo + rnd() * (hi - lo);
  const target = Array.isArray(count) ? Math.round(lerp(count[0], count[1])) : count;
  const lines = [];
  const samples = []; // sampled polyline per accepted line, for collision tests
  // Central box — a candidate must cross it, so strokes sweep the field instead of
  // just clipping a corner (which reads as empty/unbalanced). Box scales with w/h.
  const cxLo = 0.12 * w, cxHi = 0.88 * w, cyLo = 0.14 * h, cyHi = 0.86 * h;
  // Scale the collision channel by the smaller-dimension ratio so tall/short
  // surfaces keep proportionally-spaced currents (not a fixed pixel gap).
  const scale = Math.min(w / VIEW.w, h / VIEW.h);
  const maxAttempts = target * 40;
  for (let attempt = 0; attempt < maxAttempts && lines.length < target; attempt++) {
    // Relax the required channel as attempts grow so the target 3–4 still fills on
    // tightly-packed seeds: early picks stay well-spaced, later picks pack tighter.
    const gap = minGap * scale * (1 - 0.65 * (attempt / maxAttempts));
    const loop = rnd() < loopChance;
    const fe = Math.floor(rnd() * 4);
    // Favor the OPPOSITE edge (a full edge-to-edge sweep); fall back to an adjacent
    // edge sometimes for variety. Adjacent pairs are the ones that can corner-clip,
    // so the centrality check below still gates them.
    const te = loop ? fe
      : (rnd() < oppositeBias ? (fe + 2) & 3 : (fe + (rnd() < 0.5 ? 1 : 3)) & 3);
    const ft = lerp(0.06, 0.94), tt = lerp(0.06, 0.94);
    const bow = (rnd() * 0.5 + 0.14) * (rnd() < 0.5 ? 1 : -1);
    const bow2 = (rnd() < 0.45) ? -bow * lerp(0.6, 1.1) : bow * lerp(0.7, 1.05);
    const cand = ribbonLine({
      from: [fe, ft], to: [te, tt], bow, bow2,
      width: lerp(widthRange[0], widthRange[1]),
      opacity: lerp(opacityRange[0], opacityRange[1]),
      w, h,
    });
    const pts = sampleBezier(cand.points);
    // Coverage: must actually pass through the central area — reject corner clips.
    let central = false;
    for (let k = 0; k < pts.length; k++) {
      if (pts[k][0] > cxLo && pts[k][0] < cxHi && pts[k][1] > cyLo && pts[k][1] < cyHi) { central = true; break; }
    }
    if (!central) continue;
    // Reject if it runs too close to any already-placed stroke (keep a channel).
    let collides = false;
    for (let j = 0; j < lines.length; j++) {
      const need = (cand.width + lines[j].width) / 2 + gap;
      if (minPolyDist(pts, samples[j]) < need) { collides = true; break; }
    }
    if (collides) continue;
    lines.push(cand);
    samples.push(pts);
  }
  return lines.sort((x, y) => y.width - x.width);
}

// Curated, named predefined selection (stable seeds chosen to read well).
export const PRESETS = {
  currents: 7, delta: 12, bayou: 23, crossing: 4, calm: 13,
  weave: 58, bend: 19, loops: 17, drift: 42, channels: 88,
};
export function preset(name, opts) { return generate(PRESETS[name] ?? 1, opts); }

/**
 * Emit a full standalone, themeable SVG string for a line set.
 * o.layered (default true) splits the lines into two drift sub-layers
 * (.hisd-ribbon__layer--a / --b) so the CSS tier can animate them in parallax.
 */
export function linesToSVG(lines, o = {}) {
  const { w = VIEW.w, h = VIEW.h, layered = true,
    field = 'var(--ribbon-field-bg, #00A3AF)',
    stroke = 'var(--ribbon-stroke, #ffffff)',
    groupOpacity = 'var(--ribbon-stroke-opacity, 0.16)' } = o;
  const path = (l) => `<path d="${l.d}" stroke-width="${Math.round(l.width)}" opacity="${l.opacity.toFixed(2)}"/>`;
  let inner;
  if (layered) {
    const a = lines.filter((_, i) => i % 2 === 0).map(path).join('\n      ');
    const b = lines.filter((_, i) => i % 2 === 1).map(path).join('\n      ');
    inner = `    <g class="hisd-ribbon__layer hisd-ribbon__layer--a">\n      ${a}\n    </g>\n` +
            `    <g class="hisd-ribbon__layer hisd-ribbon__layer--b">\n      ${b}\n    </g>`;
  } else {
    inner = '    ' + lines.map(path).join('\n    ');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
  <rect width="${w}" height="${h}" fill="${field}"/>
  <g fill="none" stroke="${stroke}" stroke-linecap="round" opacity="${groupOpacity}">
${inner}
  </g>
</svg>`;
}

/**
 * One-shot helper: resolve a preset|seed, generate at a given w/h, and emit the
 * themeable standalone SVG. The single entry point platform background builders
 * use, so they don't have to wire generate()+linesToSVG() themselves.
 *
 * opts: {
 *   preset?: string,            // named PRESET; falls back to `seed`
 *   seed?: number,              // integer seed; falls back to 'currents'
 *   w?, h?,                     // surface size (default VIEW.w/VIEW.h)
 *   generate?: object,          // extra generate() opts (count, loopChance, …)
 *   field?, stroke?, strokeOpacity?, layered?,  // passed to linesToSVG
 * }
 * The determinism invariant holds: with no w/h and a preset, this matches the
 * existing committed presets byte-for-byte.
 */
export function fieldSVG(opts = {}) {
  const {
    preset: presetName, seed,
    w = VIEW.w, h = VIEW.h,
    generate: genOpts = {},
    layered = true,
    field = 'var(--ribbon-field-bg, #00A3AF)',
    stroke = 'var(--ribbon-stroke, #ffffff)',
    strokeOpacity = 'var(--ribbon-stroke-opacity, 0.16)',
  } = opts;
  // Resolve the seed: explicit preset name → seed number → default 'currents'.
  const resolvedSeed = (presetName != null && PRESETS[presetName] != null)
    ? PRESETS[presetName]
    : (seed != null ? seed : PRESETS.currents);
  const lines = generate(resolvedSeed, { ...genOpts, w, h });
  return linesToSVG(lines, { w, h, layered, field, stroke, groupOpacity: strokeOpacity });
}
