/**
 * HISD — Input Text (framework-agnostic Web Component)
 * ---------------------------------------------------------------------------
 * <hisd-input-text> renders the SAME `hisd-input-text*` markup and ARIA as the
 * vanilla component (components/input-text.html) into its own LIGHT DOM, so the
 * global design-system CSS (assets/hisd-theme.css + components/components.css)
 * styles it directly. It deliberately does NOT use shadow DOM and re-implements
 * no styling.
 *
 * The only interactive behavior the vanilla demo ships is the optional
 * "clearable" search field — clear button shown when the field has a value,
 * Escape-to-clear, return-focus to the field — which is ported faithfully.
 *
 * Attributes (reflected):
 *   label          Visible label text (rendered above the control).
 *   value          Initial / current value.
 *   type           Input type (default "text").
 *   placeholder    Placeholder text.
 *   name           Form field name.
 *   autocomplete   autocomplete hint.
 *   required       Boolean — shows the `*` marker + sets the required attr.
 *   disabled       Boolean — non-interactive, dimmed.
 *   readonly       Boolean — selectable but quieter.
 *   error          Boolean or message string — sets .is-error + aria-invalid;
 *                  a string also renders the error region (role="alert").
 *   helper         Helper text below the control.
 *   clearable      Boolean — enables the clear button + Escape-to-clear.
 *   clear-label    Accessible label for the clear button (default "Clear").
 *
 * Property accessors mirror the attributes (el.value, el.disabled, ...).
 * `value` change/input fires a bubbling 'input' and 'change' event from the
 * host, and a 'clear' event fires when the field is cleared.
 */
