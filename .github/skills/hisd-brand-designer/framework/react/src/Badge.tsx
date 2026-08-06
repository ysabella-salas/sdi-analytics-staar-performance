/**
 * HISD Badge — typed React wrapper around the vanilla `.hisd-badge` component.
 * ============================================================================
 * This is a THIN behavior + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/badge.css) — this component NEVER re-implements visuals.
 * It only:
 *   - renders the canonical `hisd-badge` markup,
 *   - applies the correct `hisd-badge*` classes and the ARIA contract, and
 *   - ports the demo's <script> behavior faithfully (the dynamic SOLE-CARRIER
 *     count: keep `aria-label="[n] notifications"` in sync, relax to the
 *     `hisd-badge--multi` pill at 2+ digits, and announce the change through a
 *     polite live region, since a silent text swap is not conveyed to AT).
 *
 * Faithful to components/badge.html:
 *   - The badge is PRESENTATIONAL (`aria-hidden`) when its value is also carried
 *     by surrounding text/context, and the SOLE CARRIER (labelled
 *     `aria-label="[n] notifications"`) when it is the only copy of the count.
 *   - Status badges (success/warning/info/danger) carry their visible text as
 *     the accessible name — neither aria-hidden nor an aria-label is applied.
 *   - Variants/shapes: count (default = danger fill), success, warning, info,
 *     danger, plus the `--multi` (wide, 2+ digit) and `--dot` (bare, unread)
 *     shape modifiers. `--dot` is always presentational.
 *   - `Badge.Host` renders the attached overlay shape: an interactive icon
 *     <button class="hisd-badge-host"> naming its own action, with the badge
 *     absolutely positioned in the top-inline-end corner. Native buttons fire
 *     click on Enter/Space, so the host needs no custom keyboard wiring.
 *
 * prefers-reduced-motion / forced-colors are honored by the CSS already.
 *
 * React 18, function component, no deps beyond `react`.
 * ============================================================================
 */

import * as React from "react";

/* Class-name constants — single source of truth, mirrors badge.css. */
const BADGE = "hisd-badge";
const BADGE_SUCCESS = "hisd-badge--success";
const BADGE_WARNING = "hisd-badge--warning";
const BADGE_INFO = "hisd-badge--info";
const BADGE_DANGER = "hisd-badge--danger";
const BADGE_MULTI = "hisd-badge--multi";
const BADGE_DOT = "hisd-badge--dot";
const BADGE_HOST = "hisd-badge-host";
const BADGE_HOST_ICON = "hisd-badge-host__icon";
const LIVE_ID = "hisd-badge-live";

function joinClasses(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * The badge's semantic cue. `count` is the default (danger fill, used for
 * notification counts); the rest are status fills whose ink flips per theme.
 */
export type BadgeVariant = "count" | "success" | "warning" | "info" | "danger";

