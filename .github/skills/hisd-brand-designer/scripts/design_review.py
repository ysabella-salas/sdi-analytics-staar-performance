#!/usr/bin/env python3
"""UX-quality design review for HISD media — extends brand_scan from
"is it on-brand color" to "is it good UX".

Where brand_scan asks "does color come from a token?", this asks "does the
design respect the rubric the model encodes": the 4 px spacing scale, the type
scale, target-size tokens, the focus-ring contract, heading order, motion via
tokens, alt text, bilingual coverage, status-not-by-color-alone, and the
status of common a11y anti-patterns. Findings carry a severity (blocker /
warn) and a rule id so agents can act on them.

    design_review.py <path>             # scan path, exit 1 on any blocker
    design_review.py <path> --json      # machine-readable
    design_review.py <path> --strict    # promote warns to blockers

This is a STATIC pass — fast, dependency-free, runnable in CI or by any agent
before shipping an HISD artifact. The dynamic (computed) pass is a separate
follow-up.
"""
import argparse, glob, json, os, re, sys

# ---- the rubric ------------------------------------------------------------
# Sanctioned space token names (4 px base + half-steps). Magic px/rem outside
# this set is flagged as off-scale.
SPACE_TOKEN_NAMES = {"--space-0", "--space-px", "--space-0.5", "--space-1",
                     "--space-2", "--space-3", "--space-4", "--space-5",
                     "--space-6", "--space-8", "--space-10", "--space-12",
                     "--space-16", "--space-20", "--space-24", "--space-32"}
# The 4 px-base allowed px values inside CSS where a token would be overkill
# (hairlines, focus offsets). Anything else gets flagged.
ALLOWED_PX = {"0", "1", "2", "4", "8", "12", "16", "20", "24"}
TYPE_TOKEN_PREFIXES = ("--text-", "--font-", "--leading-", "--tracking-", "--weight-")
DURATION_TOKEN_RE = re.compile(r"--duration-(instant|fast|base|slow|slower|crossfade)\b")
RAW_MS_RE = re.compile(r"(transition|animation)(?:-duration)?\s*:[^;{]*?\b\d+(?:\.\d+)?ms\b")
LITERAL_DURATION_RE = re.compile(r"\btransition(?:-duration)?\s*:\s*\d+(?:\.\d+)?(?:s|ms)\b")
PROPS_NEEDING_SPACE = ("padding", "margin", "gap", "inset", "top", "right", "bottom", "left",
                       "padding-inline", "padding-block", "margin-inline", "margin-block")
RAW_PX_DECL = re.compile(r"^\s*(?P<prop>[a-z-]+)\s*:\s*[^;{}\n]*?(?P<val>\d+(?:\.\d+)?)px\b", re.M)
HEAD_TAG_RE = re.compile(r"<h([1-6])\b[^>]*>", re.I)
IMG_NO_ALT = re.compile(r"<img\b(?![^>]*\balt=)[^>]*>", re.I)
BUTTON_NO_TYPE = re.compile(r"<button\b(?![^>]*\btype=)[^>]*>", re.I)
DIV_BUTTON = re.compile(r'<div\b[^>]*\brole="button"', re.I)
OUTLINE_NONE = re.compile(r"outline\s*:\s*(none|0)\b")
COLOR_ONLY_STATUS = re.compile(r'class\s*=\s*"[^"]*\b(error|danger|warning|success)\b[^"]*"', re.I)
LANG_ATTR = re.compile(r'<html\b[^>]*\blang=', re.I)
DIR_ATTR = re.compile(r'<html\b[^>]*\bdir=', re.I)
TARGET_BLANK_NO_REL = re.compile(r'target\s*=\s*"_blank"(?![^<>]*\brel=)', re.I)

# Bilingual: a loading region should be paired with at least one bilingual
# string (loading/cargando, sin conexión, guardado, error).
BILINGUAL_HINTS = {"loading":"cargando", "saving":"guardando", "saved":"guardado",
                   "offline":"sin conexión", "error":"error", "online":"en línea"}

GENERIC_EXCLUDES = (".git/", "node_modules/", "platforms/", "tools/", "Artifacts/",
                    ".pytest_cache/", "framework/", "scripts/", "versioning/",
                    "components.css", "index.html")
# Tracked file extensions
EXTS = (".html", ".css", ".jsx", ".tsx")


# ---- helpers ---------------------------------------------------------------
def _strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text


