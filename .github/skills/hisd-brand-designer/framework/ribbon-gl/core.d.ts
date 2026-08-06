/**
 * TypeScript declarations for the zero-dependency raw-WebGL2 Ribbon core.
 *
 * The runtime is plain ESM JavaScript (`core.js`); this sidecar `.d.ts` documents
 * its public surface so TypeScript consumers (e.g. the React adapter's dynamic
 * `import('../../ribbon-gl/core.js')`) resolve precise types with no implicit any.
 * Keep this in sync with `core.js` — it is the typed contract for the engine.
 */

/** Render tier — mirrors `opts.tier`. The core may demote `'webgl'`→`'css'` at runtime. */
export type RibbonTier = 'auto' | 'css' | 'webgl' | 'static';

/**
 * Brand-color token bag the core reads (defaults to `tokens.js` over
 * `window.HISD_TOKENS`). The Ribbon is a SOLID brand-color FIELD overlaid with soft,
 * low-opacity WHITE STROKES that drift over it; `field-bg` / `stroke` / `stroke-opacity`
 * are what the GL path composites. `from` / `to` / `highlight` are retained as
 * constrained-media accents.
 */
export interface RibbonTokens {
  /** Solid field color (theme-resolved). Accepts `field-bg` (DTCG) or `fieldBg` (JS). */
  'field-bg'?: string | { light?: string; dark?: string };
  fieldBg?: string | { light?: string; dark?: string };
  /** Current-stroke color (#fff). */
  stroke?: string | { light?: string; dark?: string };
  /** Group-level stroke opacity multiplier (theme-resolved). */
  'stroke-opacity'?: number | { light?: number; dark?: number };
  strokeOpacity?: number | { light?: number; dark?: number };
  /** Constrained-media accents (not used by the GL composite). */
  from?: string;
  to?: string;
  highlight?: string;
  [key: string]: unknown;
}

/** Options accepted by {@link createRibbon}. */
export interface RibbonOptions {
  /** Tier override. `'auto'` (default) lets capability detection decide. */
  tier?: RibbonTier;
  /** Custom token resolver; defaults to the core's `tokens.js` reader. */
  getTokens?: () => RibbonTokens;
  /** Animation intensity, 0..1 (default 0.6). Lower = subtle drift, higher = organic flow. */
  intensity?: number;
  /** Ancestor attribute the core watches for theme changes. Default `'data-theme'`. */
  themeAttr?: string;
  /**
   * CSS color for the solid field. If omitted the core reads the host element's
   * computed `background-color`, then the `--ribbon-field-bg` custom property, then
   * falls back to the canonical teal. Any brand color may override per section.
   */
  field?: string;
  /**
   * Named "bayou current" stroke preset from the line kit (`ribbon-lines.js`
   * `PRESETS`: `'currents'`, `'delta'`, `'bayou'`, `'crossing'`, `'calm'`, `'weave'`,
   * `'bend'`, `'loops'`, `'drift'`, `'channels'`). Wins over {@link seed}. If omitted
   * (and no `seed`) the core uses the canonical `'currents'` preset.
   */
  variant?: string;
  /**
   * Integer seed for a DETERMINISTIC stroke composition (`ribbon-lines.js`
   * `generate(seed)`): the same seed always yields the same set of strokes. Ignored
   * when {@link variant} is set.
   */
  seed?: number;
}

/** Controller handle returned by {@link createRibbon}. All methods are safe to call. */
export interface RibbonController {
  /** Tear down the scene + all observers/listeners. Idempotent. */
  destroy(): void;
  /** Pause the RAF loop (host-driven). */
  pause(): void;
  /** Resume after {@link RibbonController.pause}. */
  resume(): void;
  /** Re-read tokens and push them into the live scene. */
  retheme(): void;
  /** The canvas the controller is bound to (null on the inert/non-webgl path). */
  readonly el: HTMLCanvasElement | null;
  /** The tier actually in effect. */
  readonly tier: RibbonTier;
}

/**
 * Mount the Ribbon engine on a canvas. On non-webgl tiers returns an inert
 * controller (no GL work); the static SVG floor remains the visual.
 */
export function createRibbon(
  canvas: HTMLCanvasElement,
  opts?: RibbonOptions,
): RibbonController;

export default createRibbon;
