#!/usr/bin/env python3
"""generate_app_icons.py — build a favicon + app-icon set from an HISD brand mark.

Takes one clean, square-ish HISD brand mark (the teal skyline icon) and emits
everything a web app needs to look like HISD in a browser tab, on a phone home
screen, and in an installable PWA:

  PNGs            16, 32, 48 (classic favicons), 180 (apple-touch),
                  192 + 512 (PWA manifest icons)
  maskable 512    the mark centered with safe padding on a solid brand-teal
                  field, sized for Android's adaptive-icon mask (the OS may
                  crop up to ~10% off every edge, so the glyph stays well
                  inside a safe zone)
  favicon.svg     a passthrough of the source SVG (crisp at any size)
  site.webmanifest the PWA manifest snippet wiring up the icons
  head-snippet.html the <link> tags to drop into <head>
  README.md       what each file is and how to use it

Rasterizer strategy (this machine is macOS, so Quick Look leads):

  1. qlmanage -t -s SIZE -o OUTDIR FILE.svg   (preferred; ships with macOS)
  2. rsvg-convert                              (librsvg, if installed)
  3. cairosvg                                  (Python lib, if installed)
  4. chrome/chromium --headless --screenshot   (last resort)

The first backend that actually produces a correctly-sized, non-blank PNG wins,
and the whole run sticks to it. If none work, we print a clear message naming
what we tried and exit non-zero.

qlmanage note: `-s SIZE` always renders onto a SIZE x SIZE *square* canvas and
fits the artwork inside it preserving aspect ratio. That is exactly what we want
for an app icon, and it is why a non-square source mark (the skyline is
1920x1258) still yields perfectly square output PNGs.

Verification is not cosmetic: after generating, we re-open every PNG, parse its
real pixel dimensions straight out of the PNG IHDR header with the stdlib
`struct` module (no Pillow, no trusting the rasterizer's word), and assert each
matches the size we asked for and is non-blank (file is more than a few hundred
bytes). A mismatch fails the run.

Stdlib only. Usage:

    python3 generate_app_icons.py            # generate + verify, default paths
    python3 generate_app_icons.py --source PATH.svg
    python3 generate_app_icons.py --out DIR
"""
import argparse
import os
import shutil
import struct
import subprocess
import sys
import tempfile

# --- paths & brand constants -------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(SKILL_ROOT, "assets")

# The cleanest square-ish, single-color, standalone HISD mark. The teal skyline
# icon is a single path filled with the leading brand teal and rasterizes
# crisply on its own — no lettering to turn to mud at 16px (the vertical
# submarks carry "HISD" wordmark below the skyline, which is unreadable as a
# favicon). Confirmed by test-rendering both at 512.
DEFAULT_SOURCE = os.path.join(ASSETS, "logos", "icon", "teal.svg")
DEFAULT_OUT = os.path.join(ASSETS, "app-icons")

# Canonical HISD brand teal — "Teal #00A3AF leads" per the design system, and
# the exact fill used inside icon/teal.svg.
BRAND_TEAL = "#00A3AF"

# Standard PNGs (transparent field), name -> pixel size.
PNG_TARGETS = {
    "favicon-16.png": 16,
    "favicon-32.png": 32,
    "favicon-48.png": 48,
    "apple-touch-icon.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
}

# The maskable icon gets its own size + filename (solid teal field, padded).
MASKABLE_NAME = "icon-512-maskable.png"
MASKABLE_SIZE = 512
# Fraction of the canvas, per side, kept clear of artwork so Android's adaptive
# mask can crop without clipping the glyph. The mark occupies the inner square.
MASKABLE_PADDING = 0.18

PNG_SIG = b"\x89PNG\r\n\x1a\n"
MIN_PNG_BYTES = 300  # "more than a few hundred bytes" => non-blank


# --- PNG IHDR reader (stdlib struct, no image libs) --------------------------

def read_png_size(path):
    """Return (width, height) read straight from the PNG IHDR chunk.

    The PNG layout is fixed: 8-byte signature, then the first chunk is always
    IHDR — a 4-byte length, the literal b"IHDR", then width and height as
    big-endian uint32. We validate the signature and the chunk type so a
    truncated or non-PNG file raises instead of returning garbage.
    """
    with open(path, "rb") as fh:
        header = fh.read(24)
    if len(header) < 24:
        raise ValueError(f"{path}: file too short to be a PNG")
    if header[:8] != PNG_SIG:
        raise ValueError(f"{path}: bad PNG signature")
    if header[12:16] != b"IHDR":
        raise ValueError(f"{path}: first chunk is not IHDR")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


