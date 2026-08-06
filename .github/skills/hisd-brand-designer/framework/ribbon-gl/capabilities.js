// capabilities.js — device/environment gating for the animated HISD Ribbon.
//
// Pure DOM/standards APIs. Zero npm dependencies. SSR-safe: every browser global
// is guarded so importing or calling these functions never throws in Node or during
// server render. Nothing here touches WebGL except supportsWebGL2(), which probes
// once and caches the answer.
//
// This module owns ALL the "can we afford the live WebGL fill?" policy. core.js calls
// pickTier() synchronously up front and trusts the result; if pickTier returns
// anything other than 'webgl', no canvas/WebGL work happens at all.

// ── Environment guards ──────────────────────────────────────────────────────────

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

// matchMedia is the backbone of the reduced-motion / forced-colors / coarse checks.
// Guard it once: SSR has no matchMedia, and some embedded webviews lack it.
function mql(query) {
  if (!hasWindow || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(query);
  } catch {
    return null;
  }
}

// A media query is "active" only if we could actually evaluate it and it matched.
// When matchMedia is unavailable we treat the query as NOT matching (false) — i.e.
// we never *infer* reduced-motion / forced-colors from absence; absence is permissive
// except where the spec demands a conservative default (see pickTier device gates).
function mediaMatches(query) {
  const m = mql(query);
  return m ? m.matches === true : false;
}

// ── Reduced motion ───────────────────────────────────────────────────────────────

/**
 * prefersReducedMotion() -> boolean
 * True when the OS/browser requests reduced motion. False when unknown.
 */
export function prefersReducedMotion() {
  return mediaMatches('(prefers-reduced-motion: reduce)');
}

// Shared subscribe helper for a media query. Returns an unsubscribe function that is
// always safe to call (idempotent, never throws). Fires cb(matches:boolean) on change.
// Supports both the modern addEventListener('change') API and the legacy
// addListener/removeListener API (older Safari) for maximum reach.
function watchMedia(query, cb) {
  const m = mql(query);
  if (!m || typeof cb !== 'function') return () => {};

  const handler = (event) => {
    // `event` may be the MediaQueryListEvent or, on legacy paths, the list itself.
    const matches = event && typeof event.matches === 'boolean' ? event.matches : m.matches;
    try {
      cb(matches === true);
    } catch {
      /* never let a subscriber error escape the change handler */
    }
  };

  if (typeof m.addEventListener === 'function') {
    m.addEventListener('change', handler);
    return () => {
      try {
        m.removeEventListener('change', handler);
      } catch {
        /* ignore */
      }
    };
  }

  if (typeof m.addListener === 'function') {
    // Legacy Safari < 14.
    m.addListener(handler);
    return () => {
      try {
        m.removeListener(handler);
      } catch {
        /* ignore */
      }
    };
  }

  return () => {};
}

/**
 * watchReducedMotion(cb) -> () => void
 * Subscribe to prefers-reduced-motion changes. cb receives the new boolean state.
 * Returns an unsubscribe function. No-op (returns a no-op unsubscribe) under SSR.
 */
export function watchReducedMotion(cb) {
  return watchMedia('(prefers-reduced-motion: reduce)', cb);
}

/**
 * watchForcedColors(cb) -> () => void
 * Subscribe to forced-colors (high-contrast / Windows contrast themes) changes.
 * cb receives the new boolean state. Returns an unsubscribe function.
 */
export function watchForcedColors(cb) {
  return watchMedia('(forced-colors: active)', cb);
}

// ── WebGL2 support (probed once, cached) ─────────────────────────────────────────

let _webgl2Supported; // undefined until first probe; then a boolean (cached forever).

/**
 * supportsWebGL2() -> boolean
 * Actually attempts to obtain a WebGL2 rendering context from a throwaway canvas and
 * caches the result for the lifetime of the module. SSR-safe (returns false when there
 * is no document/canvas).
 */
export function supportsWebGL2() {
  if (typeof _webgl2Supported === 'boolean') return _webgl2Supported;

  if (!hasDocument || typeof document.createElement !== 'function') {
    _webgl2Supported = false;
    return _webgl2Supported;
  }

  if (typeof WebGL2RenderingContext === 'undefined') {
    _webgl2Supported = false;
    return _webgl2Supported;
  }

  let ok = false;
  try {
    const canvas = document.createElement('canvas');
    // failIfMajorPerformanceCaveat keeps us off software rasterizers, which would make
    // the live fill jankier than the CSS tier we'd otherwise fall back to.
    const gl =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext('webgl2');
    ok = !!gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    // Release the probe context promptly so we don't hold a GPU context slot.
    if (gl) {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose && typeof lose.loseContext === 'function') {
        try {
          lose.loseContext();
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    ok = false;
  }

  _webgl2Supported = ok;
  return _webgl2Supported;
}

// ── Tier selection ───────────────────────────────────────────────────────────────

// Defensive readers for optional navigator fields. The spec defaults: hardwareConcurrency
// -> 4, deviceMemory -> 4. navigator.connection / saveData may be entirely absent.
function nav() {
  return hasWindow && typeof navigator !== 'undefined' ? navigator : undefined;
}

function saveDataEnabled() {
  const n = nav();
  const conn = n && n.connection;
  return !!(conn && conn.saveData === true);
}

function hardwareConcurrency() {
  const n = nav();
  const v = n && n.hardwareConcurrency;
  return typeof v === 'number' && Number.isFinite(v) ? v : 4;
}

function deviceMemory() {
  const n = nav();
  const v = n && n.deviceMemory;
  return typeof v === 'number' && Number.isFinite(v) ? v : 4;
}

/**
 * pickTier(opts) -> 'static' | 'css' | 'webgl'
 *
 * opts.tier: 'auto' | 'css' | 'webgl' | 'static' (default 'auto').
 *   - 'css' / 'static': never WebGL — returns that tier verbatim.
 *   - 'webgl': force-try the WebGL path. We still require an obtainable WebGL2 context
 *     (we can't render without one), but we bypass the device-affordance gates
 *     (save-data, cores, memory) and the reduced-motion / forced-colors gates — the
 *     caller has explicitly opted in. If no WebGL2 context is available, fall back to
 *     'css' so the host SVG/CSS tier still shows.
 *   - 'auto' (default): WebGL only if ALL gates pass; otherwise 'css'.
 *
 * 'auto' WebGL requires ALL of:
 *   - supportsWebGL2()
 *   - NOT save-data
 *   - hardwareConcurrency (>= 4, default 4)
 *   - deviceMemory (>= 4, default 4)
 *   - NOT prefers-reduced-motion
 *   - NOT forced-colors: active
 */
export function pickTier(opts = {}) {
  const requested = opts && typeof opts.tier === 'string' ? opts.tier : 'auto';

  // Explicit non-WebGL requests are honored verbatim.
  if (requested === 'static') return 'static';
  if (requested === 'css') return 'css';

  // Explicit WebGL request: force-try, bypassing affordance/accessibility gates, but
  // we still need a real WebGL2 context to render at all.
  if (requested === 'webgl') {
    return supportsWebGL2() ? 'webgl' : 'css';
  }

  // 'auto' (and any unrecognized value treated as auto): full gating.
  if (prefersReducedMotion()) return 'css';
  if (mediaMatches('(forced-colors: active)')) return 'css';
  if (saveDataEnabled()) return 'css';
  if (hardwareConcurrency() < 4) return 'css';
  if (deviceMemory() < 4) return 'css';
  if (!supportsWebGL2()) return 'css';

  return 'webgl';
}
