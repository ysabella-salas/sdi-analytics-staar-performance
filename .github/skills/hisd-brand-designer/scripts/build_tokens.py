#!/usr/bin/env python3
"""HISD design-system token build.

Single source of truth for the HISD brand, expressed as design tokens and
projected to every consumer. Pure Python 3 standard library — no pip, no deps.

Inputs:  the HISD 2025 brand palette + typography (from the Branding Toolkit),
         enhanced into full tonal scales and light/dark semantic themes.
Outputs (written next to this script, in ../assets/):
  hisd.tokens.json        DTCG-style design tokens (primitives + semantics)
  hisd-theme.css          CSS custom properties, light + dark (data-theme + prefers-color-scheme)
  hisd-powerbi-theme.json Power BI / Fabric report theme
  hisd-tokens.scss         Sass variables (convenience export)
  contrast-report.md       WCAG 2.2 contrast audit of the semantic pairings

Run:  python3 build_tokens.py
Exit code 1 if any required semantic pairing regresses below WCAG AA.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets"))
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------------------
# Brand source (HISD 2025 Branding Toolkit) — the values we embrace verbatim.
# ---------------------------------------------------------------------------
BRAND = {
    "teal":        "#00A3AF",  # primary — "first, last, and nearly everything"
    "dark-green":  "#006F5B",
    "light-green": "#6DB83D",
    "yellow":      "#F9D04E",
    "purple":      "#474F99",
    "blue":        "#4975BD",
    "red":         "#D96364",
    "dark-grey":   "#24383C",  # primary text / ink
    "light-grey":  "#D4D4D5",
    "off-white":   "#FFFFED",
}

# Enhancement: a near-black ink with a teal undertone keeps shades cohesive
# instead of muddy pure-black, and a cool near-white for light surfaces.
INK = "#0B1518"
PAPER = "#FFFFFF"        # pure white — the only "white" we use for surfaces
WHITESMOKE = "#F5F5F5"   # the only "off-white" we use for page backgrounds
# Brand rule: the brand's yellowish "Off-White" (#FFFFED) is NEVER used in this
# system — every white is pure white (#FFFFFF) or whitesmoke (#F5F5F5).

# Harmonizer: WARNING needs an amber, but the brand "Sunrise" yellow (#F9D04E) is
# RESERVED for the four approved combinations only (yellow on dark-grey/purple/
# dark-green; ink on yellow) and is forbidden as a general UI color because it
# blends poorly on light surfaces. This amber is a non-brand harmonizer chosen to
# read at AA on white and to sit comfortably beside teal/green/red/blue.
AMBER = "#B45309"

# Official brand codes (HISD 2025 Brand Identity Guidelines, p32-33) for the
# print/reference docs. Pantone + CMYK cannot be computed from hex, so they are
# transcribed from the guide; RGB is derived. Off-White is recorded but unused.
BRAND_META = {
    "teal":        {"pantone": "7467 C", "cmyk": [78, 15, 31, 0],  "role": "primary"},
    "dark-grey":   {"pantone": "7546 C", "cmyk": [82, 61, 58, 53], "role": "primary"},
    "dark-green":  {"pantone": "568 C",  "cmyk": [89, 34, 69, 20], "role": "primary"},
    "light-green": {"pantone": "361 C",  "cmyk": [62, 3, 100, 0],  "role": "primary"},
    "yellow":      {"pantone": "128 C",  "cmyk": [2, 16, 81, 0],   "role": "secondary (reserved)"},
    "purple":      {"pantone": "7670 C", "cmyk": [85, 79, 6, 0],   "role": "secondary"},
    "blue":        {"pantone": "4150 C", "cmyk": [75, 53, 0, 0],   "role": "secondary"},
    "red":         {"pantone": "2031 C", "cmyk": [11, 75, 55, 1],  "role": "secondary"},
    "light-grey":  {"pantone": "427 C",  "cmyk": [0, 0, 0, 16],    "role": "secondary"},
    "off-white":   {"pantone": None,     "cmyk": [0, 0, 7, 0],     "role": "deprecated (use #FFFFFF / #F5F5F5)"},
}

# ---------------------------------------------------------------------------
# Color math (sRGB, matching CSS `color-mix(in srgb, ...)` used by School Navigator)
# ---------------------------------------------------------------------------
def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))

def xh(rgb):
    return "#" + "".join(f"{max(0,min(255,round(v))):02X}" for v in rgb)

def mix(c1, c2, t):  # t = weight of c2
    a, b = hx(c1), hx(c2)
    return xh(tuple(a[i]*(1-t) + b[i]*t for i in range(3)))

def _lin(v):
    v /= 255.0
    return v/12.92 if v <= 0.03928 else ((v+0.055)/1.055) ** 2.4

def luminance(c):
    r, g, b = hx(c)
    return 0.2126*_lin(r) + 0.7152*_lin(g) + 0.0722*_lin(b)

def contrast(c1, c2):
    l1, l2 = luminance(c1), luminance(c2)
    hi, lo = max(l1, l2), min(l1, l2)
    return round((hi + 0.05) / (lo + 0.05), 2)

def best_on(bg):
    """Pick ink or paper text for a background by best contrast."""
    return INK if contrast(bg, INK) >= contrast(bg, PAPER) else PAPER

# Tonal ramp: anchor the brand hue at 500, mix toward paper (light) / ink (dark).
LIGHT_F = {50: 0.94, 100: 0.86, 200: 0.72, 300: 0.55, 400: 0.30}
DARK_F  = {600: 0.14, 700: 0.30, 800: 0.46, 900: 0.62, 950: 0.78}

def ramp(base):
    out = {}
    for s, f in LIGHT_F.items():
        out[s] = mix(base, PAPER, f)
    out[500] = base
    for s, f in DARK_F.items():
        out[s] = mix(base, INK, f)
    return {k: out[k] for k in sorted(out)}

# Neutrals: a teal-tinted slate ramp derived from the brand Dark Grey, anchored dark.
def neutral_ramp():
    g = BRAND["dark-grey"]
    return {
        50:  mix(g, PAPER, 0.96), 100: mix(g, PAPER, 0.92), 200: mix(g, PAPER, 0.84),
        300: mix(g, PAPER, 0.72), 400: mix(g, PAPER, 0.52), 500: mix(g, PAPER, 0.34),
        600: mix(g, PAPER, 0.18), 700: mix(g, PAPER, 0.06), 800: g,
        900: mix(g, INK, 0.45),   950: mix(g, INK, 0.72),
    }

SCALES = {name: ramp(BRAND[name]) for name in
          ["teal", "dark-green", "light-green", "yellow", "purple", "blue", "red"]}
SCALES["neutral"] = neutral_ramp()
SCALES["amber"] = ramp(AMBER)   # non-brand harmonizer, for the WARNING role only

# ---------------------------------------------------------------------------
# Semantic themes — roles that reference the scales. Light + Dark.
# Per-theme tuning: dark mode brightens/cools the brand teal (like School Navigator).
# ---------------------------------------------------------------------------
def ref(scale, step):
    return SCALES[scale][step]

# Semantic status cues map to the user's terms: positive=success (green),
# negative=danger (red), informational=info (blue), neutral=neutral (grey),
# action=teal. WARNING uses the amber harmonizer (the brand yellow is reserved).
# Each cue ships: <cue> (solid fill/icon), <cue>-strong (AA text on light),
# <cue>-surface (tint background), <cue>-border, and on-<cue> (text on the solid).
LIGHT = {
    "bg":              WHITESMOKE,                 # page background — whitesmoke, never the brand off-white
    "surface":         PAPER,                      # cards/sheets — pure white
    "surface-raised":  PAPER,
    "surface-sunken":  ref("neutral", 100),
    "surface-inverse": ref("neutral", 900),
    # Interactive SURFACE states (rows, list/menu items, ghost & secondary controls):
    # systematic neutral steps, not ad-hoc color-mix. Hover one step off the surface,
    # active one step further. (Brand-tinted "selected" is separate, below.)
    "surface-hover":   ref("neutral", 100),
    "surface-active":  ref("neutral", 200),
    "text":            ref("neutral", 900),
    "text-muted":      ref("neutral", 600),
    "text-subtle":     ref("neutral", 500),
    "text-on-accent":  PAPER,
    "text-inverse":    ref("neutral", 50),
    "border":          ref("neutral", 200),
    "border-strong":   ref("neutral", 300),
    "brand":           ref("teal", 500),           # identity teal (accents, focus)
    "action":          ref("teal", 700),           # filled buttons w/ white text (AA)
    "action-hover":    ref("teal", 800),           # filled-action hover (one step down the ramp)
    "action-active":   ref("teal", 900),           # filled-action pressed (two steps down)
    "on-action":       PAPER,
    "accent":          ref("purple", 500),
    "focus":           ref("teal", 700),           # high-contrast ring, used with outline-offset
    # Selection — DE-YELLOWED: a soft teal highlight (the brand lead) with dark-teal ink.
    "selected":        ref("teal", 100),
    "text-on-selected": ref("teal", 900),
    "selected-border": ref("teal", 500),
    # positive / success
    "success":         ref("dark-green", 600),
    "success-strong":  ref("dark-green", 700),
    "success-surface": ref("dark-green", 50),
    "success-border":  ref("dark-green", 300),
    "on-success":      PAPER,
    # negative / danger
    "danger":          ref("red", 700),
    "danger-strong":   ref("red", 700),
    "danger-surface":  ref("red", 50),
    "danger-border":   ref("red", 300),
    "on-danger":       PAPER,
    # warning (amber harmonizer — the brand "Sunrise" yellow is reserved, never a UI fill)
    "warning":         ref("amber", 600),
    "warning-strong":  ref("amber", 700),
    "warning-surface": ref("amber", 50),
    "warning-border":  ref("amber", 300),
    "on-warning":      PAPER,
    # informational / info
    "info":            ref("blue", 600),
    "info-strong":     ref("blue", 700),
    "info-surface":    ref("blue", 50),
    "info-border":     ref("blue", 300),
    "on-info":         PAPER,
    # neutral
    "neutral":         ref("neutral", 600),
    "neutral-strong":  ref("neutral", 700),
    "neutral-surface": ref("neutral", 100),
    "neutral-border":  ref("neutral", 300),
    "on-neutral":      PAPER,
    "link":            ref("teal", 700),
    # Ribbon — HISD's signature "bayou" device. CANONICAL expression = a solid
    # brand-color FIELD overlaid with soft white round-capped low-opacity sweeping
    # strokes that drift like bayou currents (see ../assets/ribbon/ribbon-field.svg).
    # --ribbon-field-bg is the DEFAULT field (teal-500); any brand color may override
    # it per section. --ribbon-stroke is the soft current color (white); the strokes
    # ride at the group-level --ribbon-stroke-opacity multiplier so they read on the
    # field. Light fields take the lower 0.16; darker fields lift to ~0.22 (see DARK).
    "ribbon-field-bg":       ref("teal", 500),
    "ribbon-stroke":         PAPER,
    "ribbon-stroke-opacity": "0.16",
    # Constrained-media ACCENTS (print / email / Power BI) where a full field-with-
    # strokes is impractical: the simplified bayou gradient + the fixed fan band.
    # Light: teal-500 -> dark-green-600, with an optional yellow-400 peak highlight.
    "ribbon-from":      ref("teal", 500),
    "ribbon-to":        ref("dark-green", 600),
    "ribbon-highlight": ref("yellow", 400),
}
DARK = {
    "bg":              ref("neutral", 950),
    "surface":         ref("neutral", 900),
    "surface-raised":  ref("neutral", 800),
    "surface-sunken":  ref("neutral", 950),
    "surface-inverse": ref("neutral", 100),
    # Interactive surface states (dark): lighten toward the raised step on hover/active.
    "surface-hover":   ref("neutral", 800),
    "surface-active":  ref("neutral", 700),
    "text":            ref("neutral", 50),
    "text-muted":      ref("neutral", 300),
    "text-subtle":     ref("neutral", 400),
    "text-on-accent":  ref("neutral", 950),
    "text-inverse":    ref("neutral", 900),
    "border":          ref("neutral", 700),
    "border-strong":   ref("neutral", 600),
    "brand":           ref("teal", 300),           # tuned brighter teal for dark surfaces
    "action":          ref("teal", 400),
    "action-hover":    ref("teal", 300),           # dark: brighten on hover
    "action-active":   ref("teal", 200),           # dark: brighten further on press
    "on-action":       ref("neutral", 950),
    "accent":          ref("purple", 300),
    "focus":           ref("teal", 300),
    # Selection — dark teal surface, near-white text
    "selected":        ref("teal", 800),
    "text-on-selected": ref("teal", 50),
    "selected-border": ref("teal", 400),
    # positive / success
    "success":         ref("light-green", 400),
    "success-strong":  ref("light-green", 300),
    "success-surface": ref("dark-green", 900),
    "success-border":  ref("dark-green", 600),
    "on-success":      ref("neutral", 950),
    # negative / danger
    "danger":          ref("red", 400),
    "danger-strong":   ref("red", 300),
    "danger-surface":  ref("red", 900),
    "danger-border":   ref("red", 600),
    "on-danger":       ref("neutral", 950),
    # warning (amber)
    "warning":         ref("amber", 400),
    "warning-strong":  ref("amber", 300),
    "warning-surface": ref("amber", 900),
    "warning-border":  ref("amber", 600),
    "on-warning":      ref("neutral", 950),
    # informational / info
    "info":            ref("blue", 300),
    "info-strong":     ref("blue", 300),
    "info-surface":    ref("blue", 900),
    "info-border":     ref("blue", 600),
    "on-info":         ref("neutral", 950),
    # neutral
    "neutral":         ref("neutral", 400),
    "neutral-strong":  ref("neutral", 300),
    "neutral-surface": ref("neutral", 800),
    "neutral-border":  ref("neutral", 600),
    "on-neutral":      ref("neutral", 950),
    "link":            ref("teal", 300),
    # Ribbon — CANONICAL field expression. The field stays the brand teal (same default
    # as light; any brand color may override per section). The white "current" strokes
    # lift to a higher group opacity so they still read on darker fields / dark surfaces.
    "ribbon-field-bg":       ref("teal", 500),
    "ribbon-stroke":         PAPER,
    "ribbon-stroke-opacity": "0.22",
    # Constrained-media ACCENTS — dark desaturates the simplified bayou gradient so it
    # sits calmly on --color-bg. Dark: teal-700 -> dark-green-800; same yellow-400 peak.
    "ribbon-from":      ref("teal", 700),
    "ribbon-to":        ref("dark-green", 800),
    "ribbon-highlight": ref("yellow", 400),
}

# Data-viz: categorical order chosen for color-blind separation (teal, purple,
# dark-green, blue, red, light-green, dark-grey) — never adjacent confusable hues.
# Yellow is DROPPED from the default order: it blends into light chart backgrounds.
# Use yellow in a chart ONLY on a dark background (an approved combination).
DATAVIZ = [ref("teal",500), ref("purple",500), ref("dark-green",600), ref("blue",500),
           ref("red",500), ref("light-green",600), ref("neutral",700)]

# ---------------------------------------------------------------------------
# Non-color tokens
# ---------------------------------------------------------------------------
TYPE = {
    "family": {
        "sans":    '"Radio Canada", system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        "display": '"Parkinsans", "Parkin Sans", "Radio Canada", system-ui, sans-serif',
        "serif":   '"Lora", Georgia, "Times New Roman", serif',
        "mono":    'ui-monospace, "Cascadia Code", "Segoe UI Mono", Menlo, monospace',
    },
    # Type scale (rem), ~1.2 modular. Display sizes pair with the display family.
    "size": {"2xs":"0.6875","xs":"0.75","sm":"0.875","base":"1","lg":"1.125","xl":"1.25",
             "2xl":"1.5","3xl":"1.875","4xl":"2.25","5xl":"3","6xl":"3.75","7xl":"4.5"},
    "weight": {"regular":"400","medium":"500","semibold":"600","bold":"700","extrabold":"800"},
    "leading": {"none":"1","tight":"1.15","snug":"1.3","normal":"1.5","relaxed":"1.65"},
    "tracking": {"tight":"-0.01em","normal":"0","wide":"0.02em","wider":"0.06em"},
}
SPACE = {"0":"0","px":"1px","0.5":"0.125rem","1":"0.25rem","2":"0.5rem","3":"0.75rem",
         "4":"1rem","5":"1.25rem","6":"1.5rem","8":"2rem","10":"2.5rem","12":"3rem",
         "16":"4rem","20":"5rem","24":"6rem","32":"8rem"}
RADIUS = {"none":"0","sm":"0.25rem","md":"0.5rem","lg":"0.75rem","xl":"1rem",
          "2xl":"1.5rem","pill":"9999px"}
ELEVATION_LIGHT = {
    "0":"none",
    "1":"0 1px 2px rgba(11,21,24,.06), 0 1px 1px rgba(11,21,24,.04)",
    "2":"0 2px 4px rgba(11,21,24,.08), 0 1px 2px rgba(11,21,24,.05)",
    "3":"0 6px 16px rgba(11,21,24,.10), 0 2px 4px rgba(11,21,24,.06)",
    "4":"0 12px 32px rgba(11,21,24,.14), 0 4px 8px rgba(11,21,24,.08)",
}
ELEVATION_DARK = {  # dark mode leans on borders + subtle glow, lighter shadows
    "0":"none",
    "1":"0 1px 2px rgba(0,0,0,.4)",
    "2":"0 2px 6px rgba(0,0,0,.5)",
    "3":"0 8px 20px rgba(0,0,0,.55)",
    "4":"0 16px 40px rgba(0,0,0,.6)",
}
MOTION = {
    # instant..slower is the SPATIAL speed ladder (movement: slide/scale/stagger);
    # crossfade is a distinct OPACITY-only role. The two are tiered under reduced
    # motion: the speed ladder zeroes (movement becomes an instant cut) while
    # crossfade is retained-but-shortened (a fade is not vestibular motion, so a
    # short "content arrived" crossfade stays legible). See Docs/Design-System/Motion.md.
    "duration": {"instant":"75ms","fast":"150ms","base":"200ms","slow":"300ms","slower":"500ms",
                 "crossfade":"200ms"},
    "easing": {"standard":"cubic-bezier(.2,0,0,1)","emphasized":"cubic-bezier(.3,0,0,1)",
               "decelerate":"cubic-bezier(0,0,0,1)","accelerate":"cubic-bezier(.3,0,1,1)"},
}
# ---------------------------------------------------------------------------
# Ribbon — the HISD signature "bayou" graphic device. TWO canonical recipes:
#   1) --ribbon-gradient (PRIMARY): themeable hero/curve/card/print device. Its
#      color stops (--ribbon-from / --ribbon-to / --ribbon-highlight) are emitted
#      per-theme via the LIGHT/DARK semantic dicts above; the composite gradient
#      itself is theme-agnostic and just references those stops.
#   2) --ribbon-fan (SECONDARY): a thin multi-color divider band. FIXED canonical
#      4 stops everywhere — never themed, never re-ordered (teal first, per brand).
# Flattened hex for print/email/SVG (no live theming) MUST equal these values.
RIBBON_FAN_STOPS = [  # (hex, position%) — locked, identical everywhere a fan appears
    (BRAND["teal"],        0),
    (BRAND["light-green"], 38),
    (BRAND["yellow"],      64),
    (BRAND["purple"],      100),
]
RIBBON_GRADIENT_CSS = ("linear-gradient(105deg, var(--ribbon-from) 0%, "
                       "var(--ribbon-to) 100%)")
RIBBON_FAN_CSS = "linear-gradient(90deg, " + ", ".join(
    f"{h} {p}%" for h, p in RIBBON_FAN_STOPS) + ")"
# Flattened (theme-agnostic, light-theme) hex for the gradient, for the print /
# email / SVG exports and the Power BI sentinel — equals teal-500 -> dark-green-600.
RIBBON_GRADIENT_FLAT = (f"linear-gradient(105deg, {LIGHT['ribbon-from']} 0%, "
                        f"{LIGHT['ribbon-to']} 100%)")

# ---------------------------------------------------------------------------
# Emit: DTCG tokens.json
# ---------------------------------------------------------------------------
def dtcg_color(scale):
    return {str(k): {"$value": v, "$type": "color"} for k, v in scale.items()}

# Most semantic theme entries are colors, but a few are not (e.g. the ribbon stroke
# opacity is a unitless multiplier). Type those by name so the DTCG output stays valid.
_THEME_NUMBER_KEYS = {"ribbon-stroke-opacity"}
def dtcg_theme(theme):
    return {k: {"$value": v, "$type": ("number" if k in _THEME_NUMBER_KEYS else "color")}
            for k, v in theme.items()}

tokens = {
    "$description": "HISD design tokens — generated from the HISD 2025 brand by build_tokens.py. Do not edit by hand.",
    "color": {name: dtcg_color(scale) for name, scale in SCALES.items()},
    "brand": {k: {"$value": v, "$type": "color"} for k, v in BRAND.items()},
    "theme": {
        "light": dtcg_theme(LIGHT),
        "dark":  dtcg_theme(DARK),
    },
    "dataviz": {"categorical": {str(i): {"$value": c, "$type": "color"} for i, c in enumerate(DATAVIZ)}},
    # Ribbon — the signature "bayou" graphic device. Per-theme stops also live under
    # theme.light/theme.dark (ribbon-from/-to/-highlight); this group records the two
    # canonical composite recipes and the fixed fan stops as the authoritative spec.
    "ribbon": {
        "field-bg":  {"$value": "{theme.light.ribbon-field-bg}",  "$type": "color",
                      "$description": "CANONICAL. Solid brand-color FIELD behind the white current strokes. Default teal-500; any brand color may override per section."},
        "stroke":    {"$value": "{theme.light.ribbon-stroke}",    "$type": "color",
                      "$description": "CANONICAL. The soft white round-capped sweeping 'current' stroke color (#ffffff, both themes)."},
        "stroke-opacity": {"$value": "{theme.light.ribbon-stroke-opacity}", "$type": "number",
                      "$description": "CANONICAL. Group-level opacity multiplier for the current strokes so they read on the field. light 0.16, dark 0.22."},
        "from":      {"$value": "{theme.light.ribbon-from}",      "$type": "color",
                      "$description": "ACCENT (constrained media). Simplified bayou gradient start. light=teal-500, dark=teal-700."},
        "to":        {"$value": "{theme.light.ribbon-to}",        "$type": "color",
                      "$description": "Gradient end. light=dark-green-600, dark=dark-green-800."},
        "highlight": {"$value": "{theme.light.ribbon-highlight}", "$type": "color",
                      "$description": "Optional peak highlight. yellow-400 in both themes."},
        "gradient":  {"$value": RIBBON_GRADIENT_CSS, "$type": "gradient",
                      "$description": "PRIMARY recipe. Themeable bayou curve / hero / card / print. linear-gradient(105deg, from 0%, to 100%)."},
        "gradient-flat": {"$value": RIBBON_GRADIENT_FLAT, "$type": "gradient",
                      "$description": "Flattened light-theme hex of --ribbon-gradient for print/email/SVG (teal-500 -> dark-green-600)."},
        "fan":       {"$value": RIBBON_FAN_CSS, "$type": "gradient",
                      "$description": "SECONDARY recipe. Fixed 4-stop divider band, identical everywhere."},
        "fan-stops": {str(i): {"$value": h, "$type": "color",
                               "$description": f"Fan stop {i} @ {p}%"}
                      for i, (h, p) in enumerate(RIBBON_FAN_STOPS)},
    },
    "font": {"family": {k: {"$value": v, "$type": "fontFamily"} for k, v in TYPE["family"].items()},
             "size": {k: {"$value": v+"rem" if v[-1].isdigit() else v, "$type": "dimension"} for k, v in TYPE["size"].items()},
             "weight": {k: {"$value": v, "$type": "fontWeight"} for k, v in TYPE["weight"].items()},
             "leading": {k: {"$value": v, "$type": "number"} for k, v in TYPE["leading"].items()},
             "tracking": {k: {"$value": v, "$type": "dimension"} for k, v in TYPE["tracking"].items()}},
    "space": {k: {"$value": v, "$type": "dimension"} for k, v in SPACE.items()},
    "radius": {k: {"$value": v, "$type": "dimension"} for k, v in RADIUS.items()},
    "elevation": {"light": {k: {"$value": v, "$type": "shadow"} for k, v in ELEVATION_LIGHT.items()},
                  "dark":  {k: {"$value": v, "$type": "shadow"} for k, v in ELEVATION_DARK.items()}},
    "motion": {"duration": {k: {"$value": v, "$type": "duration"} for k, v in MOTION["duration"].items()},
               "easing": {k: {"$value": v, "$type": "cubicBezier"} for k, v in MOTION["easing"].items()}},
}
with open(os.path.join(OUT, "hisd.tokens.json"), "w") as f:
    json.dump(tokens, f, indent=2)

# ---------------------------------------------------------------------------
# Emit: CSS custom properties (primitives + semantic light/dark)
# ---------------------------------------------------------------------------
def css_block(d, ind="  "):
    return "\n".join(f"{ind}--{k}: {v};" for k, v in d.items())

prim = {}
for name, scale in SCALES.items():
    for step, v in scale.items():
        prim[f"hisd-{name}-{step}"] = v
for k, v in BRAND.items():
    prim[f"hisd-{k}"] = v
for k, v in TYPE["family"].items():
    prim[f"font-{k}"] = v
for k, v in TYPE["size"].items():
    prim[f"text-{k}"] = (v+"rem") if v.replace('.','').isdigit() else v
for k, v in TYPE["weight"].items():
    prim[f"weight-{k}"] = v
for k, v in TYPE["leading"].items():
    prim[f"leading-{k}"] = v
for k, v in SPACE.items():
    prim[f"space-{k}"] = v
for k, v in RADIUS.items():
    prim[f"radius-{k}"] = v
for k, v in MOTION["duration"].items():
    prim[f"duration-{k}"] = v
for k, v in MOTION["easing"].items():
    prim[f"ease-{k}"] = v
# Reduced-motion flag: 0 normally, flipped to 1 under prefers-reduced-motion so
# component CSS/JS can branch on motion state via var(--motion-reduce).
prim["motion-reduce"] = "0"
# Accessibility system tokens (theme-independent; single-sourced here so the
# whole library shares one focus-ring geometry and one target-size floor).
prim["focus-ring-width"] = "2px"      # canonical visible focus outline width
prim["focus-ring-offset"] = "2px"     # canonical outer offset (reconciles the doc 3px vs the components' 2px)
prim["target-size-min"] = "1.5rem"    # 24px — WCAG 2.2 SC 2.5.8 AA floor
prim["target-size-touch"] = "2.75rem" # 44px — comfortable touch target (iOS/Material)
prim["scroll-margin-sticky"] = "5rem" # clearance so a focused/anchored target is not hidden under a sticky app bar (WCAG 2.4.11)
for i, c in enumerate(DATAVIZ):
    prim[f"dataviz-{i+1}"] = c
# Ribbon composite recipes — emitted ONCE in :root (theme-agnostic). The gradient
# references the per-theme --ribbon-from/--ribbon-to stops emitted in the semantic
# blocks; the fan is the fixed canonical 4-stop band.
prim["ribbon-gradient"] = RIBBON_GRADIENT_CSS
prim["ribbon-fan"] = RIBBON_FAN_CSS
# Ribbon CANONICAL field device defaults that are THEME-INVARIANT in value, emitted in
# :root (and surfaced in scss) as the single source the field SVGs fall back to. The
# field color and stroke color are identical across themes (only the stroke OPACITY
# multiplier differs by theme — that one stays semantic-only, in the LIGHT/DARK blocks
# below, since it is the part that must change to read on darker fields).
prim["ribbon-field-bg"] = LIGHT["ribbon-field-bg"]   # default field = teal-500 #00A3AF
prim["ribbon-stroke"] = LIGHT["ribbon-stroke"]       # current stroke = #FFFFFF

def sem(theme, elev):
    # Ribbon gradient STOPS are emitted under their bare canonical names
    # (--ribbon-from / --ribbon-to / --ribbon-highlight) so the theme-agnostic
    # --ribbon-gradient composite in :root can reference var(--ribbon-from) etc.
    # and follow the active [data-theme]. Everything else gets the --color- prefix.
    d = {}
    for k, v in theme.items():
        d[k if k.startswith("ribbon-") else f"color-{k}"] = v
    for k, v in elev.items():
        d[f"shadow-{k}"] = v
    return d

FONTFACE = '''
@font-face { font-family: "Radio Canada"; src: url("fonts/RadioCanada-VariableFont_wdth,wght.ttf") format("truetype-variations"); font-weight: 300 700; font-stretch: 75% 100%; font-display: swap; }
@font-face { font-family: "Radio Canada"; src: url("fonts/RadioCanada-Italic-VariableFont_wdth,wght.ttf") format("truetype-variations"); font-weight: 300 700; font-stretch: 75% 100%; font-style: italic; font-display: swap; }
@font-face { font-family: "Parkinsans"; src: url("fonts/Parkinsans-VariableFont_wght.ttf") format("truetype-variations"); font-weight: 300 800; font-display: swap; }
@font-face { font-family: "Lora"; src: url("fonts/Lora-VariableFont_wght.ttf") format("truetype-variations"); font-weight: 400 700; font-display: swap; }
@font-face { font-family: "Lora"; src: url("fonts/Lora-Italic-VariableFont_wght.ttf") format("truetype-variations"); font-weight: 400 700; font-style: italic; font-display: swap; }
'''
css = f"""/* HISD design tokens — generated by build_tokens.py. Do not edit by hand. */
/* Light is the default; dark applies via [data-theme="dark"] or the OS preference */
/* unless [data-theme="light"] forces light. Mirrors the School Navigator pattern. */
/* Brand fonts are self-hosted from ./fonts/ — no external CDN. */
{FONTFACE}
:root {{
{css_block(prim)}
}}

