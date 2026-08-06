/**
 * HISD Design System — Progress (React wrapper)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-progress` / `hisd-spinner`
 * components. It applies the SAME `hisd-progress*` / `hisd-spinner*` classes and
 * the SAME ARIA contract defined in components/progress.css (bundled into
 * components/components.css) and the theme in assets/hisd-theme.css — it NEVER
 * re-implements styling. Theming flows entirely from those stylesheets, which the
 * host app must load.
 *
 * Faithful to components/progress.html:
 *   - Per the WAI-ARIA APG a progressbar is a NON-INTERACTIVE status widget with
 *     NO keyboard model and is not in the tab order. So there are no key handlers
 *     here. The "behavior" ported from the demo's <script> is the value -> markup
 *     sync: it clamps `value` to [min, max], computes a percentage, drives the
 *     fill width via the `--hisd-progress-value` custom property, sets
 *     `aria-valuenow`, and flips to the `hisd-progress--complete` state at the
 *     ceiling. (The demo's setInterval was only a self-running animation of those
 *     same three writes; production drives them from real progress events, which
 *     is exactly the `value` prop here.)
 *   - Three variants:
 *       * "determinate" (default) — role="progressbar" with
 *         aria-valuemin/valuemax/valuenow. Fill width == the value %. At
 *         valuenow == valuemax it adds `hisd-progress--complete` (success tint).
 *       * "indeterminate" — drops aria-valuenow, sets aria-busy="true", adds
 *         `hisd-progress--indeterminate` (animated sweep).
 *       * "spinner" — the circular `hisd-spinner` variant; icon-only, labelled
 *         via aria-label, aria-busy="true".
 *   - Linear sizes: "md" (default) / "lg" -> `hisd-progress--lg`.
 *     Spinner sizes: "md" (default) / "lg" -> `hisd-spinner--lg`.
 *   - Optional field wrapper (`hisd-progress-field`) pairing a label with a live
 *     `%` read-out (an `aria-live="polite"` region), matching the demo.
 *   - prefers-reduced-motion / forced-colors / dark theme are honored by the CSS.
 * ============================================================================
 */

import * as React from 'react';

/** Linear track thickness. `lg` adds `hisd-progress--lg`. */
export type ProgressSize = 'md' | 'lg';

/**
 * Determinate linear progress bar.
 * role="progressbar" with aria-valuemin/valuemax/valuenow; fill width tracks the
 * value; reaching the max adds the `complete` success state.
 */
export interface ProgressDeterminateProps {
  /** Determinate is the default and may be omitted. */
  variant?: 'determinate';
  /** Current value. Clamped to [min, max]. @default 0 */
  value?: number;
  /** Range floor. @default 0 */
  min?: number;
  /** Range ceiling. @default 100 */
  max?: number;
  /** Track thickness. @default 'md' */
  size?: ProgressSize;
  /**
   * Force the completed (success) state regardless of value. When omitted,
   * completion is derived automatically from `value >= max`.
   */
  complete?: boolean;
  /**
   * Visible label. When provided the bar is wrapped in a `hisd-progress-field`
   * with a header label and a live `%` read-out, matching the demo. When omitted
   * the bare bar is returned and you should pass `aria-label`/`aria-labelledby`.
   */
  label?: React.ReactNode;
  /**
   * Show the `%` read-out in the field header. Only applies when `label` is set.
   * The read-out is an `aria-live="polite"` region so value changes are announced.
   * @default true
   */
  showValueText?: boolean;
  /**
   * Custom formatter for the value read-out + `aria-valuetext`. Receives the
   * clamped value, the computed percent, and the range. Defaults to `"{pct}%"`.
   */
  formatValueText?: (info: {
    value: number;
    percent: number;
    min: number;
    max: number;
  }) => string;
  /** Extra class names appended after the `hisd-progress*` classes (on the bar). */
  className?: string;
}

/**
 * Indeterminate linear progress bar — unknown progress. Drops aria-valuenow,
 * sets aria-busy="true", and sweeps an animated stripe.
 */
export interface ProgressIndeterminateProps {
  variant: 'indeterminate';
  /** Track thickness. @default 'md' */
  size?: ProgressSize;
  /** Visible label (wraps in a `hisd-progress-field`; no `%` read-out). */
  label?: React.ReactNode;
  /** Extra class names appended after the `hisd-progress*` classes (on the bar). */
  className?: string;
}

