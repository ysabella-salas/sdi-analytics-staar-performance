import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type HTMLAttributes,
} from "react";

/**
 * HISD Accordion — typed React wrapper around the vanilla `.hisd-accordion`
 * component (the WAI-ARIA APG "Accordion" / disclosure pattern).
 *
 * This is a THIN behaviour + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/accordion.css). This component never re-implements
 * styling — it applies the same `hisd-accordion*` classes and the same ARIA
 * contract as components/accordion.html, and ports the demo's <script>
 * behaviour exactly:
 *
 *   - Structure: each header is a native <button aria-expanded aria-controls>
 *       inside a heading (h2/h3/…); each panel is a role="region" labelled by
 *       its header via aria-labelledby. Collapsed panels carry the `hidden`
 *       attribute (removed from layout + the a11y tree).
 *   - Toggle: Click / Enter / Space on a header flips aria-expanded and shows /
 *       hides its panel. Enter/Space are handled by the native <button> (no
 *       preventDefault), so activation comes for free.
 *   - Single-open ("exclusive") mode: when `single` is set, opening one panel
 *       collapses every other open panel. APG allows collapsing the last open
 *       panel, so we do NOT force one to stay open.
 *   - Header roving: Arrow Up/Down move focus between ENABLED headers (wrapping);
 *       Home/End jump to the first/last enabled header. Disabled headers are
 *       skipped by keyboard navigation and cannot toggle.
 *   - A single visually-hidden polite live region announces "<label> expanded"
 *       / "<label> collapsed" (mirrors the demo's `#accordion-live`).
 *
 * Hover, focus-visible, the rotating chevron, disabled de-emphasis, forced
 * colors, reduced motion, and dark-theme inheritance are ALL handled by the CSS.
 */

/** A single accordion item: a header (heading + button) and its panel. */
export interface AccordionItem {
  /**
   * Stable identifier for this item. Used to derive the trigger/panel element
   * ids and as the controlled/uncontrolled open `value`. Must be unique within
   * the set.
   */
  value: string;
  /** Visible header label. */
  label: ReactNode;
  /** Panel content shown when the item is expanded. */
  content: ReactNode;
  /**
   * Disables the item: its trigger gets the native `disabled` attribute, is
   * skipped by keyboard navigation, cannot toggle, and renders with the
   * disabled styling.
   */
  disabled?: boolean;
}

/** Heading level used to wrap each trigger (preserves document outline). */
export type AccordionHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface AccordionProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** The items to render, in visual order. */
  items: AccordionItem[];
  /**
   * Single-open (exclusive) mode: opening one panel collapses the others.
   * Defaults to false (multi-open).
   */
  single?: boolean;
  /**
   * Heading level for each item's `.hisd-accordion__heading` (h2–h6). Defaults
   * to 3. Choose the level that fits the surrounding document outline.
   */
  headingLevel?: AccordionHeadingLevel;
  /**
   * Controlled set of expanded item `value`s. When provided, the component is
   * controlled: update it in response to `onValueChange`. In `single` mode the
   * component still only renders the first matching value as open.
   */
  value?: string[];
  /**
   * Uncontrolled initial set of expanded `value`s. Defaults to an empty set
   * (all collapsed).
   */
  defaultValue?: string[];
  /** Fires with the next full set of expanded `value`s whenever it changes. */
  onValueChange?: (values: string[]) => void;
  /**
   * Id prefix for the generated trigger/panel element ids. Auto-generated when
   * omitted. Useful for stable ids across renders / SSR.
   */
  idPrefix?: string;
  /**
   * When true, render a visually-hidden polite live region that announces a
   * panel's expanded/collapsed state (mirrors the demo's `#accordion-live`
   * region). Defaults to true. Uses an inline visually-hidden style so it needs
   * no extra CSS.
   */
  announce?: boolean;
  /** Extra class names appended to the `.hisd-accordion` root. */
  className?: string;
}

