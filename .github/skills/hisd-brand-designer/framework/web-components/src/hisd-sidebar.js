/**
 * <hisd-sidebar> — framework-agnostic Web Component wrapper around the HISD
 * design-system `sidebar` navigation component.
 *
 * LIGHT DOM by design: the element renders the `hisd-sidebar*` markup into
 * ITSELF (no shadow root) so the global design-system CSS
 * (assets/hisd-theme.css + components/components.css → sidebar.css) styles it.
 * This wrapper never re-implements styling — it is a thin behaviour + markup
 * layer that mirrors components/sidebar.html exactly: same classes, same ARIA.
 *
 * Faithful to components/sidebar.html:
 *   - Root is rendered as <nav class="hisd-sidebar" aria-label="…"> inside the
 *     host (the host stays a plain custom element).
 *   - Grouped sections: <div.hisd-sidebar__group> with an
 *     <h3.hisd-sidebar__heading> and a <ul.hisd-sidebar__list aria-labelledby>.
 *   - Items: <li.hisd-sidebar__item> → <a.hisd-sidebar__link> with an optional
 *     leading icon (<svg class="hisd-sidebar__icon" aria-hidden focusable="false">),
 *     a .hisd-sidebar__label and an optional trailing .hisd-sidebar__badge.
 *   - Active link: aria-current="page" is the single source of truth.
 *   - Disabled link: aria-disabled="true" + tabindex="-1", and activation
 *     (click + Enter/Space) is intercepted/prevented since aria-disabled links
 *     are not natively inert.
 *   - Roving keyboard support per the WAI-ARIA APG, ported from the demo
 *     <script>: ArrowDown/ArrowUp wrap through enabled links, Home/End jump to
 *     the first/last. The component is fully usable without it (native Tab order
 *     reaches every link).
 *   - prefers-reduced-motion / forced-colors are honoured by the CSS already.
 *
 * Authoring options (markup):
 *   - Provide author markup directly (your own .hisd-sidebar__group / list /
 *     link nodes as children): they are preserved and only behaviour is wired.
 *   - Or set the `groups` attribute to a JSON array of
 *     { heading, items: [{ label, href?, current?, disabled?, icon?, badge? }] }
 *     and the component builds the markup for you.
 *
 * Reflected attributes:
 *   label (→ the nav's aria-label), groups (JSON), roving-keyboard (boolean,
 *   default on — set roving-keyboard="false" to disable).
 *
 * Events: re-emits a bubbling `hisd-select` CustomEvent when an enabled link is
 * activated, with `detail: { href, label }`.
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-sidebar")) {
    return;
  }

  let uid = 0;

  class HisdSidebar extends HTMLElement {
    static get observedAttributes() {
      return ["label", "groups", "roving-keyboard"];
    }

    constructor() {
      super();
      /** @type {HTMLElement | null} */
      this._nav = null;
      /** @type {string} */
      this._id = `hisd-sidebar-${(uid += 1)}`;
      /**
       * Author-supplied markup captured before first render (used when no
       * `groups` JSON is provided).
       * @type {Node[]}
       */
      this._authoredNodes = [];
      this._rendered = false;
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onClick = this._onClick.bind(this);
    }

    connectedCallback() {
      if (!this._rendered) {
        this._captureAuthoredNodes();
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
          if (this._nav) {
            this._nav.setAttribute("aria-label", newValue ?? "");
          }
          break;
        case "groups":
          // Rebuild from the new JSON (author markup is ignored once `groups`
          // is supplied). Re-bind because the link nodes were replaced.
          this._unbind();
          this._render();
          this._bind();
          break;
        case "roving-keyboard":
          // Read live in the keydown handler; nothing to re-render.
          break;
        default:
          break;
      }
    }

    /* ----------------------------------------------------------------------
       Public property accessors.
       ---------------------------------------------------------------------- */
    get label() {
      return this.getAttribute("label") ?? "";
    }
    set label(next) {
      this.setAttribute("label", next == null ? "" : String(next));
    }

    /** Whether roving Arrow/Home/End keyboard navigation is enabled. */
    get rovingKeyboard() {
      return this.getAttribute("roving-keyboard") !== "false";
    }
    set rovingKeyboard(next) {
      this.setAttribute("roving-keyboard", next ? "true" : "false");
    }

    /** Direct access to the underlying <nav>. */
    get nav() {
      return this._nav;
    }

    /* ----------------------------------------------------------------------
       Rendering — builds the hisd-sidebar markup in light DOM.
       ---------------------------------------------------------------------- */
    _captureAuthoredNodes() {
      this._authoredNodes = Array.prototype.slice.call(this.childNodes);
    }

    _render() {
      this.innerHTML = "";

      const nav = document.createElement("nav");
      nav.className = "hisd-sidebar";
      nav.setAttribute("aria-label", this.getAttribute("label") ?? "");
      this._nav = nav;

      const json = this.getAttribute("groups");
      if (json) {
        this._renderGroupsFromJson(nav, json);
      } else if (this._authoredNodes.length > 0) {
        // Preserve the author's own .hisd-sidebar__* markup verbatim; we only
        // wire behaviour onto it. If the author wrapped everything in their own
        // <nav.hisd-sidebar>, unwrap it so we don't double-nest landmarks.
        const single = this._authoredNodes.filter(
          (n) => n.nodeType === Node.ELEMENT_NODE,
        );
        const onlyNav =
          single.length === 1 &&
          /** @type {Element} */ (single[0]).classList &&
          /** @type {Element} */ (single[0]).classList.contains("hisd-sidebar");
        if (onlyNav) {
          const authored = /** @type {HTMLElement} */ (single[0]);
          if (!authored.hasAttribute("aria-label") && this.hasAttribute("label")) {
            authored.setAttribute("aria-label", this.getAttribute("label") ?? "");
          }
          this.appendChild(authored);
          this._nav = authored;
          return;
        }
        this._authoredNodes.forEach((node) => nav.appendChild(node));
      }

      this.appendChild(nav);
    }

    _renderGroupsFromJson(nav, json) {
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch (err) {
        return;
      }
      if (!Array.isArray(parsed)) {
        return;
      }
      parsed.forEach((group, groupIndex) => {
        if (!group || typeof group !== "object") {
          return;
        }
        const groupEl = document.createElement("div");
        groupEl.className = "hisd-sidebar__group";

        const headingId = `${this._id}-grp-${groupIndex}`;
        const heading = document.createElement("h3");
        heading.className = "hisd-sidebar__heading";
        heading.id = headingId;
        heading.textContent = group.heading != null ? String(group.heading) : "";
        groupEl.appendChild(heading);

        const list = document.createElement("ul");
        list.className = "hisd-sidebar__list";
        list.setAttribute("aria-labelledby", headingId);

        const items = Array.isArray(group.items) ? group.items : [];
        items.forEach((item) => {
          if (!item || typeof item !== "object") {
            return;
          }
          list.appendChild(this._buildItem(item));
        });

        groupEl.appendChild(list);
        nav.appendChild(groupEl);
      });
    }

    _buildItem(item) {
      const li = document.createElement("li");
      li.className = "hisd-sidebar__item";

      const link = document.createElement("a");
      link.className = "hisd-sidebar__link";

      const disabled = item.disabled === true;
      if (!disabled && item.href != null) {
        link.setAttribute("href", String(item.href));
      }
      if (item.current === true) {
        link.setAttribute("aria-current", "page");
      }
      if (disabled) {
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "-1");
      }

      // Optional leading icon. Accept raw SVG/HTML markup for the inner glyph;
      // the class + decorative ARIA are applied to a wrapping <svg>-like element
      // only when the author passes a full <svg>; otherwise wrap in a span.
      if (item.icon != null && item.icon !== "") {
        link.appendChild(this._buildIcon(String(item.icon)));
      }

      const label = document.createElement("span");
      label.className = "hisd-sidebar__label";
      label.textContent = item.label != null ? String(item.label) : "";
      link.appendChild(label);

      if (item.badge != null && item.badge !== "") {
        const badge = document.createElement("span");
        badge.className = "hisd-sidebar__badge";
        badge.textContent = String(item.badge);
        link.appendChild(badge);
      }

      li.appendChild(link);
      return li;
    }

    /**
     * Build the leading icon node. If the icon string is a full <svg …>, parse
     * it and apply the `hisd-sidebar__icon` class (matching the demo's
     * `<svg class="hisd-sidebar__icon">`); otherwise wrap arbitrary markup in a
     * `<span class="hisd-sidebar__icon">`.
     */
    _buildIcon(markup) {
      const trimmed = markup.trim();
      if (/^<svg[\s>]/i.test(trimmed)) {
        const template = document.createElement("template");
        template.innerHTML = trimmed;
        const svg = template.content.querySelector("svg");
        if (svg) {
          svg.classList.add("hisd-sidebar__icon");
          svg.setAttribute("aria-hidden", "true");
          svg.setAttribute("focusable", "false");
          return svg;
        }
      }
      const span = document.createElement("span");
      span.className = "hisd-sidebar__icon";
      span.setAttribute("aria-hidden", "true");
      span.innerHTML = trimmed;
      return span;
    }

    /* ----------------------------------------------------------------------
       Behaviour — ported from the demo <script> + the disabled-link contract.
       ---------------------------------------------------------------------- */
    _bind() {
      if (!this._nav) {
        return;
      }
      this._nav.addEventListener("keydown", this._onKeyDown);
      this._nav.addEventListener("click", this._onClick);
    }

    _unbind() {
      if (!this._nav) {
        return;
      }
      this._nav.removeEventListener("keydown", this._onKeyDown);
      this._nav.removeEventListener("click", this._onClick);
    }

    /** Enabled links only — disabled links are skipped (demo's enabledLinks). */
    _enabledLinks() {
      if (!this._nav) {
        return [];
      }
      return Array.prototype.filter.call(
        this._nav.querySelectorAll(".hisd-sidebar__link"),
        (el) => el.getAttribute("aria-disabled") !== "true",
      );
    }

    _onKeyDown(event) {
      if (!this.rovingKeyboard || event.defaultPrevented) {
        return;
      }
      const links = this._enabledLinks();
      if (!links.length) {
        return;
      }
      const current = document.activeElement;
      const idx = links.indexOf(current);
      let next = null;

      switch (event.key) {
        case "ArrowDown":
          next = links[idx < 0 ? 0 : (idx + 1) % links.length];
          break;
        case "ArrowUp":
          next = links[idx <= 0 ? links.length - 1 : idx - 1];
          break;
        case "Home":
          next = links[0];
          break;
        case "End":
          next = links[links.length - 1];
          break;
        default:
          return;
      }

      if (next) {
        event.preventDefault();
        next.focus();
      }
    }

    _onClick(event) {
      const target = /** @type {Element | null} */ (event.target);
      const link = target ? target.closest(".hisd-sidebar__link") : null;
      if (!link) {
        return;
      }
      // aria-disabled links are not natively inert: intercept activation.
      if (link.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const labelEl = link.querySelector(".hisd-sidebar__label");
      this.dispatchEvent(
        new CustomEvent("hisd-select", {
          bubbles: true,
          detail: {
            href: link.getAttribute("href"),
            label: labelEl
              ? labelEl.textContent
              : (link.textContent || "").trim(),
          },
        }),
      );
    }
  }

  customElements.define("hisd-sidebar", HisdSidebar);
})();
