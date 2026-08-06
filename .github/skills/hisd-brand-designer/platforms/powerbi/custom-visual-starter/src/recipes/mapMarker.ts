// Map-marker recipe — point map with HISD brand markers.
//
// Use Power BI's Map visual rather than rendering tiles inside the canvas
// (a custom visual cannot ship its own tile layer reliably without violating
// review). The recipe's job is to format the metadata column-set so the
// host map carries HISD-styled markers (teal fill, white border, accessible
// label). For interactive boundary explorers, use the on-screen .hisd-map
// shell instead — Maps-And-Geospatial.md covers that contract.

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

export function renderMapMarker(ctx: RecipeContext, dataViews: DataView[] | undefined): void {
  ctx.root.replaceChildren();
  void dataViews;
  // Implementers fill in: project marker metadata (location, category, label)
  // into Power BI map roles; ensure category is paired with marker SHAPE
  // (zoned / magnet / charter), not just colour. Under isHighContrast, force
  // marker outline to CanvasText and fill to Canvas; selection ring Highlight.
}
