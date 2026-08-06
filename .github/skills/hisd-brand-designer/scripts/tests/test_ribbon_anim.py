"""Guards for the animated HISD Ribbon (rung 1 CSS device + rung 2 WebGL2 tier).

These are pure static-content assertions over the shipped source — no script is
driven, nothing is mutated, no sandbox is built. They lock in three invariants
that the unification deliberately established and that are easy to silently
regress later:

  1. COLOR PROVENANCE. Every brand color in the WebGL tier flows from tokens.js
     (the documented canonical fallbacks live there and ONLY there). No raw
     6-digit hex may leak into any other ribbon-gl *.js / *.glsl source —
     they must read window.HISD_TOKENS / CSS custom properties instead.

  2. MOTION + FORCED-COLORS GUARDS. ribbon.css drives @keyframes loops. A zeroed
     --duration-* token does NOT halt a running loop, so the reduced-motion
     block must carry an explicit `animation: none`; and forced-colors must have
     its own block (the gradient device would otherwise vanish on the system
     canvas).

  3. CANONICAL-STROKE PROVENANCE. The Ribbon's white "bayou current" strokes now
     live in the locked line kit (ribbon-lines.js — the single source of truth,
     exporting `generate` + `ribbonLine`). core.js imports that kit and rasterizes
     the resolved lines to the texture the shader flow-warps over the solid field.
     It must NOT load an external raster (no '.png') or fetch any asset — the
     strokes are EXACTLY the kit's canonical lines, never a drifted copy.

Paths resolve relative to this test file via conftest, so the suite passes from
any working directory.
"""
import os
import re

from conftest import SKILL

# --- canonical paths for the ribbon, all anchored at the skill root -----------
RIBBON_GL = os.path.join(SKILL, "framework", "ribbon-gl")
RIBBON_GL_TOKENS = os.path.join(RIBBON_GL, "tokens.js")
RIBBON_GL_CORE = os.path.join(RIBBON_GL, "core.js")
RIBBON_GL_LINES = os.path.join(RIBBON_GL, "ribbon-lines.js")
RIBBON_CSS = os.path.join(SKILL, "components", "ribbon.css")

# A raw 6-digit hex color literal: #RRGGBB.
RAW_HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}")

# The documented canonical fallback hex that MAY appear as a last-resort default
# in source other than tokens.js — currently just core.js's FIELD_FALLBACK (the
# canonical teal field, used only when no token / host background / opts.field
# resolves) plus pure white (the stroke color). Any OTHER raw hex is a leak.
ALLOWED_FALLBACK_HEX = {"#00a3af", "#ffffff"}


def _read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def _walk_source(root, exts):
    """Yield every file under `root` whose name ends with one of `exts`."""
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(exts):
                yield os.path.join(dirpath, fn)


# --- 1. color provenance: no raw brand hex outside tokens.js ------------------
def test_ribbon_gl_dir_exists():
    """Sanity: the framework dir and the files we guard are actually present, so
    a path typo can never make the other guards pass vacuously."""
    assert os.path.isdir(RIBBON_GL), f"missing ribbon-gl dir: {RIBBON_GL}"
    assert os.path.isfile(RIBBON_GL_TOKENS), "missing ribbon-gl/tokens.js"
    assert os.path.isfile(RIBBON_GL_CORE), "missing ribbon-gl/core.js"
    assert os.path.isfile(RIBBON_CSS), "missing components/ribbon.css"


def test_no_raw_brand_hex_outside_tokens():
    """No raw 6-digit hex in any ribbon-gl *.js / *.glsl EXCEPT tokens.js, which
    legitimately documents the canonical fallback palette.

    Walk the tree, skip tokens.js, and collect every offending file:line:text so
    a failure names exactly where the leak is."""
    offenders = []
    for path in _walk_source(RIBBON_GL, (".js", ".glsl")):
        if os.path.abspath(path) == os.path.abspath(RIBBON_GL_TOKENS):
            continue  # the one place the full canonical fallback palette lives
        for lineno, line in enumerate(_read(path).splitlines(), start=1):
            hits = [h for h in RAW_HEX_RE.findall(line)
                    if h.lower() not in ALLOWED_FALLBACK_HEX]
            if hits:
                rel = os.path.relpath(path, RIBBON_GL)
                offenders.append(f"{rel}:{lineno}: {line.strip()}")
    assert not offenders, (
        "raw 6-digit brand hex found outside tokens.js — brand color must come "
        "from tokens (window.HISD_TOKENS / CSS custom properties):\n  "
        + "\n  ".join(offenders)
    )