/**
 * Circular spinner variant — compact loading indicator. Icon-only; supply an
 * accessible name via `label` (rendered as a visible trailing text + aria-label)
 * or via `aria-label`/`aria-labelledby` on the bare spinner.
 */
export interface ProgressSpinnerProps {
  variant: 'spinner';
  /** Spinner diameter. @default 'md' */
  size?: ProgressSize;
  /**
   * Visible status text rendered beside the spinner in a `hisd-spinner-field`
   * row. The spinner's own accessible name comes from `aria-label`; when only a
   * `label` is given it is used for both the visible text and the aria-label.
   */
  label?: React.ReactNode;
  /** Extra class names appended after the `hisd-spinner*` classes. */
  className?: string;
}

/** Discriminated union over the three progress variants. */
export type ProgressProps =
  | (ProgressDeterminateProps &
      Omit<
        React.HTMLAttributes<HTMLDivElement>,
        keyof ProgressDeterminateProps
      >)
  | (ProgressIndeterminateProps &
      Omit<
        React.HTMLAttributes<HTMLDivElement>,
        keyof ProgressIndeterminateProps
      >)
  | (ProgressSpinnerProps &
      Omit<React.HTMLAttributes<HTMLSpanElement>, keyof ProgressSpinnerProps>);

/** Clamp `n` into the inclusive [min, max] range. */
function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Join non-empty class tokens. */
function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

/**
 * Visually-hidden style for an offscreen value read-out when there is no visible
 * field label but we still want a polite live announcement. Inlined so it does
 * not depend on a `.visually-hidden` utility that may not be on the page.
 */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  inlineSize: '1px',
  blockSize: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * HISD Progress.
 *
 * @example Determinate with a label + live read-out
 * ```tsx
 * <Progress label="Uploading transcript" value={42} />
 * ```
 *
 * @example Bare determinate bar (you provide the name)
 * ```tsx
 * <Progress value={80} aria-label="Saving" />
 * ```
 *
 * @example Indeterminate
 * ```tsx
 * <Progress variant="indeterminate" label="Syncing records" />
 * ```
 *
 * @example Spinner
 * ```tsx
 * <Progress variant="spinner" label="Loading…" />
 * ```
 */
