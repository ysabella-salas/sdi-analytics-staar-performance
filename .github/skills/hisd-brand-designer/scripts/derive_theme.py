#!/usr/bin/env python3
"""Derive an HISD-aligned sub-theme (campus / department / sport / program) from
ONE seed accent color.

Output: a scoped CSS layer that re-binds the accent-family semantic tokens
(`--color-brand` / `-action` / `-action-hover` / `-action-active` / `-focus` /
`-selected` / `-selected-border` / `-text-on-selected` / `-link`) under the
selector `[data-campus="<slug>"]` (and `[data-theme="dark"] [data-campus="…"]`),
both verified against WCAG 2.2 AA via the same contrast function the brand
build uses — so a seed that cannot reach the floor is REJECTED, not shipped.

Neutrals, surfaces, text, ALL semantic STATUS roles (success/danger/warning/
info/neutral), and the elevation/motion tokens are unchanged. The brand
"Sunrise" yellow guard, the de-yellowed selection contract, and pure-white-only
surfaces hold by construction (we only touch the accent family).

    derive_theme.py "Bellaire" #1F8A3F --apply
    derive_theme.py "Athletics" oklch(55% 0.16 27)
    derive_theme.py --check assets/campuses/bellaire.css   (drift gate)
"""
import os, sys, re, json, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.normpath(os.path.join(HERE, ".."))
ASSETS = os.path.join(SKILL, "assets")
OUT_DIR = os.path.join(ASSETS, "campuses")

# ---- shared with build_tokens.py (must stay in lockstep) -------------------
PAPER, INK = "#FFFFFF", "#19282C"
LIGHT_F = {50: 0.94, 100: 0.86, 200: 0.72, 300: 0.55, 400: 0.30}
DARK_F  = {600: 0.14, 700: 0.30, 800: 0.46, 900: 0.62, 950: 0.78}
AA_NORMAL_TEXT = 4.5   # WCAG 1.4.3
AA_NON_TEXT    = 3.0   # WCAG 1.4.11 — focus ring + UI components


def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def xh(rgb):
    return "#" + "".join("%02X" % max(0, min(255, round(v))) for v in rgb)


def mix(c1, c2, t):
    a, b = hx(c1), hx(c2)
    return xh(tuple(a[i] * (1 - t) + b[i] * t for i in range(3)))


def _lin(v):
    v /= 255.0
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def luminance(c):
    r, g, b = hx(c)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(c1, c2):
    l1, l2 = luminance(c1), luminance(c2)
    hi, lo = max(l1, l2), min(l1, l2)
    return round((hi + 0.05) / (lo + 0.05), 2)


def ramp(base):
    out = {}
    for s, f in LIGHT_F.items():
        out[s] = mix(base, PAPER, f)
    out[500] = base
    for s, f in DARK_F.items():
        out[s] = mix(base, INK, f)
    return {k: out[k] for k in sorted(out)}


# ---- OKLCH -> sRGB hex (so seeds can be authored in OKLCH) -----------------
def _oklch_to_hex(L, C, H_deg):
    import math
    H = math.radians(H_deg); A, B = C * math.cos(H), C * math.sin(H)
    l_ = L + 0.3963377774 * A + 0.2158037573 * B
    m_ = L - 0.1055613458 * A - 0.0638541728 * B
    s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, m, s = l_**3, m_**3, s_**3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def enc(c):
        c = max(0.0, min(1.0, c))
        c = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        return round(c * 255)
    return "#%02X%02X%02X" % (enc(r), enc(g), enc(b))


def parse_seed(s):
    s = s.strip()
    m = re.match(r"^#([0-9A-Fa-f]{6})$", s)
    if m: return "#" + m.group(1).upper()
    m = re.match(r"^#([0-9A-Fa-f]{3})$", s)
    if m: h = m.group(1); return "#" + "".join(c * 2 for c in h).upper()
    m = re.match(r"^oklch\(\s*([0-9.]+)%?\s+([0-9.]+)\s+([0-9.]+)\s*\)$", s)
    if m:
        L, C, H = float(m.group(1)), float(m.group(2)), float(m.group(3))
        if L > 1: L /= 100.0
        return _oklch_to_hex(L, C, H)
    raise SystemExit("seed must be #rrggbb, #rgb, or oklch(L% C H)")


