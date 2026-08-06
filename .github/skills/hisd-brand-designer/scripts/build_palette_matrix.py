#!/usr/bin/env python3
"""build_palette_matrix.py — HISD expanded-palette reference generator.

Stdlib-only. Builds, for every official HISD brand color, the full derived
matrix of TINTS (toward #FFFFFF), TONES (toward #808080), and SHADES (toward
#000000) at two ladders:
    - 4% ladder:  4, 8, 12, ... , 96   (24 steps)
    - 10% ladder: 10, 20, ... , 90      (9 steps)
The 0% point is the exact, unchanged brand color (the anchor).

Color math is reused verbatim from build_tokens.py (hx / xh / mix) so the
derived hexes match the rest of the system exactly. Mixing is sRGB linear on the
8-bit channels (matching CSS color-mix(in srgb, ...)).

For each entry we compute:
  - hex, rgb
  - cmyk via the standard naive conversion (whole-percent), see _cmyk()
  - name + name_source via pull_color_names (color-name.com, cached; nearest-css
    fallback when offline)
  - pantone: the EXACT guide Pantone ONLY for the 0% base anchors (from
    BRAND_META). For every derived mix pantone is null — Pantone cannot be honestly
    computed from a screen mix; it must be bridged via a Pantone Color Bridge.

Outputs (in ../assets/):
  palette-matrix.json    machine-readable: list of entries
  palette-reference.md   human-readable tables grouped by base, then by kind

Run:  python3 build_palette_matrix.py [--offline] [--no-amber]
The color-name cache (assets/.color-name-cache.json) makes the ~1000 lookups
fully resumable: re-run to finish anything color-name.com rate-limited.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))

sys.path.insert(0, HERE)
import pull_color_names as cn  # noqa: E402


def _load_brand():
    """Pull BRAND, BRAND_META, AMBER and the hx/xh/mix math out of build_tokens.py
    WITHOUT triggering its file-emitting build.

    build_tokens.py has no `if __name__ == "__main__"` guard — importing it runs
    the whole token build (writes files, runs the contrast gate, may sys.exit).
    To reuse its single source of truth and exact color math safely, we exec only
    the source PREFIX up to the first "Emit:" section in an isolated namespace.
    The constants and the pure hx/xh/mix functions all live in that prefix.
    """
    src_path = os.path.join(HERE, "build_tokens.py")
    with open(src_path) as f:
        src = f.read()
    marker = "# Emit: DTCG tokens.json"
    idx = src.find(marker)
    if idx == -1:
        raise RuntimeError("could not locate the build/emit boundary in "
                           "build_tokens.py; refusing to run its side effects")
    # Trim back to the start of that section's comment banner so we stop cleanly
    # before any file writes or the contrast gate.
    head = src.rfind("# ---", 0, idx)
    prefix = src[: head if head != -1 else idx]
    ns = {"__name__": "build_tokens_prefix", "__file__": src_path}
    exec(compile(prefix, src_path, "exec"), ns)  # noqa: S102 — trusted in-repo source
    return ns["BRAND"], ns["BRAND_META"], ns["AMBER"], ns["hx"], ns["xh"], ns["mix"]


BRAND, BRAND_META, AMBER, hx, xh, mix = _load_brand()

WHITE = "#FFFFFF"   # tint target
GRAY = "#808080"    # tone target (mid-gray)
BLACK = "#000000"   # shade target

# Step ladders (percent). 0 is the anchor and is emitted as kind="base".
LADDER_4 = list(range(4, 100, 4))    # 4,8,...,96  -> 24 steps
LADDER_10 = list(range(10, 100, 10))  # 10,...,90   -> 9 steps
KIND_TARGET = {"tint": WHITE, "tone": GRAY, "shade": BLACK}

# Official brand colors, in canonical order (the 10 from the guide + amber opt).
BASE_ORDER = ["teal", "dark-green", "light-green", "yellow", "purple",
              "blue", "red", "dark-grey", "light-grey", "off-white"]

PANTONE_MIX_NOTE = ("derived mix — no honest Pantone; bridge via a Pantone "
                    "Color Bridge guide from this hex/CMYK")


def _cmyk(hex_str):
    """Standard naive RGB->CMYK, each channel rounded to a whole percent.

    K = 1 - max(r,g,b)/255;  C = (1-r/255-K)/(1-K), etc.  Pure black -> 0,0,0,100.
    Returns [C, M, Y, K] as integers 0..100.
    """
    r, g, b = (v / 255.0 for v in hx(hex_str))
    k = 1 - max(r, g, b)
    if k >= 1.0:  # pure black: avoid divide-by-zero
        return [0, 0, 0, 100]
    c = (1 - r - k) / (1 - k)
    m = (1 - g - k) / (1 - k)
    y = (1 - b - k) / (1 - k)
    return [round(c * 100), round(m * 100), round(y * 100), round(k * 100)]


def _entry(base, kind, step, hex_str, *, pantone, cache, allow_network,
           cmyk_guide=None):
    # Only the main brand colors (the 0% anchors) get a human name, looked up from
    # color-name.com. Derived tints/tones/shades are systematic and identified by
    # base + kind + step, so they carry no name.
    if kind == "base":
        nm = cn.color_name(hex_str, allow_network=allow_network, cache=cache)
        name_val, name_src = nm["name"], nm["source"]
    else:
        name_val, name_src = None, None
    # Anchors use the authoritative guide CMYK (transcribed in BRAND_META); every
    # derived mix uses the standard naive screen conversion.
    cmyk = list(cmyk_guide) if (kind == "base" and cmyk_guide) else _cmyk(hex_str)
    e = {
        "base": base,
        "kind": kind,
        "step": step,
        "hex": hex_str.upper(),
        "rgb": list(hx(hex_str)),
        "cmyk": cmyk,
        "cmyk_source": "guide" if (kind == "base" and cmyk_guide) else "naive",
        "pantone": pantone,
        "name": name_val,
        "name_source": name_src,
    }
    if pantone is None and kind != "base":
        e["pantone_note"] = PANTONE_MIX_NOTE
    return e


def build_bases(include_amber=True):
    """Return ordered list of (base_name, hex, pantone, cmyk_guide)."""
    out = []
    for name in BASE_ORDER:
        meta = BRAND_META.get(name, {})
        out.append((name, BRAND[name], meta.get("pantone"), meta.get("cmyk")))
    if include_amber:
        # Amber is a non-brand harmonizer: no guide Pantone, no guide CMYK.
        out.append(("amber", AMBER, None, None))
    return out


def build_matrix(*, include_amber=True, allow_network=True, cache=None,
                 progress=None):
    entries = []
    for base, base_hex, pantone, cmyk_guide in build_bases(include_amber):
        # 0% anchor — the exact, unchanged brand color, carrying its guide Pantone
        # and guide CMYK.
        entries.append(_entry(base, "base", 0, base_hex, pantone=pantone,
                              cache=cache, allow_network=allow_network,
                              cmyk_guide=cmyk_guide))
        if progress:
            progress(base, "base", 0)
        for kind, target in KIND_TARGET.items():
            for ladder in (LADDER_4, LADDER_10):
                for step in ladder:
                    mixed = mix(base_hex, target, step / 100.0)
                    entries.append(_entry(base, kind, step, mixed, pantone=None,
                                          cache=cache, allow_network=allow_network))
                    if progress:
                        progress(base, kind, step)
    return entries


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------
HEADER = """# HISD expanded-palette reference

