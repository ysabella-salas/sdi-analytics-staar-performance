"""Shared fixtures + path helpers for the HISD design-system script tests.

Everything resolves relative to THIS file, so the suite passes from any working
directory (CI checks out the repo and runs `pytest` from the repo root; a
developer might run it from the scripts/ dir). No path is ever taken from the
process CWD.

Hard rules honored throughout the suite:
  * The scripts under test that execute work AT IMPORT (build_tokens.py,
    catalog_assets.py) are NEVER imported — they are driven via subprocess only.
    See the module docstring of each test for the specific hazard.
  * The real repo tree is never mutated destructively. Tests that must touch the
    real tree (the idempotent build_tokens regeneration and the
    catalog_assets --resync-skill idempotency check) assert the working tree is
    left clean via `git status --porcelain`; everything else operates inside
    pytest tmp dirs on copies.
"""
import os
import shutil
import subprocess
import sys

import pytest

# Make this directory importable as a plain `conftest` module name, so the test
# modules can `from conftest import ...` regardless of how pytest was invoked
# (from the repo root, from scripts/, or as `pytest tests`). conftest.py is
# imported by pytest before the sibling test modules in this dir, so inserting
# the path here is in time for those imports to resolve.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# --- canonical paths, all relative to this test file --------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, ".."))                 # .../scripts
SKILL = os.path.normpath(os.path.join(SCRIPTS, ".."))               # .../hisd-brand-designer
ASSETS = os.path.join(SKILL, "assets")
COMPONENTS = os.path.join(SKILL, "components")
REPO = os.path.normpath(os.path.join(SKILL, "..", ".."))            # repo root

# Individual scripts
BUILD_TOKENS = os.path.join(SCRIPTS, "build_tokens.py")
CATALOG_ASSETS = os.path.join(SCRIPTS, "catalog_assets.py")
LINT_COMPONENTS = os.path.join(SCRIPTS, "lint_components.py")
SCAFFOLD = os.path.join(SCRIPTS, "scaffold.py")
VALIDATE_TOKENS = os.path.join(SCRIPTS, "validate_tokens.py")
BRAND_SCAN = os.path.join(SCRIPTS, "brand_scan.py")


def run(args, cwd=None, timeout=180):
    """Run `python3 <args...>` as a subprocess and return the CompletedProcess.

    stdout and stderr are captured together (text mode) so assertions can look
    at the combined output regardless of which stream a script printed on. The
    deliberate choice of subprocess (never `import`) is the whole point for the
    import-time-side-effect scripts; using it everywhere keeps the harness
    uniform and tests true end-to-end behavior including the exit code.
    """
    proc = subprocess.run(
        [sys.executable, *args],
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
    )
    return proc


def git_porcelain(*paths):
    """`git status --porcelain` for the given repo paths (default: whole repo).

    Returns the raw (stripped) output. Empty string means a clean working tree
    for those paths. Returns None if git is unavailable or this is not a work
    tree, so a test can skip rather than fail spuriously.
    """
    try:
        proc = subprocess.run(
            ["git", "-C", REPO, "status", "--porcelain", *paths],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


# --- pytest fixtures ----------------------------------------------------------
@pytest.fixture(scope="session")
def paths():
    """A namespace of the resolved script/asset paths for the suite."""
    ns = {
        "HERE": HERE, "SCRIPTS": SCRIPTS, "SKILL": SKILL, "ASSETS": ASSETS,
        "COMPONENTS": COMPONENTS, "REPO": REPO,
        "BUILD_TOKENS": BUILD_TOKENS, "CATALOG_ASSETS": CATALOG_ASSETS,
        "LINT_COMPONENTS": LINT_COMPONENTS, "SCAFFOLD": SCAFFOLD,
        "VALIDATE_TOKENS": VALIDATE_TOKENS, "BRAND_SCAN": BRAND_SCAN,
    }
    return ns


@pytest.fixture
def runner():
    """Expose the subprocess runner to tests."""
    return run


@pytest.fixture
def copy_tree():
    """Return a helper that copies a source tree into a tmp dir (non-mutating).

    Used to give a script a sandboxed copy of the real `scripts/` or
    `components/` tree so a test can inject a fault into the COPY without ever
    touching the real repo.
    """
    def _copy(src, dst):
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".DS_Store"))
        return dst
    return _copy
