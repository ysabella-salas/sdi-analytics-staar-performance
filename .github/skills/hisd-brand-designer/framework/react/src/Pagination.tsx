import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

/**
 * HISD Pagination — typed React wrapper around the vanilla `.hisd-pagination`
 * component.
 *
 * This is a THIN behaviour + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/pagination.css). This component never re-implements
 * styling — it applies the same `hisd-pagination*` classes and the same ARIA
 * contract as components/pagination.html, and ports the demo's <script>
 * behaviour faithfully:
 *
 *   - Root is a <nav class="hisd-pagination"> whose `aria-label` ends in the
 *     word "pagination" so the landmark name carries the APG pattern while
 *     distinguishing multiple pagination navs on one page.
 *   - A reset <ul role="list"> holds one <li class="hisd-pagination__item"> per
 *     control. Page controls carry `.hisd-pagination__link`; prev/next carry
 *     `.hisd-pagination__nav` + the `--prev` / `--next` modifier; elided ranges
 *     render an aria-hidden `.hisd-pagination__ellipsis` gap marker.
 *   - The active page carries `aria-current="page"` (driven by state so the
 *     visual + a11y state can never drift) plus an `aria-label` that names it as
 *     the current page.
 *   - Prev / Next set BOTH the native `disabled` attribute AND
 *     `aria-disabled="true"` at the first/last bound, matching the contract.
 *   - An optional polite `role="status"` live region announces "Page X of Y"
 *     (mirrors the demo's `[data-status]` region).
 *   - Keyboard comes free from native <a>/<button> (Tab to move, Enter/Space to
 *     activate). Clicking a control updates state and re-focuses it, exactly as
 *     the demo's `goTo(...) + link.focus()` does.
 *
 * Hover, focus-visible, the active accent fill, disabled opacity, the chevron
 * icon, forced-colors, reduced-motion, and dark-theme inheritance are ALL
 * handled by the CSS.
 */

/** How a page control is rendered. */
type PageElement = "a" | "button";

export interface PaginationProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  /** Total number of pages. Must be >= 1. */
  totalPages: number;
  /**
   * Controlled current page (1-based). When provided, the component is
   * controlled: update it in response to `onPageChange`.
   */
  page?: number;
  /** Uncontrolled initial page (1-based). Defaults to 1. */
  defaultPage?: number;
  /** Fires with the next page number whenever the active page changes. */
  onPageChange?: (page: number) => void;
  /**
   * Accessible name for the nav. MUST end in the word "pagination"
   * (e.g. "Search results pagination") per the component contract. Defaults to
   * "Pagination".
   */
  "aria-label"?: string;
  /**
   * How many page numbers to show on each side of the current page before an
   * ellipsis collapses the range. Defaults to 1 (matches the demo's compact
   * ranges).
   */
  siblingCount?: number;
  /**
   * How many page numbers to always show at each end (first / last). Defaults to
   * 1, so page 1 and the last page stay visible with ellipses between.
   */
  boundaryCount?: number;
  /**
   * Render page controls as anchors or buttons. Anchors require `getHref`.
   * Defaults to "button" (SPA-style; matches the demo's preventDefault flow).
   */
  pageElement?: PageElement;
  /**
   * Build the `href` for a page when `pageElement="a"`. Required for anchors so
   * the controls remain real links (keyboard + open-in-new-tab work natively).
   */
  getHref?: (page: number) => string;
  /** Visible text label beside the Previous chevron. Pass null for icon-only. */
  previousLabel?: ReactNode;
  /** Visible text label beside the Next chevron. Pass null for icon-only. */
  nextLabel?: ReactNode;
  /** Accessible name for the Previous button. Defaults to "Previous page". */
  previousAriaLabel?: string;
  /** Accessible name for the Next button. Defaults to "Next page". */
  nextAriaLabel?: string;
  /**
   * Render the polite live status line ("Page X of Y"). Defaults to true. Set a
   * function to customise the text, or false to omit the line entirely.
   */
  showStatus?: boolean;
  /** Build the status text. Defaults to `Page {page} of {total}`. */
  getStatusText?: (page: number, totalPages: number) => string;
  /** Build a page link's `aria-label`. Defaults to `Page {n}`. */
  getPageAriaLabel?: (page: number, isCurrent: boolean) => string;
  /** Extra class names appended to the `.hisd-pagination` root. */
  className?: string;
}

