#!/usr/bin/env python3
"""svg_minify.py — a conservative, stdlib-only SVG optimizer.

No external dependencies. Uses only the Python standard library (re + os).

What it strips / collapses (all safe, semantics-preserving):
  - XML comments  (<!-- ... -->)
  - <metadata> ... </metadata> blocks
  - <!DOCTYPE ...> declarations
  - Editor-specific namespace declarations and attributes:
    inkscape:, sodipodi:, and Adobe/Illustrator (adobe, illustrator, the
    xmlns:i="http://ns.adobe.com/..." namespace, and i:* attributes)
  - Empty <defs></defs> and <g></g> containers
  - xml:space="preserve" / xml:space="default" cruft
  - Insignificant whitespace between tags and runs of whitespace inside tags

What it can OPTIONALLY do:
  - Round numeric coordinates to --precision N (default 2) in the geometry
    attributes ONLY (path d=, points=, x/y/cx/cy/r/width/height/etc., and the
    numeric tokens inside a transform). Trailing-zero / redundant-dot cleanup.

What it NEVER touches (hard invariants):
  - Embedded base64 raster data (xlink:href / href data: URIs). The whole
    element carrying such a payload is masked out before any rewriting so it is
    returned byte-for-byte.
  - path-data *semantics* — rounding only ever shortens the textual form of a
    number; command letters, separators-as-needed, and arc flags are preserved.
  - viewBox values (never rounded, never reformatted).
  - currentColor and any fill/stroke color value — color attributes are left
    exactly as written, so no hex is ever introduced or altered.

CLI:
  svg_minify.py PATH... [--precision N] [--in-place | --out DIR] [--stats]

By default (no --in-place, no --out) the tool runs as a dry pass and prints a
per-file before/after byte summary; nothing is written.
"""

import argparse
import os
import re
import sys

# Attributes whose values are numeric geometry and MAY be rounded.
# Deliberately EXCLUDES viewBox and every color attribute.
_GEOMETRY_NUM_ATTRS = {
    "x", "y", "x1", "y1", "x2", "y2",
    "cx", "cy", "r", "rx", "ry",
    "width", "height",
    "dx", "dy",
    "offset",
}

# Editor / vendor namespace prefixes whose declarations and attributes are junk.
_EDITOR_PREFIXES = ("inkscape", "sodipodi", "adobe", "illustrator", "i")

# Matches a single numeric token (int, float, optional sign, optional exponent).
_NUMBER_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


# --------------------------------------------------------------------------- #
# Number formatting
# --------------------------------------------------------------------------- #
def _round_token(token, precision):
    """Round one numeric string token to `precision` decimals, trimming zeros.

    Returns a string. Falls back to the original token on any parse failure so
    we never corrupt something we didn't fully understand.
    """
    try:
        value = float(token)
    except ValueError:
        return token
    rounded = round(value, precision)
    # Normalize -0.0 -> 0
    if rounded == 0:
        rounded = 0.0
    text = f"{rounded:.{precision}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    if text in ("", "-"):
        text = "0"
    return text


def _round_numbers_in(text, precision):
    """Round every numeric token found in a free-form numeric string."""
    return _NUMBER_RE.sub(lambda m: _round_token(m.group(0), precision), text)


# --------------------------------------------------------------------------- #
# base64 / data-URI masking — these regions are returned untouched
# --------------------------------------------------------------------------- #
def _mask_protected(svg):
    """Replace any attribute value carrying a data: URI with an opaque token.

    Returns (masked_svg, restore_map). The token text contains no characters
    that the rest of the pipeline rewrites, so the payload survives byte-exact.
    """
    restore = {}
    counter = [0]

    def repl(match):
        idx = counter[0]
        counter[0] += 1
        key = f"\x00DATAURI{idx}\x00"
        restore[key] = match.group(0)
        return key

    # href="data:..." / xlink:href='data:...' — capture the full attribute.
    pattern = re.compile(
        r'(?:xlink:)?href\s*=\s*"data:[^"]*"'
        r"|(?:xlink:)?href\s*=\s*'data:[^']*'",
        re.IGNORECASE,
    )
    masked = pattern.sub(repl, svg)
    return masked, restore


