// ribbon-gl.smoke.mjs — dependency-free Node smoke test for the ribbon-gl core.
//
// Goal: prove createRibbon() returns a well-formed controller and that the inert
// ('static'/'css') path never touches WebGL and never throws. We do NOT exercise
// the real WebGL path here (no GL in Node) — we stub the browser globals so that
// the device-gating in capabilities.pickTier() resolves to a non-webgl tier, and
// we give the canvas a getContext() that returns null (so even a forced attempt
// could not obtain a context).
//
// capabilities.js is owned by another specialist and may not exist yet. To keep
// this test runnable in isolation (and dependency-free — no import maps/loaders),
// we write a MINIMAL throwaway capabilities.js stub into the package dir ONLY if a
// real one is absent, and delete it afterwards. If the real module already exists,
// we use it untouched. core.js itself is never modified.

import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..');
const capPath = join(pkgDir, 'capabilities.js');

let createdStub = false;

// ── Minimal capabilities.js stub (only if the real one is missing) ──────────────
// Matches the frozen capabilities API. pickTier honors an explicit opts.tier and
// otherwise reads the (stubbed) globals; with no WebGL2 available it returns 'static'.
const CAP_STUB = `// TEMPORARY smoke-test stub — overwritten by the capabilities.js specialist.
export function supportsWebGL2() {
  try {
    if (typeof document === 'undefined' || !document.createElement) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext && c.getContext('webgl2'));
  } catch { return false; }
}
export function prefersReducedMotion() {
  try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
}
export function pickTier(opts = {}) {
  const t = opts.tier;
  if (t === 'css') return 'css';
  if (t === 'static') return 'static';
  const force = t === 'webgl';
  if (!force) {
    if (prefersReducedMotion()) return 'static';
    if (typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData) return 'static';
    if (((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ?? 4) < 4) return 'static';
    if (((typeof navigator !== 'undefined' && navigator.deviceMemory) ?? 4) < 4) return 'static';
    try { if (typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches) return 'static'; } catch {}
  }
  return supportsWebGL2() ? 'webgl' : 'static';
}
export function watchReducedMotion(cb) { void cb; return () => {}; }
export function watchForcedColors(cb) { void cb; return () => {}; }
`;

if (!existsSync(capPath)) {
  writeFileSync(capPath, CAP_STUB, 'utf8');
  createdStub = true;
}

// ── Stub the browser environment ────────────────────────────────────────────────
function fakeCanvas() {
  const style = {};
  return {
    style,
    clientWidth: 640,
    clientHeight: 240,
    // getContext returns null: no WebGL2 (and no 2D) — the GL path can't start.
    getContext() { return null; },
    getBoundingClientRect() { return { width: 640, height: 240, top: 0, left: 0 }; },
    addEventListener() {},
    removeEventListener() {},
  };
}

// Some globals (e.g. `navigator`) are read-only accessor properties in modern Node;
// plain assignment throws. Try assignment, fall back to a configurable defineProperty.
function defineGlobal(name, value) {
  try { globalThis[name] = value; return; } catch { /* read-only accessor */ }
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function fakeMatchMedia(query) {
  // Default everything to NOT matching (no reduced-motion, no forced-colors, fine pointer).
  return {
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  };
}

defineGlobal('window', globalThis);
defineGlobal('devicePixelRatio', 2);
defineGlobal('matchMedia', fakeMatchMedia);
// `navigator` is a read-only accessor global in modern Node — define, don't assign.
defineGlobal('navigator', {
  hardwareConcurrency: 8,
  deviceMemory: 8,
  connection: { saveData: false },
});
defineGlobal('document', {
  visibilityState: 'visible',
  documentElement: { getAttribute() { return null; } },
  // createElement('canvas') -> a 2D-less canvas so the mask raster path also no-ops.
  createElement() {
    return {
      width: 0, height: 0,
      getContext() { return null; },
      style: {},
    };
  },
  addEventListener() {},
  removeEventListener() {},
});
defineGlobal('requestAnimationFrame', () => 0);
defineGlobal('cancelAnimationFrame', () => {});

// ── Run the assertions ──────────────────────────────────────────────────────────
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failures++; console.error(`  XX  ${name}\n      ${err && err.message ? err.message : err}`); }
}

try {
  const { createRibbon } = await import('../core.js');
  const def = (await import('../core.js')).default;

  check('module exports createRibbon (named + default)', () => {
    assert.equal(typeof createRibbon, 'function');
    assert.equal(typeof def, 'function');
    assert.equal(def, createRibbon);
  });

  // 1) auto tier on a no-WebGL2 environment -> inert controller.
  const c1 = createRibbon(fakeCanvas(), {});
  check('createRibbon(fakeCanvas, {}) returns a controller object', () => {
    assert.ok(c1 && typeof c1 === 'object');
  });
  check("auto tier resolves to a non-webgl tier ('static' or 'css')", () => {
    assert.ok(c1.tier === 'static' || c1.tier === 'css', `tier was '${c1.tier}'`);
  });
  check('controller exposes el + tier + the 4 methods', () => {
    assert.ok('el' in c1);
    assert.equal(typeof c1.tier, 'string');
    for (const m of ['destroy', 'pause', 'resume', 'retheme']) {
      assert.equal(typeof c1[m], 'function', `missing method ${m}`);
    }
  });
  check('inert controller methods do not throw (and are idempotent)', () => {
    assert.doesNotThrow(() => { c1.pause(); c1.resume(); c1.retheme(); });
    assert.doesNotThrow(() => { c1.destroy(); c1.destroy(); }); // double-destroy safe
    assert.doesNotThrow(() => { c1.pause(); c1.resume(); });    // post-destroy safe
  });

  // 2) explicit opts.tier === 'css' is honored and never touches WebGL.
  const c2 = createRibbon(fakeCanvas(), { tier: 'css' });
  check("opts.tier === 'css' yields tier 'css'", () => {
    assert.equal(c2.tier, 'css');
  });
  check("opts.tier === 'css' methods do not throw", () => {
    assert.doesNotThrow(() => { c2.pause(); c2.resume(); c2.retheme(); c2.destroy(); });
  });

  // 3) explicit opts.tier === 'static' is honored.
  const c3 = createRibbon(fakeCanvas(), { tier: 'static' });
  check("opts.tier === 'static' yields tier 'static'", () => {
    assert.equal(c3.tier, 'static');
  });

  // 4) custom getTokens / intensity / themeAttr don't break the inert path.
  check('extra opts (getTokens/intensity/themeAttr) tolerated on inert path', () => {
    const c4 = createRibbon(fakeCanvas(), {
      tier: 'css',
      intensity: 0.9,
      themeAttr: 'data-color-mode',
      getTokens: () => ({}),
    });
    assert.doesNotThrow(() => { c4.retheme(); c4.destroy(); });
  });
} finally {
  if (createdStub) { try { rmSync(capPath); } catch { /* ignore */ } }
}

if (failures > 0) {
  console.error(`\nFAIL — ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nPASS — ribbon-gl core smoke test green.');
  process.exit(0);
}
