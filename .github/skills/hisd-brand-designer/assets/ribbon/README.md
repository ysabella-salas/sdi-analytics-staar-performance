# HISD Ribbon — canonical assets

The Ribbon is HISD's signature graphic device — an abstract evocation of Houston's bayou
system and the idea of connection across the city's communities. The **canonical** Ribbon
is **not a gradient band**. It is a **solid brand-color field** overlaid with a few **soft,
white, round-capped, low-opacity sweeping/looping strokes** that drift across it like bayou
currents (tone-on-tone: white at low opacity over a colored field reads as gently lighter
arcs). It is used **full-bleed as a background** behind content. See the authoritative spec
in `Docs/Design-System/Iconography-And-Imagery.md` ("The Ribbon").

## `ribbon-field.svg` — CANONICAL device (field + currents)

A solid `<rect>` field overlaid with the two stroke sub-layers (A/B) of soft white
"current" strokes. This is the real device used full-bleed behind content.

```
viewBox: 0 0 1920 1080  (16:9, full-bleed)
field:   <rect> filled var(--ribbon-field-bg, #00A3AF)   — DEFAULT teal; any brand color may override per section
strokes: fill none; stroke var(--ribbon-stroke, #fff); stroke-linecap round
         wrapped in <g opacity="var(--ribbon-stroke-opacity, 0.16)">
         THICK, edge-to-edge currents (per-path stroke-width ~120–210), per-path
         opacity ~0.78–1.0 for tone-on-tone depth (the GROUP opacity carries the
         faintness — per-path stays near-solid so overlaps brighten, not wash out)
         two sub-layers (A/B) for independent parallax drift
```

This file is **generated** — it is `preset('currents')` rasterized to SVG. Do not
hand-edit it; regenerate via `scripts/gen_ribbon_fields.mjs` (see below).

## The line kit — single source of truth for the strokes

The stroke geometry lives entirely in the **locked** line kit
`../../framework/ribbon-gl/ribbon-lines.js` (`+ .d.ts`). It is the one place that knows
how a "bayou current" is shaped: soft, round-capped, low-opacity white strokes that
sweep **between two edges** of the solid field (so the round caps clip off-canvas and
each stroke runs cleanly edge-to-edge). The same kit feeds the WebGL rung (`core.js`),
this asset build, and the demo gallery — one geometry, every surface.

Key exports:

| Export | Purpose |
| ------ | ------- |
| `VIEW` | `{ w: 1920, h: 1080 }` — the full-bleed canvas. |
| `ribbonLine({from,to,bow,bow2?,width,opacity,overshoot?})` | Build ONE edge-to-edge line. `from`/`to` are `[edge, t]` with edge `0` top, `1` right, `2` bottom, `3` left and `t` 0..1 along the edge. |
| `generate(seed=1, opts?)` | **Deterministic** seeded composition — same seed ⇒ same field, everywhere. Defaults: `count [3,5]`, **thick** `widthRange [120,210]`, near-solid per-path `opacityRange [0.78,1.0]`. |
| `PRESETS` | Curated `name → seed` map (stable seeds chosen to read well). |
| `preset(name, opts?)` | `generate(PRESETS[name])` — a named variant. |
| `linesToSVG(lines, {field?,stroke?,groupOpacity?,layered?=true})` | Emit a standalone, themeable SVG; `layered` (default) splits the lines into the `--a`/`--b` drift sub-layers. |

**Variants are now a named PRESET or any integer SEED** — this replaces the old
hardcoded 5-path stroke set and the old 4-variant limit. Want a one-off field nobody
else uses? `generate(1234)`. Want a stable, named one? Add it to `PRESETS` and re-run
the build.

### Named presets (the committed `ribbon-field-<name>.svg` files)

| Preset | Seed | File |
| ------ | ---- | ---- |
| `currents` *(default)* | 7 | `ribbon-field.svg` |
| `delta` | 12 | `ribbon-field-delta.svg` |
| `bayou` | 23 | `ribbon-field-bayou.svg` |
| `crossing` | 4 | `ribbon-field-crossing.svg` |
| `calm` | 31 | `ribbon-field-calm.svg` |
| `weave` | 58 | `ribbon-field-weave.svg` |
| `bend` | 9 | `ribbon-field-bend.svg` |
| `loops` | 17 | `ribbon-field-loops.svg` |
| `drift` | 42 | `ribbon-field-drift.svg` |
| `channels` | 88 | `ribbon-field-channels.svg` |