> **Generated by `build_palette_matrix.py` — do not edit by hand.**

These derived tint / tone / shade scales **extend** the HISD brand for digital UI
work — hover/active/disabled **states**, layered **surfaces**, hairline
**borders**, and any place where more steps are needed than the ten official
brand colors provide. They are produced by sRGB-linear mixing (the same `mix()`
used by `build_tokens.py`), so every hex here is consistent with the rest of the
design system.

**What is authoritative, and what is not:**

- The **official brand colors are unchanged.** Each appears here exactly once as
  the **0% anchor** (`kind: base`, `step: 0`) and is the only honest reference
  point. The derived scales radiate out from those anchors and never replace them.
- **Pantone and CMYK are authoritative only for the anchors** — transcribed from
  the HISD 2025 Brand Identity Guidelines (`BRAND_META` in `build_tokens.py`).
- For every **derived mix, `pantone` is `null` on purpose.** A Pantone match
  cannot be honestly computed from a screen mix; it must be **bridged** with a
  Pantone Color Bridge guide using the listed hex / CMYK. The CMYK shown for
  mixes is the standard naive screen conversion (process print starting point,
  not a guaranteed brand match).
- **Definitions:** *tint* mixes toward pure white `#FFFFFF`; *tone* mixes toward
  mid-gray `#808080`; *shade* mixes toward black `#000000`. Two ladders are
  provided per kind: a fine **4%** ladder (4–96) and a coarse **10%** ladder
  (10–90).
- **Color names:** only the **main brand colors** (the 0% anchors) are named, from
  color-name.com. Derived tints / tones / shades are systematic and are identified
  by base + kind + step rather than carrying their own names.

