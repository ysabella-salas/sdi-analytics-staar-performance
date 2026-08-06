#!/usr/bin/env python3
"""Cross-platform SVG -> PNG rasterization. Windows, macOS, and Linux. Stdlib only.

Shared by generate_app_icons.py and platforms/social/make_card.py so both work the
same on every OS. The chain prefers renderers that emit EXACT pixel dimensions
directly; its universal fallback is a **headless browser** — Microsoft Edge ships on
every Windows machine, Chrome/Chromium on most macOS/Linux — so no pip or Node is
required anywhere.

Chain (first available wins):
  1. rsvg-convert            (librsvg; exact -w/-h)
  2. cairosvg                (Python module; exact output_width/height)
  3. inkscape                (exact --export-width/height)
  4. magick / convert        (ImageMagick; -resize WxH!)
  5. headless browser        (chrome | chromium | msedge | edge — incl. Windows paths)
  6. qlmanage + sips         (macOS QuickLook; square thumbnail forced to size)

Set HISD_RASTERIZER to pin one of: rsvg, cairosvg, inkscape, magick, browser,
qlmanage (useful for testing or to force a specific renderer).

    from _raster import rasterize           # rasterize(svg, out, w, h) -> name | None
"""
import os
import shutil
import struct
import subprocess
import sys
import tempfile

__all__ = ["rasterize", "png_size"]


def png_size(path):
    """(width, height) from a PNG's IHDR, or None if not a PNG."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(26)
    except OSError:
        return None
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])


def _run(cmd, stdout=None, timeout=120):
    try:
        return subprocess.run(
            cmd, stdout=(stdout or subprocess.DEVNULL),
            stderr=subprocess.DEVNULL, timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError):
        return None


def _ok(path):
    return os.path.exists(path) and os.path.getsize(path) > 0


def find_browser():
    """A Chromium-family executable, searching PATH then known install locations
    on macOS and Windows. Edge is included because it ships with every Windows 10/11."""
    for name in ("chromium", "chromium-browser", "google-chrome",
                 "google-chrome-stable", "chrome", "msedge",
                 "microsoft-edge", "microsoft-edge-stable"):
        found = shutil.which(name)
        if found:
            return found
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]
    for var in ("ProgramFiles", "ProgramFiles(x86)", "LocalAppData"):
        base = os.environ.get(var)
        if not base:
            continue
        candidates += [
            os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(base, "Chromium", "Application", "chrome.exe"),
        ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


def _force_dims(path, w, h):
    """Make a PNG exactly w x h. Exact-dim renderers don't need this; qlmanage does."""
    if png_size(path) == (w, h):
        return True
    sips = shutil.which("sips")  # macOS
    if sips and _run([sips, "-z", str(h), str(w), path]):
        return png_size(path) == (w, h)
    mg = shutil.which("magick") or shutil.which("convert")
    if mg and _run([mg, path, "-resize", "%dx%d!" % (w, h), path]):
        return png_size(path) == (w, h)
    return png_size(path) == (w, h)


# --- individual renderers -------------------------------------------------
def _r_rsvg(svg, out, w, h):
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        return False
    with open(out, "wb") as fh:
        _run([rsvg, "-w", str(w), "-h", str(h), svg], stdout=fh)
    return _ok(out)


def _r_cairosvg(svg, out, w, h):
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=svg, write_to=out, output_width=w, output_height=h)
        return _ok(out)
    except Exception:
        cli = shutil.which("cairosvg")
        if not cli:
            return False
        _run([cli, svg, "-o", out, "--output-width", str(w), "--output-height", str(h)])
        return _ok(out)


def _r_inkscape(svg, out, w, h):
    ink = shutil.which("inkscape")
    if not ink:
        return False
    _run([ink, svg, "--export-type=png", "--export-filename=" + out,
          "--export-width=%d" % w, "--export-height=%d" % h])
    return _ok(out)


def _r_magick(svg, out, w, h):
    mg = shutil.which("magick") or shutil.which("convert")
    if not mg:
        return False
    _run([mg, "-background", "none", "-density", "384", svg,
          "-resize", "%dx%d!" % (w, h), out])
    return _ok(out)


def _r_browser(svg, out, w, h):
    browser = find_browser()
    if not browser:
        return False
    svg_markup = open(svg, encoding="utf-8").read()
    html = (
        "<!doctype html><meta charset=utf-8><style>"
        "*{margin:0;padding:0}html,body{width:%dpx;height:%dpx;overflow:hidden}"
        "svg{display:block;width:%dpx;height:%dpx}</style>%s"
        % (w, h, w, h, svg_markup)
    )
    tmp = tempfile.mkdtemp(prefix="hisd-raster-")
    page = os.path.join(tmp, "card.html")
    try:
        with open(page, "w", encoding="utf-8") as fh:
            fh.write(html)
        url = "file://" + page if os.sep == "/" else "file:///" + page.replace("\\", "/")
        common = ["--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                  "--default-background-color=00000000",
                  "--window-size=%d,%d" % (w, h), "--screenshot=" + out, url]
        _run([browser, "--headless=new"] + common)
        if not _ok(out):
            _run([browser, "--headless"] + common)  # older Chrome/Edge syntax
        if _ok(out):
            _force_dims(out, w, h)
            return True
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _r_qlmanage(svg, out, w, h):
    ql = shutil.which("qlmanage")  # macOS only
    if not ql:
        return False
    longest = max(w, h)
    tmp = tempfile.mkdtemp(prefix="hisd-ql-")
    try:
        _run([ql, "-t", "-s", str(longest), "-o", tmp, svg])
        produced = os.path.join(tmp, os.path.basename(svg) + ".png")
        if os.path.exists(produced):
            shutil.move(produced, out)
            _force_dims(out, w, h)
            return _ok(out)
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


_RENDERERS = [
    ("rsvg", _r_rsvg),
    ("cairosvg", _r_cairosvg),
    ("inkscape", _r_inkscape),
    ("magick", _r_magick),
    ("browser", _r_browser),
    ("qlmanage", _r_qlmanage),
]


def rasterize(svg_path, out_path, width, height):
    """Rasterize svg_path -> out_path at exactly width x height.
    Returns the name of the renderer that succeeded, or None if none worked."""
    pin = os.environ.get("HISD_RASTERIZER")
    chain = [(n, fn) for n, fn in _RENDERERS if (not pin or n == pin)]
    for name, fn in chain:
        try:
            if fn(svg_path, out_path, width, height) and _ok(out_path):
                return name
        except Exception:
            continue
    return None


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("usage: _raster.py SVG OUT WIDTH HEIGHT", file=sys.stderr)
        sys.exit(2)
    svg, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    used = rasterize(svg, out, w, h)
    if not used:
        print("no rasterizer available (install rsvg-convert/cairosvg or a Chromium "
              "browser; Edge ships with Windows)", file=sys.stderr)
        sys.exit(1)
    print("%s -> %s via %s %r" % (svg, out, used, png_size(out)))
