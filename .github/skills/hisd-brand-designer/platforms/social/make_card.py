#!/usr/bin/env python3
"""HISD branded social-card generator.

Substitutes a title (+ optional subtitle) into one of the HISD social SVG
templates and rasterizes the result to a PNG at the exact platform dimensions.

    make_card.py --template og|square|story --title "..." [--subtitle "..."] \
                 [--theme light|dark] [--out FILE.png]

The SVGs carry the real HISD brand hex, the ribbon device, the white+yellow
logo lockup, a headline and a subhead, with documented safe areas. Both themes
use the canonical ribbon **field + white-stroke** device: a flat brand-teal
field (``#00A3AF``) overlaid with low-opacity white round-capped strokes from
the ribbon line kit. The field stays teal in light AND dark; only the stroke
opacity flips (0.16 light / 0.22 dark). The dark templates (``--theme dark`` →
``*-dark.svg``) add a brightened-teal accent bar, a light headline, and a yellow
subhead, from the [data-theme="dark"] semantics in assets/hisd-theme.css.

At build time this script re-splices the ribbon field + strokes (the markup
between the ``RIBBON:BEGIN``/``RIBBON:END`` markers) from the matching generated
background under ``assets/ribbon/social/<template>-<theme>.svg``, so the rendered
cards always track the kit. If that source is missing it falls back to the
static ribbon already embedded in the template. This script only fills in the
copy and renders; it never invents new brand values.

Stdlib only. Rasterization uses macOS `qlmanage` (QuickLook) first, then falls
back through other common SVG rasterizers, and finally forces the exact target
pixel dimensions with `sips`. This is the same fallback chain the app-icon
generator uses.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))

# Per-platform spec: template file, target pixel WxH, and headline wrap budget
# (max characters per line at the template's headline font size — empirical,
# tuned for Parkinsans/Trebuchet display weight).
TEMPLATES = {
    "og": {
        "svg": "og.svg",
        "svg_dark": "og-dark.svg",
        "width": 1200,
        "height": 630,
        "title_chars_per_line": 18,
        "title_max_lines": 3,
        "title_line_height": 78,
        "title_x": 64,
        "title_baseline": 290,
    },
    "square": {
        "svg": "square.svg",
        "svg_dark": "square-dark.svg",
        "width": 1080,
        "height": 1080,
        "title_chars_per_line": 18,
        "title_max_lines": 4,
        "title_line_height": 96,
        "title_x": 80,
        "title_baseline": 540,
    },
    "story": {
        "svg": "story.svg",
        "svg_dark": "story-dark.svg",
        "width": 1080,
        "height": 1920,
        "title_chars_per_line": 16,
        "title_max_lines": 5,
        "title_line_height": 104,
        "title_x": 80,
        "title_baseline": 820,
    },
}

THEMES = ("light", "dark")

TITLE_TOKEN = "{{TITLE}}"
SUBTITLE_TOKEN = "{{SUBTITLE}}"

# Generated ribbon backgrounds (canonical field + white-stroke device), one per
# template+theme, the single source of truth for the ribbon. build_svg() splices
# the rect + stroke groups from these between the RIBBON markers in the template.
RIBBON_DIR = os.path.normpath(
    os.path.join(HERE, "..", "..", "assets", "ribbon", "social")
)
RIBBON_BEGIN = "<!-- RIBBON:BEGIN -->"
RIBBON_END = "<!-- RIBBON:END -->"


# --------------------------------------------------------------------------- #
# XML / text helpers
# --------------------------------------------------------------------------- #
def escape_xml(text: str) -> str:
    """Escape the five XML predefined entities so user copy is render-safe."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def wrap_words(text: str, max_chars: int, max_lines: int) -> list[str]:
    """Greedy word-wrap into at most ``max_lines`` lines of ~``max_chars``.

    A single word longer than the budget is kept whole (it will simply run a
    little wide rather than being chopped mid-word). If the text overflows the
    line budget, the last line is truncated with an ellipsis so the card never
    spills out of its safe area.
    """
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else current + " " + word
        if len(candidate) <= max_chars or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
        if len(lines) == max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)

    # Did anything overflow the line budget? Mark with an ellipsis.
    consumed = sum(len(l.split()) for l in lines)
    if consumed < len(words):
        last = lines[-1]
        if len(last) > max_chars - 1:
            last = last[: max_chars - 1].rstrip()
        lines[-1] = last + "…"
    return lines