/** Marker for an elided range slot in the computed item list. */
const ELLIPSIS = "ellipsis" as const;
type PageSlot = number | typeof ELLIPSIS;

/** Inclusive integer range [start, end]. */
function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) {
    out.push(i);
  }
  return out;
}

/**
 * Compute the page slots to render: boundary pages at each end, a window of
 * siblings around the current page, and an `ellipsis` marker wherever a run of
 * pages is elided. Mirrors the demo's static markup (single ellipsis on one
 * side near a bound, ellipses on both sides in the middle).
 */
function buildPageSlots(
  totalPages: number,
  current: number,
  siblingCount: number,
  boundaryCount: number,
): PageSlot[] {
  // Few enough pages to show them all without any ellipsis.
  const totalNumbers = boundaryCount * 2 + siblingCount * 2 + 3;
  if (totalPages <= totalNumbers) {
    return range(1, totalPages);
  }

  const startPages = range(1, boundaryCount);
  const endPages = range(totalPages - boundaryCount + 1, totalPages);

  const siblingsStart = Math.max(
    Math.min(current - siblingCount, totalPages - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(current + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : totalPages - 1,
  );

  const slots: PageSlot[] = [...startPages];

  // Left ellipsis (or the single page that fills the gap).
  if (siblingsStart > boundaryCount + 2) {
    slots.push(ELLIPSIS);
  } else if (boundaryCount + 1 < totalPages - boundaryCount) {
    slots.push(boundaryCount + 1);
  }

  slots.push(...range(siblingsStart, siblingsEnd));

  // Right ellipsis (or the single page that fills the gap).
  if (siblingsEnd < totalPages - boundaryCount - 1) {
    slots.push(ELLIPSIS);
  } else if (totalPages - boundaryCount > boundaryCount) {
    slots.push(totalPages - boundaryCount);
  }

  slots.push(...endPages);

  // De-dupe defensively (small ranges can overlap boundary/sibling sets).
  const seen = new Set<number>();
  return slots.filter((slot) => {
    if (slot === ELLIPSIS) {
      return true;
    }
    if (seen.has(slot)) {
      return false;
    }
    seen.add(slot);
    return true;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const Pagination = forwardRef(function Pagination(
  props: PaginationProps,
  ref: Ref<HTMLElement>,
) {
  const {
    totalPages,
    page,
    defaultPage = 1,
    onPageChange,
    "aria-label": ariaLabel = "Pagination",
    siblingCount = 1,
    boundaryCount = 1,
    pageElement = "button",
    getHref,
    previousLabel = "Previous",
    nextLabel = "Next",
    previousAriaLabel = "Previous page",
    nextAriaLabel = "Next page",
    showStatus = true,
    getStatusText,
    getPageAriaLabel,
    className,
    ...rest
  } = props;

  const total = Math.max(1, Math.floor(totalPages));
  const isControlled = page !== undefined;

  const [internalPage, setInternalPage] = useState<number>(() =>
    clamp(Math.floor(defaultPage), 1, total),
  );
  const current = clamp(
    Math.floor(isControlled ? (page as number) : internalPage),
    1,
    total,
  );

  // Refs to the page controls (keyed by page number) so a click can re-focus
  // the just-activated control — matching the demo's `link.focus()`.
  const controlRefs = useRef(new Map<number, HTMLAnchorElement | HTMLButtonElement>());
  const setControlRef = useCallback(
    (n: number) => (el: HTMLAnchorElement | HTMLButtonElement | null) => {
      if (el) {
        controlRefs.current.set(n, el);
      } else {
        controlRefs.current.delete(n);
      }
    },
    [],
  );

  /**
   * Move to a page: clamp to [1, total], update state, fire onPageChange, and
   * re-focus the activated control. No-ops if the page didn't change or is the
   * current page (the active control is non-interactive, like the demo).
   */
  const goTo = useCallback(
    (next: number, focus: boolean) => {
      const target = clamp(Math.floor(next), 1, total);
      if (target !== current) {
        if (!isControlled) {
          setInternalPage(target);
        }
        onPageChange?.(target);
      }
      if (focus) {
        // Defer focus so the re-render that re-points refs has happened.
        requestAnimationFrame(() => {
          controlRefs.current.get(target)?.focus();
        });
      }
    },
    [total, current, isControlled, onPageChange],
  );

  const slots = useMemo(
    () => buildPageSlots(total, current, siblingCount, boundaryCount),
    [total, current, siblingCount, boundaryCount],
  );

  const atFirst = current <= 1;
  const atLast = current >= total;

  const statusText = getStatusText
    ? getStatusText(current, total)
    : `Page ${current} of ${total}`;

  const pageAriaLabel = (n: number, isCurrent: boolean) =>
    getPageAriaLabel
      ? getPageAriaLabel(n, isCurrent)
      : isCurrent
        ? `Page ${n}, current page`
        : `Page ${n}`;

  const rootClassName = className
    ? `hisd-pagination ${className}`
    : "hisd-pagination";

  /** Render one page control (active = aria-current, non-interactive). */
  const renderPage = (n: number) => {
    const isCurrent = n === current;
    const ariaCurrent = isCurrent ? ("page" as const) : undefined;
    const ariaLabelForPage = pageAriaLabel(n, isCurrent);

    if (pageElement === "a") {
      const href = getHref ? getHref(n) : "#";
      return (
        <a
          ref={setControlRef(n)}
          className="hisd-pagination__link"
          href={href}
          aria-label={ariaLabelForPage}
          aria-current={ariaCurrent}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            // Active page is non-interactive; let modified clicks (open in new
            // tab) behave natively.
            if (isCurrent) {
              event.preventDefault();
              return;
            }
            if (
              event.defaultPrevented ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            ) {
              return;
            }
            if (!getHref) {
              event.preventDefault();
            }
            goTo(n, true);
          }}
        >
          {n}
        </a>
      );
    }

    return (
      <button
        ref={setControlRef(n)}
        type="button"
        className="hisd-pagination__link"
        aria-label={ariaLabelForPage}
        aria-current={ariaCurrent}
        onClick={() => {
          if (isCurrent) {
            return;
          }
          goTo(n, true);
        }}
      >
        {n}
      </button>
    );
  };

  return (
    <nav {...rest} ref={ref} className={rootClassName} aria-label={ariaLabel}>
      <ul className="hisd-pagination__list" role="list">
        {/* Previous */}
        <li className="hisd-pagination__item">
          <button
            type="button"
            className="hisd-pagination__nav hisd-pagination__nav--prev"
            aria-label={previousAriaLabel}
            disabled={atFirst}
            aria-disabled={atFirst || undefined}
            onClick={() => {
              if (atFirst) {
                return;
              }
              goTo(current - 1, false);
            }}
          >
            <span className="hisd-pagination__icon" aria-hidden="true" />
            {previousLabel != null ? (
              <span className="hisd-pagination__label">{previousLabel}</span>
            ) : null}
          </button>
        </li>

        {/* Page numbers + ellipses */}
        {slots.map((slot, index) =>
          slot === ELLIPSIS ? (
            <li
              // Index is part of the key because two ellipses can appear.
              key={`ellipsis-${index}`}
              className="hisd-pagination__item"
            >
              <span className="hisd-pagination__ellipsis" aria-hidden="true">
                &hellip;
              </span>
            </li>
          ) : (
            <li key={slot} className="hisd-pagination__item">
              {renderPage(slot)}
            </li>
          ),
        )}

        {/* Next */}
        <li className="hisd-pagination__item">
          <button
            type="button"
            className="hisd-pagination__nav hisd-pagination__nav--next"
            aria-label={nextAriaLabel}
            disabled={atLast}
            aria-disabled={atLast || undefined}
            onClick={() => {
              if (atLast) {
                return;
              }
              goTo(current + 1, false);
            }}
          >
            {nextLabel != null ? (
              <span className="hisd-pagination__label">{nextLabel}</span>
            ) : null}
            <span className="hisd-pagination__icon" aria-hidden="true" />
          </button>
        </li>
      </ul>

      {showStatus ? (
        <p
          className="hisd-pagination__status"
          role="status"
          aria-live="polite"
        >
          {statusText}
        </p>
      ) : null}
    </nav>
  );
});