# --- rasterizer backends -----------------------------------------------------
#
# Each backend renders SOURCE_SVG to a single square PNG of exactly `size`
# pixels at `dest`. It returns True on a plausible success (file exists), and
# the caller does the authoritative IHDR check. A backend that isn't installed
# returns None from its availability probe so we skip it cleanly.

def _have(cmd):
    return shutil.which(cmd) is not None


def _render_qlmanage(src_svg, dest, size):
    """macOS Quick Look. Renders onto a square `size` canvas, art fit inside."""
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run(
            ["qlmanage", "-t", "-s", str(size), "-o", tmp, src_svg],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        # qlmanage writes "<basename>.png" into the output dir; it can return 0
        # even on partial failures, so we look for the file rather than trust
        # the exit code.
        produced = os.path.join(tmp, os.path.basename(src_svg) + ".png")
        if not os.path.exists(produced):
            # Fall back to scanning the dir for any .png it dropped.
            pngs = [f for f in os.listdir(tmp) if f.lower().endswith(".png")]
            if not pngs:
                return False
            produced = os.path.join(tmp, pngs[0])
        shutil.copyfile(produced, dest)
    return os.path.exists(dest)


def _render_rsvg(src_svg, dest, size):
    """librsvg. Forces a square output box matching the icon size."""
    proc = subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size),
         "-a",  # keep aspect ratio, letterbox into the square
         "-o", dest, src_svg],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc.returncode == 0 and os.path.exists(dest)