def _iter_files(root):
    for dp, _, fns in os.walk(root):
        if any(("/" + ex.rstrip("/") + "/") in ("/" + dp.replace(os.sep, "/") + "/")
               or dp.replace(os.sep, "/").endswith("/" + ex.rstrip("/"))
               for ex in GENERIC_EXCLUDES):
            continue
        for fn in fns:
            if fn.endswith(EXTS) and fn not in GENERIC_EXCLUDES:
                yield os.path.join(dp, fn)


# ---- finding type ---------------------------------------------------------
def _f(level, rule, path, line, message):
    return {"level": level, "rule": rule, "path": path, "line": line, "message": message}


# ---- the checks ------------------------------------------------------------
def review_css(path, text, findings):
    body = _strip_comments(text)
    # 1. spacing on scale — raw px on a spacing prop must be in ALLOWED_PX
    for m in RAW_PX_DECL.finditer(body):
        prop = m.group("prop")
        if not any(prop == p or prop.startswith(p + "-") for p in PROPS_NEEDING_SPACE):
            continue
        val = m.group("val")
        if val not in ALLOWED_PX:
            line = body[:m.start()].count("\n") + 1
            findings.append(_f("blocker", "R1-space-scale", path, line,
                f"`{prop}: {val}px` is off the 4-px space scale; use a `--space-*` token "
                f"(allowed in-line px: {sorted(ALLOWED_PX, key=int)})"))
    # 2. literal transition/animation duration
    for m in LITERAL_DURATION_RE.finditer(body):
        if DURATION_TOKEN_RE.search(m.group(0)):
            continue
        line = body[:m.start()].count("\n") + 1
        findings.append(_f("blocker", "R2-motion-token", path, line,
            "Literal duration in a transition/animation; use `--duration-*` "
            "(or `--duration-crossfade` for opacity reveals)"))
    # 3. outline:none with no :focus-visible replacement -> blocker
    if OUTLINE_NONE.search(body) and ":focus-visible" not in body:
        findings.append(_f("blocker", "R3-focus-ring", path, 0,
            "`outline: none` without a `:focus-visible` replacement — focus ring missing"))
    # 4. interactive selector without a :focus-visible block — warn
    has_interactive = re.search(r"\b(button|\[role|\[type=|input|select|textarea|a[\s.:[])", body)
    if has_interactive and ":focus-visible" not in body:
        findings.append(_f("warn", "R3-focus-ring", path, 0,
            "Interactive CSS but no `:focus-visible` ring found"))
    # 5. raw font-size in a literal px/rem on a top-level rule -> use --text-*
    for m in re.finditer(r"font-size\s*:\s*(\d+(?:\.\d+)?(?:px|rem))\b", body):
        # allow when the value is wrapped in var() (covered above)
        line = body[:m.start()].count("\n") + 1
        # accept if the property is also referencing a token in the same rule
        block = body[max(0, m.start()-200): m.end()+200]
        if any(p in block for p in TYPE_TOKEN_PREFIXES):
            continue
        findings.append(_f("warn", "R4-type-scale", path, line,
            f"Literal `font-size: {m.group(1)}`; prefer a `--text-*` token"))


