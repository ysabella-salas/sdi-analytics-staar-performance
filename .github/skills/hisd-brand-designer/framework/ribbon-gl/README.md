# `ribbon-gl` — animated HISD Ribbon, raw-WebGL2 core

Framework-agnostic, **zero-dependency** core that paints the live HISD **Ribbon
device**: a **solid brand-color field** overlaid with a few soft, white, round-capped,
**low-opacity strokes that slowly drift/flow** across it like Houston's bayou currents
(tone-on-tone — white at low opacity over a colored field reads as lighter arcs). Used
**full-bleed** as a background behind content. Plain ESM, no npm deps (no three.js, no
OGL). GLSL is shipped as plain strings to `gl.shaderSource`, so it is **CSP-safe** (no
`eval`, no inline `<script>`, no asset fetch).

> **Not a gradient band.** Earlier iterations modeled the Ribbon as a single gradient
> bezier band; the real device is the **field + drifting white strokes** described
> above. The animation is the white strokes flowing (a calm current), never a band
> sliding. The band/fan gradient tokens are retained only as **constrained-media
> accents**.

This is **rung 2** of the Ribbon's progressive-enhancement ladder. Phase 3 ships
thin React and Web-Component adapters that consume this core unchanged — so the
public API is tiny and **frozen**.

## The rung ladder

| Rung | Tier | What renders | When |
|------|------|--------------|------|
| 0 | `static` | The canonical Ribbon SVG (solid field + static white strokes), no motion | Reduced motion, forced colors, save-data, weak device, no WebGL2, or `tier:'static'` |
| 1 | `css` | Same field + strokes, CSS-only drift (host-owned) | `tier:'css'`, or after a mid-session demotion |
| 2 | `webgl` | This module: solid field with the white strokes flow-warped (drifting) over it | `tier:'auto'` on a capable device, or `tier:'webgl'` (force) |

Every higher rung renders the **same device** (field + white strokes). We never tear
down the host SVG/CSS — if the GL tier can't start (or is lost), rung 0/1 is already
on screen and simply remains. The GL canvas only crossfades **in** after its first
painted frame, and crossfades back out on demotion/destroy.

## Public API (frozen)

```js
// core.js
export function createRibbon(canvas, opts) -> controller
```

`opts`:

| key | type | default | meaning |
|-----|------|---------|---------|
| `tier` | `'auto' \| 'css' \| 'webgl'` | `'auto'` | `'auto'` = capability-gated; `'css'`/`'static'` = never WebGL; `'webgl'` = force-try |
| `getTokens` | `() => RibbonTokens` | reads `window.HISD_TOKENS` + `getComputedStyle` | override token resolution |
| `intensity` | `number` 0..1 | `0.6` | **tiered**: lower = subtle drift, higher = organic flow |
| `themeAttr` | `string` | `'data-theme'` | attribute on `<html>` that selects light/dark |
| `field` | `string` (CSS color) | host's computed `background-color`, else `--ribbon-field-bg`, else `#00A3AF` | the solid field color; any brand color may override per section |

`controller`:

```ts
{
  destroy(): void,   // tear down all observers/RAF, dispose the scene
  pause(): void,     // stop the RAF loop (host-driven)
  resume(): void,    // resume if still live and visible
  retheme(): void,   // re-read tokens and push to the scene (safe on any tier)
  readonly el: HTMLCanvasElement,
  readonly tier: 'static' | 'css' | 'webgl',
}
```

On a non-WebGL tier the controller is **inert**: `el` reflects the canvas, `tier`
reflects the resolved tier, and all four methods are safe no-ops. `createRibbon`
always returns **synchronously**; the WebGL scene is brought up asynchronously and
demotes cleanly to `css` on any failure.

## Module APIs (frozen — specialists implement exactly this)

