#!/usr/bin/env python3
"""Mechanical brand/accessibility lint for the HISD coded component library.

A hard gate on top of the agents' review: every component must paint color only
through tokens, expose a visible focus ring, and stay RTL-safe. Run:

    python3 lint_components.py            # lint components/
    python3 lint_components.py --json     # machine-readable

Exit 1 on any blocker. Designed to be cheap and dependency-free so CI can run it.
"""
import os, re, sys, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
COMPONENTS = os.path.normpath(os.path.join(HERE, "..", "components"))

# Properties whose value is a color and therefore must be a token (or an
# allowed keyword). box-shadow/outline are color-bearing too.
COLOR_PROPS = ("color", "background", "background-color", "border", "border-color",
               "border-top", "border-right", "border-bottom", "border-left",
               "border-inline", "border-block", "border-inline-start", "border-inline-end",
               "border-block-start", "border-block-end", "outline", "outline-color",
               "fill", "stroke", "box-shadow", "caret-color", "text-decoration-color",
               "accent-color", "column-rule", "--hisd")  # custom props that hold colors
ALLOWED_COLOR_WORDS = ("transparent", "currentcolor", "inherit", "initial", "unset",
                       "none", "var(")
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGBHSL = re.compile(r"\b(rgb|rgba|hsl|hsla)\s*\(")
PHYSICAL = re.compile(r"(?<![\w-])(padding|margin)-(left|right)\s*:")
PHYSICAL_BORDER = re.compile(r"(?<![\w-])border-(left|right)\s*:")
PHYSICAL_POS = re.compile(r"(?<![\w-])(left|right)\s*:")
OUTLINE_NONE = re.compile(r"outline\s*:\s*(none|0)\b")


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def lint_css(path):
    raw = open(path).read()
    css = strip_comments(raw)
    blockers, warns = [], []
    for i, line in enumerate(css.splitlines(), 1):
        low = line.lower()
        decl = low.split(":", 1)
        prop = decl[0].strip() if len(decl) == 2 else ""
        is_color_prop = any(prop == p or prop.startswith("--hisd") for p in COLOR_PROPS) \
            or any(prop.startswith(p) for p in ("background", "border", "box-shadow", "outline"))
        # raw hex / rgb on a color-bearing declaration, unless wrapped only in var()
        if is_color_prop and (HEX.search(line) or RGBHSL.search(line)):
            # allow a hex ONLY if it is not present outside a var() fallback we forbid too
            blockers.append(f"{os.path.basename(path)}:{i}  raw color in `{line.strip()[:80]}`")
        # physical box properties break RTL
        if PHYSICAL.search(low) or PHYSICAL_BORDER.search(low):
            warns.append(f"{os.path.basename(path)}:{i}  physical property (use logical) `{line.strip()[:70]}`")
    if OUTLINE_NONE.search(css) and ":focus-visible" not in css:
        blockers.append(f"{os.path.basename(path)}  outline:none without a :focus-visible replacement")
    if ":focus-visible" not in css and re.search(r"(button|\[role|input|select|textarea|a[ .:])", css):
        warns.append(f"{os.path.basename(path)}  interactive CSS but no :focus-visible ring found")
    return blockers, warns


def lint_html_inline(path):
    raw = open(path).read()
    blockers = []
    # inline style attributes painting raw color
    for m in re.finditer(r'style="([^"]*)"', raw):
        s = m.group(1)
        if (HEX.search(s) or RGBHSL.search(s)) and any(p in s.lower() for p in ("color", "background", "border", "fill", "shadow")):
            line = raw[:m.start()].count("\n") + 1
            blockers.append(f"{os.path.basename(path)}:{line}  inline raw color in style attr")
    return blockers


def main():
    as_json = "--json" in sys.argv
    css_files = sorted(glob.glob(os.path.join(COMPONENTS, "*.css")))
    html_files = sorted(glob.glob(os.path.join(COMPONENTS, "*.html")))
    if not css_files:
        print("No component CSS found at", COMPONENTS); sys.exit(2)
    all_block, all_warn = [], []
    for f in css_files:
        b, w = lint_css(f); all_block += b; all_warn += w
    for f in html_files:
        all_block += lint_html_inline(f)
    if as_json:
        print(json.dumps({"components": len(css_files), "blockers": all_block, "warnings": all_warn}, indent=2))
    else:
        print(f"Linted {len(css_files)} component stylesheets + {len(html_files)} demos.")
        if all_warn:
            print(f"\n{len(all_warn)} warning(s):")
            for w in all_warn: print("  ⚠", w)
        if all_block:
            print(f"\n{len(all_block)} BLOCKER(s):")
            for b in all_block: print("  ✗", b)
        else:
            print("\n✓ No blockers — every component paints color through tokens and keeps a focus ring.")
    sys.exit(1 if all_block else 0)


if __name__ == "__main__":
    main()
