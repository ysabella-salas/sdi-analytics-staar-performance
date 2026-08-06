/**
 * <hisd-accordion> — framework-agnostic Web Component wrapper around the HISD
 * design-system `accordion` component (the WAI-ARIA APG "Accordion" /
 * disclosure pattern).
 *
 * LIGHT DOM by design: the element renders the `hisd-accordion*` markup into
 * ITSELF (no shadow root) so the global design-system CSS (assets/hisd-theme.css
 * + components/components.css → accordion.css) styles it. This wrapper never
 * re-implements styling — it is a thin behaviour + markup layer that mirrors
 * components/accordion.html exactly: same classes, same ARIA roles, same
 * keyboard contract.
 *
 * Behaviour ported from the demo's <script>:
 *   - Click / Enter / Space on a header toggles its panel: flips aria-expanded
 *     and adds/removes the panel's `hidden` attribute. Enter/Space are left to
 *     the native <button> (no preventDefault).
 *   - Single-open ("exclusive"): when the `single` attribute (or the markup's
 *     `data-accordion-single`) is present, opening one panel collapses every
 *     other open panel. APG allows collapsing the last open panel — we do not
 *     force one to stay open.
 *   - Header roving: Arrow Up/Down move focus between ENABLED headers (wrapping);
 *     Home/End jump to the first/last enabled header. Disabled headers are
 *     skipped and cannot toggle.
 *   - A visually-hidden polite live region announces "<label> expanded" /
 *     "<label> collapsed".
 *
 * Authoring options (markup):
 *   1. Author the full canonical markup as light-DOM children — the component
 *      detects existing `.hisd-accordion__item`s and only wires behaviour,
 *      leaving your markup (ids, ARIA, initial open state) intact. Most faithful.
 *   2. Provide an `items` attribute: a JSON array of
 *      { value, label, content, disabled?, open? }. The component builds the
 *      canonical markup for you.
 *
 * Reflected attributes:
 *   single (boolean — exclusive/single-open mode), disabled (boolean — disables
 *   the WHOLE widget's keyboard/click wiring; per-item disabling is via each
 *   trigger's own `disabled`), value (comma-separated list of currently open
 *   item values; reflected as the open set changes).
 *
 * Events: emits a bubbling `change` CustomEvent with
 * `detail: { value, open }` whenever a panel toggles, where `value` is the
 * toggled item's value and `open` its new state.
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-accordion")) {
    return;
  }

  let uid = 0;

  class HisdAccordion extends HTMLElement {
    static get observedAttributes() {
      return ["single", "disabled"];
    }

    constructor() {
      super();
      /** @type {string} */
      this._id = `hisd-accordion-${(uid += 1)}`;
      /** @type {HTMLButtonElement[]} All triggers (incl. disabled). */
      this._allTriggers = [];
      /** @type {HTMLButtonElement[]} Enabled triggers only. */
      this._triggers = [];
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
      this._collectTriggers();
      this._bind();
      // Reflect the initial open set to the `value` attribute without firing
      // change on first paint.
      this._reflectValue();
    }

    disconnectedCallback() {
      this._unbind();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this._rendered) {
        return;
      }
      switch (name) {
        case "single":
          // Entering single mode with multiple panels open: collapse all but
          // the first currently-open panel.
          if (this.hasAttribute("single")) {
            this._enforceSingle();
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
    get single() {
      return this.hasAttribute("single");
    }
    set single(next) {
      if (next) {
        this.setAttribute("single", "");
      } else {
        this.removeAttribute("single");
      }
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

    /** The set of currently-open item values, as an array. */
    get value() {
      return this._allTriggers
        .filter((t) => t.getAttribute("aria-expanded") === "true")
        .map((t) => this._valueOf(t));
    }
    set value(next) {
      const wanted = new Set(
        Array.isArray(next)
          ? next.map(String)
          : next == null
            ? []
            : String(next)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
      );
      this._allTriggers.forEach((t) => {
        const shouldOpen = wanted.has(this._valueOf(t)) && !this._isDisabled(t);
        this._setExpanded(t, shouldOpen);
      });
      if (this.hasAttribute("single")) {
        this._enforceSingle();
      }
      this._reflectValue();
    }

    /* ----------------------------------------------------------------------
       Rendering — either adopt authored markup or build it from `items`.
       ---------------------------------------------------------------------- */
    _render() {
      // 1. If the author already provided canonical markup, adopt it as-is.
      // Honour the markup's `data-accordion-single` as the single-open opt-in.
      if (this.querySelector(".hisd-accordion__item")) {
        this._authored = true;
        if (
          this.querySelector("[data-accordion-single]") ||
          this.hasAttribute("data-accordion-single")
        ) {
          this.setAttribute("single", "");
        }
        this._ensureLiveRegion();
        return;
      }

      // 2. Otherwise build the markup from the `items` JSON attribute.
      const items = this._parseItems();
      this.innerHTML = "";
      this.classList.add("hisd-accordion");

      const frag = document.createDocumentFragment();

      items.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          return;
        }
        const val = item.value != null ? String(item.value) : String(index);
        const triggerElId = `${this._id}-trigger-${val}`;
        const panelElId = `${this._id}-panel-${val}`;
        const isDisabled = Boolean(item.disabled);
        const isOpen = Boolean(item.open) && !isDisabled;

        const itemEl = document.createElement("div");
        itemEl.className = "hisd-accordion__item";

        const heading = document.createElement("h3");
        heading.className = "hisd-accordion__heading";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "hisd-accordion__trigger";
        button.id = triggerElId;
        button.setAttribute("aria-controls", panelElId);
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        button.dataset.value = val;
        if (isDisabled) {
          button.disabled = true;
        }

        const label = document.createElement("span");
        label.className = "hisd-accordion__label";
        label.textContent = item.label != null ? String(item.label) : "";
        button.appendChild(label);

        const chevron = document.createElement("span");
        chevron.className = "hisd-accordion__chevron";
        chevron.setAttribute("aria-hidden", "true");
        button.appendChild(chevron);

        heading.appendChild(button);
        itemEl.appendChild(heading);

        const panel = document.createElement("div");
        panel.className = "hisd-accordion__panel";
        panel.setAttribute("role", "region");
        panel.id = panelElId;
        panel.setAttribute("aria-labelledby", triggerElId);
        if (!isOpen) {
          panel.hidden = true;
        }
        // Content may be a plain string or a trusted HTML snippet.
        if (item.content != null) {
          panel.innerHTML = String(item.content);
        }
        itemEl.appendChild(panel);

        frag.appendChild(itemEl);
      });

      this.appendChild(frag);
      if (this.hasAttribute("single")) {
        this._enforceSingle();
      }
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
      // needs no extra CSS. Announces which panel expanded/collapsed.
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
       Trigger collection.
       ---------------------------------------------------------------------- */
    _collectTriggers() {
      this._allTriggers = Array.prototype.slice.call(
        this.querySelectorAll(".hisd-accordion__trigger"),
      );
      this._triggers = this._allTriggers.filter((t) => !this._isDisabled(t));
    }

    _isDisabled(trigger) {
      return (
        trigger.disabled || trigger.getAttribute("aria-disabled") === "true"
      );
    }

    _valueOf(trigger) {
      // Authored markup may not carry data-value; fall back to the element id.
      return trigger.dataset.value != null ? trigger.dataset.value : trigger.id;
    }

    _panelFor(trigger) {
      const id = trigger.getAttribute("aria-controls");
      return id ? this.querySelector(`#${CSS.escape(id)}`) : null;
    }

    _setExpanded(trigger, expanded) {
      trigger.setAttribute("aria-expanded", String(expanded));
      const panel = this._panelFor(trigger);
      if (panel) {
        panel.hidden = !expanded;
      }
    }

    /** Collapse all open panels except the first one (single-open invariant). */
    _enforceSingle() {
      let kept = false;
      this._allTriggers.forEach((t) => {
        if (t.getAttribute("aria-expanded") === "true") {
          if (kept) {
            this._setExpanded(t, false);
          } else {
            kept = true;
          }
        }
      });
    }

    /** Reflect the current open set to the `value` attribute (no event). */
    _reflectValue() {
      const open = this.value.join(",");
      if ((this.getAttribute("value") ?? "") !== open) {
        if (open) {
          this.setAttribute("value", open);
        } else {
          this.removeAttribute("value");
        }
      }
    }

    /* ----------------------------------------------------------------------
       Toggle — the core disclosure behaviour (ported from the demo <script>).
       ---------------------------------------------------------------------- */
    _toggle(trigger) {
      if (this._isDisabled(trigger)) {
        return;
      }
      const willExpand = trigger.getAttribute("aria-expanded") !== "true";

      // Single-open: collapse all others first.
      if (this.hasAttribute("single") && willExpand) {
        this._allTriggers.forEach((other) => {
          if (
            other !== trigger &&
            other.getAttribute("aria-expanded") === "true"
          ) {
            this._setExpanded(other, false);
          }
        });
      }

      this._setExpanded(trigger, willExpand);
      this._reflectValue();
      this._announce(trigger, willExpand);

      this.dispatchEvent(
        new CustomEvent("change", {
          bubbles: true,
          composed: true,
          detail: { value: this._valueOf(trigger), open: willExpand },
        }),
      );
    }

    _announce(trigger, expanded) {
      if (!this._liveRegion) {
        return;
      }
      const label = trigger.querySelector(".hisd-accordion__label");
      const name = (label ? label.textContent : trigger.textContent).trim();
      this._liveRegion.textContent =
        name + (expanded ? " expanded" : " collapsed");
    }

    /* ----------------------------------------------------------------------
       Event wiring — ported from the demo <script>.
       ---------------------------------------------------------------------- */
    _bind() {
      if (this.hasAttribute("disabled")) {
        return;
      }
      // Delegate click + keydown on the host so dynamically added items work and
      // there's a single pair of listeners to remove on disconnect.
      this.addEventListener("click", this._onClick);
      this.addEventListener("keydown", this._onKeyDown);
    }

    _unbind() {
      this.removeEventListener("click", this._onClick);
      this.removeEventListener("keydown", this._onKeyDown);
    }

    _onClick(event) {
      const trigger =
        event.target && event.target.closest
          ? event.target.closest(".hisd-accordion__trigger")
          : null;
      if (!trigger || !this.contains(trigger)) {
        return;
      }
      this._toggle(trigger);
    }

    _onKeyDown(event) {
      const current =
        event.target && event.target.closest
          ? event.target.closest(".hisd-accordion__trigger")
          : null;
      if (!current || !this.contains(current)) {
        return;
      }

      // Recompute enabled triggers in DOM order (markup may have changed).
      const enabled = this._allTriggers.filter((t) => !this._isDisabled(t));
      const index = enabled.indexOf(current);
      if (index === -1) {
        return;
      }

      let next = null;
      switch (event.key) {
        case "ArrowDown":
          next = enabled[(index + 1) % enabled.length];
          break;
        case "ArrowUp":
          next = enabled[(index - 1 + enabled.length) % enabled.length];
          break;
        case "Home":
          next = enabled[0];
          break;
        case "End":
          next = enabled[enabled.length - 1];
          break;
        default:
          return; // Enter/Space/Tab → native button handling
      }

      event.preventDefault();
      next.focus();
    }
  }

  customElements.define("hisd-accordion", HisdAccordion);
})();
