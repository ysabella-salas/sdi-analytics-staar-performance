# HISD Power BI custom-visual starter

A scaffold for building Power BI custom visuals that ship on-brand and accessible by default. Reach for this when the built-in visual library cannot encode what an HISD dashboard needs — a campus map with brand markers, a token-driven KPI tile, a comparison chart that highlights one focal bar.

## What the kit gives you

- **Brand palette pre-wired.** `src/hisd-tokens.ts` re-exports the same categorical sequence, sequential teal ramp, diverging green↔red ramp, and semantic chart roles the on-screen system uses. Series colors are taken from the host palette when the user has applied the HISD theme, and fall back to this baked sequence otherwise — so a visual stays on brand even when a colleague hasn't installed the theme.
- **Accessibility object honored.** A skeleton `update()` reads Power BI's `host.colorPalette`, `host.hostCapabilities.allowInteractions`, and the `IVisualHost` `colorPalette.isHighContrast` flag. Under high-contrast, palette colors fall back to system colors (`Highlight`, `CanvasText`, `GrayText`) following the same forced-colors contract every HISD component ships. `prefers-reduced-motion` honoured.
- **Bilingual data-table fallback.** Every visual built on the kit ships an offscreen `<table>` with the same data; the renderer-backed fail-open posture in [Cross Media](../../../../Docs/Design-System/Cross-Media.md) applies — a failed SVG render leaves the table reachable, never a blocked report. Headers and ARIA live-region text are externalized through a small string table (`src/i18n/{en,es}.json`) for English and Spanish.
- **Four story recipes** pre-stubbed: `kpi.ts`, `trend.ts`, `comparison-highlight.ts`, and `map-marker.ts`. Each is a thin TypeScript class that implements `update()` from the four design-system story recipes in [Data Visualization](../../../../Docs/Design-System/Data-Visualization.md).

## The brand contract any custom visual must satisfy

If you do not build on this scaffold, the visual must still meet:

1. **Color from the theme, never hand-picked.** Read the categorical sequence from `host.colorPalette.getColor()` so the user's applied theme drives colour; do not hard-code hex outside the palette object.
2. **No reliance on colour alone.** Every series carries a redundant cue (pattern fill, marker shape, direct label) — the same rule as on-screen charts.
3. **Keyboard operable.** All interactive elements (selectable bars, filterable legend, drill-down trigger) sit in the document tab order and render a visible focus ring with adequate contrast against the visual's surface.
4. **Data table fallback.** A keyboard-reachable equivalent `<table>` rendered alongside (or via a "View as table" control). Headers must associate columns; meaningful sorts must be reflected in the DOM order.
5. **High contrast.** Under `forced-colors: active` (Windows High Contrast), the visual must remain interpretable — system colors, system-color borders, no reliance on background fills.
6. **Reduced motion.** Entrance animations, transitions, and idle decoration honour `prefers-reduced-motion: reduce`. Opacity crossfades may persist at `--duration-crossfade` (≤ 120 ms under reduce); spatial movement must zero.
7. **Bilingual surface.** UI strings (legend titles, "View as table", "No data") ship in EN and ES; runtime announcements use `aria-live="polite"` with both translations.
8. **Fail open.** If the rendering surface (SVG, canvas, WebGL) is unreachable, the data table stays visible. A capability gate is *not* an error path.

## Getting started

```sh
# Install the Power BI Visuals Tools (one-time)
npm install -g powerbi-visuals-tools

# Create a new visual from the starter
cp -R .skills/design/hisd-brand-designer/platforms/powerbi/custom-visual-starter ./my-hisd-visual
cd my-hisd-visual
npm install
pbiviz start    # live-preview in Power BI Desktop / Service
pbiviz package  # build the .pbiviz for distribution
```

Then pick the story recipe closest to what you need (KPI, trend, comparison highlight, or map marker) and edit its `update()` body. Run `pbiviz package` to produce a signed `.pbiviz` for distribution. Validate with the [Design Review Rubric](../../../../Docs/Design-System/Governance-And-Adoption.md) (`scripts/design_review.py` on the visual's source tree) and the chart-accessibility contract in [Data Visualization](../../../../Docs/Design-System/Data-Visualization.md) before shipping.

## What this kit is not

- Not a published npm package — the starter is a code template you copy and own; updates flow by re-pulling from this skill.
- Not a Power BI theme — that's a separate artifact (`hisd-powerbi-theme.json`) the build emits; both live under `platforms/powerbi/`.
- Not a substitute for a built-in visual when one fits — reach for a custom visual only when the built-ins genuinely cannot encode the story.
