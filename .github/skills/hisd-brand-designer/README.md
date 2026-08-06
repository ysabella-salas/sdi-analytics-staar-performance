# HISD Brand Designer skill

The operational front door to the HISD "Connected Futures" design system. It applies
the Houston ISD brand to any medium — apps, sites, reports, Power BI dashboards, print,
presentations, email, and social — in light and dark, accessibly.

Read [`SKILL.md`](SKILL.md) first.

## Layout

```
hisd-brand-designer/
  SKILL.md                  front door: when to use, the kit, the procedure (slim identity frontmatter)
  skill.manifest.json       authoritative Lamplighter skill contract (type, scripts, validation, versioning)
  versioning/
    version.manifest.json   authoritative semver version
    CHANGELOG.md            Keep-a-Changelog history
  scripts/
    build_tokens.py         generate all token artifacts from the brand source (+ contrast gate)
    make_asset_manifest.py  scan the toolkit -> brand-assets.json
    scaffold.py             scaffold an on-brand starter (web-page|email|report|deck|powerbi)
    build_components.py     bundle components.css + generate the gallery
    lint_components.py      mechanical gate: tokens-only color + visible focus ring
  assets/                   generated + vendored, ready to use
    hisd-theme.css          CSS custom properties, light + dark
    hisd.tokens.json        DTCG design tokens
    hisd-tokens.scss        Sass variables
    hisd-powerbi-theme.json Power BI / Fabric theme
    hisd-tokens.js          token data for scripts
    brand-assets.json       skill-relative paths to the vendored logos + fonts
    style-guide.html        living style guide (open in a browser)
    contrast-report.md      WCAG AA proof for every semantic pairing
    logos/                  vendored HISD logo lockups (real SVGs, by family)
    fonts/                  vendored brand typefaces (+ their OFL licenses)
  reference/
    model-summary.md        the bundled design-system specification
    Conventions.md          token names, theme switching, do/don't
    Media-Playbooks.md      a recipe per medium
    Logo-And-Assets.md      logo rules + where the files live
    Accessibility-Checklist.md  the AA gate
    Rayfin-App-Styling.md   Rayfin/Fabric app header, toggle, button, and chip defaults
```

## Quick start

```bash
python3 scripts/build_tokens.py            # (re)generate the token artifacts
python3 scripts/scaffold.py web-page "My Tool"   # on-brand starter, wired to the tokens
open assets/style-guide.html               # see every token + component, light & dark
```

The model this skill applies is bundled at
[`reference/model-summary.md`](reference/model-summary.md), so the skill is
self-contained when vendored into another repo; the full authored model lives at
`Docs/Design-System/` in the source repo. Token artifacts are generated — edit the
brand source in `scripts/build_tokens.py`, not the outputs.

## Portability

This folder is **fully self-contained** — copy it anywhere (any repo, any path)
and everything works with **no external dependencies** beyond Python 3 stdlib:

- All scripts resolve paths relative to themselves, not to a fixed `.skills/`
  location, so the skill runs the same from `vendor/`, `.claude/skills/`, etc.
- Tokens, the three brand typefaces, every logo lockup, the icon set, and the
  bundled spec all ship inside `assets/` and `reference/` — nothing is fetched.
- `scripts/brand_scan.py` skips the skill's own source-of-truth files by a path
  relative to the skill root, so it stays accurate wherever the skill lives.
- `scripts/catalog_assets.py` is a source-repo provenance tool; outside the
  source repo it prints a guidance message and exits cleanly (it is never needed
  to *use* the skill).

## Vendor-lane adapters (where each agent finds the skill)

The canonical body lives **once** at `.skills/design/hisd-brand-designer/`. Each vendor lane
consumes a **thin pointer adapter** that references the canonical `SKILL.md` and
**never copies it** (per the Lamplighter `Skill-Adapter` model). Run the
projection step to (re)generate them:

```bash
python3 .skills/design/hisd-brand-designer/scripts/project_adapters.py --apply   # write
python3 .skills/design/hisd-brand-designer/scripts/project_adapters.py --check   # drift gate (in CI)
```

| Lane | Pointer (generated, ~1.5 KB) | Extra | Surface |
|---|---|---|---|
| Claude Code | `.claude/skills/hisd-brand-designer/SKILL.md` | — | `CLAUDE.md` |
| Codex | `.agents/skills/hisd-brand-designer/SKILL.md` | `agents/openai.yaml` | `AGENTS.md` |
| GitHub Copilot | `.github/agents/hisd-brand-designer.agent.md` | — | `.github/copilot-instructions.md` |
| Gemini | `.gemini/extensions/hisd-brand-designer/GEMINI.md` | `gemini-extension.json` | `GEMINI.md` |

(`.codex/` is reserved for `hooks.json`; this skill ships no hooks, so nothing
lands there.) The assistant ZIP lanes (Claude.ai upload, OpenAI dev-API) are
**not** projected — at 155 MB / 1,310 files the skill exceeds their 50 MB /
500-file budget, a limit that binds a full-copy zip but not a thin adapter.

## Installing into another repo

Vendoring this skill into a different repo is a two-step process — the canonical
body, **plus** the lane adapters (each repo needs its own, because they point at
the canonical path local to that repo):

```bash
# 1) Drop the canonical body in (this directory, all of it).
mkdir -p /path/to/target-repo/.skills/design
cp -R /path/to/HISD_Design/.skills/design/hisd-brand-designer  /path/to/target-repo/.skills/design/

# 2) Generate the target repo's adapters from inside its checkout.
cd /path/to/target-repo
python3 .skills/design/hisd-brand-designer/scripts/project_adapters.py --apply
```

That writes the four lane pointers above into the target repo. Re-run
`project_adapters.py --apply` after any future canonical update; in CI, run
`--check` to fail the build on drift.

### Evolving the skill in host repos

**This is encouraged, not forbidden.** The vendored canonical body in a host repo
(`.skills/.../hisd-brand-designer/`) is meant to evolve as that repo's team uses and
refines the skill — add a component variant, improve a script, tune a token,
extend a platform kit. What the drift gate enforces is *only* that each repo's
**thin lane adapters** (`.claude/skills/...`, `.agents/skills/...`, etc.) stay in
sync with that repo's own canonical body — nothing more. So:

- ✅ Edit `.skills/.../hisd-brand-designer/` (canonical body) in any host repo and ship it.
- ✅ Re-run `project_adapters.py --apply` so the lane adapters reflect your changes.
- 🚫 Don't hand-edit the lane adapter `SKILL.md` files (they're generated; the
  drift gate will flag a hand-edit). Edit the canonical body and regenerate.
- 🔄 Flow learnings back to **Wonder-Forge/HISD_Design** so other host repos
  benefit — open a PR there with the improvement; bump the source version per
  the [skill CHANGELOG](versioning/CHANGELOG.md). That makes HISD_Design the
  shared upstream; host repos move at their own pace and merge upstream when they
  want to (manual sync from diffs, per the project's distribution model).

The lane adapters reference the canonical path *within the same repo* — they
don't lock you to any external upstream, which is exactly what lets a host repo
diverge, refine, and reintegrate.

Some asset generators (`generate_app_icons.py`, the social `make_card.py`) try
several SVG→PNG renderers in order, ending in a **headless browser** — Microsoft
Edge on Windows, Chrome/Chromium on macOS+Linux — so they work out of the box
on all three. Pin with `HISD_RASTERIZER` if needed.
