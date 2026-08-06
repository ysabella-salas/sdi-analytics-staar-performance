'use client';

import * as React from 'react';
import { useReducedMotion } from './useReducedMotion';
import type { RibbonController, RibbonTier } from './ribbon-gl';

/**
 * RibbonCanvas — the client-only WebGL overlay for the animated HISD Ribbon.
 *
 * This is the ONLY `'use client'` file in the Ribbon adapter. It renders a single
 * decorative `<canvas>` absolutely positioned over its parent (`<Ribbon>`'s host
 * span) and, on a capable client, mounts the zero-dependency WebGL2 core on top of
 * the always-present static SVG floor.
 *
 * Contract with the core (`framework/ribbon-gl/core.js`):
 *   - The canvas OVERLAYS the static SVG; the SVG is the permanent fallback and is
 *     never removed by us. The core fades the canvas in only after its first frame.
 *   - The core owns capability detection, RAF, observers, mask raster, theme
 *     watching, and context-loss demotion. We only hand it a canvas + options and
 *     call `destroy()` on unmount.
 *
 * Guards:
 *   - SSR: the effect never runs on the server (`useEffect` is client-only), and we
 *     bail early if `window` is undefined.
 *   - Reduced motion: if the user prefers reduced motion we do NOT mount the core at
 *     all — the CSS/SVG floor already handles the subtle (or no) motion tier.
 *   - React 18 StrictMode double-invoke: the effect mounts/destroys twice in dev. A
 *     `disposed` flag ensures the async import resolving after cleanup tears the
 *     controller down immediately instead of leaking a live GL context.
 */
export interface RibbonCanvasProps {
  /** Tier override forwarded to the core. */
  tier?: RibbonTier;
  /** Animation intensity, 0..1. Forwarded to the core. */
  intensity?: number;
  /**
   * Field color (any CSS color) forwarded to `createRibbon({ field })`. The core
   * composites its flow-warped white strokes over this solid field. When omitted,
   * the core reads the host element's computed background-color, else
   * `--ribbon-field-bg`.
   */
  field?: string;
  /**
   * Named line-composition preset from the shared kit, forwarded to the core so
   * the animated tier flows the SAME composition the static SVG floor renders.
   */
  lines?: string;
  /** Line composition by raw integer seed; forwarded to the core. */
  seed?: number;
}

export function RibbonCanvas(props: RibbonCanvasProps): React.ReactElement {
  const { tier = 'auto', intensity, field, lines, seed } = props;
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    // SSR / reduced-motion gate. When reduced motion is on we leave the static SVG
    // floor untouched and never create a GL context.
    if (typeof window === 'undefined' || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // StrictMode / fast-unmount guard: the dynamic import is async, so the effect
    // may already be cleaned up by the time it resolves.
    let disposed = false;
    let controller: RibbonController | null = null;

    // The core is a sibling ESM module typed by its co-located `core.d.ts`, so the
    // relative specifier resolves with precise types (no implicit any) while the
    // bundler still loads the real `.js` at runtime and can code-split it.
    const corePromise = import('../../ribbon-gl/core.js');
    corePromise
      .then(({ createRibbon }) => {
        if (disposed) return;
        // Line-composition selectors are forwarded to the core so the animated
        // tier flows the SAME preset/seed the static SVG floor renders. They are
        // not yet part of the core's typed `RibbonOptions`, so they ride along in
        // a separate bag spread into the options (forward-compatible, no-op until
        // the core consumes them).
        const lineOpts: Record<string, unknown> = {};
        if (lines != null) lineOpts.variant = lines;
        if (seed != null) lineOpts.seed = seed;
        const ctrl = createRibbon(canvas, {
          tier,
          themeAttr: 'data-theme',
          ...(intensity != null ? { intensity } : {}),
          // Forwarded via spread so the frozen `opts.field` reaches the core. The
          // core composites its strokes over this solid field; when omitted it
          // reads the host's computed background (set by the `field` prop / the
          // --ribbon-field-bg var) so the static and animated fields always match.
          ...(field != null ? { field } : {}),
          ...lineOpts,
        });
        // If we were torn down between the import resolving and createRibbon
        // returning, destroy immediately; otherwise keep the handle for cleanup.
        if (disposed) {
          ctrl.destroy();
        } else {
          controller = ctrl;
        }
      })
      .catch(() => {
        // Import or init failed — the static SVG floor remains as the fallback.
      });

    return () => {
      disposed = true;
      if (controller) {
        controller.destroy();
        controller = null;
      }
    };
  }, [tier, intensity, field, lines, seed, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="hisd-ribbon__canvas"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // The core controls opacity (fades in after first frame). Pointer events
        // off so the decorative overlay never intercepts interaction.
        pointerEvents: 'none',
      }}
    />
  );
}

export default RibbonCanvas;
