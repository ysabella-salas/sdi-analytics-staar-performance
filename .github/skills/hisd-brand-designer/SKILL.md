---
name: hisd-brand-designer
description: >-
  Design, brand, and theme any HISD (Houston Independent School District) media —
  web apps, websites, reports, Power BI / Fabric dashboards, print pieces, letterhead,
  presentations, emails, and social graphics — with the HISD design system. Use when
  creating or restyling an HISD artifact, generating CSS/theme/token files, choosing
  on-brand and accessible colors or typography, placing the HISD logo, or building
  light and dark themes. Embeds the HISD brand palette, the three brand typefaces,
  logo and asset paths, and generated tokens (CSS custom properties, DTCG JSON, Sass,
  and a Power BI theme). Not for non-HISD branding or for rewriting the brand guidelines.
version: 1.3.0
license: Apache-2.0
compatibility: requires python3 (>=3.8 stdlib)
family: design
---

# HISD Brand Designer

Operational front door to the HISD design system — the "Connected Futures" design
language. This skill applies the system to real media: it carries the brand tokens
and assets and a procedure for theming anything from a web app to a printed flyer,
in light and dark, accessibly.

The model (the durable specification) is bundled as
[`reference/model-summary.md`](reference/model-summary.md) so the skill is self-contained
in any repo; the full authored model lives under `Docs/Design-System/` in the source
repo. This skill is how you use it. The tokens are generated from one source, so the
brand stays consistent across every consumer.

This is a **tool-bearing Lamplighter skill**: the canonical body + scripts +
assets live once at `.skills/design/hisd-brand-designer/`; each vendor lane consumes a thin
pointer adapter (`.claude/skills/`, `.agents/skills/` + `agents/openai.yaml`,
`.github/agents/`, `.gemini/extensions/`) that references this `SKILL.md` and
never copies it. Run `python3 scripts/project_adapters.py --apply` to (re)generate
them; `--check` is a drift gate (wired into CI).

**Host repos are encouraged to evolve this skill in place.** Each Wonder-Forge
repo that vendors the skill carries its own canonical copy under `.skills/.../`
and is free to refine tokens, add components, tune scripts, or extend platform
kits as that repo's work surfaces real needs. The drift gate only requires the
lane adapters to track *that repo's own canonical body* — it doesn't lock you to
any external upstream. Flow learnings back to **Wonder-Forge/HISD_Design** as
PRs; that's the shared upstream and the source of truth for the brand. See the
[README](README.md) for the install-into-another-repo workflow and the
evolve-and-reintegrate notes.

## When To Use

Use this skill to brand or theme an HISD artifact: build or restyle an app, site, or
component; generate a CSS theme, a token file, or a Power BI theme; pick on-brand,
WCAG-compliant colors and type; place the logo correctly; lay out a report, deck,
letterhead, email, or social graphic; or add a light/dark mode. Bring an off-brand
artifact onto the brand. Do not use it to invent a new brand or edit the official
guidelines — those are owned by the HISD Communications Department and the official
Branding Toolkit (see [`reference/Logo-And-Assets.md`](reference/Logo-And-Assets.md) for
provenance).

## The Brand Kit (embedded)

Everything needed to apply the brand ships in this skill and is regenerable:

