# HISD Social Card Kit

Brand-correct, ready-to-post share graphics for HISD social channels — plus a
one-command generator that drops your headline and subhead into the right
template and exports a pixel-perfect PNG.

Every template ships the **real HISD brand hex** (from `assets/hisd.tokens.json`),
the signature **ribbon device** (the "bayou" band), the official **white + yellow
logo lockup**, a Parkinsans display headline, and a Radio Canada subhead — all
inside documented safe areas.

```
platforms/social/
├── og.svg                 # 1200x630  — Open Graph / Twitter / LinkedIn link card (light)
├── square.svg             # 1080x1080 — Instagram / Facebook feed post (light)
├── story.svg              # 1080x1920 — Stories / Reels (full-screen vertical, light)
├── og-dark.svg            # 1200x630  — dark-surface variant
├── square-dark.svg        # 1080x1080 — dark-surface variant
├── story-dark.svg         # 1080x1920 — dark-surface variant
├── make_card.py           # generator: fills copy + rasterizes to PNG (--theme light|dark)
├── README.md              # you are here
└── examples/              # one committed render per template + theme (inspect the kit)
    ├── og-example.png            square-example.png            story-example.png
    └── og-dark-example.png       square-dark-example.png       story-dark-example.png
```

The SVGs are self-contained: the logo is an embedded base64 PNG, so a template
renders correctly even when copied out of the repo. (Brand color in
`platforms/` is intentional and is excluded from the brand-color scanner.)

### Light vs. dark

Each template ships in two themes. The **light** templates use the signature teal
field with white headline + yellow subhead. The **dark** templates (`*-dark.svg`,
selected by `--theme dark`) use a **dark surface field** (`#19282C → #121F22`) with a
**brightened teal** accent (`#4CBFC7` / `#8CD6DB`), a **light** headline (`#F6F7F7`),
and the yellow subhead — the `[data-theme="dark"]` semantics from
`assets/hisd-theme.css`. Both keep the same **white + yellow** logo and the brand
ribbon. Use dark for dark-mode feeds, night-time campaigns, or a dark-on-light
contrast moment; use light as the default.

## How to use — generate a card

```sh
# Open Graph / link preview
python3 make_card.py --template og \
  --title "Houston ISD Welcomes Students Back" \
  --subtitle "First day is August 11 — find your campus" \
  --out og-card.png

# Instagram / Facebook feed
python3 make_card.py --template square \
  --title "Now Enrolling for 2026-27" \
  --subtitle "Apply to a Magnet or School Choice program today"

# Stories / Reels
python3 make_card.py --template story \
  --title "Family Engagement Night" \
  --subtitle "Thursday at 6 PM — all families welcome"

# Dark-surface variant (any template)
python3 make_card.py --template og --theme dark \
  --title "School Closed Monday" \
  --subtitle "In observance of the holiday"
```

- `--template` is required: `og`, `square`, or `story`.
- `--title` is required. `--subtitle` is optional.
- `--theme` is optional: `light` (default) or `dark` — selects the light or
  `*-dark.svg` template.
- `--out` is optional; it defaults to `hisd-<template>.png` (light) or
  `hisd-<template>-dark.png` (dark) in the current directory.

The script:

1. **Escapes XML** in your copy (`& < > " '`), so ampersands and quotes are safe.
2. **Wraps the headline** across lines to fit the safe area. Copy that still
   overflows the line budget is truncated with an ellipsis (…) rather than
   spilling out of frame.
3. **Rasterizes** the filled SVG to a PNG at the exact platform pixel size.

Stdlib only — no `pip install` required.

### Rasterizer fallback chain

Rasterization is handled by the shared cross-platform helper
(`../../scripts/_raster.py`) — it works on **Windows, macOS, and Linux** and tries,
in order, the first available renderer that emits exact pixel dimensions:

1. `rsvg-convert` (librsvg)
2. `cairosvg` (Python module)
3. `inkscape`
4. `magick` / `convert` (ImageMagick)
5. a **headless browser** — **Microsoft Edge** (ships with every Windows 10/11),
   or Chrome/Chromium on macOS+Linux. This is the universal fallback: it needs no
   install and renders at the correct aspect ratio (no distortion).
