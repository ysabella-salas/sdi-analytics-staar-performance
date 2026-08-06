/**
 * HISD Design System — Navbar (React wrapper)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-navbar` component. It
 * applies the SAME `hisd-navbar*` classes and the SAME ARIA contract defined in
 * components/navbar.css (bundled into components/components.css) and the theme
 * tokens in assets/hisd-theme.css — it NEVER re-implements styling. Theming
 * flows entirely from those stylesheets, which the host app must load.
 *
 * Faithful to components/navbar.html (markup + the demo <script>):
 *   - A skip-link (href -> #main-content) sits FIRST in DOM order, visually
 *     hidden until focused. Rendered here when `skipLinkHref` is provided.
 *   - Root is <nav aria-label="Main"> carrying data-hisd-navbar + data-open.
 *   - Brand lockup (mark + wordmark) on the inline-start, links cluster on the
 *     inline-end. The active link uses aria-current="page" (CSS turns that into
 *     the AA-safe --color-action text + 2px --color-brand underline marker).
 *   - Below 48rem the horizontal list collapses behind a hamburger that opens a
 *     role="dialog" aria-modal drawer (scrim + panel + vertical link list).
 *   - Drawer behavior ported from the demo per WAI-ARIA APG "Dialog (Modal)":
 *       * hamburger toggles the dialog (native <button> -> Enter/Space open it);
 *       * on open: reveal, aria-expanded="true", move focus to the close button,
 *         trap Tab / Shift+Tab inside the panel, announce in a polite live region;
 *       * Escape, the close button, and the scrim all dismiss;
 *       * focus returns to the hamburger that opened it;
 *       * activating a drawer link closes the drawer.
 *   - prefers-reduced-motion / forced-colors are honored by the CSS already.
 * ============================================================================
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from "react";

/** Selector matching the focusable descendants the drawer's Tab-trap cycles. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** A single primary navigation item. */
export interface NavbarLink {
  /** Visible label. */
  label: ReactNode;
  /** Destination. Omit for a non-navigating action (rendered as a <button>). */
  href?: string;
  /**
   * Marks this the current page: applies `aria-current="page"`, which the CSS
   * turns into the AA-safe active text + brand underline / inline-start marker.
   */
  current?: boolean;
  /** Disables the item (icon-only / non-navigating actions). */
  disabled?: boolean;
  /** Optional click handler (e.g. for SPA routing — call preventDefault). */
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  /** Extra props forwarded to the rendered <a> / <button>. */
  linkProps?: AnchorHTMLAttributes<HTMLAnchorElement> &
    HTMLAttributes<HTMLButtonElement>;
}

export interface NavbarProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Primary navigation links rendered in both the bar and the mobile drawer. */
  links: NavbarLink[];
  /** Brand wordmark text (e.g. "Houston ISD"). */
  brandLabel?: ReactNode;
  /** One- or two-letter mark shown in the brand badge. @default "H" */
  brandMark?: ReactNode;
  /** Brand link destination. @default "/" */
  brandHref?: string;
  /**
   * Skip-link target id (e.g. "#main-content"). When set, the visually-hidden
   * skip-link is rendered FIRST in DOM order, as the contract requires.
   */
  skipLinkHref?: string;
  /** Skip-link text. @default "Skip to main content" */
  skipLinkLabel?: ReactNode;
  /** Accessible name for the <nav>. @default "Main" */
  ariaLabel?: string;
  /** Title shown in the drawer header. @default "Menu" */
  drawerTitle?: ReactNode;
  /** Accessible label for the hamburger trigger. @default "Open main menu" */
  openMenuLabel?: string;
  /** Accessible label for the drawer close button. @default "Close main menu" */
  closeMenuLabel?: string;
  /**
   * Extra trailing actions (e.g. a sign-in button) placed in the actions
   * cluster, before the hamburger.
   */
  actions?: ReactNode;
  /** Controlled drawer-open state. Omit for uncontrolled (internal state). */
  open?: boolean;
  /** Notified whenever the drawer opens / closes. */
  onOpenChange?: (open: boolean) => void;
  /** Extra class names appended to the <nav> root. */
  className?: string;
}

