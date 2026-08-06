#!/usr/bin/env python3
"""brand_scan.py — the HISD "teal test": an automated brand-conformance scanner.

Where lint_components.py is a tight gate on the design system's own coded
components, this generalizes the same comment-stripping + color-property
heuristics to ANY path so you can point it at a microsite, a one-off landing
page, a Power BI export, or a vendor handoff and ask one question:

    Does this look like HISD, or did someone paste in stock teal?

It scans .css / .scss / .html / .htm and flags four off-brand smells:

  RAW COLORS         a hex / rgb() / hsl() on a color-bearing property,
                     not wrapped in var() — i.e. a hardcoded color instead
                     of a design token.
  CDN FONTS          a link to an external font CDN (Google Fonts, Adobe
                     Typekit, …). Brand fonts must be self-hosted.
  NON-BRAND FONT     a font-family whose first family is not one of the three
                     brand faces (Radio Canada / Parkinsans / Lora) or a
                     var(--font-*) token. Generic fallbacks are fine.
  MISSING FOCUS RING a stylesheet that styles interactive selectors but never
                     defines a :focus-visible ring.

Usage:
    python3 brand_scan.py [PATH ...]      # default: the repo root
    python3 brand_scan.py --json          # machine-readable report
    python3 brand_scan.py --strict        # exit 1 when findings exist
    python3 brand_scan.py --include-source # also scan the design-system
                                           # sources of truth (off by default)

By default this is report-only: it always exits 0 so it can run as an advisory
in a pipeline. Pass --strict to turn findings into a failing build. Stdlib
only, no dependencies, so CI can run it anywhere Python 3 exists.
"""
import os
import re
import sys
import json
import fnmatch

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_ROOT = os.path.normpath(os.path.join(HERE, ".."))           # .skills/design/hisd-brand-designer
REPO_ROOT = os.path.normpath(os.path.join(SKILL_ROOT, "..", ".."))  # repo root

SCAN_EXTS = (".css", ".scss", ".html", ".htm")

# --------------------------------------------------------------------------
# Color heuristics — kept in sync with lint_components.py. Any of these
# properties holds a color value and must therefore be painted through a
# token (var(...)) or an allowed keyword, never a raw hex/rgb()/hsl().
# --------------------------------------------------------------------------
COLOR_PROPS = ("color", "background", "background-color", "border", "border-color",
               "border-top", "border-right", "border-bottom", "border-left",
               "border-inline", "border-block", "border-inline-start", "border-inline-end",
               "border-block-start", "border-block-end", "outline", "outline-color",
               "fill", "stroke", "box-shadow", "caret-color", "text-decoration-color",
               "accent-color", "column-rule")
# Prefixes that always indicate a color-bearing property family.
COLOR_PREFIXES = ("background", "border", "box-shadow", "outline")

HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGBHSL = re.compile(r"\b(rgb|rgba|hsl|hsla)\s*\(")

# --------------------------------------------------------------------------
# Font heuristics
# --------------------------------------------------------------------------
# External font CDNs. Brand fonts are self-hosted from assets/fonts/ via
# @font-face; any of these means a font is being pulled off-brand.
FONT_CDNS = (
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "use.typekit.net",
    "use.fontawesome.com",
    "fast.fonts.net",          # Monotype web fonts
    "cloud.typography.com",    # Hoefler&Co
    "fonts.adobe.com",
    "kit.fontawesome.com",
    "cdnjs.cloudflare.com/ajax/libs/font",
    "fonts.bunny.net",
    "rsms.me/inter",
)
# Brand faces (lower-cased, quotes stripped). The first family in a
# font-family declaration must be one of these, a var(--font-*) token, or a
# generic keyword fallback.
BRAND_FAMILIES = ("radio canada", "parkinsans", "parkin sans", "lora")
GENERIC_FAMILIES = ("inherit", "initial", "unset", "revert", "revert-layer",
                    "serif", "sans-serif", "monospace", "cursive", "fantasy",
                    "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace",
                    "ui-rounded", "emoji", "math", "fangsong")

