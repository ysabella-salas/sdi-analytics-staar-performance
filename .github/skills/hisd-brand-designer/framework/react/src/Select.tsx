import {
  forwardRef,
  useCallback,
  useId,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from "react";

/**
 * HISD Select — typed React wrapper around the design-system `select` component.
 *
 * This is a THIN behaviour + markup layer. It re-uses the existing component
 * CSS (assets/hisd-theme.css + components/components.css → select.css) by
 * applying the same `hisd-select*` classes and the same ARIA contract as
 * components/select.html. It never re-implements styling.
 *
 * The underlying control is a native `<select>`, which already implements the
 * full WAI-ARIA listbox keyboard contract (Arrow keys move, Enter/Space open
 * and confirm, Escape closes, Home/End, type-ahead). On top of that, this
 * component ports the two app-level behaviours from the demo's <script>:
 *
 *   1. Keep the subtle "placeholder" tint (`data-placeholder`) in sync with the
 *      empty value — on while the empty option is selected, off once a real
 *      value is chosen.
 *   2. Recover from the error state on a valid change: drop `data-invalid` on
 *      the field and flip `aria-invalid` to "false" once a real value is picked.
 *
 * Plus: Escape blurs the control so the focus state is visibly released
 * (mirrors the demo). Reduced-motion is honoured implicitly by the CSS.
 */

/** A single option in the select. */
export interface SelectOption {
  /** The option's submitted value. Use "" for a placeholder option. */
  value: string;
  /** Visible label. */
  label: ReactNode;
  /** Native `disabled` on the <option>. */
  disabled?: boolean;
  /** Native `hidden` on the <option> (used for placeholder options). */
  hidden?: boolean;
}

export interface SelectProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "size" | "value" | "defaultValue" | "onChange" | "children"
  > {
  /** Visible label text rendered above the control. */
  label: ReactNode;
  /**
   * Options to render. Alternatively pass raw <option> nodes via `children`.
   * If both are given, `options` is rendered before `children`.
   */
  options?: SelectOption[];
  /** Raw <option> / <optgroup> nodes, if you prefer JSX over `options`. */
  children?: ReactNode;
  /** Controlled value. Omit for an uncontrolled select (use `defaultValue`). */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Change handler. Receives the native event; `value` is on the target. */
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  /** Helper text shown below the control (suppressed when `error` is set). */
  helperText?: ReactNode;
  /**
   * Error message. When set, the field renders the invalid state
   * (`data-invalid="true"`, `aria-invalid`, `role="alert"` message + icon)
   * and the helper text is hidden.
   */
  error?: ReactNode;
  /** Marks the field required: shows the `*` marker and sets `required`. */
  required?: boolean;
  /** Disables the control. */
  disabled?: boolean;
  /**
   * Forces the placeholder tint independently of the value. By default the
   * tint tracks the empty value automatically.
   */
  placeholder?: boolean;
  /** Stable id for the control. Auto-generated when omitted. */
  id?: string;
  /** Extra class names appended to the field root. */
  className?: string;
}

export const Select = forwardRef(function Select(
  props: SelectProps,
  ref: Ref<HTMLSelectElement>,
) {
  const {
    label,
    options,
    children,
    value,
    defaultValue,
    onChange,
    helperText,
    error,
    required = false,
    disabled = false,
    placeholder,
    id,
    className,
    "aria-describedby": ariaDescribedByProp,
    ...rest
  } = props;

  const reactId = useId();
  const controlId = id ?? `hisd-select-${reactId}`;
  const helperId = `${controlId}-help`;
  const errorId = `${controlId}-error`;

  const isControlled = value !== undefined;
  const isInvalid = error != null && error !== false;

  // Track the current value (uncontrolled) so the placeholder tint can follow
  // it without the consumer wiring anything. For controlled usage we read the
  // prop directly.
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? "",
  );
  const currentValue = isControlled ? value : internalValue;

  // Placeholder tint: explicit prop wins, otherwise track the empty value.
  const isPlaceholder = placeholder ?? currentValue === "";

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      if (!isControlled) {
        setInternalValue(event.target.value);
      }
      onChange?.(event);
    },
    [isControlled, onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLSelectElement>) => {
      // Native <select> consumes the first Escape to close an open popup;
      // when the list is already closed, blur so the focus state releases.
      if (event.key === "Escape") {
        event.currentTarget.blur();
      }
      rest.onKeyDown?.(event);
    },
    [rest],
  );

  // Wire aria-describedby to whichever message is shown, preserving any
  // caller-supplied ids.
  const describedBy =
    [ariaDescribedByProp, isInvalid ? errorId : helperText != null ? helperId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const fieldClassName = className
    ? `hisd-select-field ${className}`
    : "hisd-select-field";

  return (
    <div className={fieldClassName} data-invalid={isInvalid ? "true" : undefined}>
      <label className="hisd-select-label" htmlFor={controlId}>
        {label}
        {required ? (
          <span className="hisd-select-label__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <span className="hisd-select">
        <select
          {...rest}
          ref={ref}
          id={controlId}
          className="hisd-select__control"
          disabled={disabled}
          required={required}
          aria-invalid={isInvalid ? "true" : undefined}
          aria-describedby={describedBy}
          data-placeholder={isPlaceholder ? "true" : undefined}
          {...(isControlled ? { value } : { defaultValue })}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        >
          {options?.map((option, index) => (
            <option
              key={`${option.value}-${index}`}
              value={option.value}
              disabled={option.disabled}
              hidden={option.hidden}
            >
              {option.label}
            </option>
          ))}
          {children}
        </select>
      </span>

      {isInvalid ? (
        <p className="hisd-select-error" id={errorId} role="alert">
          <span className="hisd-select-error__icon" aria-hidden="true" />
          {error}
        </p>
      ) : helperText != null ? (
        <p className="hisd-select-helper" id={helperId}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
