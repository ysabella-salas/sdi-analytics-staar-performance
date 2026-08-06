/**
 * <hisd-chip> — framework-agnostic Web Component wrapper for the HISD Chip.
 *
 * This is a THIN behavior + markup layer over the design-system CSS. It renders
 * into LIGHT DOM (no shadow root) so the global stylesheets — assets/hisd-theme.css
 * + components/chip.css (or the bundled components.css) — style it directly. It
 * never re-implements visuals; it only applies the canonical `hisd-chip` class
 * names + correct ARIA and ports the demo's JS behavior faithfully:
 *
 *   - Selectable chip  → a real <button type="button"> toggling aria-pressed.
 *     Native buttons fire click on Enter/Space, so we only flip the attribute;
 *     the CSS keys the selected fill off [aria-pressed="true"].
 *   - Dismissible chip → a static <span> container (roleless — no aria-pressed)
 *     with a label and its own labelled close <button>. Selection is conveyed
 *     via a visually-hidden ", selected" word in the accessible name plus the
 *     `hisd-chip--selected` fill class. Dismissing moves focus to the adjacent
 *     chip before removal and announces "<label> removed" via a polite live
 *     region. Reduced motion is honored by the CSS.
 *
 * Reflected attributes:
 *   - selectable   — boolean; makes the chip a toggle (emits aria-pressed)
 *   - selected     — boolean; selection state
 *   - disabled     — boolean
 *   - dismissible  — boolean; renders the static container + close-button shape
 *   - value        — string; echoed back on events
 *   - remove-label — string; close-button accessible name (default "Remove <text>")
 *   - label        — string; chip text (else uses the element's textContent)
 *
 * Events (composed, bubbling):
 *   - hisd-chip-change   detail: { selected, value }   (selectable chips)
 *   - hisd-chip-dismiss  detail: { value }             (dismissible chips)
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || !("customElements" in window)) return;
  if (customElements.get("hisd-chip")) return;

  var CHIP = "hisd-chip";
  var CHIP_SELECTED = "hisd-chip--selected";
  var CHIP_DISMISSIBLE = "hisd-chip--dismissible";
  var CHIP_LABEL = "hisd-chip__label";
  var CHIP_REMOVE = "hisd-chip__remove";
  var CHIP_REMOVE_ICON = "hisd-chip__remove-icon";
  var LIVE_ID = "hisd-chip-live";

  /** Lazily create the shared polite live region (mirrors #chip-live). */
  function announce(message) {
    if (typeof document === "undefined") return;
    var live = document.getElementById(LIVE_ID);
    if (!live) {
      live = document.createElement("div");
      live.id = LIVE_ID;
      live.setAttribute("role", "status");
      live.setAttribute("aria-live", "polite");
      live.style.cssText =
        "position:absolute;width:1px;height:1px;padding:0;margin:-1px;" +
        "overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
      document.body.appendChild(live);
    }
    live.textContent = message;
  }

  class HisdChip extends HTMLElement {
    static get observedAttributes() {
      return [
        "selectable",
        "selected",
        "disabled",
        "dismissible",
        "value",
        "remove-label",
        "label",
      ];
    }

    constructor() {
      super();
      this._rendered = false;
      this._onButtonClick = this._onButtonClick.bind(this);
      this._onRemoveClick = this._onRemoveClick.bind(this);
    }

    /* ---- reflected boolean/string property accessors --------------------- */

    get selectable() {
      return this.hasAttribute("selectable");
    }
    set selectable(v) {
      this._reflectBool("selectable", v);
    }

    get selected() {
      return this.hasAttribute("selected");
    }
    set selected(v) {
      this._reflectBool("selected", v);
    }

    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(v) {
      this._reflectBool("disabled", v);
    }

    get dismissible() {
      return this.hasAttribute("dismissible");
    }
    set dismissible(v) {
      this._reflectBool("dismissible", v);
    }

    get value() {
      return this.getAttribute("value") || undefined;
    }
    set value(v) {
      if (v == null) this.removeAttribute("value");
      else this.setAttribute("value", v);
    }

    _reflectBool(name, v) {
      if (v) this.setAttribute(name, "");
      else this.removeAttribute(name);
    }

    /* ---- lifecycle ------------------------------------------------------- */

    connectedCallback() {
      if (!this._rendered) {
        // Capture authored text before we overwrite our own children.
        this._initialText =
          this.getAttribute("label") || this.textContent.trim() || "";
        this._render();
        this._rendered = true;
      }
    }

    disconnectedCallback() {
      this._teardownListeners();
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!this._rendered || oldVal === newVal) return;
      if (name === "selected" && !this.dismissible) {
        // Cheap path: just sync aria-pressed on the existing button.
        var btn = this._button;
        if (btn && this.selectable) {
          btn.setAttribute("aria-pressed", this.selected ? "true" : "false");
          return;
        }
      }
      // Structural attributes (or label/value/remove-label) → re-render.
      this._render();
    }

    /* ---- rendering ------------------------------------------------------- */

    _render() {
      this._teardownListeners();
      var text = this._initialText || "";

      if (this.dismissible) {
        this._renderDismissible(text);
      } else {
        this._renderSelectable(text);
      }
    }

    _renderSelectable(text) {
      this.replaceChildren();

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = CHIP;
      btn.textContent = text;
      if (this.disabled) btn.disabled = true;
      if (this.selectable) {
        btn.setAttribute("aria-pressed", this.selected ? "true" : "false");
      }
      btn.addEventListener("click", this._onButtonClick);

      this._button = btn;
      this._removeButton = null;
      this.appendChild(btn);
    }

    _renderDismissible(text) {
      this.replaceChildren();

      var container = document.createElement("span");
      var classes = [CHIP, CHIP_DISMISSIBLE];
      if (this.selected) classes.push(CHIP_SELECTED);
      container.className = classes.join(" ");
      if (this.disabled) container.setAttribute("aria-disabled", "true");

      var label = document.createElement("span");
      label.className = CHIP_LABEL;
      label.textContent = text;
      if (this.selected) {
        // Roleless container: expose selection via a hidden status word.
        var status = document.createElement("span");
        status.textContent = ", selected";
        status.style.cssText =
          "position:absolute;width:1px;height:1px;padding:0;margin:-1px;" +
          "overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
        label.appendChild(status);
      }

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = CHIP_REMOVE;
      removeBtn.setAttribute(
        "aria-label",
        this.getAttribute("remove-label") ||
          (text ? "Remove " + text : "Remove chip")
      );
      if (this.disabled) removeBtn.disabled = true;

      var icon = document.createElement("span");
      icon.className = CHIP_REMOVE_ICON;
      icon.setAttribute("aria-hidden", "true");
      removeBtn.appendChild(icon);
      removeBtn.addEventListener("click", this._onRemoveClick);

      container.appendChild(label);
      container.appendChild(removeBtn);

      this._button = null;
      this._removeButton = removeBtn;
      this._container = container;
      this.appendChild(container);
    }

    _teardownListeners() {
      if (this._button) {
        this._button.removeEventListener("click", this._onButtonClick);
      }
      if (this._removeButton) {
        this._removeButton.removeEventListener("click", this._onRemoveClick);
      }
    }

    /* ---- behavior -------------------------------------------------------- */

    _onButtonClick() {
      if (this.disabled || !this.selectable) return;
      // Native button already handles Enter/Space → click; we just toggle.
      var next = !this.selected;
      this.selected = next; // reflects attr → attributeChangedCallback syncs aria
      this.dispatchEvent(
        new CustomEvent("hisd-chip-change", {
          bubbles: true,
          composed: true,
          detail: { selected: next, value: this.value },
        })
      );
    }

    _onRemoveClick() {
      if (this.disabled) return;

      // Mirror the vanilla focus-management contract: move focus to an adjacent
      // chip BEFORE the host is removed so focus is never lost.
      var listItem = this.closest("li") || this;
      var sibling =
        listItem.nextElementSibling || listItem.previousElementSibling;
      var list = listItem.closest("[data-chip-list]");
      var focusTarget = null;
      if (sibling) {
        focusTarget =
          sibling.querySelector("." + CHIP_REMOVE + ", ." + CHIP) || sibling;
      } else if (list) {
        focusTarget = list;
      }

      var labelText = (
        this._removeButton.getAttribute("aria-label") || "chip"
      ).replace(/^Remove\s+/i, "");

      var value = this.value;

      if (focusTarget && typeof focusTarget.focus === "function") {
        if (focusTarget === list) focusTarget.setAttribute("tabindex", "-1");
        focusTarget.focus();
      }

      announce(labelText + " removed");
      this.dispatchEvent(
        new CustomEvent("hisd-chip-dismiss", {
          bubbles: true,
          composed: true,
          detail: { value: value },
        })
      );

      // Remove the host element (and its <li> wrapper if present), matching the
      // demo which removes the list item node.
      if (listItem !== this && listItem.parentNode) {
        listItem.remove();
      } else {
        this.remove();
      }
    }
  }

  customElements.define("hisd-chip", HisdChip);
})();
