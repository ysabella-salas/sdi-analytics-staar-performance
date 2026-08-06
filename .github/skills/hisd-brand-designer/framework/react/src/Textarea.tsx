import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";

/**
 * HISD Textarea — typed React wrapper over the vanilla `hisd-textarea-*`
 * component. It owns no styling: every class it applies
 * (`hisd-textarea-field`, `hisd-textarea-label`, `hisd-textarea-control`, …)
 * is defined in components/textarea.css, themed by assets/hisd-theme.css. This
 * file is a thin markup + behavior layer.
 *
 * Accessibility contract mirrored from textarea.html:
 *  - <label> sits above the control and is wired with htmlFor / id.
 *  - helper + error text are linked through aria-describedby.
 *  - error state is driven by aria-invalid (so the visual and a11y states can
 *    never drift); the field also carries data-invalid="true" for the label tint.
 *  - the live character counter is announced via aria-live="polite" and flags
 *    data-over once the length reaches the maximum — the single bit of real JS
 *    behavior on this component, ported from the demo's <script>.
 */

/** Props the wrapper consumes itself — everything else spreads onto <textarea>. */
type OwnProps = {
  /** Visible label text. Required for an accessible field. */
  label: ReactNode;
  /** Helper text rendered below the control and linked via aria-describedby. */
  helper?: ReactNode;
  /**
   * Error message. When present (and `invalid` is not explicitly false) the
   * field switches to the error state: aria-invalid, data-invalid, role="alert".
   */
  error?: ReactNode;
  /**
   * Force the invalid state on/off. Defaults to `true` whenever `error` is set.
   * Useful for showing the danger border before an error message exists.
   */
  invalid?: boolean;
  /** Marks the field required: native `required` plus a visible `*` glyph. */
  required?: boolean;
  /**
   * Show a live character counter under the control. When a number, it is used
   * as both the displayed maximum and the native maxLength (unless maxLength is
   * passed explicitly). `true` uses `maxLength` if provided.
   */
  showCount?: boolean | number;
  /** id for the control; auto-generated when omitted. */
  id?: string;
};

export type TextareaProps = OwnProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">;

function joinIds(...ids: Array<string | undefined | false>): string | undefined {
  const list = ids.filter((x): x is string => Boolean(x));
  return list.length ? list.join(" ") : undefined;
}

export const Textarea = forwardRef(function Textarea(
  props: TextareaProps,
  forwardedRef: Ref<HTMLTextAreaElement>
) {
  const {
    label,
    helper,
    error,
    invalid,
    required,
    showCount,
    className,
    value,
    defaultValue,
    onChange,
    maxLength,
    disabled,
    "aria-describedby": describedByProp,
    ...rest
  } = props;

  // Stable ids for label/helper/error/count wiring.
  const autoId = useId();
  const id = props.id ?? `hisd-textarea-${autoId}`;
  const helperId = `${id}-help`;
  const errorId = `${id}-error`;
  const countId = `${id}-count`;

  // Resolve the error/invalid state. `error` implies invalid unless overridden.
  const isInvalid = invalid ?? Boolean(error);
  const hasError = Boolean(error) && isInvalid;

  // Counter config: derive the displayed max and the effective maxLength.
  const countEnabled = showCount !== undefined && showCount !== false;
  const countMax =
    typeof showCount === "number"
      ? showCount
      : typeof maxLength === "number"
        ? maxLength
        : undefined;
  const effectiveMaxLength =
    maxLength ?? (typeof showCount === "number" ? showCount : undefined);

  // Internal ref so the counter can read the live value even in uncontrolled mode,
  // while still forwarding the ref to the caller.
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement, []);

  const initialLen = (() => {
    if (typeof value === "string") return value.length;
    if (typeof defaultValue === "string") return defaultValue.length;
    return 0;
  })();
  const [count, setCount] = useState(initialLen);

  // Keep the count in sync in controlled mode.
  useEffect(() => {
    if (typeof value === "string") setCount(value.length);
  }, [value]);

  // On mount (uncontrolled), seed from the DOM value so SSR/defaultValue match.
  useEffect(() => {
    if (!countEnabled) return;
    if (typeof value !== "string" && innerRef.current) {
      setCount(innerRef.current.value.length);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (countEnabled) setCount(event.target.value.length);
      onChange?.(event);
    },
    [countEnabled, onChange]
  );

  const over = countMax !== undefined && count >= countMax;

  const describedBy = joinIds(
    describedByProp,
    helper ? helperId : undefined,
    hasError ? errorId : undefined,
    countEnabled ? countId : undefined
  );

  return (
    <div
      className="hisd-textarea-field"
      {...(isInvalid ? { "data-invalid": "true" } : {})}
    >
      <label className="hisd-textarea-label" htmlFor={id}>
        {label}
        {required ? (
          <span className="hisd-textarea-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <textarea
        {...rest}
        ref={innerRef}
        id={id}
        className={
          className
            ? `hisd-textarea-control ${className}`
            : "hisd-textarea-control"
        }
        rows={rest.rows ?? 3}
        disabled={disabled}
        required={required}
        value={value}
        defaultValue={defaultValue}
        maxLength={effectiveMaxLength}
        onChange={handleChange}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
      />

      {helper ? (
        <p
          className="hisd-textarea-message hisd-textarea-helper"
          id={helperId}
        >
          {helper}
        </p>
      ) : null}

      {hasError ? (
        <p
          className="hisd-textarea-message hisd-textarea-error"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {countEnabled ? (
        <span
          className="hisd-textarea-count"
          id={countId}
          aria-live="polite"
          aria-atomic="true"
          {...(over ? { "data-over": "true" } : {})}
        >
          {countMax !== undefined ? `${count} / ${countMax}` : String(count)}
        </span>
      ) : null}
    </div>
  );
});

Textarea.displayName = "Textarea";
