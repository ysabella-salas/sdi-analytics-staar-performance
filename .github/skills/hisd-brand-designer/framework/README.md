# HISD framework components

Typed, behavior-complete wrappers over the HISD component CSS, in two flavors. They
**reuse the design-system stylesheet** — they apply the canonical `hisd-*` classes
and ARIA and re-implement no styling — so theming (light/dark), the contrast-gated
tokens, and the forced-colors support all come for free.

Both flavors require the two stylesheets on the page:

```html
<link rel="stylesheet" href="…/assets/hisd-theme.css">      <!-- tokens, light + dark -->
<link rel="stylesheet" href="…/components/components.css">  <!-- component styles -->
```

## React (`react/`)

22 typed function components (React 18), one per design-system component, with named
exports and a barrel:

```tsx
import { Button, Tabs, Modal } from "hisd-react";   // from react/src/index.ts

<Button variant="action" onClick={save}>Save</Button>
```

Each component forwards refs where natural, spreads `...rest` to its root, types its
variants/states, and ports the interaction logic (tabs roving + arrows, modal
focus-trap, accordion, toast queue, tooltip, switch, pagination, table sort/select).
Verify with `cd react && npm install && npm run typecheck` (strict `tsc`).

## Web Components (`web-components/`)

22 framework-agnostic custom elements (`<hisd-button>`, `<hisd-tabs>`, …) using
**light DOM** so the global design-system CSS styles them. Import once to register all:

```html
<script type="module" src="…/web-components/src/index.js"></script>
<hisd-button variant="action">Save</hisd-button>
```

Each reflects key attributes, mirrors the React behavior/ARIA, re-emits native +
custom events, and cleans up in `disconnectedCallback`. Open `web-components/demo.html`
in a browser to see them live. They work in any framework (or none) — including
Bootstrap-based portals like Power Pages.

## Notes

- These wrappers are **not published** (private packages) — copy the folder, or wire
  it into your app's build. The styling contract is the CSS; the wrappers are a thin
  typed/behavioral layer over it.
- Accessibility (roles, keyboard, focus, reduced-motion, forced-colors) is inherited
  from the component CSS + the ported logic; keep both stylesheets linked.
