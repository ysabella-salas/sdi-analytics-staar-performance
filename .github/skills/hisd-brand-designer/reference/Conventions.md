# HISD Brand Designer — Conventions

How the tokens are named and used. The authoritative values are generated into
`assets/`; this page is the operating manual.

## Token tiers

1. **Reference** — the raw scales: `--hisd-teal-500`, `--hisd-neutral-900`, … (50–950 per hue). Never hard-code these in a component; they exist to be referenced by the semantic layer.
2. **Semantic** — role tokens that adapt per theme: `--color-bg`, `--color-surface`, `--color-text`, `--color-action`, `--color-border`, `--color-focus`, … **Build everything from these.**
3. **Component** — a component may add its own `--btn-…` vars that resolve to semantic tokens.

## Color roles (use these, not hex)

| Role | Use |
| --- | --- |
| `--color-bg` / `--color-surface` / `--color-surface-sunken` | page, card, inset |
| `--color-text` / `--color-text-muted` / `--color-text-subtle` | body / secondary / tertiary text |
| `--color-brand` | identity teal — accents, selected, focus rings, large headings |
| `--color-action` / `--color-on-action` / `--color-action-hover` | filled buttons + their text |
| `--color-accent` | purple secondary accent |
| `--color-focus` | focus ring (always pair with `outline-offset: 2px`) |
| `--color-selected` | selection highlight (a yellow fill that carries dark text) |
| `--color-success` / `--color-warning` / `--color-danger` / `--color-info` | status |
| `--color-border` / `--color-border-strong` | dividers, inputs |
| `--color-link` | hyperlinks |

Type: `--font-sans` (Radio Canada, default), `--font-display` (Parkinsans), `--font-serif` (Lora). Sizes `--text-xs…--text-7xl`; weights `--weight-regular…--weight-extrabold`. Space `--space-1…--space-32`; radius `--radius-sm…--radius-pill`; shadow `--shadow-1…--shadow-4`; motion `--duration-*`, `--ease-*`.

## Light and dark

```html
<html data-theme-source="system">           <!-- default: follow the OS -->
<link rel="stylesheet" href="hisd-theme.css">
```

```js
// manual override (persist the choice if you offer a toggle)
function setTheme(t){ const h=document.documentElement;
  if(t==='system'){ h.removeAttribute('data-theme'); h.dataset.themeSource='system'; }
  else { h.dataset.theme=t; h.dataset.themeSource='manual'; } }
```

The CSS resolves to dark when `[data-theme="dark"]` is set **or** the OS prefers dark and the author has not forced light. The teal brightens in dark automatically — you do nothing.

## Do / Don't

- **Do** lead with teal; use semantic tokens; verify both themes; keep clearspace around the logo; check contrast.
- **Don't** paste raw hex into components; use yellow or light-green as small text; place white text on a teal fill (use `--color-action`, the darker teal, instead); name a brand font in a Power BI report (it will not render — use Segoe UI on screen); rely on color alone to convey meaning.
