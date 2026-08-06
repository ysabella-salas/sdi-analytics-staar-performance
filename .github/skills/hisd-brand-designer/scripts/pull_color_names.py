#!/usr/bin/env python3
"""pull_color_names.py — resolve a human color name for a hex color.

Stdlib-only (urllib + json + re + time). No pip, no deps.

Primary source: color-name.com. For a hex `RRGGBB` (lowercase, no '#') the page
lives at https://www.color-name.com/hex/{rrggbb}; the human name is parsed from
the page <title> (and, as a backstop, the main <h1> heading).

Resilience contract (never crash on a single lookup):
  - CACHE: every resolved name is cached to assets/.color-name-cache.json keyed
    by the canonical lowercase 6-digit hex (no '#'). Re-runs are free and the
    ~1000-entry matrix build is fully resumable.
  - RATE LIMIT: a short polite sleep (FETCH_SLEEP) between *live* network fetches
    only (cache hits never sleep).
  - RETRY: transient network failures are retried with backoff.
  - FALLBACK: when color-name.com is unreachable / unparseable, fall back to a
    bundled CSS/X11 named-color list and pick the nearest by squared RGB distance.
  - SOURCE TAGGING: each result records where the name came from —
    "color-name.com", "nearest-css", or "cache" (the original source is also kept
    in the cache entry so cached fallbacks stay honestly tagged across runs).

Public API:
  color_name(hex_str, *, allow_network=True, cache=None) -> dict
      {"hex": "#RRGGBB", "name": str, "source": str}

CLI:
  python3 pull_color_names.py 00A3AF "#F9D04E" ...   # resolve one or more hexes
  python3 pull_color_names.py --offline 00A3AF       # force nearest-css only
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))
CACHE_PATH = os.path.join(ASSETS, ".color-name-cache.json")

URL_TMPL = "https://www.color-name.com/hex/{hex}"
USER_AGENT = "Mozilla/5.0 (compatible; HISD-palette-builder/1.0; +stdlib-urllib)"
FETCH_SLEEP = 1.0      # polite delay between LIVE fetches (seconds)
TIMEOUT = 15           # per-request socket timeout (seconds)
RETRIES = 3            # attempts per live fetch
RETRY_BACKOFF = 2.0    # seconds, multiplied by attempt index

# ---------------------------------------------------------------------------
# Hex helpers (mirrors build_tokens.hx/xh canonicalization)
# ---------------------------------------------------------------------------
def canon_hex(s):
    """Return canonical lowercase 6-digit hex WITHOUT '#'. Accepts #RGB / #RRGGBB."""
    s = s.strip().lstrip("#").lower()
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6 or any(c not in "0123456789abcdef" for c in s):
        raise ValueError(f"not a valid hex color: {s!r}")
    return s

def _rgb(hex6):
    return tuple(int(hex6[i:i + 2], 16) for i in (0, 2, 4))

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
def load_cache(path=CACHE_PATH):
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}

def save_cache(cache, path=CACHE_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cache, f, indent=2, sort_keys=True)
    os.replace(tmp, path)

# ---------------------------------------------------------------------------
# Network fetch + parse
# ---------------------------------------------------------------------------
def _http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                               "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.I | re.S)
_TAG_RE = re.compile(r"<[^>]+>")
# color-name.com titles read: "#RRGGBB Color name is <Name>".
_NAME_IS_RE = re.compile(r"color\s+name\s+is\s+(.+?)\s*$", re.I)

def _clean(text):
    text = _TAG_RE.sub("", text)
    # Decode the handful of entities color-name.com actually emits.
    for ent, ch in (("&amp;", "&"), ("&#39;", "'"), ("&apos;", "'"),
                    ("&quot;", '"'), ("&nbsp;", " ")):
        text = text.replace(ent, ch)
    return re.sub(r"\s+", " ", text).strip()

def _parse_name(html, hex6):
    """Extract the color name from a color-name.com page. Returns str or None.

    The canonical <title> reads:  "#RRGGBB Color name is <Name>". We extract the
    phrase after "Color name is". A couple of older/alternate layouts ("<Name>
    color hex #RRGGBB...") and the <h1> are kept as backstops.
    """
    m = _TITLE_RE.search(html)
    if m:
        title = _clean(m.group(1))
        nm = _NAME_IS_RE.search(title)
        if nm:
            cand = nm.group(1).strip(" -|,.")
            if cand and cand.lower() not in ("color", hex6, "#" + hex6):
                return cand
        # Alternate layout: "<Name> color hex #RRGGBB, RGB(...)".
        for sep in (" color hex", " Color Hex", " color #", " Color #",
                    " hex color", " Hex Color"):
            i = title.find(sep)
            if i > 0:
                cand = title[:i].strip(" -|,")
                if cand and cand.lower() not in ("color", hex6, "#" + hex6):
                    return cand
    m = _H1_RE.search(html)
    if m:
        h1 = _clean(m.group(1))
        nm = _NAME_IS_RE.search(h1)
        if nm:
            cand = nm.group(1).strip(" -|,.")
            if cand and cand.lower() not in ("color", hex6, "#" + hex6):
                return cand
        h1 = re.sub(r"(?i)\s*(color\s*hex|hex\s*code).*$", "", h1).strip(" -|,")
        if h1 and h1.lower() not in ("color", hex6, "#" + hex6):
            return h1
    return None