def _render_cairosvg(src_svg, dest, size):
    """cairosvg CLI."""
    proc = subprocess.run(
        ["cairosvg", src_svg, "-W", str(size), "-H", str(size),
         "-o", dest],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc.returncode == 0 and os.path.exists(dest)


def _find_chrome():
    candidates = [
        "google-chrome", "google-chrome-stable", "chromium",
        "chromium-browser", "chrome",
    ]
    for c in candidates:
        if _have(c):
            return c
    mac = ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    if os.path.exists(mac):
        return mac
    return None


def _render_chrome(src_svg, dest, size):
    """Headless Chrome screenshot. Wrap the SVG in a sized, transparent page so
    the screenshot is exactly size x size with the art fit inside."""
    chrome = _find_chrome()
    if chrome is None:
        return False
    with tempfile.TemporaryDirectory() as tmp:
        with open(src_svg, "r", encoding="utf-8") as fh:
            svg_markup = fh.read()
        # Strip XML/doctype prolog so the SVG can be inlined into HTML.
        idx = svg_markup.find("<svg")
        if idx > 0:
            svg_markup = svg_markup[idx:]
        html = (
            "<!doctype html><meta charset=utf-8>"
            "<style>html,body{margin:0;padding:0;background:transparent}"
            f"#w{{width:{size}px;height:{size}px;display:flex;"
            "align-items:center;justify-content:center}"
            "#w svg{max-width:100%;max-height:100%}</style>"
            f"<div id=w>{svg_markup}</div>"
        )
        page = os.path.join(tmp, "page.html")
        with open(page, "w", encoding="utf-8") as fh:
            fh.write(html)
        proc = subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--default-background-color=00000000",
             f"--force-device-scale-factor=1",
             f"--window-size={size},{size}",
             f"--screenshot={dest}", "file://" + page],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if proc.returncode != 0:
            # older chrome wants --headless (not =new)
            subprocess.run(
                [chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
                 "--default-background-color=00000000",
                 f"--window-size={size},{size}",
                 f"--screenshot={dest}", "file://" + page],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
    return os.path.exists(dest)


# Rasterization is delegated to the shared cross-platform helper (_raster), which
# tries rsvg-convert / cairosvg / inkscape / magick / a headless browser (Edge on
# Windows, Chrome/Chromium on macOS+Linux) / qlmanage — so app-icon generation works
# on Windows, macOS, and Linux. The per-tool _render_* helpers above are retained as
# a reference implementation but are no longer the dispatch path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _raster  # noqa: E402


def _render_raster(src_svg, dest, size):
    return _raster.rasterize(src_svg, dest, size, size) is not None


BACKENDS = [("cross-platform", lambda: True, _render_raster)]


def pick_backend(src_svg):
    """Probe backends in order; return (name, render_fn) for the first that
    actually produces a correctly-sized, non-blank 64px PNG. We render a real
    sentinel rather than just checking `which`, because a tool can be installed
    but unable to render this SVG."""
    tried = []
    for name, available, fn in BACKENDS:
        if not available():
            continue
        tried.append(name)
        with tempfile.TemporaryDirectory() as tmp:
            probe = os.path.join(tmp, "probe.png")
            try:
                ok = fn(src_svg, probe, 64)
            except Exception:
                ok = False
            if not ok or not os.path.exists(probe):
                continue
            if os.path.getsize(probe) < MIN_PNG_BYTES:
                continue
            try:
                w, h = read_png_size(probe)
            except Exception:
                continue
            if (w, h) == (64, 64):
                return name, fn, tried
    return None, None, tried


# --- maskable compositing (pure stdlib, hand-rolled PNG) ---------------------
#
# We have no image library. To produce the maskable icon we:
#   1) rasterize the mark into the inner safe square,
#   2) decode that PNG to raw RGBA pixels,
#   3) paint it onto a solid brand-teal canvas,
#   4) re-encode a fresh RGBA PNG.
# All with zlib + struct from the stdlib.

import zlib


def _decode_png_rgba(path):
    """Minimal PNG decoder: returns (width, height, bytearray RGBA).

    Handles the subset our own rasterizers emit: 8-bit, color types 2 (RGB),
    6 (RGBA) and the common 0/4 (grey/grey+alpha), non-interlaced, with the
    standard PNG filters. Good enough to read back what we just wrote.
    """
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:8] != PNG_SIG:
        raise ValueError(f"{path}: not a PNG")
    pos = 8
    width = height = bit_depth = color_type = None
    idat = bytearray()
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(
                ">IIBB", chunk[:10])
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
        pos += 12 + length
    if bit_depth != 8:
        raise ValueError(f"{path}: unsupported bit depth {bit_depth}")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color_type)
    if channels is None or color_type == 3:
        raise ValueError(f"{path}: unsupported color type {color_type}")
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(width * height * 4)
    prev = bytearray(stride)
    rpos = 0
    for y in range(height):
        ftype = raw[rpos]; rpos += 1
        line = bytearray(raw[rpos:rpos + stride]); rpos += stride
        _unfilter(line, prev, ftype, channels)
        prev = line
        for x in range(width):
            o = (y * width + x) * 4
            s = x * channels
            if color_type == 2:        # RGB
                out[o:o + 3] = line[s:s + 3]; out[o + 3] = 255
            elif color_type == 6:      # RGBA
                out[o:o + 4] = line[s:s + 4]
            elif color_type == 0:      # grey
                g = line[s]; out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255
            elif color_type == 4:      # grey+alpha
                g = line[s]; out[o] = out[o + 1] = out[o + 2] = g
                out[o + 3] = line[s + 1]
    return width, height, out


def _unfilter(line, prev, ftype, bpp):
    """Reverse the per-scanline PNG filter in place."""
    if ftype == 0:
        return
    for i in range(len(line)):
        a = line[i - bpp] if i >= bpp else 0
        b = prev[i]
        c = prev[i - bpp] if i >= bpp else 0
        x = line[i]
        if ftype == 1:      # Sub
            line[i] = (x + a) & 0xFF
        elif ftype == 2:    # Up
            line[i] = (x + b) & 0xFF
        elif ftype == 3:    # Average
            line[i] = (x + ((a + b) >> 1)) & 0xFF
        elif ftype == 4:    # Paeth
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            line[i] = (x + pr) & 0xFF
        else:
            raise ValueError(f"unsupported PNG filter {ftype}")


