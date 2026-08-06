# HISD Power BI / Microsoft Fabric kit

Brand an HISD report or Fabric dashboard with the "Connected Futures" design system.
This kit gives you the **generated theme**, **page-background templates**, and a
**layout guide** — everything you need short of Power BI Desktop itself.

```
platforms/powerbi/
  README.md                      you are here — apply the theme, fonts, colors, accessibility
  layout-guide.md                KPI cards, slicers, tables/matrix, header pattern → tokens
  hisd-powerbi-theme-dark.json   DARK theme for Power BI dark mode (brightened teal-led)
  build_pbit.py                  EXPERIMENTAL: assembles a documented .pbit skeleton (see §6)
  page-backgrounds/
    title-page.svg               1280x720 cover (light): teal field + white/yellow logo + ribbon
    content-page.svg             1280x720 data page (light): slim teal header + logo + footer ribbon
    title-page-dark.svg          1280x720 cover (dark): dark surface + brightened teal + logo + ribbon
    content-page-dark.svg        1280x720 data page (dark): dark field + brightened teal header + logo
```

The **light** theme and the tokens live one level up and are the **single source of truth** —
reference them, do not copy them here. The **dark** theme ships in this kit (platforms is
exempt from the brand scanner, so its platform-native dark hex lives here):

- Light theme: [`../../assets/hisd-powerbi-theme.json`](../../assets/hisd-powerbi-theme.json)
- Dark theme: [`hisd-powerbi-theme-dark.json`](hisd-powerbi-theme-dark.json)
- Tokens: [`../../assets/hisd.tokens.json`](../../assets/hisd.tokens.json)
- Contrast proof: [`../../assets/contrast-report.md`](../../assets/contrast-report.md)

### Light vs. dark — which to use

| Use | Theme | Page backgrounds |
| --- | --- | --- |
| Reports viewed on a light canvas / printed / published to a light Service | `../../assets/hisd-powerbi-theme.json` | `title-page.svg`, `content-page.svg` |
| **Reports viewed in Power BI dark mode** (Desktop/Service dark canvas, dark dashboards, low-light displays) | `hisd-powerbi-theme-dark.json` | `title-page-dark.svg`, `content-page-dark.svg` |

Pick one pairing per report and apply the theme **and** the matching backgrounds together —
a dark theme on light backgrounds (or vice versa) breaks contrast. The dark theme uses the
`[data-theme="dark"]` semantics from `assets/hisd-theme.css`: dark surface (`#19282C`) and
background (`#121F22`), brightened teal-led `dataColors` and `tableAccent` (`#4CBFC7`),
foreground `#F6F7F7`, and dark good/neutral(amber)/bad (`#99CD77` / `#CA8753` / `#E49292`).
The dark backgrounds keep the **same white+yellow logo** (the correct on-dark lockup) and the
brand ribbon, over a dark surface field with a brightened teal band.

---

## 1. Apply the theme

1. Open your report in **Power BI Desktop**.
2. **View → Themes → Browse for themes**.
3. Select the theme for your target appearance (relative to this kit at
   `.skills/design/hisd-brand-designer/`):
   - **Light:** `../../assets/hisd-powerbi-theme.json`
   - **Dark:** `platforms/powerbi/hisd-powerbi-theme-dark.json`
4. Confirm the swatch row shows **teal-first** (brightened teal for the dark theme).
   Then **clear any legacy theme** (e.g. an old "HISD - Sebastian") and **remove
   per-visual color overrides** so the theme wins everywhere.

The theme sets the data colors, foreground/background, table accent, good/neutral/bad,
hyperlink, and the on-screen font. You apply it once; the
[layout guide](layout-guide.md) tells you how to arrange visuals on top of it. Use the
**dark** theme when the report is viewed in Power BI dark mode, and pair it with the
**dark page backgrounds** below.

---

## 2. Set the page backgrounds

For each report page: **Format pane → Canvas background → Add image → Browse**, pick a file
from [`page-backgrounds/`](page-backgrounds/), then set **Image fit = Fit** and
**Transparency = 0%**. Set **Canvas settings → Type = 16:9** first so the 1280×720 art lines up.

**Light pairing:**