export const Progress = React.forwardRef<HTMLElement, ProgressProps>(
  function Progress(props, ref) {
    // A single id is minted unconditionally (rules-of-hooks: no hooks after the
    // variant branches below) and namespaced per sub-part where needed.
    const reactId = React.useId();

    // ---- Spinner (circular) ------------------------------------------------
    if (props.variant === 'spinner') {
      const { size = 'md', label, className, ...rest } = props;
      const spinnerClass = cx(
        'hisd-spinner',
        size === 'lg' && 'hisd-spinner--lg',
        className,
      );

      // When a visible label is provided, the spinner's accessible name comes
      // from aria-label (falling back to the label text) unless the caller has
      // already supplied aria-label / aria-labelledby.
      const ariaLabelled =
        rest['aria-label'] != null || rest['aria-labelledby'] != null;
      const resolvedAriaLabel =
        rest['aria-label'] ??
        (!ariaLabelled && typeof label === 'string' ? label : undefined);

      const spinner = (
        <span
          {...(rest as React.HTMLAttributes<HTMLSpanElement>)}
          ref={ref as React.Ref<HTMLSpanElement>}
          className={spinnerClass}
          role="progressbar"
          aria-busy="true"
          aria-label={resolvedAriaLabel}
        />
      );

      if (label == null) return spinner;

      // Status row: spinner + visible label text (the visible text is decorative
      // for AT since the spinner already carries the name via aria-label).
      return (
        <span className="hisd-spinner-field">
          {spinner}
          <span>{label}</span>
        </span>
      );
    }

    // ---- Indeterminate linear ----------------------------------------------
    if (props.variant === 'indeterminate') {
      const { size = 'md', label, className, ...rest } = props;
      const barClass = cx(
        'hisd-progress',
        'hisd-progress--indeterminate',
        size === 'lg' && 'hisd-progress--lg',
        className,
      );

      // Wire aria-labelledby from a field label only when the caller has not
      // already named the bar.
      const hasOwnName =
        rest['aria-label'] != null || rest['aria-labelledby'] != null;
      const labelId = label != null && !hasOwnName ? reactId : undefined;

      const bar = (
        <div
          {...(rest as React.HTMLAttributes<HTMLDivElement>)}
          ref={ref as React.Ref<HTMLDivElement>}
          className={barClass}
          role="progressbar"
          aria-busy="true"
          aria-labelledby={labelId ?? rest['aria-labelledby']}
        >
          <span className="hisd-progress__fill" />
        </div>
      );

      if (label == null) return bar;

      return (
        <div className="hisd-progress-field">
          <div className="hisd-progress-field__header">
            <span className="hisd-progress-field__label" id={labelId}>
              {label}
            </span>
          </div>
          {bar}
        </div>
      );
    }

    // ---- Determinate linear (default) --------------------------------------
    const {
      value = 0,
      min = 0,
      max = 100,
      size = 'md',
      complete,
      label,
      showValueText = true,
      formatValueText,
      className,
      ...rest
    } = props;

    const clamped = clamp(value, min, max);
    // Avoid divide-by-zero when the range is degenerate.
    const span = max - min;
    const percent = span > 0 ? Math.round(((clamped - min) / span) * 100) : 0;
    const isComplete = complete ?? clamped >= max;

    const valueText = formatValueText
      ? formatValueText({ value: clamped, percent, min, max })
      : `${percent}%`;

    const barClass = cx(
      'hisd-progress',
      size === 'lg' && 'hisd-progress--lg',
      isComplete && 'hisd-progress--complete',
      className,
    );

    // ids for wiring label/value to the bar when we render the field wrapper.
    const labelId = `${reactId}-label`;
    const valueId = `${reactId}-value`;

    const hasOwnName =
      rest['aria-label'] != null || rest['aria-labelledby'] != null;

    // The fill width is driven by the same custom property the CSS reads.
    const fillStyle = {
      '--hisd-progress-value': `${percent}%`,
    } as React.CSSProperties;

    // Merge any caller style with the fill custom property.
    const mergedStyle = { ...(rest.style as React.CSSProperties), ...fillStyle };

    // ----- Field wrapper (visible label + live % read-out) ------------------
    if (label != null) {
      const { style: _ignoredStyle, ...barRest } = rest;
      return (
        <div className="hisd-progress-field">
          <div className="hisd-progress-field__header">
            <span className="hisd-progress-field__label" id={labelId}>
              {label}
            </span>
            {showValueText ? (
              <span
                className="hisd-progress-field__value"
                id={valueId}
                aria-live="polite"
              >
                {valueText}
              </span>
            ) : null}
          </div>
          <div
            {...(barRest as React.HTMLAttributes<HTMLDivElement>)}
            ref={ref as React.Ref<HTMLDivElement>}
            className={barClass}
            role="progressbar"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={clamped}
            aria-valuetext={valueText}
            aria-labelledby={hasOwnName ? rest['aria-labelledby'] : labelId}
            aria-describedby={
              showValueText
                ? cx(valueId, rest['aria-describedby']) || undefined
                : rest['aria-describedby']
            }
            style={mergedStyle}
          >
            <span className="hisd-progress__fill" />
          </div>
        </div>
      );
    }

    // ----- Bare bar: caller supplies the accessible name --------------------
    // Still expose aria-valuetext, and optionally a hidden polite read-out so
    // value changes are announced even without a visible field.
    return (
      <>
        <div
          {...(rest as React.HTMLAttributes<HTMLDivElement>)}
          ref={ref as React.Ref<HTMLDivElement>}
          className={barClass}
          role="progressbar"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clamped}
          aria-valuetext={valueText}
          aria-describedby={
            showValueText
              ? cx(valueId, rest['aria-describedby']) || undefined
              : rest['aria-describedby']
          }
          style={mergedStyle}
        >
          <span className="hisd-progress__fill" />
        </div>
        {showValueText ? (
          <span id={valueId} aria-live="polite" style={SR_ONLY}>
            {valueText}
          </span>
        ) : null}
      </>
    );
  },
);

export default Progress;