FONT_FAMILY_DECL = re.compile(r"font-family\s*:\s*([^;}{]+)", re.I)
# Match a stylesheet <link rel="stylesheet" href="...cdn..."> or @import url(...cdn...)
LINK_HREF = re.compile(r"""\b(?:href|src)\s*=\s*['"]([^'"]+)['"]""", re.I)
IMPORT_URL = re.compile(r"""@import\s+(?:url\()?['"]?([^'")\s]+)""", re.I)

# --------------------------------------------------------------------------
# Focus-ring heuristic — a stylesheet that styles interactive selectors but
# never defines :focus-visible has an inaccessible keyboard focus story.
# --------------------------------------------------------------------------
INTERACTIVE_SELECTOR = re.compile(
    r"(?<![\w-])(button|input|select|textarea|a)(?=[\s.:,>~+\[{])|\[role\s*=",
    re.I,
)

# --------------------------------------------------------------------------
# ALLOWLIST — the design system's own sources of truth. These files DEFINE
# the tokens/fonts (they legitimately contain raw hex, @font-face src, brand
# family names) so scanning them would be noise. The generated bundle and its
# gallery index are derived artifacts. Per-component files in components/*.css
# are deliberately NOT excluded — they must stay clean.
#
# Entries are matched against the repo-relative POSIX path. Trailing "/"
# marks a directory subtree; "*" globs are honored. --include-source clears
# this whole list.
# --------------------------------------------------------------------------
# The skill's OWN sources of truth, expressed RELATIVE TO THE SKILL ROOT so the
# exclusion holds wherever the skill is vendored (it is not tied to a `.skills/
# hisd-brand-designer/` location). These files DEFINE the tokens/fonts/logos (they
# legitimately contain raw hex, @font-face src, brand family names) or are
# platform-native artifacts; scanning them would be noise. Per-component files in
# components/*.css are deliberately NOT excluded — they must stay clean.
SELF_EXCLUDES = (
    "assets/hisd-theme.css",
    "assets/hisd-tokens.scss",
    "assets/hisd.tokens.json",
    "assets/contrast-report.md",
    "assets/style-guide.html",
    "components/components.css",       # generated bundle
    "components/index.html",           # generated gallery
    "assets/logos/",
    "assets/fonts/",
    "assets/icons/",                   # currentColor SVGs + a token-only contact sheet
    # Per-campus sub-theme CSS — these are TOKEN DEFINITIONS for the accent family,
    # generated by scripts/derive_theme.py with an AA gate inside, not consumer code.
    "assets/campuses/",
    # platform kits express brand color in platform-native form (email/print inline
    # hex, Power Pages / Style Dictionary token DEFINITIONS, Power BI background SVGs).
    "platforms/",
)
# Generic conveniences, matched on the scan-root-relative path; harmless if absent.
GENERIC_EXCLUDES = (
    ".git/", "node_modules/", "tools/", "Artifacts/", "dist/", "build/", "*.min.css",
)


def rel(path):
    """Path relative to the scan/repo root, for matching GENERIC_EXCLUDES."""
    try:
        r = os.path.relpath(os.path.abspath(path), REPO_ROOT)
    except ValueError:
        r = os.path.abspath(path)
    return r.replace(os.sep, "/")


def _skill_rel(path):
    """Path relative to the SKILL root, or None if the path is outside the skill."""
    try:
        r = os.path.relpath(os.path.abspath(path), SKILL_ROOT)
    except ValueError:
        return None
    if r == ".." or r.startswith(".." + os.sep) or r.startswith("../"):
        return None
    return r.replace(os.sep, "/")


def is_excluded(path):
    # 1) the skill's own files — matched relative to the skill root, so the
    #    exclusion is portable to any vendor location.
    sr = _skill_rel(path)
    if sr is not None:
        for pat in SELF_EXCLUDES:
            if pat.endswith("/"):
                sub = pat.rstrip("/")
                if sr == sub or sr.startswith(sub + "/"):
                    return True
            elif sr == pat:
                return True
    # 2) generic repo conveniences.
    r = rel(path)
    for pat in GENERIC_EXCLUDES:
        if pat.endswith("/"):
            sub = pat.rstrip("/")
            if r == sub or r.startswith(sub + "/") or ("/" + sub + "/") in ("/" + r):
                return True
        elif "*" in pat or "?" in pat:
            if fnmatch.fnmatch(r, pat) or fnmatch.fnmatch(os.path.basename(r), pat):
                return True
        elif r == pat or r.endswith("/" + pat):
            return True
    return False