def fetch_name(hex6, *, retries=RETRIES):
    """Live-fetch the name from color-name.com. Returns str or None (never raises)."""
    url = URL_TMPL.format(hex=hex6)
    for attempt in range(1, retries + 1):
        try:
            html = _http_get(url)
            name = _parse_name(html, hex6)
            if name:
                return name
            return None  # reachable but unparseable — let caller fall back
        except (urllib.error.URLError, urllib.error.HTTPError,
                TimeoutError, OSError, ValueError) as e:
            if attempt < retries:
                time.sleep(RETRY_BACKOFF * attempt)
                continue
            sys.stderr.write(f"[pull_color_names] fetch failed for #{hex6}: {e}\n")
            return None
    return None

# ---------------------------------------------------------------------------
# Offline fallback: nearest CSS/X11 named color
# ---------------------------------------------------------------------------
# CSS Color Module Level 4 / X11 extended named colors (name -> hex, no '#').
CSS_NAMED = {
    "aliceblue": "f0f8ff", "antiquewhite": "faebd7", "aqua": "00ffff",
    "aquamarine": "7fffd4", "azure": "f0ffff", "beige": "f5f5dc",
    "bisque": "ffe4c4", "black": "000000", "blanchedalmond": "ffebcd",
    "blue": "0000ff", "blueviolet": "8a2be2", "brown": "a52a2a",
    "burlywood": "deb887", "cadetblue": "5f9ea0", "chartreuse": "7fff00",
    "chocolate": "d2691e", "coral": "ff7f50", "cornflowerblue": "6495ed",
    "cornsilk": "fff8dc", "crimson": "dc143c", "cyan": "00ffff",
    "darkblue": "00008b", "darkcyan": "008b8b", "darkgoldenrod": "b8860b",
    "darkgray": "a9a9a9", "darkgreen": "006400", "darkgrey": "a9a9a9",
    "darkkhaki": "bdb76b", "darkmagenta": "8b008b", "darkolivegreen": "556b2f",
    "darkorange": "ff8c00", "darkorchid": "9932cc", "darkred": "8b0000",
    "darksalmon": "e9967a", "darkseagreen": "8fbc8f", "darkslateblue": "483d8b",
    "darkslategray": "2f4f4f", "darkslategrey": "2f4f4f", "darkturquoise": "00ced1",
    "darkviolet": "9400d3", "deeppink": "ff1493", "deepskyblue": "00bfff",
    "dimgray": "696969", "dimgrey": "696969", "dodgerblue": "1e90ff",
    "firebrick": "b22222", "floralwhite": "fffaf0", "forestgreen": "228b22",
    "fuchsia": "ff00ff", "gainsboro": "dcdcdc", "ghostwhite": "f8f8ff",
    "gold": "ffd700", "goldenrod": "daa520", "gray": "808080",
    "green": "008000", "greenyellow": "adff2f", "grey": "808080",
    "honeydew": "f0fff0", "hotpink": "ff69b4", "indianred": "cd5c5c",
    "indigo": "4b0082", "ivory": "fffff0", "khaki": "f0e68c",
    "lavender": "e6e6fa", "lavenderblush": "fff0f5", "lawngreen": "7cfc00",
    "lemonchiffon": "fffacd", "lightblue": "add8e6", "lightcoral": "f08080",
    "lightcyan": "e0ffff", "lightgoldenrodyellow": "fafad2", "lightgray": "d3d3d3",
    "lightgreen": "90ee90", "lightgrey": "d3d3d3", "lightpink": "ffb6c1",
    "lightsalmon": "ffa07a", "lightseagreen": "20b2aa", "lightskyblue": "87cefa",
    "lightslategray": "778899", "lightslategrey": "778899", "lightsteelblue": "b0c4de",
    "lightyellow": "ffffe0", "lime": "00ff00", "limegreen": "32cd32",
    "linen": "faf0e6", "magenta": "ff00ff", "maroon": "800000",
    "mediumaquamarine": "66cdaa", "mediumblue": "0000cd", "mediumorchid": "ba55d3",
    "mediumpurple": "9370db", "mediumseagreen": "3cb371", "mediumslateblue": "7b68ee",
    "mediumspringgreen": "00fa9a", "mediumturquoise": "48d1cc",
    "mediumvioletred": "c71585", "midnightblue": "191970", "mintcream": "f5fffa",
    "mistyrose": "ffe4e1", "moccasin": "ffe4b5", "navajowhite": "ffdead",
    "navy": "000080", "oldlace": "fdf5e6", "olive": "808000",
    "olivedrab": "6b8e23", "orange": "ffa500", "orangered": "ff4500",
    "orchid": "da70d6", "palegoldenrod": "eee8aa", "palegreen": "98fb98",
    "paleturquoise": "afeeee", "palevioletred": "db7093", "papayawhip": "ffefd5",
    "peachpuff": "ffdab9", "peru": "cd853f", "pink": "ffc0cb",
    "plum": "dda0dd", "powderblue": "b0e0e6", "purple": "800080",
    "rebeccapurple": "663399", "red": "ff0000", "rosybrown": "bc8f8f",
    "royalblue": "4169e1", "saddlebrown": "8b4513", "salmon": "fa8072",
    "sandybrown": "f4a460", "seagreen": "2e8b57", "seashell": "fff5ee",
    "sienna": "a0522d", "silver": "c0c0c0", "skyblue": "87ceeb",
    "slateblue": "6a5acd", "slategray": "708090", "slategrey": "708090",
    "snow": "fffafa", "springgreen": "00ff7f", "steelblue": "4682b4",
    "tan": "d2b48c", "teal": "008080", "thistle": "d8bfd8",
    "tomato": "ff6347", "turquoise": "40e0d0", "violet": "ee82ee",
    "wheat": "f5deb3", "white": "ffffff", "whitesmoke": "f5f5f5",
    "yellow": "ffff00", "yellowgreen": "9acd32",
}

