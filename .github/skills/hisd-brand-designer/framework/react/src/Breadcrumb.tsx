/**
 * HISD Breadcrumb — typed React wrapper around the vanilla `.hisd-breadcrumb`
 * component.
 * ============================================================================
 * This is a THIN behavior + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/breadcrumb.css) — this component NEVER re-implements
 * visuals. It only:
 *   - renders the canonical `<nav class="hisd-breadcrumb"><ol …>` markup,
 *   - applies the correct `hisd-breadcrumb*` classes and the ARIA contract
 *     (nav aria-label, aria-current="page" on the leaf, aria-hidden separators),
 *   - ports the demo's <script> behavior faithfully: the overflow disclosure
 *     (APG disclosure pattern) — a single <button> that toggles aria-expanded,
 *     shows/hides the [hidden] collapsible middle crumbs, swaps its aria-label,
 *     and manages focus (to the first revealed link on expand, back to the
 *     button on collapse).
 *
 * Faithful to components/breadcrumb.html:
 *   - Root is <nav aria-label="Breadcrumb"> wrapping an <ol> trail.
 *   - Each crumb <li class="hisd-breadcrumb__item"> holds either a link
 *     (<a class="hisd-breadcrumb__link">) or the current page
 *     (<span class="hisd-breadcrumb__current" aria-current="page">).
 *   - Separators are presentational <li class="hisd-breadcrumb__separator"
 *     aria-hidden="true"> drawn between crumbs.
 *   - The long-label variant adds `…__link--truncate` / `…__current--truncate`
 *     (with a title for the full text).
 *   - The collapsed variant renders root + an overflow `…` button + the
 *     `[hidden]` middle crumbs + the current page.
 *
 * prefers-reduced-motion / forced-colors are honored by the CSS already.
 *
 * React 18, function component, no deps beyond `react`.
 * ============================================================================
 */

import * as React from 'react';

/* Class-name constants — single source of truth, mirrors breadcrumb.css. */
const BC = 'hisd-breadcrumb';
const BC_LIST = 'hisd-breadcrumb__list';
const BC_ITEM = 'hisd-breadcrumb__item';
const BC_ITEM_COLLAPSIBLE = 'hisd-breadcrumb__item--collapsible';
const BC_LINK = 'hisd-breadcrumb__link';
const BC_LINK_TRUNCATE = 'hisd-breadcrumb__link--truncate';
const BC_CURRENT = 'hisd-breadcrumb__current';
const BC_CURRENT_TRUNCATE = 'hisd-breadcrumb__current--truncate';
const BC_SEPARATOR = 'hisd-breadcrumb__separator';
const BC_OVERFLOW = 'hisd-breadcrumb__overflow';