Pick any of these per section for variety (like the brand templates' variants). The
default `currents` is the one docs/components reference by filename.

### Regenerating the SVGs

```sh
node scripts/gen_ribbon_fields.mjs   # from the skill root
```

`scripts/gen_ribbon_fields.mjs` imports `preset` / `PRESETS` / `linesToSVG` from the
line kit and writes `ribbon-field.svg` (= `preset('currents')`) plus one
`ribbon-field-<name>.svg` per preset. It adds the XML declaration, a
`<title>HISD Ribbon</title>`, `role="img"` + `aria-hidden="true"`, and the
hardcoded-hex fallbacks the themeable vars carry, then prints the file list it wrote.
The geometry is owned by the locked kit; this script only rasterizes and decorates it.

Token-backed, theme-aware:

| Token                     | Light            | Dark             | Role |
| ------------------------- | ---------------- | ---------------- | ---- |
| `--ribbon-field-bg`       | teal-500 `#00A3AF` | teal-500 `#00A3AF` | solid field (overridable per section) |
| `--ribbon-stroke`         | `#FFFFFF`          | `#FFFFFF`          | soft current stroke color |
| `--ribbon-stroke-opacity` | `0.16`             | `0.22`             | group-level multiplier so strokes read on the field |

The SVG references these CSS custom properties (single asset retheme on `data-theme`
switch — no JS asset swap) **and** carries hardcoded canonical-hex fallbacks, so it renders
standalone in print / email / no-CSS contexts.

## Constrained-media ACCENTS

Where a full field-with-strokes is impractical (flat print, HTML email, Power BI report
backgrounds), the Ribbon collapses to a simplified accent. These are reductive stand-ins,
**not** separate brand marks.

### `ribbon.svg` — bayou GRADIENT accent (`--ribbon-gradient`)

A simplified flowing curve filled with the themeable gradient:

```css
--ribbon-gradient: linear-gradient(105deg, var(--ribbon-from) 0%, var(--ribbon-to) 100%);
```

| Stop                 | Light                    | Dark                     |
| -------------------- | ------------------------ | ------------------------ |
| `--ribbon-from`      | teal-500 `#00A3AF`       | teal-700 `#037882`       |
| `--ribbon-to`        | dark-green-600 `#026252` | dark-green-800 `#05463C` |
| `--ribbon-highlight` | yellow-400 `#FBDE83`     | yellow-400 `#FBDE83`     |

### `ribbon-band.svg` — fixed multi-color FAN accent (`--ribbon-fan`)

A thin multi-color "fan" divider band. **Fixed** 4 stops, identical everywhere a fan
appears (teal first, per brand) — never themed, never re-ordered:

```css
--ribbon-fan: linear-gradient(90deg, #00A3AF 0%, #6DB83D 38%, #F9D04E 64%, #474F99 100%);
```

| Stop | Hex       | Position |
| ---- | --------- | -------- |
| teal | `#00A3AF` | 0%   |
| light-green | `#6DB83D` | 38%  |
| yellow | `#F9D04E` | 64%  |
| purple | `#474F99` | 100% |

The hex are the flattened canonical values, so these accents render standalone.

## Usage rules

- **Decorative.** All assets ship `role="img"` + `aria-hidden="true"`. When embedding,
  host with `alt=""` / `role="presentation"` (the Ribbon carries no information).
- **Field is full-bleed.** Use `ribbon-field*.svg` as a background layer behind content,
  not as a discrete shape dropped into a layout.
- **Never over-clip the currents.** Keep at least 20% of each stroke's arc visible so the
  sweep stays recognizable.
- **Text over the ribbon.** Where the ribbon fills a background, body text uses
  `--color-text-on-accent` (white); confirm contrast against the field color before use.
- **Motion = slow drift/flow.** The white strokes slowly drift across the field (the two
  sub-layers at slightly different rates), never a band sliding. Must respect
  `prefers-reduced-motion` (drift stops; the Ribbon renders static).
- **Print / email / SVG (no live theming).** Use the matching flattened hex above; the hex
  MUST equal the canonical token values so nothing drifts from the web surfaces.

## Animation

The Ribbon scales along a three-rung progressive ladder: **static SVG** (these assets) →
**CSS-animated** → **WebGL**. The field SVGs are the **static floor** — rung 0, the
correctly-themed field-with-strokes that every higher tier degrades back to.

The higher tiers animate the **drift/flow of the white current strokes** (the two
sub-layers `--a` / `--b` drifting at slightly different rates for parallax), never a band
sliding. The WebGL rung composites a flow-warped white-stroke texture over the solid field:
`createRibbon(canvas, opts)` takes `opts.field` (a CSS color for the field; defaults to the
host element's computed background-color, else `--ribbon-field-bg`), and the shader samples
the rasterized white strokes (the alpha mask) at a flow-warped UV over the field, with
uniforms `uField` / `uStroke` / `uStrokeOpacity`; `opts.intensity` scales the warp
(subtle..organic). Every rung is **reduced-motion** and **forced-colors** safe (drift stops,
Ribbon stays static and unclipped) and honors the 20%-minimum-arc rule.

Do **not** edit the canonical field SVGs to add motion — animation belongs in the CSS/JS
tiers, not the canonical geometry.

## Source of truth

All ribbon tokens are generated by `../../scripts/build_tokens.py` and surface in:
`../hisd.tokens.json` (a `ribbon` group + `theme.light`/`theme.dark` stops),
`../hisd-theme.css` (`--ribbon-*` custom properties), `../hisd-tokens.scss`,
`../hisd-tokens.js` (style-guide preview), and the Power BI themes
(`../hisd-powerbi-theme.json` + `../../platforms/powerbi/hisd-powerbi-theme-dark.json`).
The canonical field tokens are `--ribbon-field-bg` / `--ribbon-stroke` /
`--ribbon-stroke-opacity`; the accent tokens are `--ribbon-from` / `--ribbon-to` /
`--ribbon-highlight` / `--ribbon-gradient` / `--ribbon-fan`. Do not hand-edit the generated
outputs — edit the build script and re-run it.
