// core.js — public entry for the animated HISD Ribbon (rung 2: raw WebGL2).
//
// Rung 2 of the progressive-enhancement ladder. The CSS/DOM tier (rung 1) paints the
// canonical Ribbon device — a SOLID brand-color FIELD overlaid with a few soft, white,
// round-capped, low-opacity sweeping/looping strokes that drift across it like bayou
// currents — on its own; this module's job is to OPTIONALLY overlay a live WebGL2
// version *of the same device* (the white strokes FLOW/DRIFT over the field) when the
// device can afford it, and to get out of the way otherwise. When we do not render
// (tier 'static' or 'css', reduced motion, forced colors, weak device, no WebGL2,
// context lost), the host SVG/CSS visual remains untouched — we never tear it down.
//
// Zero npm dependencies. Plain ESM. The WebGL path (./scene.js) and its GLSL are
// only ever dynamically imported when we actually go to render, so importing this
// file (or running the 'static' path) never touches WebGL.
//
// COLOR PROVENANCE: every brand color comes from tokens.js (window.HISD_TOKENS /
// CSS custom properties) or opts.field / the host's computed background-color, never
// hardcoded here. The animated layer composites the canonical WHITE STROKES (rasterized
// at runtime from the locked line kit, ribbon-lines.js — the single source of truth)
// over the solid field — so it is EXACTLY the canonical Ribbon device, never re-authored.

import { pickTier, prefersReducedMotion, watchReducedMotion, watchForcedColors } from './capabilities.js';
import { generate, preset, PRESETS } from './ribbon-lines.js';

// ── Canonical stroke set (single source of truth) ──────────────────────────────
// The "bayou current" white strokes live in ribbon-lines.js (the locked line kit) —
// the SINGLE source of truth for the Ribbon's soft, round-capped, low-opacity strokes
// that sweep edge-to-edge across the field. We resolve a concrete stroke set from
// opts (a named PRESET via opts.variant, an integer opts.seed, else preset('currents'))
// and buildMask() rasterizes THOSE lines (white, round caps, per-path width + opacity)
// to an offscreen 2D canvas; the fragment shader samples that texture (alpha = stroke
// coverage) at a flow-warped uv and composites it over the solid field. linesToSVG()
// in the kit splits the same lines into A/B sub-layers for the CSS parallax drift.
const MASK_VIEWBOX = { w: 1920, h: 1080 };
// Resolve the stroke set for this Ribbon instance from opts:
//   opts.variant (a PRESETS name) -> preset(variant)
//   else opts.seed (an integer)   -> generate(seed)   (DETERMINISTIC per seed)
//   else                          -> preset('currents') (the canonical default)
// Returns the line kit's [{ d, width, opacity }] (already widest-first). Falls back to
// the canonical default if a bad variant/seed is passed so buildMask() always has lines.
function resolveStrokeSet(opts) {
  try {
    if (opts && typeof opts.variant === 'string' && opts.variant in PRESETS) {
      return preset(opts.variant);
    }
    if (opts && Number.isInteger(opts.seed)) {
      return generate(opts.seed);
    }
  } catch { /* fall through to the canonical default */ }
  return preset('currents');
}
// Canonical default field if nothing else resolves it (matches --ribbon-field-bg /
// the SVG fallback; this is the ONE allowed field fallback, documented like tokens.js).
const FIELD_FALLBACK = '#00A3AF';

// DPR caps — keep the drawing buffer cheap. Cap at 1.5 normally; 0.67x of the device
// DPR on coarse pointers / low-core machines (phones, tablets).
const DPR_CAP = 1.5;
const DPR_COARSE_SCALE = 0.67;

const noop = () => {};

/**
 * createRibbon(canvas, opts) -> controller
 *
 * opts:
 *   tier?      : 'auto' | 'css' | 'webgl'   (default 'auto')
 *   getTokens? : () => RibbonTokens          (default: tokens.js readRibbonTokens)
 *   intensity? : number 0..1                 (default 0.6)
 *   themeAttr? : string                      (default 'data-theme')
 *   field?     : string                      (CSS color for the solid field; default:
 *                                             the host's computed background-color, else
 *                                             --ribbon-field-bg, else #00A3AF)
 *
 * controller: { destroy(), pause(), resume(), retheme(),
 *               readonly el, readonly tier }
 */