def strip_comments(text):
    """Strip CSS block comments and HTML comments so we never flag examples
    or prose that merely mention a hex value."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)   # CSS / JS block comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)  # HTML comments
    return text


def _color_prop(prop):
    """True when `prop` (a left-hand declaration name, lower-cased) holds a color."""
    prop = prop.strip()
    if prop in COLOR_PROPS:
        return True
    if any(prop.startswith(p) for p in COLOR_PREFIXES):
        return True
    # custom properties that obviously hold a color (--*-color, --color-*, --hisd-*)
    if prop.startswith("--"):
        return prop.startswith(("--color", "--hisd")) or prop.endswith(("-color", "-bg", "-fg", "-border", "-shadow", "-fill", "-stroke"))
    return False


def _raw_color_outside_var(value):
    """True if `value` contains a hex/rgb()/hsl() literal that is NOT confined
    to inside a var(...) fallback. We blank out var(...) groups first, then look
    for a stray color literal in what remains."""
    stripped = re.sub(r"var\s*\([^()]*(?:\([^()]*\)[^()]*)*\)", " ", value, flags=re.S)
    return bool(HEX.search(stripped) or RGBHSL.search(stripped))


def _first_family(value):
    """The first font family in a font-family value, lower-cased, quotes/space
    trimmed. Returns '' if it cannot be parsed."""
    first = value.split(",")[0].strip()
    first = first.strip("'\"").strip()
    return first.lower()


def _is_brand_first_family(first):
    if not first:
        return True  # unparseable — don't false-positive
    if first.startswith("var("):
        # only var(--font-*) tokens count as on-brand font tokens
        return bool(re.match(r"var\(\s*--font", first))
    if first in GENERIC_FAMILIES:
        return True
    return any(first == b or first.startswith(b) for b in BRAND_FAMILIES)


def scan_text(path, text):
    """Return a list of finding dicts for one file's (comment-stripped) text."""
    findings = []
    body = strip_comments(text)
    ext = os.path.splitext(path)[1].lower()
    is_html = ext in (".html", ".htm")

    def add(kind, line, detail):
        findings.append({"kind": kind, "line": line, "detail": detail})

    lines = body.splitlines()

    # ---- RAW COLORS (line-oriented, declaration-aware) -------------------
    for i, line in enumerate(lines, 1):
        low = line.lower()
        # Split into declaration-sized segments. CSS declarations end at ";",
        # but a selector + first declaration can share a line ("h1 { color:..")
        # and a declaration can be the last one before "}" ("color:.. }"), so
        # break on "{" "}" ";" alike. This also handles minified one-liners and
        # inline style="a:b;c:d" attributes.
        for seg in re.split(r"[;{}]", low):
            if ":" not in seg:
                continue
            prop, _, value = seg.partition(":")
            # the property name is whatever follows the last selector token
            prop = prop.strip().split()[-1] if prop.strip() else ""
            if _color_prop(prop) and _raw_color_outside_var(value):
                add("RAW_COLOR", i, line.strip()[:90])
                break  # one finding per line is enough

    # ---- CDN FONTS -------------------------------------------------------
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if not any(cdn in low for cdn in FONT_CDNS):
            continue
        # report the actual URL(s) on the line
        urls = LINK_HREF.findall(line) + IMPORT_URL.findall(line)
        hit = next((u for u in urls if any(c in u.lower() for c in FONT_CDNS)), None)
        if hit is None:
            hit = next((c for c in FONT_CDNS if c in low), "external font CDN")
        add("CDN_FONT", i, hit[:90])

    # ---- NON-BRAND FONT-FAMILY -------------------------------------------
    for m in FONT_FAMILY_DECL.finditer(body):
        value = m.group(1)
        first = _first_family(value)
        if not _is_brand_first_family(first):
            line = body[:m.start()].count("\n") + 1
            add("NON_BRAND_FONT", line, value.strip()[:90])

    # ---- MISSING FOCUS RING ---------------------------------------------
    # Only meaningful for stylesheets / <style> blocks that paint interactive
    # selectors. For HTML, restrict the check to <style>…</style> content so
    # we don't fire on every page that merely contains a <button>.
    css_for_focus = body
    if is_html:
        css_for_focus = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", body, flags=re.I | re.S))
    if css_for_focus.strip():
        styles_interactive = bool(INTERACTIVE_SELECTOR.search(css_for_focus))
        # Require it to look like it actually styles them (has a "{...}" block),
        # not just an attribute selector mention.
        has_rules = "{" in css_for_focus
        if styles_interactive and has_rules and ":focus-visible" not in css_for_focus:
            add("MISSING_FOCUS_RING", 0, "styles interactive selectors but no :focus-visible ring")

    return findings