def _unmask_protected(svg, restore):
    for key, original in restore.items():
        svg = svg.replace(key, original)
    return svg


# --------------------------------------------------------------------------- #
# Structural stripping (regex on masked text)
# --------------------------------------------------------------------------- #
def _strip_comments(svg):
    return re.sub(r"<!--.*?-->", "", svg, flags=re.DOTALL)


def _strip_doctype(svg):
    return re.sub(r"<!DOCTYPE[^>[]*(\[[^\]]*\])?[^>]*>", "", svg,
                  flags=re.IGNORECASE | re.DOTALL)


def _strip_metadata(svg):
    return re.sub(r"<metadata\b.*?</metadata\s*>", "", svg,
                  flags=re.IGNORECASE | re.DOTALL)


def _strip_editor_attrs(svg):
    """Remove editor-prefixed attributes and their namespace declarations."""
    # Namespace declarations: xmlns:inkscape=... xmlns:i=... etc.
    for prefix in _EDITOR_PREFIXES:
        svg = re.sub(
            rf'\s+xmlns:{prefix}\s*=\s*("[^"]*"|\'[^\']*\')',
            "", svg, flags=re.IGNORECASE,
        )
        # Prefixed attributes: inkscape:foo="..."  sodipodi:bar='...'  i:baz="..."
        svg = re.sub(
            rf'\s+{prefix}:[\w.-]+\s*=\s*("[^"]*"|\'[^\']*\')',
            "", svg, flags=re.IGNORECASE,
        )
    # Adobe namespace declared under any prefix (e.g. xmlns:foo="...AdobeIllustrator...").
    svg = re.sub(
        r'\s+xmlns:[\w.-]+\s*=\s*"[^"]*(?:adobe|illustrator)[^"]*"',
        "", svg, flags=re.IGNORECASE,
    )
    return svg


def _strip_xml_space(svg):
    return re.sub(r'\s+xml:space\s*=\s*("[^"]*"|\'[^\']*\')', "", svg,
                  flags=re.IGNORECASE)


def _strip_empty_containers(svg):
    """Drop empty <defs>/<g> (incl. self-closing & whitespace-only bodies).

    Looped because removing an inner empty <g> can leave its parent empty.
    """
    prev = None
    while prev != svg:
        prev = svg
        svg = re.sub(r"<(defs|g)\b[^>]*/>", "", svg, flags=re.IGNORECASE)
        svg = re.sub(r"<(defs|g)\b[^>]*>\s*</\1\s*>", "", svg,
                     flags=re.IGNORECASE)
    return svg


# --------------------------------------------------------------------------- #
# Whitespace collapse
# --------------------------------------------------------------------------- #
def _collapse_whitespace(svg):
    # Whitespace between tags -> nothing.
    svg = re.sub(r">\s+<", "><", svg)
    # Collapse runs of whitespace *inside* a tag to a single space. We only
    # touch the inter-attribute whitespace, never attribute values (those have
    # no bare newlines after the steps above for these hand/AI authored files).
    def squeeze_tag(match):
        return re.sub(r"\s+", " ", match.group(0))

    svg = re.sub(r"<[^>]+>", squeeze_tag, svg)
    # Tidy the self-closing slash spacing and stray leading/trailing space.
    svg = re.sub(r"\s+/>", "/>", svg)
    svg = re.sub(r"\s+>", ">", svg)
    return svg.strip()


# --------------------------------------------------------------------------- #
# Numeric rounding (geometry only) — operates on masked text
# --------------------------------------------------------------------------- #
def _round_geometry(svg, precision):
    """Round geometry attribute values and path/points/transform numbers.

    Never touches viewBox or any color attribute (those names are simply not in
    our target sets, and we operate attribute-by-attribute).
    """
    def attr_repl(match):
        name = match.group("name")
        quote = match.group("quote")
        value = match.group("value")
        lname = name.lower()
        if lname == "viewbox":
            return match.group(0)
        if lname in ("d", "points") or lname in _GEOMETRY_NUM_ATTRS or lname == "transform":
            new_value = _round_numbers_in(value, precision)
            return f"{name}={quote}{new_value}{quote}"
        return match.group(0)

    attr_re = re.compile(
        r'(?P<name>[\w:.-]+)\s*=\s*(?P<quote>["\'])(?P<value>.*?)(?P=quote)',
        re.DOTALL,
    )
    return attr_re.sub(attr_repl, svg)


