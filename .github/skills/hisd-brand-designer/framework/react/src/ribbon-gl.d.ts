/**
 * Type bridge for the zero-dependency raw-WebGL2 Ribbon core.
 *
 * Single source of truth: the engine's own declarations live next to the runtime
 * at `framework/ribbon-gl/core.d.ts`. This module simply re-exports them so the
 * React adapter (`Ribbon.tsx`, `RibbonCanvas.tsx`) and consumers share one set of
 * types with the core — no duplication, no drift. The relative `import()` of
 * `../../ribbon-gl/core.js` is typed directly by that same `core.d.ts`.
 */
export type {
  RibbonTier,
  RibbonTokens,
  RibbonOptions,
  RibbonController,
} from '../../ribbon-gl/core';