- **`title-page.svg`** — landing/cover page. Full teal field, the **white + yellow** HISD
  logo lockup, and the brand ribbon device. Add your live title text over the teal field.
- **`content-page.svg`** — every data page. Slim teal header band with the logo, a yellow
  keyline, and a footer ribbon, leaving a large clean **visuals safe-area** in the center.

**Dark pairing** (use with `hisd-powerbi-theme-dark.json` when the report is viewed in
Power BI dark mode):

- **`title-page-dark.svg`** — landing/cover page on a **dark surface field** (`#19282C →
  #121F22`) with a **brightened teal** accent band, the same white + yellow logo, and the
  brand ribbon.
- **`content-page-dark.svg`** — data page with a dark surface field, a slim header band on the
  **canonical dark ribbon gradient** (`#037882 → #05463C`), the logo, the yellow keyline, and a dark footer ribbon.

All four use the **real brand hex** (light from the tokens; dark from the
`[data-theme="dark"]` semantics in `assets/hisd-theme.css`) and embed the **official logo**
(white wordmark + yellow icon — the correct on-dark lockup, identical across light and dark).
Keep visuals inside the safe-area documented in the
[layout guide](layout-guide.md#page-setup) so nothing collides with the logo or ribbon.

---

## 3. Fonts — on-screen vs. export

**Power BI cannot embed Radio Canada (or Parkinsans/Lora).** The theme therefore sets
**Segoe UI** as the on-screen stand-in for every visual.

- **In-tool / on-screen / published to the Service:** leave everything on **Segoe UI**
  (the theme already does this). Do not hand-pick Radio Canada per visual — viewers without
  it installed would see a silent fallback.
- **Exports (PDF / PowerPoint / image):** switch titles to **Parkinsans** and body/labels
  to **Radio Canada** for a fully on-brand static asset, *only if* those fonts are installed
  on the exporting machine. The brand fonts ship under
  [`../../assets/fonts/`](../../assets/fonts/). End fallbacks in Arial.

Type roles when you do brand an export: **Parkinsans** for display titles, **Radio Canada**
for UI/body, **Lora** for long-form/editorial notes.

---

## 4. Categorical data-color order

Use this exact series order — it is `dataColors` in the theme and `dataviz.categorical`
in the tokens. **Lead every chart with teal.** Do not reorder per visual.

| # | Color | Hex | Token |
| --- | --- | --- | --- |
| 1 | Teal | `#00A3AF` | `brand.teal` |
| 2 | Purple | `#474F99` | `brand.purple` |
| 3 | Yellow | `#F9D04E` | `brand.yellow` |
| 4 | Dark green | `#026252` | `dark-green.600` |
| 5 | Blue | `#4975BD` | `brand.blue` |
| 6 | Red | `#D96364` | `brand.red` |
| 7 | Light green | `#5FA138` | `light-green.600` |

- Single-measure visual → just teal `#00A3AF`.
- Sequential / heat / data bars → ramp **`#F0F9FA` (minimum) → `#00A3AF` (maximum)**
  (theme `minimum`/`maximum`), so tables and charts share one teal scale.

**Dark theme** keeps the same teal-first intent with **brightened** hues that read on a dark
surface (`dataColors` in `hisd-powerbi-theme-dark.json`): teal `#4CBFC7`, purple `#ACB0D1`,
dark-green `#4C9A8C`, blue `#809ED1`, red `#E49292`, light-green `#99CD77`, neutral `#969FA1`.
Its teal ramp runs **`#093439` (minimum) → `#4CBFC7` (maximum)**.

---

## 5. Accessibility

WCAG 2.2 AA is the floor. The theme's semantic pairings are pre-verified in
[`../../assets/contrast-report.md`](../../assets/contrast-report.md).

- **Never encode by color alone (SC 1.4.1).** Color is redundant, never the only signal:
  add **data labels**, **markers/line styles**, **direction glyphs** (▲▼), icons, or text.
  A red bar and a green bar must also differ by label.
- **Good / neutral / bad** semantics come from the theme:
  - **good** `#026252` — positive / on-target (7.31:1 on white).
  - **neutral** `#F9D04E` — caution / watch. Yellow is an **ink-only** color on light: do
    **not** put white or yellow *text* on it, and do not use raw yellow as a small status
    dot without a label. Pair it with ink `#19282C` (10.25:1) or use the darker
    `warning-strong` `#8C7A35` for a yellow rail/icon that must clear 4.5:1.
  - **bad** `#BC5859` — negative / off-target (4.49:1 on white — clears AA for normal text;
    use the theme's `danger` `#9B4C4D` for the smallest text).
- **Text contrast:** body ink `#19282C` on white = 15.2:1; muted `#4B5C5F` = 7.01:1. For
  **white text on teal**, use the deeper **`#037882`** (5.23:1) for normal-size text;
  reserve bright `#00A3AF` behind white text for **large/header type only** (`#FFFFFF` on
  `#00A3AF` = 3.06:1 — meets the 3:1 large-text/non-text bar, not the 4.5:1 normal bar).
- **Don't rely on the page background for contrast.** Backgrounds rasterize behind visuals;
  put readable fills/borders on the visuals themselves.
- Add **alt text** to every visual (Format → General → Alt text); keep tab order logical;
  for family-facing reports, plan a **Spanish** version (large Spanish-speaking audience).
- **Dark theme** semantics are pre-brightened for a dark surface (`#19282C`): body text
  `#F6F7F7`, muted `#C2C7C8`; good `#99CD77`, neutral(amber) `#CA8753`, bad `#E49292`; links
  `#8CD6DB`. Same SC 1.4.1 rule applies — never encode by color alone.

---

## 6. Building the binary `.pbit`

**A true, openable `.pbit` must be exported from Power BI Desktop (Windows):**
**File → Export → Power BI template.** Power BI writes a precise OPC/zip package
(DataModelSchema, DataMashup, Metadata, Settings, SecurityBindings, Report/Layout,
`[Content_Types].xml`) whose exact byte layout and internal cross-references **cannot be
produced reliably headlessly** — recent Desktop builds refuse to open a package they did not
write. So this kit does not claim to ship a double-click template; it ships the **theme +
backgrounds + layout guide** so an author produces a real `.pbit` in minutes:

1. New report in Power BI Desktop.
2. Apply the theme — **light** `../../assets/hisd-powerbi-theme.json` or **dark**
   `hisd-powerbi-theme-dark.json` (§1).
3. Set each page's Canvas background to the matching SVG from `page-backgrounds/` (§2).
4. Lay out a title page + a content page per the [layout guide](layout-guide.md).
5. **File → Export → Power BI template** → save your `.pbit`.

### Experimental skeleton — `build_pbit.py` (optional, not a guaranteed binary)

`build_pbit.py` assembles a **documented, clearly-labeled experimental** `.pbit` *skeleton* —
a zip of the required parts plus a `READ_ME_FIRST.txt` and the HISD brand parts bundled under
`hisd-parts/`. **It is explicitly NOT a guaranteed-valid binary `.pbit`** and may not open in
Desktop; treat it as a parts bundle / reference, not a template. The reliable path is the
manual export above.

```bash
# Assemble the experimental skeleton, then ALWAYS verify the package contents:
python3 build_pbit.py --out hisd-template-experimental.pbit
unzip -l hisd-template-experimental.pbit     # inspect the parts
unzip -t hisd-template-experimental.pbit     # integrity-test the zip
```

The kit ships the **generator**, not a committed binary — generated `.pbit` files are not
tracked. Run it locally only if you want the parts bundled into one inspectable archive.

---

## Self-test

```bash
# every page-background SVG (light + dark) is well-formed XML
for f in page-backgrounds/*.svg; do
  python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" "$f" \
    && echo "OK  $f" || echo "FAIL $f"
done

# the light theme parses as JSON (reference only — do not edit it)
python3 -c "import json; json.load(open('../../assets/hisd-powerbi-theme.json')); print('OK  light theme json')"

# the dark theme parses as JSON
python3 -c "import json; json.load(open('hisd-powerbi-theme-dark.json')); print('OK  dark theme json')"

# the experimental .pbit skeleton assembles and is a valid zip (writes to a temp path)
python3 build_pbit.py --out /tmp/hisd-template-experimental.pbit && \
  unzip -l /tmp/hisd-template-experimental.pbit
```

See the [layout guide](layout-guide.md) for KPI cards, slicers, table/matrix styling, and
the header/title pattern — each mapped to a brand token.
