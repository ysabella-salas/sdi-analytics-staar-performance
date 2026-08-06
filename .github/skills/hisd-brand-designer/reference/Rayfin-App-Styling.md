# Rayfin App Styling

Use this reference when applying the HISD design system to Rayfin or Microsoft Fabric App shells.

## Header Bar

- The first viewport should be the working app, not a hero. Use the app name as the header title.
- Do not add a second product link or subtitle such as "Process monitoring dashboard" when the app title already explains the surface.
- Light-mode app bars use the brand teal (`--color-brand`). Dark-mode app bars stay in the teal family on a deepened surface — a deep teal, never charcoal, slate, purple, or a gradient — and this bar background resolves through a named token, never a hard-coded hex. (The bar is a *surface*, distinct from the brighter `--color-brand` accent step dark mode promotes for foreground use; see the model's "App Shell Headers" pattern.)
- Use the white/yellow HISD horizontal logo lockup on colored app bars. On white/light app bars, use the dark-grey/teal lockup.
- Keep the brand/title block and the action cluster on one row until the viewport is genuinely narrow. Stack actions only near phone widths, and keep stacked actions aligned with the content inset rather than pushed to the viewport edge.
- Header layout should use `minmax(0, 1fr)` for the title side and a max-content action side, with wrapping inside the action cluster before the whole header stacks.
- The app bar must not introduce a page-level minimum width. It should work down to narrow mobile widths without horizontal scroll.

## Buttons And Theme Toggle

- Primary header buttons use the action token set — `--color-action` fill, `--color-on-action` text, `--color-action-hover` on hover/active — i.e. the Button "action" variant, not a one-off teal. Secondary header actions may use a transparent/light surface treatment only when the primary action remains clear.
- Use icon buttons for compact binary modes such as light/dark. Do not show the visible words "Light" and "Dark" inside the app bar.
- Prefer the React `ThemeToggle` component from `framework/react/src/ThemeToggle.tsx` for React apps. Its visual state uses icons; its accessible state uses `aria-pressed` and explicit labels.
- In Rayfin app bars, use the `ThemeToggle` `variant="appbar"` treatment. The active dark-mode button should be a light gray pill and its moon icon should inherit the app bar background color through `--hisd-theme-toggle-appbar-active-dark-icon`; for Rayfin apps, bind it to `var(--color-app-bar-bg)`. Do not fill the inactive dark option.
- Keep focus rings visible against both teal app bars and neutral surfaces.

## Filter Buttons

Operational app filters use **filled filter buttons**, not Chips. These are selection controls in action/button territory, so they may legitimately use the action color — which is exactly what keeps them out of Chip territory (the base Chip never uses the action color; its selected state is the soft-teal `--color-selected`). See the model's "Filled filter buttons" pattern.

- An active filter uses `--color-action` fill, `--color-on-action` text, and `--color-action-hover` on hover/active, with the `--radius-lg` (12 px) corner. The unselected state is a `--color-surface` / `--color-border` outline treatment so selected vs. unselected is unambiguous.
- Multi-select groups carry `aria-pressed` per option; single-select groups are a `role="radiogroup"`.
- Let groups wrap naturally and use ellipsis only as a final containment guard for very long labels.
- Do not restyle the base dismissible Chip into this; keep general tags on the Chip contract.

## Rayfin Proof Notes

These are verification-tooling notes (how to *prove* a Rayfin change), not styling rules — kept here because they are Rayfin-host-specific. The app-bar/button/filter rules above are the design contract; the model's "App Shell Headers" pattern is the canonical source for both.

- Generated-host app load/UI/console proof may use the built-in Codex browser.
- Generated-host sign-in completion should use Chrome extension/browser control or Computer Use because the built-in browser can lose popup/opener context.
- Embedded AppBackend proof may use the built-in browser when testing the Fabric item URL because Fabric supplies the parent frame context.