- `assets/hisd-theme.css` — drop-in CSS custom properties for **light and dark**. Link it, set `data-theme`, and use `var(--color-*)`.
- `assets/hisd.tokens.json` — DTCG design tokens (primitives + semantic themes) for design tools and pipelines.
- `assets/hisd-powerbi-theme.json` — import into Power BI / Fabric for an on-brand report theme.
- `assets/hisd-tokens.scss` — Sass variables. `assets/hisd-tokens.js` — token data for scripts.
- `assets/style-guide.html` — the living style guide; open it to see every token and component in both themes.
- `assets/contrast-report.md` — proof that every semantic pairing meets WCAG 2.2 AA.
- `assets/brand-assets.json` — repo-relative paths to the real logos, the three typefaces, templates, the seal, and department marks in the toolkit.
- `assets/icons/` — **73 filled Material Symbols** (Rounded, FILL=1, weight 500, 24px), vendored as `currentColor` SVGs so they inherit `--color-*` from context. Pull more with `python3 scripts/pull_material_icons.py add <name>…`. Open `assets/icons/index.html` for the contact sheet.
- `assets/palette-reference.md` + `assets/palette-matrix.json` — the **expanded palette**: 4%- and 10%-step tints, tones, and shades for every brand color, with hex/RGB/CMYK, Pantone (anchors only), and a name per swatch. Regenerate with `scripts/build_palette_matrix.py`.
- `components/` — **24 accessible, themeable UI components** (Button, Input, Select, Textarea, Checkbox/Radio, Switch, Theme Toggle, Chip, Card, Table, Tabs, Navbar, Sidebar, Breadcrumb, Pagination, Modal, Toast, Alert, Tooltip, Progress, Skeleton, Badge, Accordion, Avatar). Each ships a reusable stylesheet, a live demo showing every state in light **and** dark, and a copy-paste snippet. `components/components.css` is the one-file bundle; open `components/index.html` for the gallery. Every component paints color only through tokens and ships a visible focus ring.
- `scripts/build_tokens.py` — regenerate every token artifact from the brand source (and **fail the build** if any pairing breaks WCAG AA). `scripts/make_asset_manifest.py` — refresh the asset manifest. `scripts/scaffold.py` — scaffold a branded starter for a chosen medium. `scripts/build_components.py` — rebuild the component bundle + gallery. `scripts/lint_components.py` — mechanical gate: every component must paint via tokens and keep a focus ring. `scripts/validate_tokens.py` — DTCG conformance check for the token file. `scripts/brand_scan.py` — the **"teal test"**: scan any file or directory for off-brand color, CDN fonts, non-brand typefaces, or missing focus rings (use it on microsites and vendor handoffs, not just this skill). `scripts/svg_minify.py` — conservative, dependency-free SVG optimizer (preserves geometry + embedded data). `scripts/generate_app_icons.py` — render a favicon + app-icon set from the brand mark. `scripts/pull_material_icons.py` — vendor more filled Material Symbols. `scripts/build_palette_matrix.py` + `scripts/pull_color_names.py` — regenerate the expanded-palette reference + color names.

## Non-Negotiables

These hold for every medium:

- **Teal `#00A3AF` leads.** Follow the 60/30/10 balance; reach for semantic tokens (`--color-action`, `--color-surface`) rather than raw hex.
- **Yellow is reserved.** The brand "Sunrise" yellow (`#F9D04E`) is used **only** in the four guide-approved combinations — yellow text/icon on Dark Grey, on Purple, or on Dark Green; and dark-grey ink on a yellow fill. It is never a general UI color, never the warning or selection color, never yellow-on-light. Warning uses the **amber** harmonizer; selection uses a **teal** highlight. See the [model summary](reference/model-summary.md) (the full color spec is `Docs/Design-System/Color.md` in the source repo).
- **Pure white only.** Surfaces are pure white `#FFFFFF`; page backgrounds are whitesmoke `#F5F5F5` (`--color-bg`). Never the brand's yellowish off-white `#FFFFED`.
- **Light and dark are both first-class.** Theme with `<html data-theme="light|dark">`, default to the OS preference, allow a manual override. Dark mode tunes the teal brighter — never paste the raw brand color into a dark surface.
- **Typography by role.** Radio Canada for UI and body, Parkinsans for display headlines, Lora for editorial/long-form. Keep the brand's skip-a-weight pairing. End fallbacks in Arial / Times New Roman.
- **Logo discipline.** Use the white-wordmark + yellow-icon lockup on dark backgrounds; keep clearspace (cap-height of the H) and minimum size (6 mm print / 20 px digital); reserve the Seal for official documents. See [`reference/Logo-And-Assets.md`](reference/Logo-And-Assets.md).
- **Accessibility is the floor, not a finish.** WCAG 2.2 AA, visible offset focus rings, full keyboard, 24 px targets, reduced-motion, and multilingual (large Spanish-speaking audience) readiness. Run [`reference/Accessibility-Checklist.md`](reference/Accessibility-Checklist.md) before calling anything done.

## Procedure

1. **Classify the medium** and open its recipe in [`reference/Media-Playbooks.md`](reference/Media-Playbooks.md) (web/app, report/dashboard, print, presentation, email, social, signage, video).
2. **Bring in the tokens.** Web: link `assets/hisd-theme.css`. Power BI: import `assets/hisd-powerbi-theme.json`. Print/deck/email: read the hex from `assets/hisd.tokens.json` (or the palette in `assets/brand-assets.json`).
3. **Apply structure** — type roles, the spacing scale, radius, elevation, and components — per the [model summary](reference/model-summary.md), [`reference/Conventions.md`](reference/Conventions.md), and the Rayfin app shell guidance when building Fabric/Rayfin apps.
4. **Place the logo and the Ribbon** per [`reference/Logo-And-Assets.md`](reference/Logo-And-Assets.md), pulling real files from `assets/brand-assets.json`.
5. **Verify both themes** (light and dark) and **run the accessibility checklist**.
6. If the brand source changes, re-run `scripts/build_tokens.py` so every artifact updates together.

