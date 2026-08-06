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
 * HISD Tabs — typed React wrapper around the vanilla `.hisd-tabs` component.
 *
 * This is a THIN behaviour + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/tabs.css). This component never re-implements styling — it
 * applies the same `hisd-tabs*` classes and the same ARIA contract as
 * components/tabs.html, and ports the demo's <script> behaviour exactly:
 *
 *   - WAI-ARIA APG "Tabs with Automatic Activation":
 *       role="tablist" wraps role="tab"; each role="tabpanel" links back via
 *       aria-controls / aria-labelledby.
 *   - Roving tabindex: exactly one tab is in the page tab order (tabindex 0),
 *       the rest are tabindex -1.
 *   - Keyboard: Arrow Left/Right (and Up/Down) move focus AND activate the newly
 *       focused tab; Home/End jump to the first/last enabled tab. Disabled tabs
 *       are skipped. Enter/Space/Tab keep their native behaviour.
 *   - Click activates without stealing focus on pointer (matches the demo:
 *       `activate(tab, false)`).
 *   - The active tab is scrolled into view (`scroll-behaviour` is governed by the
 *       CSS, which honours prefers-reduced-motion).
 *   - An optional polite live region announces "<label> tab selected".
 *
 * Overflow (horizontal scroll + edge fades), the active accent underline, hover,
 * focus-visible, disabled, and dark-theme inheritance are ALL handled by the CSS.
 */

/** A single tab + its panel. */
export interface TabItem {
  /**
   * Stable identifier for this tab. Used to derive the tab/panel element ids and
   * as the controlled/uncontrolled `value`. Must be unique within the set.
   */
  value: string;
  /** Visible tab label. */
  label: ReactNode;
  /** Panel content shown when this tab is active. */
  content: ReactNode;
  /**
   * Disables the tab: it is removed from the roving tab order, skipped by
   * keyboard navigation, and rendered with the disabled styling. Maps to the
   * native `disabled` attribute on the underlying <button>.
   */
  disabled?: boolean;
  /**
   * Optional leading monochrome icon. Pass a CSS value for the `--hisd-tabs-icon`
   * custom property (e.g. `url("data:image/svg+xml,...")`). The CSS masks it with
   * currentColor so it tracks the tab's text colour in every state/theme.
   */
  icon?: string;
}

export interface TabsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** The tabs to render, in visual order. */
  items: TabItem[];
  /**
   * Accessible name for the tablist (`aria-label`). Provide this OR
   * `aria-labelledby` so the tablist is named for assistive tech.
   */
  "aria-label"?: string;
  /** Id of a visible element that names the tablist. */
  "aria-labelledby"?: string;
  /**
   * Controlled selected tab `value`. When provided, the component is controlled:
   * update it in response to `onValueChange`.
   */
  value?: string;
  /**
   * Uncontrolled initial selected `value`. Defaults to the first enabled tab.
   */
  defaultValue?: string;
  /** Fires with the next tab `value` whenever the active tab changes. */
  onValueChange?: (value: string) => void;
  /**
   * Id prefix for the generated tab/panel element ids. Auto-generated when
   * omitted. Useful for stable ids across renders / SSR.
   */
  idPrefix?: string;
  /**
   * When true, render a visually-hidden polite live region that announces the
   * newly selected tab (mirrors the demo's `#tabs-live` region). Defaults to
   * true. The region uses an inline visually-hidden style so it needs no extra
   * CSS.
   */
  announce?: boolean;
  /** Extra class names appended to the `.hisd-tabs` root. */
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