def _encode_png_rgba(width, height, rgba):
    """Encode raw RGBA bytes to a PNG (filter 0 per line)."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, payload):
        out = struct.pack(">I", len(payload)) + tag + payload
        out += struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        return out

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (PNG_SIG + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", comp) + chunk(b"IEND", b""))


def _hex_rgb(h):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def build_maskable(render_fn, src_svg, dest, size, padding, bg_hex):
    """Render the mark into the inner safe square, then composite it centered
    over a solid brand-teal canvas, alpha-blending the mark's transparency."""
    inner = max(1, int(round(size * (1 - 2 * padding))))
    with tempfile.TemporaryDirectory() as tmp:
        mark_png = os.path.join(tmp, "mark.png")
        if not render_fn(src_svg, mark_png, inner):
            raise RuntimeError("maskable: failed to render inner mark")
        mw, mh, mark = _decode_png_rgba(mark_png)

    br, bg, bb = _hex_rgb(bg_hex)
    canvas = bytearray(size * size * 4)
    for i in range(size * size):
        o = i * 4
        canvas[o] = br; canvas[o + 1] = bg; canvas[o + 2] = bb; canvas[o + 3] = 255

    ox = (size - mw) // 2
    oy = (size - mh) // 2
    for y in range(mh):
        cy = oy + y
        if cy < 0 or cy >= size:
            continue
        for x in range(mw):
            cx = ox + x
            if cx < 0 or cx >= size:
                continue
            s = (y * mw + x) * 4
            a = mark[s + 3]
            if a == 0:
                continue
            d = (cy * size + cx) * 4
            if a == 255:
                canvas[d:d + 3] = mark[s:s + 3]
            else:
                inv = 255 - a
                for k in range(3):
                    canvas[d + k] = (mark[s + k] * a + canvas[d + k] * inv) // 255
            canvas[d + 3] = 255

    with open(dest, "wb") as fh:
        fh.write(_encode_png_rgba(size, size, canvas))


# --- side files --------------------------------------------------------------

WEBMANIFEST = '''{
  "name": "HISD",
  "short_name": "HISD",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "theme_color": "%s",
  "background_color": "#ffffff",
  "display": "standalone"
}
''' % BRAND_TEAL

HEAD_SNIPPET = '''<!-- HISD favicon + app icons. Paths assume these files sit at the site root.
     Adjust the href prefixes if you serve them from a subdirectory. -->
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="%s">
''' % BRAND_TEAL


