// Trend recipe — change over time.
//
// Time on the x-axis, metric on the y-axis. Primary series in teal, secondary
// series step through the categorical sequence. Direct-label the end of each
// line; do not render a colored legend if a direct label fits. Annotations
// (policy changes, calendar events) ride as vertical rules + a one-line label.
// Reference lines (district target, prior-year level) use --color-neutral.
//
// Under isHighContrast, swap series colour for CanvasText and use a dash
// pattern per series for separation; under reducedMotion, do not animate the
// line draw-in.

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

export interface RecipeContext {
  host: IVisualHost;
  root: HTMLElement;
  colors: readonly string[];
  isHighContrast: boolean;
  reducedMotion: boolean;
}

export function renderTrend(ctx: RecipeContext, dataViews: DataView[] | undefined): void {
  ctx.root.replaceChildren();
  void dataViews;
  // Implementers fill in: <svg> with x/y axes (labeled, with units), <path>
  // per series, direct labels at the end of each line, optional annotation
  // <line>+<text> pairs. Under reducedMotion, omit the stroke-dasharray
  // entrance; under isHighContrast, draw with CanvasText and dash patterns.
}