| Definition | Mix target |
| --- | --- |
| Tint | `#FFFFFF` (pure white) |
| Tone | `#808080` (mid-gray) |
| Shade | `#000000` (black) |
"""


def _fmt_rgb(rgb):
    return f"{rgb[0]}, {rgb[1]}, {rgb[2]}"


def _fmt_cmyk(cmyk):
    return f"{cmyk[0]}, {cmyk[1]}, {cmyk[2]}, {cmyk[3]}"


def _row(e):
    pan = e["pantone"] if e["pantone"] else "—"
    return (f"| {e['step']}% | `{e['hex']}` | {_fmt_rgb(e['rgb'])} | "
            f"{_fmt_cmyk(e['cmyk'])} | {pan} |")


def render_markdown(entries):
    by_base = {}
    for e in entries:
        by_base.setdefault(e["base"], []).append(e)

    lines = [HEADER]
    # Keep base ordering stable: declared order, amber last if present.
    order = [b for b in BASE_ORDER if b in by_base]
    if "amber" in by_base:
        order.append("amber")

    for base in order:
        items = by_base[base]
        anchor = next(e for e in items if e["kind"] == "base")
        lines.append("")
        title = base.replace("-", " ").title()
        if base == "amber":
            title += " (non-brand harmonizer)"
        lines.append(f"## {title}")
        lines.append("")
        pan = anchor["pantone"] if anchor["pantone"] else "— (no guide Pantone)"
        lines.append(
            f"**Anchor (0%, official brand color):** `{anchor['hex']}` · "
            f"RGB {_fmt_rgb(anchor['rgb'])} · CMYK {_fmt_cmyk(anchor['cmyk'])} · "
            f"Pantone {pan} · *{anchor['name']}* "
            f"(name via {anchor['name_source']})")
        lines.append("")
        lines.append("_Pantone/CMYK below are authoritative only for the 0% "
                     "anchor; derived rows need a Pantone Color Bridge._")

        for kind, label in (("tint", "Tints — toward #FFFFFF"),
                            ("tone", "Tones — toward #808080"),
                            ("shade", "Shades — toward #000000")):
            for ladder, lad_name in ((LADDER_4, "4% ladder"),
                                     (LADDER_10, "10% ladder")):
                rows = [e for e in items if e["kind"] == kind and e["step"] in ladder]
                rows.sort(key=lambda e: e["step"])
                if not rows:
                    continue
                lines.append("")
                lines.append(f"### {label} · {lad_name}")
                lines.append("")
                lines.append("| step | hex | RGB | CMYK | Pantone |")
                lines.append("| --- | --- | --- | --- | --- |")
                # Lead each kind/ladder section with the 0% anchor for context.
                lines.append(_row(anchor))
                for e in rows:
                    lines.append(_row(e))
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def _main(argv):
    allow_network = "--offline" not in argv and "-o" not in argv
    include_amber = "--no-amber" not in argv
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0

    os.makedirs(ASSETS, exist_ok=True)
    cache = cn.load_cache()
    cache_start = len(cache)

    total_planned = (len(BASE_ORDER) + (1 if include_amber else 0)) * (
        1 + 3 * (len(LADDER_4) + len(LADDER_10)))
    done = [0]

    def progress(base, kind, step):
        done[0] += 1
        # Periodically persist the cache so a long run is resumable on interrupt.
        if done[0] % 25 == 0:
            cn.save_cache(cache)
            sys.stderr.write(f"\r[build_palette_matrix] {done[0]}/{total_planned} "
                             f"({base} {kind} {step}%)   ")
            sys.stderr.flush()

    try:
        entries = build_matrix(include_amber=include_amber,
                               allow_network=allow_network, cache=cache,
                               progress=progress)
    finally:
        cn.save_cache(cache)
        sys.stderr.write("\n")

    # Write JSON.
    json_path = os.path.join(ASSETS, "palette-matrix.json")
    payload = {
        "$description": ("HISD expanded-palette reference — derived tint/tone/"
                         "shade scales that EXTEND the brand for digital UI. The "
                         "0% 'base' entries are the unchanged official brand "
                         "colors and the only honest Pantone/CMYK anchors; every "
                         "derived mix has pantone=null and must be bridged via a "
                         "Pantone Color Bridge. Generated by build_palette_matrix.py."),
        "definitions": {
            "tint": "mix base toward #FFFFFF (pure white)",
            "tone": "mix base toward #808080 (mid-gray)",
            "shade": "mix base toward #000000 (black)",
            "ladders": {"4pct": LADDER_4, "10pct": LADDER_10, "base": 0},
            "mixing": "sRGB linear on 8-bit channels (matches build_tokens.mix)",
        },
        "count": len(entries),
        "entries": entries,
    }
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=2)

    # Write Markdown.
    md_path = os.path.join(ASSETS, "palette-reference.md")
    with open(md_path, "w") as f:
        f.write(render_markdown(entries))

    # Report.
    from_cn = sum(1 for e in entries if e["name_source"] == "color-name.com")
    from_css = sum(1 for e in entries if e["name_source"] == "nearest-css")
    other = len(entries) - from_cn - from_css
    bases = sorted({e["base"] for e in entries})
    print(f"Wrote {len(entries)} entries to:")
    print(f"  - {json_path}")
    print(f"  - {md_path}")
    print(f"Bases ({len(bases)}): {', '.join(bases)}")
    print(f"Names: color-name.com={from_cn}  nearest-css={from_css}"
          + (f"  other={other}" if other else ""))
    print(f"Cache: {cache_start} -> {len(cache)} entries "
          f"({os.path.join(ASSETS, '.color-name-cache.json')})")
    if from_css:
        print("Note: some names used the nearest-css fallback (color-name.com "
              "unreachable / rate-limited). Re-run later to refresh from "
              "color-name.com — the cache makes it resumable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
