import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type ButtonHTMLAttributes,
} from "react";

/**
 * HISD Tooltip — typed React wrapper around the vanilla `.hisd-tooltip`
 * component.
 *
 * This is a THIN behaviour + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/tooltip.css). This component never re-implements styling —
 * it applies the same `hisd-tooltip*` classes and the same ARIA contract as
 * components/tooltip.html, and ports the demo's <script> behaviour exactly:
 *
 *   - WAI-ARIA APG "Tooltip": a transient label surfaced on hover OR keyboard
 *     focus. The trigger references the bubble via `aria-describedby`; the bubble
 *     carries `role="tooltip"`. The tooltip is NEVER the sole label — an
 *     icon-only trigger must also carry an `aria-label` (the `label` prop).
 *   - Show on `mouseenter` / `focus` after a 300ms enter delay; hide immediately
 *     on `mouseleave` / `blur`. The explicit `[data-visible]` attribute drives
 *     the visible state (the design-system CSS still covers plain hover/
 *     focus-within as a no-JS fallback).
 *   - Escape dismisses WITHOUT moving focus (APG requirement). A "dismissed"
 *     guard then suppresses re-showing until focus leaves the trigger and
 *     returns, matching the demo's behaviour.
 *
 * The 300ms enter delay, 0ms exit, placement variants, reduced-motion, and
 * forced-colors handling all live in the CSS — this layer only toggles state.
 */

/** Placement of the bubble relative to the trigger (logical, RTL-aware). */
export type TooltipPlacement = "top" | "bottom" | "start" | "end";

/** Enter delay (ms) before the tooltip shows — matches the contract / CSS. */
export const TOOLTIP_ENTER_DELAY_MS = 300;

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement>;

export interface TooltipProps
  extends Omit<
    TriggerProps,
    // Owned/derived by the component — don't let callers set these raw.
    // (`content` is also the global HTML attribute typed as string; we redefine
    // it as ReactNode below, so omit the base one to avoid the conflict.)
    "aria-describedby" | "children" | "content"
  > {
  /**
   * The tooltip text (the bubble's contents). This DESCRIBES the trigger; it is
   * never the trigger's only accessible name.
   */
  content: ReactNode;
  /**
   * The trigger's visible contents (text and/or an icon). For an icon-only
   * trigger pass the icon here AND set `label` (the accessible name).
   */
  children: ReactNode;
  /**
   * Accessible name for the trigger, applied as `aria-label`. REQUIRED for
   * icon-only triggers (where `children` carries no text). Optional when the
   * trigger has visible text.
   */
  label?: string;
  /** Bubble placement relative to the trigger. Defaults to "top". */
  placement?: TooltipPlacement;
  /**
   * Icon-only trigger styling (square, comfortable target). Add a decorative
   * SVG as `children` (with `aria-hidden`) and set `label`.
   */
  iconOnly?: boolean;
  /** Enter delay in ms before showing. Defaults to {@link TOOLTIP_ENTER_DELAY_MS}. */
  enterDelayMs?: number;
  /**
   * Explicit id for the bubble (used as the trigger's `aria-describedby`).
   * Defaults to a generated id.
   */
  id?: string;
  /** Extra class names appended to the `.hisd-tooltip` wrapper. */
  className?: string;
  /** Extra class names appended to the `.hisd-tooltip__trigger`. */
  triggerClassName?: string;
}

/** Map a placement to its bubble modifier class ("top" is the default rule). */
function placementClass(placement: TooltipPlacement): string {
  return `hisd-tooltip__bubble--${placement}`;
}

/**
 * A single HISD tooltip: a `.hisd-tooltip` wrapper around a focusable trigger
 * `<button>` and its `role="tooltip"` bubble. The forwarded ref points at the
 * trigger button (the focusable, scriptable element).
 */
export const Tooltip = forwardRef(function Tooltip(
  props: TooltipProps,
  forwardedRef: Ref<HTMLButtonElement>,
) {
  const {
    content,
    children,
    label,
    placement = "top",
    iconOnly = false,
    enterDelayMs = TOOLTIP_ENTER_DELAY_MS,
    id,
    className,
    triggerClassName,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onKeyDown,
    ...rest
  } = props;

  const reactId = useId();
  const bubbleId = id ?? `hisd-tooltip-${reactId}`;

  const [visible, setVisible] = useState(false);

  // Pending enter-delay timer, and the APG "dismissed via Escape" guard which
  // suppresses re-showing until focus leaves the trigger and returns.
  const timerRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Show after the enter delay (unless dismissed via Escape).
  const show = useCallback(() => {
    if (dismissedRef.current) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setVisible(true);
    }, enterDelayMs);
  }, [clearTimer, enterDelayMs]);

  // Hide immediately (cancels any pending enter timer).
  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  // Clear the timer on unmount so a delayed show never fires after teardown.
  useEffect(() => clearTimer, [clearTimer]);

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onMouseEnter?.(event);
      show();
    },
    [onMouseEnter, show],
  );

  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onMouseLeave?.(event);
      hide();
    },
    [onMouseLeave, hide],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLButtonElement>) => {
      onFocus?.(event);
      show();
    },
    [onFocus, show],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLButtonElement>) => {
      onBlur?.(event);
      // Blur hides AND clears the dismissed guard so the next focus can re-show.
      hide();
      dismissedRef.current = false;
    },
    [onBlur, hide],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      // Escape dismisses without moving focus (APG). Only act while shown, and
      // stop propagation so an ancestor (e.g. a dialog) doesn't also react.
      if (event.key === "Escape" && visible) {
        event.stopPropagation();
        dismissedRef.current = true;
        hide();
      }
    },
    [onKeyDown, visible, hide],
  );

  const wrapperClass = ["hisd-tooltip", className].filter(Boolean).join(" ");

  const triggerClass = [
    "hisd-tooltip__trigger",
    iconOnly ? "hisd-tooltip__trigger--icon" : null,
    triggerClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const bubbleClass = [
    "hisd-tooltip__bubble",
    placementClass(placement),
  ].join(" ");

  return (
    <span className={wrapperClass}>
      <button
        {...rest}
        ref={forwardedRef}
        type={rest.type ?? "button"}
        className={triggerClass}
        aria-label={label}
        aria-describedby={bubbleId}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {children}
      </button>
      <span
        role="tooltip"
        id={bubbleId}
        className={bubbleClass}
        // Explicit APG state; the CSS keys the visible/hidden ladder off this.
        data-visible={visible ? "true" : "false"}
      >
        {content}
      </span>
    </span>
  );
});

export default Tooltip;
