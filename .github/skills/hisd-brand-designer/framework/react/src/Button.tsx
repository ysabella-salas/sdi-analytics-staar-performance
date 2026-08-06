import * as React from 'react';

/**
 * Minimal ambient declaration so the dev-only NODE_ENV guard typechecks in a
 * pure DOM/React environment WITHOUT pulling in `@types/node`. Build tools
 * (Vite, webpack, etc.) statically replace `process.env.NODE_ENV`, so this is
 * never actually read at runtime in production bundles.
 */
declare const process:
  | { env?: { NODE_ENV?: string } }
  | undefined;

/**
 * HISD Button — typed React wrapper around the vanilla `hisd-button` component.
 *
 * This is a THIN behavior + markup layer. All styling, theming, state colors,
 * focus ring, disabled/loading visuals, reduced-motion and forced-colors
 * handling come entirely from the design-system CSS:
 *   - assets/hisd-theme.css      (tokens, light/dark)
 *   - components/components.css   (or components/button.css)
 *
 * The wrapper only:
 *   1. Renders the canonical markup (.hisd-button > .__spinner / .__icon / .__label).
 *   2. Applies the correct variant / icon-only classes.
 *   3. Wires the accessibility contract (aria-busy, aria-disabled, aria-label,
 *      aria-hidden on decorative glyphs).
 *
 * It deliberately re-uses the native <button>, which the WAI-ARIA APG button
 * pattern already activates on Enter and Space — so keyboard support is free
 * and identical to the vanilla demo. No key handlers are re-implemented.
 */

/** Intent variants mirror the `.hisd-button--*` modifier classes. */
export type ButtonVariant = 'action' | 'secondary' | 'ghost' | 'danger';

/**
 * Props for {@link Button}.
 *
 * Extends the native button attributes so callers can pass `type`, `name`,
 * `form`, `value`, `onClick`, `data-*`, etc. straight through via `...rest`.
 * We omit the raw `disabled` so we can also accept the soft `aria-disabled`
 * form and keep a single typed `disabled` surface.
 */
export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Intent variant. Defaults to `"action"`. */
  variant?: ButtonVariant;
  /**
   * Disabled state. Maps to the native `disabled` attribute, which the CSS
   * targets alongside `[aria-disabled="true"]`.
   */
  disabled?: boolean;
  /**
   * Loading state. Sets `aria-busy="true"`; the CSS hides the label/icon and
   * reveals the spinner. While loading the button is non-interactive (the CSS
   * sets `pointer-events: none`, and we also guard clicks).
   */
  loading?: boolean;
  /**
   * Render as an icon-only control (adds `.hisd-button--icon-only`). When true,
   * `aria-label` is REQUIRED — the accessible name can no longer come from a
   * visible text label. In development a console warning fires if it's missing.
   */
  iconOnly?: boolean;
  /**
   * Optional leading icon. Rendered inside a decorative `.hisd-button__icon`
   * wrapper (aria-hidden) so the accessible name always comes from the label
   * or `aria-label` — never the glyph.
   */
  icon?: React.ReactNode;
  /** The visible label content (wrapped in `.hisd-button__label`). */
  children?: React.ReactNode;
}

/**
 * HISD Button.
 *
 * @example
 * <Button variant="action" onClick={save}>Save changes</Button>
 * <Button variant="secondary" iconOnly aria-label="Add item" icon={<PlusIcon />} />
 * <Button variant="action" loading>Submit</Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(props, ref) {
    const {
      variant = 'action',
      disabled = false,
      loading = false,
      iconOnly = false,
      icon,
      children,
      className,
      type,
      onClick,
      'aria-label': ariaLabel,
      ...rest
    } = props;

    // Dev-only guard mirroring the vanilla contract: icon-only buttons MUST
    // carry an accessible name. Read NODE_ENV defensively (no @types/node
    // dependency): bundlers replace `process.env.NODE_ENV` at build time and
    // tree-shake this block out of production.
    const nodeEnv =
      typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
    if (
      nodeEnv !== 'production' &&
      iconOnly &&
      !ariaLabel &&
      !rest['aria-labelledby']
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        '[hisd-button] An icon-only Button requires `aria-label` (or `aria-labelledby`) to be accessible.',
      );
    }

    const classes = [
      'hisd-button',
      `hisd-button--${variant}`,
      iconOnly ? 'hisd-button--icon-only' : null,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // When loading we suppress activation so a click can't fire mid-request,
    // matching the vanilla CSS `pointer-events: none` on [aria-busy="true"].
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (loading || disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <button
        {...rest}
        ref={ref}
        // Native <button> defaults to type="submit"; default to "button" to
        // match the vanilla demo markup and avoid accidental form submits.
        type={type ?? 'button'}
        className={classes}
        disabled={disabled || undefined}
        aria-busy={loading || undefined}
        aria-label={ariaLabel}
        onClick={handleClick}
      >
        {/* Spinner is always in the DOM; CSS reveals it only under aria-busy. */}
        <span className="hisd-button__spinner" aria-hidden="true" />
        {icon ? (
          <span className="hisd-button__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children != null ? (
          <span className="hisd-button__label">{children}</span>
        ) : null}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
