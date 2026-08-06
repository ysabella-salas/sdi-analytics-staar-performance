import * as React from "react";

/**
 * HISD — Input Text (React wrapper)
 * ---------------------------------------------------------------------------
 * Thin behavior + markup layer over the vanilla `hisd-input-text` component.
 * It applies the SAME `hisd-input-text*` classes and ARIA contract as
 * components/input-text.html and is styled ENTIRELY by the design-system CSS
 * (assets/hisd-theme.css + components/components.css). It re-implements no
 * styling of its own.
 *
 * The only interactive behavior the vanilla demo ships is the optional
 * "clearable" search field: a clear button that appears when the field has a
 * value, Escape-to-clear, and return-focus to the field after clearing. That
 * behavior is ported faithfully here.
 *
 * Requires React 18 (`useId`).
 */

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  // Owned by this component so markup/ARIA stays in lockstep with the CSS:
  "className" | "id" | "value" | "defaultValue" | "aria-invalid" | "aria-describedby"
>;

export interface InputTextProps extends NativeInputProps {
  /** Visible label rendered ABOVE the control (never placeholder-as-label). */
  label: React.ReactNode;
  /**
   * Id for the `<input>`. Wires `<label for>` / `aria-describedby`. If omitted,
   * a stable generated id is used (React 18 `useId`).
   */
  id?: string;
  /** Controlled value. Provide together with `onChange` for a controlled field. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Marks the field required: shows the `*` marker and sets the `required` attr. */
  required?: boolean;
  /** Disabled state — non-interactive, dimmed via the component CSS. */
  disabled?: boolean;
  /** Read-only state — selectable but visually quieter. */
  readOnly?: boolean;
  /**
   * Error state. When `true` (or a non-empty string) the root gets `.is-error`,
   * the field gets `aria-invalid="true"`, and (for a string) the message renders
   * in the `hisd-input-text__error` region with `role="alert"`.
   */
  error?: boolean | string;
  /** Helper text rendered below the control (suppressed when an error string shows). */
  helperText?: React.ReactNode;
  /** Decorative leading icon (rendered inside the control, `aria-hidden`). */
  leadingIcon?: React.ReactNode;
  /** Decorative trailing icon (mutually exclusive with `clearable`). */
  trailingIcon?: React.ReactNode;
  /**
   * Adds the clearable behavior: a clear button that appears when the field has
   * a value, Escape-to-clear, and return-focus to the field after clearing.
   */
  clearable?: boolean;
  /** Accessible label for the clear button (default: "Clear"). */
  clearLabel?: string;
  /** Called after the field is cleared (value already reset). */
  onClear?: () => void;
}

const ClearGlyph = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z" />
  </svg>
);

export const InputText = React.forwardRef<HTMLInputElement, InputTextProps>(
  function InputText(props, forwardedRef) {
    const {
      label,
      id,
      value,
      defaultValue,
      required,
      disabled,
      readOnly,
      error,
      helperText,
      leadingIcon,
      trailingIcon,
      clearable,
      clearLabel = "Clear",
      onClear,
      onChange,
      onKeyDown,
      type = "text",
      ...rest
    } = props;

    const reactId = React.useId();
    const fieldId = id ?? `hisd-input-${reactId}`;
    const helperId = `${fieldId}-help`;
    const errorId = `${fieldId}-error`;

    const errorMessage = typeof error === "string" ? error : undefined;
    const hasError = error === true || (typeof error === "string" && error.length > 0);

    // Keep a local mirror of "does the field currently have text?" so the clear
    // button visibility tracks both controlled and uncontrolled usage. Seed it
    // from whichever initial value was supplied (mirrors the demo's init sync()).
    const isControlled = value !== undefined;
    const [hasValue, setHasValue] = React.useState<boolean>(
      ((isControlled ? value : defaultValue) ?? "").length > 0,
    );

    // Internal ref so we can clear/focus the field; also forward it outward.
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    // For controlled fields, keep hasValue in sync with the value prop.
    React.useEffect(() => {
      if (isControlled) setHasValue((value ?? "").length > 0);
    }, [isControlled, value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) setHasValue(e.target.value.length > 0);
      onChange?.(e);
    };

    const clear = React.useCallback(() => {
      const node = innerRef.current;
      if (node && !isControlled) {
        // Uncontrolled: mutate the DOM value and fire a native-style input event
        // so any listeners (and our own state) observe the reset.
        node.value = "";
        setHasValue(false);
      }
      node?.focus(); // return focus to the field after clearing (matches demo)
      onClear?.();
    }, [isControlled, onClear]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (clearable && e.key === "Escape" && !e.defaultPrevented) {
        const current = isControlled ? value ?? "" : innerRef.current?.value ?? "";
        if (current.length > 0) {
          e.preventDefault(); // don't bubble to ancestor dialogs
          clear();
        }
      }
    };

    // aria-describedby points at whichever supporting text is rendered.
    const describedBy =
      errorMessage !== undefined ? errorId : helperText != null ? helperId : undefined;

    const showClear = clearable && hasValue && !disabled && !readOnly;

    return (
      <div className={hasError ? "hisd-input-text is-error" : "hisd-input-text"}>
        <label className="hisd-input-text__label" htmlFor={fieldId}>
          {label}
          {required ? (
            <span className="hisd-input-text__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>

        <div className="hisd-input-text__control">
          {leadingIcon ? (
            <span
              className="hisd-input-text__icon hisd-input-text__icon--leading"
              aria-hidden="true"
            >
              {leadingIcon}
            </span>
          ) : null}

          <input
            {...rest}
            ref={setRefs}
            id={fieldId}
            type={type}
            className="hisd-input-text__field"
            required={required}
            disabled={disabled}
            readOnly={readOnly}
            value={value}
            defaultValue={defaultValue}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />

          {clearable ? (
            <button
              type="button"
              className="hisd-input-text__action"
              hidden={!showClear}
              aria-label={clearLabel}
              onClick={clear}
            >
              <ClearGlyph />
            </button>
          ) : trailingIcon ? (
            <span
              className="hisd-input-text__icon hisd-input-text__icon--trailing"
              aria-hidden="true"
            >
              {trailingIcon}
            </span>
          ) : null}
        </div>

        {errorMessage !== undefined ? (
          <p className="hisd-input-text__error" id={errorId} role="alert">
            {errorMessage}
          </p>
        ) : helperText != null ? (
          <p className="hisd-input-text__helper" id={helperId}>
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);
