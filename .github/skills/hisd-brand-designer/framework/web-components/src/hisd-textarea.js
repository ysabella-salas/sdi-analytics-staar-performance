/**
 * <hisd-textarea> — framework-agnostic Web Component wrapper over the vanilla
 * `hisd-textarea-*` component.
 *
 * Light DOM by design: the element renders the canonical markup *into itself*
 * (no shadow root) so the global design-system CSS — assets/hisd-theme.css +
 * components/textarea.css — styles it exactly like the hand-authored HTML. This
 * component re-uses those classes and the same ARIA contract; it never
 * re-implements styling.
 *
 * Accessibility contract mirrored from textarea.html:
 *  - <label> above the control, wired via for/id.
 *  - helper + error linked through aria-describedby.
 *  - error driven by aria-invalid; field carries data-invalid for the label tint.
 *  - optional live character counter announced via aria-live="polite", flagging
 *    data-over once the length reaches the max (ported from the demo <script>).
 *
 * Attributes (reflected where it makes sense):
 *  - label       : visible label text (required for an accessible field)
 *  - helper      : helper text below the control
 *  - error       : error message; presence switches the field to the error state
 *  - invalid     : force the invalid state ("true"/"false"); defaults to true
 *                  whenever `error` is present
 *  - required    : marks the field required (native + visible "*")
 *  - disabled    : disables the control
 *  - placeholder : control placeholder
 *  - rows        : control rows (default 3)
 *  - name        : form field name
 *  - value       : current/initial value (kept in sync with the live control)
 *  - maxlength   : native maxLength
 *  - show-count  : show the live counter; if a number, used as the displayed max
 *
 * Property accessors: `.value`, `.disabled`, `.invalid`, `.error` are exposed so
 * JS callers can read/write state programmatically.
 */