/** Map a status variant to its modifier class. `count` adds none (it is the default). */
function variantClass(variant: BadgeVariant): string | undefined {
  switch (variant) {
    case "success":
      return BADGE_SUCCESS;
    case "warning":
      return BADGE_WARNING;
    case "info":
      return BADGE_INFO;
    case "danger":
      return BADGE_DANGER;
    case "count":
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Live-region announcement — mirrors the demo's #badge-live + setCount.       */
/* -------------------------------------------------------------------------- */

/**
 * Lazily create the shared polite live region (mirrors #badge-live) and
 * announce a message through it. A silent text swap is not conveyed to screen
 * readers, so dynamic sole-carrier count changes route through here.
 */
function announce(message: string): void {
  if (typeof document === "undefined") return;
  let live = document.getElementById(LIVE_ID);
  if (!live) {
    live = document.createElement("div");
    live.id = LIVE_ID;
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    // Inline visually-hidden so the wrapper needs no extra CSS.
    live.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;" +
      "overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
    document.body.appendChild(live);
  }
  live.textContent = message;
}

/* -------------------------------------------------------------------------- */
/* Badge (presentational span)                                                */
/* -------------------------------------------------------------------------- */

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Visible badge content (a count, a status word). Omit for a bare `dot`. */
  children?: React.ReactNode;
  /** Semantic cue / fill. @default 'count' */
  variant?: BadgeVariant;
  /**
   * Shape modifier:
   *   - 'auto'  → relax to the wide multi-digit pill automatically when a
   *               numeric `count` (or string children) is 2+ characters.
   *   - 'multi' → always apply the wide pill.
   *   - 'dot'   → a bare unread dot (no glyph); always presentational.
   * @default 'auto'
   */
  shape?: "auto" | "multi" | "dot";
  /**
   * The numeric count, for a SOLE-CARRIER count badge. When provided the badge
   * renders the number, keeps `aria-label="[n] notifications"` in sync, relaxes
   * to the multi-digit pill at 2+ digits, and (after the first render) announces
   * the change through a polite live region — the demo's setCount contract.
   * Mutually exclusive with `children`.
   */
  count?: number;
  /**
   * Singular noun used to build the sole-carrier label and announcement, e.g.
   * "notification" → `aria-label="3 notifications"`. Only used with `count`.
   * @default 'notification'
   */
  countNoun?: string;
  /**
   * Mark the badge presentational (`aria-hidden="true"`) — use when the value
   * is ALSO carried by surrounding visible text/context, so AT does not read it
   * twice. Forced on for the `dot` shape. Mutually exclusive with a sole-carrier
   * `count` (which is labelled, not hidden).
   */
  presentational?: boolean;
  /**
   * Explicit accessible name when the badge is the SOLE carrier of its meaning
   * and you are NOT using the managed `count` prop. Sets `aria-label`.
   */
  label?: string;
  /** Extra class names appended after the `hisd-badge*` classes. */
  className?: string;
}

/**
 * HISD Badge — an inline count or status marker.
 *
 * @example Status (visible text is the accessible name)
 * ```tsx
 * <Badge variant="success">Enrolled</Badge>
 * ```
 *
 * @example Presentational count (value also in adjacent text)
 * ```tsx
 * <span>Unread messages <Badge presentational>5</Badge></span>
 * ```
 *
 * @example Sole-carrier dynamic count (auto label + live announce)
 * ```tsx
 * const [n, setN] = React.useState(3);
 * <Badge.Host label="Notifications">
 *   <Badge count={n} />
 * </Badge.Host>
 * <button onClick={() => setN((v) => v + 1)}>+1</button>
 * ```
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge(props, ref) {
    const {
      children,
      variant = "count",
      shape = "auto",
      count,
      countNoun = "notification",
      presentational,
      label,
      className,
      ...rest
    } = props;

    const isDot = shape === "dot";
    const managed = count !== undefined;

    // Sole-carrier label + plural noun, mirroring `n + ' notifications'`.
    const soleLabel = managed
      ? `${count} ${countNoun}${count === 1 ? "" : "s"}`
      : undefined;

    // Announce managed-count changes politely, but skip the initial mount so we
    // only speak on a real change (the demo announces on the +1 click).
    const mountedRef = React.useRef(false);
    React.useEffect(() => {
      if (!managed) return;
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      if (soleLabel) announce(soleLabel);
    }, [managed, soleLabel]);

    // Visible content: the count number (managed) or the supplied children.
    const content: React.ReactNode = managed ? String(count) : children;

    // Decide the wide multi-digit pill. `multi` forces it; `auto` derives it
    // from the rendered text length (a 2+ char count/string), per setCount.
    const text =
      typeof content === "string"
        ? content
        : typeof content === "number"
          ? String(content)
          : undefined;
    const wide =
      !isDot && (shape === "multi" || (shape === "auto" && (text?.length ?? 0) > 1));

    // ARIA: dot is always presentational; a managed/explicit sole-carrier badge
    // is labelled; an explicitly-presentational badge is aria-hidden.
    const hidden = isDot || presentational === true;
    const ariaLabel = soleLabel ?? label;

    return (
      <span
        {...rest}
        ref={ref}
        className={joinClasses(
          BADGE,
          variantClass(variant),
          wide && BADGE_MULTI,
          isDot && BADGE_DOT,
          className,
        )}
        // A labelled sole-carrier badge must NOT also be hidden; honor the
        // label and only hide when there is no accessible name to expose.
        aria-hidden={hidden && !ariaLabel ? true : undefined}
        aria-label={ariaLabel}
      >
        {isDot ? null : content}
      </span>
    );
  },
) as React.ForwardRefExoticComponent<
  BadgeProps & React.RefAttributes<HTMLSpanElement>
> & {
  Host: typeof BadgeHost;
  Icon: typeof BadgeIcon;
};

/* -------------------------------------------------------------------------- */
/* Badge.Host — interactive icon button with an attached overlay badge.       */
/* -------------------------------------------------------------------------- */

export interface BadgeHostProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Accessible name for the host's action (e.g. "Notifications"). The host names
   * its OWN action; the overlay badge separately carries the count, per the
   * sole-carrier contract.
   */
  label?: string;
  /** The overlay content — typically a `<Badge.Icon />` plus a `<Badge />`. */
  children?: React.ReactNode;
  /** Extra class names appended after the `hisd-badge-host` class. */
  className?: string;
}

/**
 * Interactive icon button that hosts an overlay badge (`hisd-badge-host`). A
 * real <button>, so Enter/Space activation comes free — no custom keyboard
 * wiring. The badge inside is absolutely positioned and non-interactive (the
 * CSS sets pointer-events:none), so it never steals the host's click target.
 */
export const BadgeHost = React.forwardRef<HTMLButtonElement, BadgeHostProps>(
  function BadgeHost({ label, children, className, type, ...rest }, ref) {
    return (
      <button
        {...rest}
        ref={ref}
        type={type ?? "button"}
        className={joinClasses(BADGE_HOST, className)}
        aria-label={label ?? rest["aria-label"]}
      >
        {children}
      </button>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Badge.Icon — the host's monochrome currentColor glyph (default: bell).     */
/* -------------------------------------------------------------------------- */

export interface BadgeIconProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Extra class names appended after the `hisd-badge-host__icon` class. */
  className?: string;
}

/**
 * The host icon glyph (`hisd-badge-host__icon`). Drawn by the CSS as a
 * currentColor mask, so it is always presentational (`aria-hidden`); the host
 * button carries the accessible name.
 */
export const BadgeIcon = React.forwardRef<HTMLSpanElement, BadgeIconProps>(
  function BadgeIcon({ className, ...rest }, ref) {
    return (
      <span
        {...rest}
        ref={ref}
        className={joinClasses(BADGE_HOST_ICON, className)}
        aria-hidden="true"
      />
    );
  },
);

Badge.Host = BadgeHost;
Badge.Icon = BadgeIcon;

export default Badge;
