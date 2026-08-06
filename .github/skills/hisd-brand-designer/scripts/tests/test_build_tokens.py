"""Tests for build_tokens.py — the token build + WCAG contrast gate.

HARD CONSTRAINT (do not relax): build_tokens.py runs its FULL generation AND the
contrast gate (which can `sys.exit(1)`) at MODULE IMPORT time. It must therefore
NEVER be `import`ed — it is exercised purely through subprocess. The
contrast-gate-with-teeth test operates on a COPY of the script in a tmp dir, so
the real palette is never patched.

The "happy path" test runs the REAL build_tokens.py. That is safe and
non-mutating because the build is deterministic and the committed outputs already
match its output (the repo's CI enforces zero generated-artifact drift); the test
additionally asserts `git status --porcelain` for the five outputs is clean after
the run, proving the run did not alter the tracked tree.
"""
import os
import re

import pytest

from conftest import ASSETS, BUILD_TOKENS, git_porcelain

OUTPUTS = [
    "hisd-theme.css",
    "hisd.tokens.json",
    "hisd-tokens.scss",
    "hisd-powerbi-theme.json",
    "contrast-report.md",
]


def test_build_tokens_exits_zero_and_writes_outputs(runner):
    """A clean run exits 0 and (re)writes every promised artifact."""
    before = {f: os.path.exists(os.path.join(ASSETS, f)) for f in OUTPUTS}
    proc = runner([BUILD_TOKENS])
    assert proc.returncode == 0, f"build_tokens exited {proc.returncode}:\n{proc.stdout}"

    for f in OUTPUTS:
        p = os.path.join(ASSETS, f)
        assert os.path.exists(p), f"expected output not written: {p}"
        assert os.path.getsize(p) > 0, f"output is empty: {p}"

    # Sanity: the run reported writing the tokens.
    assert "Wrote tokens to" in proc.stdout


def test_build_tokens_run_leaves_tracked_tree_clean(runner):
    """The deterministic build must not drift the committed outputs.

    This is the non-mutation guard: after running the real script, the five
    tracked outputs show no `git status --porcelain` change. Skips cleanly if
    git is unavailable (e.g. running from an exported tarball).
    """
    baseline = git_porcelain(*[os.path.join(ASSETS, f) for f in OUTPUTS])
    if baseline is None:
        pytest.skip("git not available / not a work tree")
    assert baseline == "", (
        "outputs were already dirty before the test; refusing to assert "
        f"idempotency against a dirty baseline:\n{baseline}"
    )
    proc = runner([BUILD_TOKENS])
    assert proc.returncode == 0, proc.stdout
    after = git_porcelain(*[os.path.join(ASSETS, f) for f in OUTPUTS])
    assert after == "", f"build_tokens drifted the tracked tree:\n{after}"


def test_contrast_report_passes_with_no_unaccepted_failures(runner):
    """contrast-report.md contains PASS and every FAIL is an accepted exception.

    The report legitimately lists a couple of "decorative hairline" rows as
    `FAIL (accepted: ...)`; those are consciously documented and out of the
    gate. The invariant we assert is: there is at least one PASS, and NO line
    contains "FAIL" without also carrying the "accepted" marker.
    """
    proc = runner([BUILD_TOKENS])
    assert proc.returncode == 0, proc.stdout

    report = os.path.join(ASSETS, "contrast-report.md")
    text = open(report, encoding="utf-8").read()
    assert "PASS" in text, "contrast report has no PASS rows"

    unaccepted = [
        ln for ln in text.splitlines()
        if "FAIL" in ln and "accepted" not in ln.lower()
    ]
    assert not unaccepted, (
        "contrast report has un-accepted FAIL row(s):\n" + "\n".join(unaccepted)
    )


def test_contrast_gate_has_teeth(tmp_path, runner):
    """Patch a semantic pairing to an AA-failing value on a COPY and prove the
    gate blocks the build with exit 1 + "CONTRAST GATE FAILED".

    We copy build_tokens.py into a tmp dir and rewrite the light-theme `action`
    color to a near-white hex. `on-action` is white, so white-on-near-white
    drops far below 4.5:1 and the required pairing `on-action/action` regresses.
    The real script is never touched; the copy writes its own (throwaway) assets
    dir next to itself in tmp.
    """
    src = open(BUILD_TOKENS, encoding="utf-8").read()

    # Match the light-theme action line robustly (whitespace-agnostic) and
    # replace its value with a near-white hex that fails AA against white text.
    patched, n = re.subn(
        r'("action":\s*)ref\("teal",\s*700\)',
        r'\1"#FFFFF0"',
        src,
        count=1,
    )
    assert n == 1, "could not locate the light-theme `action` pairing to patch"

    copy = tmp_path / "build_tokens.py"
    copy.write_text(patched, encoding="utf-8")

    proc = runner([str(copy)])
    assert proc.returncode == 1, (
        f"contrast gate did NOT fail on an AA-breaking palette (exit "
        f"{proc.returncode}):\n{proc.stdout}"
    )
    assert "CONTRAST GATE FAILED" in proc.stdout, (
        "expected the gate's failure banner in output:\n" + proc.stdout
    )
    # And it should name the specific regressed pairing.
    assert "on-action/action" in proc.stdout
