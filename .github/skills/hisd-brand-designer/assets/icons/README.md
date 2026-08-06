# HISD Icon Set — Material Symbols (filled)

The HISD product icon set is **Material Symbols Rounded, filled** — vendored from
Google's canonical icon repository and normalized so every glyph paints through the
design system's `--color-*` tokens. Open [`index.html`](./index.html) for a contact
sheet of the whole set with a live size slider and a light/dark/system toggle.

## Provenance

Every icon is pulled from
[`github.com/google/material-design-icons`](https://github.com/google/material-design-icons)
— the source repo, **not** `fonts.google.com`. The house style is fixed:

| Property | Value |
| --- | --- |
| Family | Material Symbols **Rounded** |
| Fill | **FILL = 1** (filled, not outlined) |
| Weight | **500** |
| Grid | **24px** (`viewBox="0 -960 960 960"`) |

The raw source for each icon is the `*_wght500fill1_24px.svg` variant, with graceful
fallbacks (`*_fill1_24px.svg`, then `*_24px.svg`) if a glyph doesn't ship the exact
permutation. The current set was vendored entirely from the primary FILL1 / weight-500
variant. The full provenance — name, the exact source variant filename, and the raw
GitHub URL — lives in [`manifest.json`](./manifest.json), one record per icon.

Each `<name>.svg` is normalized to a clean, theme-ready form:

- the source `viewBox` is kept;
- `width`/`height` are stripped so the glyph scales to its box;
- every drawing element is `fill="currentColor"` — there is **no hex, `rgb()`, or
  `hsl()`** anywhere in the file;
- the root carries `aria-hidden="true"` (decorative-first; see Accessibility below).

## Adding or refreshing icons

Use the pipeline script — never hand-edit an SVG or paste from fonts.google.com.

```sh
# Add one or more icons by their Material Symbols name (lowercase, underscores):
python3 .skills/design/hisd-brand-designer/scripts/pull_material_icons.py add school calendar_month

# Re-pull everything already in the manifest (e.g. after an upstream update):
python3 .skills/design/hisd-brand-designer/scripts/pull_material_icons.py sync
```

`add` fetches each icon (trying the FILL1 / weight-500 variant, then fallbacks),
normalizes it to currentColor, writes `assets/icons/<name>.svg`, and upserts the record
into `manifest.json`. It is polite by default (small delay between fetches, retries with
backoff, clear logging) and reports any name that doesn't exist upstream rather than
failing the whole run.

Find an icon's exact name by browsing
[fonts.google.com/icons](https://fonts.google.com/icons) (for discovery only — the bytes
always come from the GitHub repo). Note that font-only aliases such as `clear` (use
`close`) and `place` (use `location_on`) have **no** standalone SVG directory upstream
and will report as not found.

After adding an icon, add its name to the `ICONS` array in `index.html` so it appears on
the contact sheet.

## Color: never hardcode it

The icons paint with `currentColor` only. Set an icon's color the same way you set text
color — through a semantic token on the icon or any ancestor:

```css
.toolbar-button       { color: var(--color-action); }      /* icon turns teal */
.toast--success .icon { color: var(--color-success); }     /* icon turns green */
.help-hint .icon      { color: var(--color-text-muted); }  /* quiet, label-adjacent */
```

Because color flows from a token, an icon recolors automatically when the theme switches
(`[data-theme="dark"]`) — no second asset, no JavaScript swap. Token bindings (which
status uses which token, why warning-yellow is fill-only) live in the design-system note.

## Two ways to embed

### 1. Inline `<svg>` — preferred

Paste or template the SVG markup directly into the DOM. This is the only method where
`currentColor` works, so reach for it whenever the icon needs to take a context color,
change on hover/focus, or respond to the theme.

```html
<!-- decorative: hidden from assistive tech, label comes from the visible text -->
<a class="card-link" href="/calendar">
  <svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d="…" />
  </svg>
  School calendar
</a>
```

### 2. `<img>` — when inlining is impractical

Reference the file by URL. Simple, cacheable, and isolated, but `currentColor` resolves
to the image's own (black) default — it will **not** pick up your token color or react to
the theme. Use it only for icons that are always one fixed color, and always provide
`alt`:

```html
<img src="../icons/download.svg" width="24" height="24" alt="" />        <!-- decorative -->
<img src="../icons/open_in_new.svg" width="16" height="16" alt="Opens in a new tab" />
```

(`background-image: url(...)` ignores `currentColor`; a `mask-image` lets you paint with
`background: var(--color-*)` — useful for hover-tinted icons without inlining.)

## Sizing

The intrinsic size is 24px and the geometry is a vector fill, so it scales cleanly. Resize
by setting `width`/`height` (or `font-size` when the icon is `width: 1em`):

```css
.icon-sm { width: 16px; height: 16px; }   /* dense tables, inline-with-12–14px text */
.icon    { width: 20px; height: 20px; }   /* default inline / button icon */
.icon-lg { width: 24px; height: 24px; }   /* standalone, nav, touch */
.icon-xl { width: 32px; height: 32px; }   /* feature / empty-state accents */
```

Filled symbols stay legible smaller than line icons do; 16px is a comfortable floor. The
visible glyph is the sizing concern — the **hit target** is separate: an icon-only control
still needs a 24 × 24px minimum (44 × 44px preferred for touch), achieved with padding on
the button, not by inflating the icon.

## Accessibility

The icons are authored decorative-first (`aria-hidden="true"` on the root). What you do at
the call site depends on whether the icon carries meaning the user would otherwise miss.

- **Decorative icon next to a visible text label** — keep `aria-hidden="true"`. The text
  is the accessible name; the icon must not be announced twice.

  ```html
  <button type="button">
    <svg … aria-hidden="true">…</svg> Download
  </button>
  ```

- **Icon-only button or link** — the icon is the only label, so the *control* needs an
  accessible name via `aria-label`. Keep the SVG itself `aria-hidden="true"`.

  ```html
  <button type="button" aria-label="Close dialog">
    <svg … aria-hidden="true"><!-- close --></svg>
  </button>
  ```

- **A meaningful standalone icon that conveys information** (a status glyph with no
  adjacent text) — give it an accessible name: `role="img"` + `aria-label` on the SVG (or
  remove `aria-hidden` and add a `<title>` referenced by `aria-labelledby`). Per the
  system's *never color alone* rule, pair status meaning with text where it matters.

  ```html
  <svg role="img" aria-label="Error" … >…</svg>
  ```

Other notes: an icon used as a meaningful non-text element needs ≥ 3:1 contrast against
its background (WCAG 1.4.11); the action and status tokens are calibrated for this. Warning
yellow (`--color-warning`) is fill/border only, never an icon fill on a light surface.
Focus rings on interactive icons use `outline: 2px solid var(--color-focus)` with
`outline-offset: 3px`.
