/**
 * HISD Chip / Pill — typed React wrapper.
 *
 * This is a THIN behavior + markup layer over the design-system CSS. All
 * styling/theming comes from assets/hisd-theme.css + components/chip.css; this
 * component never re-implements visuals — it only applies the canonical
 * `hisd-chip` class names and the correct ARIA, and ports the demo's JS
 * behavior (aria-pressed toggle, dismiss with focus management + live-region
 * announcement) faithfully.
 *
 * Two shapes mirror the vanilla component exactly:
 *   1. Selectable / default chip  — a real <button type="button"> that toggles
 *      aria-pressed. Native buttons fire click on Enter/Space, so we only flip
 *      the attribute; the CSS keys the selected fill off [aria-pressed="true"].
 *   2. Dismissible chip           — a static <span> container (roleless, so it
 *      must NOT carry aria-pressed) holding a label plus its own labelled close
 *      <button>. Selection on a dismissible chip is exposed to assistive tech
 *      through a visually-hidden status word in the accessible name, and the
 *      soft-teal fill comes from the `hisd-chip--selected` modifier class.
 *
 * Reduced motion is honored implicitly by the CSS.
 *
 * React 18, function component, no deps beyond `react`.
 */
import * as React from "react";

/* Class-name constants — single source of truth, mirrors chip.css. */
const CHIP = "hisd-chip";
const CHIP_SELECTED = "hisd-chip--selected";
const CHIP_DISMISSIBLE = "hisd-chip--dismissible";
const CHIP_LABEL = "hisd-chip__label";
const CHIP_REMOVE = "hisd-chip__remove";
const CHIP_REMOVE_ICON = "hisd-chip__remove-icon";

/**
 * Inline visually-hidden style for the ", selected" status word baked into a
 * dismissible chip's accessible name. Mirrors the demo's `.demo-visually-hidden`
 * rule so the wrapper carries no CSS dependency of its own.
 */
