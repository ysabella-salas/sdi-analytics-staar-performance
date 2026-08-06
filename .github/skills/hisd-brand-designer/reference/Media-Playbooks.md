# HISD Brand Designer — Media Playbooks

One recipe per medium. Every recipe pulls from the same tokens, so the brand stays
consistent whether it ships as a web app or a printed flyer. Start by scaffolding:
`python3 scripts/scaffold.py <medium>`.

## Web app / website / Power Pages

- Link `assets/hisd-theme.css`; set `<html data-theme-source="system">`; offer a light/dark toggle.
- Build from semantic tokens. Header: teal surface with the white/yellow logo lockup. Use `--font-display` for page titles, `--font-sans` for everything else.
- Components: pill buttons (`--color-action`), chips for filters, cards on `--color-surface`. Focus rings: `outline: 3px solid var(--color-focus); outline-offset: 2px`.
- Power Pages: put the tokens in a custom theme web-file and disable the default `portalbasictheme.css` (School Navigator and HISD For Teachers do exactly this). Self-host the brand fonts as web-files.
- Run the accessibility checklist; confirm a Spanish path if the audience is families.

## Report / Power BI / Fabric dashboard

- Import `assets/hisd-powerbi-theme.json` (Power BI Desktop → View → Themes → Browse). It sets the teal-led `dataColors`, foreground/background, good/neutral/bad, and table accent.
- **Fonts**: Power BI cannot embed Radio Canada — leave the theme on Segoe UI for on-screen, and use the brand fonts only in exported PDF/PPT/images.
- Lead visuals with teal; use the categorical order (teal, purple, yellow, dark-green, blue, red, light-green) for series; never encode by color alone — add labels/markers.
- Header band: teal with the white/yellow logo, the report title in a heavy weight. Clear the legacy "HISD - Sebastian" theme and per-visual color overrides so the theme wins.

## Print — letterhead, one-pager, flyer, report

- Use the **CMYK / Pantone** values from the brand quick reference for press, the HEX from `assets/hisd.tokens.json` for digital PDFs. Teal leads; dark-grey for body text.
- Type: Parkinsans for headlines, Radio Canada or Lora for body. Start from the toolkit templates listed in `assets/brand-assets.json` (`HISD-Letterhead-*`, `HISD-One-Pager`).
- The **Ribbon** ties a layout together — use it as a header/footer band or accent. Two canonical recipes: the `--ribbon-gradient` curve (teal `#00A3AF` → dark-green `#026252`, optional yellow `#FBDE83` highlight) for backgrounds/bleeds, and the `--ribbon-fan` divider (teal/light-green/yellow/purple) for thin bands. Print uses the flattened hex; the themeable vector is `.skills/design/hisd-brand-designer/assets/ribbon/ribbon.svg`.
- Respect logo clearspace and a 6 mm minimum; keep margins generous; mind bleed on press files.

## Presentation / deck

- Start from the toolkit `HISD-PPT-Presentations` master. Title slides: teal or dark-grey field, white/yellow logo, Parkinsans title. Content slides: white field, teal accents, Radio Canada.
- One idea per slide; large type; the Ribbon as a divider. Data slides reuse the Power BI palette and the categorical order.
- For virtual meetings, the toolkit ships Teams/Zoom backgrounds.

## Email

- Signatures: use the toolkit email-signature template (linked in the toolkit). Keep it text + a small logo; brand color on the name/title only.
- HTML email: inline styles, table layout, web-safe fallbacks (Arial). Use hex from the tokens; a teal header bar with the logo; do not depend on dark-mode email client behavior — design for light and test dark.

## Social

- Build on the toolkit Ribbon backgrounds (Rectangle + Square, raster PNG) in the nine colorways, or render the canonical `--ribbon-gradient` / `--ribbon-fan` recipe (flattened hex) from `.skills/design/hisd-brand-designer/assets/ribbon/`. Keep the logo in the safe area; large Parkinsans headline; high contrast.
- Provide alt text; keep text legible at thumbnail size; respect platform safe zones. Offer Spanish versions for family-facing posts.

## Signage / environmental / vehicle

- Use Pantone for fabrication; vector logos (EPS/SVG from the toolkit) only. Maximize contrast at distance; respect clearspace; the Seal only where authentication is intended.

## Video

- Lower-thirds and titles in Parkinsans/Radio Canada on a teal or dark-grey band; the white/yellow logo bug in a corner with clearspace; the Ribbon as a motion accent. Captions are mandatory; provide Spanish captions for family content.
