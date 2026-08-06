/**
 * <hisd-modal> — framework-agnostic Web Component wrapping the vanilla
 * `.hisd-modal` / overlay component.
 *
 * LIGHT DOM by design: the element renders its markup into itself (no shadow
 * root) so the GLOBAL design-system CSS (assets/hisd-theme.css +
 * components/components.css, which includes components/modal.css) styles it.
 * This component never re-implements styling — it only renders the canonical
 * `.hisd-modal` dialog markup, applies the correct ARIA, and wires the same
 * focus-trap + Escape + return-focus + backdrop behaviour as the React version
 * and the demo's <script>, including the transition-end-deferred hide.
 *
 * It mirrors the WAI-ARIA APG "Dialog (Modal)" contract:
 *   - Root role="dialog" (non-destructive) or role="alertdialog" (destructive),
 *     aria-modal="true", aria-labelledby -> title, aria-describedby -> body.
 *   - On open: reveal, capture the previously-focused element, move focus into
 *     the panel (tabindex="-1"), announce.
 *   - Focus trap: Tab / Shift+Tab cycle the dialog's focusable descendants only.
 *   - Escape closes NON-destructive dialogs; destructive ones ignore Escape AND
 *     backdrop clicks and require an explicit footer button.
 *   - On close: animate via .is-closing, wait for the panel transition (or fire
 *     immediately under prefers-reduced-motion), hide, return focus to the
 *     trigger.
 *
 * Reflected attributes:
 *   - open         (boolean) <-> .open ; opening/closing drives the animation.
 *   - destructive  (boolean) <-> .destructive ; alertdialog + ignores Escape/backdrop.
 *   - title        (string)  -> the dialog heading text.
 *   - describedby  (string)  -> overrides the generated aria-describedby (optional).
 *   - close-label  (string)  -> aria-label for the header dismiss button.
 *   - value        (string)  -> reflected for caller-side identification.
 *
 * Content + actions:
 *   - Default light-DOM children authored inside <hisd-modal> are moved into the
 *     `.hisd-modal__body`. Footer actions are declared with
 *     <button slot="action" data-variant="action|secondary|danger"
 *             data-confirm> ... </button> children; they are relocated into the
 *     `.hisd-modal__footer`. A button WITHOUT data-confirm closes with reason
 *     "close"; WITH data-confirm it closes with reason "confirm" (unless it
 *     carries data-keep-open).
 *
 * Methods:
 *   - .show() / .hide()  — convenience wrappers for `open = true/false`.
 *
 * Events (bubbling, cancelable where noted):
 *   - "hisd-open"   detail: {} — fired after the dialog is shown.
 *   - "hisd-close"  detail: { reason } — reason is "escape" | "backdrop" |
 *                   "close" | "confirm". Cancelable: preventDefault() keeps it
 *                   open (useful for async validation on a confirm action).
 *
 * Usage:
 *   <hisd-modal title="Edit student profile">
 *     <p>Update the contact details on file for this student.</p>
 *     <button slot="action" data-variant="secondary">Cancel</button>
 *     <button slot="action" data-variant="action" data-confirm>Save changes</button>
 *   </hisd-modal>
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) return;
  if (customElements.get("hisd-modal")) return;

  var FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  var uid = 0;

  function reducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  class HISDModal extends HTMLElement {
    static get observedAttributes() {
      return ["open", "destructive", "title", "describedby", "close-label", "value"];
    }

    constructor() {
      super();
      this._built = false;
      /** @type {HTMLElement | null} */
      this._dialog = null; // the .hisd-modal root we render
      /** @type {HTMLElement | null} */
      this._panel = null;
      /** @type {HTMLElement | null} */
      this._titleEl = null;
      /** @type {HTMLElement | null} */
      this._titleText = null;
      /** @type {HTMLElement | null} */
      this._body = null;
      /** @type {HTMLElement | null} */
      this._footer = null;
      /** @type {HTMLButtonElement | null} */
      this._close = null;
      /** @type {HTMLElement | null} */
      this._live = null;
      /** @type {HTMLElement | null} */
      this._returnTarget = null;
      this._id = "hisd-modal-" + ++uid;
      this._closing = false;

      this._onKeyDown = this._onKeyDown.bind(this);
      this._onOverlayMouseDown = this._onOverlayMouseDown.bind(this);
      this._onCloseClick = this._onCloseClick.bind(this);
      this._onFooterClick = this._onFooterClick.bind(this);
    }

    /* ----- Reflected properties ------------------------------------------- */

    get open() {
      return this.hasAttribute("open");
    }
    set open(val) {
      if (val) this.setAttribute("open", "");
      else this.removeAttribute("open");
    }

    get destructive() {
      return this.hasAttribute("destructive");
    }
    set destructive(val) {
      if (val) this.setAttribute("destructive", "");
      else this.removeAttribute("destructive");
    }

    get title() {
      return this.getAttribute("title");
    }
    set title(val) {
      if (val == null) this.removeAttribute("title");
      else this.setAttribute("title", val);
    }

    get value() {
      return this.getAttribute("value");
    }
    set value(val) {
      if (val == null) this.removeAttribute("value");
      else this.setAttribute("value", val);
    }

    show() {
      this.open = true;
    }
    hide() {
      this.open = false;
    }

    /* ----- Lifecycle ------------------------------------------------------- */

    connectedCallback() {
      if (!this._built) this._build();
      this._sync();
      this._dialog.addEventListener("mousedown", this._onOverlayMouseDown);
      if (this._close) this._close.addEventListener("click", this._onCloseClick);
      this._footer.addEventListener("click", this._onFooterClick);
      // If authored with [open] already present, reveal on connect.
      if (this.open) this._openNow();
    }

    disconnectedCallback() {
      if (this._dialog) {
        this._dialog.removeEventListener("mousedown", this._onOverlayMouseDown);
      }
      if (this._close) {
        this._close.removeEventListener("click", this._onCloseClick);
      }
      if (this._footer) {
        this._footer.removeEventListener("click", this._onFooterClick);
      }
      document.removeEventListener("keydown", this._onKeyDown);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (!this._built) return;
      if (name === "open") {
        if (newValue !== null) this._openNow();
        else this._closeNow("close");
        return;
      }
      this._sync();
    }

    /* ----- Build (one-time markup) ---------------------------------------- */

    _build() {
      var doc = this.ownerDocument;

      // Collect authored content BEFORE we wipe and re-render. Footer actions
      // are children with slot="action"; everything else is body content.
      var actions = [];
      var bodyNodes = [];
      Array.prototype.forEach.call(this.childNodes, function (node) {
        if (
          node.nodeType === 1 &&
          node.getAttribute &&
          node.getAttribute("slot") === "action"
        ) {
          actions.push(node);
        } else {
          bodyNodes.push(node);
        }
      });

      // Clear the host; we render the canonical structure into the light DOM.
      this.textContent = "";

      var dialog = doc.createElement("div");
      dialog.className = "hisd-modal";
      dialog.id = this._id;
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", this._id + "-title");
      dialog.hidden = true;

      var panel = doc.createElement("div");
      panel.className = "hisd-modal__panel";
      panel.setAttribute("tabindex", "-1");

      var header = doc.createElement("header");
      header.className = "hisd-modal__header";

      var titleEl = doc.createElement("h2");
      titleEl.className = "hisd-modal__title";
      titleEl.id = this._id + "-title";

      // Title text lives in its own span so the destructive glyph can sit beside
      // it without disturbing the text node (matches the canonical markup).
      var titleIcon = doc.createElement("span");
      titleIcon.className = "hisd-modal__title-icon";
      titleIcon.setAttribute("aria-hidden", "true");
      var titleText = doc.createElement("span");
      titleText.className = "hisd-modal__title-text";
      titleEl.appendChild(titleIcon);
      titleEl.appendChild(titleText);

      var closeBtn = doc.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "hisd-modal__close";
      closeBtn.setAttribute("aria-label", this.getAttribute("close-label") || "Close dialog");
      var closeIcon = doc.createElement("span");
      closeIcon.className = "hisd-modal__close-icon";
      closeIcon.setAttribute("aria-hidden", "true");
      closeBtn.appendChild(closeIcon);

      header.appendChild(titleEl);
      header.appendChild(closeBtn);

      var body = doc.createElement("div");
      body.className = "hisd-modal__body";
      body.id = this._id + "-desc";
      bodyNodes.forEach(function (node) {
        body.appendChild(node);
      });

      var footer = doc.createElement("footer");
      footer.className = "hisd-modal__footer";
      actions.forEach(function (btn) {
        var variant = btn.getAttribute("data-variant") || "secondary";
        btn.classList.add("hisd-modal__btn", "hisd-modal__btn--" + variant);
        btn.removeAttribute("slot");
        if (!btn.getAttribute("type")) btn.type = "button";
        footer.appendChild(btn);
      });

      panel.appendChild(header);
      panel.appendChild(body);
      panel.appendChild(footer);
      dialog.appendChild(panel);

      var live = doc.createElement("span");
      live.setAttribute("role", "status");
      live.setAttribute("aria-live", "polite");
      // Inline visually-hidden so no extra CSS is required.
      live.style.cssText =
        "position:absolute;inline-size:1px;block-size:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";

      this.appendChild(dialog);
      this.appendChild(live);

      this._dialog = dialog;
      this._panel = panel;
      this._titleEl = titleEl;
      this._titleText = titleText;
      this._body = body;
      this._footer = footer;
      this._close = closeBtn;
      this._live = live;
      this._built = true;
    }

    /* ----- Sync (attributes -> markup/ARIA) ------------------------------- */

    _sync() {
      if (!this._dialog) return;

      // Destructive variant: class + role + ignore-Escape/backdrop signalling.
      if (this.destructive) {
        this._dialog.classList.add("hisd-modal--destructive");
        this._dialog.setAttribute("role", "alertdialog");
        this._dialog.setAttribute("data-modal-destructive", "");
        // Destructive dialogs hide the header dismiss button by contract.
        this._close.hidden = true;
      } else {
        this._dialog.classList.remove("hisd-modal--destructive");
        this._dialog.setAttribute("role", "dialog");
        this._dialog.removeAttribute("data-modal-destructive");
        this._close.hidden = false;
      }

      // aria-describedby: caller override, else the generated body id.
      var describedby = this.getAttribute("describedby");
      this._dialog.setAttribute("aria-describedby", describedby || this._id + "-desc");

      // Title text.
      this._titleText.textContent = this.getAttribute("title") || "";

      // Close label.
      this._close.setAttribute(
        "aria-label",
        this.getAttribute("close-label") || "Close dialog",
      );
    }

    _isDestructive() {
      return this.destructive;
    }

    /* ----- Open / Close --------------------------------------------------- */

    _openNow() {
      if (!this._dialog) return;
      if (!this._dialog.hidden && this._dialog.classList.contains("is-open")) {
        return; // already open
      }
      this._closing = false;
      this._sync();

      this._returnTarget = document.activeElement;

      this._dialog.hidden = false;
      this._dialog.classList.remove("is-closing");
      // Force a reflow so the .is-open transition runs from the start state.
      void this._dialog.offsetHeight;
      this._dialog.classList.add("is-open");

      // Land focus on the panel (or the first focusable control as a fallback).
      var first = this._focusableIn()[0];
      if (this._panel) this._panel.focus();
      else if (first) first.focus();

      document.addEventListener("keydown", this._onKeyDown);

      var name = (this.getAttribute("title") || "").trim();
      this._announce(name ? name + " dialog opened" : "Dialog opened");

      this.dispatchEvent(
        new CustomEvent("hisd-open", { bubbles: true, detail: {} }),
      );
    }

    _closeNow(reason) {
      if (!this._dialog) return;
      if (this._dialog.hidden || this._closing) {
        return; // already closed / closing
      }

      // Let listeners cancel the close (e.g. async confirm validation).
      var evt = new CustomEvent("hisd-close", {
        bubbles: true,
        cancelable: true,
        detail: { reason: reason || "close" },
      });
      var proceed = this.dispatchEvent(evt);
      if (!proceed) {
        // Cancelled — re-assert open state so the attribute reflects reality.
        if (!this.open) this.setAttribute("open", "");
        return;
      }

      this._closing = true;
      this._dialog.classList.remove("is-open");
      this._dialog.classList.add("is-closing");
      this._announce(
        reason === "confirm" ? "Action confirmed" : "Dialog dismissed",
      );
      document.removeEventListener("keydown", this._onKeyDown);

      var self = this;
      if (reducedMotion()) {
        self._finishClose();
        return;
      }
      var panel = this._panel;
      var done = false;
      function onEnd() {
        if (done) return;
        done = true;
        if (panel) panel.removeEventListener("transitionend", onEnd);
        self._finishClose();
      }
      if (panel) {
        panel.addEventListener("transitionend", onEnd);
        // Safety net if transitionend never fires (e.g. zero-duration tokens).
        window.setTimeout(onEnd, 400);
      } else {
        self._finishClose();
      }
    }

    _finishClose() {
      this._closing = false;
      if (this._dialog) {
        this._dialog.hidden = true;
        this._dialog.classList.remove("is-closing");
      }
      // Reflect closed state on the host without re-entering _closeNow.
      if (this.hasAttribute("open")) this.removeAttribute("open");
      var target = this._returnTarget;
      if (target && typeof target.focus === "function") {
        target.focus();
      }
      this._returnTarget = null;
    }

    /* ----- Event handlers -------------------------------------------------- */

    _onCloseClick() {
      this._requestClose("close");
    }

    _onFooterClick(event) {
      var btn = event.target.closest("button");
      if (!btn || !this._footer.contains(btn) || btn.disabled) return;
      if (btn.hasAttribute("data-keep-open")) return; // caller manages closing
      var reason = btn.hasAttribute("data-confirm") ? "confirm" : "close";
      this._requestClose(reason);
    }

    _onOverlayMouseDown(event) {
      // Backdrop press closes NON-destructive dialogs only, and only when the
      // press lands on the overlay itself (not bubbled from the panel).
      if (event.target === this._dialog && !this._isDestructive()) {
        this._requestClose("backdrop");
      }
    }

    _onKeyDown(event) {
      if (this._dialog.hidden) return;

      if (event.key === "Escape") {
        // Escape dismisses NON-destructive dialogs only (contract).
        if (!this._isDestructive()) {
          event.preventDefault();
          this._requestClose("escape");
        }
        return;
      }

      if (event.key !== "Tab") return;

      var items = this._focusableIn();
      if (items.length === 0) {
        event.preventDefault();
        if (this._panel) this._panel.focus();
        return;
      }

      var first = items[0];
      var last = items[items.length - 1];
      var current = document.activeElement;
      var onPanel = current === this._panel;

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

    /* ----- Helpers --------------------------------------------------------- */

    // Single entry point for all close paths: runs the animated close (which
    // dispatches the cancelable hisd-close and ultimately clears [open]).
    _requestClose(reason) {
      this._closeNow(reason);
    }

    _focusableIn() {
      if (!this._dialog) return [];
      return Array.prototype.filter.call(
        this._dialog.querySelectorAll(FOCUSABLE),
        function (el) {
          return (
            el.offsetWidth > 0 ||
            el.offsetHeight > 0 ||
            el === document.activeElement
          );
        },
      );
    }

    _announce(msg) {
      if (this._live) this._live.textContent = msg;
    }
  }

  customElements.define("hisd-modal", HISDModal);
})();
