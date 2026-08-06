"""Tests for scaffold.py — the per-medium on-brand starter generator.

scaffold.py has a `__main__` guard; we drive it via subprocess into a pytest tmp
`--out` dir so nothing is written to the repo. We assert each medium emits exactly
the files it promises.

The starter file is named from a slugified `name` argument; we pass a fixed name
("Demo Page") so the expected filename ("demo-page.html") is deterministic.
"""
import os

import pytest

from conftest import SCAFFOLD

NAME = "Demo Page"
SLUG = "demo-page"


def _files(d):
    return set(os.listdir(d))


def test_scaffold_powerbi(tmp_path, runner):
    out = tmp_path / "pbi"
    proc = runner([SCAFFOLD, "powerbi", NAME, "--out", str(out)])
    assert proc.returncode == 0, proc.stdout
    assert (out / "hisd-powerbi-theme.json").is_file()


@pytest.mark.parametrize("medium", ["web-page", "report"])
def test_scaffold_web_and_report_full_bundle(tmp_path, runner, medium):
    """web-page and report emit the HTML starter + theme CSS + fonts/ + logo."""
    out = tmp_path / medium
    proc = runner([SCAFFOLD, medium, NAME, "--out", str(out)])
    assert proc.returncode == 0, proc.stdout

    assert (out / f"{SLUG}.html").is_file(), f"missing starter html; got {_files(out)}"
    assert (out / "hisd-theme.css").is_file(), "missing hisd-theme.css"
    assert (out / "hisd-logo.svg").is_file(), "missing hisd-logo.svg"

    fonts = out / "fonts"
    assert fonts.is_dir(), "missing fonts/ directory"
    ttfs = [f for f in os.listdir(fonts) if f.lower().endswith(".ttf")]
    assert ttfs, "fonts/ contains no .ttf brand fonts"


def test_scaffold_email_html_only(tmp_path, runner):
    """email emits just the inline-styled HTML (no external CSS/fonts/logo)."""
    out = tmp_path / "email"
    proc = runner([SCAFFOLD, "email", NAME, "--out", str(out)])
    assert proc.returncode == 0, proc.stdout

    assert (out / f"{SLUG}.html").is_file(), f"missing email html; got {_files(out)}"
    # Email is self-contained inline styles — it must NOT drag in the css bundle.
    assert not (out / "hisd-theme.css").exists()
    assert not (out / "fonts").exists()