export function createRibbon(canvas, opts = {}) {
  const {
    tier: tierOpt = 'auto',
    getTokens,
    intensity = 0.6,
    themeAttr = 'data-theme',
    field: fieldOpt,
  } = opts;

  // Resolve the concrete "bayou current" stroke set ONCE for this instance from the
  // locked line kit (ribbon-lines.js). opts.variant (PRESET name) wins; else opts.seed
  // (integer, deterministic); else the canonical preset('currents'). buildMask() below
  // rasterizes exactly THESE lines.
  const strokeSet = resolveStrokeSet(opts);

  // Decide the tier up front. pickTier() owns ALL the gating (WebGL2 support,
  // save-data, cores, memory, reduced-motion, forced-colors, explicit override).
  let tier = pickTier({ tier: tierOpt });

  // ── INERT path: 'static' / 'css' ─────────────────────────────────────────────
  // No canvas work at all — rung 1 (the host SVG/CSS) handles the visuals. We still
  // honor retheme() as a safe no-op so callers can wire one MutationObserver for all
  // tiers without branching. el reflects the passed canvas (may be null/undefined).
  if (tier !== 'webgl') {
    return makeInertController(canvas, () => tier);
  }

  // ── WEBGL path ───────────────────────────────────────────────────────────────
  // Everything below is lazy: scene + tokens + GLSL are only imported now. If the
  // dynamic import or scene creation fails, we demote to 'css' and return an inert
  // controller — the host SVG stays visible the whole time.
  let live = true;          // false once destroyed or demoted
  let scene = null;         // the WebGL scene (after async init)
  let rafId = 0;
  let running = false;      // RAF loop currently scheduled
  let visibleInViewport = true;
  let pagePotentiallyVisible = true;
  let paused = false;       // explicit pause() by host
  let firstFramePainted = false;
  let startTimeMs = 0;

  let resolveTokens =
    typeof getTokens === 'function' ? getTokens : null; // bound to tokens.js after import

  // Teardown registry — every observer/listener pushes its disposer here.
  const disposers = [];
  const addDisposer = (fn) => { if (typeof fn === 'function') disposers.push(fn); };

  // The canvas starts transparent; we crossfade it in only AFTER the first painted
  // frame so the host SVG shows through until the live fill is actually ready.
  try {
    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 320ms ease';
  } catch { /* canvas may be a bare stub in tests; ignore */ }

  // Compute the DPR we should render at for the current device.
  function currentDpr() {
    const deviceDpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    let dpr = Math.min(deviceDpr, DPR_CAP);
    const coarse =
      typeof matchMedia === 'function' &&
      matchMedia('(pointer: coarse)').matches;
    const lowCores = ((navigator && navigator.hardwareConcurrency) ?? 4) < 8;
    if (coarse || lowCores) dpr *= DPR_COARSE_SCALE;
    return Math.max(1, dpr);
  }

  // Rasterize the resolved WHITE STROKE set (strokeSet, from the locked line kit) to an
  // offscreen 2D canvas -> the stroke texture (alpha = stroke coverage). The shader
  // samples this at a flow-warped uv and composites it over the solid field. We draw
  // each line as a white, round-capped stroke at its per-path width + opacity; the
  // varied widths/opacities give the tone-on-tone depth. Rendered at 0.8x of the
  // 1920x1080 viewBox (the shader samples by normalized vUv, so it scales cleanly while
  // the raised resolution keeps the magnified strokes crisp, not blurry).
  function buildMask() {
    const off =
      typeof document !== 'undefined' && document.createElement
        ? document.createElement('canvas')
        : null;
    if (!off) return null;
    // CRISPNESS: raster at 0.8x of the 16:9 viewBox (longest side ~1536) so the strokes
    // stay sharp when the shader magnifies them — the old 0.5x (960x540) read blurry.
    // Still well under any texture-size limit and cheap to upload.
    const scale = 0.8;
    off.width = Math.round(MASK_VIEWBOX.w * scale);   // 1536
    off.height = Math.round(MASK_VIEWBOX.h * scale);  // 864
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, off.width, off.height);
    if (typeof Path2D === 'undefined') {
      // No Path2D: leave the texture transparent — the field renders with no strokes.
      return off;
    }
    ctx.scale(scale, scale);          // author the paths in viewBox units
    ctx.strokeStyle = '#fff';         // white strokes = the current; alpha is the signal
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const sp of strokeSet) {
      ctx.globalAlpha = sp.opacity;   // per-path alpha (layered tone-on-tone depth)
      ctx.lineWidth = sp.width;
      try { ctx.stroke(new Path2D(sp.d)); } catch { /* skip a malformed path */ }
    }
    ctx.globalAlpha = 1;
    return off;
  }

  // Resolve the solid field color (opts.field wins; else the host element's computed
  // background-color; else the --ribbon-field-bg custom property; else the canonical
  // teal fallback). Returns a CSS color string the scene parses into uField.
  function resolveField() {
    if (typeof fieldOpt === 'string' && fieldOpt.trim()) return fieldOpt.trim();
    try {
      if (typeof getComputedStyle === 'function' && canvas && canvas.parentElement) {
        const cs = getComputedStyle(canvas.parentElement);
        const bg = cs && cs.backgroundColor && cs.backgroundColor.trim();
        // Ignore transparent / unset backgrounds — they aren't a real field color.
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
      }
    } catch { /* no DOM / no computed style */ }
    try {
      if (
        typeof getComputedStyle === 'function' &&
        typeof document !== 'undefined' &&
        document.documentElement
      ) {
        const v = getComputedStyle(document.documentElement)
          .getPropertyValue('--ribbon-field-bg')
          .trim();
        if (v) return v;
      }
    } catch { /* ignore */ }
    return FIELD_FALLBACK;
  }

  // The RAF loop. Only runs when: live && not paused && in viewport && page visible.
  function frame(nowMs) {
    if (!live || !scene) { running = false; return; }
    if (!startTimeMs) startTimeMs = nowMs;
    const t = (nowMs - startTimeMs) / 1000; // seconds
    scene.render(t);
    if (!firstFramePainted) {
      firstFramePainted = true;
      try { canvas.style.opacity = '1'; } catch { /* ignore */ }
    }
    rafId = requestAnimationFrame(frame);
  }

  function shouldRun() {
    return live && scene && !paused && visibleInViewport && pagePotentiallyVisible;
  }
  function startLoop() {
    if (running || !shouldRun()) return;
    running = true;
    startTimeMs = 0; // re-anchor time so resuming doesn't jump the animation
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  function syncLoop() { if (shouldRun()) startLoop(); else stopLoop(); }

  // Demote to the CSS tier: stop rendering, dispose the scene, keep the host SVG.
  // Used on context loss and on a mid-session flip to reduced motion.
  function demoteToCss() {
    if (!live) return;
    stopLoop();
    try { scene && scene.dispose(); } catch { /* ignore */ }
    scene = null;
    try { canvas.style.opacity = '0'; } catch { /* ignore */ }
    tier = 'css';
  }

  // retheme() — re-read tokens (stroke color/opacity, flow) AND re-resolve the field
  // (a theme switch may change the host background / --ribbon-field-bg) and push both
  // into the scene. Safe before the scene exists (it picks up fresh values at creation)
  // and after demotion (no-op). An explicit opts.field still wins inside the scene.
  function retheme() {
    if (!live || !scene || !resolveTokens) return;
    try { scene.setTokens(resolveTokens()); } catch { /* ignore */ }
    try { scene.setField(resolveField()); } catch { /* ignore */ }
  }

  // Async bring-up of the WebGL scene. Any failure demotes us cleanly.
  (async () => {
    let createScene, readRibbonTokens;
    try {
      const [sceneMod, tokensMod] = await Promise.all([
        import('./scene.js'),
        import('./tokens.js'),
      ]);
      createScene = sceneMod.createScene;
      readRibbonTokens = tokensMod.readRibbonTokens;
    } catch {
      demoteToCss();
      return;
    }
    if (!live) return; // destroyed during import

    // Bind token resolution: caller-provided getTokens wins; else tokens.js.
    if (!resolveTokens) {
      resolveTokens = () => readRibbonTokens({ themeAttr });
    }

    let tokens;
    try { tokens = resolveTokens(); }
    catch { demoteToCss(); return; }

    try {
      scene = createScene(canvas, { tokens, intensity, field: resolveField() });
    } catch {
      demoteToCss();
      return;
    }
    if (!live) { try { scene.dispose(); } catch { /* ignore */ } scene = null; return; }

    // Upload the canonical white-stroke ("bayou current") texture.
    const mask = buildMask();
    if (mask) { try { scene.setMask(mask); } catch { /* ignore */ } }

    // Context loss/restore: preventDefault on loss, demote (host SVG remains). We do
    // not attempt auto-restore of the GL tier — once demoted we stay on CSS for the
    // session, which is the safe, flicker-free choice.
    const onLost = (e) => { try { e.preventDefault(); } catch { /* ignore */ } demoteToCss(); };
    const onRestored = () => { /* intentionally inert: we stay demoted to CSS */ };
    try {
      canvas.addEventListener('webglcontextlost', onLost, false);
      canvas.addEventListener('webglcontextrestored', onRestored, false);
      addDisposer(() => {
        canvas.removeEventListener('webglcontextlost', onLost, false);
        canvas.removeEventListener('webglcontextrestored', onRestored, false);
      });
      try { scene.onContextLost(() => demoteToCss()); } catch { /* optional */ }
      try { scene.onContextRestored(noop); } catch { /* optional */ }
    } catch { /* ignore */ }

    // ResizeObserver -> scene.resize with DPR cap.
    function applySize() {
      if (!scene) return;
      const rect =
        canvas.getBoundingClientRect && canvas.getBoundingClientRect();
      const cssW = (rect && rect.width) || canvas.clientWidth || MASK_VIEWBOX.w;
      const cssH = (rect && rect.height) || canvas.clientHeight || MASK_VIEWBOX.h;
      try { scene.resize(cssW, cssH, currentDpr()); } catch { /* ignore */ }
    }
    if (typeof ResizeObserver !== 'undefined') {
      // Coalesce to a frame: resizing the canvas synchronously inside the RO
      // callback can retrigger layout and emit the benign "ResizeObserver loop
      // completed with undelivered notifications" warning. Deferring to rAF
      // avoids the loop while keeping sizing responsive.
      let roFrame = 0;
      const ro = new ResizeObserver(() => {
        if (roFrame) return;
        roFrame = requestAnimationFrame(() => { roFrame = 0; applySize(); });
      });
      try { ro.observe(canvas); } catch { /* ignore */ }
      addDisposer(() => {
        try { if (roFrame) cancelAnimationFrame(roFrame); ro.disconnect(); } catch { /* ignore */ }
      });
    }
    applySize(); // initial sizing

    // IntersectionObserver -> pause when fully offscreen.
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) visibleInViewport = en.isIntersecting;
        syncLoop();
      }, { threshold: 0 });
      try { io.observe(canvas); } catch { /* ignore */ }
      addDisposer(() => { try { io.disconnect(); } catch { /* ignore */ } });
    }

    // visibilitychange -> pause when the tab is hidden.
    if (typeof document !== 'undefined' && document.addEventListener) {
      const onVis = () => {
        pagePotentiallyVisible = document.visibilityState !== 'hidden';
        syncLoop();
      };
      document.addEventListener('visibilitychange', onVis, false);
      addDisposer(() => document.removeEventListener('visibilitychange', onVis, false));
      pagePotentiallyVisible = document.visibilityState !== 'hidden';
    }

    // MutationObserver on documentElement[themeAttr] -> retheme().
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
      const mo = new MutationObserver(() => retheme());
      try {
        mo.observe(document.documentElement, { attributes: true, attributeFilter: [themeAttr] });
      } catch { /* ignore */ }
      addDisposer(() => { try { mo.disconnect(); } catch { /* ignore */ } });
    }

    // Reduced motion mid-session flip -> destroy the GL scene (demote to CSS).
    const unwatchRM = watchReducedMotion((reduce) => { if (reduce) demoteToCss(); });
    addDisposer(unwatchRM);
    // Forced-colors mid-session flip -> also demote (GL fill can't honor system colors).
    const unwatchFC = watchForcedColors((active) => { if (active) demoteToCss(); });
    addDisposer(unwatchFC);
    // Belt-and-suspenders: if reduced motion is already on, never start.
    if (prefersReducedMotion()) { demoteToCss(); return; }

    // Push the freshest tokens (theme may have changed during async bring-up) and go.
    retheme();
    syncLoop();
  })();

  return {
    get el() { return canvas; },
    get tier() { return tier; },
    pause() { paused = true; stopLoop(); },
    resume() { if (!live) return; paused = false; syncLoop(); },
    retheme,
    destroy() {
      if (!live) return;
      live = false;
      stopLoop();
      while (disposers.length) {
        const d = disposers.pop();
        try { d(); } catch { /* ignore */ }
      }
      try { scene && scene.dispose(); } catch { /* ignore */ }
      scene = null;
      try { canvas.style.opacity = '0'; } catch { /* ignore */ }
    },
  };
}

// Inert controller for the 'static' / 'css' tiers. All methods are safe no-ops
// except retheme() (kept as a no-op too — there is nothing of ours to retheme; the
// host's own CSS theming applies). el reflects the canvas; tier reflects the live
// value via the getter so a (theoretical) future demotion is observable.
function makeInertController(canvas, getTier) {
  return {
    get el() { return canvas; },
    get tier() { return getTier(); },
    pause: noop,
    resume: noop,
    retheme: noop,
    destroy: noop,
  };
}

export default createRibbon;
