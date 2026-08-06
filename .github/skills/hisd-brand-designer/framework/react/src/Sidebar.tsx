/**
 * HISD Design System — Sidebar (React wrapper)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-sidebar` component. It
 * applies the SAME `hisd-sidebar*` classes and ARIA contract defined in
 * components/sidebar.css (bundled into components/components.css) and the theme
 * in assets/hisd-theme.css — it NEVER re-implements styling. Theming flows
 * entirely from those stylesheets, which the host app must load.
 *
 * Faithful to components/sidebar.html:
 *   - Root renders as <nav aria-label="…">.
 *   - Grouped sections: <div.hisd-sidebar__group> with an
 *     <h3.hisd-sidebar__heading> and a <ul.hisd-sidebar__list aria-labelledby>.
 *   - Items: <li.hisd-sidebar__item> → <a.hisd-sidebar__link> with an optional
 *     leading icon (.hisd-sidebar__icon), a .hisd-sidebar__label, and an
 *     optional trailing .hisd-sidebar__badge (count / status).
 *   - Active link: aria-current="page" is the single source of truth (CSS keys
 *     the brand text, the 3px inline-start rail, and the inverted badge off it).
 *   - Disabled link: aria-disabled="true" + tabindex={-1}; pointer-events are
 *     removed by CSS, and activation (click + Enter/Space) is intercepted and
 *     prevented because aria-disabled links are not natively inert.
 *   - Roving keyboard support per the WAI-ARIA APG, ported from the demo
 *     <script>: ArrowDown/ArrowUp wrap through enabled links, Home/End jump to
 *     the first/last. Native Tab order already reaches every link; this is an
 *     additive affordance and the component is fully usable without it.
 *   - prefers-reduced-motion / forced-colors are honored by the CSS already.
 * ============================================================================
 */

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useId,
  useRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

/** A single navigation link inside a sidebar group. */
export interface SidebarItem {
  /** Visible label text. */
  label: ReactNode;
  /** Destination. Omit (or pass undefined) for a non-navigating link. */
  href?: string;
  /**
   * Marks this link as the current page. Sets `aria-current="page"`, which is
   * the source of truth the CSS keys the active visual state off.
   */
  current?: boolean;
  /** Disables the link (`aria-disabled`, removed from the roving order). */
  disabled?: boolean;
  /**
   * Leading decorative icon. Mirroring the demo, the `.hisd-sidebar__icon`
   * class (which carries the sizing + `color: currentColor`) is applied to the
   * icon element ITSELF when you pass a single element such as an
   * `<svg aria-hidden="true" focusable="false">`. The wrapper merges the class
   * (preserving any class you already set) and adds `aria-hidden`. For non-
   * element content it falls back to a `<span class="hisd-sidebar__icon">`.
   */
  icon?: ReactNode;
  /** Trailing badge content (e.g. an unread count). */
  badge?: ReactNode;
  /** Stable key when rendering from data. Falls back to the index. */
  key?: string;
  /** Click handler. Not fired when the item is disabled. */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Extra props forwarded to the underlying `<a>`. */
  linkProps?: Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "href" | "className" | "aria-current" | "aria-disabled" | "onClick"
  >;
}

/** A labelled section of the sidebar. */
export interface SidebarGroup {
  /** Section heading (rendered uppercase by the CSS). */
  heading: ReactNode;
  /** The links in this section. */
  items: SidebarItem[];
  /** Stable key when rendering from data. Falls back to the index. */
  key?: string;
}

export interface SidebarProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /**
   * Accessible name for the navigation landmark. Required so multiple navs on a
   * page stay distinguishable to AT. Spread onto the root as `aria-label`.
   */
  "aria-label": string;
  /**
   * Data-driven content. Each group renders its heading + list of links.
   * Mutually usable with `children` (groups render first), but most callers use
   * one or the other.
   */
  groups?: SidebarGroup[];
  /**
   * Escape hatch for fully custom markup. When provided, it is rendered inside
   * the <nav> after any `groups`. You are responsible for applying the
   * `hisd-sidebar__*` classes to custom children.
   */
  children?: ReactNode;
  /**
   * Enable roving Arrow/Home/End keyboard navigation between enabled links.
   * @default true
   */
  rovingKeyboard?: boolean;
  /** Extra class names appended after `hisd-sidebar`. */
  className?: string;
}

