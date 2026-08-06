"""Tests for brand_scan.py — the generalized "teal test" brand-conformance scan.

Driven via subprocess (it has a `__main__` guard and an importable `main`, but
the suite stays uniform on subprocess for exit-code fidelity).

  * Default (no --strict) is report-only and ALWAYS exits 0, even when it finds
    smells — so a plain repo scan exits 0 by contract.
  * `--strict` turns findings into a failing build. Pointed at a planted
    off-brand file (a raw hex on a color property), it exits 1.
  * `--strict` on a clean, on-brand fixture still exits 0 — proving the failure
    above is caused by the fault, not by --strict itself.

All fixtures live in tmp dirs; the real repo tree is only ever read.
"""
import os

import pytest

from conftest import BRAND_SCAN, REPO

pytestmark = pytest.mark.skipif(
    not os.path.exists(BRAND_SCAN),
    reason="brand_scan.py not present in this checkout",
)

OFF_BRAND_CSS = """.promo {
  color: #ff0000;
  background: rgb(0, 128, 255);
}
"""

ON_BRAND_CSS = """.promo {
  color: var(--color-text);
  background: var(--color-surface);
  font-family: var(--font-sans);
}
.promo:focus-visible {
  outline: 3px solid var(--color-focus);
}
"""


def test_default_repo_scan_is_report_only_exit_zero(runner):
    """A default scan of the repo is advisory and exits 0 regardless of findings."""
    proc = runner([BRAND_SCAN], timeout=240)
    assert proc.returncode == 0, (
        f"default brand scan should be report-only (exit 0), got "
        f"{proc.returncode}:\n{proc.stdout[:2000]}"
    )
    assert "brand scan" in proc.stdout.lower()


def test_strict_flags_offbrand_file(tmp_path, runner):
    """--strict on a planted off-brand file exits 1 and names a raw-color finding."""
    f = tmp_path / "offbrand.css"
    f.write_text(OFF_BRAND_CSS, encoding="utf-8")

    proc = runner([BRAND_SCAN, "--strict", str(f)])
    assert proc.returncode == 1, (
        f"--strict did NOT fail on an off-brand file (exit {proc.returncode}):\n"
        + proc.stdout
    )
    assert "RAW_COLOR" in proc.stdout


def test_strict_passes_on_clean_fixture(tmp_path, runner):
    """--strict on an on-brand fixture exits 0 — isolating the failure cause."""
    f = tmp_path / "onbrand.css"
    f.write_text(ON_BRAND_CSS, encoding="utf-8")

    proc = runner([BRAND_SCAN, "--strict", str(f)])
    assert proc.returncode == 0, (
        f"--strict flagged a clean on-brand file (exit {proc.returncode}):\n"
        + proc.stdout
    )