6. `qlmanage` + `sips` (macOS QuickLook, last resort)

So it runs out of the box on a stock Windows or Mac. Pin a specific renderer with
the `HISD_RASTERIZER` env var (`rsvg`, `cairosvg`, `inkscape`, `magick`, `browser`,
`qlmanage`).

## Per-platform dimensions

| Template | File         | Pixels      | Aspect | Where it's used                              |
|----------|--------------|-------------|--------|----------------------------------------------|
| `og`     | `og.svg`     | 1200 × 630  | 1.91:1 | Open Graph link previews, Twitter/X summary-large-image, LinkedIn shares |
| `square` | `square.svg` | 1080 × 1080 | 1:1    | Instagram feed, Facebook feed                |
| `story`  | `story.svg`  | 1080 × 1920 | 9:16   | Instagram / Facebook Stories, Reels, TikTok, YouTube Shorts |

All three are sized so a single asset downscales cleanly to each network's
delivered resolution.

## Safe areas

Every template draws everything important inside a margin and marks the
content-safe rectangle with an invisible guide `<rect>` (search the SVG for
`SAFE-AREA`). Networks crop and overlay UI differently, so keep the logo and all
text inside these zones.

| Template | Content-safe box (x, y → w × h) | Reserved zones |
|----------|----------------------------------|----------------|
| `og`     | 64, 56 → 1072 × 518 (64 px margin) | Link cards can crop ~6% per edge; the 64 px margin protects the headline and logo. |
| `square` | 80, 80 → 920 × 920 (80 px margin)  | Feed crop is minimal; the profile grid center-crops to the same square, so nothing is lost. |
| `story`  | 80, 250 → 920 × 1390             | **Top ~250 px** holds the avatar/handle; **bottom ~280 px** holds the caption, CTA, and share controls. Keep text out of both. |

The logo sits in the top-left clearspace (top-center, below the header zone, for
Stories). Clearspace equals the cap-height of the wordmark "H," per
`reference/Logo-And-Assets.md`.

## Text-length guidance

The headline is **Parkinsans** (display) and the subhead is **Radio Canada**
(body). The generator wraps the headline automatically; these budgets are what
fit cleanly before truncation kicks in:

| Template | Headline: comfortable / max | Subhead: comfortable / max |
|----------|------------------------------|-----------------------------|
| `og`     | ≤ 30 chars (1–2 lines) / ~54 chars (3 lines) | ≤ 42 chars (one line)  |
| `square` | ≤ 36 chars (2 lines) / ~72 chars (4 lines)   | ≤ 48 chars (one line)  |
| `story`  | ≤ 32 chars (2 lines) / ~80 chars (5 lines)   | ≤ 38 chars (one line)  |

Guidelines:

- **Lead with the message, not the brand.** The logo already carries HISD; spend
  the headline on the news ("Now Enrolling", "School Closed Monday").
- **One idea per card.** If you need two sentences, the second belongs in the
  post caption, not on the graphic.
- **Title case for headlines, sentence case for subheads** reads best in these
  faces.
- **Keep the subhead to one line.** It is a single `<text>` element and does not
  wrap; long subheads will run toward the edge. Shorten, or move detail to the
  caption.
- The subhead is **yellow on teal**, which clears WCAG AA for large text — keep
  it at the template's size or larger.

## Customizing a template

Open the `.svg` in any editor. The brand hex, ribbon, logo placement, font
sizes, and safe-area guides are all plain markup with comments. The generator
substitutes two tokens:

- `{{TITLE}}` — replaced with positioned `<tspan>` lines for the headline.
- `{{SUBTITLE}}` — replaced with the (escaped) subhead text.

Keep both tokens if you fork a template, and keep colors to the brand palette in
`assets/brand-assets.json` → `palette`.

## What gets committed

The committed examples in `examples/` exist so the kit is inspectable at a
glance — one render per template **per theme** (`*-example.png` for light,
`*-dark-example.png` for dark). Bulk renders you generate are git-ignored (see
`.gitignore`: the default `hisd-<template>[-dark].png` outputs and any top-level
`*.png` are ignored, while `examples/*.png` is force-allowed) — commit a finished
card deliberately if you want it tracked.