(function () {
  if (customElements.get("hisd-input-text")) return;

  var SEARCH_GLYPH =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z"/>' +
    "</svg>";

  var uid = 0;

  function bool(v) {
    // HTML boolean-attribute semantics: present (incl. "") => true, "false" => false.
    return v !== null && v !== undefined && v !== "false";
  }

  class HISDInputText extends HTMLElement {
    static get observedAttributes() {
      return [
        "label",
        "value",
        "type",
        "placeholder",
        "name",
        "autocomplete",
        "required",
        "disabled",
        "readonly",
        "error",
        "helper",
        "clearable",
        "clear-label",
      ];
    }

    constructor() {
      super();
      this._fieldId = "hisd-input-wc-" + ++uid;
      this._field = null;
      this._clearBtn = null;
      this._onInput = this._onInput.bind(this);
      this._onKeydown = this._onKeydown.bind(this);
      this._onClearClick = this._onClearClick.bind(this);
      this._upgraded = false;
    }

    connectedCallback() {
      // Capture any value typed/set before render, then build the markup once.
      if (!this._upgraded) {
        this._render();
        this._upgraded = true;
      }
      this._wire();
      this._sync();
    }

    disconnectedCallback() {
      this._unwire();
    }

    attributeChangedCallback() {
      // Re-render structure-affecting attrs; the cheap path just re-syncs.
      if (!this._upgraded) return;
      this._render();
      this._wire();
      this._sync();
    }

    /* ------------------------- Property accessors ------------------------- */

    get value() {
      return this._field ? this._field.value : this.getAttribute("value") || "";
    }
    set value(v) {
      if (this._field) this._field.value = v == null ? "" : String(v);
      this._sync();
    }

    get disabled() {
      return bool(this.getAttribute("disabled"));
    }
    set disabled(v) {
      this._reflectBool("disabled", v);
    }

    get required() {
      return bool(this.getAttribute("required"));
    }
    set required(v) {
      this._reflectBool("required", v);
    }

    get readOnly() {
      return bool(this.getAttribute("readonly"));
    }
    set readOnly(v) {
      this._reflectBool("readonly", v);
    }

    get clearable() {
      return bool(this.getAttribute("clearable"));
    }
    set clearable(v) {
      this._reflectBool("clearable", v);
    }

    get error() {
      var e = this.getAttribute("error");
      return e === null ? false : e === "" || e === "true" ? true : e;
    }
    set error(v) {
      if (v === false || v == null) this.removeAttribute("error");
      else this.setAttribute("error", v === true ? "" : String(v));
    }

    _reflectBool(name, v) {
      if (v) this.setAttribute(name, "");
      else this.removeAttribute(name);
    }

    /** Public: clear the field and return focus to it (matches demo behavior). */
    clear() {
      if (!this._field) return;
      this._field.value = "";
      this._sync();
      this._field.focus();
      this.dispatchEvent(new CustomEvent("clear", { bubbles: true }));
    }

    /* ------------------------------ Render ------------------------------- */

    _render() {
      // Preserve the live value across re-render so attribute changes don't wipe
      // user input.
      var liveValue = this._field
        ? this._field.value
        : this.getAttribute("value") || "";

      this._unwire();

      var label = this.getAttribute("label") || "";
      var type = this.getAttribute("type") || "text";
      var placeholder = this.getAttribute("placeholder");
      var name = this.getAttribute("name");
      var autocomplete = this.getAttribute("autocomplete");
      var helper = this.getAttribute("helper");
      var required = this.required;
      var disabled = this.disabled;
      var readonly = this.readOnly;
      var clearable = this.clearable;
      var clearLabel = this.getAttribute("clear-label") || "Clear";

      var errAttr = this.error;
      var hasError = errAttr === true || (typeof errAttr === "string" && errAttr.length > 0);
      var errorMsg = typeof errAttr === "string" ? errAttr : "";

      var helperId = this._fieldId + "-help";
      var errorId = this._fieldId + "-error";
      var describedBy = errorMsg ? errorId : helper ? helperId : "";

      var root = document.createElement("div");
      root.className = hasError ? "hisd-input-text is-error" : "hisd-input-text";

      // Label (above control)
      var labelEl = document.createElement("label");
      labelEl.className = "hisd-input-text__label";
      labelEl.setAttribute("for", this._fieldId);
      labelEl.textContent = label;
      if (required) {
        var req = document.createElement("span");
        req.className = "hisd-input-text__required";
        req.setAttribute("aria-hidden", "true");
        req.textContent = "*";
        // keep a space so screen-readers / text-copy read "Label *"
        labelEl.appendChild(document.createTextNode(" "));
        labelEl.appendChild(req);
      }
      root.appendChild(labelEl);

      // Control wrapper
      var control = document.createElement("div");
      control.className = "hisd-input-text__control";

      var field = document.createElement("input");
      field.className = "hisd-input-text__field";
      field.id = this._fieldId;
      field.type = type;
      if (placeholder !== null) field.placeholder = placeholder;
      if (name !== null) field.name = name;
      if (autocomplete !== null) field.setAttribute("autocomplete", autocomplete);
      if (required) field.required = true;
      if (disabled) field.disabled = true;
      if (readonly) field.readOnly = true;
      if (hasError) field.setAttribute("aria-invalid", "true");
      if (describedBy) field.setAttribute("aria-describedby", describedBy);
      field.value = liveValue;
      control.appendChild(field);

      if (clearable) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "hisd-input-text__action";
        btn.setAttribute("aria-label", clearLabel);
        btn.hidden = true; // _sync() reveals it when there is text
        btn.innerHTML = SEARCH_GLYPH;
        control.appendChild(btn);
        this._clearBtn = btn;
      } else {
        this._clearBtn = null;
      }

      root.appendChild(control);

      // Supporting text: error region wins over helper
      if (errorMsg) {
        var err = document.createElement("p");
        err.className = "hisd-input-text__error";
        err.id = errorId;
        err.setAttribute("role", "alert");
        err.textContent = errorMsg;
        root.appendChild(err);
      } else if (helper) {
        var help = document.createElement("p");
        help.className = "hisd-input-text__helper";
        help.id = helperId;
        help.textContent = helper;
        root.appendChild(help);
      }

      // Light DOM: replace our own content so the global CSS applies.
      this.textContent = "";
      this.appendChild(root);
      this._field = field;
    }

    /* ------------------------- Listeners + sync -------------------------- */

    _wire() {
      if (!this._field) return;
      this._field.addEventListener("input", this._onInput);
      this._field.addEventListener("keydown", this._onKeydown);
      if (this._clearBtn) this._clearBtn.addEventListener("click", this._onClearClick);
    }

    _unwire() {
      if (this._field) {
        this._field.removeEventListener("input", this._onInput);
        this._field.removeEventListener("keydown", this._onKeydown);
      }
      if (this._clearBtn) this._clearBtn.removeEventListener("click", this._onClearClick);
    }

    _onInput(e) {
      this._sync();
      // Re-emit so consumers can listen on the host element.
      this.dispatchEvent(new Event("input", { bubbles: true }));
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }

    _onKeydown(e) {
      if (this.clearable && e.key === "Escape" && this._field.value.length > 0) {
        e.preventDefault(); // don't bubble to ancestor dialogs
        this.clear();
      }
    }

    _onClearClick() {
      this.clear();
    }

    /** Toggle the clear button's visibility from the field's value. */
    _sync() {
      if (!this._clearBtn || !this._field) return;
      var hasValue = this._field.value.length > 0;
      var interactive = !this._field.disabled && !this._field.readOnly;
      this._clearBtn.hidden = !(hasValue && interactive);
    }
  }

  customElements.define("hisd-input-text", HISDInputText);
})();
