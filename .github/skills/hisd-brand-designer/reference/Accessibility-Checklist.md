# HISD Brand Designer — Accessibility Checklist

The gate every HISD artifact clears before it ships. HISD is a public school district:
**WCAG 2.2 AA** and **Section 508** apply, and the 2024 ADA Title II rule requires at
least WCAG 2.1 AA for its web and mobile content. Accessibility is a property of the
tokens and components, not a final polish.

## Color and contrast

- [ ] Body text meets **4.5:1**; large text (≥24 px, or ≥19 px bold) and UI/graphics meet **3:1**. The semantic tokens already pass — see `assets/contrast-report.md`. If you depart from them, re-check.
- [ ] Yellow, light-green, and the raw teal are **not** used as small text. Yellow/light-green are fills behind dark text; teal text uses the darker `--color-link` / `--color-action`.
- [ ] Meaning is never carried by color alone — pair with text, icon, or pattern (status chips, chart series, form errors).

## Interaction

- [ ] Every interactive element has a **visible focus ring**: `outline: 3px solid var(--color-focus); outline-offset: 2px`. Never `outline: none` without a replacement.
- [ ] Full **keyboard** operability and a logical tab order; a skip-to-content link on pages.
- [ ] Targets are at least **24 × 24 px** (44 px on touch-first surfaces).
- [ ] Motion respects `prefers-reduced-motion`; nothing flashes more than 3×/sec.

## Structure and screen readers

- [ ] Semantic HTML and landmarks (`header`, `nav`, `main`, `footer`); one `h1`; headings in order.
- [ ] Form controls have associated `<label>`s; errors are announced and described, not color-only.
- [ ] Images have meaningful `alt`; decorative images are `alt=""`; charts have a text/table equivalent; maps have a list equivalent.
- [ ] `<html lang>` is set; language changes are marked.

## Multilingual

- [ ] Family-facing content has a **Spanish** path (HISD serves a large Spanish-speaking community); UI strings are translatable, not baked into images.
- [ ] Fonts and layout tolerate longer translated strings; the type system is locale-aware; layout is bidi-tolerant.

## Verify

- [ ] Checked in **both** light and dark themes.
- [ ] Checked at 200% zoom and on a narrow (mobile) viewport.
- [ ] Ran an automated check (axe / Lighthouse / Accessibility Insights) and fixed criticals.
