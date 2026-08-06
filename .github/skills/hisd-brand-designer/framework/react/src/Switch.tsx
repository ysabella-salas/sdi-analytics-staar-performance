import * as React from "react";

/**
 * HISD Switch — typed React wrapper around the vanilla `.hisd-switch` component.
 *
 * This is a thin behavior + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/switch.css). This component only:
 *   - renders the canonical `<button class="hisd-switch" role="switch">` markup,
 *   - applies the correct ARIA (aria-checked, aria-disabled, labelling),
 *   - ports the vanilla toggle behavior (flip aria-checked on activation,
 *     announce the new state via an optional polite live region),
 *   - lets the native <button> handle Space/Enter activation, suppressing the
 *     default Space page-scroll on keydown (matching switch.html's <script>).
 *
 * Reduced motion is honored implicitly by the CSS (it drops the thumb
 * transition under prefers-reduced-motion), so nothing is needed here.
 */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export interface SwitchProps
  extends Omit<
    ButtonProps,
    // These are owned/derived by the component — don't let callers set them raw.
    "type" | "role" | "aria-checked" | "aria-disabled" | "children" | "onChange"
  > {
  /**
   * Controlled checked state. When provided, the component is controlled:
   * the consumer must update `checked` in response to `onCheckedChange`.
   */
  checked?: boolean;
  /** Initial checked state for the uncontrolled case. Defaults to `false`. */
  defaultChecked?: boolean;
  /**
   * Fires after a successful toggle (i.e. not while disabled) with the next
   * boolean value. In controlled mode use this to update `checked`.
   */
  onCheckedChange?: (checked: boolean) => void;
  /**
   * Disables the control. Renders BOTH the native `disabled` attribute and
   * `aria-disabled="true"` so the CSS disabled styling and the
   * `:not([disabled]):not([aria-disabled="true"])` hover/active guards both
   * resolve, matching the vanilla component's contract.
   */
  disabled?: boolean;
  /**
   * Accessible name for an icon-only / standalone control. Use this OR
   * `aria-labelledby` (a visible label's id). One of them is required for the
   * switch to have an accessible name.
   */
  "aria-label"?: string;
  /** Id(s) of the visible label element(s) that name this switch. */
  "aria-labelledby"?: string;
}

/**
 * Resolve the accessible name the way switch.html's script does, for the
 * live-region announcement: prefer aria-label, fall back to the
 * aria-labelledby target's text, then to "Setting".
 */
function resolveName(el: HTMLButtonElement): string {
  const label = el.getAttribute("aria-label");
  if (label) return label.trim();
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    // aria-labelledby may be a space-separated id list.
    const text = labelledby
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "Setting";
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(props, forwardedRef) {
    const {
      checked: checkedProp,
      defaultChecked = false,
      onCheckedChange,
      disabled = false,
      onClick,
      onKeyDown,
      className,
      ...rest
    } = props;

    const isControlled = checkedProp !== undefined;
    const [internalChecked, setInternalChecked] =
      React.useState<boolean>(defaultChecked);
    const checked = isControlled ? (checkedProp as boolean) : internalChecked;

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (disabled) return;
        const next = !checked;
        if (!isControlled) setInternalChecked(next);
        onCheckedChange?.(next);
      },
      [onClick, disabled, checked, isControlled, onCheckedChange],
    );

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        onKeyDown?.(event);
        // Native <button> synthesizes a click for both Enter and Space, so we
        // do NOT toggle here (that would double-toggle). We only suppress the
        // default Space page-scroll — matching switch.html's <script>.
        if (event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
        }
      },
      [onKeyDown],
    );

    const switchClass = ["hisd-switch", className].filter(Boolean).join(" ");

    return (
      <button
        {...rest}
        ref={forwardedRef}
        type="button"
        role="switch"
        className={switchClass}
        aria-checked={checked}
        // Render both native disabled and aria-disabled so the CSS contract
        // (opacity + pointer-events via [disabled], and the
        // :not([aria-disabled="true"]) hover/active guards) fully resolves.
        disabled={disabled || undefined}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
    );
  },
);

export default Switch;

/**
 * Optional convenience wrapper that mirrors the vanilla `.hisd-switch-field`
 * layout (a visible label + the switch on one row, with an optional hint and
 * a polite live region announcing the new state).
 *
 * Purely presentational chrome around <Switch>; styling comes from
 * components/switch.css.
 */
export interface SwitchFieldProps extends SwitchProps {
  /** Visible label text rendered before the control. */
  label: React.ReactNode;
  /** Optional secondary hint text shown under the label. */
  hint?: React.ReactNode;
  /** Push the control to the inline-end (adds `--spread`). Defaults to true. */
  spread?: boolean;
  /**
   * Announce state changes in a polite live region. Defaults to true.
   * Set false to suppress the live region entirely.
   */
  announce?: boolean;
}

export function SwitchField(props: SwitchFieldProps) {
  const {
    label,
    hint,
    spread = true,
    announce = true,
    onCheckedChange,
    id: idProp,
    ...switchProps
  } = props;

  const reactId = React.useId();
  const baseId = idProp ?? `hisd-switch-${reactId}`;
  const labelId = `${baseId}-label`;
  const switchRef = React.useRef<HTMLButtonElement>(null);
  const liveRef = React.useRef<HTMLSpanElement>(null);

  const handleCheckedChange = React.useCallback(
    (next: boolean) => {
      onCheckedChange?.(next);
      if (announce && switchRef.current && liveRef.current) {
        const name = resolveName(switchRef.current);
        liveRef.current.textContent = `${name} ${next ? "on" : "off"}`;
      }
    },
    [onCheckedChange, announce],
  );

  const fieldClass = [
    "hisd-switch-field",
    spread && "hisd-switch-field--spread",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={fieldClass}>
      <span className="hisd-switch-field__label" id={labelId}>
        {label}
        {hint ? <span className="hisd-switch-field__hint">{hint}</span> : null}
      </span>
      <Switch
        {...switchProps}
        id={baseId}
        ref={switchRef}
        aria-labelledby={switchProps["aria-labelledby"] ?? labelId}
        onCheckedChange={handleCheckedChange}
      />
      {announce ? (
        <span ref={liveRef} className="visually-hidden" aria-live="polite" />
      ) : null}
    </div>
  );
}