```js
// capabilities.js
export function pickTier(opts) -> 'static' | 'css' | 'webgl'
//   'webgl' only if ALL: WebGL2 context obtainable; !navigator.connection?.saveData;
//   (navigator.hardwareConcurrency ?? 4) >= 4; (navigator.deviceMemory ?? 4) >= 4;
//   NOT matchMedia('(prefers-reduced-motion: reduce)').matches;
//   NOT matchMedia('(forced-colors: active)').matches; and opts.tier !== 'css'/'static'.
//   If opts.tier === 'webgl' force-try; if 'css'/'static' never webgl.
export function prefersReducedMotion() -> boolean
export function watchReducedMotion(cb) -> () => void   // unsubscribe; fires on change
export function watchForcedColors(cb) -> () => void
export function supportsWebGL2() -> boolean

// tokens.js
export function readRibbonTokens(opts?) -> RibbonTokens
//   RibbonTokens = {
//     // THE DEVICE — what the GL path composites:
//     field:[r,g,b], stroke:[r,g,b], strokeOpacity:number,   // 0..1 floats, theme-resolved
//     // constrained-media accents (retained; NOT used by the GL composite):
//     from:[r,g,b], to:[r,g,b], hi:[r,g,b], fan:[[r,g,b]x4], fanPos:[f,f,f,f],
//     flowSpeedMs:number }
//   Source: window.HISD_TOKENS.ribbon — field-bg/stroke ({light,dark} hex), stroke-opacity
//     ({light,dark} number); accepts kebab (field-bg) or camel (fieldBg). theme from
//     document.documentElement.getAttribute(themeAttr). flowSpeedMs from
//     getComputedStyle(documentElement).getPropertyValue('--duration-slower') ('500ms'->500).
//     Fallbacks if HISD_TOKENS absent: field-bg #00A3AF (both), stroke #FFFFFF,
//       stroke-opacity 0.16 light / 0.22 dark.
export function hexToVec3(hex) -> [r,g,b]   // 0..1, sRGB

// scene.js  (raw WebGL2; imports GLSL from ./shaders/index.js)
export function createScene(canvas, { tokens, intensity, field }) -> {
  render(timeSeconds),              // draw one frame
  resize(cssW, cssH, dpr),          // set drawingbuffer size, viewport, uResolution
  setTokens(tokens),                // update field/stroke/strokeOpacity/flow uniforms (retheme)
  setField(cssColor),               // pin the solid field to a CSS color (null = track tokens)
  setMask(image),                   // upload the WHITE-STROKE texture (HTMLCanvas/ImageBitmap)
  dispose(),                        // delete program/buffers/textures, lose context
  onContextLost(cb), onContextRestored(cb)
}
//   `field` (opts) and setField accept a CSS color ('#rgb'/'#rrggbb' or 'rgb()/rgba()');
//   an explicit field PINS the field and wins over tokens.field on retheme.

// shaders/index.js
export const VERT, FRAG, NOISE   // plain GLSL ES 3.00 strings ('#version 300 es')
```

### Uniform contract (shader + scene share)

```
uTime           float   seconds
uResolution     vec2    drawing-buffer px
uField          vec3    solid field color (the section brand color)
uStroke         vec3    current-stroke color (#fff)
uStrokeOpacity  float   group-level stroke multiplier (--ribbon-stroke-opacity)
uFlowSpeed      float   from tokens (--duration-slower), drives flow rate
uIntensity      float   0..1, scales the domain-warp amplitude (drift -> current)
uMask           sampler2D  rasterized WHITE STROKES; .a = stroke coverage
```

### Shader look (tiered, driven by `uIntensity`)

Fill the solid `uField`, then sample the white-stroke texture (`uMask.a`) at a
**flow-warped uv** — the sample coordinate is domain-warped by a curl/simplex (+ slow
fbm) field scaled by `uIntensity` and `uTime * uFlowSpeed`, so the strokes **drift/flow**
like a current. Composite tone-on-tone: `col = mix(uField, uStroke, strokeA * uStrokeOpacity)`.
Output is **opaque** (the field is full-bleed). **Subtle** drift at low intensity,
**organic "bayou current"** at high. No flashing — slow continuous motion only.
Mobile-cheap: no heavy loops, `mediump` throughout.

## Stroke provenance — canonical white strokes, rasterized at runtime