function joinClasses(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Crumb model                                                                */
/* -------------------------------------------------------------------------- */

/** A single crumb in the trail. */
export interface BreadcrumbCrumb {
  /** Visible label text for the crumb. */
  label: React.ReactNode;
  /**
   * Destination for a link crumb. Omit (or set the crumb `current`) to render
   * the leaf as plain `hisd-breadcrumb__current` text instead of a link.
   */
  href?: string;
  /**
   * Marks this crumb as the current page: renders a
   * `<span class="hisd-breadcrumb__current" aria-current="page">` instead of a
   * link. If no crumb is flagged, the last crumb is treated as current.
   */
  current?: boolean;
  /**
   * Truncate this crumb's label with an ellipsis (adds the `--truncate`
   * modifier). Supply `title` for the full text shown on hover / to AT.
   */
  truncate?: boolean;
  /** Full text exposed via `title` when the visible label is truncated. */
  title?: string;
  /**
   * In a collapsible trail, marks this crumb as part of the collapsed middle
   * (it and its leading separator carry `--collapsible` + `hidden` until the
   * overflow disclosure is expanded). Root and current crumbs stay visible.
   */
  collapsible?: boolean;
  /** Stable key for React list reconciliation. Falls back to the index. */
  key?: React.Key;
}

/* -------------------------------------------------------------------------- */
/* Props                                                                       */
/* -------------------------------------------------------------------------- */

type NavProps = React.HTMLAttributes<HTMLElement>;

export interface BreadcrumbProps
  extends Omit<NavProps, 'aria-label' | 'children'> {
  /** The ordered trail of crumbs, root first, leaf last. */
  items: BreadcrumbCrumb[];
  /**
   * Accessible name for the landmark. @default 'Breadcrumb'
   * Multiple breadcrumb landmarks on one page must each get a unique label.
   */
  'aria-label'?: string;
  /**
   * Enable the overflow disclosure: any `collapsible` middle crumbs (and their
   * leading separators) start hidden behind a `…` button that reveals them.
   * Derived automatically when any item has `collapsible: true`, but can be
   * forced with this prop.
   */
  collapsible?: boolean;
  /**
   * Controlled expanded state of the overflow disclosure. When provided, the
   * consumer must update it in response to `onExpandedChange`.
   */
  expanded?: boolean;
  /** Initial expanded state for the uncontrolled case. @default false */
  defaultExpanded?: boolean;
  /** Fires after the overflow disclosure is toggled, with the next value. */
  onExpandedChange?: (expanded: boolean) => void;
  /**
   * Accessible labels for the overflow `…` button in each state. The vanilla
   * demo uses "Show N hidden breadcrumb levels" / "Hide N breadcrumb levels";
   * N is filled in from the count of collapsible crumbs.
   */
  overflowLabels?: {
    /** @default 'Show {n} hidden breadcrumb levels' */
    expand?: string;
    /** @default 'Hide {n} breadcrumb levels' */
    collapse?: string;
  };
  /** Extra class names appended after `hisd-breadcrumb`. */
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Resolve which crumb is the current page (explicit flag, else the last). */
function currentIndex(items: BreadcrumbCrumb[]): number {
  const explicit = items.findIndex((c) => c.current);
  if (explicit !== -1) return explicit;
  return items.length - 1;
}

function formatLabel(template: string, n: number): string {
  return template.replace('{n}', String(n));
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * HISD Breadcrumb.
 *
 * @example Default trail
 * ```tsx
 * <Breadcrumb
 *   items={[
 *     { label: 'Home', href: '/' },
 *     { label: 'Schools', href: '/schools' },
 *     { label: 'Elementary', href: '/schools/elementary' },
 *     { label: 'Roberts Elementary' }, // leaf -> aria-current="page"
 *   ]}
 * />
 * ```
 *
 * @example Collapsed middle (overflow disclosure)
 * ```tsx
 * <Breadcrumb
 *   className="demo-narrow"
 *   items={[
 *     { label: 'Home', href: '/' },
 *     { label: 'Schools', href: '/schools', collapsible: true },
 *     { label: 'Elementary', href: '/schools/elementary', collapsible: true },
 *     { label: 'Roberts Elementary' },
 *   ]}
 * />
 * ```
 */
export const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  function Breadcrumb(props, forwardedRef) {
    const {
      items,
      'aria-label': ariaLabel = 'Breadcrumb',
      collapsible: collapsibleProp,
      expanded: expandedProp,
      defaultExpanded = false,
      onExpandedChange,
      overflowLabels,
      className,
      ...rest
    } = props;

    const leaf = currentIndex(items);
    const collapsibleCount = items.filter((c) => c.collapsible).length;
    const hasCollapsible = collapsibleProp ?? collapsibleCount > 0;

    // --- Expanded state (controlled or uncontrolled) ------------------------
    const isControlled = expandedProp !== undefined;
    const [internalExpanded, setInternalExpanded] =
      React.useState<boolean>(defaultExpanded);
    const expanded = isControlled
      ? (expandedProp as boolean)
      : internalExpanded;

    // --- Refs for focus management (APG disclosure pattern) -----------------
    const toggleRef = React.useRef<HTMLButtonElement | null>(null);
    const firstRevealedRef = React.useRef<HTMLAnchorElement | null>(null);
    // Track the previous expanded value so we only move focus on a real toggle,
    // not on the initial mount or on unrelated re-renders.
    const prevExpandedRef = React.useRef<boolean>(expanded);

    React.useEffect(() => {
      const prev = prevExpandedRef.current;
      if (prev === expanded) return;
      prevExpandedRef.current = expanded;
      if (expanded) {
        // Move focus to the first revealed link for keyboard continuity.
        firstRevealedRef.current?.focus();
      } else {
        // Collapsing returns focus to the disclosure button.
        toggleRef.current?.focus();
      }
    }, [expanded]);

    const expandLabel = formatLabel(
      overflowLabels?.expand ?? 'Show {n} hidden breadcrumb levels',
      collapsibleCount,
    );
    const collapseLabel = formatLabel(
      overflowLabels?.collapse ?? 'Hide {n} breadcrumb levels',
      collapsibleCount,
    );

    const handleToggle = React.useCallback(() => {
      const next = !expanded;
      if (!isControlled) setInternalExpanded(next);
      onExpandedChange?.(next);
    }, [expanded, isControlled, onExpandedChange]);

    // --- Build the trail ----------------------------------------------------
    // We walk the crumbs, emitting an <li> per crumb and an aria-hidden
    // separator <li> before every crumb after the first. In collapsible mode,
    // collapsible crumbs (and the separator that precedes them) carry the
    // `--collapsible` modifier + `hidden` until expanded; the overflow `…`
    // button is injected once, in place of the first collapsed run.
    const trail: React.ReactNode[] = [];
    let overflowInjected = false;
    let firstRevealedAssigned = false;

    items.forEach((crumb, index) => {
      const isLeaf = index === leaf;
      const isCollapsibleCrumb = hasCollapsible && Boolean(crumb.collapsible);
      const key = crumb.key ?? index;

      // Separator before every crumb except the first.
      if (index > 0) {
        const sepCollapsible = isCollapsibleCrumb;
        trail.push(
          <li
            key={`sep-${key}`}
            className={joinClasses(
              BC_SEPARATOR,
              sepCollapsible && BC_ITEM_COLLAPSIBLE,
            )}
            aria-hidden="true"
            {...(sepCollapsible && !expanded ? { hidden: true } : {})}
          />,
        );
      }

      // Inject the overflow disclosure once, right before the first collapsed
      // crumb (with its own leading separator), mirroring the demo markup.
      if (hasCollapsible && isCollapsibleCrumb && !overflowInjected) {
        overflowInjected = true;
        trail.push(
          <li key="overflow" className={BC_ITEM}>
            <button
              ref={toggleRef}
              type="button"
              className={BC_OVERFLOW}
              aria-expanded={expanded}
              aria-label={expanded ? collapseLabel : expandLabel}
              onClick={handleToggle}
            >
              {'…'}
            </button>
          </li>,
        );
        // Separator between the `…` button and the first revealed crumb. It is
        // itself collapsible so it hides alongside the crumbs when collapsed.
        trail.push(
          <li
            key={`overflow-sep-${key}`}
            className={joinClasses(BC_SEPARATOR, BC_ITEM_COLLAPSIBLE)}
            aria-hidden="true"
            {...(!expanded ? { hidden: true } : {})}
          />,
        );
      }

      // The crumb itself.
      if (isLeaf) {
        const currentClass = joinClasses(
          BC_CURRENT,
          crumb.truncate && BC_CURRENT_TRUNCATE,
        );
        trail.push(
          <li key={`crumb-${key}`} className={BC_ITEM}>
            <span
              className={currentClass}
              aria-current="page"
              {...(crumb.title ? { title: crumb.title } : {})}
            >
              {crumb.label}
            </span>
          </li>,
        );
      } else {
        const linkClass = joinClasses(
          BC_LINK,
          crumb.truncate && BC_LINK_TRUNCATE,
        );
        const assignFirstRevealed =
          isCollapsibleCrumb && !firstRevealedAssigned;
        if (assignFirstRevealed) firstRevealedAssigned = true;
        trail.push(
          <li
            key={`crumb-${key}`}
            className={joinClasses(
              BC_ITEM,
              isCollapsibleCrumb && BC_ITEM_COLLAPSIBLE,
            )}
            {...(isCollapsibleCrumb && !expanded ? { hidden: true } : {})}
          >
            <a
              ref={assignFirstRevealed ? firstRevealedRef : undefined}
              className={linkClass}
              href={crumb.href}
              {...(crumb.title ? { title: crumb.title } : {})}
            >
              {crumb.label}
            </a>
          </li>,
        );
      }
    });

    return (
      <nav
        {...rest}
        ref={forwardedRef}
        className={joinClasses(BC, className)}
        aria-label={ariaLabel}
      >
        <ol className={BC_LIST}>{trail}</ol>
      </nav>
    );
  },
);

export default Breadcrumb;
