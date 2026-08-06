"""Tests for lint_components.py — the brand/accessibility lint gate.

lint_components.py has a `__main__` guard, but we drive it via subprocess for
true end-to-end behavior (exit code included).

The script resolves the tree it lints as `COMPONENTS = <script dir>/../components`.
To prove the gate has teeth WITHOUT mutating the real components, we reconstruct a
minimal sandbox skill layout in a tmp dir:

    <tmp>/scripts/lint_components.py     (copy of the real script)
    <tmp>/components/*.css, *.html       (copy of the real component tree)

The copied script then resolves COMPONENTS to the sandbox `components/`, so a
raw-hex injection into one copied .css is what gets scanned — the real repo tree
is untouched.
"""
import os
import shutil

from conftest import COMPONENTS, LINT_COMPONENTS, SCRIPTS


def _sandbox(tmp_path):
    """Build <tmp>/scripts + <tmp>/components mirroring the real skill layout."""
    s_dir = tmp_path / "scripts"
    c_dir = tmp_path / "components"
    s_dir.mkdir()
    c_dir.mkdir()
    shutil.copy(LINT_COMPONENTS, s_dir / "lint_components.py")
    for fn in os.listdir(COMPONENTS):
        if fn.endswith((".css", ".html")):
            shutil.copy(os.path.join(COMPONENTS, fn), c_dir / fn)
    return s_dir / "lint_components.py", c_dir


def test_lint_passes_on_real_components(runner):
    """The real components/ tree is clean — the gate exits 0."""
    proc = runner([LINT_COMPONENTS])
    assert proc.returncode == 0, (
        f"lint_components reported blockers on the real tree (exit "
        f"{proc.returncode}):\n{proc.stdout}"
    )
    assert "No blockers" in proc.stdout


def test_lint_sandbox_copy_is_clean(tmp_path, runner):
    """A pristine sandbox copy also passes — proving the sandbox is faithful
    before we inject a fault into it."""
    script, _ = _sandbox(tmp_path)
    proc = runner([str(script)])
    assert proc.returncode == 0, proc.stdout


def test_lint_fails_on_injected_raw_hex(tmp_path, runner):
    """Injecting a raw-hex color declaration into a copied .css makes the gate
    exit 1 and report a raw-color blocker.

    The declaration is placed with the color property on its own line (the form
    the linter's line-oriented `prop: value` parser recognizes, mirroring the
    real components' formatting)."""
    script, c_dir = _sandbox(tmp_path)
    target = c_dir / "button.css"
    assert target.exists(), "sandbox is missing the component we planned to taint"
    with open(target, "a", encoding="utf-8") as fh:
        fh.write("\n.hisd-test-raw-hex {\n  color: #ff0000;\n}\n")

    proc = runner([str(script)])
    assert proc.returncode == 1, (
        f"lint did NOT block on an injected raw hex (exit {proc.returncode}):\n"
        + proc.stdout
    )
    assert "BLOCKER" in proc.stdout
    assert "raw color" in proc.stdout.lower()
    assert "#ff0000" in proc.stdout
