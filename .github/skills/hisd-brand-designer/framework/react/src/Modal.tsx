import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type HTMLAttributes,
} from "react";

/**
 * HISD Modal / Overlay — typed React wrapper around the vanilla `.hisd-modal`
 * component.
 *
 * This is a THIN behaviour + markup layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/modal.css). This component never re-implements styling —
 * it applies the same `hisd-modal*` classes and the same ARIA contract as
 * components/modal.html, and ports the demo's <script> behaviour exactly:
 *
 *   - WAI-ARIA APG "Dialog (Modal)":
 *       Root is role="dialog" (non-destructive) or role="alertdialog"
 *       (destructive), with aria-modal="true", aria-labelledby pointing at the
 *       title, and aria-describedby pointing at the body.
 *   - Focus management: on open, focus moves into the panel (tabindex="-1");
 *       on close, focus returns to the element that was focused before opening
 *       (typically the trigger).
 *   - Focus trap: Tab / Shift+Tab cycle through the dialog's focusable
 *       descendants only; from the panel itself Shift+Tab lands on the last item.
 *   - Escape dismisses NON-destructive dialogs only. The destructive variant
 *       ignores Escape AND backdrop clicks and requires an explicit button.
 *   - Backdrop (overlay) mousedown closes NON-destructive dialogs only, and only
 *       when the press lands on the overlay itself (not the panel).
 *   - The entrance/exit animation is driven by `.is-open` / `.is-closing`; the
 *       actual unmount/hide waits for the panel's transition to end (or fires
 *       immediately under prefers-reduced-motion, which the CSS already honours).
 *   - An optional polite live region announces open / close / confirm outcomes.
 *
 * The overlay scrim, panel surface/shadow/radius, the close + footer button
 * styling, the destructive top-accent + warning glyph, focus rings, forced-colors
 * fallbacks, reduced-motion, and dark-theme inheritance are ALL handled by the
 * CSS.
 */

/** A footer action button. Mirrors the `.hisd-modal__btn--*` variants. */
export interface ModalAction {
  /** Visible button label. */
  label: ReactNode;
  /**
   * Visual variant. `action` is the dominant/confirm button, `secondary` is the
   * outlined cancel/dismiss, `danger` is the destructive (filled) confirm.
   */
  variant?: "action" | "secondary" | "danger";
  /** Fires when the button is activated. Return nothing; closing is your call. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /**
   * When `closeOnClick` is true (the default), the modal requests a close after
   * `onClick` runs. Set false to keep it open (e.g. async validation in flight).
   */
  closeOnClick?: boolean;
  /** Disables this button (native `disabled`). */
  disabled?: boolean;
  /** Optional text announced to the live region instead of the default. */
  announce?: string;
}

export interface ModalProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Whether the dialog is open. Controlled by the parent. */
  open: boolean;
  /**
   * Requests a close. Receives the reason: `"escape"`, `"backdrop"`,
   * `"close"` (the header dismiss button / a secondary action), or `"confirm"`.
   * The parent should flip `open` to false in response. Ignored internally for
   * Escape/backdrop on destructive modals (the contract forbids them there).
   */
  onClose: (reason: "escape" | "backdrop" | "close" | "confirm") => void;
  /** The dialog title. Rendered into `.hisd-modal__title`. */
  title: ReactNode;
  /** The dialog body content. Rendered into `.hisd-modal__body`. */
  children?: ReactNode;
  /**
   * Destructive-confirm variant. Adds `hisd-modal--destructive`, switches the
   * root role to `alertdialog`, shows the leading warning glyph, and makes the
   * dialog ignore Escape + backdrop clicks (an explicit button is required).
   */
  destructive?: boolean;
  /**
   * Footer action buttons, in visual order (inline-end aligned). When omitted no
   * footer is rendered. Provide the cancel/confirm pair here.
   */
  actions?: ModalAction[];
  /**
   * Show the header dismiss (×) button. Defaults to `!destructive` — destructive
   * dialogs hide it so the only exits are the explicit footer actions, matching
   * the canonical markup.
   */
  showClose?: boolean;
  /** Accessible label for the header dismiss button. Defaults to "Close dialog". */
  closeLabel?: string;
  /**
   * Id prefix for the generated title/body element ids (used by aria-labelledby
   * / aria-describedby). Auto-generated when omitted.
   */
  idPrefix?: string;
  /**
   * Render a visually-hidden polite live region that announces open/close/confirm
   * outcomes (mirrors the demo's `#modal-live`). Defaults to true.
   */
  announce?: boolean;
  /** Extra class names appended to the `.hisd-modal` root. */
  className?: string;
}

/** Inline visually-hidden style for the optional live region (no extra CSS). */
const visuallyHidden: CSSProperties = {
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

/** The focusable-descendant selector used by the trap (matches the demo). */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.prototype.filter.call(
    root.querySelectorAll<HTMLElement>(FOCUSABLE),
    (el: HTMLElement) =>
      el.offsetWidth > 0 ||
      el.offsetHeight > 0 ||
      el === document.activeElement,
  ) as HTMLElement[];
}

