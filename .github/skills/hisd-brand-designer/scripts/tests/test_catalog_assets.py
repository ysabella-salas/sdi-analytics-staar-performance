"""Tests for catalog_assets.py — the brand-asset cataloguer / skill re-vendorer.

HARD CONSTRAINT: catalog_assets.py runs its argparse dispatch AND (in the default
mode) destructive extraction logic at MODULE IMPORT — so it is driven via
subprocess only, never imported.

Two behaviors are covered:

  * No-arg run is guarded: the source toolkit (`References/HISD-Branding-Toolkit`)
    was removed after the one-time extraction, so a default run prints the guard
    message and exits 2. (If a developer has restored the toolkit locally the
    default run would do real work; we skip rather than fail in that case.)

  * `--resync-skill` re-vendors the skill's logos from the durable repo catalog
    (Artifacts/Brand-Assets) and is idempotent: it exits 0 and leaves the tracked
    `assets/logos` tree byte-identical, i.e. `git status --porcelain` for that
    subtree is EMPTY afterward. This is a strong, safe assertion — it proves the
    operation is non-mutating against an already-vendored tree.
"""
import os

import pytest

from conftest import CATALOG_ASSETS, REPO, SKILL, git_porcelain

TOOLKIT = os.path.join(REPO, "References", "HISD-Branding-Toolkit")
ARTIFACTS = os.path.join(REPO, "Artifacts", "Brand-Assets")
LOGOS_REL = os.path.relpath(os.path.join(SKILL, "assets", "logos"), REPO)


def test_no_arg_run_is_toolkit_absent_guarded(runner):
    """With the toolkit removed, a plain run exits 2 and explains why."""
    if os.path.isdir(TOOLKIT):
        pytest.skip("toolkit clone is present locally; default run would extract")
    proc = runner([CATALOG_ASSETS])
    assert proc.returncode == 2, (
        f"expected the toolkit-absent guard to exit 2, got {proc.returncode}:\n"
        + proc.stdout
    )
    assert "Source toolkit not present" in proc.stdout
    assert "--resync-skill" in proc.stdout


def test_resync_skill_is_idempotent_and_non_mutating(runner):
    """`--resync-skill` exits 0 and leaves assets/logos git-clean.

    Requires the durable repo catalog to resync from. If git is unavailable,
    or the logos subtree is already dirty before we start, we skip rather than
    make a flaky or destructive assertion.
    """
    if not os.path.isdir(ARTIFACTS):
        pytest.skip("Artifacts/Brand-Assets catalog absent; nothing to resync from")

    baseline = git_porcelain(LOGOS_REL)
    if baseline is None:
        pytest.skip("git not available / not a work tree")
    if baseline != "":
        pytest.skip(f"assets/logos already dirty before test:\n{baseline}")

    proc = runner([CATALOG_ASSETS, "--resync-skill"])
    assert proc.returncode == 0, (
        f"--resync-skill exited {proc.returncode}:\n{proc.stdout}"
    )
    assert "Re-vendored skill" in proc.stdout

    after = git_porcelain(LOGOS_REL)
    assert after == "", (
        "--resync-skill mutated the tracked assets/logos tree (not idempotent):\n"
        + after
    )
