import * as React from "react";

/**
 * HISD Toast — typed React wrapper around the vanilla `.hisd-toast` component.
 *
 * This is a THIN behaviour + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/toast.css). Nothing here re-implements styling — it only
 * applies the canonical `hisd-toast*` classes + the same ARIA contract as
 * components/toast.html, and ports that demo's <script> behaviour exactly:
 *
 *   - WAI-ARIA APG notification guidance: the toast renders as `role="group"`
 *     labelled by its title, inside a live region (polite for success/info/
 *     warning, assertive for danger). The icon is decorative (`aria-hidden`)
 *     because its meaning is duplicated by the text; the dismiss control is an
 *     icon-only native <button> carrying an `aria-label`.
 *   - Lifecycle: success/info auto-dismiss after 5s; warning/danger persist
 *     until dismissed. A toast set with `data-state="leaving"` plays the CSS
 *     leave animation, then unmounts on `animationend` (with a timeout fallback
 *     for engines that skip `animationend` under reduced motion).
 *   - Dismiss: a native <button>, so Enter/Space activate it for free — we only
 *     wire the click both keys dispatch. Focus is never trapped (toasts are
 *     non-modal), matching the vanilla component.
 *   - Stacking: at most three visible; emitting a fourth fades the oldest out.
 *     This is handled by the `useToasts` manager + `ToastRegion` below.
 *
 * Forced-colors and prefers-reduced-motion are honoured implicitly by the CSS.
 *
 * The single-toast `Toast` is the primary named export. `ToastRegion` +
 * `useToasts` provide the optional imperative manager (dual live regions,
 * stacking cap, auto-dismiss) mirroring the demo's vanilla toast manager.
 */

/** The four semantic variants, each mapping to a status token + glyph shape. */
export type ToastVariant = "success" | "info" | "warning" | "danger";

/** Announcement urgency → which ARIA live region a toast belongs to. */
export type ToastUrgency = "polite" | "assertive";

/** Default auto-dismiss delay (ms) for auto-dismissing variants. */
export const TOAST_AUTO_DISMISS_MS = 5000;

/** Maximum number of toasts visible at once before the oldest is evicted. */
export const TOAST_MAX_VISIBLE = 3;

/** Fallback unmount delay (ms) if `animationend` never fires (reduced motion). */
const LEAVE_FALLBACK_MS = 400;

/** Per-variant defaults: which region to announce in, and whether to auto-dismiss. */
const VARIANT_DEFAULTS: Record<
  ToastVariant,
  { urgency: ToastUrgency; auto: boolean }
> = {
  success: { urgency: "polite", auto: true },
  info: { urgency: "polite", auto: true },
  warning: { urgency: "polite", auto: false },
  danger: { urgency: "assertive", auto: false },
};

/** The default urgency for a variant (danger → assertive, else polite). */
export function defaultUrgencyFor(variant: ToastVariant): ToastUrgency {
  return VARIANT_DEFAULTS[variant].urgency;
}

/** Whether a variant auto-dismisses by default (success/info → true). */
export function defaultAutoFor(variant: ToastVariant): boolean {
  return VARIANT_DEFAULTS[variant].auto;
}

type ListItemProps = React.LiHTMLAttributes<HTMLLIElement>;

export interface ToastProps
  extends Omit<
    ListItemProps,
    // Owned/derived by the component — don't let callers set these raw.
    "role" | "title" | "onAnimationEnd" | "children"
  > {
  /** Semantic variant. Drives the status colour, glyph shape, and rail. */
  variant?: ToastVariant;
  /**
   * Optional bold title line. Used as the toast's accessible name
   * (`aria-label` on the `role="group"`), matching the demo.
   */
  title?: React.ReactNode;
  /** Supporting body copy. */
  message?: React.ReactNode;
  /**
   * Show the icon-only dismiss button. Defaults to true. Even when an auto-
   * dismiss timer is running, the manual control remains available.
   */
  dismissible?: boolean;
  /**
   * Accessible name for the dismiss button. Defaults to "Dismiss notification".
   */
  dismissLabel?: string;
  /**
   * Auto-dismiss after `autoDismissMs`. When omitted, falls back to the
   * variant default (success/info auto-dismiss; warning/danger persist).
   */
  autoDismiss?: boolean;
  /** Auto-dismiss delay in ms. Defaults to {@link TOAST_AUTO_DISMISS_MS}. */
  autoDismissMs?: number;
  /**
   * When the toast should begin leaving. While `leaving` is true the CSS
   * leave animation plays; `onDismiss` fires once it completes. Use this for
   * controlled removal; otherwise the component manages its own leave on the
   * auto-dismiss timer or a dismiss click.
   */
  leaving?: boolean;
  /**
   * Called once the toast has finished leaving (after the CSS animation or the
   * reduced-motion fallback). The parent should remove the toast from its list
   * here. Receives nothing — identify the toast via closure/key.
   */
  onDismiss?: () => void;
  /**
   * Explicit accessible name override for the `role="group"`. Defaults to the
   * `title` text when `title` is a string, else falls back to the variant name.
   */
  "aria-label"?: string;
  /** Extra class names appended to the `.hisd-toast` root. */
  className?: string;
}

