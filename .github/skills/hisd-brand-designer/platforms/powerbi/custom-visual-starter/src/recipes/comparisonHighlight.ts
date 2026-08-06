// Comparison-highlight recipe — bar chart with one focal category.
//
// Horizontal bars when labels are long (campus names), vertical columns when
// the axis is ordinal. Sort by metric unless the alphabetical order IS the
// story. The focal category renders in teal; the rest in --color-neutral so
// the eye lands without a legend. Cap at 7 categories before switching to a
// sorted table.

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

export function renderComparisonHighlight(ctx: RecipeContext, dataViews: DataView[] | undefined): void {
  ctx.root.replaceChildren();
  void dataViews;
  // Implementers fill in: <svg> with category axis + bars. Focal index is
  // either user-configured (a property pane field) or auto-picked (the
  // largest/smallest/extreme). Direct value label at the end of the focal bar;
  // all others get a muted value label. Under isHighContrast, focal bar uses
  // Highlight and rest use GrayText; under reducedMotion, no bar grow-in.
}
