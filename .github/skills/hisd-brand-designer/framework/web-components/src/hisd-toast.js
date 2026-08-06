/**
 * <hisd-toast> — framework-agnostic Web Component wrapping the vanilla
 * `.hisd-toast` component.
 *
 * LIGHT DOM by design: the element renders the `hisd-toast*` markup into ITSELF
 * (no shadow root) so the GLOBAL design-system CSS (assets/hisd-theme.css +
 * components/components.css → toast.css) styles it. This wrapper never
 * re-implements styling — it is a thin behaviour + markup layer that mirrors
 * components/toast.html exactly: same classes, same ARIA, same lifecycle.
 *
 * Place each <hisd-toast> inside a `.hisd-toast-region` live region (polite for
 * success/info/warning, assertive for danger) so screen readers announce it,
 * matching the demo. Behaviour ported from the demo's <script>:
 *
 *   - role="group" labelled by the title; the leading icon is decorative
 *     (aria-hidden) because the text carries the meaning; the dismiss control is
 *     an icon-only native <button> with an aria-label.
 *   - Lifecycle: success/info auto-dismiss after 5s; warning/danger persist.
 *     A toast set to leaving gets data-state="leaving" (the CSS plays the leave
 *     animation), then removes itself on `animationend` — with a timeout
 *     fallback for engines that skip `animationend` under reduced motion.
 *   - Dismiss: native <button>, so Enter/Space dispatch the click for free; we
 *     only wire that click. Focus is never trapped (toasts are non-modal).
 *
 * Reflected attributes:
 *   - variant        success | info | warning | danger (default info)
 *   - title          (string) bold title line + the group's accessible name
 *   - message        (string) supporting body copy
 *   - open           (boolean) presence = shown; removing it begins leaving
 *   - dismissible    (boolean, default true) show the dismiss button
 *   - dismiss-label  (string) aria-label for the dismiss button
 *   - auto-dismiss   "true" | "false" to override the variant default
 *   - auto-dismiss-ms (number) override the auto-dismiss delay (default 5000)
 *
 * Events:
 *   - "dismiss": bubbling CustomEvent fired AFTER the leave animation finishes
 *     (detail = { variant }). Remove the element from the DOM in this handler.
 *
 * Usage:
 *   <ol class="hisd-toast-region" role="status" aria-live="polite"
 *       aria-relevant="additions">
 *     <hisd-toast variant="success" title="Saved"
 *                 message="Your changes were saved." open></hisd-toast>
 *   </ol>
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-toast")) {
    return;
  }

  var AUTO_DISMISS_MS = 5000;
  var LEAVE_FALLBACK_MS = 400;

  // Per-variant defaults: whether the variant auto-dismisses by default.
  var AUTO_BY_VARIANT = {
    success: true,
    info: true,
    warning: false,
    danger: false,
  };

  var VARIANTS = ["success", "info", "warning", "danger"];

  class HisdToast extends HTMLElement {
    static get observedAttributes() {
      return [
        "variant",
        "title",
        "message",
        "open",
        "dismissible",
        "dismiss-label",
        "auto-dismiss",
        "auto-dismiss-ms",
      ];
    }

    constructor() {
      super();
      /** @type {HTMLSpanElement | null} */
      this._icon = null;
      /** @type {HTMLDivElement | null} */
      this._body = null;
      /** @type {HTMLParagraphElement | null} */
      this._title = null;
      /** @type {HTMLParagraphElement | null} */
      this._message = null;
      /** @type {HTMLButtonElement | null} */
      this._dismiss = null;
      this._rendered = false;
      this._leaving = false;
      /** @type {number | null} */
      this._autoTimer = null;
      /** @type {number | null} */
      this._leaveTimer = null;
      this._onDismissClick = this._onDismissClick.bind(this);
      this._onAnimationEnd = this._onAnimationEnd.bind(this);
    }

    /* ----- Reflected properties -------------------------------------------- */

    get variant() {
      var v = this.getAttribute("variant");
      return VARIANTS.indexOf(v) !== -1 ? v : "info";
    }
    set variant(val) {
      if (val == null) this.removeAttribute("variant");
      else this.setAttribute("variant", val);
    }

    get title() {
      return this.getAttribute("title");
    }
    set title(val) {
      if (val == null) this.removeAttribute("title");
      else this.setAttribute("title", val);
    }

    get message() {
      return this.getAttribute("message");
    }
    set message(val) {
      if (val == null) this.removeAttribute("message");
      else this.setAttribute("message", val);
    }

    get open() {
      return this.hasAttribute("open");
    }
    set open(val) {
      if (val) this.setAttribute("open", "");
      else this.removeAttribute("open");
    }

    get dismissible() {
      // Defaults to true unless explicitly set to "false".
      return this.getAttribute("dismissible") !== "false";
    }
    set dismissible(val) {
      this.setAttribute("dismissible", val ? "true" : "false");
    }

    /* ----- Lifecycle ------------------------------------------------------- */

    connectedCallback() {
      if (!this._rendered) {
        this._render();
        this._rendered = true;
      }
      this._sync();
      this._bind();
      // A toast is "shown" on connect unless explicitly closed; start the
      // auto-dismiss timer for auto variants, matching the demo (which appends
      // the toast and immediately schedules its dismissal).
      this._startAutoDismiss();
    }

    disconnectedCallback() {
      this._unbind();
      this._clearAutoTimer();
      this._clearLeaveTimer();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (!this._rendered || oldValue === newValue) {
        return;
      }
      if (name === "open" && newValue === null && oldValue !== null) {
        // Removing `open` begins the leave animation (controlled dismissal).
        this._beginLeaving();
        return;
      }
      this._sync();
      if (name === "auto-dismiss" || name === "auto-dismiss-ms") {
        this._restartAutoDismiss();
      }
    }

    /* ----- Rendering ------------------------------------------------------- */

    _render() {
      // Build the canonical markup into the light DOM so global CSS applies.
      this.setAttribute("role", "group");

      var icon = this.ownerDocument.createElement("span");
      icon.className = "hisd-toast__icon";
      icon.setAttribute("aria-hidden", "true");

      var body = this.ownerDocument.createElement("div");
      body.className = "hisd-toast__body";

      var title = this.ownerDocument.createElement("p");
      title.className = "hisd-toast__title";

      var message = this.ownerDocument.createElement("p");
      message.className = "hisd-toast__message";

      body.appendChild(title);
      body.appendChild(message);

      var dismiss = this.ownerDocument.createElement("button");
      dismiss.type = "button";
      dismiss.className = "hisd-toast__dismiss";
      var dismissIcon = this.ownerDocument.createElement("span");
      dismissIcon.className = "hisd-toast__dismiss-icon";
      dismissIcon.setAttribute("aria-hidden", "true");
      dismiss.appendChild(dismissIcon);

      this.appendChild(icon);
      this.appendChild(body);
      this.appendChild(dismiss);

      this._icon = icon;
      this._body = body;
      this._title = title;
      this._message = message;
      this._dismiss = dismiss;
    }

    _sync() {
      // The base + variant class go on the host element itself (it IS the
      // `<li class="hisd-toast">` in the canonical markup, but here a custom
      // element fills that role — the global CSS targets `.hisd-toast`).
      this.classList.add("hisd-toast");
      VARIANTS.forEach(function (v) {
        this.classList.toggle("hisd-toast--" + v, v === this.variant);
      }, this);

      var titleText = this.getAttribute("title");
      if (this._title) {
        if (titleText != null && titleText !== "") {
          this._title.textContent = titleText;
          this._title.hidden = false;
        } else {
          this._title.textContent = "";
          this._title.hidden = true;
        }
      }

      var messageText = this.getAttribute("message");
      if (this._message) {
        if (messageText != null && messageText !== "") {
          this._message.textContent = messageText;
          this._message.hidden = false;
        } else {
          this._message.textContent = "";
          this._message.hidden = true;
        }
      }

      // Group accessible name: prefer the title, fall back to the variant.
      var label =
        titleText && titleText !== ""
          ? titleText
          : this.variant.charAt(0).toUpperCase() + this.variant.slice(1);
      this.setAttribute("aria-label", label);

      if (this._dismiss) {
        this._dismiss.setAttribute(
          "aria-label",
          this.getAttribute("dismiss-label") || "Dismiss notification",
        );
        this._dismiss.hidden = !this.dismissible;
      }
    }

    /* ----- Auto-dismiss ---------------------------------------------------- */

    _resolveAuto() {
      var attr = this.getAttribute("auto-dismiss");
      if (attr === "true") return true;
      if (attr === "false") return false;
      return Boolean(AUTO_BY_VARIANT[this.variant]);
    }

    _resolveAutoMs() {
      var raw = parseInt(this.getAttribute("auto-dismiss-ms") || "", 10);
      return isNaN(raw) ? AUTO_DISMISS_MS : raw;
    }

    _startAutoDismiss() {
      this._clearAutoTimer();
      if (this._leaving || !this._resolveAuto()) {
        return;
      }
      var self = this;
      this._autoTimer = window.setTimeout(function () {
        self._beginLeaving();
      }, this._resolveAutoMs());
    }

    _restartAutoDismiss() {
      if (!this._leaving) {
        this._startAutoDismiss();
      }
    }

    _clearAutoTimer() {
      if (this._autoTimer != null) {
        window.clearTimeout(this._autoTimer);
        this._autoTimer = null;
      }
    }

    _clearLeaveTimer() {
      if (this._leaveTimer != null) {
        window.clearTimeout(this._leaveTimer);
        this._leaveTimer = null;
      }
    }

    /* ----- Leave + dismiss ------------------------------------------------- */

    /** Public API: begin dismissing this toast (plays the leave animation). */
    dismiss() {
      this._beginLeaving();
    }

    _beginLeaving() {
      if (this._leaving) {
        return;
      }
      this._leaving = true;
      this._clearAutoTimer();
      this.setAttribute("data-state", "leaving");

      // Remove (and fire the dismiss event) once the leave animation finishes.
      // A timeout fallback covers reduced-motion engines that skip animationend.
      this.addEventListener("animationend", this._onAnimationEnd);
      var self = this;
      this._leaveTimer = window.setTimeout(function () {
        self._finishLeaving();
      }, LEAVE_FALLBACK_MS);
    }

    _onAnimationEnd() {
      this._finishLeaving();
    }

    _finishLeaving() {
      this._clearLeaveTimer();
      this.removeEventListener("animationend", this._onAnimationEnd);
      var variant = this.variant;
      // Fire before removal so listeners can read context off the element.
      this.dispatchEvent(
        new CustomEvent("dismiss", {
          bubbles: true,
          composed: true,
          detail: { variant: variant },
        }),
      );
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    }

    /* ----- Event wiring ---------------------------------------------------- */

    _bind() {
      if (this._dismiss) {
        this._dismiss.addEventListener("click", this._onDismissClick);
      }
    }

    _unbind() {
      if (this._dismiss) {
        this._dismiss.removeEventListener("click", this._onDismissClick);
      }
      this.removeEventListener("animationend", this._onAnimationEnd);
    }

    _onDismissClick() {
      // Native <button> dispatches click for mouse, Enter, and Space.
      this._beginLeaving();
    }
  }

  customElements.define("hisd-toast", HisdToast);
})();
