/**
 * <hisd-ribbon> — framework-agnostic Web Component wrapper around the HISD
 * animated Ribbon graphic device.
 *
 * THE DEVICE (ground truth): the Ribbon is NOT a gradient band. It is a SOLID
 * brand-color FIELD overlaid with a few soft, white, round-capped, low-opacity
 * sweeping/looping strokes that drift across it like Houston's bayou currents
 * (tone-on-tone: white at low opacity over a colored field reads as lighter
 * arcs). It is used FULL-BLEED as a background behind content. Animation = the
 * white strokes slowly drift/flow (a calm "current"), never a band sliding.
 *
 * LIGHT DOM by design: the element renders the canonical Ribbon markup INTO
 * ITSELF (no shadow root), so the global design-system stylesheets style it
 * exactly like the hand-written HTML:
 *   - assets/hisd-theme.css       (tokens, light/dark, reduced-motion, forced-colors)
 *   - components/ribbon.css       (the .hisd-ribbon host, drift, --fan, --animate)
 *
 * PROGRESSIVE ENHANCEMENT — this is a THIN adapter. Three rungs:
 *   Rung 1 (always present): the static field+strokes SVG (the canonical
 *     ribbon-field.svg structure: a solid field <rect> + two stroke <g> layers)
 *     is rendered into light DOM on connect. With no JS engine, reduced motion,
 *     forced colors, or a weak device this is the whole visual. NEVER removed.
 *   Rung 2 (opt-in via `animate`): on the field variant, when the requested tier
 *     is not 'css', we append a <canvas> overlay (absolutely positioned over the
 *     SVG by ribbon.css) and lazily import the zero-dep WebGL2 core
 *     (../../ribbon-gl/core.js). The core composites a flow-warped white-stroke
 *     texture over the solid field; it owns ALL capability detection, RAF,
 *     observers, mask raster, and context-loss demotion. We only hand it a
 *     <canvas> + options (including `field`) and call destroy() on unmount.
 *
 * The `fan` variant is a pure-CSS divider (no inline SVG, no canvas) — a
 * constrained-media accent, not the canonical device.
 *
 * Attributes (all reflected):
 *   variant     "field" | "fan"              (default "field")
 *   lines       PRESET name (currents, delta, bayou, crossing, calm, weave,
 *               bend, loops, drift, channels)  (default "currents")
 *   seed        integer                      (optional; raw deterministic seed,
 *                                             ignored when `lines` is set)
 *   field       CSS color (e.g. "#7A2D8F")   (optional; overrides the field bg)
 *   animate     boolean   -> adds .hisd-ribbon--animate + (field) mounts WebGL
 *   intensity   number 0..1                  (default 0.6; lower = subtle drift)
 *   tier        "auto" | "css" | "webgl"     (default "auto"; forwarded to core)
 *
 * Theming is automatic via the var(--ribbon-*) fallbacks baked into the field
 * <rect> and stroke <g> plus the data-theme ancestor. The `field` attribute
 * overrides the field color per element (host background + forwarded to the core).
 */
import {
  preset,
  generate,
  PRESETS,
  linesToSVG,
} from '../../ribbon-gl/ribbon-lines.js';