export const Tabs = forwardRef(function Tabs(
  props: TabsProps,
  ref: Ref<HTMLDivElement>,
) {
  const {
    items,
    value,
    defaultValue,
    onValueChange,
    idPrefix,
    announce = true,
    className,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...rest
  } = props;

  const reactId = useId();
  const base = idPrefix ?? `hisd-tabs-${reactId}`;
  const tabId = useCallback((v: string) => `${base}-tab-${v}`, [base]);
  const panelId = useCallback((v: string) => `${base}-panel-${v}`, [base]);

  const isControlled = value !== undefined;

  // The first enabled tab is the natural default (selected + sole tab stop).
  const firstEnabled = useMemo(
    () => items.find((item) => !item.disabled)?.value,
    [items],
  );

  const [internalValue, setInternalValue] = useState<string>(
    () => defaultValue ?? firstEnabled ?? items[0]?.value ?? "",
  );
  const selected = isControlled ? value : internalValue;

  // Refs to the tab <button>s, keyed by value, so keyboard nav can move focus
  // and scroll the active tab into view (matching the demo's behaviour).
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // Enabled tabs only — disabled tabs are not focus/activation targets.
  const enabled = useMemo(
    () => items.filter((item) => !item.disabled),
    [items],
  );

  /**
   * Activate a tab by value: update state, optionally move focus, scroll it into
   * view, fire onValueChange, and announce. `setFocus` mirrors the demo's second
   * argument (false on click, true on keyboard) so pointer activation doesn't
   * yank focus away from where the user clicked.
   */
  const activate = useCallback(
    (next: string, setFocus: boolean) => {
      const item = items.find((it) => it.value === next);
      if (!item || item.disabled) {
        return;
      }

      if (!isControlled) {
        setInternalValue(next);
      }
      onValueChange?.(next);

      const tabEl = tabRefs.current.get(next);
      if (setFocus && tabEl) {
        tabEl.focus();
      }
      // Bring the active tab fully into the scrollable strip. CSS owns the
      // scroll easing (and zeroes it under prefers-reduced-motion).
      if (tabEl && typeof tabEl.scrollIntoView === "function") {
        tabEl.scrollIntoView({ inline: "nearest", block: "nearest" });
      }

      if (announce && liveRegionRef.current) {
        const text = tabEl?.textContent?.trim() ?? "";
        liveRegionRef.current.textContent = `${text} tab selected`;
      }
    },
    [items, isControlled, onValueChange, announce],
  );

  // If the controlled/external value lands on a disabled or missing tab (or the
  // items change so the current selection vanishes), fall back to the first
  // enabled tab so a panel is always shown — but never override a valid
  // controlled value.
  useEffect(() => {
    if (isControlled) {
      return;
    }
    const current = items.find((it) => it.value === internalValue);
    if (!current || current.disabled) {
      const fallback = firstEnabled ?? items[0]?.value;
      if (fallback && fallback !== internalValue) {
        setInternalValue(fallback);
      }
    }
  }, [isControlled, items, internalValue, firstEnabled]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (enabled.length === 0) {
        return;
      }
      const index = enabled.findIndex((it) => it.value === selected);
      // If focus is on a tab not in the enabled set (shouldn't happen), bail.
      if (index === -1) {
        return;
      }

      let next: TabItem | undefined;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = enabled[(index + 1) % enabled.length];
          break;
        case "ArrowLeft":
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
          return; // let Enter/Space/Tab behave natively
      }

      event.preventDefault();
      if (next) {
        activate(next.value, true);
      }
    },
    [enabled, selected, activate],
  );

  const setTabRef = useCallback(
    (v: string) => (el: HTMLButtonElement | null) => {
      if (el) {
        tabRefs.current.set(v, el);
      } else {
        tabRefs.current.delete(v);
      }
    },
    [],
  );

  const rootClassName = className ? `hisd-tabs ${className}` : "hisd-tabs";

  return (
    <div {...rest} ref={ref} className={rootClassName}>
      <div className="hisd-tabs__viewport">
        <ul
          className="hisd-tabs__list"
          role="tablist"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          onKeyDown={handleKeyDown}
        >
          {items.map((item) => {
            const isSelected = item.value === selected;
            return (
              <li key={item.value} role="presentation">
                <button
                  type="button"
                  className="hisd-tabs__tab"
                  role="tab"
                  ref={setTabRef(item.value)}
                  id={tabId(item.value)}
                  aria-controls={panelId(item.value)}
                  aria-selected={isSelected}
                  // Roving tabindex: only the selected tab is in the tab order.
                  // Disabled tabs are removed from it entirely.
                  tabIndex={isSelected && !item.disabled ? 0 : -1}
                  disabled={item.disabled}
                  onClick={() => activate(item.value, false)}
                >
                  {item.icon ? (
                    <span
                      className="hisd-tabs__icon"
                      aria-hidden="true"
                      style={
                        { "--hisd-tabs-icon": item.icon } as React.CSSProperties
                      }
                    />
                  ) : null}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {items.map((item) => (
        <div
          key={item.value}
          className="hisd-tabs__panel"
          role="tabpanel"
          id={panelId(item.value)}
          aria-labelledby={tabId(item.value)}
          tabIndex={0}
          hidden={item.value !== selected}
        >
          {item.content}
        </div>
      ))}

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