const VISUALLY_HIDDEN: React.CSSProperties = {
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

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Shared props                                                               */
/* -------------------------------------------------------------------------- */

interface ChipCommonProps {
  /** Visible chip text / content. */
  children?: React.ReactNode;
  /** Extra class names appended after the canonical hisd-chip classes. */
  className?: string;
  /**
   * Selection state. On the selectable (button) chip this drives
   * aria-pressed; on the dismissible chip it adds the --selected fill class
   * and a visually-hidden ", selected" word to the accessible name.
   */
  selected?: boolean;
  /** Disabled state (renders `disabled` on a button, `aria-disabled` otherwise). */
  disabled?: boolean;
  /** Optional opaque value forwarded to selection/dismiss callbacks. */
  value?: string;
}

/* -------------------------------------------------------------------------- */
/* Selectable / default chip (real <button>)                                  */
/* -------------------------------------------------------------------------- */

export interface ChipProps
  extends ChipCommonProps,
    Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      "value" | "onSelect" | "children" | "className"
    > {
  dismissible?: false;
  /**
   * When provided, the chip is selectable: each activation toggles
   * aria-pressed and reports the next selected state. Omit for a plain,
   * non-toggling chip button.
   */
  onSelectedChange?: (selected: boolean, value: string | undefined) => void;
}

/* -------------------------------------------------------------------------- */
/* Dismissible chip (static container + close button)                         */
/* -------------------------------------------------------------------------- */

export interface DismissibleChipProps
  extends ChipCommonProps,
    Omit<
      React.HTMLAttributes<HTMLSpanElement>,
      "onSelect" | "children" | "className"
    > {
  dismissible: true;
  /**
   * Accessible text for the close button. Defaults to "Remove {children}"
   * when children is a plain string. Provide explicitly otherwise.
   */
  removeLabel?: string;
  /** Called when the user activates the close button. */
  onDismiss?: (value: string | undefined) => void;
  /** Forwarded to the close button. */
  removeButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export type AnyChipProps = ChipProps | DismissibleChipProps;

function isDismissible(props: AnyChipProps): props is DismissibleChipProps {
  return props.dismissible === true;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `Chip` renders either the selectable button chip (default) or, when
 * `dismissible` is set, the static container + close-button chip. The two
 * branches are typed as a discriminated union on `dismissible`.
 */
export const Chip = React.forwardRef<
  HTMLButtonElement | HTMLSpanElement,
  AnyChipProps
>(function Chip(props, ref) {
  if (isDismissible(props)) {
    return (
      <DismissibleChip
        {...props}
        forwardedRef={ref as React.ForwardedRef<HTMLSpanElement>}
      />
    );
  }
  return (
    <SelectableChip
      {...props}
      forwardedRef={ref as React.ForwardedRef<HTMLButtonElement>}
    />
  );
});

/* --- Selectable / default ------------------------------------------------- */

function SelectableChip(
  props: ChipProps & { forwardedRef: React.ForwardedRef<HTMLButtonElement> }
) {
  const {
    children,
    className,
    selected,
    disabled = false,
    value,
    onSelectedChange,
    onClick,
    forwardedRef,
    dismissible: _dismissible,
    ...rest
  } = props;

  // Is this chip a selectable toggle? It is whenever selection is wired up
  // (either a controlled `selected` value or an `onSelectedChange` handler).
  const selectable = selected !== undefined || onSelectedChange !== undefined;

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (disabled || event.defaultPrevented) return;
    if (selectable) {
      // Mirror the vanilla demo: a native <button> already fires click on
      // Enter/Space, so we only flip the pressed state.
      onSelectedChange?.(!selected, value);
    }
  };

  return (
    <button
      {...rest}
      ref={forwardedRef}
      type={rest.type ?? "button"}
      className={joinClasses(CHIP, className)}
      // aria-pressed is the selection signal for the button chip; only emit it
      // when the chip is actually a toggle, so plain action chips stay roleless.
      aria-pressed={selectable ? (selected ? "true" : "false") : undefined}
      disabled={disabled}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}

/* --- Dismissible ---------------------------------------------------------- */

/** Module-scoped polite live region, created lazily — mirrors #chip-live. */
function announce(message: string): void {
  if (typeof document === "undefined") return;
  let live = document.getElementById("hisd-chip-live");
  if (!live) {
    live = document.createElement("div");
    live.id = "hisd-chip-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    // Inline visually-hidden so the wrapper needs no extra CSS.
    Object.assign(live.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      whiteSpace: "nowrap",
      border: "0",
    } satisfies Partial<CSSStyleDeclaration> as Partial<CSSStyleDeclaration>);
    document.body.appendChild(live);
  }
  live.textContent = message;
}

function DismissibleChip(
  props: DismissibleChipProps & {
    forwardedRef: React.ForwardedRef<HTMLSpanElement>;
  }
) {
  const {
    children,
    className,
    selected = false,
    disabled = false,
    value,
    removeLabel,
    onDismiss,
    removeButtonProps,
    forwardedRef,
    dismissible: _dismissible,
    ...rest
  } = props;

  const removeRef = React.useRef<HTMLButtonElement | null>(null);

  // Derive a sensible default close-button label when the content is a string.
  const textChild = typeof children === "string" ? children : undefined;
  const ariaLabel =
    removeLabel ?? (textChild ? `Remove ${textChild}` : "Remove chip");
  const dismissValue = value ?? textChild;

  const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    removeButtonProps?.onClick?.(event);
    if (disabled || event.defaultPrevented) return;

    // Match the vanilla demo's focus-management contract: move focus to the
    // next/previous chip before the node is unmounted, then announce removal.
    const btn = removeRef.current;
    const listItem =
      btn?.closest("li") ?? (btn?.closest(`.${CHIP}`) as HTMLElement | null);
    if (listItem) {
      const sibling =
        (listItem.nextElementSibling as HTMLElement | null) ??
        (listItem.previousElementSibling as HTMLElement | null);
      const focusTarget =
        sibling?.querySelector<HTMLElement>(`.${CHIP_REMOVE}, .${CHIP}`) ??
        sibling ??
        (listItem.closest<HTMLElement>("[data-chip-list]") ?? null);
      if (focusTarget) {
        if (!focusTarget.matches(`.${CHIP_REMOVE}, .${CHIP}, [tabindex]`)) {
          focusTarget.setAttribute("tabindex", "-1");
        }
        focusTarget.focus();
      }
    }

    const labelText = ariaLabel.replace(/^Remove\s+/i, "");
    announce(`${labelText} removed`);
    onDismiss?.(dismissValue);
  };

  return (
    <span
      {...rest}
      ref={forwardedRef}
      className={joinClasses(
        CHIP,
        CHIP_DISMISSIBLE,
        selected && CHIP_SELECTED,
        className
      )}
      aria-disabled={disabled ? "true" : undefined}
    >
      <span className={CHIP_LABEL}>
        {children}
        {/* Selection on a roleless container is exposed via a hidden status
            word in the accessible name — aria-pressed is invalid here. */}
        {selected ? <span style={VISUALLY_HIDDEN}>, selected</span> : null}
      </span>
      <button
        {...removeButtonProps}
        ref={removeRef}
        type="button"
        className={joinClasses(CHIP_REMOVE, removeButtonProps?.className)}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleRemoveClick}
      >
        <span className={CHIP_REMOVE_ICON} aria-hidden="true" />
      </button>
    </span>
  );
}

export default Chip;