There is **no PNG asset and no build step**. The core rasterizes the canonical
"bayou current" **white strokes** by drawing them to an **offscreen 2D canvas**
(`#fff`, round caps, per-path width + opacity) and uploading the result as the `uMask`
texture (`.a` = stroke coverage). The verbatim two-layer stroke set on a `1920 × 1080`
(16:9) viewBox:

```
Layer A:
  M770,-80 C700,320 980,470 1110,600 C1280,760 1470,980 1600,1160   w56 a.18
  M1740,-80 C1660,280 1820,520 2010,650                             w46 a.16
  M-60,610 C150,540 360,620 360,800 C360,970 230,1020 150,1160      w40 a.15
Layer B:
  M340,-80 C320,260 150,360 -80,470                                 w42 a.13
  M1180,-80 C1230,260 1120,430 1260,600 C1380,740 1560,720 1740,860 w34 a.10
```

drawn with `new Path2D(d)` scaled to the offscreen canvas. The fragment shader samples
`uMask` at the **flow-warped `vUv`** and composites the strokes over the field. The
per-path alphas give the layered tone-on-tone depth; the **group-level**
`--ribbon-stroke-opacity` multiplier is applied in the shader (`uStrokeOpacity`), not in
the raster. The stroke set lives in **`core.js` only** (`STROKE_PATHS`); edit it there in
lock-step with `ribbon-field.svg`.

The **solid field** color is resolved by `core.js` (`opts.field` → host computed
`background-color` → `--ribbon-field-bg` → canonical teal `#00A3AF`) and pushed to the
scene via `setField`, so any brand color may back a section.

## The brand-hex rule (non-negotiable)

> **Shaders and JS read colors from `HISD_TOKENS` / `tokens.js` ONLY. Never hardcode
> brand hex in `core.js`, `scene.js`, or the shaders.**

The allowed hardcoded fallbacks live inside **`tokens.js`** (the device/accent token
fallbacks) and **one** documented field fallback in `core.js` (`FIELD_FALLBACK =
'#00A3AF'`, the canonical teal — the last resort when `opts.field`, the host
background-color, and `--ribbon-field-bg` are all absent). These keep the Ribbon
rendering standalone when `window.HISD_TOKENS` / CSS vars are unavailable. All other
color reaching the GPU flows through `RibbonTokens` / `opts.field`; theme switches
(light/dark) are delivered by re-reading tokens **and re-resolving the field** via
`retheme()`, which the core wires to a `MutationObserver` on
`documentElement[themeAttr]`.

## Lifecycle & power behavior (handled by `core.js`)

- **RAF loop** gated by an `IntersectionObserver` (pause fully offscreen) and
  `visibilitychange` (pause hidden tab), plus host `pause()`/`resume()`.
- **`ResizeObserver`** → `scene.resize(cssW, cssH, dpr)` with a **DPR cap ≤ 1.5**,
  scaled by `0.67×` on coarse pointers / low-core machines.
- **`webglcontextlost`** → `preventDefault()` + demote to `css` (stop loop, dispose
  scene; host SVG remains). We stay demoted for the session (flicker-free).
- **Reduced motion**: gated up front in `pickTier()`; a **mid-session flip** to
  reduce destroys the scene. Forced-colors mid-session flip demotes too.
- **`destroy()`** disconnects every observer/listener, cancels RAF, and disposes the
  scene.

## Layout

```
ribbon-gl/
  core.js              orchestration (this is the entry; owns the canonical stroke set + field resolve)
  capabilities.js      tier gating + media-query watchers          (specialist)
  tokens.js            HISD_TOKENS -> RibbonTokens + fallbacks      (specialist)
  scene.js             raw WebGL2 scene                              (specialist)
  shaders/index.js     VERT / FRAG / NOISE GLSL strings              (specialist)
  tests/ribbon-gl.smoke.mjs   Node smoke test (no real WebGL)
  package.json
```

## Test

```sh
node tests/ribbon-gl.smoke.mjs        # or: npm test
```

Dependency-free (`node:assert`). It stubs the browser globals and a `getContext()`-
returns-`null` canvas, asserts `createRibbon` returns a controller on the inert
(`static`/`css`) path without touching WebGL, and that the controller methods don't
throw. It never imports `scene.js` / the shaders.
