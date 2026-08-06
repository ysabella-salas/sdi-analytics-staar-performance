/**
 * <hisd-tabs> — framework-agnostic Web Component wrapper around the HISD
 * design-system `tabs` component.
 *
 * LIGHT DOM by design: the element renders the `hisd-tabs*` markup into ITSELF
 * (no shadow root) so the global design-system CSS (assets/hisd-theme.css +
 * components/components.css → tabs.css) styles it. This wrapper never
 * re-implements styling — it is a thin behaviour + markup layer that mirrors
 * components/tabs.html exactly: same classes, same ARIA roles, same keyboard
 * contract (WAI-ARIA APG "Tabs with Automatic Activation").
 *
 * Behaviour ported from the demo's <script>:
 *   - Roving tabindex: exactly one tab is in the page tab order (0), rest -1.
 *   - Arrow Left/Right (and Up/Down) move focus AND activate the focused tab;
 *     Home/End jump to the first/last enabled tab. Disabled tabs are skipped.
 *   - Click activates without stealing focus (matches `activate(tab, false)`).
 *   - The active tab is scrolled into view; CSS owns the scroll easing and
 *     zeroes it under prefers-reduced-motion.
 *   - A visually-hidden polite live region announces "<label> tab selected".
 *
 * Authoring options (markup):
 *   1. Author the full canonical markup as light-DOM children — the component
 *      detects an existing `[role="tablist"]` and only wires behaviour, leaving
 *      your markup intact. This is the most faithful path and supports icons.
 *   2. Provide an `items` attribute: a JSON array of
 *      { value, label, content, disabled?, icon? }. The component builds the
 *      canonical markup for you.
 *
 * Reflected attributes:
 *   value (the active tab's id/value), label (tablist aria-label), disabled
 *   (boolean — disables the WHOLE widget's keyboard wiring; per-tab disabling is
 *   via the tab's own `disabled`).
 *
 * Events: emits a bubbling `change` CustomEvent with `detail: { value }`
 * whenever the active tab changes, and exposes the active value via the `value`
 * property/attribute.
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-tabs")) {
    return;
  }

  let uid = 0;

  class HisdTabs extends HTMLElement {
    static get observedAttributes() {
      return ["value", "label", "disabled"];
    }

    constructor() {
      super();
      /** @type {string} */
      this._id = `hisd-tabs-${(uid += 1)}`;
      /** @type {HTMLElement | null} */
      this._tablist = null;
      /** @type {HTMLButtonElement[]} All tabs (incl. disabled). */
      this._allTabs = [];
      /** @type {HTMLButtonElement[]} Enabled tabs only. */
      this._tabs = [];
      /** @type {HTMLElement | null} */
      this._liveRegion = null;
      this._rendered = false;
      this._authored = false;
      this._onClick = this._onClick.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    connectedCallback() {
      if (!this._rendered) {
        this._render();
        this._rendered = true;
      }
      this._collectTabs();
      this._bind();
      // Establish the initial selection / roving order from current attributes
      // and markup, without moving focus or firing change on first paint.
      this._initSelection();
    }

    disconnectedCallback() {
      this._unbind();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this._rendered) {
        return;
      }
      switch (name) {
        case "value":
          this._activate(newValue, false, false);
          break;
        case "label":
          if (this._tablist) {
            if (newValue == null) {
              this._tablist.removeAttribute("aria-label");
            } else {
              this._tablist.setAttribute("aria-label", newValue);
            }
          }
          break;
        case "disabled":
          // Toggling widget-level disabled re-binds/unbinds keyboard + click.
          this._unbind();
          if (!this.hasAttribute("disabled")) {
            this._bind();
          }
          break;
        default:
          break;
      }
    }

    /* ----------------------------------------------------------------------
       Public property accessors.
       ---------------------------------------------------------------------- */
    get value() {
      return this.getAttribute("value") ?? "";
    }
    set value(next) {
      const str = next == null ? "" : String(next);
      this._activate(str, false, true);
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

    /* ----------------------------------------------------------------------
       Rendering — either adopt authored markup or build it from `items`.
       ---------------------------------------------------------------------- */
    _render() {
      // 1. If the author already provided the canonical markup, adopt it as-is.
      const existing = this.querySelector('[role="tablist"]');
      if (existing) {
        this._authored = true;
        this._ensureLiveRegion();
        return;
      }

      // 2. Otherwise build the markup from the `items` JSON attribute.
      const items = this._parseItems();
      this.innerHTML = "";

      const root = document.createElement("div");
      root.className = "hisd-tabs";

      const viewport = document.createElement("div");
      viewport.className = "hisd-tabs__viewport";

      const list = document.createElement("ul");
      list.className = "hisd-tabs__list";
      list.setAttribute("role", "tablist");
      if (this.hasAttribute("label")) {
        list.setAttribute("aria-label", this.getAttribute("label") ?? "");
      }

      const panels = document.createDocumentFragment();
      const initial = this.getAttribute("value");
      let hasInitial = false;

      items.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          return;
        }
        const val = item.value != null ? String(item.value) : String(index);
        const tabElId = `${this._id}-tab-${val}`;
        const panelElId = `${this._id}-panel-${val}`;
        const isDisabled = Boolean(item.disabled);
        // Selected = explicit value match, or (no explicit value) first enabled.
        const selected = initial != null ? initial === val : false;
        if (selected) {
          hasInitial = true;
        }

        const li = document.createElement("li");
        li.setAttribute("role", "presentation");

        const button = document.createElement("button");
        button.type = "button";
        button.className = "hisd-tabs__tab";
        button.setAttribute("role", "tab");
        button.id = tabElId;
        button.setAttribute("aria-controls", panelElId);
        button.setAttribute("aria-selected", selected ? "true" : "false");
        button.tabIndex = selected && !isDisabled ? 0 : -1;
        button.dataset.value = val;
        if (isDisabled) {
          button.disabled = true;
        }
        if (item.icon) {
          const icon = document.createElement("span");
          icon.className = "hisd-tabs__icon";
          icon.setAttribute("aria-hidden", "true");
          icon.style.setProperty("--hisd-tabs-icon", String(item.icon));
          button.appendChild(icon);
        }
        button.appendChild(
          document.createTextNode(item.label != null ? String(item.label) : ""),
        );
        li.appendChild(button);
        list.appendChild(li);

        const panel = document.createElement("div");
        panel.className = "hisd-tabs__panel";
        panel.setAttribute("role", "tabpanel");
        panel.id = panelElId;
        panel.setAttribute("aria-labelledby", tabElId);
        panel.tabIndex = 0;
        if (!selected) {
          panel.hidden = true;
        }
        // Content may be a plain string or trusted HTML snippet from the author.
        if (item.content != null) {
          panel.innerHTML = String(item.content);
        }
        panels.appendChild(panel);
      });

      viewport.appendChild(list);
      root.appendChild(viewport);
      root.appendChild(panels);
      this.appendChild(root);

      // Record whether we still need to pick a default in _initSelection.
      this._needsDefault = !hasInitial;
      this._ensureLiveRegion();
    }

    _parseItems() {
      const json = this.getAttribute("items");
      if (!json) {
        return [];
      }
      try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        return [];
      }
    }

    _ensureLiveRegion() {
      // A single polite live region per widget, visually hidden inline so it
      // needs no extra CSS. Announces which panel became active.
      const region = document.createElement("div");
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.style.cssText =
        "position:absolute;inline-size:1px;block-size:1px;padding:0;margin:-1px;" +
        "overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
      this.appendChild(region);
      this._liveRegion = region;
    }

    /* ----------------------------------------------------------------------
       Tab collection + initial selection.
       ---------------------------------------------------------------------- */
    _collectTabs() {
      this._tablist = this.querySelector('[role="tablist"]');
      if (!this._tablist) {
        this._allTabs = [];
        this._tabs = [];
        return;
      }
      this._allTabs = Array.prototype.slice.call(
        this._tablist.querySelectorAll('[role="tab"]'),
      );
      this._tabs = this._allTabs.filter(
        (t) =>
          !t.disabled && t.getAttribute("aria-disabled") !== "true",
      );
    }

    _valueOf(tab) {
      // Authored markup may not carry data-value; fall back to the element id.
      return tab.dataset.value != null ? tab.dataset.value : tab.id;
    }

    _panelFor(tab) {
      const id = tab.getAttribute("aria-controls");
      return id ? this.querySelector(`#${CSS.escape(id)}`) : null;
    }

    _initSelection() {
      if (this._tabs.length === 0) {
        return;
      }
      const attrValue = this.getAttribute("value");
      let target = null;

      if (attrValue != null) {
        target = this._tabs.find((t) => this._valueOf(t) === attrValue) ?? null;
      }
      if (!target) {
        // Honour an already-selected tab in authored markup; else first enabled.
        target =
          this._allTabs.find(
            (t) =>
              t.getAttribute("aria-selected") === "true" &&
              !t.disabled &&
              t.getAttribute("aria-disabled") !== "true",
          ) ?? this._tabs[0];
      }
      // Sync state silently (no focus, no change event) on first paint.
      this._activate(this._valueOf(target), false, false);
    }

    /* ----------------------------------------------------------------------
       Activation — the core of the APG automatic-activation behaviour.
       ---------------------------------------------------------------------- */
    /**
     * @param {string|null} value  The tab value/id to activate.
     * @param {boolean} setFocus    Move focus to the tab (keyboard nav).
     * @param {boolean} emit        Dispatch a `change` event.
     */
    _activate(value, setFocus, emit) {
      if (value == null || this._tabs.length === 0) {
        return;
      }
      const target = this._tabs.find((t) => this._valueOf(t) === value);
      if (!target) {
        return;
      }

      this._allTabs.forEach((t) => {
        const selected = t === target;
        t.setAttribute("aria-selected", String(selected));
        // Disabled tabs stay out of the roving order regardless.
        const disabled =
          t.disabled || t.getAttribute("aria-disabled") === "true";
        t.tabIndex = selected && !disabled ? 0 : -1;
        const panel = this._panelFor(t);
        if (panel) {
          panel.hidden = !selected;
        }
      });

      // Reflect to the attribute without re-entering attributeChangedCallback in
      // a loop (it short-circuits when oldValue === newValue).
      const activeValue = this._valueOf(target);
      if (this.getAttribute("value") !== activeValue) {
        this.setAttribute("value", activeValue);
      }

      if (setFocus) {
        target.focus();
      }
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ inline: "nearest", block: "nearest" });
      }

      if (this._liveRegion) {
        this._liveRegion.textContent = `${target.textContent.trim()} tab selected`;
      }

      if (emit) {
        this.dispatchEvent(
          new CustomEvent("change", {
            bubbles: true,
            composed: true,
            detail: { value: activeValue },
          }),
        );
      }
    }

    /* ----------------------------------------------------------------------
       Event wiring — ported from the demo <script>.
       ---------------------------------------------------------------------- */
    _bind() {
      if (!this._tablist || this.hasAttribute("disabled")) {
        return;
      }
      // Delegate click + keydown on the tablist so dynamically added tabs work
      // and there's a single pair of listeners to remove on disconnect.
      this._tablist.addEventListener("click", this._onClick);
      this._tablist.addEventListener("keydown", this._onKeyDown);
    }

    _unbind() {
      if (!this._tablist) {
        return;
      }
      this._tablist.removeEventListener("click", this._onClick);
      this._tablist.removeEventListener("keydown", this._onKeyDown);
    }

    _onClick(event) {
      const tab =
        event.target && event.target.closest
          ? event.target.closest('[role="tab"]')
          : null;
      if (!tab || !this._tablist.contains(tab)) {
        return;
      }
      if (tab.disabled || tab.getAttribute("aria-disabled") === "true") {
        return;
      }
      // Click activates without stealing focus (demo: activate(tab, false)).
      this._activate(this._valueOf(tab), false, true);
    }

    _onKeyDown(event) {
      if (this._tabs.length === 0) {
        return;
      }
      const current = this.ownerDocument.activeElement;
      const index = this._tabs.indexOf(current);
      if (index === -1) {
        return;
      }

      let next = null;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = this._tabs[(index + 1) % this._tabs.length];
          break;
        case "ArrowLeft":
        case "ArrowUp":
          next = this._tabs[(index - 1 + this._tabs.length) % this._tabs.length];
          break;
        case "Home":
          next = this._tabs[0];
          break;
        case "End":
          next = this._tabs[this._tabs.length - 1];
          break;
        default:
          return; // let Enter/Space/Tab behave natively
      }

      event.preventDefault();
      this._activate(this._valueOf(next), true, true);
    }
  }

  customElements.define("hisd-tabs", HisdTabs);
})();