def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "campus"


# ---- the accent-family solver ---------------------------------------------
def _pick_action_step(scale, on_color, floor):
    """Pick the LIGHTEST step that still clears the contrast floor against the
    on-color (so the fill stays as close to the brand-500 anchor as possible)."""
    for s in (500, 600, 700, 800, 900):
        if contrast(scale[s], on_color) >= floor:
            return s
    return 900  # darkest step is the fallback


def derive(name, seed_hex):
    light = ramp(seed_hex)                          # mixes toward PAPER
    dark = light                                    # same scale; dark just picks different steps
    L = {}
    # LIGHT theme bindings — action must be AA (4.5:1) for white text on white surfaces
    L_action_step = _pick_action_step(light, PAPER, AA_NORMAL_TEXT)
    L["brand"]            = light[500]
    L["action"]           = light[L_action_step]
    L["action-hover"]     = light[min(900, L_action_step + 100)]
    L["action-active"]    = light[min(900, L_action_step + 200)]
    L["focus"]            = light[L_action_step]    # same as action: AA already proven
    L["link"]             = light[L_action_step]
    L["selected"]         = light[100]
    L["selected-border"]  = light[500]
    L["text-on-selected"] = light[900]
    # DARK theme bindings — accent must be brighter; action must clear AA on a dark surface (#19282C)
    DARK_SURFACE = "#19282C"
    D = {}
    # pick the DARKEST step that still clears AA against the dark surface (closest to brand identity)
    for s in (400, 300, 200, 100):
        if contrast(light[s], DARK_SURFACE) >= AA_NORMAL_TEXT:
            D_action_step = s
            break
    else:
        D_action_step = 100
    D["brand"]            = light[300]
    D["action"]           = light[D_action_step]
    D["action-hover"]     = light[max(100, D_action_step - 100)]
    D["action-active"]    = light[max(100, D_action_step - 200)]
    D["focus"]            = light[D_action_step]
    D["link"]             = light[D_action_step]
    D["selected"]         = light[800]
    D["selected-border"]  = light[400]
    D["text-on-selected"] = light[50]

    # Verify every claim. A theme that doesn't clear the floor is rejected.
    checks = [
        ("light",  "action on surface (AA text)",       L["action"],            PAPER,        AA_NORMAL_TEXT),
        ("light",  "focus ring on bg (3:1 non-text)",   L["focus"],             "#F5F5F5",    AA_NON_TEXT),
        ("light",  "focus ring on surface",             L["focus"],             PAPER,        AA_NON_TEXT),
        ("light",  "text-on-selected on selected",      L["text-on-selected"],  L["selected"],AA_NORMAL_TEXT),
        ("dark",   "action on surface (AA text)",       D["action"],            DARK_SURFACE, AA_NORMAL_TEXT),
        ("dark",   "focus ring on bg",                  D["focus"],             "#121F22",    AA_NON_TEXT),
        ("dark",   "focus ring on surface",             D["focus"],             DARK_SURFACE, AA_NON_TEXT),
        ("dark",   "text-on-selected on selected",      D["text-on-selected"],  D["selected"],AA_NORMAL_TEXT),
    ]
    results = [{"theme": t, "what": w, "fg": fg, "bg": bg, "ratio": contrast(fg, bg), "floor": fl,
                "pass": contrast(fg, bg) >= fl} for t, w, fg, bg, fl in checks]
    return {"name": name, "slug": slugify(name), "seed": seed_hex,
            "scale": light, "light": L, "dark": D, "checks": results}


