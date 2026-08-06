#!/usr/bin/env python3
"""pull_material_icons.py — vendor Material Symbols into the HISD icon set.

Pulls icons from the canonical Google Material Design Icons GitHub repository
(NEVER fonts.google.com) and normalizes each one into a clean, theme-ready
``currentColor`` SVG that the HISD design system can paint through its
``--color-*`` tokens.

House style — matching the School Navigator staging manager:

    Material Symbols **Rounded**, **FILL=1**, **weight 500**, **24px**.

Raw SVG URL pattern (per icon ``name``)::

    https://raw.githubusercontent.com/google/material-design-icons/master/
        symbols/web/{name}/materialsymbolsrounded/{name}_wght500fill1_24px.svg

with fallbacks ``{name}_fill1_24px.svg`` then ``{name}_24px.svg`` if a
variant 404s. These sources use ``viewBox="0 -960 960 960"`` and a single
``<path>``.

Normalization keeps the viewBox, drops ``width``/``height`` so the glyph
scales, and forces the path to inherit color (``fill="currentColor"``) with
no hardcoded hex/rgb/hsl anywhere — so a vendored icon recolors with its
container exactly like the rest of the design system.

CLI
---
    pull_material_icons.py add <name> [<name> ...]
        Fetch each icon (FILL1 wght500 variant, then fallbacks), normalize,
        write assets/icons/<name>.svg, and upsert it into the manifest.

    pull_material_icons.py sync
        Re-pull every icon already recorded in the manifest.

Stdlib only (urllib). Polite by default: a small delay between fetches,
retries with backoff, clear logging, and an explicit message when a name
does not exist upstream.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

# --------------------------------------------------------------------------
# Paths & constants
# --------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
SKILL_ROOT = HERE.parent  # .skills/design/hisd-brand-designer
ICONS_DIR = SKILL_ROOT / "assets" / "icons"
MANIFEST_PATH = ICONS_DIR / "manifest.json"

RAW_BASE = (
    "https://raw.githubusercontent.com/google/material-design-icons/master/"
    "symbols/web/{name}/materialsymbolsrounded/{filename}"
)
# Variants tried in order. The first is the house style (Rounded, FILL=1,
# weight 500, 24px); the rest are graceful fallbacks for icons that don't
# ship every weight/fill permutation.
VARIANTS = (
    "{name}_wght500fill1_24px.svg",
    "{name}_fill1_24px.svg",
    "{name}_24px.svg",
)

# Politeness / resilience knobs.
FETCH_DELAY_SECONDS = 0.4   # pause between successful icon fetches
RETRY_COUNT = 3             # attempts per URL before giving up on a variant
RETRY_BACKOFF_SECONDS = 1.5
HTTP_TIMEOUT = 30
USER_AGENT = "hisd-brand-designer-icon-pipeline/1.0 (+stdlib urllib)"

NAME_RE = re.compile(r"^[a-z0-9_]+$")


# --------------------------------------------------------------------------
# Networking
# --------------------------------------------------------------------------
def _fetch(url: str) -> Optional[str]:
    """GET ``url`` with retries. Returns text, or None on a clean 404.

    Raises on network errors that aren't a definitive "not found" so the
    caller can surface a real failure instead of silently dropping an icon.
    """
    last_exc: Optional[Exception] = None
    for attempt in range(1, RETRY_COUNT + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None  # variant genuinely doesn't exist; try next
            last_exc = exc
            print(f"    ! HTTP {exc.code} (attempt {attempt}/{RETRY_COUNT}) {url}")
        except urllib.error.URLError as exc:
            last_exc = exc
            print(f"    ! network error (attempt {attempt}/{RETRY_COUNT}): {exc.reason}")
        except Exception as exc:  # pragma: no cover - defensive
            last_exc = exc
            print(f"    ! unexpected error (attempt {attempt}/{RETRY_COUNT}): {exc}")
        if attempt < RETRY_COUNT:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
    if last_exc is not None:
        raise last_exc
    return None


def fetch_icon_svg(name: str) -> Optional[tuple[str, str, str]]:
    """Fetch the best available variant for ``name``.

    Returns ``(raw_svg, variant_filename, url)`` or None if every variant
    404s (i.e. the icon name does not exist upstream).
    """
    for variant in VARIANTS:
        filename = variant.format(name=name)
        url = RAW_BASE.format(name=name, filename=filename)
        body = _fetch(url)
        if body is not None:
            return body, filename, url
    return None


# --------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------
def _local(tag: str) -> str:
    """Strip an XML namespace from a tag/attribute name."""
    if tag.startswith("{") and "}" in tag:
        return tag.split("}", 1)[1]
    if ":" in tag:
        return tag.split(":", 1)[1]
    return tag


def normalize_svg(raw_svg: str, name: str) -> str:
    """Turn a raw Material Symbols SVG into a clean currentColor icon.

    - Keeps the source viewBox (``0 -960 960 960``).
    - Strips ``width``/``height`` so the glyph scales to its box.
    - Removes the xmlns/namespace noise.
    - Forces every drawing element to ``fill="currentColor"`` and removes any
      hardcoded fill so there is no hex/rgb/hsl anywhere.
    - Decorative-first: ``aria-hidden="true"`` on the root (consumers add
      role/aria-label at the call site when the icon carries meaning).
    """
    root = ET.fromstring(raw_svg.strip())
    if _local(root.tag) != "svg":
        raise ValueError(f"{name}: source root is <{_local(root.tag)}>, not <svg>")

    view_box = None
    for key, value in root.attrib.items():
        if _local(key) == "viewBox":
            view_box = value
            break
    if not view_box:
        raise ValueError(f"{name}: source SVG has no viewBox")

    # Collect drawing children with namespaces stripped, color forced to
    # inherit. We rebuild the markup by hand so the output is deterministic
    # and free of ET's ns0: prefixes.
    def render(el: ET.Element) -> str:
        tag = _local(el.tag)
        attrs: dict[str, str] = {}
        for k, v in el.attrib.items():
            lk = _local(k)
            if lk in ("xmlns",) or lk.startswith("xmlns"):
                continue
            if lk == "fill":
                continue  # drop hardcoded fill; we set currentColor below
            attrs[lk] = v
        # Force paint to inherit. Material glyphs are solid fills.
        attrs["fill"] = "currentColor"
        attr_str = "".join(f' {k}="{v}"' for k, v in attrs.items())
        children = "".join(render(c) for c in list(el))
        text = (el.text or "").strip()
        if children or text:
            return f"<{tag}{attr_str}>{text}{children}</{tag}>"
        return f"<{tag}{attr_str}/>"

    body = "".join(render(child) for child in list(root))
    if not body:
        raise ValueError(f"{name}: source SVG has no drawable child elements")

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" '
        f'fill="currentColor" aria-hidden="true">{body}</svg>'
    )
    # Final guard: no hardcoded colors slipped through.
    _assert_currentcolor(svg, name)
    return svg + "\n"


_HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
_RGBHSL_RE = re.compile(r"\b(rgb|rgba|hsl|hsla)\s*\(", re.I)


def _assert_currentcolor(svg: str, name: str) -> None:
    if _HEX_RE.search(svg):
        raise ValueError(f"{name}: normalized SVG still contains a hex color")
    if _RGBHSL_RE.search(svg):
        raise ValueError(f"{name}: normalized SVG still contains an rgb()/hsl() color")
    if "currentColor" not in svg:
        raise ValueError(f"{name}: normalized SVG lost its currentColor paint")
    # Validate it parses as XML.
    ET.fromstring(svg)


# --------------------------------------------------------------------------
# Manifest
# --------------------------------------------------------------------------
def load_manifest() -> list[dict]:
    if MANIFEST_PATH.exists():
        try:
            data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError as exc:
            print(f"! manifest is not valid JSON ({exc}); starting fresh")
    return []


def save_manifest(entries: list[dict]) -> None:
    entries = sorted(entries, key=lambda e: e["name"])
    MANIFEST_PATH.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def upsert(entries: list[dict], record: dict) -> list[dict]:
    out = [e for e in entries if e.get("name") != record["name"]]
    out.append(record)
    return out


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------
def process_icon(name: str, entries: list[dict]) -> tuple[str, Optional[dict]]:
    """Fetch + normalize + write one icon. Returns (status, record)."""
    print(f"  - {name} ...")
    try:
        fetched = fetch_icon_svg(name)
    except Exception as exc:
        print(f"    x network failure for '{name}': {exc}")
        return "error", None
    if fetched is None:
        print(
            f"    x '{name}' not found upstream — no FILL1/fill1/plain 24px variant "
            f"exists in google/material-design-icons. Skipping."
        )
        return "missing", None

    raw_svg, variant, url = fetched
    try:
        normalized = normalize_svg(raw_svg, name)
    except Exception as exc:
        print(f"    x failed to normalize '{name}': {exc}")
        return "error", None

    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    (ICONS_DIR / f"{name}.svg").write_text(normalized, encoding="utf-8")
    record = {"name": name, "source_variant": variant, "url": url}
    print(f"    ok ({variant})")
    return "ok", record


def cmd_add(names: list[str]) -> int:
    invalid = [n for n in names if not NAME_RE.match(n)]
    if invalid:
        print(f"! invalid icon name(s) (use lowercase a-z, 0-9, _): {', '.join(invalid)}")
        return 2

    entries = load_manifest()
    added: list[str] = []
    missing: list[str] = []
    errors: list[str] = []

    # De-dupe while preserving order.
    queue = list(dict.fromkeys(names))
    print(f"Adding {len(queue)} icon(s) to {ICONS_DIR.relative_to(SKILL_ROOT)} ...")
    for i, name in enumerate(queue):
        status, record = process_icon(name, entries)
        if status == "ok" and record is not None:
            entries = upsert(entries, record)
            added.append(name)
        elif status == "missing":
            missing.append(name)
        else:
            errors.append(name)
        if i < len(queue) - 1:
            time.sleep(FETCH_DELAY_SECONDS)

    save_manifest(entries)
    print("\nSummary")
    print(f"  added/updated : {len(added)}  {added}")
    if missing:
        print(f"  not found     : {len(missing)}  {missing}")
    if errors:
        print(f"  errors        : {len(errors)}  {errors}")
    print(f"  manifest total: {len(entries)} -> {MANIFEST_PATH.relative_to(SKILL_ROOT)}")
    return 1 if errors else 0


def cmd_sync() -> int:
    entries = load_manifest()
    if not entries:
        print("Manifest is empty; nothing to sync. Use 'add <name>...' first.")
        return 0
    names = [e["name"] for e in entries]
    print(f"Syncing {len(names)} icon(s) from manifest ...")
    refreshed: list[str] = []
    missing: list[str] = []
    errors: list[str] = []
    for i, name in enumerate(names):
        status, record = process_icon(name, entries)
        if status == "ok" and record is not None:
            entries = upsert(entries, record)
            refreshed.append(name)
        elif status == "missing":
            missing.append(name)
        else:
            errors.append(name)
        if i < len(names) - 1:
            time.sleep(FETCH_DELAY_SECONDS)
    save_manifest(entries)
    print("\nSummary")
    print(f"  refreshed : {len(refreshed)}")
    if missing:
        print(f"  not found : {len(missing)}  {missing}")
    if errors:
        print(f"  errors    : {len(errors)}  {errors}")
    return 1 if errors else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pull_material_icons.py",
        description="Vendor Material Symbols (Rounded, FILL=1, weight 500, 24px) "
        "from google/material-design-icons into the HISD icon set.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    add_p = sub.add_parser("add", help="fetch and vendor one or more icons by name")
    add_p.add_argument("names", nargs="+", metavar="name", help="Material Symbols name(s)")

    sub.add_parser("sync", help="re-pull every icon listed in the manifest")
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "add":
        return cmd_add(args.names)
    if args.command == "sync":
        return cmd_sync()
    return 2


if __name__ == "__main__":
    sys.exit(main())
