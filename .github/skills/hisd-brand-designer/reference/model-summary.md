# HISD Design System — Model Summary (bundled)

The condensed specification, bundled inside the skill so it is self-contained in any
repo. The full, authored model lives at `Docs/Design-System/` in the source repo
(Wonder-Forge/HISD_Design); this summary is sufficient to apply the system standalone.

## Brand foundation

- **Concept:** "Connected Futures — an educational network for a global city." Personality: Friendly, Smart, Honest, Confident, Playful, Human, Enthusiastic, Energetic, Curious.
- **Palette (brand):** Teal `#00A3AF` (primary — leads everything), Dark Green `#006F5B`, Light Green `#6DB83D`, Purple `#474F99`, Blue `#4975BD`, Red `#D96364`, Dark Grey `#24383C` (ink/text), Light Grey `#D4D4D5`. **Yellow `#F9D04E` is RESERVED** — only the four guide-approved combos (yellow on dark-grey/purple/dark-green; ink on yellow); never a general UI color. **Off-White `#FFFFED` is deprecated** — use pure white `#FFFFFF` / whitesmoke `#F5F5F5`. Expanded with 4%/10% tint/tone/shade scales (see `assets/palette-reference.md`).
- **Type:** Radio Canada (UI/body, default), Parkinsans (display headlines), Lora (editorial serif). Fallbacks end in Arial / Times New Roman. Skip-a-weight pairing.
- **Logo:** primary lockup, submark, icon (skyline), wordmark, seal. White-wordmark + yellow-icon on dark; clearspace = cap-height of the `H`; min 6 mm print / 20 px digital; the Seal authenticates official documents only.
- **Ribbon:** the signature "bayou" graphic device — a themeable band/accent with two canonical token-backed recipes: the primary `--ribbon-gradient` curve (teal `#00A3AF` → dark-green `#026252`, optional yellow `#FBDE83` highlight) and the secondary `--ribbon-fan` divider (teal/light-green/yellow/purple). Web references the tokens; print/email/SVG use the matching flattened hex. Themeable vector at `assets/ribbon/ribbon.svg`.

## Token system

Three tiers: **reference** (`--hisd-{hue}-{50..950}` scales) → **semantic** (`--color-*`, theme-adaptive) → **component**. Build everything from the semantic layer.

Semantic roles (each defined for light and dark): `bg, surface, surface-raised, surface-sunken, surface-inverse, text, text-muted, text-subtle, text-on-accent, border, border-strong, brand, action, action-hover, on-action, accent, focus, selected, text-on-selected, selected-border, link`, plus the **status cues** — `success`/`danger`/`warning`/`info`/`neutral`, each with `-strong` (AA text), `-surface` (tint), `-border`, and `on-<cue>` variants. Cue mapping: positive=green, negative=red, **warning=amber** (harmonizer), informational=blue, neutral=grey, action=teal.

- **Light:** bg = whitesmoke `#F5F5F5`, surface = pure white, text = neutral-900, brand = teal-500 (identity), action = teal-700 (filled buttons, white text passes AA), focus = teal-700 (use with `outline-offset`), **selected = soft teal** (teal-100 fill, dark-teal `text-on-selected`), **warning = amber** (`#B45309` family), danger = red-700.
- **Dark:** bg = neutral-950, surface = neutral-900, text = neutral-50; the brand teal is **tuned brighter** (brand = teal-300, action = teal-400). Shadows subtler; lean on borders.
- **Theming:** `<html data-theme="light|dark" data-theme-source="system|manual">`; default to the OS preference, allow a manual override (the School Navigator pattern). The brand teal tunes per theme automatically.
- **Verified:** every semantic text pairing meets WCAG 2.2 AA in both themes; `build_tokens.py` fails the build (exit 1) if any required pairing regresses.

Other tokens: type scale `--text-2xs…7xl` (~1.2 ratio, base 1rem); weights 400–800; space (4px base) `--space-1…32`; radius `--radius-sm…pill`; elevation `--shadow-1…4` (dark uses subtler shadow + border); motion `--duration-*` / `--ease-*` (reduced-motion respected). Data-viz categorical order (color-blind-safe, no yellow): teal, purple, dark-green, blue, red, light-green, dark-grey.

## The non-negotiables

1. **Teal leads** (60/30/10); use semantic tokens, not raw hex.
2. **Yellow is reserved** to the four approved combos (never a general UI / warning / selection color); **pure white or whitesmoke only** (never the off-white).
3. **Light and dark are both first-class**; never paste the raw brand teal onto a dark surface.
3. **Type by role** (Radio Canada / Parkinsans / Lora); keep skip-a-weight.
4. **Logo discipline** (white/yellow on dark; clearspace; min size; Seal for official docs only).
5. **Accessibility is the floor** — WCAG 2.2 AA, visible offset focus rings, full keyboard, 24px targets, reduced-motion, multilingual (large Spanish-speaking audience). Color never carries meaning alone.

## Components (token bindings)

Build from semantic tokens: **Button** (action / on-action, pill radius, focus ring); **Input/Select** (surface, border-strong, focus); **Chip** (selected = soft-teal highlight + `text-on-selected`); **Card** (surface, border, shadow-2); **Table** (brand header band, surface-sunken zebra); **Nav/Tabs**, **Modal/Overlay** (shadow-3, `inert` siblings), **Toast** (`role=status`), **Badge** (status tints), **Tooltip**. Each ships its accessibility contract (focus, keyboard, ARIA, target size).

## Cross-media

Web/app → `hisd-theme.css` (+ self-hosted fonts). Report/Power BI → `hisd-powerbi-theme.json` (Segoe UI on-screen; brand fonts for exports). Print → hex from `hisd.tokens.json`, CMYK/Pantone from the brand quick reference, the Ribbon, the templates. Email → inline hex, table layout, text wordmark. Social → Ribbon backgrounds + safe areas. See `reference/Media-Playbooks.md`.