/** Inline visually-hidden style for the optional live region (no extra CSS). */
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  inlineSize: "1px",
  blockSize: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export const Accordion = forwardRef(function Accordion(
  props: AccordionProps,
  ref: Ref<HTMLDivElement>,
) {
  const {
    items,
    single = false,
    headingLevel = 3,
    value,
    defaultValue,
    onValueChange,
    idPrefix,
    announce = true,
    className,
    ...rest
  } = props;

  const reactId = useId();
  const base = idPrefix ?? `hisd-accordion-${reactId}`;
  const triggerId = useCallback((v: string) => `${base}-trigger-${v}`, [base]);
  const panelId = useCallback((v: string) => `${base}-panel-${v}`, [base]);

  const isControlled = value !== undefined;

  const [internalOpen, setInternalOpen] = useState<string[]>(
    () => defaultValue ?? [],
  );

  // The effective open set. In `single` mode only one panel may be open, so we
  // collapse a multi-valued incoming set down to its first member for rendering.
  const openValues = useMemo(() => {
    const raw = isControlled ? (value ?? []) : internalOpen;
    if (single && raw.length > 1) {
      return raw.slice(0, 1);
    }
    return raw;
  }, [isControlled, value, internalOpen, single]);

  const openSet = useMemo(() => new Set(openValues), [openValues]);

  // Refs to the trigger <button>s, keyed by value, so keyboard nav can move
  // focus between headers (matching the demo's roving behaviour).
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // Enabled items only — disabled headers are not toggle/focus targets.
  const enabled = useMemo(
    () => items.filter((item) => !item.disabled),
    [items],
  );

  const commit = useCallback(
    (next: string[]) => {
      if (!isControlled) {
        setInternalOpen(next);
      }
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  /**
   * Toggle an item's panel. Disabled items are inert. In `single` mode, opening
   * one item collapses all others first (the demo's exclusive behaviour).
   */
  const toggle = useCallback(
    (item: AccordionItem) => {
      if (item.disabled) {
        return;
      }
      const willExpand = !openSet.has(item.value);
      let next: string[];
      if (willExpand) {
        next = single ? [item.value] : [...openValues, item.value];
      } else {
        next = openValues.filter((v) => v !== item.value);
      }
      commit(next);

      if (announce && liveRegionRef.current) {
        const label =
          triggerRefs.current.get(item.value)?.textContent?.trim() ?? "";
        liveRegionRef.current.textContent = `${label} ${
          willExpand ? "expanded" : "collapsed"
        }`;
      }
    },
    [openSet, openValues, single, commit, announce],
  );

  // If a controlled/external value lands on a disabled or missing item, or items
  // change so an open value vanishes, prune the uncontrolled set so we never
  // claim a non-existent panel is open. Never override a valid controlled value.
  useEffect(() => {
    if (isControlled) {
      return;
    }
    const valid = new Set(
      items.filter((it) => !it.disabled).map((it) => it.value),
    );
    const pruned = internalOpen.filter((v) => valid.has(v));
    if (pruned.length !== internalOpen.length) {
      setInternalOpen(pruned);
    }
  }, [isControlled, items, internalOpen]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, item: AccordionItem) => {
      if (enabled.length === 0) {
        return;
      }
      const index = enabled.findIndex((it) => it.value === item.value);
      // Focus on a disabled header (shouldn't happen via keyboard) → bail.
      if (index === -1) {
        return;
      }

      let next: AccordionItem | undefined;
      switch (event.key) {
        case "ArrowDown":
          next = enabled[(index + 1) % enabled.length];
          break;
        case "ArrowUp":
          next = enabled[(index - 1 + enabled.length) % enabled.length];
          break;
        case "Home":
          next = enabled[0];
          break;
        case "End":
          next = enabled[enabled.length - 1];
          break;
        default:
          return; // Enter/Space/Tab → native button handling
      }

      event.preventDefault();
      if (next) {
        triggerRefs.current.get(next.value)?.focus();
      }
    },
    [enabled],
  );

  const setTriggerRef = useCallback(
    (v: string) => (el: HTMLButtonElement | null) => {
      if (el) {
        triggerRefs.current.set(v, el);
      } else {
        triggerRefs.current.delete(v);
      }
    },
    [],
  );

  const rootClassName = className
    ? `hisd-accordion ${className}`
    : "hisd-accordion";

  const Heading = `h${headingLevel}` as const;

  return (
    <div {...rest} ref={ref} className={rootClassName}>
      {items.map((item) => {
        const isOpen = openSet.has(item.value);
        return (
          <div key={item.value} className="hisd-accordion__item">
            <Heading className="hisd-accordion__heading">
              <button
                type="button"
                className="hisd-accordion__trigger"
                ref={setTriggerRef(item.value)}
                id={triggerId(item.value)}
                aria-controls={panelId(item.value)}
                aria-expanded={isOpen}
                disabled={item.disabled}
                onClick={() => toggle(item)}
                onKeyDown={(event) => handleKeyDown(event, item)}
              >
                <span className="hisd-accordion__label">{item.label}</span>
                <span className="hisd-accordion__chevron" aria-hidden="true" />
              </button>
            </Heading>
            <div
              className="hisd-accordion__panel"
              role="region"
              id={panelId(item.value)}
              aria-labelledby={triggerId(item.value)}
              hidden={!isOpen}
            >
              {item.content}
            </div>
          </div>
        );
      })}

      {announce ? (
        <div
          ref={liveRegionRef}
          role="status"
          aria-live="polite"
          style={visuallyHidden}
        />
      ) : null}
    </div>
  );
});
