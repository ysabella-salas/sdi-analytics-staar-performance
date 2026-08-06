/**
 * HISD Design System — <hisd-avatar> (framework-agnostic Web Component)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-avatar` component. It
 * renders into its own LIGHT DOM (no shadow root) so the global design-system
 * stylesheets style it: load assets/hisd-theme.css then components/components.css
 * (or components/avatar.css) on the page. This element NEVER re-implements
 * styling — it only applies the `hisd-avatar*` classes and the ARIA contract,
 * mirroring components/avatar.html.
 *
 * Markup model (matches avatar.html):
 *   - Static avatar  -> inner <span class="hisd-avatar"> wrapping
 *     <span class="hisd-avatar__media"> with either an
 *     <img class="hisd-avatar__img" alt> (image variant — alt REQUIRED) or a
 *     <span class="hisd-avatar__initials" role="img" aria-label> fallback, plus
 *     an optional <span class="hisd-avatar__status" role="img" aria-label> dot.
 *   - Interactive    -> inner <button class="hisd-avatar hisd-avatar--interactive">
 *     that is icon-only: its aria-label folds in the presence state, the inner
 *     initials/img are decorative (aria-hidden / empty alt), and the dot is
 *     aria-hidden. A native <button> gives Enter/Space activation for free per
 *     the WAI-ARIA APG button pattern, so NO custom keyboard JS is required (the
 *     vanilla demo ships none).
 *
 * Reflected attributes:
 *   - size        — 'sm' | 'md' | 'lg'      (default 'md')
 *   - src         — image URL (image variant when present)
 *   - alt         — required alt for the image variant
 *   - initials    — 1–2 chars for the fallback (when no src)
 *   - name        — person's name (static fallback's accessible name)
 *   - status      — 'success' | 'muted'     (renders the presence dot)
 *   - status-label— accessible name for a static status dot (e.g. "Online")
 *   - interactive — boolean; renders a <button>
 *   - label       — aria-label for the interactive button (REQUIRED, folds in presence)
 *   - disabled    — boolean (interactive only; native button disabled)
 *
 * Events (composed, bubbling): the native <button> 'click' already bubbles; we
 * additionally emit a cancelable `hisd-avatar-activate` CustomEvent on activation
 * so consumers have a framework-neutral hook.
 *
 * Listeners are cleaned up in disconnectedCallback. prefers-reduced-motion /
 * forced-colors are handled by the CSS already.
 * ============================================================================
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !('customElements' in window)) return;
  if (customElements.get('hisd-avatar')) return; // guard double-definition

  var AVATAR = 'hisd-avatar';
  var AVATAR_INTERACTIVE = 'hisd-avatar--interactive';
  var AVATAR_MEDIA = 'hisd-avatar__media';
  var AVATAR_IMG = 'hisd-avatar__img';
  var AVATAR_INITIALS = 'hisd-avatar__initials';
  var AVATAR_STATUS = 'hisd-avatar__status';

  var SIZES = ['sm', 'md', 'lg'];
  var STATUSES = ['success', 'muted'];

  function isTruthyAttr(value) {
    // Boolean-attribute semantics: present (even "") is true, "false" is false.
    return value !== null && value !== undefined && value !== 'false';
  }

  class HisdAvatar extends HTMLElement {
    static get observedAttributes() {
      return [
        'size',
        'src',
        'alt',
        'initials',
        'name',
        'status',
        'status-label',
        'interactive',
        'label',
        'disabled',
      ];
    }

    constructor() {
      super();
      /** @type {HTMLElement|null} The inner span/button root. */
      this._root = null;
      this._connected = false;
      // Bound once so add/removeEventListener pair correctly.
      this._onClick = this._handleClick.bind(this);
    }

    // ---- Property <-> attribute reflection ---------------------------------

    get size() {
      var s = this.getAttribute('size');
      return SIZES.indexOf(s) !== -1 ? s : 'md';
    }
    set size(v) {
      if (v == null || v === 'md') this.removeAttribute('size');
      else this.setAttribute('size', v);
    }

    get src() {
      return this.getAttribute('src');
    }
    set src(v) {
      if (v == null) this.removeAttribute('src');
      else this.setAttribute('src', v);
    }

    get initials() {
      return this.getAttribute('initials');
    }
    set initials(v) {
      if (v == null) this.removeAttribute('initials');
      else this.setAttribute('initials', v);
    }

    get status() {
      var s = this.getAttribute('status');
      return STATUSES.indexOf(s) !== -1 ? s : null;
    }
    set status(v) {
      if (v == null) this.removeAttribute('status');
      else this.setAttribute('status', v);
    }

    get interactive() {
      return isTruthyAttr(this.getAttribute('interactive'));
    }
    set interactive(v) {
      if (v) this.setAttribute('interactive', '');
      else this.removeAttribute('interactive');
    }

    get disabled() {
      return isTruthyAttr(this.getAttribute('disabled'));
    }
    set disabled(v) {
      if (v) this.setAttribute('disabled', '');
      else this.removeAttribute('disabled');
    }

    get label() {
      return this.getAttribute('label');
    }
    set label(v) {
      if (v == null) this.removeAttribute('label');
      else this.setAttribute('label', v);
    }

    // ---- Lifecycle ---------------------------------------------------------

    connectedCallback() {
      this._connected = true;
      this._render();
    }

    disconnectedCallback() {
      this._connected = false;
      this._teardownListeners();
      this._root = null;
    }

    attributeChangedCallback() {
      if (this._connected) this._render();
    }

    // ---- Rendering ---------------------------------------------------------

    _render() {
      var desiredTag = this.interactive ? 'button' : 'span';

      // (Re)create the inner root only when the element kind changes.
      if (!this._root || this._root.tagName.toLowerCase() !== desiredTag) {
        this._buildRoot(desiredTag);
      }

      this._applyClasses();
      this._applyContent();
    }

    _buildRoot(tag) {
      this._teardownListeners();
      // Replace whatever we rendered before with a fresh root element.
      this.replaceChildren();
      var root = document.createElement(tag);
      if (tag === 'button') root.type = 'button';
      this.appendChild(root);
      this._root = root;
      this._setupListeners();
    }

    _applyClasses() {
      var root = this._root;
      if (!root) return;

      var classes = [AVATAR, AVATAR + '--' + this.size];
      if (this.interactive) classes.push(AVATAR_INTERACTIVE);
      root.setAttribute('class', classes.join(' '));
    }

    /** Build the media + optional status dot inside the root. */
    _applyContent() {
      var root = this._root;
      if (!root) return;

      var interactive = this.interactive;

      // Reset interactive-only state on the root.
      if (interactive) {
        var label = this.label;
        if (label != null) root.setAttribute('aria-label', label);
        else root.removeAttribute('aria-label');
        root.disabled = this.disabled;
        if (this.disabled) root.setAttribute('aria-disabled', 'true');
        else root.removeAttribute('aria-disabled');
      } else {
        root.removeAttribute('aria-label');
        root.removeAttribute('aria-disabled');
        if ('disabled' in root) root.disabled = false;
      }

      // Rebuild inner DOM from scratch each render — small, side-effect-free.
      root.replaceChildren();

      var media = document.createElement('span');
      media.className = AVATAR_MEDIA;

      var src = this.src;
      if (src != null) {
        var img = document.createElement('img');
        img.className = AVATAR_IMG;
        img.src = src;
        // Image variant: alt is the accessible name on a static avatar; empty on
        // an interactive one (the button's aria-label names the whole control).
        img.alt = interactive ? '' : this.getAttribute('alt') || '';
        var w = this.getAttribute('width');
        var h = this.getAttribute('height');
        if (w) img.setAttribute('width', w);
        if (h) img.setAttribute('height', h);
        media.appendChild(img);
      } else {
        var initials = document.createElement('span');
        initials.className = AVATAR_INITIALS;
        initials.setAttribute('role', 'img');
        initials.textContent = this.initials || '';
        if (interactive) {
          // Decorative — the button carries the accessible name.
          initials.setAttribute('aria-hidden', 'true');
        } else {
          var nm = this.getAttribute('name') || this.getAttribute('alt') || '';
          initials.setAttribute('aria-label', nm);
        }
        media.appendChild(initials);
      }

      root.appendChild(media);

      var status = this.status;
      if (status) {
        var dot = document.createElement('span');
        dot.className = AVATAR_STATUS + ' ' + AVATAR_STATUS + '--' + status;
        if (interactive) {
          // Decorative — presence is already folded into the button label.
          dot.setAttribute('aria-hidden', 'true');
        } else {
          // Static dot names itself, mirroring role="img" + aria-label.
          dot.setAttribute('role', 'img');
          dot.setAttribute('aria-label', this.getAttribute('status-label') || '');
        }
        root.appendChild(dot);
      }
    }

    // ---- Behavior ----------------------------------------------------------

    _setupListeners() {
      if (!this._root) return;
      this._root.addEventListener('click', this._onClick);
    }

    _teardownListeners() {
      if (!this._root) return;
      this._root.removeEventListener('click', this._onClick);
    }

    _handleClick(event) {
      if (!this.interactive) return;

      // Native button disabled is genuinely inert, but guard defensively.
      if (this.disabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // The native click already bubbles; emit a neutral, cancelable hook too.
      this.dispatchEvent(
        new CustomEvent('hisd-avatar-activate', {
          bubbles: true,
          composed: true,
          cancelable: true,
          detail: { status: this.status },
        }),
      );
    }
  }

  customElements.define('hisd-avatar', HisdAvatar);
})();