(function () {
  'use strict';

  var VARIANTS = ['field', 'fan'];
  var DEFAULT_INTENSITY = 0.6;
  var DEFAULT_LINES = 'currents';

  /**
   * Resolve the line composition from the shared kit so the static inline SVG
   * matches the WebGL tier: a named PRESET wins, else a raw integer SEED, else
   * the canonical `currents` preset. Deterministic — same input, same paths.
   */
  function resolveLines(linesName, seed) {
    if (linesName && PRESETS[linesName] != null) return preset(linesName);
    if (seed != null && !isNaN(seed)) return generate(seed);
    return preset(DEFAULT_LINES);
  }

  function HISDRibbonClass() {
    if (typeof HTMLElement === 'undefined') return;

    class HISDRibbon extends HTMLElement {
      static get observedAttributes() {
        return [
          'variant',
          'lines',
          'seed',
          'field',
          'animate',
          'intensity',
          'tier',
        ];
      }

      constructor() {
        super();
        /** @type {{destroy:Function, retheme?:Function}|null} */
        this._controller = null;
        /** @type {HTMLCanvasElement|null} */
        this._canvas = null;
        /** Guards against re-entrant async mounts racing destroy(). */
        this._mountToken = 0;
      }

      connectedCallback() {
        // Host is decorative: it carries no semantics of its own.
        if (!this.hasAttribute('role')) {
          this.setAttribute('role', 'presentation');
        }
        this._render();
      }

      disconnectedCallback() {
        this._teardownEngine();
      }

      attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;
        if (!this.isConnected) return;

        if (name === 'variant' || name === 'lines' || name === 'seed') {
          // Structural change (svg <-> fan, or a new line composition): full
          // re-render so the inline SVG floor and the remounted WebGL tier share
          // the same generated paths.
          this._render();
          return;
        }
        if (name === 'field') {
          // Field color override: update the host background var (drives both the
          // static <rect> and the CSS floor), then remount the engine so the
          // WebGL overlay composites over the new field.
          this._syncFieldStyle();
          if (this.animate && this.variant === 'field' && this._controller) {
            this._teardownEngine();
            this._maybeMountEngine();
          }
          return;
        }
        if (name === 'animate') {
          // Toggle the CSS class immediately, then mount/unmount the engine.
          this._syncAnimateClass();
          if (this.animate) {
            this._maybeMountEngine();
          } else {
            this._teardownEngine();
          }
          return;
        }
        if (name === 'tier') {
          // Tier is decided at mount time by the core; remount to apply.
          if (this.animate && this.variant === 'field') {
            this._teardownEngine();
            this._maybeMountEngine();
          }
          return;
        }
        if (name === 'intensity') {
          // Intensity is read at createRibbon() time; remount to apply.
          if (this._controller) {
            this._teardownEngine();
            this._maybeMountEngine();
          }
        }
      }

      /* -------------------------------------------------------------------- */
      /* Property <-> attribute reflection (ergonomic JS API)                  */
      /* -------------------------------------------------------------------- */
      get variant() {
        var v = this.getAttribute('variant');
        return VARIANTS.indexOf(v) !== -1 ? v : 'field';
      }
      set variant(val) {
        this.setAttribute('variant', val);
      }

      /** Named line-composition preset (a key of PRESETS), or null. */
      get lines() {
        var l = this.getAttribute('lines');
        return l && PRESETS[l] != null ? l : null;
      }
      set lines(val) {
        if (val == null || val === '') this.removeAttribute('lines');
        else this.setAttribute('lines', String(val));
      }

      /** Raw integer seed for the line composition, or null. */
      get seed() {
        var raw = this.getAttribute('seed');
        if (raw == null || raw === '') return null;
        var n = parseInt(raw, 10);
        return isNaN(n) ? null : n;
      }
      set seed(val) {
        if (val == null || val === '') this.removeAttribute('seed');
        else this.setAttribute('seed', String(val));
      }

      get field() {
        return this.getAttribute('field') || null;
      }
      set field(val) {
        if (val == null || val === '') this.removeAttribute('field');
        else this.setAttribute('field', String(val));
      }

      get animate() {
        return this.hasAttribute('animate');
      }
      set animate(val) {
        if (val) this.setAttribute('animate', '');
        else this.removeAttribute('animate');
      }

      get intensity() {
        var raw = parseFloat(this.getAttribute('intensity'));
        if (isNaN(raw)) return DEFAULT_INTENSITY;
        if (raw < 0) return 0;
        if (raw > 1) return 1;
        return raw;
      }
      set intensity(val) {
        this.setAttribute('intensity', String(val));
      }

      get tier() {
        var t = this.getAttribute('tier');
        return t === 'css' || t === 'webgl' ? t : 'auto';
      }
      set tier(val) {
        this.setAttribute('tier', val);
      }

      /* -------------------------------------------------------------------- */
      /* Render the canonical field+strokes markup into the light DOM.         */
      /* -------------------------------------------------------------------- */
      _render() {
        // Remounting structurally: drop any live engine first.
        this._teardownEngine();

        if (this.variant === 'fan') {
          // Fan divider is pure CSS — no inline SVG, no canvas.
          this.className = this._composeClass('hisd-ribbon hisd-ribbon--fan');
          this.innerHTML = '';
          this._syncFieldStyle();
          return;
        }

        // Field: inline the canonical field+strokes SVG. The strokes use a single
        // var(--ribbon-stroke), so no per-instance gradient/clip ids are needed —
        // multiple ribbons on one page never collide.
        this.className = this._composeClass('hisd-ribbon');
        this.innerHTML = this._fieldSVG();
        this._syncFieldStyle();

        if (this.animate) this._maybeMountEngine();
      }

      /** Build the host class list, preserving the --animate flag. */
      _composeClass(base) {
        return this.animate ? base + ' hisd-ribbon--animate' : base;
      }

      /** Toggle just the --animate class without re-rendering structure. */
      _syncAnimateClass() {
        var base =
          this.variant === 'fan'
            ? 'hisd-ribbon hisd-ribbon--fan'
            : 'hisd-ribbon';
        this.className = this._composeClass(base);
      }

      /**
       * Apply the `field` color as the --ribbon-field-bg custom property on the
       * host. The static <rect> reads it via var(), the CSS floor inherits it,
       * and it is the same color forwarded to the WebGL core — keeping the static
       * and animated fields in sync. Clearing the attribute falls back to tokens.
       */
      _syncFieldStyle() {
        var f = this.field;
        if (f) this.style.setProperty('--ribbon-field-bg', f);
        else this.style.removeProperty('--ribbon-field-bg');
      }

      /**
       * Build the canonical field+strokes SVG from the shared line kit. The line
       * composition is resolved from the `lines` preset / `seed` attributes so the
       * inline static floor renders the SAME paths the WebGL tier animates. The
       * field/stroke/group-opacity are left as the var() fallbacks so theming and
       * the `field` override still flow through the custom properties.
       */
      _fieldSVG() {
        var lines = resolveLines(this.lines, this.seed);
        return linesToSVG(lines, { layered: true });
      }

      /* -------------------------------------------------------------------- */
      /* Rung 2 — lazily overlay the WebGL2 core on a capable client.          */
      /* -------------------------------------------------------------------- */
      _maybeMountEngine() {
        // Only the field variant has a field to flow strokes over.
        if (this.variant !== 'field') return;
        if (!this.animate) return;
        // Author explicitly pinned the CSS/static floor — no canvas at all.
        if (this.tier === 'css') return;
        // Already mounted (or mounting).
        if (this._controller || this._canvas) return;
        // No <svg> floor means _render() hasn't run yet; bail (it will retry).
        if (!this.querySelector('svg')) return;

        var canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        // ribbon.css positions this absolute; inset:0 over the SVG floor.
        this.appendChild(canvas);
        this._canvas = canvas;

        var token = ++this._mountToken;
        var intensity = this.intensity;
        var tier = this.tier;
        var field = this.field;
        var lines = this.lines;
        var seed = this.seed;

        import('../../ribbon-gl/core.js')
          .then(
            function (mod) {
              // Lost the race to a teardown / remount — discard.
              if (token !== this._mountToken || canvas.parentNode == null) {
                return;
              }
              var opts = { tier: tier, intensity: intensity };
              // Forward the field color so the core composites its strokes over
              // the same solid field. When absent the core reads the host's
              // computed background-color, else --ribbon-field-bg.
              if (field) opts.field = field;
              // Forward the line composition (preset name and/or seed) so the
              // animated tier flows the SAME composition the static inline SVG
              // renders. Forward-compatible: a no-op until the core consumes them.
              if (lines) opts.variant = lines;
              if (seed != null) opts.seed = seed;
              this._controller = mod.createRibbon(canvas, opts);
            }.bind(this),
          )
          .catch(
            function () {
              // WebGL core failed to load — the static SVG floor remains intact.
              // Clean up the orphaned canvas so it doesn't sit dead over the art.
              if (token === this._mountToken && canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
              }
              if (this._canvas === canvas) this._canvas = null;
            }.bind(this),
          );
      }

      _teardownEngine() {
        // Invalidate any in-flight async mount.
        this._mountToken += 1;
        if (this._controller) {
          try {
            this._controller.destroy();
          } catch (e) {
            /* never let teardown throw across unmount */
          }
          this._controller = null;
        }
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
        }
        this._canvas = null;
      }
    }

    return HISDRibbon;
  }

  if (
    typeof customElements !== 'undefined' &&
    !customElements.get('hisd-ribbon')
  ) {
    var Cls = HISDRibbonClass();
    if (Cls) customElements.define('hisd-ribbon', Cls);
  }
})();
