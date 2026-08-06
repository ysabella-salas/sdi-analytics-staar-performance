// HISD Power BI custom visual — entry point.
//
// This is a thin skeleton that wires the four cross-cutting brand obligations
// (palette via host, accessibility-object respect, data-table fallback, fail-
// open render) before delegating to a story recipe. Replace `recipe` with one
// of ./recipes/{kpi,trend,comparisonHighlight,mapMarker}.ts to ship a specific
// visual. The data-table fallback and the bilingual aria-live region are
// rendered regardless of which recipe is active, and persist when the SVG
// render fails.

import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { HISD_PALETTE } from "./hisd-tokens";
import { renderKpi } from "./recipes/kpi";
import { renderTrend } from "./recipes/trend";
import { renderComparisonHighlight } from "./recipes/comparisonHighlight";
import { renderMapMarker } from "./recipes/mapMarker";
import { renderTableFallback } from "./table-fallback";
import { strings } from "./i18n";

export type Recipe = "kpi" | "trend" | "comparisonHighlight" | "mapMarker";

export class HISDVisual implements IVisual {
  private host: IVisualHost;
  private root: HTMLElement;
  private svgHost: HTMLElement;
  private tableHost: HTMLElement;
  private liveRegion: HTMLElement;
  // Default; the actual visual selects a recipe via capabilities/properties.
  private recipe: Recipe = "kpi";

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.root = options.element;
    this.root.classList.add("hisd-visual");

    // Skip link + bilingual live region — keyboard users bypass the canvas to
    // reach the structured data, matching the .hisd-map shell's contract.
    const skip = document.createElement("a");
    skip.href = "#hisd-visual-table";
    skip.className = "hisd-visual__skip";
    skip.textContent = strings("skipToTable");
    this.root.appendChild(skip);

    this.svgHost = document.createElement("div");
    this.svgHost.className = "hisd-visual__canvas";
    this.svgHost.setAttribute("aria-hidden", "true");
    this.root.appendChild(this.svgHost);

    this.tableHost = document.createElement("div");
    this.tableHost.className = "hisd-visual__table";
    this.tableHost.id = "hisd-visual-table";
    this.root.appendChild(this.tableHost);

    this.liveRegion = document.createElement("p");
    this.liveRegion.className = "hisd-visual__live";
    this.liveRegion.setAttribute("role", "status");
    this.liveRegion.setAttribute("aria-live", "polite");
    this.root.appendChild(this.liveRegion);
  }

  public update(options: VisualUpdateOptions) {
    const palette = this.host.colorPalette;
    const colors = HISD_PALETTE.categorical.map((c, i) =>
      // Prefer the user-applied theme; fall back to baked HISD if absent.
      (palette.getColor as any) ? palette.getColor(String(i)).value : c,
    );
    const isHighContrast = (palette as any).isHighContrast === true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Render the table FIRST so a failing recipe still leaves a usable visual.
    renderTableFallback(this.tableHost, options.dataViews);

    // Render the chosen recipe. Any throw is caught and the table stays.
    try {
      const ctx = { host: this.host, root: this.svgHost, colors, isHighContrast, reducedMotion };
      switch (this.recipe) {
        case "kpi":                return renderKpi(ctx, options.dataViews);
        case "trend":              return renderTrend(ctx, options.dataViews);
        case "comparisonHighlight":return renderComparisonHighlight(ctx, options.dataViews);
        case "mapMarker":          return renderMapMarker(ctx, options.dataViews);
      }
    } catch (e) {
      this.svgHost.replaceChildren();
      this.liveRegion.textContent =
        strings("renderFailed") + " " + strings("tableStillVisible");
      // eslint-disable-next-line no-console
      console.warn("HISD visual: recipe failed, table fallback active", e);
    }
  }
}
