# HISD HTML Email Kit

Production-ready, on-brand HTML email for Houston Independent School District. Email
clients are not browsers: **they do not support CSS variables, linked stylesheets, or
web fonts reliably.** So this kit does the opposite of the rest of the design system —
it bakes the brand in with **inline styles and raw hex pulled from the tokens**, a
table-based layout, and brand/system font stacks that fall back to Arial.

> These files are intentionally exempt from the `var()`-only rule and are excluded from
> the brand scanner. Raw hex is correct here — every value traces back to
> `../../assets/hisd.tokens.json`.

## Files

| File | What it is |
| --- | --- |
| `components.html` | Reference sheet of bulletproof copy-paste blocks: preheader, teal header with the HISD wordmark, hero, bulletproof button (with Outlook VML fallback), secondary button, content card, two-column cards, ribbon/divider, yellow callout, hairline, and footer with address + unsubscribe. |
| `templates/announcement.html` | A ready single-message announcement assembled from the blocks (light, with dark-mode enhancement). |
| `templates/announcement-dark.html` | The **dedicated, explicit-dark** announcement: dark surface inline hex from the dark tokens, white+yellow logo, AA contrast. See "Explicit-dark variant" below. |
| `templates/newsletter.html` | A ready multi-story newsletter (lead story + two-column cards + callout). |
| `assets/` | Real HISD logo PNGs (white+yellow lockup for the teal header — and the **dark** template, where it's also the correct on-dark mark; dark-grey+teal for the light footer). PNG — **not SVG** — because email clients don't render SVG. |

Open any `.html` file in a browser to preview, or paste it into an email-testing tool
(Litmus / Email on Acid) to see it across real clients.

## The rules

### 1. Inline hex, pulled from the tokens
Every color is a raw `#RRGGBB` literal set **inline** on the element. No `var()`, no
`class`-only color, no linked CSS. The values come straight from
`../../assets/hisd.tokens.json`:

| Role | Token | Hex |
| --- | --- | --- |
| Page background | `theme.light.bg` | `#F6F7F7` |
| Card / surface | `theme.light.surface` | `#FFFFFF` |
| Footer band | `theme.light.surface-sunken` | `#EDEFEF` |
| Body text | `theme.light.text` | `#19282C` |
| Muted text | `theme.light.text-muted` | `#4B5C5F` |
| Header / hero fill | `brand.teal` | `#00A3AF` |
| Button fill + links | `theme.light.action` / `link` | `#037882` |
| On-action text | `theme.light.on-action` | `#FFFFFF` |
| Yellow callout | `brand.yellow` | `#F9D04E` |
| Ribbon colors | `brand` teal/light-green/yellow/purple | `#00A3AF` `#6DB83D` `#F9D04E` `#474F99` |
| Border / hairline | `theme.light.border` | `#DCDFE0` |

### 2. AA contrast everywhere
Every text pairing meets WCAG 2.2 AA (>= 4.5:1 for body; >= 3:1 for large/display).
Ratios are from `../../assets/contrast-report.md` and re-verified for this kit:

| Pairing | Hex | Ratio | Use |
| --- | --- | --- | --- |
| Body on white | `#19282C` on `#FFFFFF` | 15.2:1 | card body |
| Body on page bg | `#19282C` on `#F6F7F7` | 14.17:1 | base |
| Muted on white | `#4B5C5F` on `#FFFFFF` | 7.01:1 | captions |
| Muted on footer | `#4B5C5F` on `#EDEFEF` | 6.07:1 | footer text |
| Link on white | `#037882` on `#FFFFFF` | 5.23:1 | links |
| Link on footer | `#037882` on `#EDEFEF` | 4.53:1 | footer links |
| Button label | `#FFFFFF` on `#037882` | 5.23:1 | primary CTA |
| Ink on yellow | `#19282C` on `#F9D04E` | 10.25:1 | callout |
| White on teal | `#FFFFFF` on `#00A3AF` | 3.06:1 | **large/display hero only** — never body copy |

White-on-teal is only safe for large display text (the 3:1 large-text bar). Keep all
body copy on the white card; never put small light text on the teal field.

### 3. 600px table layout
- Outer `role="presentation"` table is `width="100%"`; the content table is a fixed
  `width="600"` with `max-width:600px`, centered.
- Every layout container is a `<table>`; layout tables carry `role="presentation"`.
- Mobile: a `@media (max-width:600px)` rule sets `.email-container{width:100%}`,
  drops side padding to 16px, and stacks two-column rows (`.stack`).

### 4. Alt text + dimensions on every image
Every `<img>` has descriptive `alt` text and explicit `width`/`height` so the layout
holds before images load (and many clients block images by default). Logos are PNG with
the HISD lockup spelled out in the alt text.

### 5. Body type >= 14px, brand fonts with Arial fallback
- Display headings: `'Parkinsans','Radio Canada',Arial,sans-serif`.
- Body / UI: `'Radio Canada', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif`.
- **Web fonts are not loaded** — clients that lack Parkinsans/Radio Canada fall back to
  the system stack and finally Arial, by design. No `@font-face`, no CDN.
- Body copy is 16px; the smallest text (footer/captions) is 13–14px, at or above the
  14px floor for primary reading.

### 6. Bulletproof buttons
Buttons are **not** styled `<table>`s alone or bare `<a>`s — they use the bulletproof
pattern so they render everywhere, including Outlook's Word engine:
- A `<!--[if mso]>` **VML `<v:roundrect>`** gives Outlook the rounded fill it otherwise
  drops, with `arcsize="50%"` for the pill shape.
- All other clients use a padded, fixed-width `<a>` with inline `background-color`,
  `border-radius`, and `line-height`-based vertical centering.
- The label and `href` appear in **both** the VML and the anchor — edit both together.

### 7. Dark mode = progressive enhancement
A `<style>` block in `<head>` carries `@media (prefers-color-scheme: dark)` overrides,
applied through `dm-*` classes (`dm-bg`, `dm-surface`, `dm-text`, `dm-link`,
`dm-action`, …). Dark values come from `theme.dark.*` in the tokens — and dark mode
**tunes the teal brighter** (`#4CBFC7` action with `#121F22` ink, 7.7:1) rather than
pasting the raw brand color onto a dark surface.

This is a **courtesy, not a contract**. Gmail and Outlook desktop ignore the head
`<style>` entirely; the **inline light palette must be fully legible on its own**, and
it is. Apple Mail, iOS Mail, and Outlook.com honor the dark overrides.

### 8. Ribbon = a simplified 4-color fan band (not the canonical device)

The HISD Ribbon's canonical form is a **field + white-strokes device**: a brand-teal
field (`#00A3AF` in both light and dark, with only the stroke opacity flipping) overlaid
with low-opacity, round-capped white strokes generated by the line kit. That device relies
on **SVG, fractional opacity, and CSS variables** — exactly the things email clients strip
or render inconsistently.

So in email the Ribbon degrades, by design, to a **bulletproof 4-color fan band**: a thin
divider built from solid `brand` teal / light-green / yellow / purple
(`#00A3AF` `#6DB83D` `#F9D04E` `#474F99`) as flat inline-hex table cells — **no SVG, no
opacity, no `var()`**. It carries the brand's color story across every client while staying
within the inline-hex, table-layout contract above. This is the correct, platform-appropriate
form of the Ribbon *for email* — not a downgrade to fix later.

The canonical field + white-strokes device lives in **print, web, social, and Power BI**,
where SVG, opacity, and CSS variables are available. Do not try to reconstruct it here.

### Explicit-dark variant — `templates/announcement-dark.html`

**Email dark mode is client-dependent.** There is no reliable, universal way to ship one
email that turns dark for everyone: Gmail and Outlook desktop strip the `<head><style>`
that carries `prefers-color-scheme` overrides, some clients auto-invert your colors, and
others leave them untouched. The `dm-*` enhancement above is the best-effort approach for
a *light-first* email.

When you want a message that is **dark in every client regardless of the recipient's
setting**, use the dedicated dark template instead. It is the explicit-dark counterpart of
`announcement.html`:

- Every color is an inline raw `#RRGGBB` literal from the **`theme.dark.*`** token values
  (`[data-theme="dark"]` in `assets/hisd-theme.css`) — dark surface `#19282C`, page
  `#121F22`, raised `#24383C`, border `#314448`, text `#F6F7F7`, muted `#C2C7C8`.
- The header/hero and primary button use the **brightened teal `#4CBFC7`** with **dark ink
  `#121F22`** (7.7:1) — on the brightened teal field, text must be dark ink; light text on
  `#4CBFC7` fails AA. Body copy is light text on the dark surface; links are `#8CD6DB`.
- The **white+yellow** logo lockup is reused (it is the correct on-dark mark), in both the
  header and the footer.
- It does **not** carry a `prefers-color-scheme` block and does not invert — it is dark by
  construction, so it renders dark even in clients that ignore `<style>`.

Use the light `announcement.html` as the default; reach for `announcement-dark.html` for an
intentionally dark send. All pairings in it clear WCAG 2.2 AA (verified below).

| Pairing (dark template) | Hex | Ratio | Use |
| --- | --- | --- | --- |
| Body on dark surface | `#F6F7F7` on `#19282C` | 14.17:1 | card body |
| Body on page bg | `#F6F7F7` on `#121F22` | 15.72:1 | base |
| Muted on raised footer | `#C2C7C8` on `#24383C` | 7.21:1 | footer text |
| Link on dark surface | `#8CD6DB` on `#19282C` | 9.24:1 | links |
| Dark ink on teal header/hero | `#121F22` on `#4CBFC7` | 7.7:1 | header + hero text |
| Button label on teal | `#121F22` on `#4CBFC7` | 7.7:1 | primary CTA |
| Ink on yellow callout | `#121F22` on `#F9D04E` | 11.38:1 | callout |

## Client test matrix

Test every send across these clients before shipping. The kit targets the three that
matter most for an HISD audience (district staff on Outlook, families on Gmail/Apple).

| Client | Engine | Watch for | Status in this kit |
| --- | --- | --- | --- |
| **Outlook 2016–2021 / 365 (Windows)** | Word (mso) | No `border-radius` on `<a>`; strips `<style>`; needs VML buttons; `PixelsPerInch=96`; gaps from cell spacing | VML roundrect fallback on every button; `mso` office-document settings in head; all spacing via padding, no margins on cells |
| **Gmail (web + Android/iOS app)** | Gmail | Strips `<head><style>` in many contexts and `class`-based dark mode; clips messages > ~102KB | All color inline; dark mode is enhancement only; each file is well under the clip limit |
| **Apple Mail (macOS) / iOS Mail** | WebKit | Honors `prefers-color-scheme`; may auto-invert if `color-scheme` meta missing; text-size-adjust on small type | `color-scheme` + `supported-color-schemes` meta set; `dm-*` dark overrides supplied; `-webkit-text-size-adjust:none` on buttons |
| **Outlook.com / Outlook (new, Win)** | Webview | Honors `prefers-color-scheme`; rewrites some classes | Dark overrides apply; layout is inline so it survives rewrites |
| **Yahoo / AOL** | — | Strips some `<style>`; class prefixes | Inline-first design tolerates stripping |

### Pre-send checklist
- [ ] Preheader text reads well in the inbox snippet and isn't duplicated visually.
- [ ] Every image has `alt` text and explicit `width`/`height`.
- [ ] Primary CTA renders as a filled pill in Outlook (VML), Gmail, and Apple Mail.
- [ ] Body copy is legible at default zoom; nothing below 14px for primary reading.
- [ ] Light-mode rendering is fully legible **without** dark mode (the contract).
- [ ] Dark-mode rendering is checked in Apple Mail / Outlook.com (the enhancement).
- [ ] Footer carries the HISD name, a **physical mailing address**, and a working
      **unsubscribe** link (CAN-SPAM). Replace `%%unsubscribe_url%%`,
      `%%preferences_url%%`, and `%%view_in_browser_url%%` with your ESP's merge tags.
- [ ] Links point to real `houstonisd.org` destinations.
- [ ] For family-facing sends, confirm a Spanish version or a language toggle.

## Customizing

1. Copy `templates/announcement.html` or `templates/newsletter.html` as a starting point,
   or assemble fresh from the blocks in `components.html`.
2. Swap copy, `href`s, and the merge tags. Keep the hex values as-is so the brand holds.
3. Keep the logo lockups: **white+yellow on the teal header**, **dark-grey+teal on the
   light footer** (HISD logo discipline). Don't recolor the marks.
4. Preview in a browser, then run a real cross-client test (Litmus / Email on Acid)
   against the matrix above before sending.