def gather_files(paths, include_source):
    """Expand the given paths into a sorted, de-duplicated list of scannable
    files, honoring EXCLUDES unless include_source is set."""
    out = []
    seen = set()
    for p in paths:
        p = os.path.abspath(p)
        if os.path.isfile(p):
            candidates = [p]
        elif os.path.isdir(p):
            candidates = []
            for root, dirs, files in os.walk(p):
                # prune excluded directories in-place for speed
                if not include_source:
                    dirs[:] = [d for d in dirs if not is_excluded(os.path.join(root, d) + "/")]
                for f in files:
                    candidates.append(os.path.join(root, f))
        else:
            sys.stderr.write(f"warning: path not found, skipping: {p}\n")
            continue
        for c in candidates:
            if os.path.splitext(c)[1].lower() not in SCAN_EXTS:
                continue
            if not include_source and is_excluded(c):
                continue
            key = os.path.abspath(c)
            if key in seen:
                continue
            seen.add(key)
            out.append(c)
    return sorted(out)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in argv
    strict = "--strict" in argv
    include_source = "--include-source" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        paths = [REPO_ROOT]

    files = gather_files(paths, include_source)

    per_file = {}        # path -> [findings]
    total_findings = 0
    for f in files:
        try:
            text = open(f, encoding="utf-8", errors="replace").read()
        except OSError as e:
            sys.stderr.write(f"warning: could not read {f}: {e}\n")
            continue
        fs = scan_text(f, text)
        if fs:
            per_file[f] = fs
            total_findings += len(fs)

    scanned = len(files)
    clean = scanned - len(per_file)
    score = (clean / scanned * 100.0) if scanned else 100.0

    if as_json:
        report = {
            "scanned": scanned,
            "clean": clean,
            "flagged": len(per_file),
            "findings": total_findings,
            "score": round(score, 1),
            "include_source": include_source,
            "files": {
                rel(p): [
                    {"kind": fn["kind"], "line": fn["line"], "detail": fn["detail"]}
                    for fn in fs
                ]
                for p, fs in sorted(per_file.items())
            },
        }
        print(json.dumps(report, indent=2))
    else:
        print(f"HISD brand scan — the teal test")
        print(f"Scanned {scanned} file(s) "
              f"({'including' if include_source else 'excluding'} design-system sources).")
        if per_file:
            for p in sorted(per_file):
                print(f"\n{rel(p)}")
                for fn in per_file[p]:
                    loc = f":{fn['line']}" if fn["line"] else ""
                    print(f"  - [{fn['kind']}]{loc}  {fn['detail']}")
        print(f"\nConformance score: {score:.1f}%  ({clean}/{scanned} clean, "
              f"{total_findings} finding(s) across {len(per_file)} file(s)).")
        if not per_file:
            print("On brand. Every scanned file paints through tokens, "
                  "self-hosts brand fonts, and keeps a focus ring.")
        elif not strict:
            print("Report-only run (exit 0). Re-run with --strict to fail on findings.")

    if strict and total_findings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