def title_tspans(lines: list[str], x: int, baseline: int, line_height: int) -> str:
    """Build <tspan> rows for a multi-line headline anchored at (x, baseline).

    The first line sits on ``baseline``; each subsequent line drops by
    ``line_height``. Coordinates are absolute so wrapping never shifts the logo
    or ribbon.
    """
    parts = []
    for i, line in enumerate(lines):
        y = baseline + i * line_height
        parts.append(
            f'<tspan x="{x}" y="{y}">{escape_xml(line)}</tspan>'
        )
    return "".join(parts)


# --------------------------------------------------------------------------- #
# Ribbon background splicing (single source of truth = assets/ribbon/social)
# --------------------------------------------------------------------------- #
def ribbon_inner_nodes(generated_svg: str) -> str | None:
    """Extract the inner ribbon nodes (field rect + stroke groups) from a
    generated background SVG, dropping its <?xml?>, outer <svg> wrapper,
    preserveAspectRatio, and <title>. Returns the inner markup, or ``None`` if
    the structure is unrecognized.
    """
    # Strip the XML prolog.
    text = re.sub(r"<\?xml[^>]*\?>", "", generated_svg)
    # Take everything between the opening <svg ...> and the closing </svg>.
    open_match = re.search(r"<svg\b[^>]*>", text)
    close_idx = text.rfind("</svg>")
    if not open_match or close_idx == -1:
        return None
    inner = text[open_match.end():close_idx]
    # Drop the decorative <title>…</title> (the card owns its own title).
    inner = re.sub(r"\s*<title>.*?</title>", "", inner, flags=re.DOTALL)
    return inner.strip("\n")


def splice_ribbon(svg: str, template: str, theme: str) -> str:
    """Replace the markup between the RIBBON:BEGIN/END markers with the freshly
    extracted ribbon nodes from the matching generated background, so renders
    track the kit. Falls back to the template's embedded static ribbon when the
    generated source is missing, unreadable, or unparseable.
    """
    begin = svg.find(RIBBON_BEGIN)
    end = svg.find(RIBBON_END)
    if begin == -1 or end == -1 or end < begin:
        return svg  # no markers — leave the template untouched

    src = os.path.join(RIBBON_DIR, f"{template}-{theme}.svg")
    try:
        with open(src, "r", encoding="utf-8") as fh:
            generated = fh.read()
        nodes = ribbon_inner_nodes(generated)
    except OSError:
        nodes = None
    if not nodes:
        return svg  # keep the embedded static ribbon

    replacement = (
        RIBBON_BEGIN + "\n" + textwrap.indent(nodes, "  ") + "\n  " + RIBBON_END
    )
    return svg[:begin] + replacement + svg[end + len(RIBBON_END):]


