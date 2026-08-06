# HISD Power BI / Fabric — Layout Guide

Patterns for laying out an on-brand HISD report. Every value below maps to a token
in [`../../assets/hisd.tokens.json`](../../assets/hisd.tokens.json) or to a field in the
generated theme [`../../assets/hisd-powerbi-theme.json`](../../assets/hisd-powerbi-theme.json).
**Reference the theme — never duplicate or edit it.** Import it once
(*View → Themes → Browse*) and let it drive color; this guide tells you how to arrange
and size the visuals on top of it.

On-screen, Power BI renders everything in **Segoe UI** (the theme's stand-in for Radio
Canada — Power BI cannot embed the brand fonts). Use the brand fonts only when you export
to PDF/PPT/image. See the README for the full font rule.

---

## Page setup

- **Canvas size:** 1280 × 720 (16:9). *Format pane → Canvas settings → Type: 16:9.*
- **Page background:** *Format → Canvas background → Image → Browse* one of
  [`page-backgrounds/`](page-backgrounds/), **Image fit: Fit**, **Transparency: 0%**.
  - `title-page.svg` for the landing/cover page.
  - `content-page.svg` for every data page.
- **Visuals safe-area** (keep visuals inside this so they never collide with the brand
  furniture):
  - Title page: `x 80 → 1200`, `y 300 → 656`.
  - Content page: `x 32 → 1248`, `y 96 → 660` (below the 72 px header band, above the footer ribbon).
- **Grid / gutters:** 12-column thinking; **16 px** gutter between visuals
  (`space.4` = 1rem), **32 px** outer margin (`space.8`) on content pages.

---

## Header / title pattern

The page-background art already carries the teal band + logo + ribbon. On top of it you
add **live** Power BI text/visuals for the title (so it can be data-driven and accessible
to screen readers — baked-in SVG text is not).

| Element | Spec | Token |
| --- | --- | --- |
| Report title (content page) | Text box, top-left of the working canvas, **20 pt semibold**, color `#19282C` | `theme.light.text` / `font.weight.semibold` |
| Report title (title page) | Text box over the teal field, **36–44 pt bold**, color `#FFFFFF` | `theme.light.text-on-accent` |
| Eyebrow / section label | **11 pt**, all-caps, letter-spaced, color `#4B5C5F` | `neutral.600` / `font.size.2xs` |
| Page subtitle / "as of" date | **11 pt**, color `#6E7C7E` | `neutral.500` |
| Title underline accent (optional) | 3 px rule under the title, **teal `#00A3AF`** or yellow `#F9D04E` | `brand.teal` / `brand.yellow` |

Rules:
- Title text never overlaps the logo's clearspace (≥ the cap-height of the "H").
- One report title per page; left-aligned; sentence case or title case, consistent across pages.
- Do **not** retype "HISD" as text — the logo in the band is the identity.

---

## KPI card layout

Use a **Card** (or multi-row card / the new card visual) on a white surface tile.

| Property | Value | Token |
| --- | --- | --- |
| Tile fill | `#FFFFFF` | `theme.light.surface` |
| Tile border | 1 px `#DCDFE0` | `theme.light.border` / `neutral.200` |
| Corner radius | 8 px (rounded) | `radius.md` |
| Inner padding | 16 px | `space.4` |
| Callout value | 28–32 pt bold, `#19282C` | `neutral.900` / `font.weight.bold` |
| Category label | 11 pt, `#4B5C5F` | `neutral.600` |
| Accent rule (left edge or top) | 4 px **teal `#00A3AF`** | `brand.teal` |
| Positive delta | `#026252` ▲ | `good` (theme) / `dark-green.600` |
| Negative delta | `#BC5859` ▼ | `bad` (theme) / `red.600` |

- **Sizing:** a row of KPI cards is typically **4 across** on a content page —
  each ≈ 280 × 120 px with the 16 px gutter.
- **Never encode the delta by color alone** — pair the color with the ▲/▼ glyph and a
  signed number (e.g. "+4.2%"). See Accessibility in the README.
- Lead the row with the most important KPI; keep the teal accent consistent so the cards
  read as a set.

---

## Slicer styling

