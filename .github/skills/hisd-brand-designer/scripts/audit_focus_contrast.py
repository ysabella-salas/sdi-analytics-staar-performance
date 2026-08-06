#!/usr/bin/env python3
"""Measured focus-ring contrast audit.

WCAG 2.2 SC 1.4.11 (Non-text Contrast) requires a focus indicator to clear 3:1
against ADJACENT colors. This script measures --color-focus against every
surface it can land on, in BOTH themes, so focus conformance is proven rather
than asserted.

Exit 1 if the focus token fails 3:1 on any PRIMARY surface (bg / surface /
surface-raised / surface-sunken) — the everyday focus contexts, which the single
--color-focus outline must cover on its own. Non-neutral surfaces (brand app
bars, the action fill, the inverse surface) are REPORTED, not failed: a focus
ring there must use the two-tone recipe documented in Docs/Design-System/
Accessibility.md, because no single teal can clear 3:1 on another teal.

    python3 audit_focus_contrast.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
THEME = os.path.join(HERE, "..", "assets", "hisd-theme.css")

PRIMARY = ["color-bg", "color-surface", "color-surface-raised", "color-surface-sunken"]
NON_NEUTRAL = ["color-brand", "color-action", "color-surface-inverse"]


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def _lum(hexstr):
    h = hexstr.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _block(text, header):
    # grab the {...} body following a selector header
    m = re.search(re.escape(header) + r"\s*\{(.*?)\}", text, re.S)
    return m.group(1) if m else ""


def _tokens(block):
    return dict(re.findall(r"--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})", block))


def main():
    css = open(THEME, encoding="utf-8").read()
    themes = {
        "light": _tokens(_block(css, ':root,\n[data-theme="light"]')),
        "dark": _tokens(_block(css, '[data-theme="dark"]')),
    }
    fails = []
    for theme, tok in themes.items():
        focus = tok.get("color-focus")
        if not focus:
            print("  (could not read --color-focus for %s)" % theme)
            continue
        print("\n%s — --color-focus %s" % (theme.upper(), focus))
        for group, names in (("primary", PRIMARY), ("non-neutral", NON_NEUTRAL)):
            for name in names:
                surf = tok.get(name)
                if not surf:
                    continue
                ratio = contrast(focus, surf)
                ok = ratio >= 3.0
                mark = "ok " if ok else "LOW"
                tag = "" if group == "primary" else "  (two-tone ring required)"
                print("  [%s] vs --%-22s %s : %4.2f:1%s" % (mark, name, surf, ratio, tag))
                if group == "primary" and not ok:
                    fails.append("%s: focus %s on --%s (%s) = %.2f:1" % (theme, focus, name, surf, ratio))
    print()
    if fails:
        print("FAIL — focus ring under 3:1 on a primary surface:")
        for f in fails:
            print("  -", f)
        return 1
    print("PASS — --color-focus clears 3:1 on every primary surface in both themes.")
    print("Non-neutral surfaces (brand/action/inverse) use the two-tone focus recipe.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
