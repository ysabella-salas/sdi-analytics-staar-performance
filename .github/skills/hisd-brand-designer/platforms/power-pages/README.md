# HISD theme bundle for Power Pages

Layer HISD brand tokens over a Bootstrap-based Power Pages portal (for example
the live **School Navigator**), with a manual light/dark toggle that defaults to
the visitor's OS preference.

## What's in this folder

| File | Purpose |
| --- | --- |
| `hisd-powerpages.css` | The theme. Defines HISD tokens (light + dark) and maps Bootstrap components — navbar, `.btn-primary`/`.btn-secondary`, cards, forms, tables, footer, links — onto `var(--color-*)` tokens. Self-hosts the brand fonts via `@font-face`. |
| `snippets.md` | Copy-paste Liquid/HTML: brand header with logo, themed button, card, footer, and the theme-toggle `<script>`. |
| `README.md` | This file. |

The token values mirror the canonical
`.skills/design/hisd-brand-designer/assets/hisd-theme.css`. The only difference is the
`@font-face` `url()`s, which point at Power Pages **web files** instead of the
skill's local `./fonts/` folder.

---

## Step 1 — Upload the brand fonts as web files

Power Pages serves any uploaded **web file** at a URL derived from its
**Partial URL**. The `@font-face` rules in `hisd-powerpages.css` assume each font
file is reachable at the **site root** under its bare filename (e.g.
`/Parkinsans-VariableFont_wght.ttf`).

Upload these five files from the skill's font folder
(`.skills/design/hisd-brand-designer/assets/fonts/`):

- `RadioCanada-VariableFont_wdth,wght.ttf`
- `RadioCanada-Italic-VariableFont_wdth,wght.ttf`
- `Parkinsans-VariableFont_wght.ttf`
- `Lora-VariableFont_wght.ttf`
- `Lora-Italic-VariableFont_wght.ttf`

**Via the Power Pages design studio** (easiest):

1. Open your site in the **Power Pages** maker portal → the page you're editing.
2. In the page editor, use **Edit code** / the **media** picker, or go to the
   **Portal Management** app (below) — the studio's "Upload" puts files at the
   site root by default.

**Via the Portal Management app** (precise control of the Partial URL):

1. Open **Portal Management** (Power Apps → your environment → *Portal
   Management* model-driven app).
2. **Web Files → New**. For each font:
   - **Name:** the filename, e.g. `Parkinsans-VariableFont_wght.ttf`
   - **Website:** your site
   - **Parent Page:** **Home** (this makes the file resolve at the site root)
   - **Partial URL:** the exact filename, e.g. `Parkinsans-VariableFont_wght.ttf`
   - Save, then on the **Notes/Attachments** area attach the actual `.ttf`.
3. After saving all five, **Sync / Publish** the site.

> **Upload path documented:** with Parent Page = Home and Partial URL =
> `<filename>`, the public URL is `https://<your-site>/<filename>`, which is
> exactly what the CSS references (`url("/<filename>")`). If you instead nest the
> fonts under a folder page (e.g. Partial URL `fonts/`), change every `url("/...")`
> in `hisd-powerpages.css` to `url("/fonts/...")`.

> **MIME type:** if a font fails to load, confirm the web file's MIME type is
> `font/ttf` (or `application/octet-stream`). Set it on the Web File record if
> Power Pages didn't infer it.

---

## Step 2 — Upload the logos as web files (for the header/footer)

The header and footer snippets reference brand logos by root-relative URL.
Upload these from `.skills/design/hisd-brand-designer/assets/logos/` the same way as the fonts
(Parent Page = Home, Partial URL = filename):

- `full-logo/full-dark-grey-teal.svg` → Partial URL `full-dark-grey-teal.svg`
  (shown in **light** mode)
- `full-logo/full-white.svg` → Partial URL `full-white.svg` (shown in **dark**
  mode and in the footer)

(Pick any variant you like from the skill's logo set — these two are the
recommended light/dark pair.)

---

## Step 3 — Upload the theme stylesheet as a web file

1. **Portal Management → Web Files → New**:
   - **Name:** `hisd-powerpages.css`
   - **Website:** your site
   - **Parent Page:** **Home**
   - **Partial URL:** `hisd-powerpages.css`
   - Save and attach `hisd-powerpages.css` (set MIME type `text/css` if needed).
2. **Sync / Publish.** The stylesheet is now at
   `https://<your-site>/hisd-powerpages.css`.

---

## Step 4 — Load the stylesheet on every page (after Bootstrap)

The theme must load **after** the portal's Bootstrap CSS so its rules win the
cascade. Add the link to your site's **base layout web template** (the one every
page inherits — often named *Layout 1 Column*, *Default*, etc.) inside `<head>`,
**below** the existing Bootstrap `<link>`:

```html
<!-- existing bootstrap link is already here, above this line -->
<link rel="stylesheet" href="/hisd-powerpages.css">
```

If you can't edit the layout template, you can instead paste the same `<link>`
into **Site Settings → `Site/Header`** content, or into a Content Snippet that
the header includes. Editing the base layout is preferred because it covers every
page in one place.

> **Theme vs. web file:** Power Pages also has a *Bootstrap theme* concept (a
> compiled `theme.css`). This bundle is intentionally a **plain web-file
> stylesheet layered on top**, not a recompiled theme — that keeps it portable
> across Bootstrap 3/4/5 portals and avoids a SASS build. If your site already
> uses a custom `theme.css`, just make sure `hisd-powerpages.css` loads *after*
> it.

---

## Step 5 — Add the brand header, components, and toggle

From `snippets.md`:

1. **Header:** paste the header markup (section 1) into your base layout web
   template where the site header goes, or into a header Content Snippet.
2. **Components:** use the `.btn btn-primary`, `.card`, footer, etc. markup
   anywhere — they're already themed by the CSS.
3. **Toggle script:** paste the toggle `<script>` (section 5) once, just before
   `</body>` in the base layout. Optionally add the small **anti-flash** snippet
   into `<head>` (before the stylesheet link) to prevent any flash of the wrong
   theme on first paint.

### How the toggle works

- On load, the script reads `localStorage["hisd-theme"]`:
  - `"light"` / `"dark"` → sets `data-theme` on `<html>` (forces that theme).
  - missing / `"system"` → removes `data-theme`, so the CSS follows the OS via
    `@media (prefers-color-scheme: dark)`.
- Clicking the **#hisd-theme-toggle** button flips to the opposite of whatever is
  currently showing and **persists** the choice.
- A separate "Use system theme" control (optional, in `snippets.md`) clears the
  override and returns to OS preference.

No attribute is set in the default state, so a brand-new visitor sees the theme
that matches their device — the School Navigator default.

---

## Verifying the brand applied

- Toggle your OS to dark and reload — the portal should follow (teal brightens,
  surfaces go dark) with no manual action.
- Click the toggle — the choice should survive a page reload.
- Spot-check that `.btn-primary` is the HISD action teal, the navbar sits on a
  white/dark surface with a teal accent on the active item, and links are
  HISD link teal.

## Maintenance

- Token values are generated upstream. If the palette changes, regenerate
  `.skills/design/hisd-brand-designer/assets/hisd-theme.css` and copy the updated `:root` /
  `[data-theme]` blocks into `hisd-powerpages.css` (leave the `@font-face`
  `url()`s pointing at the web-file paths).
- Per the HISD conventions: build components from `var(--color-*)` semantic
  tokens only, keep clearspace around the logo, pair `--color-focus` with
  `outline-offset: 2px`, and never rely on color alone to convey meaning.
