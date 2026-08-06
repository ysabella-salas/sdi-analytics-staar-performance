#!/usr/bin/env python3
"""Assemble an EXPERIMENTAL HISD .pbit skeleton (a zip of the required parts).

  ⚠️  THIS IS NOT A GUARANTEED-VALID BINARY .pbit.  ⚠️

A genuine, openable Power BI template (.pbit) must be authored and exported from
**Power BI Desktop** (Windows): File > Export > Power BI template. Power BI writes
a precise OPC/zip package (DataModelSchema, DataMashup, Metadata, Settings,
SecurityBindings, Report/Layout, [Content_Types].xml) whose exact byte layout and
internal cross-references this script cannot reproduce headlessly. Recent Desktop
builds will refuse to open a package they did not write.

What this script DOES do — usefully and honestly:
  * Zips up a documented, clearly-labeled *skeleton* that bundles the HISD brand
    parts an author needs (the dark + light themes, both page backgrounds, a
    minimal Report/Layout JSON wired to the theme, and a [Content_Types].xml).
  * Produces a self-describing artifact (READ_ME_FIRST.txt inside) so anyone who
    finds the file knows it is a scaffold, not a Desktop-exported template.

Treat the output as a *parts bundle / reference*, not a double-click template.
The real, reliable path is the manual export documented in README.md §1.

Usage:
    python3 build_pbit.py [--out hisd-template-experimental.pbit]

Then ALWAYS verify the package contents:
    unzip -l hisd-template-experimental.pbit

Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))

LIGHT_THEME = os.path.join(HERE, "..", "..", "assets", "hisd-powerbi-theme.json")
DARK_THEME = os.path.join(HERE, "hisd-powerbi-theme-dark.json")
BG_DIR = os.path.join(HERE, "page-backgrounds")

READ_ME = """\
HISD Power BI template — EXPERIMENTAL SKELETON (not a Desktop-exported .pbit)
============================================================================

This file is a documented ZIP scaffold assembled by build_pbit.py. It is NOT a
guaranteed-valid binary Power BI template and may not open in Power BI Desktop.

A real .pbit must be exported from Power BI Desktop:
    File > Export > Power BI template

To produce the real template in minutes, follow README.md in this kit:
  1. New report in Power BI Desktop.
  2. View > Themes > Browse  ->  apply hisd-powerbi-theme.json (light) OR
     hisd-powerbi-theme-dark.json (dark).
  3. Set each page's Canvas background to the matching SVG from
     page-backgrounds/ (Fit, 0% transparency; Canvas type = 16:9).
  4. Lay out a title page + a content page per layout-guide.md.
  5. File > Export > Power BI template.

The HISD brand parts you need are bundled in this zip under /hisd-parts/ for
convenience (themes + page backgrounds + a minimal Report/Layout reference).
"""

# A minimal Power BI Report "Layout" reference. Real Desktop layouts are far
# richer; this is a readable reference of the shape, wired to the theme name.
MINIMAL_LAYOUT = {
    "id": 0,
    "resourcePackages": [
        {
            "resourcePackage": {
                "name": "SharedResources",
                "type": 2,
                "items": [
                    {"type": 202, "path": "BaseThemes/CY24SU10.json", "name": "CY24SU10"}
                ],
                "disabled": False,
            }
        }
    ],
    "sections": [
        {"id": 0, "name": "TitlePage", "displayName": "Title", "visualContainers": [], "config": "{}"},
        {"id": 1, "name": "ContentPage", "displayName": "Content", "visualContainers": [], "config": "{}"},
    ],
    "config": json.dumps(
        {"version": "5.43", "themeCollection": {"customTheme": {"name": "HISD 2025"}}}
    ),
    "_comment": "Reference Layout shape only — replace with a Desktop-exported Layout.",
}

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="json" ContentType="application/json"/>'
    '<Default Extension="svg" ContentType="image/svg+xml"/>'
    '<Default Extension="txt" ContentType="text/plain"/>'
    "</Types>"
)


def build(out_path: str) -> str:
    if not os.path.exists(DARK_THEME):
        raise SystemExit(f"missing dark theme: {DARK_THEME}")
    if not os.path.exists(LIGHT_THEME):
        raise SystemExit(f"missing light theme: {LIGHT_THEME}")

    out_path = os.path.abspath(out_path)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        # Self-describing banner FIRST so it shows up at the top of `unzip -l`.
        z.writestr("READ_ME_FIRST.txt", READ_ME)
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("Report/Layout", json.dumps(MINIMAL_LAYOUT, indent=2))

        # Bundle the brand parts.
        with open(LIGHT_THEME, encoding="utf-8") as fh:
            z.writestr("hisd-parts/hisd-powerbi-theme.json", fh.read())
        with open(DARK_THEME, encoding="utf-8") as fh:
            z.writestr("hisd-parts/hisd-powerbi-theme-dark.json", fh.read())
        for svg in sorted(os.listdir(BG_DIR)):
            if svg.endswith(".svg"):
                with open(os.path.join(BG_DIR, svg), encoding="utf-8") as fh:
                    z.writestr(f"hisd-parts/page-backgrounds/{svg}", fh.read())
    return out_path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Assemble an EXPERIMENTAL HISD .pbit skeleton (not a guaranteed-valid binary)."
    )
    p.add_argument(
        "--out",
        default="hisd-template-experimental.pbit",
        help="output path (default: ./hisd-template-experimental.pbit)",
    )
    args = p.parse_args(argv)
    out = build(args.out)
    print(f"[EXPERIMENTAL] wrote {out}", file=sys.stderr)
    print(
        "This is a documented skeleton, NOT a guaranteed-valid Desktop .pbit. "
        "Verify with: unzip -l " + out,
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
