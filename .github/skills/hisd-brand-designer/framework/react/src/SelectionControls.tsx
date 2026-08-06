/**
 * HISD Selection Controls — React wrapper
 * ---------------------------------------------------------------------------
 * A thin behavior + markup layer over the vanilla `hisd-selection-controls`
 * component. ALL styling/theming comes from the design-system CSS
 * (assets/hisd-theme.css + components/selection-controls.css). This wrapper
 * never re-implements styling — it only applies the documented
 * `hisd-selection-controls*` class names and the correct ARIA, and renders
 * REAL native <input type="checkbox"|"radio"> elements so the platform's
 * keyboard model (Space to toggle, Arrow keys to rove a radio group, wrapping)
 * is preserved exactly as the vanilla demo intends — the demo's <script>
 * deliberately does NOT re-implement that, and neither do we.
 *
 * Ported interactive behavior from the vanilla demo's <script>:
 *   - A polite live-region announcement on change ("<label> checked/unchecked"
 *     for checkboxes, "<label> selected" for radios).
 *   - Auto-clearing of a group's error state once a valid radio selection is
 *     made: drops the `--error` modifier, removes `aria-invalid` from inputs,
 *     and hides the error message.
 *
 * React 18, function component, no external deps beyond react.
 */

import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

export type SelectionControlType = 'checkbox' | 'radio';

/** A single selectable option within the control group. */
export interface SelectionOption {
  /** Submitted form value for this option. */
  value: string;
  /** Visible label text (first line of the option). */
  label: ReactNode;
  /** Optional secondary description rendered under the label. */
  description?: ReactNode;
  /** Disables just this option. */
  disabled?: boolean;
  /** Initial checked state (uncontrolled mode). */
  defaultChecked?: boolean;
  /** Controlled checked state. */
  checked?: boolean;
}

export interface SelectionControlsProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onChange' | 'defaultValue'
  > {
  /** "checkbox" (multi-select) or "radio" (single-select). */
  type?: SelectionControlType;
  /**
   * Shared `name` for the inputs. Required semantics for radios (groups them);
   * auto-generated if omitted.
   */
  name?: string;
  /** Group legend text. Rendered in a <fieldset>/<legend>. */
  legend?: ReactNode;
  /** Optional helper hint shown under the legend. */
  hint?: ReactNode;
  /** The selectable options. */
  options: SelectionOption[];
  /** Error message. Presence puts the group into its error state. */
  error?: ReactNode;
  /** Disables every option in the group. */
  disabled?: boolean;
  /**
   * Controlled selected value(s). For radio: a single string. For checkbox: a
   * string array. When provided, the component is controlled.
   */
  value?: string | string[];
  /** Initial selected value(s) for uncontrolled mode. */
  defaultValue?: string | string[];
  /** Change handler. Receives the next selection and the originating event. */
  onChange?: (
    next: string | string[],
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  /**
   * When true, render a polite ARIA live region that announces selection
   * changes (mirrors the vanilla demo). Defaults to true.
   */
  announce?: boolean;
}

/** Normalize controlled/uncontrolled selection into a Set of values. */
function toSet(value: string | string[] | undefined): Set<string> {
  if (value == null) return new Set();
  return new Set(Array.isArray(value) ? value : [value]);
}

export const SelectionControls = forwardRef<
  HTMLDivElement,
  SelectionControlsProps
>(function SelectionControls(props, ref) {
  const {
    type = 'checkbox',
    name,
    legend,
    hint,
    options,
    error,
    disabled = false,
    value,
    defaultValue,
    onChange,
    announce = true,
    className,
    ...rest
  } = props;

  const reactId = useId();
  const generatedName = useRef(`hisd-sc-${reactId.replace(/:/g, '')}`);
  const groupName = name ?? generatedName.current;
  const hintId = `${reactId}-hint`;
  const errorId = `${reactId}-error`;

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<Set<string>>(() =>
    toSet(defaultValue),
  );
  const selected = isControlled ? toSet(value) : internalValue;

  // Live-region message (ported from the demo's polite announcer).
  const [liveMessage, setLiveMessage] = useState('');

  // Error can be dismissed locally once a valid radio choice is made, exactly
  // like the vanilla script. If `error` is controlled by the parent we still
  // hide it locally on selection unless the parent re-supplies it.
  const [errorCleared, setErrorCleared] = useState(false);
  const showError = !!error && !errorCleared;
  const groupHasError = showError;

  const handleChange = useCallback(
    (option: SelectionOption, event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;

      // Compute next selection.
      let next: Set<string>;
      if (type === 'radio') {
        next = new Set([option.value]);
      } else {
        next = new Set(selected);
        if (input.checked) next.add(option.value);
        else next.delete(option.value);
      }

      if (!isControlled) setInternalValue(next);

      // Announce (mirrors demo): checkbox -> checked/unchecked, radio -> selected.
      if (announce) {
        const labelText =
          typeof option.label === 'string' ? option.label : option.value;
        if (type === 'checkbox') {
          setLiveMessage(
            `${labelText} ${input.checked ? 'checked' : 'unchecked'}`,
          );
        } else {
          setLiveMessage(`${labelText} selected`);
        }
      }

      // Clear error once a valid radio selection is made (demo parity).
      if (type === 'radio' && showError) {
        setErrorCleared(true);
      }

      const emitted: string | string[] =
        type === 'radio' ? option.value : Array.from(next);
      onChange?.(emitted, event);
    },
    [type, selected, isControlled, announce, showError, onChange],
  );

  const inputModifier =
    type === 'radio'
      ? 'hisd-selection-controls__input--radio'
      : 'hisd-selection-controls__input--checkbox';

  const describedBy = [hint ? hintId : null, showError ? errorId : null]
    .filter(Boolean)
    .join(' ');

  const groupClass = [
    'hisd-selection-controls__group',
    groupHasError ? 'hisd-selection-controls__group--error' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={['hisd-selection-controls', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <fieldset
        className={groupClass}
        role={type === 'radio' ? 'radiogroup' : undefined}
        aria-describedby={describedBy || undefined}
      >
        {legend != null && (
          <legend className="hisd-selection-controls__legend">{legend}</legend>
        )}

        {hint != null && (
          <span className="hisd-selection-controls__hint" id={hintId}>
            {hint}
          </span>
        )}

        <div className="hisd-selection-controls__list">
          {options.map((option) => {
            const optionDisabled = disabled || option.disabled;
            const isChecked = isControlled
              ? selected.has(option.value)
              : undefined;
            const isDefaultChecked = isControlled
              ? undefined
              : (option.defaultChecked ?? toSet(defaultValue).has(option.value));

            return (
              <label
                key={option.value}
                className="hisd-selection-controls__option"
              >
                <input
                  className={`hisd-selection-controls__input ${inputModifier}`}
                  type={type}
                  name={groupName}
                  value={option.value}
                  disabled={optionDisabled}
                  checked={isControlled ? !!isChecked : undefined}
                  defaultChecked={isControlled ? undefined : isDefaultChecked}
                  aria-invalid={showError ? true : undefined}
                  aria-describedby={showError ? errorId : undefined}
                  onChange={(event) => handleChange(option, event)}
                />
                <span className="hisd-selection-controls__text">
                  {option.label}
                  {option.description != null && (
                    <span className="hisd-selection-controls__description">
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        {showError && (
          <p className="hisd-selection-controls__error" id={errorId}>
            <span className="sr-only">Error:</span> {error}
          </p>
        )}
      </fieldset>

      {announce && (
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          // The live region must always be in the DOM so updates are announced.
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {liveMessage}
        </p>
      )}
    </div>
  );
});