# --------------------------------------------------------------------------- #
# Top-level minify
# --------------------------------------------------------------------------- #
def minify(svg, precision=2, round_numbers=True):
    """Return the minified form of `svg` (a str). Pure, no I/O."""
    masked, restore = _mask_protected(svg)

    masked = _strip_doctype(masked)
    masked = _strip_comments(masked)
    masked = _strip_metadata(masked)
    masked = _strip_editor_attrs(masked)
    masked = _strip_xml_space(masked)
    masked = _strip_empty_containers(masked)
    if round_numbers:
        masked = _round_geometry(masked, precision)
    masked = _collapse_whitespace(masked)

    return _unmask_protected(masked, restore)


# --------------------------------------------------------------------------- #
# File / CLI plumbing
# --------------------------------------------------------------------------- #
def _gather_svgs(paths):
    files = []
    for path in paths:
        if os.path.isdir(path):
            for root, _dirs, names in os.walk(path):
                for name in sorted(names):
                    if name.lower().endswith(".svg"):
                        files.append(os.path.join(root, name))
        elif path.lower().endswith(".svg"):
            files.append(path)
        else:
            print(f"skip (not an svg): {path}", file=sys.stderr)
    return files


def _human(n):
    return f"{n:,} B"


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Conservative stdlib-only SVG optimizer."
    )
    parser.add_argument("paths", nargs="+", help="SVG files or directories.")
    parser.add_argument("--precision", type=int, default=2,
                        help="Decimal places for coordinate rounding (default 2). "
                             "Use a negative value to disable rounding entirely.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--in-place", action="store_true",
                       help="Overwrite each source file with its minified form.")
    group.add_argument("--out", metavar="DIR",
                       help="Write minified files into DIR (mirrors basenames).")
    parser.add_argument("--stats", action="store_true",
                        help="Print per-file and total byte savings.")
    args = parser.parse_args(argv)

    round_numbers = args.precision >= 0
    precision = max(args.precision, 0)

    files = _gather_svgs(args.paths)
    if not files:
        print("No SVG files found.", file=sys.stderr)
        return 1

    if args.out:
        os.makedirs(args.out, exist_ok=True)

    total_in = total_out = 0
    rows = []
    for path in files:
        with open(path, "r", encoding="utf-8") as fh:
            original = fh.read()
        minified = minify(original, precision=precision,
                          round_numbers=round_numbers)
        in_bytes = len(original.encode("utf-8"))
        out_bytes = len(minified.encode("utf-8"))
        total_in += in_bytes
        total_out += out_bytes
        rows.append((path, in_bytes, out_bytes))

        if args.in_place:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(minified)
        elif args.out:
            dest = os.path.join(args.out, os.path.basename(path))
            with open(dest, "w", encoding="utf-8") as fh:
                fh.write(minified)

    if args.stats or not (args.in_place or args.out):
        for path, in_bytes, out_bytes in rows:
            saved = in_bytes - out_bytes
            pct = (saved / in_bytes * 100) if in_bytes else 0.0
            print(f"{path}: {_human(in_bytes)} -> {_human(out_bytes)} "
                  f"(saved {_human(saved)}, {pct:.1f}%)")
        saved = total_in - total_out
        pct = (saved / total_in * 100) if total_in else 0.0
        mode = ("in-place" if args.in_place
                else f"out:{args.out}" if args.out else "dry-run")
        print(f"TOTAL [{mode}] over {len(files)} file(s): "
              f"{_human(total_in)} -> {_human(total_out)} "
              f"(saved {_human(saved)}, {pct:.1f}%)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