## Scaffolding

`python3 scripts/scaffold.py <medium> [name]` writes an on-brand starter — for example
`web-page`, `email`, `report`, or `powerbi` — already wired to the tokens, light/dark,
and logo. Use it as the first move when creating something new.

## Components

For web/app work, reach for the **coded component library** in `components/` rather than
restyling from scratch. Link `assets/hisd-theme.css` then `components/components.css`, set
`data-theme`, and use the documented markup — each component is keyboard-accessible, works
in both themes, and is verified against the [model](reference/model-summary.md)'s
accessibility contract by `scripts/lint_components.py` and the contrast gate. Open
`components/index.html` to browse all 24 with their states and snippets. After editing a
component, re-run `python3 scripts/build_components.py` and `python3 scripts/lint_components.py`.

For React app shells, prefer the typed `ThemeToggle` component in
`framework/react/src/ThemeToggle.tsx` instead of rebuilding day/night controls inline.
The visible control is icon-based while `aria-pressed` and explicit button labels carry
the accessible state. Use `variant="appbar"` for HISD/Rayfin app bars when the active
dark-mode option should render as a light gray pill with an icon color supplied by the
app bar token.

## Platforms

Beyond web/app, `platforms/` carries a ready kit per delivery surface — each expresses
the **same tokens** in that platform's native form:

- [`platforms/powerbi/`](platforms/powerbi/README.md) — Power BI / Fabric: the import steps for the generated theme, a layout guide, and 16:9 page-background SVGs (title + content) with the logo and ribbon.
- [`platforms/power-pages/`](platforms/power-pages/README.md) — a Power Pages web-file stylesheet mapping the portal's Bootstrap onto the HISD tokens (light + dark, the School Navigator toggle pattern), with Liquid snippets and upload steps.
- [`platforms/style-dictionary/`](platforms/style-dictionary/README.md) — a Style Dictionary v4 build that turns the DTCG tokens into CSS, Sass, JS/TS, iOS, Android, and a Figma Tokens Studio export from one source.
- [`platforms/email/`](platforms/email/README.md) — bulletproof HTML email: table layout, inline hex from the tokens, Outlook VML buttons, dark-mode handling, plus ready announcement and newsletter templates.
- [`platforms/print/`](platforms/print/README.md) — print + Office: a CMYK/Pantone reference, a print stylesheet (`@page`, ribbon, running headers), and letterhead/cover/memo templates ready to print to PDF.
- [`platforms/social/`](platforms/social/README.md) — Ribbon social-share templates (Open Graph 1200×630, square 1080×1080, story 1080×1920) and `make_card.py` to stamp a headline and render a PNG.

For the web shell, `assets/app-icons/` carries a generated favicon + app-icon set (with `site.webmanifest` and a `<head>` snippet), regenerable via `scripts/generate_app_icons.py`.

Email and print intentionally use inline hex (those media don't support CSS variables);
they are exempt from the token-only web rule and excluded from `brand_scan.py`.

## Reference

- [Conventions](reference/Conventions.md) — token names, theme switching, do and don't.
- [Media Playbooks](reference/Media-Playbooks.md) — a recipe per medium.
- [Logo And Assets](reference/Logo-And-Assets.md) — logo rules and where the real files live.
- [Accessibility Checklist](reference/Accessibility-Checklist.md) — the AA gate.
- [Model Summary](reference/model-summary.md) — the bundled specification this skill applies (full model: `Docs/Design-System/` in the source repo).
- [Rayfin App Styling](reference/Rayfin-App-Styling.md) — app-bar, theme-toggle, button, and filter-chip defaults for HISD Rayfin/Fabric apps.

## Asset Licensing & Usage

The bundled logos and marks are **Houston ISD trademarks**, vendored for building
official and HISD-affiliated media. Use them on HISD work only; do not alter the marks,
and do not redistribute this skill's `assets/logos/` outside an HISD context. The three
typefaces ship with their open-source licenses under `assets/fonts/` (Radio Canada and
Parkinsans under the SIL Open Font License; Lora under the SIL OFL) — keep the license
files alongside the fonts when redistributing. When in doubt about external or
co-branded use, clear it with the HISD Communications Department.
