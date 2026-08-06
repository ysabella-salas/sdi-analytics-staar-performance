/**
 * <hisd-tooltip> — framework-agnostic Web Component wrapping the vanilla
 * `.hisd-tooltip` component.
 *
 * LIGHT DOM by design: the element renders the `hisd-tooltip*` markup into
 * ITSELF (no shadow root) so the GLOBAL design-system CSS (assets/hisd-theme.css
 * + components/components.css → tooltip.css) styles it. This wrapper never
 * re-implements styling — it is a thin behaviour + markup layer that mirrors
 * components/tooltip.html exactly: same classes, same ARIA, same behaviour.
 *
 * The host element IS the `.hisd-tooltip` wrapper. Inside it the component
 * renders the focusable trigger `<button class="hisd-tooltip__trigger">` and the
 * `role="tooltip"` bubble, wired together via `aria-describedby`.
 *
 * Behaviour ported from the demo's <script> (WAI-ARIA APG "Tooltip"):
 *   - Show on `mouseenter` / `focus` after a 300ms enter delay; hide
 *     immediately on `mouseleave` / `blur`. The explicit `[data-visible]`
 *     attribute drives the visible state (the CSS still covers plain hover /
 *     focus-within as a no-JS fallback).
 *   - Escape dismisses WITHOUT moving focus; a "dismissed" guard then suppresses
 *     re-showing until focus leaves the trigger and returns.
 *   - The tooltip is NEVER the sole label: an icon-only trigger must carry a
 *     `label` attribute (applied as the trigger's `aria-label`).
 *
 * Reflected attributes:
 *   - content        (string)  the tooltip text (bubble contents). REQUIRED.
 *   - label          (string)  trigger accessible name (aria-label). REQUIRED
 *                              for icon-only triggers.
 *   - text           (string)  visible trigger text (text triggers). The icon,
 *                              if any, is supplied via the `icon` slot below.
 *   - placement      top | bottom | start | end (default top)
 *   - icon-only      (boolean) square icon-only trigger styling
 *   - enter-delay-ms (number)  override the enter delay (default 300)
 *
 * Slotted icon (light DOM): place an element with `slot="icon"` as a child
 * BEFORE upgrade to use a custom SVG icon inside the trigger, e.g.
 *   <hisd-tooltip content="Help" label="Help" icon-only>
 *     <svg slot="icon" class="hisd-tooltip__icon" viewBox="0 0 24 24"
 *          aria-hidden="true" focusable="false">…</svg>
 *   </hisd-tooltip>
 *
 * Usage:
 *   <hisd-tooltip text="Sync roster"
 *                 content="Pulls the latest enrollment from PowerSchool">
 *   </hisd-tooltip>
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-tooltip")) {
    return;
  }

  var ENTER_DELAY_MS = 300;
  var PLACEMENTS = ["top", "bottom", "start", "end"];

  class HisdTooltip extends HTMLElement {
    static get observedAttributes() {
      return [
        "content",
        "label",
        "text",
        "placement",
        "icon-only",
        "enter-delay-ms",
      ];
    }

    constructor() {
      super();
      /** @type {HTMLButtonElement | null} */
      this._trigger = null;
      /** @type {HTMLSpanElement | null} */
      this._bubble = null;
      /** @type {Element | null} */
      this._slottedIcon = null;
      this._rendered = false;
      /** @type {number | null} */
      this._timer = null;
      this._dismissed = false; // Escape pressed; suppress until blur
      this._onMouseEnter = this._onMouseEnter.bind(this);
      this._onMouseLeave = this._onMouseLeave.bind(this);
      this._onFocus = this._onFocus.bind(this);
      this._onBlur = this._onBlur.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    /* ----- Reflected properties -------------------------------------------- */

    get content() {
      return this.getAttribute("content");
    }
    set content(val) {
      if (val == null) this.removeAttribute("content");
      else this.setAttribute("content", val);
    }

    get label() {
      return this.getAttribute("label");
    }
    set label(val) {
      if (val == null) this.removeAttribute("label");
      else this.setAttribute("label", val);
    }

    get text() {
      return this.getAttribute("text");
    }
    set text(val) {
      if (val == null) this.removeAttribute("text");
      else this.setAttribute("text", val);
    }

    get placement() {
      var p = this.getAttribute("placement");
      return PLACEMENTS.indexOf(p) !== -1 ? p : "top";
    }
    set placement(val) {
      if (val == null) this.removeAttribute("placement");
      else this.setAttribute("placement", val);
    }

    get iconOnly() {
      return this.hasAttribute("icon-only");
    }
    set iconOnly(val) {
      if (val) this.setAttribute("icon-only", "");
      else this.removeAttribute("icon-only");
    }

    get enterDelayMs() {
      var raw = parseInt(this.getAttribute("enter-delay-ms") || "", 10);
      return isNaN(raw) ? ENTER_DELAY_MS : raw;
    }
    set enterDelayMs(val) {
      if (val == null) this.removeAttribute("enter-delay-ms");
      else this.setAttribute("enter-delay-ms", String(val));
    }

    /* ----- Lifecycle ------------------------------------------------------- */

    connectedCallback() {
      if (!this._rendered) {
        this._render();
        this._rendered = true;
      }
      this._sync();
      this._bind();
    }

    disconnectedCallback() {
      this._unbind();
      this._clearTimer();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (!this._rendered || oldValue === newValue) {
        return;
      }
      this._sync();
    }

    /* ----- Rendering ------------------------------------------------------- */

    _render() {
      // Capture any author-supplied icon (slot="icon") before we wipe children.
      this._slottedIcon = this.querySelector('[slot="icon"]');
      if (this._slottedIcon) {
        this._slottedIcon.removeAttribute("slot");
      }

      // The host element IS the `.hisd-tooltip` wrapper (positioning context).
      this.classList.add("hisd-tooltip");

      var doc = this.ownerDocument;

      var trigger = doc.createElement("button");
      trigger.type = "button";
      trigger.className = "hisd-tooltip__trigger";

      var textSpan = doc.createElement("span");
      textSpan.className = "hisd-tooltip__text";

      var bubble = doc.createElement("span");
      bubble.setAttribute("role", "tooltip");
      bubble.className = "hisd-tooltip__bubble";

      // Wire the description relationship with a stable, unique id.
      var bubbleId = this.id
        ? this.id + "__bubble"
        : "hisd-tooltip-" + (HisdTooltip._uid++);
      bubble.id = bubbleId;
      trigger.setAttribute("aria-describedby", bubbleId);

      // Assemble: [optional icon] + text span inside the trigger, then bubble.
      if (this._slottedIcon) {
        trigger.appendChild(this._slottedIcon);
      }
      trigger.appendChild(textSpan);

      // Clear any leftover authored markup, then mount the canonical structure.
      this.textContent = "";
      this.appendChild(trigger);
      this.appendChild(bubble);

      this._trigger = trigger;
      this._text = textSpan;
      this._bubble = bubble;
    }

    _sync() {
      // Icon-only modifier on the trigger.
      if (this._trigger) {
        this._trigger.classList.toggle(
          "hisd-tooltip__trigger--icon",
          this.iconOnly,
        );

        // Accessible name: required for icon-only triggers, optional otherwise.
        var label = this.getAttribute("label");
        if (label != null && label !== "") {
          this._trigger.setAttribute("aria-label", label);
        } else {
          this._trigger.removeAttribute("aria-label");
        }
      }

      // Visible trigger text (text triggers). Hidden when empty so an icon-only
      // trigger has no stray text node.
      if (this._text) {
        var text = this.getAttribute("text");
        if (text != null && text !== "") {
          this._text.textContent = text;
          this._text.hidden = false;
        } else {
          this._text.textContent = "";
          this._text.hidden = true;
        }
      }

      // Bubble contents + placement modifier.
      if (this._bubble) {
        this._bubble.textContent = this.getAttribute("content") || "";

        var placement = this.placement;
        PLACEMENTS.forEach(function (p) {
          this._bubble.classList.toggle(
            "hisd-tooltip__bubble--" + p,
            p === placement,
          );
        }, this);
      }
    }

    /* ----- Show / hide ----------------------------------------------------- */

    _clearTimer() {
      if (this._timer != null) {
        window.clearTimeout(this._timer);
        this._timer = null;
      }
    }

    _show() {
      if (this._dismissed) {
        return;
      }
      this._clearTimer();
      var self = this;
      this._timer = window.setTimeout(function () {
        self._timer = null;
        if (self._bubble) {
          self._bubble.setAttribute("data-visible", "true");
        }
      }, this.enterDelayMs);
    }

    _hide() {
      this._clearTimer();
      if (this._bubble) {
        this._bubble.setAttribute("data-visible", "false");
      }
    }

    /* ----- Event wiring ---------------------------------------------------- */

    _bind() {
      if (!this._trigger) return;
      this._trigger.addEventListener("mouseenter", this._onMouseEnter);
      this._trigger.addEventListener("mouseleave", this._onMouseLeave);
      this._trigger.addEventListener("focus", this._onFocus);
      this._trigger.addEventListener("blur", this._onBlur);
      this._trigger.addEventListener("keydown", this._onKeyDown);
    }

    _unbind() {
      if (!this._trigger) return;
      this._trigger.removeEventListener("mouseenter", this._onMouseEnter);
      this._trigger.removeEventListener("mouseleave", this._onMouseLeave);
      this._trigger.removeEventListener("focus", this._onFocus);
      this._trigger.removeEventListener("blur", this._onBlur);
      this._trigger.removeEventListener("keydown", this._onKeyDown);
    }

    _onMouseEnter() {
      this._show();
    }

    _onMouseLeave() {
      this._hide();
    }

    _onFocus() {
      this._show();
    }

    _onBlur() {
      // Blur hides AND clears the dismissed guard so the next focus re-shows.
      this._hide();
      this._dismissed = false;
    }

    _onKeyDown(event) {
      // Escape dismisses without moving focus (APG). Only act while shown, and
      // stop propagation so an ancestor (e.g. a dialog) doesn't also react.
      if (
        event.key === "Escape" &&
        this._bubble &&
        this._bubble.getAttribute("data-visible") === "true"
      ) {
        event.stopPropagation();
        this._dismissed = true;
        this._hide();
      }
    }
  }

  // Monotonic counter for generating unique bubble ids across instances.
  HisdTooltip._uid = 0;

  customElements.define("hisd-tooltip", HisdTooltip);
})();
