// KPI recipe — single status number + delta + sparkline.
//
// Visual sequence: big number, delta with sign and icon, sparkline (6-12 pts).
// The big number paints --color-text (not --color-action). The delta carries
// BOTH an icon (▲ / ▼) AND a sign — colour is reinforcement only. The
// sparkline is a 1-2px teal line (HISD_PALETTE.categorical[0]) without axis or
// markers. Under reduced-motion, the sparkline does not animate in.

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import { HISD_PALETTE } from "../hisd-tokens";

export interface RecipeContext {
  host: IVisualHost;
  root: HTMLElement;
  colors: readonly string[];
  isHighContrast: boolean;
  reducedMotion: boolean;
}

export function renderKpi(ctx: RecipeContext, dataViews: DataView[] | undefined): void {
  ctx.root.replaceChildren();
  const dv = dataViews?.[0];
  if (!dv?.single?.value && !dv?.categorical?.values?.length) return;

  // Implementers fill in the SVG: a <text> for the big number, a <g> for the
  // delta (icon glyph + sign + value), and a sparkline <path>. Under
  // isHighContrast, use HISD_PALETTE.systemColors instead of categorical[0].
  void ctx.colors;
  void HISD_PALETTE;
}
