/**
 * <hisd-switch> — framework-agnostic Web Component wrapping the vanilla
 * `.hisd-switch` component.
 *
 * LIGHT DOM by design: the element renders its markup into itself (no shadow
 * root) so the GLOBAL design-system CSS (assets/hisd-theme.css +
 * components/components.css, which includes components/switch.css) styles it.
 * This component never re-implements styling — it only renders the canonical
 * `<button class="hisd-switch" role="switch">` markup, applies the correct
 * ARIA, and wires the same toggle + announce behavior as the React version and
 * the demo's <script>.
 *
 * Reflected attributes:
 *   - checked    (boolean) <-> .checked / aria-checked on the inner button
 *   - disabled   (boolean) <-> .disabled / [disabled] + aria-disabled
 *   - label      (string)  -> aria-label on the inner button (icon-only naming)
 *   - labelledby (string)  -> aria-labelledby on the inner button
 *   - value      (string)  -> reflected for form-ish identification
 *
 * Events:
 *   - "change": dispatched after a successful toggle with
 *     detail = { checked: boolean }. Cancelable preventDefault has no effect
 *     (state already committed) — listen to read the new value.
 *
 * Usage:
 *   <hisd-switch label="Email notifications"></hisd-switch>
 *   <hisd-switch checked labelledby="notif-label"></hisd-switch>
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) return;
  if (customElements.get("hisd-switch")) return;

  class HISDSwitch extends HTMLElement {
    static get observedAttributes() {
      return ["checked", "disabled", "label", "labelledby", "value"];
    }

    constructor() {
      super();
      /** @type {HTMLButtonElement | null} */
      this._button = null;
      /** @type {HTMLSpanElement | null} */
      this._live = null;
      this._onClick = this._onClick.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    /* ----- Reflected boolean/string properties ----------------------------- */

    get checked() {
      return this.hasAttribute("checked");
    }
    set checked(val) {
      if (val) this.setAttribute("checked", "");
      else this.removeAttribute("checked");
    }

    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(val) {
      if (val) this.setAttribute("disabled", "");
      else this.removeAttribute("disabled");
    }

    get label() {
      return this.getAttribute("label");
    }
    set label(val) {
      if (val == null) this.removeAttribute("label");
      else this.setAttribute("label", val);
    }

    get value() {
      return this.getAttribute("value");
    }
    set value(val) {
      if (val == null) this.removeAttribute("value");
      else this.setAttribute("value", val);
    }

    /* ----- Lifecycle ------------------------------------------------------- */

    connectedCallback() {
      if (!this._button) this._render();
      this._sync();
      this._button.addEventListener("click", this._onClick);
      this._button.addEventListener("keydown", this._onKeyDown);
    }

    disconnectedCallback() {
      if (this._button) {
        this._button.removeEventListener("click", this._onClick);
        this._button.removeEventListener("keydown", this._onKeyDown);
      }
    }

    attributeChangedCallback() {
      // Re-sync ARIA/markup whenever a reflected attribute changes.
      if (this._button) this._sync();
    }

    /* ----- Internal -------------------------------------------------------- */

    _render() {
      // Render the canonical markup into the light DOM so global CSS applies.
      const button = this.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "hisd-switch";
      button.setAttribute("role", "switch");

      const live = this.ownerDocument.createElement("span");
      live.className = "visually-hidden";
      live.setAttribute("aria-live", "polite");

      this.appendChild(button);
      this.appendChild(live);
      this._button = button;
      this._live = live;
    }

    _sync() {
      const btn = this._button;
      if (!btn) return;

      btn.setAttribute("aria-checked", this.checked ? "true" : "false");

      // Render both native disabled and aria-disabled so the CSS contract
      // (opacity + pointer-events via [disabled], and the
      // :not([aria-disabled="true"]) hover/active guards) fully resolves —
      // identical to the React wrapper.
      if (this.disabled) {
        btn.setAttribute("disabled", "");
        btn.setAttribute("aria-disabled", "true");
      } else {
        btn.removeAttribute("disabled");
        btn.removeAttribute("aria-disabled");
      }

      const label = this.getAttribute("label");
      if (label != null) btn.setAttribute("aria-label", label);
      else btn.removeAttribute("aria-label");

      const labelledby = this.getAttribute("labelledby");
      if (labelledby != null) btn.setAttribute("aria-labelledby", labelledby);
      else btn.removeAttribute("aria-labelledby");
    }

    _isDisabled() {
      return this.disabled;
    }

    _onClick() {
      // Native <button> synthesizes a click for mouse, Enter, and Space, so a
      // single click handler covers all activation paths without double-toggling.
      if (this._isDisabled()) return;
      const next = !this.checked;
      this.checked = next; // reflects -> attributeChangedCallback -> _sync()
      this._announce(next);
      this.dispatchEvent(
        new CustomEvent("change", {
          detail: { checked: next },
          bubbles: true,
        }),
      );
    }

    _onKeyDown(event) {
      // Space scrolls the page by default; suppress that on keydown only.
      // We do NOT toggle here — the native click handles activation.
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
      }
    }

    _announce(next) {
      if (!this._live || !this._button) return;
      const name = this._resolveName();
      this._live.textContent = name + (next ? " on" : " off");
    }

    _resolveName() {
      const btn = this._button;
      const label = btn.getAttribute("aria-label");
      if (label) return label.trim();
      const labelledby = btn.getAttribute("aria-labelledby");
      if (labelledby) {
        const text = labelledby
          .split(/\s+/)
          .map((id) => this.ownerDocument.getElementById(id))
          .map((el) => (el ? el.textContent || "" : ""))
          .join(" ")
          .trim();
        if (text) return text;
      }
      return "Setting";
    }
  }

  customElements.define("hisd-switch", HISDSwitch);
})();