/** Capitalise a variant for a fallback group label ("success" → "Success"). */
function variantLabel(variant: ToastVariant): string {
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}

/**
 * A single HISD toast (`<li class="hisd-toast hisd-toast--{variant}">`).
 *
 * Renders the canonical markup + ARIA and owns its lifecycle: an optional
 * auto-dismiss timer and the leave animation. It does NOT render the live
 * region itself — place it inside a `.hisd-toast-region` (or use `ToastRegion`)
 * so screen readers announce additions correctly.
 */
export const Toast = React.forwardRef<HTMLLIElement, ToastProps>(function Toast(
  props,
  forwardedRef,
) {
  const {
    variant = "info",
    title,
    message,
    dismissible = true,
    dismissLabel = "Dismiss notification",
    autoDismiss,
    autoDismissMs = TOAST_AUTO_DISMISS_MS,
    leaving: leavingProp,
    onDismiss,
    className,
    "aria-label": ariaLabel,
    ...rest
  } = props;

  // Internal leave state. The component can start leaving on its own (timer or
  // dismiss click); `leavingProp` lets a parent drive it (e.g. the manager
  // evicting the oldest toast). Either source flips us into the leaving state.
  const [internalLeaving, setInternalLeaving] = React.useState(false);
  const leaving = internalLeaving || Boolean(leavingProp);

  // Keep the latest onDismiss in a ref so timers/handlers never go stale.
  const onDismissRef = React.useRef(onDismiss);
  React.useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const liRef = React.useRef<HTMLLIElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLLIElement | null) => {
      liRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLLIElement | null>).current =
          node;
      }
    },
    [forwardedRef],
  );

  // Begin leaving (idempotent). The actual unmount happens on animationend.
  const startLeaving = React.useCallback(() => {
    setInternalLeaving(true);
  }, []);

  const shouldAutoDismiss = autoDismiss ?? defaultAutoFor(variant);

  // Auto-dismiss timer — only while not yet leaving. Cleared on unmount or when
  // the toast starts leaving (so a manual dismiss doesn't double-fire).
  React.useEffect(() => {
    if (!shouldAutoDismiss || leaving) {
      return;
    }
    const id = window.setTimeout(startLeaving, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [shouldAutoDismiss, leaving, autoDismissMs, startLeaving]);

  // When leaving, wait for the CSS leave animation to finish, then notify the
  // parent to unmount. A timeout fallback covers engines that skip
  // `animationend` when reduced motion zeroes the animation.
  React.useEffect(() => {
    if (!leaving) {
      return;
    }
    const node = liRef.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDismissRef.current?.();
    };
    if (!node) {
      const t = window.setTimeout(finish, LEAVE_FALLBACK_MS);
      return () => window.clearTimeout(t);
    }
    node.addEventListener("animationend", finish);
    const t = window.setTimeout(finish, LEAVE_FALLBACK_MS);
    return () => {
      node.removeEventListener("animationend", finish);
      window.clearTimeout(t);
    };
  }, [leaving]);

  const handleDismissClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.defaultPrevented) return;
      // Native <button>: Enter/Space dispatch this click for free.
      startLeaving();
    },
    [startLeaving],
  );

  const groupLabel =
    ariaLabel ??
    (typeof title === "string" ? title : undefined) ??
    variantLabel(variant);

  const rootClass = ["hisd-toast", `hisd-toast--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      {...rest}
      ref={setRefs}
      className={rootClass}
      role="group"
      aria-label={groupLabel}
      // The CSS keys the leave animation off this attribute.
      data-state={leaving ? "leaving" : undefined}
    >
      {/* Decorative — meaning is duplicated by the title/message text. */}
      <span className="hisd-toast__icon" aria-hidden="true" />
      <div className="hisd-toast__body">
        {title != null ? <p className="hisd-toast__title">{title}</p> : null}
        {message != null ? (
          <p className="hisd-toast__message">{message}</p>
        ) : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          className="hisd-toast__dismiss"
          aria-label={dismissLabel}
          onClick={handleDismissClick}
        >
          <span className="hisd-toast__dismiss-icon" aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
});

export default Toast;

/* ==========================================================================
   Optional manager — dual live regions + stacking, mirroring the demo's
   vanilla toast manager. Use `useToasts()` for imperative emit/dismiss and
   render `<ToastRegion />` once near the end of your tree.
   ========================================================================== */

/** A live toast tracked by the manager. */
export interface ToastItem {
  /** Stable id (also the React key). */
  id: string;
  variant: ToastVariant;
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** Which live region to announce in. Defaults to the variant's urgency. */
  urgency?: ToastUrgency;
  /** Override auto-dismiss. Defaults to the variant default. */
  autoDismiss?: boolean;
  /** Override the auto-dismiss delay (ms). */
  autoDismissMs?: number;
  /** Set by the manager when evicting the oldest toast (drives the leave anim). */
  leaving?: boolean;
}

/** Options accepted by `emit` (everything but the auto-assigned id). */
export type ToastInput = Omit<ToastItem, "id" | "leaving"> & { id?: string };

export interface ToastManager {
  /** Currently tracked toasts (entering + leaving), in DOM order. */
  toasts: ToastItem[];
  /** Add a toast. Enforces the visible cap by evicting the oldest. Returns id. */
  emit: (input: ToastInput) => string;
  /** Begin dismissing a toast by id (plays the leave animation). */
  dismiss: (id: string) => void;
  /** Internal: remove a toast from state once its leave animation completes. */
  remove: (id: string) => void;
}

/**
 * Headless toast manager. Mirrors the demo's manager: a stacking cap enforced
 * across both urgencies (the oldest non-leaving toast is evicted when a new one
 * pushes past {@link TOAST_MAX_VISIBLE}). Pair with `<ToastRegion />`.
 */
export function useToasts(maxVisible: number = TOAST_MAX_VISIBLE): ToastManager {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  const remove = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) =>
      current.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
  }, []);

  const emit = React.useCallback(
    (input: ToastInput) => {
      counter.current += 1;
      const id = input.id ?? `hisd-toast-${counter.current}`;
      setToasts((current) => {
        let next = current;
        // Enforce the cap across BOTH regions: fade the oldest non-leaving
        // toast when already at the limit (matches the demo).
        const visible = current.filter((t) => !t.leaving);
        if (visible.length >= maxVisible) {
          const oldest = visible[0];
          next = current.map((t) =>
            t.id === oldest.id ? { ...t, leaving: true } : t,
          );
        }
        return [...next, { ...input, id, leaving: false }];
      });
      return id;
    },
    [maxVisible],
  );

  return { toasts, emit, dismiss, remove };
}

export interface ToastRegionProps {
  /** The manager returned by `useToasts()`. */
  manager: ToastManager;
  /** Accessible label hint passed through to each toast's dismiss button. */
  dismissLabel?: string;
  /** Extra class names appended to BOTH `.hisd-toast-region` elements. */
  className?: string;
}

/**
 * Renders the two pinned live regions (polite + assertive) exactly as the demo
 * does, and distributes each tracked toast into the region matching its
 * urgency. Render this once; drive it with a `useToasts()` manager.
 */
export function ToastRegion(props: ToastRegionProps) {
  const { manager, dismissLabel, className } = props;
  const { toasts, remove } = manager;

  const regionClass = ["hisd-toast-region", className]
    .filter(Boolean)
    .join(" ");

  const renderToast = (item: ToastItem) => (
    <Toast
      key={item.id}
      variant={item.variant}
      title={item.title}
      message={item.message}
      autoDismiss={item.autoDismiss}
      autoDismissMs={item.autoDismissMs}
      leaving={item.leaving}
      dismissLabel={dismissLabel}
      onDismiss={() => remove(item.id)}
    />
  );

  const inRegion = (urgency: ToastUrgency) =>
    toasts.filter((t) => (t.urgency ?? defaultUrgencyFor(t.variant)) === urgency);

  return (
    <>
      <ol
        className={regionClass}
        data-region="polite"
        role="status"
        aria-live="polite"
        aria-relevant="additions"
      >
        {inRegion("polite").map(renderToast)}
      </ol>
      <ol
        className={regionClass}
        data-region="assertive"
        role="alert"
        aria-live="assertive"
        aria-relevant="additions"
      >
        {inRegion("assertive").map(renderToast)}
      </ol>
    </>
  );
}