export const Sidebar = forwardRef(function Sidebar(
  props: SidebarProps,
  ref: Ref<HTMLElement>,
) {
  const {
    "aria-label": ariaLabel,
    groups,
    children,
    rovingKeyboard = true,
    className,
    onKeyDown,
    ...rest
  } = props;

  const baseId = useId();
  // Keep our own handle on the <nav> so roving focus can query its links even
  // when the caller also passes a ref (we merge both below).
  const navRef = useRef<HTMLElement | null>(null);

  const setNavRef = useCallback(
    (node: HTMLElement | null) => {
      navRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [ref],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (!rovingKeyboard || event.defaultPrevented) {
        return;
      }
      const nav = navRef.current;
      if (!nav) {
        return;
      }

      // Enabled links only — disabled links are skipped by the roving order,
      // mirroring the demo's enabledLinks() filter.
      const links = Array.prototype.filter.call(
        nav.querySelectorAll<HTMLAnchorElement>(".hisd-sidebar__link"),
        (el: HTMLAnchorElement) =>
          el.getAttribute("aria-disabled") !== "true",
      ) as HTMLAnchorElement[];
      if (links.length === 0) {
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const idx = active
        ? links.indexOf(active as HTMLAnchorElement)
        : -1;
      let next: HTMLAnchorElement | null = null;

      switch (event.key) {
        case "ArrowDown":
          next = links[idx < 0 ? 0 : (idx + 1) % links.length];
          break;
        case "ArrowUp":
          next = links[idx <= 0 ? links.length - 1 : idx - 1];
          break;
        case "Home":
          next = links[0];
          break;
        case "End":
          next = links[links.length - 1];
          break;
        default:
          return;
      }

      if (next) {
        event.preventDefault();
        next.focus();
      }
    },
    [onKeyDown, rovingKeyboard],
  );

  const rootClassName = className
    ? `hisd-sidebar ${className}`
    : "hisd-sidebar";

  return (
    <nav
      {...rest}
      ref={setNavRef}
      className={rootClassName}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {groups?.map((group, groupIndex) => {
        const headingId = `${baseId}-grp-${group.key ?? groupIndex}`;
        return (
          <div className="hisd-sidebar__group" key={group.key ?? groupIndex}>
            <h3 className="hisd-sidebar__heading" id={headingId}>
              {group.heading}
            </h3>
            <ul className="hisd-sidebar__list" aria-labelledby={headingId}>
              {group.items.map((item, itemIndex) => (
                <SidebarLink
                  key={item.key ?? itemIndex}
                  item={item}
                />
              ))}
            </ul>
          </div>
        );
      })}
      {children}
    </nav>
  );
});

/**
 * A single sidebar link. Rendered as <li> → <a> so it sits correctly inside the
 * list. Kept internal; callers describe links declaratively via `SidebarItem`.
 */
function SidebarLink(props: { item: SidebarItem }) {
  const { item } = props;
  const {
    label,
    href,
    current = false,
    disabled = false,
    icon,
    badge,
    onClick,
    linkProps,
  } = item;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // aria-disabled links are not natively inert, so intercept activation.
      if (disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    },
    [disabled, onClick],
  );

  return (
    <li className="hisd-sidebar__item">
      <a
        {...linkProps}
        className="hisd-sidebar__link"
        href={disabled ? undefined : href}
        aria-current={current ? "page" : undefined}
        aria-disabled={disabled ? "true" : undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={handleClick}
      >
        {renderIcon(icon)}
        <span className="hisd-sidebar__label">{label}</span>
        {badge != null ? (
          <span className="hisd-sidebar__badge">{badge}</span>
        ) : null}
      </a>
    </li>
  );
}

/**
 * Apply the `.hisd-sidebar__icon` class to the icon element itself (faithful to
 * the demo's `<svg class="hisd-sidebar__icon">`), merging with any class the
 * caller already set and marking it decorative. Non-element content is wrapped
 * in a span carrying the class instead.
 */
function renderIcon(icon: ReactNode): ReactNode {
  if (icon == null) {
    return null;
  }
  if (isValidElement(icon)) {
    const element = icon as ReactElement<{
      className?: string;
      "aria-hidden"?: boolean | "true" | "false";
    }>;
    const existing = element.props.className;
    const merged = existing
      ? `hisd-sidebar__icon ${existing}`
      : "hisd-sidebar__icon";
    return cloneElement(element, {
      className: merged,
      "aria-hidden": element.props["aria-hidden"] ?? "true",
    });
  }
  return (
    <span className="hisd-sidebar__icon" aria-hidden="true">
      {icon}
    </span>
  );
}