def emit_css(theme):
    s = theme["slug"]
    L, D, scale = theme["light"], theme["dark"], theme["scale"]
    head = ("/* HISD campus sub-theme — %s\n"
            "   Generated by scripts/derive_theme.py from seed %s.\n"
            "   Re-binds the accent-family semantic tokens under [data-campus=\"%s\"];\n"
            "   neutrals, surfaces, text, and ALL status roles (success/danger/warning/info/neutral)\n"
            "   remain on the brand defaults so the brand identity holds across campuses. */\n"
            % (theme["name"], theme["seed"], s))
    light_decls = "\n".join("  --color-%s: %s;" % (k, v) for k, v in L.items())
    dark_decls = "\n".join("  --color-%s: %s;" % (k, v) for k, v in D.items())
    return (head +
            "[data-campus=\"%s\"] {\n%s\n}\n\n"
            "[data-theme=\"dark\"] [data-campus=\"%s\"],\n"
            "[data-campus=\"%s\"][data-theme=\"dark\"] {\n%s\n}\n"
            % (s, light_decls, s, s, dark_decls))


def print_report(theme):
    print("Campus: %s  (slug=%s, seed=%s)" % (theme["name"], theme["slug"], theme["seed"]))
    print("  Scale: " + ", ".join("%d=%s" % (k, v) for k, v in theme["scale"].items()))
    print("  Bindings:")
    print("    light:", ", ".join("%s=%s" % (k, v) for k, v in theme["light"].items()))
    print("    dark: ", ", ".join("%s=%s" % (k, v) for k, v in theme["dark"].items()))
    print("  WCAG 2.2 AA checks:")
    fails = []
    for c in theme["checks"]:
        mark = "ok " if c["pass"] else "FAIL"
        print("    [%s] %-9s  %-32s  %s on %s  %.2f:1 (need %.1f:1)" %
              (mark, c["theme"], c["what"], c["fg"], c["bg"], c["ratio"], c["floor"]))
        if not c["pass"]:
            fails.append(c)
    return fails


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", help="Campus / sub-brand name (e.g. \"Bellaire\")")
    ap.add_argument("seed", nargs="?", help="Seed accent: #rrggbb or oklch(L% C H)")
    ap.add_argument("--apply", action="store_true", help="write the .css to assets/campuses/<slug>.css")
    ap.add_argument("--check", metavar="PATH",
                    help="re-derive from the header seed in this file and assert byte-identical (drift gate)")
    args = ap.parse_args(argv)

    if args.check:
        return _check(args.check)
    if not args.name or not args.seed:
        ap.print_help(); return 2
    seed = parse_seed(args.seed)
    theme = derive(args.name, seed)
    fails = print_report(theme)
    if fails:
        print("\nREJECTED: %d AA check(s) failed. Pick a seed with more contrast against\n"
              "PAPER (#FFFFFF) in its 500..900 range, or against the dark surface (#19282C)\n"
              "in its 100..400 range." % len(fails))
        return 1
    if args.apply:
        os.makedirs(OUT_DIR, exist_ok=True)
        path = os.path.join(OUT_DIR, theme["slug"] + ".css")
        with open(path, "w", encoding="utf-8") as f:
            f.write(emit_css(theme))
        print("\nWrote %s" % os.path.relpath(path, SKILL))
    return 0


def _check(path):
    text = open(path, encoding="utf-8").read()
    m = re.search(r"HISD campus sub-theme — (.+?)\n\s*Generated.*?from seed (#[0-9A-F]{6})", text)
    if not m:
        print("Cannot read seed/name from", path); return 2
    name, seed = m.group(1).strip(), m.group(2)
    theme = derive(name, seed)
    want = emit_css(theme)
    if want.strip() == text.strip():
        print("DRIFT: clean — %s matches its declared seed (%s)." % (path, seed))
        return 0
    print("DRIFT: %s does not match a fresh derive_theme.py run from seed %s." % (path, seed))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