(function () {
  if (typeof window === "undefined" || !window.customElements) return;
  if (customElements.get("hisd-textarea")) return;

  var BOOL_ATTRS = ["required", "disabled"];

  function uid() {
    return "hisd-textarea-" + Math.random().toString(36).slice(2, 9);
  }

  function isTruthyAttr(el, name) {
    if (!el.hasAttribute(name)) return false;
    var v = el.getAttribute(name);
    return v !== "false";
  }

  class HISDTextarea extends HTMLElement {
    static get observedAttributes() {
      return [
        "label",
        "helper",
        "error",
        "invalid",
        "required",
        "disabled",
        "placeholder",
        "rows",
        "name",
        "value",
        "maxlength",
        "show-count",
      ];
    }

    constructor() {
      super();
      this._id = uid();
      this._control = null;
      this._count = null;
      this._onInput = this._onInput.bind(this);
      // Capture any initial value set as a property before upgrade.
      this._pendingValue = undefined;
      this._upgradeProperty("value");
      this._upgradeProperty("disabled");
      this._upgradeProperty("invalid");
      this._upgradeProperty("error");
    }

    // Re-apply properties that may have been set before the element upgraded.
    _upgradeProperty(prop) {
      if (Object.prototype.hasOwnProperty.call(this, prop)) {
        var value = this[prop];
        delete this[prop];
        this[prop] = value;
      }
    }

    connectedCallback() {
      this._render();
    }

    disconnectedCallback() {
      if (this._control) {
        this._control.removeEventListener("input", this._onInput);
      }
      this._control = null;
      this._count = null;
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    /* ── Property accessors ─────────────────────────────────────────────── */

    get value() {
      return this._control ? this._control.value : this.getAttribute("value") || "";
    }
    set value(v) {
      var next = v == null ? "" : String(v);
      if (this._control) {
        this._control.value = next;
        this._updateCount();
      } else {
        this._pendingValue = next;
      }
      // Keep the attribute as a serialized hint; don't loop the renderer.
      if (this.getAttribute("value") !== next) {
        this.setAttribute("value", next);
      }
    }

    get disabled() {
      return isTruthyAttr(this, "disabled");
    }
    set disabled(v) {
      if (v) this.setAttribute("disabled", "");
      else this.removeAttribute("disabled");
    }

    get invalid() {
      if (this.hasAttribute("invalid")) return this.getAttribute("invalid") !== "false";
      return this.hasAttribute("error");
    }
    set invalid(v) {
      this.setAttribute("invalid", v ? "true" : "false");
    }

    get error() {
      return this.getAttribute("error") || "";
    }
    set error(v) {
      if (v == null || v === "") this.removeAttribute("error");
      else this.setAttribute("error", String(v));
    }

    /* ── Behavior ───────────────────────────────────────────────────────── */

    _onInput() {
      this._updateCount();
    }

    _showCountConfig() {
      var raw = this.getAttribute("show-count");
      var enabled = raw !== null && raw !== "false";
      var max = null;
      if (raw !== null && raw !== "" && raw !== "true" && raw !== "false") {
        var n = parseInt(raw, 10);
        if (!isNaN(n)) max = n;
      }
      if (max === null && this.hasAttribute("maxlength")) {
        var ml = parseInt(this.getAttribute("maxlength"), 10);
        if (!isNaN(ml)) max = ml;
      }
      return { enabled: enabled, max: max };
    }

    _updateCount() {
      if (!this._count || !this._control) return;
      var cfg = this._showCountConfig();
      var n = this._control.value.length;
      this._count.textContent = cfg.max !== null ? n + " / " + cfg.max : String(n);
      if (cfg.max !== null && n >= cfg.max) {
        this._count.setAttribute("data-over", "true");
      } else {
        this._count.removeAttribute("data-over");
      }
    }

    /* ── Render ─────────────────────────────────────────────────────────── */

    _render() {
      // Detach the old listener before re-rendering.
      if (this._control) {
        this._control.removeEventListener("input", this._onInput);
      }

      // Preserve the live value across re-renders (attribute changes).
      var liveValue =
        (this._control && this._control.value) ||
        this._pendingValue ||
        this.getAttribute("value") ||
        "";
      this._pendingValue = undefined;

      var id = this._id;
      var helperId = id + "-help";
      var errorId = id + "-error";
      var countId = id + "-count";

      var label = this.getAttribute("label") || "";
      var helper = this.getAttribute("helper");
      var errorMsg = this.getAttribute("error");
      var required = isTruthyAttr(this, "required");
      var disabled = isTruthyAttr(this, "disabled");
      var placeholder = this.getAttribute("placeholder") || "";
      var rows = this.getAttribute("rows") || "3";
      var name = this.getAttribute("name");
      var maxlength = this.getAttribute("maxlength");

      var isInvalid = this.invalid;
      var hasError = Boolean(errorMsg) && isInvalid;
      var cfg = this._showCountConfig();

      // Build the aria-describedby id list.
      var describedBy = [];
      if (helper) describedBy.push(helperId);
      if (hasError) describedBy.push(errorId);
      if (cfg.enabled) describedBy.push(countId);

      // Compose markup with the canonical hisd-textarea-* classes.
      var parts = [];
      parts.push(
        '<div class="hisd-textarea-field"' +
          (isInvalid ? ' data-invalid="true"' : "") +
          ">"
      );
      parts.push('<label class="hisd-textarea-label" for="' + id + '">');
      parts.push(escapeHTML(label));
      if (required) {
        parts.push(
          ' <span class="hisd-textarea-required" aria-hidden="true">*</span>'
        );
      }
      parts.push("</label>");

      parts.push("<textarea");
      parts.push(' class="hisd-textarea-control"');
      parts.push(' id="' + id + '"');
      if (name) parts.push(' name="' + escapeAttr(name) + '"');
      parts.push(' rows="' + escapeAttr(rows) + '"');
      if (placeholder) parts.push(' placeholder="' + escapeAttr(placeholder) + '"');
      if (maxlength) parts.push(' maxlength="' + escapeAttr(maxlength) + '"');
      if (disabled) parts.push(" disabled");
      if (required) parts.push(" required");
      if (isInvalid) parts.push(' aria-invalid="true"');
      if (describedBy.length) {
        parts.push(' aria-describedby="' + describedBy.join(" ") + '"');
      }
      parts.push(">" + escapeHTML(liveValue) + "</textarea>");

      if (helper) {
        parts.push(
          '<p class="hisd-textarea-message hisd-textarea-helper" id="' +
            helperId +
            '">' +
            escapeHTML(helper) +
            "</p>"
        );
      }

      if (hasError) {
        parts.push(
          '<p class="hisd-textarea-message hisd-textarea-error" id="' +
            errorId +
            '" role="alert">' +
            escapeHTML(errorMsg) +
            "</p>"
        );
      }

      if (cfg.enabled) {
        var n = liveValue.length;
        var text = cfg.max !== null ? n + " / " + cfg.max : String(n);
        var over = cfg.max !== null && n >= cfg.max;
        parts.push(
          '<span class="hisd-textarea-count" id="' +
            countId +
            '" aria-live="polite" aria-atomic="true"' +
            (over ? ' data-over="true"' : "") +
            ">" +
            escapeHTML(text) +
            "</span>"
        );
      }

      parts.push("</div>");

      this.innerHTML = parts.join("");

      // Re-bind to the freshly rendered control.
      this._control = this.querySelector(".hisd-textarea-control");
      this._count = this.querySelector(".hisd-textarea-count");
      if (this._control) {
        this._control.addEventListener("input", this._onInput);
      }
    }
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  customElements.define("hisd-textarea", HISDTextarea);
})();