def test_tokens_js_is_the_one_hex_holder():
    """Positive control: tokens.js DOES carry raw hex (the canonical fallbacks).

    If this stops being true the palette moved, and the skip in the guard above
    would be silently protecting nothing — so assert the holder still holds."""
    assert RAW_HEX_RE.search(_read(RIBBON_GL_TOKENS)), (
        "tokens.js no longer contains the canonical fallback hex — the "
        "no-raw-hex guard's tokens.js exemption is now vacuous; re-point it."
    )


# --- 2. ribbon.css motion + forced-colors guards ------------------------------
def test_ribbon_css_reduced_motion_kills_animation():
    """ribbon.css must contain BOTH a reduced-motion block AND `animation: none`.

    A @keyframes loop keeps running even when --duration-* is zeroed, so the
    explicit kill is mandatory — token-zeroing alone cannot stop it."""
    css = _read(RIBBON_CSS)
    assert "@media (prefers-reduced-motion: reduce)" in css, (
        "ribbon.css is missing its @media (prefers-reduced-motion: reduce) block"
    )
    assert re.search(r"animation:\s*none", css), (
        "ribbon.css has no `animation: none` — a zeroed --duration-* does NOT "
        "halt a running @keyframes loop; the explicit kill block is required"
    )


def test_ribbon_css_has_forced_colors_block():
    """ribbon.css must guard forced-colors (Windows High Contrast): the gradient
    device would flatten to the system canvas and vanish without its own block."""
    css = _read(RIBBON_CSS)
    assert "@media (forced-colors: active)" in css, (
        "ribbon.css is missing its @media (forced-colors: active) block"
    )


# --- 3. core.js canonical-stroke provenance -----------------------------------
def test_core_js_uses_canonical_mask_path():
    """The canonical white "bayou current" strokes now live in the locked line kit
    (ribbon-lines.js), NOT inline in core.js. Assert that (a) ribbon-lines.js exists
    and is the kit (exports `generate` + has `ribbonLine`), (b) core.js imports it,
    and (c) core.js still rasterizes (never loads/fetches) the mask — no '.png',
    no fetch( — so the strokes are EXACTLY the kit's lines, never a drifted copy."""
    # (a) the locked line kit is present and really is the kit.
    assert os.path.isfile(RIBBON_GL_LINES), (
        "missing ribbon-gl/ribbon-lines.js — the canonical stroke set's single "
        "source of truth is gone"
    )
    lines_src = _read(RIBBON_GL_LINES)
    assert "export function generate" in lines_src, (
        "ribbon-lines.js no longer exports `generate` — the deterministic stroke "
        "generator (single source of truth) is broken"
    )
    assert "ribbonLine" in lines_src, (
        "ribbon-lines.js no longer defines `ribbonLine` — the edge-to-edge stroke "
        "primitive (single source of truth) is broken"
    )

    # (b) core.js sources its strokes FROM the locked kit.
    core = _read(RIBBON_GL_CORE)
    assert "./ribbon-lines.js" in core, (
        "core.js no longer imports './ribbon-lines.js' — the canonical strokes must "
        "come from the locked line kit, not be re-authored inline"
    )

    # (c) core.js still rasterizes the mask itself — never an external asset/fetch.
    assert ".png" not in core, (
        "core.js references a '.png' — the mask must be rasterized from the line "
        "kit's canonical lines, not loaded as an external raster asset"
    )
    assert "fetch(" not in core, (
        "core.js calls fetch( — the mask must come from the line kit's canonical "
        "lines, never an external network/asset fetch"
    )