# --------------------------------------------------------------------------- #
# Rasterization
# --------------------------------------------------------------------------- #
def png_dimensions(path: str) -> tuple[int, int]:
    """Read width/height from a PNG IHDR chunk (no external deps)."""
    with open(path, "rb") as fh:
        header = fh.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def _force_dimensions(png_path: str, width: int, height: int) -> bool:
    """Force a PNG to exactly width x height using sips (in place)."""
    sips = shutil.which("sips")
    if not sips:
        return False
    res = subprocess.run(
        [sips, "-z", str(height), str(width), png_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return res.returncode == 0


def rasterize(svg_path: str, out_path: str, width: int, height: int) -> str:
    """Rasterize ``svg_path`` to ``out_path`` at exactly ``width`` x ``height``.

    Fallback chain (first available wins), mirroring the app-icon generator:
        1. qlmanage  (macOS QuickLook) — renders to a square thumbnail
        2. rsvg-convert
        3. inkscape
        4. cairosvg  (python module)
    Whatever the renderer produces is then forced to the exact target pixel
    dimensions with sips, so platform specs are met regardless of renderer.
    Returns the name of the renderer that succeeded.
    """
    # Primary: the shared cross-platform rasterizer (Windows / macOS / Linux) —
    # it tries rsvg-convert / cairosvg / inkscape / magick / a headless browser
    # (Edge on Windows, Chrome/Chromium on macOS+Linux) / qlmanage.
    import sys as _sys
    _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
    import _raster  # noqa: E402
    _used = _raster.rasterize(svg_path, out_path, width, height)
    if _used:
        return _used

    # Legacy in-tree fallback chain (retained for environments lacking _raster's tools).
    longest = max(width, height)
    tmpdir = tempfile.mkdtemp(prefix="hisd-card-")
    try:
        # 1) qlmanage -----------------------------------------------------
        qlmanage = shutil.which("qlmanage")
        if qlmanage:
            subprocess.run(
                [qlmanage, "-t", "-s", str(longest), "-o", tmpdir, svg_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            produced = os.path.join(tmpdir, os.path.basename(svg_path) + ".png")
            if os.path.exists(produced):
                shutil.move(produced, out_path)
                _force_dimensions(out_path, width, height)
                return "qlmanage"

        # 2) rsvg-convert -------------------------------------------------
        rsvg = shutil.which("rsvg-convert")
        if rsvg:
            with open(out_path, "wb") as fh:
                subprocess.run(
                    [rsvg, "-w", str(width), "-h", str(height), svg_path],
                    stdout=fh,
                    stderr=subprocess.DEVNULL,
                )
            if os.path.getsize(out_path) > 0:
                _force_dimensions(out_path, width, height)
                return "rsvg-convert"

        # 3) inkscape -----------------------------------------------------
        inkscape = shutil.which("inkscape")
        if inkscape:
            subprocess.run(
                [
                    inkscape,
                    svg_path,
                    "--export-type=png",
                    f"--export-filename={out_path}",
                    f"--export-width={width}",
                    f"--export-height={height}",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                _force_dimensions(out_path, width, height)
                return "inkscape"

        # 4) cairosvg (python) -------------------------------------------
        try:
            import cairosvg  # type: ignore

            cairosvg.svg2png(
                url=svg_path,
                write_to=out_path,
                output_width=width,
                output_height=height,
            )
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                _force_dimensions(out_path, width, height)
                return "cairosvg"
        except Exception:
            pass

        raise RuntimeError(
            "No SVG rasterizer available. Install one of: qlmanage (macOS), "
            "rsvg-convert, inkscape, or the cairosvg python module."
        )
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# --------------------------------------------------------------------------- #
# Card assembly
# --------------------------------------------------------------------------- #
def build_svg(template: str, title: str, subtitle: str, theme: str = "light") -> str:
    """Return the filled SVG markup as a string for the given template + theme."""
    spec = TEMPLATES[template]
    key = "svg_dark" if theme == "dark" else "svg"
    svg_path = os.path.join(HERE, spec[key])
    with open(svg_path, "r", encoding="utf-8") as fh:
        svg = fh.read()

    # Keep the ribbon background in sync with the kit: re-splice the field +
    # white strokes from the matching generated background. No-op (keeps the
    # embedded static ribbon) if that source is unavailable.
    svg = splice_ribbon(svg, template, theme)

    lines = wrap_words(
        title, spec["title_chars_per_line"], spec["title_max_lines"]
    )
    tspans = title_tspans(
        lines, spec["title_x"], spec["title_baseline"], spec["title_line_height"]
    )
    svg = svg.replace(TITLE_TOKEN, tspans)
    svg = svg.replace(SUBTITLE_TOKEN, escape_xml(subtitle))
    return svg


def make_card(
    template: str, title: str, subtitle: str, out: str, theme: str = "light"
) -> tuple[str, int, int]:
    """Render a card; return (renderer, width, height) of the output PNG."""
    if template not in TEMPLATES:
        raise SystemExit(
            f"unknown template {template!r}; choose from {', '.join(TEMPLATES)}"
        )
    if theme not in THEMES:
        raise SystemExit(
            f"unknown theme {theme!r}; choose from {', '.join(THEMES)}"
        )
    spec = TEMPLATES[template]
    svg = build_svg(template, title, subtitle, theme)

    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    fd, tmp_svg = tempfile.mkstemp(suffix=".svg", prefix="hisd-card-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(svg)
        renderer = rasterize(tmp_svg, out, spec["width"], spec["height"])
    finally:
        os.unlink(tmp_svg)

    w, h = png_dimensions(out)
    return renderer, w, h


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate an HISD-branded social-share card (PNG)."
    )
    parser.add_argument(
        "--template",
        required=True,
        choices=sorted(TEMPLATES.keys()),
        help="card format: og (1200x630), square (1080x1080), story (1080x1920)",
    )
    parser.add_argument("--title", required=True, help="headline text")
    parser.add_argument("--subtitle", default="", help="optional subhead text")
    parser.add_argument(
        "--theme",
        default="light",
        choices=THEMES,
        help="light (teal field, default) or dark (dark surface, brightened-teal accent)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="output PNG path (default: ./hisd-<template>[-<theme>].png)",
    )
    args = parser.parse_args(argv)

    if args.out:
        out = args.out
    elif args.theme == "dark":
        out = f"hisd-{args.template}-dark.png"
    else:
        out = f"hisd-{args.template}.png"
    renderer, w, h = make_card(
        args.template, args.title, args.subtitle, out, args.theme
    )

    spec = TEMPLATES[args.template]
    ok = (w, h) == (spec["width"], spec["height"])
    status = "OK" if ok else "DIMENSION MISMATCH"
    print(
        f"[{status}] {args.template} ({args.theme}): wrote {out} "
        f"({w}x{h}) via {renderer}",
        file=sys.stderr,
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