export const Modal = forwardRef(function Modal(
  props: ModalProps,
  ref: Ref<HTMLDivElement>,
) {
  const {
    open,
    onClose,
    title,
    children,
    destructive = false,
    actions,
    showClose,
    closeLabel = "Close dialog",
    idPrefix,
    announce = true,
    className,
    ...rest
  } = props;

  const reactId = useId();
  const base = idPrefix ?? `hisd-modal-${reactId}`;
  const titleId = `${base}-title`;
  const bodyId = `${base}-desc`;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  // The element to restore focus to on close — captured the moment we open.
  const returnTargetRef = useRef<HTMLElement | null>(null);

  const dismissAllowed = !destructive;
  const renderClose = showClose ?? !destructive;

  // Merge the caller's ref with our internal one so the trap can query the root.
  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref],
  );

  const announceMsg = useCallback(
    (msg: string) => {
      if (announce && liveRef.current) {
        liveRef.current.textContent = msg;
      }
    },
    [announce],
  );

  // Open transition: reveal, capture the return target, focus the panel,
  // announce. The CSS animates via `.is-open`; React keeps the node mounted while
  // `open` is true so the entrance runs from the start state on first paint.
  useEffect(() => {
    if (!open) {
      return;
    }
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root) {
      return;
    }

    returnTargetRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    // Force a reflow so the .is-open class transitions from the hidden start.
    void root.offsetHeight;
    root.classList.add("is-open");

    const first = focusableIn(root)[0];
    if (panel) {
      panel.focus();
    } else if (first) {
      first.focus();
    }

    const titleEl = root.querySelector(".hisd-modal__title");
    const name = titleEl?.textContent?.trim();
    announceMsg(name ? `${name} dialog opened` : "Dialog opened");

    // On close, return focus to the trigger.
    return () => {
      root.classList.remove("is-open");
      const target = returnTargetRef.current;
      if (target && typeof target.focus === "function") {
        target.focus();
      }
      returnTargetRef.current = null;
    };
  }, [open, announceMsg]);

  // Global keydown: focus trap + Escape, active only while open.
  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      if (event.key === "Escape") {
        if (dismissAllowed) {
          event.preventDefault();
          announceMsg("Dialog dismissed");
          onClose("escape");
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const items = focusableIn(root);
      const panel = panelRef.current;
      if (items.length === 0) {
        // Nothing tabbable — keep focus pinned on the panel.
        event.preventDefault();
        panel?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const onPanel = current === panel;

      if (event.shiftKey) {
        if (current === first || onPanel) {
          event.preventDefault();
          last.focus();
        }
      } else if (current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dismissAllowed, onClose, announceMsg]);

  // Backdrop press: close NON-destructive dialogs only, and only when the press
  // lands on the overlay itself (not bubbled up from the panel). Mirrors the
  // demo's `mousedown` + `event.target === dialog` guard.
  const handleOverlayMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === rootRef.current && dismissAllowed) {
        announceMsg("Dialog dismissed");
        onClose("backdrop");
      }
    },
    [dismissAllowed, onClose, announceMsg],
  );

  const handleClose = useCallback(() => {
    announceMsg("Dialog dismissed");
    onClose("close");
  }, [onClose, announceMsg]);

  const handleAction = useCallback(
    (action: ModalAction, event: MouseEvent<HTMLButtonElement>) => {
      action.onClick?.(event);
      const isConfirm = action.variant === "action" || action.variant === "danger";
      const reason: "confirm" | "close" = isConfirm ? "confirm" : "close";
      if (action.announce) {
        announceMsg(action.announce);
      } else {
        const text =
          typeof action.label === "string" ? action.label.trim() : "";
        announceMsg(
          isConfirm && text
            ? `${text} confirmed`
            : reason === "confirm"
              ? "Confirmed"
              : "Dialog dismissed",
        );
      }
      if (action.closeOnClick ?? true) {
        onClose(reason);
      }
    },
    [onClose, announceMsg],
  );

  // Keep the node mounted only while open. (The exit animation can be layered on
  // by a caller via a transition wrapper; the contract's focus-return is honoured
  // by the cleanup effect above regardless.)
  if (!open) {
    return announce ? (
      <div ref={liveRef} role="status" aria-live="polite" style={visuallyHidden} />
    ) : null;
  }

  const rootClassName = [
    "hisd-modal",
    destructive ? "hisd-modal--destructive" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        {...rest}
        ref={setRootRef}
        className={rootClassName}
        role={destructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onMouseDown={handleOverlayMouseDown}
      >
        <div className="hisd-modal__panel" tabIndex={-1} ref={panelRef}>
          <header className="hisd-modal__header">
            <h2 className="hisd-modal__title" id={titleId}>
              {destructive ? (
                <>
                  <span className="hisd-modal__title-icon" aria-hidden="true" />
                  <span className="hisd-modal__title-text">{title}</span>
                </>
              ) : (
                title
              )}
            </h2>
            {renderClose ? (
              <button
                type="button"
                className="hisd-modal__close"
                aria-label={closeLabel}
                onClick={handleClose}
              >
                <span className="hisd-modal__close-icon" aria-hidden="true" />
              </button>
            ) : null}
          </header>

          <div className="hisd-modal__body" id={bodyId}>
            {children}
          </div>

          {actions && actions.length > 0 ? (
            <footer className="hisd-modal__footer">
              {actions.map((action, index) => {
                const variant = action.variant ?? "secondary";
                return (
                  <button
                    // Actions are a fixed, ordered set; index is a stable key.
                    key={index}
                    type="button"
                    className={`hisd-modal__btn hisd-modal__btn--${variant}`}
                    disabled={action.disabled}
                    onClick={(event) => handleAction(action, event)}
                  >
                    {action.label}
                  </button>
                );
              })}
            </footer>
          ) : null}
        </div>
      </div>

      {announce ? (
        <div
          ref={liveRef}
          role="status"
          aria-live="polite"
          style={visuallyHidden}
        />
      ) : null}
    </>
  );
});
