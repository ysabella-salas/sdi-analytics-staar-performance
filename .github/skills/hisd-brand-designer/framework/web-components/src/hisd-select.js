/**
 * <hisd-select> — framework-agnostic Web Component wrapper around the HISD
 * design-system `select` component.
 *
 * LIGHT DOM by design: the element renders the `hisd-select*` markup into
 * ITSELF (no shadow root) so the global design-system CSS
 * (assets/hisd-theme.css + components/components.css → select.css) styles it.
 * This wrapper never re-implements styling — it is a thin behaviour + markup
 * layer that mirrors components/select.html exactly: same classes, same ARIA.
 *
 * The underlying control is a native <select>, which already implements the
 * full WAI-ARIA listbox keyboard contract (Arrow keys, Enter/Space, Escape,
 * Home/End, type-ahead). On top of that we port the demo's two app-level
 * behaviours plus Escape-to-blur:
 *
 *   1. Keep the `data-placeholder` tint in sync with the empty value.
 *   2. Recover from the error state on a valid change (drop `data-invalid`,
 *      flip `aria-invalid` to "false").
 *   3. Escape blurs the control so the focus state is visibly released.
 *
 * Authoring options (markup):
 *   - Provide <option> children — they are moved into the rendered <select>.
 *   - Or set the `options` attribute to a JSON array of
 *     { value, label, disabled?, hidden? }.
 *
 * Reflected attributes:
 *   label, value, helper, error, required (boolean), disabled (boolean),
 *   placeholder (boolean), name. `disabled`, `value`, and `error` stay in sync
 *   with the live control.
 *
 * Events: re-emits the native `change` as a bubbling `change` on the host, and
 * exposes the chosen value via the `value` property/attribute.
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-select")) {
    return;
  }

  let uid = 0;

  class HisdSelect extends HTMLElement {
    static get observedAttributes() {
      return [
        "label",
        "value",
        "helper",
        "error",
        "required",
        "disabled",
        "placeholder",
        "name",
      ];
    }

    constructor() {
      super();
      /** @type {HTMLSelectElement | null} */
      this._control = null;
      /** @type {string} */
      this._id = `hisd-select-${(uid += 1)}`;
      /**
       * Captured <option> children supplied by the author before first render.
       * @type {HTMLOptionElement[]}
       */
      this._authoredOptions = [];
      this._rendered = false;
      this._onChange = this._onChange.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    connectedCallback() {
      if (!this._rendered) {
        // Capture author-supplied <option>/<optgroup> nodes before we replace
        // the light-DOM contents with our wrapper markup.
        this._captureAuthoredOptions();
        this._render();
        this._rendered = true;
      }
      this._bind();
    }

    disconnectedCallback() {
      this._unbind();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this._rendered) {
        return;
      }
      switch (name) {
        case "label":
          this._renderLabel();
          break;
        case "helper":
        case "error":
          this._renderMessage();
          break;
        case "value":
          if (this._control && this._control.value !== (newValue ?? "")) {
            this._control.value = newValue ?? "";
          }
          this._syncPlaceholder();
          break;
        case "required":
          this._renderLabel();
          if (this._control) {
            this._control.required = this.hasAttribute("required");
          }
          break;
        case "disabled":
          if (this._control) {
            this._control.disabled = this.hasAttribute("disabled");
          }
          break;
        case "placeholder":
          this._syncPlaceholder();
          break;
        case "name":
          if (this._control) {
            this._control.name = newValue ?? "";
          }
          break;
        default:
          break;
      }
    }

    /* ----------------------------------------------------------------------
       Public property accessors (mirror the reflected attributes).
       ---------------------------------------------------------------------- */
    get value() {
      return this._control ? this._control.value : this.getAttribute("value") ?? "";
    }
    set value(next) {
      const str = next == null ? "" : String(next);
      if (this._control) {
        this._control.value = str;
      }
      this.setAttribute("value", str);
      this._syncPlaceholder();
    }

    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(next) {
      if (next) {
        this.setAttribute("disabled", "");
      } else {
        this.removeAttribute("disabled");
      }
    }

    get error() {
      return this.getAttribute("error");
    }
    set error(next) {
      if (next == null || next === false || next === "") {
        this.removeAttribute("error");
      } else {
        this.setAttribute("error", String(next));
      }
    }

    /** Direct access to the underlying native <select>. */
    get control() {
      return this._control;
    }

    /* ----------------------------------------------------------------------
       Rendering — builds the hisd-select markup in light DOM.
       ---------------------------------------------------------------------- */
    _captureAuthoredOptions() {
      const nodes = Array.from(this.children).filter(
        (node) =>
          node.tagName === "OPTION" || node.tagName === "OPTGROUP",
      );
      this._authoredOptions = /** @type {HTMLOptionElement[]} */ (nodes);
    }

    _render() {
      const isInvalid = this._isInvalid();

      this.innerHTML = "";

      // Keep the host as a plain custom element and use an inner field wrapper
      // so the design-system selectors (`.hisd-select-field …`) match without
      // assuming any styling on the host element itself.
      const field = document.createElement("div");
      field.className = "hisd-select-field";
      if (isInvalid) {
        field.setAttribute("data-invalid", "true");
      }
      this._field = field;

      // Label
      const label = document.createElement("label");
      label.className = "hisd-select-label";
      label.setAttribute("for", this._id);
      this._label = label;

      // Control wrapper (owns the chevron via ::after).
      const wrapper = document.createElement("span");
      wrapper.className = "hisd-select";

      const control = document.createElement("select");
      control.className = "hisd-select__control";
      control.id = this._id;
      if (this.hasAttribute("name")) {
        control.name = this.getAttribute("name") ?? "";
      }
      control.disabled = this.hasAttribute("disabled");
      control.required = this.hasAttribute("required");
      this._control = control;

      this._populateOptions(control);
      wrapper.appendChild(control);

      field.appendChild(label);
      field.appendChild(wrapper);
      this.appendChild(field);

      // Label + message text and ARIA depend on current attributes.
      this._renderLabel();
      this._renderMessage();

      // Apply initial value (attribute wins over the option's `selected`).
      if (this.hasAttribute("value")) {
        control.value = this.getAttribute("value") ?? "";
      }
      this._syncPlaceholder();
    }

    _populateOptions(control) {
      // 1. Author-supplied <option>/<optgroup> nodes take priority.
      if (this._authoredOptions.length > 0) {
        this._authoredOptions.forEach((node) => control.appendChild(node));
        return;
      }
      // 2. Fall back to a JSON `options` attribute.
      const json = this.getAttribute("options");
      if (!json) {
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch (err) {
        return;
      }
      if (!Array.isArray(parsed)) {
        return;
      }
      parsed.forEach((opt) => {
        if (!opt || typeof opt !== "object") {
          return;
        }
        const option = document.createElement("option");
        option.value = opt.value != null ? String(opt.value) : "";
        option.textContent = opt.label != null ? String(opt.label) : "";
        if (opt.disabled) {
          option.disabled = true;
        }
        if (opt.hidden) {
          option.hidden = true;
        }
        if (opt.selected) {
          option.selected = true;
        }
        control.appendChild(option);
      });
    }

    _renderLabel() {
      if (!this._label) {
        return;
      }
      this._label.textContent = this.getAttribute("label") ?? "";
      if (this.hasAttribute("required")) {
        const marker = document.createElement("span");
        marker.className = "hisd-select-label__required";
        marker.setAttribute("aria-hidden", "true");
        marker.textContent = "*";
        this._label.appendChild(marker);
      }
    }

    _renderMessage() {
      if (!this._field || !this._control) {
        return;
      }
      // Remove any existing message node.
      if (this._message && this._message.parentNode) {
        this._message.parentNode.removeChild(this._message);
      }
      this._message = null;

      const isInvalid = this._isInvalid();
      const errorText = this.getAttribute("error");
      const helperText = this.getAttribute("helper");

      // Field invalid flag + control ARIA.
      if (isInvalid) {
        this._field.setAttribute("data-invalid", "true");
        this._control.setAttribute("aria-invalid", "true");
      } else {
        this._field.removeAttribute("data-invalid");
        this._control.removeAttribute("aria-invalid");
      }

      if (isInvalid && errorText) {
        const p = document.createElement("p");
        p.className = "hisd-select-error";
        p.id = `${this._id}-error`;
        p.setAttribute("role", "alert");
        const icon = document.createElement("span");
        icon.className = "hisd-select-error__icon";
        icon.setAttribute("aria-hidden", "true");
        p.appendChild(icon);
        p.appendChild(document.createTextNode(errorText));
        this._field.appendChild(p);
        this._message = p;
        this._control.setAttribute("aria-describedby", p.id);
      } else if (helperText) {
        const p = document.createElement("p");
        p.className = "hisd-select-helper";
        p.id = `${this._id}-help`;
        p.textContent = helperText;
        this._field.appendChild(p);
        this._message = p;
        this._control.setAttribute("aria-describedby", p.id);
      } else {
        this._control.removeAttribute("aria-describedby");
      }
    }

    _isInvalid() {
      const error = this.getAttribute("error");
      return error != null && error !== "";
    }

    /* ----------------------------------------------------------------------
       Behaviour — ported from the demo <script>.
       ---------------------------------------------------------------------- */
    _bind() {
      if (!this._control) {
        return;
      }
      this._control.addEventListener("change", this._onChange);
      this._control.addEventListener("keydown", this._onKeyDown);
    }

    _unbind() {
      if (!this._control) {
        return;
      }
      this._control.removeEventListener("change", this._onChange);
      this._control.removeEventListener("keydown", this._onKeyDown);
    }

    _onChange() {
      const control = this._control;
      if (!control) {
        return;
      }
      // Reflect the chosen value to the host attribute. The value-branch in
      // attributeChangedCallback is a no-op when control.value already matches,
      // so this is safe (no re-entrant loop).
      this.setAttribute("value", control.value);

      // 1. Placeholder tint follows the empty value (unless forced via attr).
      this._syncPlaceholder();

      // 2. Recover from the error state once a real value is picked.
      const isPlaceholder = control.value === "";
      if (this._isInvalid() && !isPlaceholder) {
        this.removeAttribute("error");
        // _renderMessage clears data-invalid + flips aria-invalid to absent;
        // mirror the demo's explicit aria-invalid="false" for AT clarity.
        control.setAttribute("aria-invalid", "false");
      }

      // No synthetic `change` re-dispatch: because we render in LIGHT DOM, the
      // native <select>'s `change` event already bubbles up through this host,
      // so consumers can `hostEl.addEventListener('change', …)` directly and
      // read the chosen value from `event.target.value` or `hostEl.value`.
      // A `hisd-change` CustomEvent carries the value in `detail` for ergonomics.
      this.dispatchEvent(
        new CustomEvent("hisd-change", {
          bubbles: true,
          detail: { value: control.value },
        }),
      );
    }

    _onKeyDown(event) {
      // Native <select> consumes the first Escape to close an open popup; when
      // the list is already closed, blur so the focus state releases.
      if (event.key === "Escape" && this._control) {
        this._control.blur();
      }
    }

    _syncPlaceholder() {
      if (!this._control) {
        return;
      }
      const forced = this.hasAttribute("placeholder");
      const isPlaceholder = forced || this._control.value === "";
      if (isPlaceholder) {
        this._control.setAttribute("data-placeholder", "true");
      } else {
        this._control.removeAttribute("data-placeholder");
      }
    }
  }

  customElements.define("hisd-select", HisdSelect);
})();