def _titleize(css_name):
    """Pretty-print a CSS keyword as a human name: 'lightseagreen' -> 'Light Sea Green'."""
    parts = re.findall(
        r"light|dark|medium|pale|deep|hot|sky|sea|spring|forest|midnight|royal|"
        r"steel|slate|cadet|cornflower|dodger|powder|navajo|papaya|peach|"
        r"saddle|sandy|rosy|golden|goldenrod|olive|drab|aqua|marine|turquoise|"
        r"violet|orchid|salmon|khaki|chiffon|almond|lavender|blush|honeydew|"
        r"smoke|white|blanched|antique|alice|ghost|floral|mint|cream|lace|"
        r"old|misty|rose|moccasin|wheat|linen|seashell|snow|ivory|beige|"
        r"chartreuse|crimson|fuchsia|magenta|maroon|indigo|sienna|peru|tan|"
        r"plum|thistle|tomato|coral|gold|pink|red|green|blue|cyan|gray|grey|"
        r"yellow|orange|purple|brown|black|silver|navy|teal|lime|azure|bisque|"
        r"gainsboro|lemon|firebrick|rebecca|[a-z]+",
        css_name)
    if not parts:
        parts = [css_name]
    return " ".join(p.capitalize() for p in parts)

def nearest_css_name(hex6):
    """Nearest CSS/X11 named color by squared RGB distance. Returns a pretty name."""
    r, g, b = _rgb(hex6)
    best_key, best_d = None, None
    for name, h in CSS_NAMED.items():
        nr, ng, nb = _rgb(h)
        d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2
        if best_d is None or d < best_d:
            best_key, best_d = name, d
    return _titleize(best_key)

# ---------------------------------------------------------------------------
# Public resolver
# ---------------------------------------------------------------------------
def color_name(hex_str, *, allow_network=True, cache=None, _sleeper=time.sleep):
    """Resolve a color name. Returns {"hex","name","source"}; never raises on lookup."""
    hex6 = canon_hex(hex_str)
    out_hex = "#" + hex6.upper()

    if cache is not None and hex6 in cache:
        entry = cache[hex6]
        if isinstance(entry, dict) and entry.get("name"):
            return {"hex": out_hex, "name": entry["name"],
                    "source": entry.get("source", "cache")}

    name, source = None, None
    if allow_network:
        name = fetch_name(hex6)
        if name:
            source = "color-name.com"
        _sleeper(FETCH_SLEEP)  # polite delay after every LIVE attempt

    if not name:
        name = nearest_css_name(hex6)
        source = "nearest-css"

    if cache is not None:
        # Persist successful color-name.com hits permanently; persist fallbacks too
        # so the run is resumable, but tagged honestly so a later online re-run can
        # be made to refresh them if desired.
        cache[hex6] = {"name": name, "source": source}

    return {"hex": out_hex, "name": name, "source": source}

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _main(argv):
    offline = False
    args = []
    for a in argv:
        if a in ("--offline", "-o"):
            offline = True
        elif a in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            args.append(a)
    if not args:
        print("usage: pull_color_names.py [--offline] HEX [HEX ...]", file=sys.stderr)
        return 2

    cache = load_cache()
    try:
        for a in args:
            try:
                res = color_name(a, allow_network=not offline, cache=cache)
            except ValueError as e:
                print(f"{a}\tERROR\t{e}", file=sys.stderr)
                continue
            print(f"{res['hex']}\t{res['name']}\t{res['source']}")
    finally:
        save_cache(cache)
    return 0

if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
