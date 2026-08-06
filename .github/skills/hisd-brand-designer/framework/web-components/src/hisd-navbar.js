/**
 * <hisd-navbar> — framework-agnostic Web Component wrapper around the HISD
 * design-system `navbar` component.
 *
 * LIGHT DOM by design: the element renders the `hisd-navbar*` markup into
 * ITSELF (no shadow root) so the global design-system CSS
 * (assets/hisd-theme.css + components/components.css -> navbar.css) styles it.
 * This wrapper never re-implements styling — it is a thin behaviour + markup
 * layer that mirrors components/navbar.html exactly: same classes, same ARIA.
 *
 * The bar itself needs no JS: links are plain <a> (or <button> for actions), the
 * active link is styled purely from aria-current="page", and hover/focus are
 * CSS. The only scripted behaviour is the mobile drawer, ported from the demo
 * <script> per WAI-ARIA APG "Dialog (Modal)":
 *
 *   - The hamburger <button> toggles the dialog. Native buttons fire on Enter
 *     and Space, so no extra key handling is needed to OPEN.
 *   - On open: reveal the dialog, set aria-expanded="true", move focus to the
 *     close button, trap Tab / Shift+Tab inside the panel, and announce the
 *     change in a polite live region.
 *   - Escape, the close button, and the scrim all dismiss; focus returns to the
 *     hamburger that opened it.
 *   - Activating a drawer link closes the drawer.
 *   - All listeners are removed in disconnectedCallback.
 *
 * Authoring options (markup):
 *   - Provide the `links` attribute as a JSON array of
 *     { label, href?, current?, disabled? }. The same list is rendered into both
 *     the horizontal bar and the mobile drawer.
 *
 * Reflected attributes:
 *   links (JSON), brand-label, brand-mark, brand-href, skip-link-href,
 *   skip-link-label, nav-label, drawer-title, open-menu-label, close-menu-label,
 *   open (boolean). The `open` attribute / property stays in sync with the live
 *   drawer state.
 *
 * Events: emits a bubbling `hisd-toggle` CustomEvent ({ detail: { open } })
 * whenever the drawer opens or closes.
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-navbar")) {
    return;
  }

  var FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  let uid = 0;

  class HisdNavbar extends HTMLElement {
    static get observedAttributes() {
      return [
        "links",
        "brand-label",
        "brand-mark",
        "brand-href",
        "skip-link-href",
        "skip-link-label",
        "nav-label",
        "drawer-title",
        "open-menu-label",
        "close-menu-label",
        "open",
      ];
    }

    constructor() {
      super();
      this._uid = (uid += 1);
      this._drawerId = `hisd-drawer-${this._uid}`;
      this._drawerTitleId = `${this._drawerId}-title`;
      this._rendered = false;

      /** @type {HTMLButtonElement | null} */ this._toggle = null;
      /** @type {HTMLElement | null} */ this._drawer = null;
      /** @type {HTMLElement | null} */ this._panel = null;
      /** @type {HTMLButtonElement | null} */ this._close = null;
      /** @type {HTMLElement | null} */ this._live = null;

      this._onToggleClick = this._onToggleClick.bind(this);
      this._onDismiss = this._onDismiss.bind(this);
      this._onPanelLinkClick = this._onPanelLinkClick.bind(this);
      this._onKeydown = this._onKeydown.bind(this);
    }

    connectedCallback() {
      if (!this._rendered) {
        this._render();
        this._rendered = true;
      }
      this._bind();
      this._syncOpen();
    }

    disconnectedCallback() {
      this._unbind();
      // The capture-phase keydown listener may still be attached if the element
      // is removed while the drawer is open.
      document.removeEventListener("keydown", this._onKeydown, true);
      if (this._live && this._live.parentNode) {
        this._live.parentNode.removeChild(this._live);
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this._rendered) {
        return;
      }
      if (name === "open") {
        this._syncOpen();
        return;
      }
      // Any content/label attribute change re-renders the markup. Rebind so the
      // fresh nodes carry the listeners.
      this._unbind();
      this._render();
      this._bind();
      this._syncOpen();
    }

    /* ----------------------------------------------------------------------
       Public property accessors.
       ---------------------------------------------------------------------- */
    get open() {
      return this.hasAttribute("open");
    }
    set open(next) {
      if (next) {
        this.setAttribute("open", "");
      } else {
        this.removeAttribute("open");
      }
    }

    get links() {
      return this._parseLinks();
    }
    set links(next) {
      this.setAttribute(
        "links",
        Array.isArray(next) ? JSON.stringify(next) : String(next || ""),
      );
    }

    /* ----------------------------------------------------------------------
       Rendering — builds the hisd-navbar markup in light DOM.
       ---------------------------------------------------------------------- */
    _attr(name, fallback) {
      var value = this.getAttribute(name);
      return value == null ? fallback : value;
    }

    _parseLinks() {
      var json = this.getAttribute("links");
      if (!json) {
        return [];
      }
      try {
        var parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        return [];
      }
    }

    _esc(value) {
      var div = document.createElement("div");
      div.textContent = value == null ? "" : String(value);
      return div.innerHTML;
    }

    _renderLink(link, panel) {
      var label = this._esc(link && link.label != null ? link.label : "");
      var cls = panel ? "hisd-navbar__panel-link" : "hisd-navbar__link";
      var current = link && link.current ? ' aria-current="page"' : "";
      var attrs = panel
        ? ' data-hisd-panel-link=""'
        : "";
      if (link && link.href != null) {
        var disabled =
          link && link.disabled ? ' aria-disabled="true"' : "";
        var inner =
          '<a class="' +
          cls +
          '" href="' +
          this._esc(link.href) +
          '"' +
          current +
          disabled +
          attrs +
          ">" +
          label +
          "</a>";
      } else {
        var dis = link && link.disabled ? " disabled" : "";
        var inner =
          '<button type="button" class="' +
          cls +
          '"' +
          current +
          dis +
          attrs +
          ">" +
          label +
          "</button>";
      }
      return panel ? "<li>" + inner + "</li>" : '<li class="hisd-navbar__item">' + inner + "</li>";
    }

    _render() {
      var self = this;
      var links = this._parseLinks();
      var brandLabel = this._attr("brand-label", "Houston ISD");
      var brandMark = this._attr("brand-mark", "H");
      var brandHref = this._attr("brand-href", "/");
      var skipHref = this.getAttribute("skip-link-href");
      var skipLabel = this._attr("skip-link-label", "Skip to main content");
      var navLabel = this._attr("nav-label", "Main");
      var drawerTitle = this._attr("drawer-title", "Menu");
      var openLabel = this._attr("open-menu-label", "Open main menu");
      var closeLabel = this._attr("close-menu-label", "Close main menu");

      var barLinks = links
        .map(function (link) {
          return self._renderLink(link, false);
        })
        .join("");
      var panelLinks = links
        .map(function (link) {
          return self._renderLink(link, true);
        })
        .join("");

      var skipLink = skipHref
        ? '<a class="hisd-navbar__skip-link" href="' +
          this._esc(skipHref) +
          '">' +
          this._esc(skipLabel) +
          "</a>"
        : "";

      this.innerHTML =
        skipLink +
        '<nav class="hisd-navbar" aria-label="' +
        this._esc(navLabel) +
        '" data-hisd-navbar>' +
        '<a class="hisd-navbar__brand" href="' +
        this._esc(brandHref) +
        '">' +
        '<span class="hisd-navbar__brand-mark" aria-hidden="true">' +
        this._esc(brandMark) +
        "</span>" +
        "<span>" +
        this._esc(brandLabel) +
        "</span>" +
        "</a>" +
        '<ul class="hisd-navbar__list">' +
        barLinks +
        "</ul>" +
        '<div class="hisd-navbar__actions">' +
        '<button type="button" class="hisd-navbar__toggle"' +
        ' aria-label="' +
        this._esc(openLabel) +
        '" aria-haspopup="dialog" aria-expanded="false"' +
        ' aria-controls="' +
        this._drawerId +
        '">' +
        '<span class="hisd-navbar__toggle-icon" aria-hidden="true"></span>' +
        "</button>" +
        "</div>" +
        '<div class="hisd-navbar__drawer" id="' +
        this._drawerId +
        '" role="dialog" aria-modal="true" aria-labelledby="' +
        this._drawerTitleId +
        '" hidden>' +
        '<div class="hisd-navbar__scrim" data-hisd-dismiss></div>' +
        '<div class="hisd-navbar__panel">' +
        '<div class="hisd-navbar__panel-header">' +
        '<h2 class="hisd-navbar__panel-title" id="' +
        this._drawerTitleId +
        '">' +
        this._esc(drawerTitle) +
        "</h2>" +
        '<button type="button" class="hisd-navbar__close" aria-label="' +
        this._esc(closeLabel) +
        '" data-hisd-dismiss>' +
        '<span class="hisd-navbar__close-icon" aria-hidden="true"></span>' +
        "</button>" +
        "</div>" +
        '<ul class="hisd-navbar__panel-list">' +
        panelLinks +
        "</ul>" +
        "</div>" +
        "</div>" +
        "</nav>";

      this._nav = this.querySelector(".hisd-navbar");
      this._toggle = this.querySelector(".hisd-navbar__toggle");
      this._drawer = this.querySelector(".hisd-navbar__drawer");
      this._panel = this.querySelector(".hisd-navbar__panel");
      this._close = this.querySelector(".hisd-navbar__close");

      // A single polite live region appended to <body> (mirrors the demo's
      // page-level live region) so AT hears drawer open / close.
      if (!this._live) {
        var live = document.createElement("div");
        live.setAttribute("aria-live", "polite");
        live.style.cssText =
          "position:absolute;width:1px;height:1px;padding:0;margin:0;" +
          "overflow:hidden;clip-path:inset(50%);white-space:nowrap;";
        document.body.appendChild(live);
        this._live = live;
      }
    }

    /* ----------------------------------------------------------------------
       Behaviour — ported from the demo <script>.
       ---------------------------------------------------------------------- */
    _bind() {
      if (this._toggle) {
        this._toggle.addEventListener("click", this._onToggleClick);
      }
      if (this._drawer) {
        var dismissers = this._drawer.querySelectorAll("[data-hisd-dismiss]");
        for (var i = 0; i < dismissers.length; i += 1) {
          dismissers[i].addEventListener("click", this._onDismiss);
        }
      }
      if (this._panel) {
        var panelLinks = this._panel.querySelectorAll("[data-hisd-panel-link]");
        for (var j = 0; j < panelLinks.length; j += 1) {
          panelLinks[j].addEventListener("click", this._onPanelLinkClick);
        }
      }
    }

    _unbind() {
      if (this._toggle) {
        this._toggle.removeEventListener("click", this._onToggleClick);
      }
      if (this._drawer) {
        var dismissers = this._drawer.querySelectorAll("[data-hisd-dismiss]");
        for (var i = 0; i < dismissers.length; i += 1) {
          dismissers[i].removeEventListener("click", this._onDismiss);
        }
      }
      if (this._panel) {
        var panelLinks = this._panel.querySelectorAll("[data-hisd-panel-link]");
        for (var j = 0; j < panelLinks.length; j += 1) {
          panelLinks[j].removeEventListener("click", this._onPanelLinkClick);
        }
      }
    }

    _announce(message) {
      if (this._live) {
        this._live.textContent = message;
      }
    }

    _isOpen() {
      return this.hasAttribute("open");
    }

    _onToggleClick() {
      if (this._isOpen()) {
        this._closeDrawer();
      } else {
        this._openDrawer();
      }
    }

    _onDismiss(event) {
      if (event) {
        event.preventDefault();
      }
      this._closeDrawer();
    }

    _onPanelLinkClick() {
      // Activating a drawer link closes the drawer (the link still navigates).
      this._closeDrawer();
    }

    _openDrawer() {
      this.setAttribute("open", "");
      // _syncOpen (via attributeChangedCallback) reveals the drawer + sets ARIA
      // and moves focus, then we announce.
      this._announce("Main menu opened");
      this.dispatchEvent(
        new CustomEvent("hisd-toggle", {
          bubbles: true,
          detail: { open: true },
        }),
      );
    }

    _closeDrawer() {
      var wasOpen = this._isOpen();
      this.removeAttribute("open");
      this._announce("Main menu closed");
      // Return focus to the trigger per the APG.
      if (this._toggle) {
        this._toggle.focus();
      }
      if (wasOpen) {
        this.dispatchEvent(
          new CustomEvent("hisd-toggle", {
            bubbles: true,
            detail: { open: false },
          }),
        );
      }
    }

    /** Reflect the `open` attribute onto the live DOM + key/focus listeners. */
    _syncOpen() {
      var open = this._isOpen();
      if (this._nav) {
        if (open) {
          this._nav.setAttribute("data-open", "true");
        } else {
          this._nav.removeAttribute("data-open");
        }
      }
      if (this._drawer) {
        this._drawer.hidden = !open;
      }
      if (this._toggle) {
        this._toggle.setAttribute("aria-expanded", open ? "true" : "false");
      }

      if (open) {
        document.addEventListener("keydown", this._onKeydown, true);
        // Move focus into the dialog (the close button is a safe landing).
        if (this._close) {
          this._close.focus();
        }
      } else {
        document.removeEventListener("keydown", this._onKeydown, true);
      }
    }

    _visibleFocusable() {
      if (!this._panel) {
        return [];
      }
      return Array.prototype.filter.call(
        this._panel.querySelectorAll(FOCUSABLE),
        function (el) {
          return el.offsetParent !== null || el === document.activeElement;
        },
      );
    }

    _onKeydown(event) {
      if (!this._isOpen()) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this._closeDrawer();
        return;
      }

      // Tab trap: keep focus cycling within the panel.
      if (event.key === "Tab") {
        var items = this._visibleFocusable();
        if (items.length === 0) {
          return;
        }
        var first = items[0];
        var last = items[items.length - 1];
        var active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        } else if (this._panel && !this._panel.contains(active)) {
          // Focus escaped the panel — pull it back in.
          event.preventDefault();
          first.focus();
        }
      }
    }
  }

  customElements.define("hisd-navbar", HisdNavbar);
})();