| Property | Value | Token |
| --- | --- | --- |
| Slicer header text | 11 pt semibold, `#19282C` | `neutral.900` |
| Slicer background | `#FFFFFF` or transparent on the content field | `theme.light.surface` |
| Border | 1 px `#DCDFE0`, radius 8 px | `neutral.200` / `radius.md` |
| **Selected** item | fill **yellow `#F9D04E`**, text `#19282C` | `selected` (theme) — 10.25:1, AA |
| Unselected item text | `#4B5C5F` | `neutral.600` |
| Hover | fill `#EDEFEF` | `surface-sunken` / `neutral.100` |
| Focus outline (keyboard) | 2 px `#037882` | `focus` (theme) / `teal.700` |

- Prefer the yellow **selected** state from the theme — it is the brand's selection color
  and clears AA against ink (`#19282C` on `#F9D04E` = 10.25:1).
- Use a **horizontal** slicer or dropdown to keep the header band area clean; place slicers
  in a left rail (≈ 200 px) or a top strip under the title.
- Add a visible "Clear / Reset filters" affordance; show applied filters so state is never color-only.

---

## Table & matrix styling

The theme sets `tableAccent` `#00A3AF`; build the rest with these:

| Part | Value | Token |
| --- | --- | --- |
| Column headers | fill **teal `#00A3AF`**, text `#FFFFFF`, semibold | `brand.teal` / `text-on-accent` (white on teal ≈ 3.0:1 large-text/header — keep header ≥ 14 pt semibold) |
| Header (alt, smaller text) | fill `#037882`, text `#FFFFFF` (5.23:1, AA normal text) | `teal.700` / `action` |
| Body text | `#19282C` on `#FFFFFF` | `neutral.900` / `surface` |
| Row banding (stripe) | `#F0F9FA` | `teal.50` / theme `minimum` |
| Alt banding (neutral) | `#F6F7F7` | `neutral.50` / `bg` |
| Gridlines | `#DCDFE0` | `neutral.200` / `border` |
| Totals row | fill `#EDEFEF`, text `#19282C` bold | `surface-sunken` / `neutral.100` |
| Conditional max (data bar / heat) | `#00A3AF` | theme `maximum` |
| Conditional min | `#F0F9FA` | theme `minimum` |

Rules:
- For small header type, use the deeper **`#037882`** teal so white header text clears
  4.5:1; reserve the bright `#00A3AF` header for ≥ 14 pt semibold (large-text threshold).
- Keep row padding ≥ 6 px; right-align numbers; use the brand thousands/decimal formatting.
- Heat/data-bar gradients go **`minimum #F0F9FA` → `maximum #00A3AF`** — the same teal ramp
  as the tokens, so tables match charts.

---

## Chart defaults

- **Series order = the categorical order:** teal `#00A3AF` → purple `#474F99` →
  yellow `#F9D04E` → dark-green `#026252` → blue `#4975BD` → red `#D96364` →
  light-green `#5FA138`. This is `theme.dataColors` and `dataviz.categorical` — do not reorder per visual.
- **Lead with teal** for the primary series/measure on every chart.
- Axis & gridline color `#DCDFE0` (`border`); axis text `#4B5C5F` (`neutral.600`).
- Data labels `#19282C`; turn them **on** for the key series so meaning never depends on color.
- Single-measure charts: use teal `#00A3AF`, not the full categorical ramp.
- Good/neutral/bad semantics (gauges, KPI status, conditional formatting):
  good `#026252`, neutral `#F9D04E`, bad `#BC5859` — and always add a label or icon.

---

## Spacing, radius & elevation (quick reference)

| Use | Value | Token |
| --- | --- | --- |
| Visual gutter | 16 px | `space.4` |
| Outer page margin | 32 px | `space.8` |
| Tile inner padding | 16 px | `space.4` |
| Tile corner radius | 8 px | `radius.md` |
| Tight radius (chips, slicer items) | 4 px | `radius.sm` |
| Tile shadow (subtle) | `0 2px 4px rgba(11,21,24,.08)` | `elevation.light.2` |

Keep elevation light — HISD reports favor flat surfaces with the teal accent doing the work,
not heavy drop shadows.
