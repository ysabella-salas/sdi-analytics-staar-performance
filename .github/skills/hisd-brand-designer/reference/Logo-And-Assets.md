# HISD Brand Designer — Logo And Assets

Real files live in the Branding Toolkit; `assets/brand-assets.json` lists repo-relative
paths to them (regenerate with `scripts/make_asset_manifest.py`). The toolkit binaries
are Git-LFS tracked, so clone with LFS enabled to materialize them.

## Choosing the mark

- **Primary logo** (icon + wordmark) — the default for external-facing work where recognition is lower.
- **Submark** — a compact wordmark+icon for tight spaces.
- **Icon** (the skyline) — high-recognition contexts: app headers, favicons, email, internal tools.
- **Wordmark** — supporting use, paired loosely with the icon.
- **Seal** — *only* to authenticate official documents (diplomas, transcripts, board actions). Never decorative.

## Color treatment

- The brand's main color is Teal — lead with it. The icon may be Teal, Yellow, Purple, or Light Green.
- On a **dark background**, use the **white wordmark + yellow icon** lockup (`HISD-Logo-Submark-White-Yellow`). The yellow icon is allowed *only* with the white wordmark on a dark field — never a yellow icon with a dark-grey wordmark.
- If color is unavailable or competes, use solid black or solid white.
- Pick the variant from `brand-assets.json` → `logos`; prefer SVG, then PNG. There are grey/white treatments with accent variants per mark.

## Clearspace and minimum size

- Clearspace on all sides equals the cap-height of the `H` in the wordmark (same when using the icon alone).
- Minimum size: **6 mm** in print, **20 px** digital.

## Don't

Don't outline, distort, angle, recolor outside the approved set, add effects, change the transparency, or change the typeface of the logo. Don't crowd it. Don't stretch raster exports — use the vector (SVG/EPS).

## The Ribbon

The Ribbon (evoking Houston's bayous) is the signature graphic device — a themeable
band that ties a layout together or accents a region. There are **two canonical,
token-backed recipes**, each with one fixed stop set:

- **`--ribbon-gradient`** (primary) — the "bayou" curve / hero background / card
  accent / print bleed. Theme-aware: `--ribbon-from` (teal-500 `#00A3AF` light /
  teal-700 `#037882` dark) → `--ribbon-to` (dark-green-600 `#026252` light /
  dark-green-800 `#05463C` dark), with an optional `--ribbon-highlight`
  (yellow-400 `#FBDE83`) peak.
- **`--ribbon-fan`** (secondary) — the thin multi-color divider band, identical
  everywhere: teal `#00A3AF` @ 0%, light-green `#6DB83D` @ 38%, yellow `#F9D04E`
  @ 64%, purple `#474F99` @ 100%.

Web surfaces reference the tokens (`var(--ribbon-gradient)` / `var(--ribbon-fan)`);
print / email / SVG use the matching flattened hex above, which equals the canonical
values so nothing drifts. The canonical themeable vector ships at
`.skills/design/hisd-brand-designer/assets/ribbon/ribbon.svg` (curve) and
`ribbon-band.svg` (fan). The toolkit also ships pre-rendered Ribbon backgrounds in
Rectangle and Square formats across nine colorways (raster PNG).

## Typefaces

`Fonts/` holds the three families as OFL-licensed variable + static fonts (paths in
`brand-assets.json` → `fonts`). Roles: **Radio Canada** (UI/body), **Parkinsans /
"Parkin Sans"** (display headlines), **Lora** (editorial serif). Self-host them for the
web; fall back to Arial / Times New Roman where brand fonts are unavailable (e.g.,
Microsoft Office, Power BI on screen).

## Departments and sub-brands

The toolkit carries lockups for 14 departments plus division, office, and program
marks. Generate a new department lockup from the template + accent token rather than
hand-building one; keep the hierarchy (district mark primary, department secondary).