:root,
[data-theme="light"] {{
{css_block(sem(LIGHT, ELEVATION_LIGHT))}
}}

[data-theme="dark"] {{
{css_block(sem(DARK, ELEVATION_DARK))}
}}

@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
{css_block(sem(DARK, ELEVATION_DARK), ind="    ")}
  }}
}}

@media (prefers-reduced-motion: reduce) {{
  /* Tiered reduce — NOT a blanket zero. Kill spatial movement (slide, scale,
     parallax, stagger) by zeroing the speed ladder, but RETAIN a short
     opacity-only crossfade so a state change still reads as "content arrived".
     A pure fade is not vestibular motion, so it is safe under reduce and keeps
     loading/skeleton states legible. Opacity crossfades must use
     --duration-crossfade; movement must use the speed ladder. */
  :root {{
    --motion-reduce: 1;
    --duration-instant: 0ms; --duration-fast: 0ms; --duration-base: 0ms;
    --duration-slow: 0ms; --duration-slower: 0ms;
    --duration-crossfade: 120ms;
  }}
}}

@media (prefers-contrast: more) {{
  /* "Increase Contrast" (notably Safari/iOS, where forced-colors never fires):
     harden the UI at the token level even without the OS color override —
     promote every border to its strong value, give muted text full contrast,
     and widen the focus ring. Reaches any component that paints through
     --color-border / --color-text-muted / the focus tokens. */
  :root {{
    --color-border: var(--color-border-strong);
    --color-text-muted: var(--color-text);
    --focus-ring-width: 3px;
  }}
}}
"""
def _srgb_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _oklch(hexstr):
    """sRGB hex -> OKLCH string. Computed from the hex, so rendering is identical
    on sRGB; the OKLCH layer just unlocks perceptual authoring + wide-gamut-ready
    color for capable browsers, over the hex fallback."""
    import math
    h = hexstr.lstrip("#")
    r, g, b = (_srgb_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    C = math.hypot(A, B)
    H = math.degrees(math.atan2(B, A)) % 360
    if C < 1e-4:
        return "oklch(%.2f%% 0 0)" % (L * 100)
    return "oklch(%.2f%% %.4f %.2f)" % (L * 100, C, H)


# Progressive enhancement layers. The hex emitted above stays the PRIMARY value
# (fallback for older engines, and the flattened sRGB export print/email/Power BI
# read). Capable browsers additionally get: color-scheme wired to data-theme (so
# native controls theme correctly AND light-dark() can follow the manual override),
# and the semantic colors re-declared once in OKLCH via light-dark().
_enh = [
    "",
    "/* ---- Progressive enhancement (hex above is the primary value) ---- */",
    "@supports (color: light-dark(white, black)) {",
    "  :root { color-scheme: light dark; }",
    '  [data-theme="light"] { color-scheme: light; }',
    '  [data-theme="dark"] { color-scheme: dark; }',
    "}",
    "@supports (color: oklch(0% 0 0)) and (color: light-dark(white, black)) {",
    "  /* OKLCH authoring, resolved per theme by light-dark() following the",
    "     color-scheme wired above. Values are computed from the sRGB hex, so",
    "     rendering is identical on sRGB displays. */",
    "  :root {",
]
for _k in LIGHT:
    # Ribbon stops keep their bare --ribbon-* names (not --color-*) and are already
    # emitted per-theme by sem(); skip them here so the OKLCH layer does not mint a
    # misnamed --color-ribbon-* duplicate.
    if _k.startswith("ribbon-"):
        continue
    _lv, _dv = LIGHT.get(_k), DARK.get(_k)
    if isinstance(_lv, str) and _lv.startswith("#") and isinstance(_dv, str) and _dv.startswith("#"):
        _enh.append("    --color-%s: light-dark(%s, %s);" % (_k, _oklch(_lv), _oklch(_dv)))
_enh += ["  }", "}", ""]
css += "\n".join(_enh)

with open(os.path.join(OUT, "hisd-theme.css"), "w") as f:
    f.write(css)

# ---------------------------------------------------------------------------
# Emit: Power BI / Fabric theme
# ---------------------------------------------------------------------------
powerbi = {
    "name": "HISD 2025",
    "dataColors": DATAVIZ,
    "foreground": LIGHT["text"],
    "foregroundNeutralSecondary": LIGHT["text-muted"],
    "background": PAPER,
    "backgroundLight": ref("neutral", 100),
    "tableAccent": BRAND["teal"],
    "good": ref("dark-green", 600), "neutral": ref("amber", 600), "bad": ref("red", 600),
    "maximum": BRAND["teal"], "minimum": ref("teal", 50),
    "hyperlink": LIGHT["link"],
    # Ribbon sentinel — Power BI report themes cannot express a CSS gradient, so the
    # canonical bayou device is surfaced as named colors the page-background SVGs match:
    # ribbonFrom/ribbonTo are the light-theme gradient endpoints (teal-500 ->
    # dark-green-600), ribbonHighlight the yellow-400 peak, and ribbonFan* the fixed
    # 4-stop fan band. SVG backgrounds snap to these EXACT hex so nothing drifts.
    "ribbonFrom": LIGHT["ribbon-from"], "ribbonTo": LIGHT["ribbon-to"],
    "ribbonHighlight": LIGHT["ribbon-highlight"],
    "ribbonFan": [h for h, _ in RIBBON_FAN_STOPS],
    "visualStyles": {"*": {"*": {"*": [{"fontFamily": "Segoe UI", "fontSize": 10}]}}},
    "_comment": "Power BI cannot embed non-installed fonts; Segoe UI is the on-screen stand-in for Radio Canada. Use brand fonts only in exported/static assets.",
}
with open(os.path.join(OUT, "hisd-powerbi-theme.json"), "w") as f:
    json.dump(powerbi, f, indent=2)

# ---------------------------------------------------------------------------
# Emit: Sass variables
# ---------------------------------------------------------------------------
scss = "// HISD tokens — generated by build_tokens.py. Do not edit by hand.\n"
for k, v in prim.items():
    scss += f"${k}: {v};\n"
with open(os.path.join(OUT, "hisd-tokens.scss"), "w") as f:
    f.write(scss)

# ---------------------------------------------------------------------------
# Emit: JS token data (drives the living style guide's swatches)
# ---------------------------------------------------------------------------
jsdata = {"brand": BRAND,
          "color": {n: {str(k): v for k, v in s.items()} for n, s in SCALES.items()},
          "dataviz": DATAVIZ,
          # Ribbon — so the living style guide can preview the canonical field device
          # (solid field + white current strokes) and the constrained-media accents.
          "ribbon": {
              "fieldBg": {"light": LIGHT["ribbon-field-bg"], "dark": DARK["ribbon-field-bg"]},
              "stroke":  {"light": LIGHT["ribbon-stroke"], "dark": DARK["ribbon-stroke"]},
              "strokeOpacity": {"light": LIGHT["ribbon-stroke-opacity"], "dark": DARK["ribbon-stroke-opacity"]},
              "from":  {"light": LIGHT["ribbon-from"], "dark": DARK["ribbon-from"]},
              "to":    {"light": LIGHT["ribbon-to"],   "dark": DARK["ribbon-to"]},
              "highlight": {"light": LIGHT["ribbon-highlight"], "dark": DARK["ribbon-highlight"]},
              "gradient": RIBBON_GRADIENT_CSS,
              "gradientFlat": RIBBON_GRADIENT_FLAT,
              "fan": RIBBON_FAN_CSS,
              "fanStops": [{"hex": h, "pos": p} for h, p in RIBBON_FAN_STOPS],
          }}
with open(os.path.join(OUT, "hisd-tokens.js"), "w") as f:
    f.write("window.HISD_TOKENS = " + json.dumps(jsdata) + ";\n")

# ---------------------------------------------------------------------------
# Emit: WCAG contrast report for the semantic pairings
# ---------------------------------------------------------------------------
def row(label, fg, bg, note=None, minimum=4.5):
    # `minimum` is the WCAG threshold this pairing must clear: 4.5:1 for normal
    # text, 3.0:1 for large text and non-text UI components (SC 1.4.11). A pairing
    # PASSES when it meets its own applicable threshold.
    r = contrast(fg, bg)
    aa = "PASS" if r >= minimum else ("AA-large" if r >= 3 else "FAIL")
    if note:
        aa = f"{aa} ({note})"
    return f"| {label} | `{fg}` | `{bg}` | {r}:1 | {aa} |"

def audit(theme, name):
    lines = [f"### {name}", "", "| Pairing | Foreground | Background | Ratio | WCAG |",
             "| --- | --- | --- | --- | --- |"]
    pairs = [
        ("Body text on bg", theme["text"], theme["bg"], None),
        ("Body text on surface", theme["text"], theme["surface"], None),
        ("Muted text on surface", theme["text-muted"], theme["surface"], None),
        # Card eyebrow/overline label renders as real text at --text-xs/600, so it
        # is normal-size text under WCAG 2.2 and must clear 4.5:1 — it binds to
        # --color-text-muted (NOT --color-text-subtle, which is a 3:1 non-text token).
        ("Eyebrow / muted label on surface", theme["text-muted"], theme["surface"], None),
        ("On-action on action", theme["on-action"], theme["action"], None),
        ("Link on surface", theme["link"], theme["surface"], None),
        ("Danger on surface", theme["danger"], theme["surface"], None),
        ("Success on surface", theme["success"], theme["surface"], None),
        ("Focus ring on surface (with offset)", theme["focus"], theme["surface"], None),
        # Selection is now a teal highlight (de-yellowed); the label binds to the
        # per-theme --color-text-on-selected token, so this row mirrors what the
        # chip/table actually render and can never mask a real regression.
        ("Selected label on selected fill", theme["text-on-selected"], theme["selected"], None),
        # Tooltip bubble: role="tooltip" text painted on the inverse surface. The
        # component (tooltip.css) binds fg --color-text-on-accent on bg
        # --color-surface-inverse; this row makes that exact pairing appear in the
        # report so the Accessibility Contract's "used combination must pass AA in
        # both themes" clause is satisfied by generated evidence, not assertion.
        ("Tooltip text on inverse surface", theme["text-on-accent"], theme["surface-inverse"], None),
        # Rest border is sub-3:1 against the surface; documented and consciously
        # accepted. The component contract binds rest border to --color-border by
        # design (a quiet hairline), and operability never depends on it — the
        # focus border uses --color-action (see "Focus ring" rows above), which
        # clears 3:1. Not in the build gate; logged here for spec-level awareness.
        ("Rest border on surface (decorative hairline)", theme["border"], theme["surface"],
         "accepted: non-operable; focus uses --color-action"),
    ]
    for lbl, fg, bg, note in pairs:
        lines.append(row(lbl, fg, bg, note))
    # Toast status rail + masked icon are GRAPHICAL UI indicators (WCAG 2.2 SC
    # 1.4.11, non-text, 3:1) painted in the variant status color on the raised
    # surface (toast.css binds border-inline-start + .hisd-toast__icon to
    # --hisd-toast-status on --color-surface-raised). These rows make the four
    # toast variant pairings appear in the report so the Components.md "used
    # combination must pass for both themes" contract is backed by evidence, not
    # assertion. Warning binds to the amber --color-warning-strong.
    lines.append(row("Toast success rail/icon on raised surface (SC 1.4.11)",
                     theme["success"], theme["surface-raised"], None, 3.0))
    lines.append(row("Toast warning rail/icon on raised surface (SC 1.4.11)",
                     theme["warning-strong"], theme["surface-raised"],
                     "amber harmonizer; brand yellow is reserved", 3.0))
    lines.append(row("Toast danger rail/icon on raised surface (SC 1.4.11)",
                     theme["danger"], theme["surface-raised"], None, 3.0))
    lines.append(row("Toast info rail/icon on raised surface (SC 1.4.11)",
                     theme["info"], theme["surface-raised"], None, 3.0))
    # Switch OFF-state boundary (WCAG 2.2 SC 1.4.11, non-text UI component, 3:1).
    # The OFF track edge and the sliding thumb edge both bind to --color-text-subtle
    # so an OFF switch and its thumb position stay perceivable to low-vision users.
    # The thumb edge is checked against BOTH the host surface AND the pale
    # --color-border track fill, so the thumb is distinguishable from the track when
    # OFF. These pass at the 3:1 non-text threshold and are enforced by the gate.
    lines.append(row("Switch OFF-track ring vs surface (SC 1.4.11)",
                     theme["text-subtle"], theme["surface"], None, 3.0))
    lines.append(row("Switch OFF thumb border vs surface (SC 1.4.11)",
                     theme["text-subtle"], theme["surface"], None, 3.0))
    lines.append(row("Switch OFF thumb border vs OFF-track fill (SC 1.4.11)",
                     theme["text-subtle"], theme["border"], None, 3.0))
    # Semantic status variants. Each cue ships a tint surface that carries -strong
    # text (4.5:1 normal text) and a solid fill that carries on-<cue> text. These
    # rows make the alert/badge/toast/banner contracts enforced evidence.
    for cue in ("success", "warning", "danger", "info", "neutral"):
        lines.append(row(f"{cue}-strong text on {cue}-surface",
                         theme[f"{cue}-strong"], theme[f"{cue}-surface"], None))
        lines.append(row(f"on-{cue} text on {cue} solid",
                         theme[f"on-{cue}"], theme[cue], None))
    return "\n".join(lines)

report = ("# HISD token contrast report\n\nGenerated by `build_tokens.py`. "
          "Targets: WCAG 2.2 — 4.5:1 normal text, 3:1 large text / non-text.\n\n"
          + audit(LIGHT, "Light theme") + "\n\n" + audit(DARK, "Dark theme") + "\n")
with open(os.path.join(OUT, "contrast-report.md"), "w") as f:
    f.write(report)

# ---------------------------------------------------------------------------
# Gate: fail the build if any required semantic pairing regresses below WCAG AA.
# The contrast report above is the evidence; this turns it into an invariant.
# ---------------------------------------------------------------------------
_required = [("text/bg", "text", "bg", 4.5), ("text/surface", "text", "surface", 4.5),
             ("text-muted/surface", "text-muted", "surface", 4.5),
             ("eyebrow-label/surface", "text-muted", "surface", 4.5),
             # Label on the teal selected highlight (table selected row, chip): real text, 4.5:1.
             ("text-on-selected/selected", "text-on-selected", "selected", 4.5),
             ("on-action/action", "on-action", "action", 4.5),
             # State ladder: body text stays AA on the hover/active surfaces, and
             # on-action text stays AA on the pressed (action-active) fill.
             ("text/surface-hover", "text", "surface-hover", 4.5),
             ("text/surface-active", "text", "surface-active", 4.5),
             ("on-action/action-active", "on-action", "action-active", 4.5),
             ("link/surface", "link", "surface", 4.5), ("danger/surface", "danger", "surface", 4.5),
             ("success/surface", "success", "surface", 4.5), ("focus/surface", "focus", "surface", 3.0),
             # Tooltip bubble text is real normal-size text on the inverse surface (4.5:1).
             ("tooltip-text/surface-inverse", "text-on-accent", "surface-inverse", 4.5),
             # Toast status rail + masked icon are graphical UI indicators on the
             # raised surface (SC 1.4.11, 3:1). Warning uses --color-warning-strong;
             # the others reuse their status token. Gating these makes the
             # Components.md toast contrast contract an enforced invariant.
             ("toast-success-rail/surface-raised", "success", "surface-raised", 3.0),
             ("toast-warning-rail/surface-raised", "warning-strong", "surface-raised", 3.0),
             ("toast-danger-rail/surface-raised", "danger", "surface-raised", 3.0),
             ("toast-info-rail/surface-raised", "info", "surface-raised", 3.0),
             # Switch OFF-state boundary is operability-critical (SC 1.4.11, 3:1).
             ("switch-offring/surface", "text-subtle", "surface", 3.0),
             ("switch-thumb-border/surface", "text-subtle", "surface", 3.0),
             ("switch-thumb-border/offtrack", "text-subtle", "border", 3.0)]
# Every semantic status cue: -strong text must clear 4.5:1 on its tint surface,
# and on-<cue> text must clear 4.5:1 on the solid fill — in BOTH themes.
for _cue in ("success", "warning", "danger", "info", "neutral"):
    _required.append((f"{_cue}-strong/{_cue}-surface", f"{_cue}-strong", f"{_cue}-surface", 4.5))
    _required.append((f"on-{_cue}/{_cue}", f"on-{_cue}", _cue, 4.5))
_failures = [f"{name}:{lbl} = {contrast(theme[fg], theme[bg])}:1 (needs {mn}:1)"
             for theme, name in ((LIGHT, "light"), (DARK, "dark"))
             for lbl, fg, bg, mn in _required if contrast(theme[fg], theme[bg]) < mn]

if _failures:
    print("CONTRAST GATE FAILED — fix the palette before shipping:")
    for _f in _failures:
        print("  -", _f)
    sys.exit(1)

print("Wrote tokens to", OUT)
for fn in ["hisd.tokens.json", "hisd-theme.css", "hisd-powerbi-theme.json", "hisd-tokens.scss", "contrast-report.md"]:
    print("  -", fn)
print("\nLight action contrast:", contrast(LIGHT["on-action"], LIGHT["action"]),
      "| Dark action contrast:", contrast(DARK["on-action"], DARK["action"]))
