# HISD animated Ribbon on Power Pages

Drop the canonical HISD **Ribbon** — the "bayou current" curve device — into a
Power Pages (Dataverse portal) page. It renders as a **static SVG floor** on
every client, and **upgrades to a live WebGL2 fill** on capable ones. Everything
is **self-hosted as portal web files** (no third-party CDN) and loaded as a plain
**ES module** (no inline `eval`), which is what keeps it **CSP-safe**.

The copy-paste markup is in **`ribbon-embed.html`** (same folder). This file is
the upload + CSP guide.

## How it fits the rung ladder

| Rung | What renders | When |
| --- | --- | --- |
| 0 — static | Canonical Ribbon SVG / CSS gradient, no motion | Always present; the floor. Reduced motion, forced colors, save-data, weak device, no WebGL2, or a CSP that blocks the module |
| 1 — css | Same silhouette, CSS-only sheen/drift | When the component picks the CSS tier |
| 2 — webgl | Live WebGL2 fill, masked to the silhouette | `animate` set, capable client, motion allowed |

Rungs 1 and 2 are **overlays on the same SVG** — the floor is never torn down.
If the upgrade can't start (or the browser loses the GL context, or a strict CSP
blocks the module), rung 0 is already on screen and simply remains. **There is no
broken state.**

---

## What you upload (all as web files at the site root)

Power Pages serves any uploaded **web file** at a URL derived from its **Partial
URL**. With **Parent Page = Home** and **Partial URL = `<filename>`**, the file
resolves at `https://<your-site>/<filename>` — exactly the root-relative URLs the
snippet uses. (This is the same convention as the theme bundle's `README.md`.)

| Upload this file | From (in the skill) | Partial URL | MIME |
| --- | --- | --- | --- |
| `hisd-theme.css` | `assets/hisd-theme.css` | `hisd-theme.css` | `text/css` |
| `ribbon.css` | `components/ribbon.css` | `ribbon.css` | `text/css` |
| `hisd-ribbon.js` | `framework/web-components/src/hisd-ribbon.js` | `hisd-ribbon.js` | `text/javascript` |
| `core.js` | `framework/ribbon-gl/core.js` | `core.js` | `text/javascript` |
| `capabilities.js` | `framework/ribbon-gl/capabilities.js` | `capabilities.js` | `text/javascript` |
| `tokens.js` | `framework/ribbon-gl/tokens.js` | `tokens.js` | `text/javascript` |
| `scene.js` | `framework/ribbon-gl/scene.js` | `scene.js` | `text/javascript` |
| `shaders.js` | `framework/ribbon-gl/shaders/index.js` | `shaders.js` | `text/javascript` |

Also upload the brand fonts referenced by `hisd-theme.css` if they aren't already
present (see the theme bundle's `README.md`, Step 1) — the Ribbon doesn't need
fonts, but the rest of the page will.

### ⚠️ Keep the ES module import graph intact

`hisd-ribbon.js` imports `ribbon-gl/core.js`, which in turn imports
`capabilities.js`, `tokens.js`, `scene.js`, and `shaders/index.js` **by relative
path**. Power Pages flattens uploads to the site root, which **breaks those
relative paths** unless you handle it one of two ways:

- **Option A — preserve the folder layout (recommended).** Create folder web
  files so the structure survives: upload the five `ribbon-gl` files under a
  `ribbon-gl/` parent (Partial URLs `ribbon-gl/core.js`, `ribbon-gl/scene.js`,
  …, `ribbon-gl/shaders/index.js`) and put `hisd-ribbon.js` where its import
  specifier expects `./ribbon-gl/core.js`. The import graph then resolves
  unchanged. **Do not hand-edit the `import` specifiers in the source** — keep
  the tree identical to the skill so updates stay drop-in.
- **Option B — pre-bundle to one file.** Run the web component + core through a
  bundler (esbuild/rollup, ESM output, no minified `eval`) into a single
  `hisd-ribbon.js`, upload just that. Still a plain module → still CSP-safe.

If neither is in place, the module 404s on its sub-imports and the page **falls
back to the static SVG floor** — degraded, but never broken.

### Uploading (Portal Management app)

For each file: **Portal Management → Web Files → New** → set **Name**,
**Website**, **Parent Page** (Home, or the folder page for Option A), and
**Partial URL**; save; attach the actual file on **Notes/Attachments**; set the
**MIME type** if Power Pages didn't infer it (especially `text/javascript` for
`.js` and `text/css` for `.css`). Then **Sync / Publish** the site.

> **MIME matters for modules.** A `<script type="module">` whose response isn't a
> JavaScript MIME type is rejected by the browser. If the Ribbon never upgrades,
> check that each `.js` web file serves as `text/javascript` (or
> `application/javascript`).

---

## Add it to a page

1. Open the page's HTML (or a **Content Snippet** of type *Text/HTML*, or your
   base **Web Template**).
