#!/usr/bin/env python3
"""DTCG conformance validator for the HISD design tokens.

Validates ``assets/hisd.tokens.json`` against the Design Tokens Community Group
(DTCG) ``$value``/``$type`` leaf convention and the structural contract this
brand actually uses. The companion JSON Schema at
``assets/hisd.tokens.schema.json`` captures the same structure declaratively;
this script is the authoritative, dependency-free gate (CI-friendly).

Checks performed:
  * the file is valid JSON;
  * every leaf carrying ``$value`` also carries ``$type`` (and vice versa), and
    every ``$type`` is in the vocabulary the file uses:
    color, gradient, dimension, fontFamily, fontWeight, number, duration,
    shadow, cubicBezier;
  * every ``color`` leaf's ``$value`` is a valid CSS hex string
    (#RGB / #RGBA / #RRGGBB / #RRGGBBAA) **or** a DTCG alias reference
    (``{group.token}``) that resolves to another color token in the file;
  * every ``gradient`` leaf's ``$value`` is a CSS gradient function string
    (the composite Ribbon recipes; DTCG has no scalar gradient form);
  * the structural groups that exist in the real file are present and shaped
    right: 8 reference color ramps (each a 50-950 scale), a brand palette, the
    semantic ``theme.light`` / ``theme.dark`` themes, ``dataviz.categorical``,
    the ``font`` family/size/weight scales, ``space``, ``radius``, light/dark
    ``elevation`` shadow scales, and ``motion`` duration/easing.

Usage:
    python3 validate_tokens.py                # human-readable; exit 1 on failure
    python3 validate_tokens.py --json         # machine-readable report
    python3 validate_tokens.py path/to.json   # validate a specific file

Exit code is 0 when clean, 1 on any violation, 2 on usage/IO errors. The module
is import-safe: nothing runs at import time, so ``validate_file`` can be reused
from other tooling.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TOKENS = os.path.normpath(os.path.join(HERE, "..", "assets", "hisd.tokens.json"))
SCHEMA_PATH = os.path.normpath(os.path.join(HERE, "..", "assets", "hisd.tokens.schema.json"))

# The $type vocabulary the real file uses. Any leaf with a $type outside this
# set is a violation (catches typos and undeclared token kinds).
ALLOWED_TYPES = frozenset({
    "color", "gradient", "dimension", "fontFamily", "fontWeight",
    "number", "duration", "shadow", "cubicBezier",
})

# CSS hex color: #RGB, #RGBA, #RRGGBB, #RRGGBBAA.
HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

# DTCG alias reference, e.g. "{theme.light.ribbon-from}". The captured group is
# the dotted token path within this document.
ALIAS_RE = re.compile(r"^\{([A-Za-z0-9_][A-Za-z0-9_.\-]*)\}$")


def _resolve_alias(root, ref, _seen=None):
    """Resolve a DTCG alias like ``{theme.light.ribbon-from}`` to its target node.

    Follows chained aliases and guards against cycles. Returns
    ``(node, None)`` on success or ``(None, error_message)`` on failure.
    """
    _seen = set() if _seen is None else _seen
    m = ALIAS_RE.match(ref)
    if not m:
        return None, "is not a well-formed alias"
    dotted = m.group(1)
    if dotted in _seen:
        return None, f"forms an alias cycle through {dotted!r}"
    _seen.add(dotted)
    node = root
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return None, f"does not resolve (no '{part}')"
        node = node[part]
    target_val = node.get("$value") if isinstance(node, dict) else None
    if isinstance(target_val, str) and ALIAS_RE.match(target_val):
        return _resolve_alias(root, target_val, _seen)
    return node, None

# The expected steps of a reference color ramp.
RAMP_STEPS = ("50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950")

# DTCG reserved keys that may appear on a token or group alongside content.
RESERVED_KEYS = frozenset({"$value", "$type", "$description", "$extensions", "$deprecated"})


def _is_token(node):
    """A DTCG token is a dict carrying a ``$value`` key."""
    return isinstance(node, dict) and "$value" in node


def _path(parts):
    return ".".join(parts) if parts else "<root>"


def walk_leaves(node, violations, parts=None, root=None):
    """Recurse the token tree, validating every ``$value``/``$type`` leaf.

    Mutates ``violations`` (a list of strings) in place. A node is treated as a
    token the moment it has ``$value``; otherwise it is treated as a group and
    we recurse into its non-reserved children. ``root`` is the document top,
    used to resolve DTCG alias references; it defaults to ``node`` on the first
    call.
    """
    parts = parts or []
    if root is None:
        root = node
    if not isinstance(node, dict):
        return

    if _is_token(node):
        loc = _path(parts)
        tok_type = node.get("$type")
        if "$type" not in node:
            violations.append(f"{loc}: leaf has $value but no $type")
        elif not isinstance(tok_type, str):
            violations.append(f"{loc}: $type must be a string, got {type(tok_type).__name__}")
        elif tok_type not in ALLOWED_TYPES:
            violations.append(
                f"{loc}: $type '{tok_type}' not in allowed set "
                f"({', '.join(sorted(ALLOWED_TYPES))})"
            )

        # color leaves carry a valid hex string OR a DTCG alias that resolves
        # to another color token.
        if tok_type == "color":
            val = node.get("$value")
            if isinstance(val, str) and ALIAS_RE.match(val):
                target, err = _resolve_alias(root, val)
                if err:
                    violations.append(f"{loc}: color alias {val!r} {err}")
                elif not (isinstance(target, dict) and target.get("$type") == "color"):
                    violations.append(
                        f"{loc}: color alias {val!r} does not resolve to a color token")
            elif not isinstance(val, str) or not HEX_RE.match(val):
                violations.append(
                    f"{loc}: color $value {val!r} is not a valid hex color or token alias")

        # gradient leaves carry a CSS gradient function string (the composite
        # Ribbon recipes); DTCG defines no scalar gradient form.
        elif tok_type == "gradient":
            val = node.get("$value")
            if not isinstance(val, str) or "gradient(" not in val:
                violations.append(
                    f"{loc}: gradient $value {val!r} is not a CSS gradient string")

        # A token should not also nest child token groups; recurse only into
        # non-reserved keys to catch a misplaced $value-less child object.
        for key, child in node.items():
            if key in RESERVED_KEYS:
                continue
            if isinstance(child, dict):
                walk_leaves(child, violations, parts + [key], root)
        return

    # Stray $type with no $value (the inverse defect).
    if "$type" in node:
        violations.append(f"{_path(parts)}: node has $type but no $value")

    for key, child in node.items():
        if key.startswith("$"):
            continue
        if isinstance(child, dict):
            walk_leaves(child, violations, parts + [key], root)


def _require_group(data, key, violations):
    grp = data.get(key)
    if not isinstance(grp, dict):
        violations.append(f"missing or malformed top-level group: '{key}'")
        return None
    return grp


def check_structure(data, violations):
    """Assert the structural groups the real HISD token file is built from."""
    if not isinstance(data, dict):
        violations.append("root: token document must be a JSON object")
        return

    # --- reference color ramps -------------------------------------------------
    color = _require_group(data, "color", violations)
    if color is not None:
        ramps = [k for k, v in color.items() if not k.startswith("$") and isinstance(v, dict)]
        if len(ramps) < 8:
            violations.append(
                f"color: expected at least 8 reference ramps, found {len(ramps)} "
                f"({', '.join(sorted(ramps)) or 'none'})"
            )
        for name in ramps:
            ramp = color[name]
            missing = [s for s in RAMP_STEPS if s not in ramp]
            if missing:
                violations.append(
                    f"color.{name}: ramp missing steps {', '.join(missing)}"
                )

    # --- brand palette ---------------------------------------------------------
    brand = _require_group(data, "brand", violations)
    if brand is not None:
        brand_tokens = [k for k in brand if not k.startswith("$")]
        if not brand_tokens:
            violations.append("brand: palette is empty")

    # --- semantic themes -------------------------------------------------------
    theme = _require_group(data, "theme", violations)
    if theme is not None:
        for mode in ("light", "dark"):
            sub = theme.get(mode)
            if not isinstance(sub, dict) or not any(_is_token(v) for v in sub.values() if isinstance(v, dict)):
                violations.append(f"theme.{mode}: missing or contains no color tokens")

    # --- dataviz categorical ---------------------------------------------------
    dataviz = data.get("dataviz")
    if isinstance(dataviz, dict):
        cat = dataviz.get("categorical")
        if not isinstance(cat, dict) or not cat:
            violations.append("dataviz.categorical: missing or empty")
    else:
        violations.append("missing or malformed top-level group: 'dataviz'")

    # --- typography ------------------------------------------------------------
    font = _require_group(data, "font", violations)
    if font is not None:
        for sub in ("family", "size", "weight"):
            if not isinstance(font.get(sub), dict) or not font[sub]:
                violations.append(f"font.{sub}: missing or empty")

    # --- spacing & radius ------------------------------------------------------
    for key in ("space", "radius"):
        grp = _require_group(data, key, violations)
        if grp is not None and not any(_is_token(v) for v in grp.values() if isinstance(v, dict)):
            violations.append(f"{key}: contains no dimension tokens")

    # --- elevation (light/dark shadow scales) ----------------------------------
    elevation = _require_group(data, "elevation", violations)
    if elevation is not None:
        for mode in ("light", "dark"):
            sub = elevation.get(mode)
            if not isinstance(sub, dict) or not sub:
                violations.append(f"elevation.{mode}: missing or empty shadow scale")

    # --- motion ----------------------------------------------------------------
    motion = _require_group(data, "motion", violations)
    if motion is not None:
        for sub in ("duration", "easing"):
            if not isinstance(motion.get(sub), dict) or not motion[sub]:
                violations.append(f"motion.{sub}: missing or empty")


def validate_file(path):
    """Validate the token file at ``path``.

    Returns ``(violations, stats)``. ``violations`` is a list of human-readable
    strings (empty means conformant). ``stats`` is a dict with simple counts.
    Raises no exceptions for token defects; raises ``OSError`` only if the file
    cannot be read and re-raises nothing for JSON errors (reported as a
    violation instead).
    """
    violations = []
    stats = {"leaves": 0, "types": {}}

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        return [f"invalid JSON: {exc}"], stats

    # Count leaves / type distribution for the report (independent of checks).
    def _tally(node):
        if isinstance(node, dict):
            if _is_token(node):
                stats["leaves"] += 1
                t = node.get("$type")
                if isinstance(t, str):
                    stats["types"][t] = stats["types"].get(t, 0) + 1
            for k, v in node.items():
                if not k.startswith("$"):
                    _tally(v)
    _tally(data)

    walk_leaves(data, violations)
    check_structure(data, violations)
    return violations, stats


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in argv
    positionals = [a for a in argv if not a.startswith("-")]
    path = positionals[0] if positionals else DEFAULT_TOKENS

    if not os.path.exists(path):
        msg = f"token file not found: {path}"
        print(json.dumps({"ok": False, "error": msg}) if as_json else msg, file=sys.stderr)
        return 2

    try:
        violations, stats = validate_file(path)
    except OSError as exc:
        msg = f"could not read {path}: {exc}"
        print(json.dumps({"ok": False, "error": msg}) if as_json else msg, file=sys.stderr)
        return 2

    ok = not violations

    if as_json:
        print(json.dumps({
            "ok": ok,
            "file": path,
            "schema": SCHEMA_PATH,
            "leaves": stats["leaves"],
            "types": stats["types"],
            "violations": violations,
        }, indent=2))
    else:
        print(f"Validated {os.path.basename(path)}: "
              f"{stats['leaves']} token leaves across {len(stats['types'])} type(s).")
        if stats["types"]:
            dist = ", ".join(f"{t}:{n}" for t, n in sorted(stats["types"].items()))
            print(f"  types: {dist}")
        if violations:
            print(f"\n{len(violations)} VIOLATION(S):")
            for v in violations:
                print(f"  x {v}")
        else:
            print("\nok - DTCG-conformant: every leaf has $value+$type, "
                  "colors are valid hex, and all structural groups are present.")

    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
