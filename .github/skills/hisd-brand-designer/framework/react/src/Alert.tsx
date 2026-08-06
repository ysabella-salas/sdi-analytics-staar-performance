import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type AnimationEvent,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

/**
 * HISD Alert — typed React wrapper around the vanilla `.hisd-alert` component.
 *
 * This is a THIN behaviour + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/alert.css). This component never re-implements styling —
 * it applies the same `hisd-alert*` classes and the same ARIA contract as
 * components/alert.html, and ports the demo's <script> dismiss behaviour exactly:
 *
 *   - Inline status banner. The root carries `role="alert"` (assertive — for
 *     errors) or `role="status"` (polite — everything else). The default role is
 *     derived from the variant (danger -> alert, otherwise status) and can be
 *     overridden via the `role` prop.
 *   - Four semantic variants — info (default) / success / warning / danger — each
 *     mapped to `hisd-alert--{variant}`. Meaning is carried by the variant's
 *     distinct icon glyph, the accent rail, and the text — never colour alone
 *     (the CSS handles all of that).
 *   - Anatomy: [icon] [title + message] [optional actions] [optional dismiss],
 *     matching the canonical grid. The leading icon span is `aria-hidden` (the
 *     visible title carries the status to assistive tech).
 *   - Dismiss: an icon-only `<button>` with an `aria-label`. On activation the
 *     banner animates out (collapse + fade) via `data-state="leaving"` and is
 *     removed on `animationend`; under `prefers-reduced-motion` the keyframe is
 *     disabled in CSS, so we remove immediately instead of waiting for an event
 *     that may never carry a non-zero duration. The native <button> fires click
 *     on Enter and Space, so we listen for click only and never re-handle keys
 *     (that would double-fire) — identical to alert.html's <script>.
 *
 * The tinted surface, accent rail, masked glyphs, focus rings, forced-colors
 * fallbacks, reduced-motion, and dark-theme inheritance are ALL handled by the
 * CSS.
 */

/** The four semantic variants. `info` is the default. */
export type AlertVariant = "info" | "success" | "warning" | "danger";

/** An inline link-style action button rendered in `.hisd-alert__actions`. */
export interface AlertAction {
  /** Visible action label. */
  label: ReactNode;
  /** Fires when the action is activated. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Disables this action (native `disabled`). */
  disabled?: boolean;
}

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "role"> {
  /**
   * Semantic variant. Maps to `hisd-alert--{variant}` and selects the variant's
   * distinct icon glyph + accent. Defaults to `"info"`.
   */
  variant?: AlertVariant;
  /**
   * The banner heading. Rendered into `.hisd-alert__title`. The title text is
   * what assistive tech announces (the icon is `aria-hidden`), so a meaningful
   * status word here is what carries the semantics.
   */
  title?: ReactNode;
  /**
   * Supporting body copy. Rendered into `.hisd-alert__message`. When a `title`
   * precedes it the CSS mutes + spaces it automatically.
   */
  children?: ReactNode;
  /**
   * ARIA live role. `"alert"` is assertive (interrupts — use for errors),
   * `"status"` is polite. Defaults to `"alert"` for the `danger` variant and
   * `"status"` for all others, matching the canonical markup.
   */
  role?: "alert" | "status";
  /**
   * Show an icon-only dismiss (×) button. Defaults to `false`. When set, the
   * banner can be dismissed; it animates out then calls `onDismiss`.
   */
  dismissible?: boolean;
  /** Accessible label for the dismiss button. Defaults to "Dismiss this message". */
  dismissLabel?: string;
  /**
   * Fires after the dismiss animation completes (or immediately under
   * reduced motion). Use this to remove the alert from your state — the
   * component stops rendering itself once dismissed regardless.
   */
  onDismiss?: () => void;
  /**
   * Optional inline link-style actions rendered under the body in
   * `.hisd-alert__actions` (the with-actions state).
   */
  actions?: AlertAction[];
  /** Extra class names appended to the `.hisd-alert` root. */
  className?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const Alert = forwardRef(function Alert(
  props: AlertProps,
  ref: Ref<HTMLDivElement>,
) {
  const {
    variant = "info",
    title,
    children,
    role,
    dismissible = false,
    dismissLabel = "Dismiss this message",
    onDismiss,
    actions,
    className,
    ...rest
  } = props;

  // The CSS targets the leaving animation via `data-state="leaving"`; once the
  // animation ends (or immediately under reduced motion) we unmount the banner.
  const [leaving, setLeaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const finish = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  const handleDismissClick = useCallback(() => {
    // Native <button> synthesises click for mouse, Enter, and Space, so a single
    // click handler covers all activation paths without double-firing.
    if (leaving) return;
    if (prefersReducedMotion()) {
      // The keyframe is disabled in CSS under reduced motion; remove immediately
      // rather than waiting for an animationend that may never fire.
      finish();
      return;
    }
    setLeaving(true);
  }, [leaving, finish]);

  // When the collapse+fade keyframe ends, unmount. Guard on the animation name
  // so unrelated child animations don't trigger removal.
  const handleAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.animationName && event.animationName !== "hisd-alert-out") {
        return;
      }
      if (leaving) finish();
    },
    [leaving, finish],
  );

  if (dismissed) {
    return null;
  }

  const resolvedRole = role ?? (variant === "danger" ? "alert" : "status");

  const rootClassName = ["hisd-alert", `hisd-alert--${variant}`, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      {...rest}
      ref={ref}
      className={rootClassName}
      role={resolvedRole}
      data-state={leaving ? "leaving" : undefined}
      onAnimationEnd={leaving ? handleAnimationEnd : undefined}
    >
      <span className="hisd-alert__icon" aria-hidden="true" />
      <div className="hisd-alert__body">
        {title != null ? <p className="hisd-alert__title">{title}</p> : null}
        {children != null ? (
          <p className="hisd-alert__message">{children}</p>
        ) : null}
      </div>

      {actions && actions.length > 0 ? (
        <div className="hisd-alert__actions">
          {actions.map((action, index) => (
            <button
              // Actions are a fixed, ordered set; index is a stable key.
              key={index}
              type="button"
              className="hisd-alert__action"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {dismissible ? (
        <button
          type="button"
          className="hisd-alert__dismiss"
          aria-label={dismissLabel}
          onClick={handleDismissClick}
        >
          <span className="hisd-alert__dismiss-icon" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});

export default Alert;