2. Paste the marked block from **`ribbon-embed.html`** — the two `<link>`s, the
   `<hisd-ribbon>` element, and the one `<script type="module">`.
3. Put the `<script type="module" src="/hisd-ribbon.js">` **once** per page (or
   in the base layout before `</body>`); the two `<link>`s belong in `<head>`,
   loaded **after** Bootstrap.
4. **Sync / Publish.**

```html
<hisd-ribbon animate intensity="0.6"></hisd-ribbon>
<script type="module" src="/hisd-ribbon.js"></script>
```

- **`animate`** (boolean) — **opt in to motion.** With it, a capable client gets
  the WebGL fill (else the CSS sheen); **without** it the Ribbon is a still SVG.
  Omit it where you want a static brand mark.
- **`intensity`** (`0`–`1`, default `0.6`) — lower = subtle drift, higher =
  organic flow. Tweak per placement. (Only meaningful with `animate`.)
- **`tier`** (`auto` | `css` | `webgl`, default `auto`) — `auto` is
  capability-gated; `css` never tries WebGL (CSS sheen only); `webgl`
  force-tries. Leave at `auto` unless you have a reason.
- **`variant="fan"`** — the thin divider variant (no animated fill).
- **Theming is automatic.** The Ribbon reads `var(--ribbon-*)` from
  `hisd-theme.css` and follows the `data-theme` ancestor, so it light/dark-flips
  with the rest of the portal (see the theme bundle's toggle script).

---

## Accessibility — it's decorative

The Ribbon is a **decorative texture**, not content. The component renders the
host with `role="presentation"` and the inner SVG `aria-hidden="true"`, so screen
readers skip it. **Don't** add a `title`/`aria-label`, and **don't** encode
meaning (status, branding-as-information) that isn't also present in real text or
a properly-labeled image elsewhere on the page.

Motion is handled for you: under `prefers-reduced-motion: reduce` or
`forced-colors: active`, the component never starts the WebGL/CSS motion and shows
the still SVG.

---

## CSP — why this is safe, and what a strict policy does

The Ribbon is built to satisfy a tight Content-Security-Policy:

- **No third-party origins.** Every asset is a portal web file on your own site
  (`'self'`). Nothing loads from a CDN.
- **No inline script, no `eval`.** Registration is a single external
  `<script type="module" src="/hisd-ribbon.js">`. The WebGL shaders are shipped
  as **plain GLSL strings** handed to `gl.shaderSource` — there is no
  `eval`/`new Function`, no inline `<script>`, and no runtime asset fetch. So it
  works without `'unsafe-inline'` or `'unsafe-eval'` in `script-src`.
- **No external stylesheet origins.** Both `<link>`s are `'self'` web files.

The **default Power Pages CSP allows self-hosted scripts and styles**, so the
copy-paste block works as-is. If your portal applies a **stricter custom CSP**:

- Ensure `script-src` and `style-src` include **`'self'`** (they should for any
  portal that loads its own JS/CSS). ES modules need `script-src 'self'`, **not**
  `'unsafe-inline'`.
- If the policy still **blocks the module**, nothing breaks: the `<hisd-ribbon>`
  element renders its **static SVG floor** with no script at all, and
  `ribbon.css` (a stylesheet, governed by `style-src`) themes it. You lose the
  animation, not the brand mark.
- The optional inline `<style>` in `ribbon-embed.html` (sizing only) needs
  `style-src 'unsafe-inline'`. If your CSP forbids inline styles, move that rule
  into `ribbon.css` (or a `.hisd-ribbon-banner` web-file stylesheet) instead.

> **Auto-degrade summary.** Beyond CSP, the WebGL tier also steps down to the
> CSS/static tier under the portal's real-world constraints — reduced-motion,
> forced-colors/high-contrast, save-data, low core/memory devices, no WebGL2, an
> offscreen/hidden tab, or a lost GL context. In every one of those cases the
> canonical SVG silhouette is already on screen and stays. **The static floor is
> the contract; the animation is the enhancement.**

---

## Verifying it worked

- Page loads → you see the teal Ribbon curve immediately (that's the SVG floor).
- With `animate` set, on a normal desktop with motion enabled, the fill should
  begin a slow, continuous flow within a frame or two (the WebGL upgrade
  crossfading in). No `animate` → it stays a still SVG by design.
- Toggle OS/portal dark mode → the Ribbon recolors with the theme.
- Set **prefers-reduced-motion** (OS setting) and reload → the curve is present
  but **still**.
- Open DevTools: no CSP violations in the console, and each `/…​.js` /`/…​.css`
  web file returns **200** with the right MIME type. A 404 or wrong MIME on a
  `.js` file is the usual cause of "static but never animates".
