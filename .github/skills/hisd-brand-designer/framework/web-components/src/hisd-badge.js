/**
 * <hisd-badge> — framework-agnostic Web Component wrapper for the HISD Badge.
 *
 * This is a THIN behavior + markup layer over the design-system CSS. It renders
 * into LIGHT DOM (no shadow root) so the global stylesheets — assets/hisd-theme.css
 * + components/badge.css (or the bundled components.css) — style it directly. It
 * never re-implements visuals; it only applies the canonical `hisd-badge` class
 * names + the correct ARIA, and ports the demo's <script> behavior faithfully:
 *
 *   - PRESENTATIONAL (`aria-hidden`) when the value is also carried by adjacent
 *     text/context; SOLE CARRIER (`aria-label="[n] notifications"`) when it is
 *     the only copy of the count; status badges read their visible text as the
 *     accessible name (neither hidden nor labelled).
 *   - The dynamic SOLE-CARRIER count (the demo's setCount): when `count`
 *     changes, keep `aria-label="[n] notifications"` in sync, relax to the
 *     `hisd-badge--multi` pill at 2+ digits, and announce the change through a
 *     shared polite live region — a silent text swap is not conveyed to AT.
 *   - The `host` shape renders the attached overlay: an interactive icon
 *     <button class="hisd-badge-host"> naming its own action with the badge
 *     positioned in the top-inline-end corner. Native buttons fire click on
 *     Enter/Space, so no custom keyboard wiring is needed.
 *
 * Reflected attributes:
 *   - variant        — count (default) | success | warning | info | danger
 *   - count          — number; managed sole-carrier count (auto label + announce)
 *   - count-noun     — singular noun for the label/announcement (default "notification")
 *   - shape          — auto (default) | multi | dot
 *   - dot            — boolean; shorthand for shape="dot" (always presentational)
 *   - multi          — boolean; shorthand for shape="multi" (force wide pill)
 *   - presentational — boolean; force aria-hidden (value is also in context)
 *   - label          — string; explicit sole-carrier aria-label / host action name
 *   - host           — boolean; render the interactive icon-button overlay shape
 *
 * Events (composed, bubbling):
 *   - hisd-badge-activate  detail: { value }   (only when shape is `host`)
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || !("customElements" in window)) return;
  if (customElements.get("hisd-badge")) return; // guard against double-definition

  var BADGE = "hisd-badge";
  var BADGE_MULTI = "hisd-badge--multi";
  var BADGE_DOT = "hisd-badge--dot";
  var BADGE_HOST = "hisd-badge-host";
  var BADGE_HOST_ICON = "hisd-badge-host__icon";
  var LIVE_ID = "hisd-badge-live";

  var VARIANT_CLASS = {
    success: "hisd-badge--success",
    warning: "hisd-badge--warning",
    info: "hisd-badge--info",
    danger: "hisd-badge--danger",
  };

  function isTruthyAttr(value) {
    // Boolean-attribute semantics: present (even "") is true, "false" is false.
    return value !== null && value !== undefined && value !== "false";
  }

  /** Lazily create the shared polite live region (mirrors #badge-live). */
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

  class HisdBadge extends HTMLElement {
    static get observedAttributes() {
      return [
        "variant",
        "count",
        "count-noun",
        "shape",
        "dot",
        "multi",
        "presentational",
        "label",
        "host",
      ];
    }

    constructor() {
      super();
      this._rendered = false;
      /** @type {HTMLElement|null} the .hisd-badge span. */
      this._badge = null;
      /** @type {HTMLButtonElement|null} the .hisd-badge-host button (host shape). */
      this._host = null;
      this._announceArmed = false; // skip announcing the initial mount value
      this._onHostClick = this._onHostClick.bind(this);
    }

    /* ---- property <-> attribute reflection -------------------------------- */

    get variant() {
      return this.getAttribute("variant") || "count";
    }
    set variant(v) {
      if (v == null || v === "count") this.removeAttribute("variant");
      else this.setAttribute("variant", v);
    }

    get count() {
      var raw = this.getAttribute("count");
      return raw == null ? undefined : Number(raw);
    }
    set count(v) {
      if (v == null) this.removeAttribute("count");
      else this.setAttribute("count", String(v));
    }

    get shape() {
      return this.getAttribute("shape") || "auto";
    }
    set shape(v) {
      if (v == null || v === "auto") this.removeAttribute("shape");
      else this.setAttribute("shape", v);
    }

    get dot() {
      return isTruthyAttr(this.getAttribute("dot")) || this.shape === "dot";
    }
    set dot(v) {
      this._reflectBool("dot", v);
    }

    get multi() {
      return isTruthyAttr(this.getAttribute("multi"));
    }
    set multi(v) {
      this._reflectBool("multi", v);
    }

    get presentational() {
      return isTruthyAttr(this.getAttribute("presentational"));
    }
    set presentational(v) {
      this._reflectBool("presentational", v);
    }

    get host() {
      return isTruthyAttr(this.getAttribute("host"));
    }
    set host(v) {
      this._reflectBool("host", v);
    }

    get label() {
      return this.getAttribute("label");
    }
    set label(v) {
      if (v == null) this.removeAttribute("label");
      else this.setAttribute("label", v);
    }

    _reflectBool(name, v) {
      if (v) this.setAttribute(name, "");
      else this.removeAttribute(name);
    }

    /* ---- lifecycle -------------------------------------------------------- */

    connectedCallback() {
      if (!this._rendered) {
        // Capture authored text before we overwrite our own children. Managed
        // `count` takes precedence over this when present.
        this._initialText =
          this.getAttribute("label-text") || this.textContent.trim() || "";
        this._render();
        this._rendered = true;
      }
    }

    disconnectedCallback() {
      this._teardownListeners();
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!this._rendered || oldVal === newVal) return;

      // Cheap path: a managed-count change on an already-rendered badge only
      // needs the text/label/--multi sync + a polite announcement (setCount).
      if (name === "count" && this._badge && !this.host) {
        this._applyCount();
        return;
      }
      // Structural changes (variant/shape/host/etc.) → re-render.
      this._render();
    }

    /* ---- rendering -------------------------------------------------------- */

    _render() {
      this._teardownListeners();

      if (this.host) {
        this._renderHost();
      } else {
        this.replaceChildren();
        this._host = null;
        this._badge = this._buildBadge();
        this.appendChild(this._badge);
      }
    }

    /** Build the bare .hisd-badge span with classes, content, and ARIA. */
    _buildBadge() {
      var span = document.createElement("span");
      this._badge = span;
      this._applyBadge(span);
      return span;
    }

    /** Apply classes + content + ARIA to a badge span (used on build + re-render). */
    _applyBadge(span) {
      var isDot = this.dot;
      var managed = this.count !== undefined;

      // Visible content: managed count number, else authored text.
      var content = managed ? String(this.count) : this._initialText;
      var text = content == null ? "" : String(content);

      // Wide multi-digit pill: forced by `multi`/shape, else derived from the
      // rendered length (a 2+ char count/string), per the demo's setCount.
      var wide =
        !isDot &&
        (this.multi ||
          this.shape === "multi" ||
          (this.shape === "auto" && text.length > 1));

      var classes = [BADGE];
      var variantClass = VARIANT_CLASS[this.variant];
      if (variantClass) classes.push(variantClass);
      if (wide) classes.push(BADGE_MULTI);
      if (isDot) classes.push(BADGE_DOT);
      span.className = classes.join(" ");

      span.textContent = isDot ? "" : text;

      // ARIA: dot is always presentational; a managed/explicit sole-carrier
      // badge is labelled; an explicitly-presentational badge is aria-hidden.
      var ariaLabel = managed ? this._soleLabel(this.count) : this.label;
      var hidden = isDot || this.presentational;

      if (ariaLabel) {
        span.setAttribute("aria-label", ariaLabel);
      } else {
        span.removeAttribute("aria-label");
      }
      // A labelled sole-carrier badge must NOT also be hidden.
      if (hidden && !ariaLabel) span.setAttribute("aria-hidden", "true");
      else span.removeAttribute("aria-hidden");

      // Establish the initial managed value WITHOUT announcing it; the first
      // subsequent count change (the cheap _applyCount path) then announces.
      if (managed) this._announceArmed = true;
    }

    /** The "[n] notifications" sole-carrier label, mirroring the demo. */
    _soleLabel(n) {
      var noun = this.getAttribute("count-noun") || "notification";
      return n + " " + noun + (n === 1 ? "" : "s");
    }

    /**
     * Cheap managed-count update (the demo's setCount): swap the text, keep the
     * aria-label in sync, toggle --multi at 2+ digits, then announce politely.
     */
    _applyCount() {
      var badge = this._badge;
      if (!badge) return;
      var n = this.count;
      var str = String(n);

      badge.textContent = str;
      badge.setAttribute("aria-label", this._soleLabel(n));
      // 2+ digits relax to the multi-digit pill so wide content is not clipped.
      var wide = this.multi || this.shape === "multi" || str.length > 1;
      badge.classList.toggle(BADGE_MULTI, wide);

      // Announce on real changes, not the initial mount value.
      if (this._announceArmed) announce(this._soleLabel(n));
      this._announceArmed = true;
    }

    /**
     * Render the attached-overlay host shape: an interactive icon <button> that
     * names its own action, holding the icon glyph + the overlay badge.
     */
    _renderHost() {
      this.replaceChildren();

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = BADGE_HOST;
      var action = this.label || this.getAttribute("aria-label");
      if (action) btn.setAttribute("aria-label", action);

      var icon = document.createElement("span");
      icon.className = BADGE_HOST_ICON;
      icon.setAttribute("aria-hidden", "true");
      btn.appendChild(icon);

      // The overlay badge. With a managed count it is the sole carrier and gets
      // its "[n] notifications" label; a bare dot host is presentational.
      var badge = this._buildBadge();
      btn.appendChild(badge);

      btn.addEventListener("click", this._onHostClick);

      this._host = btn;
      this.appendChild(btn);
    }

    _teardownListeners() {
      if (this._host) {
        this._host.removeEventListener("click", this._onHostClick);
      }
    }

    /* ---- behavior --------------------------------------------------------- */

    _onHostClick() {
      this.dispatchEvent(
        new CustomEvent("hisd-badge-activate", {
          bubbles: true,
          composed: true,
          detail: { value: this.getAttribute("value") || undefined },
        })
      );
    }
  }

  customElements.define("hisd-badge", HisdBadge);
})();