def write_readme(out_dir, source_rel, backend, results):
    lines = []
    lines.append("# HISD app icons\n")
    lines.append(
        "Generated favicon + app-icon set built from the HISD teal skyline "
        "mark by `scripts/generate_app_icons.py`. Do not hand-edit; rerun the "
        "script to regenerate.\n")
    lines.append("## Source\n")
    lines.append(f"- Mark: `{source_rel}` (single-color teal skyline icon)\n")
    lines.append(f"- Brand teal: `{BRAND_TEAL}`\n")
    lines.append(f"- Rasterizer: `{backend}`\n")
    lines.append("## Files\n")
    lines.append("| File | Size | Field | Use |")
    lines.append("| --- | --- | --- | --- |")
    lines.append("| `favicon.svg` | vector | transparent | Modern browser tab; crisp at any DPI |")
    lines.append("| `favicon-16.png` | 16x16 | transparent | Legacy favicon |")
    lines.append("| `favicon-32.png` | 32x32 | transparent | Legacy favicon |")
    lines.append("| `favicon-48.png` | 48x48 | transparent | Legacy / Windows tiles |")
    lines.append("| `apple-touch-icon.png` | 180x180 | transparent | iOS home screen |")
    lines.append("| `icon-192.png` | 192x192 | transparent | PWA manifest |")
    lines.append("| `icon-512.png` | 512x512 | transparent | PWA manifest / splash |")
    lines.append(f"| `{MASKABLE_NAME}` | {MASKABLE_SIZE}x{MASKABLE_SIZE} | "
                 f"solid {BRAND_TEAL} | Android adaptive `purpose: maskable` |")
    lines.append("| `site.webmanifest` | - | - | PWA manifest snippet |")
    lines.append("| `head-snippet.html` | - | - | `<link>` tags for `<head>` |")
    lines.append("")
    lines.append("## Drop-in\n")
    lines.append("Copy the PNGs, `favicon.svg`, and `site.webmanifest` to your "
                 "site root, then paste `head-snippet.html` into `<head>`. "
                 "Adjust the `href` prefixes if you serve from a subdirectory.\n")
    lines.append("## Maskable safe zone\n")
    lines.append(
        f"The maskable icon centers the mark on a solid {BRAND_TEAL} field "
        f"with ~{int(MASKABLE_PADDING * 100)}% padding per side so Android's "
        "adaptive mask can crop the corners without clipping the skyline.\n")
    lines.append("## Verified dimensions\n")
    for name, size in results:
        lines.append(f"- `{name}` -> {size}x{size}")
    lines.append("")
    with open(os.path.join(out_dir, "README.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


# --- orchestration -----------------------------------------------------------

def generate(source_svg, out_dir):
    if not os.path.exists(source_svg):
        print(f"ERROR: source mark not found: {source_svg}", file=sys.stderr)
        return 2, {}, None

    os.makedirs(out_dir, exist_ok=True)

    backend_name, render_fn, tried = pick_backend(source_svg)
    if render_fn is None:
        print("ERROR: no working SVG rasterizer found.", file=sys.stderr)
        print("       Tried: " + (", ".join(tried) if tried else "none"),
              file=sys.stderr)
        print("       Install one of: qlmanage (macOS), rsvg-convert "
              "(librsvg), cairosvg, or Google Chrome / Chromium.",
              file=sys.stderr)
        return 3, {}, None

    print(f"Source mark : {source_svg}")
    print(f"Output dir  : {out_dir}")
    print(f"Rasterizer  : {backend_name}")
    print(f"Probed      : {', '.join(tried)}")
    print()

    generated = {}

    # 1) standard transparent PNGs
    for name, size in PNG_TARGETS.items():
        dest = os.path.join(out_dir, name)
        ok = render_fn(source_svg, dest, size)
        if not ok or not os.path.exists(dest):
            print(f"ERROR: failed to render {name}", file=sys.stderr)
            return 4, generated, backend_name
        generated[name] = size
        print(f"  rendered {name:24s} @ {size}px")

    # 2) maskable on solid teal field
    mdest = os.path.join(out_dir, MASKABLE_NAME)
    build_maskable(render_fn, source_svg, mdest, MASKABLE_SIZE,
                   MASKABLE_PADDING, BRAND_TEAL)
    generated[MASKABLE_NAME] = MASKABLE_SIZE
    print(f"  composited {MASKABLE_NAME:22s} @ {MASKABLE_SIZE}px "
          f"on {BRAND_TEAL}")

    # 3) favicon.svg passthrough
    shutil.copyfile(source_svg, os.path.join(out_dir, "favicon.svg"))
    print("  copied   favicon.svg              (vector passthrough)")

    # 4) side files
    with open(os.path.join(out_dir, "site.webmanifest"), "w",
              encoding="utf-8") as fh:
        fh.write(WEBMANIFEST)
    with open(os.path.join(out_dir, "head-snippet.html"), "w",
              encoding="utf-8") as fh:
        fh.write(HEAD_SNIPPET)
    print("  wrote    site.webmanifest, head-snippet.html")
    print()

    return 0, generated, backend_name


def verify(out_dir, generated):
    """Re-open every PNG, read real IHDR dimensions, assert size + non-blank."""
    print("Verifying PNG dimensions from IHDR headers ...")
    results = []
    failures = []
    for name, want in generated.items():
        path = os.path.join(out_dir, name)
        if not os.path.exists(path):
            failures.append(f"{name}: missing")
            continue
        nbytes = os.path.getsize(path)
        try:
            w, h = read_png_size(path)
        except Exception as exc:
            failures.append(f"{name}: unreadable ({exc})")
            continue
        ok_dims = (w == want and h == want)
        ok_size = nbytes > MIN_PNG_BYTES
        status = "OK" if (ok_dims and ok_size) else "FAIL"
        print(f"  [{status}] {name:24s} {w}x{h}  {nbytes} bytes")
        if not ok_dims:
            failures.append(f"{name}: got {w}x{h}, wanted {want}x{want}")
        elif not ok_size:
            failures.append(f"{name}: only {nbytes} bytes (blank?)")
        else:
            results.append((name, want))
    return results, failures


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Generate an HISD favicon + app-icon set from a brand mark.")
    ap.add_argument("--source", default=DEFAULT_SOURCE,
                    help="source SVG mark (default: teal skyline icon)")
    ap.add_argument("--out", default=DEFAULT_OUT,
                    help="output directory (default: assets/app-icons)")
    args = ap.parse_args(argv)

    code, generated, backend_name = generate(args.source, args.out)
    if code != 0:
        return code

    results, failures = verify(args.out, generated)

    source_rel = os.path.relpath(args.source, SKILL_ROOT)
    write_readme(args.out, source_rel, backend_name, results)

    print()
    if failures:
        print("VERIFICATION FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 5

    print(f"All {len(results)} PNGs verified at correct dimensions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