export const Navbar = forwardRef(function Navbar(
  props: NavbarProps,
  ref: Ref<HTMLElement>,
) {
  const {
    links,
    brandLabel = "Houston ISD",
    brandMark = "H",
    brandHref = "/",
    skipLinkHref,
    skipLinkLabel = "Skip to main content",
    ariaLabel = "Main",
    drawerTitle = "Menu",
    openMenuLabel = "Open main menu",
    closeMenuLabel = "Close main menu",
    actions,
    open: openProp,
    onOpenChange,
    className,
    ...rest
  } = props;

  const reactId = useId();
  const drawerId = `hisd-drawer-${reactId}`;
  const drawerTitleId = `${drawerId}-title`;

  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? openProp : internalOpen;

  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((message: string) => {
    if (liveRef.current) {
      liveRef.current.textContent = message;
    }
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const openDrawer = useCallback(() => {
    setOpen(true);
    announce("Main menu opened");
  }, [setOpen, announce]);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    announce("Main menu closed");
    // Return focus to the trigger per the APG.
    toggleRef.current?.focus();
  }, [setOpen, announce]);

  // On open: move focus to the close button (a safe landing inside the dialog).
  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
    }
  }, [isOpen]);

  // Escape + Tab-trap while the drawer is open. Bound on document in the
  // capture phase to mirror the demo's `addEventListener(..., true)`.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function visibleFocusable(): HTMLElement[] {
      const panel = panelRef.current;
      if (!panel) {
        return [];
      }
      return Array.prototype.filter.call(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        (el: HTMLElement) =>
          el.offsetParent !== null || el === document.activeElement,
      ) as HTMLElement[];
    }

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }

      if (event.key === "Tab") {
        const items = visibleFocusable();
        if (items.length === 0) {
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const panel = panelRef.current;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        } else if (panel && !panel.contains(active)) {
          // Focus escaped the panel — pull it back in.
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeydown, true);
    return () => {
      document.removeEventListener("keydown", onKeydown, true);
    };
  }, [isOpen, closeDrawer]);

  const handleToggleClick = useCallback(() => {
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }, [isOpen, openDrawer, closeDrawer]);

  const navClassName = className
    ? `hisd-navbar ${className}`
    : "hisd-navbar";

  /** Renders one horizontal bar link (li > a|button). */
  const renderBarLink = (link: NavbarLink, index: number) => {
    const { label, href, current, disabled, onClick, linkProps } = link;
    const common = {
      className: "hisd-navbar__link",
      "aria-current": current ? ("page" as const) : undefined,
    };
    return (
      <li className="hisd-navbar__item" key={`bar-${index}`}>
        {href !== undefined ? (
          <a
            {...linkProps}
            {...common}
            href={href}
            aria-disabled={disabled ? "true" : undefined}
            onClick={onClick}
          >
            {label}
          </a>
        ) : (
          <button
            {...linkProps}
            {...common}
            type="button"
            disabled={disabled}
            onClick={onClick}
          >
            {label}
          </button>
        )}
      </li>
    );
  };

  /** Renders one drawer link; activating it also closes the drawer. */
  const renderPanelLink = (link: NavbarLink, index: number) => {
    const { label, href, current, disabled, onClick, linkProps } = link;
    const handleClick = (
      event: ReactMouseEvent<HTMLAnchorElement | HTMLButtonElement>,
    ) => {
      onClick?.(event);
      closeDrawer();
    };
    const common = {
      className: "hisd-navbar__panel-link",
      "aria-current": current ? ("page" as const) : undefined,
    };
    return (
      <li key={`panel-${index}`}>
        {href !== undefined ? (
          <a
            {...linkProps}
            {...common}
            href={href}
            aria-disabled={disabled ? "true" : undefined}
            onClick={handleClick}
          >
            {label}
          </a>
        ) : (
          <button
            {...linkProps}
            {...common}
            type="button"
            disabled={disabled}
            onClick={handleClick}
          >
            {label}
          </button>
        )}
      </li>
    );
  };

  // Activating a dismiss target (scrim / close button) closes the drawer.
  const handleDismiss = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      closeDrawer();
    },
    [closeDrawer],
  );

  return (
    <>
      {skipLinkHref ? (
        <a className="hisd-navbar__skip-link" href={skipLinkHref}>
          {skipLinkLabel}
        </a>
      ) : null}

      <nav
        {...rest}
        ref={ref}
        className={navClassName}
        aria-label={ariaLabel}
        data-hisd-navbar=""
        data-open={isOpen ? "true" : undefined}
      >
        <a className="hisd-navbar__brand" href={brandHref}>
          <span className="hisd-navbar__brand-mark" aria-hidden="true">
            {brandMark}
          </span>
          <span>{brandLabel}</span>
        </a>

        <ul className="hisd-navbar__list">{links.map(renderBarLink)}</ul>

        <div className="hisd-navbar__actions">
          {actions}
          <button
            ref={toggleRef}
            type="button"
            className="hisd-navbar__toggle"
            aria-label={openMenuLabel}
            aria-haspopup="dialog"
            aria-expanded={isOpen ? "true" : "false"}
            aria-controls={drawerId}
            onClick={handleToggleClick}
          >
            <span className="hisd-navbar__toggle-icon" aria-hidden="true" />
          </button>
        </div>

        <div
          className="hisd-navbar__drawer"
          id={drawerId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={drawerTitleId}
          hidden={!isOpen}
        >
          <div
            className="hisd-navbar__scrim"
            data-hisd-dismiss=""
            onClick={handleDismiss}
          />
          <div className="hisd-navbar__panel" ref={panelRef}>
            <div className="hisd-navbar__panel-header">
              <h2 className="hisd-navbar__panel-title" id={drawerTitleId}>
                {drawerTitle}
              </h2>
              <button
                ref={closeRef}
                type="button"
                className="hisd-navbar__close"
                aria-label={closeMenuLabel}
                data-hisd-dismiss=""
                onClick={handleDismiss}
              >
                <span className="hisd-navbar__close-icon" aria-hidden="true" />
              </button>
            </div>
            <ul className="hisd-navbar__panel-list">
              {links.map(renderPanelLink)}
            </ul>
          </div>
        </div>
      </nav>

      {/* Polite live region: announces drawer open / close to assistive tech. */}
      <div
        ref={liveRef}
        aria-live="polite"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: 0,
          overflow: "hidden",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
        }}
      />
    </>
  );
});