def review_html(path, text, findings):
    raw = text
    body = _strip_comments(text)
    # 6. heading order — h1 -> h2 -> h3, no jumps
    last = 0
    for m in HEAD_TAG_RE.finditer(body):
        level = int(m.group(1))
        if last and level > last + 1:
            line = body[:m.start()].count("\n") + 1
            findings.append(_f("warn", "R5-heading-order", path, line,
                f"Heading jumps from h{last} to h{level} (skip a level)"))
        last = max(last, level)
    # 7. img without alt
    for m in IMG_NO_ALT.finditer(body):
        line = body[:m.start()].count("\n") + 1
        findings.append(_f("blocker", "R6-alt-text", path, line,
            "`<img>` without an `alt` attribute (use `alt=\"\"` for decorative)"))
    # 8. <button> without type — defaults to submit, causes form-submit surprises
    for m in BUTTON_NO_TYPE.finditer(body):
        line = body[:m.start()].count("\n") + 1
        findings.append(_f("warn", "R7-button-type", path, line,
            "`<button>` without `type` — defaults to `submit`; declare `type=\"button\"` outside forms"))
    # 9. <div role="button"> — use <button>
    for m in DIV_BUTTON.finditer(body):
        line = body[:m.start()].count("\n") + 1
        findings.append(_f("warn", "R8-semantic-html", path, line,
            "`<div role=\"button\">` — use a real `<button>` element"))
    # 10. target="_blank" without rel
    for m in TARGET_BLANK_NO_REL.finditer(body):
        line = body[:m.start()].count("\n") + 1
        findings.append(_f("warn", "R9-target-blank", path, line,
            "`target=\"_blank\"` without `rel` — add `rel=\"noopener noreferrer\"`"))
    # 11. <html> missing lang (HTML doc only)
    if "<html" in raw.lower() and not LANG_ATTR.search(body):
        findings.append(_f("blocker", "R10-html-lang", path, 0,
            "`<html>` missing `lang` attribute (WCAG 3.1.1)"))
    # 12. bilingual coverage: english status word with no spanish twin nearby
    low = body.lower()
    for en, es in BILINGUAL_HINTS.items():
        if re.search(r"\b" + en + r"\b", low) and es not in low:
            findings.append(_f("warn", "R11-bilingual", path, 0,
                f"Status copy contains `{en}` but no Spanish twin (`{es}`); HISD audience is heavily bilingual — pair status strings"))
            break  # one is enough; don't spam
    # 13. status communicated via color class only — check there's a redundant icon/text cue
    for m in COLOR_ONLY_STATUS.finditer(body):
        # crude: look at the surrounding 200 chars for an icon or aria-label/aria-live
        block = body[max(0, m.start()-200): m.end()+400]
        if re.search(r"\b(aria-live|aria-label|aria-labelledby|role=\"(?:alert|status))|<svg|<img|<i\b", block):
            continue
        line = body[:m.start()].count("\n") + 1
        findings.append(_f("warn", "R12-color-only-status", path, line,
            "Status conveyed via color class with no nearby icon or `aria-live`/`aria-label` — "
            "status is never carried by color alone (Accessibility.md)"))
    # 14. inline style with raw color or pixel — soft warn
    for m in re.finditer(r'style\s*=\s*"[^"]*?(#[0-9a-fA-F]{3,6}|rgb\(|hsl\()', body):
        line = body[:m.start()].count("\n") + 1
        findings.append(_f("warn", "R13-inline-style", path, line,
            "Inline `style` with a raw color/hex — paint through tokens instead"))


def review_jsx(path, text, findings):
    # JSX/TSX — same as HTML but be lenient about expressions in attrs.
    review_html(path, text, findings)


def review_file(path, findings):
    try:
        text = open(path, encoding="utf-8").read()
    except (UnicodeDecodeError, FileNotFoundError):
        return
    if path.endswith(".css"):
        review_css(path, text, findings)
    elif path.endswith(".html"):
        review_html(path, text, findings)
    else:
        review_jsx(path, text, findings)


# ---- main ------------------------------------------------------------------
def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true", help="promote warns to blockers")
    args = ap.parse_args(argv)

    root = os.path.abspath(args.path)
    findings = []
    files = list(_iter_files(root)) if os.path.isdir(root) else [root]
    for f in files:
        review_file(f, findings)

    blockers = [f for f in findings if f["level"] == "blocker"] + ([f for f in findings if f["level"] == "warn"] if args.strict else [])
    warns = [] if args.strict else [f for f in findings if f["level"] == "warn"]
    score = round(100 * (len(files) - len({f["path"] for f in blockers})) / max(1, len(files)), 1)

    if args.json:
        print(json.dumps({"scanned": len(files), "blockers": len(blockers),
                          "warns": len(warns), "qualityScore": score, "findings": findings}, indent=2))
        return 1 if blockers else 0

    by_rule = {}
    for f in findings:
        by_rule.setdefault(f["rule"], {"blocker": 0, "warn": 0})[f["level"]] += 1
    print("HISD design review")
    print(f"  scanned {len(files)} file(s)")
    print(f"  quality score: {score}% (files clean of blockers)")
    print(f"  findings: {len(findings)} ({len(blockers)} blocker(s), {len(warns)} warn(s))")
    if by_rule:
        print("  by rule:")
        for rule, c in sorted(by_rule.items()):
            print("    %-22s blocker=%-3d warn=%-3d" % (rule, c["blocker"], c["warn"]))
    if blockers:
        print("\nBLOCKERS:")
        for f in blockers[:60]:
            loc = f["path"] + (":%d" % f["line"] if f["line"] else "")
            print(f"  [{f['rule']}] {loc}\n    {f['message']}")
    if warns and not args.strict:
        print("\nWARNINGS:")
        for f in warns[:30]:
            loc = f["path"] + (":%d" % f["line"] if f["line"] else "")
            print(f"  [{f['rule']}] {loc}\n    {f['message']}")
    return 1 if blockers else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
