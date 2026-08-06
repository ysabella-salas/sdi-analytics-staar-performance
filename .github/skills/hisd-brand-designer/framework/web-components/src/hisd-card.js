/**
 * HISD Design System — <hisd-card> (framework-agnostic Web Component)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-card` component. It
 * renders into its own LIGHT DOM (no shadow root) so the global design-system
 * stylesheets style it: load assets/hisd-theme.css then
 * components/components.css (or components/card.css) on the page. This element
 * NEVER re-implements styling — it only applies the `hisd-card*` classes and the
 * ARIA contract, mirroring components/card.html and its <script> behavior.
 *
 * Markup model (matches card.html):
 *   - Static card  -> renders an inner <article class="hisd-card">.
 *   - Interactive  -> renders an inner <a class="hisd-card hisd-card--interactive">
 *                     when `href` is set, else an inner <button>.
 *   The host's own children are the card content. To use the structural parts,
 *   author them with the same classes, e.g.:
 *     <hisd-card variant="raised">
 *       <header class="hisd-card__header">…</header>
 *       <p class="hisd-card__body">…</p>
 *     </hisd-card>
 *
 * Reflected attributes: variant, accent, interactive, href, disabled, selected,
 * selection-role, label (-> aria-label), heading-id (-> aria-labelledby).
 *
 * Behavior (ported faithfully from the demo script):
 *   - Selectable interactive cards toggle aria-pressed/aria-current + the
 *     `hisd-card--selected` class on click. Native <a>/<button> fire click on
 *     Enter (and Space for button), so one click handler covers mouse + keyboard.
 *   - aria-disabled interactive roots are not natively inert, so click and
 *     Enter/Space are intercepted and prevented.
 *   - Emits a cancelable `hisd-card-select` CustomEvent { detail: { selected } }.
 *   - Listeners are cleaned up in disconnectedCallback.
 *   - prefers-reduced-motion / forced-colors are handled by the CSS already.
 * ============================================================================
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !('customElements' in window)) return;
  if (customElements.get('hisd-card')) return; // guard against double-definition

  var ACCENTS = [
    'brand',
    'action',
    'accent',
    'success',
    'warning',
    'danger',
    'info',
  ];

  function isTruthyAttr(value) {
    // Boolean-attribute semantics: present (even "") is true, "false" is false.
    return value !== null && value !== undefined && value !== 'false';
  }

  class HisdCard extends HTMLElement {
    static get observedAttributes() {
      return [
        'variant',
        'accent',
        'interactive',
        'href',
        'disabled',
        'selected',
        'selection-role',
        'label',
        'heading-id',
      ];
    }

    constructor() {
      super();
      /** @type {HTMLElement|null} The inner article/a/button root. */
      this._root = null;
      this._connected = false;
      // Bound once so add/removeEventListener pair correctly.
      this._onClick = this._handleClick.bind(this);
      this._onKeyDown = this._handleKeyDown.bind(this);
    }

    // ---- Property <-> attribute reflection ---------------------------------

    get variant() {
      return this.getAttribute('variant') || 'flat';
    }
    set variant(v) {
      if (v == null || v === 'flat') this.removeAttribute('variant');
      else this.setAttribute('variant', v);
    }

    get accent() {
      return this.getAttribute('accent');
    }
    set accent(v) {
      if (v == null) this.removeAttribute('accent');
      else this.setAttribute('accent', v);
    }

    get interactive() {
      return isTruthyAttr(this.getAttribute('interactive'));
    }
    set interactive(v) {
      if (v) this.setAttribute('interactive', '');
      else this.removeAttribute('interactive');
    }

    get href() {
      return this.getAttribute('href');
    }
    set href(v) {
      if (v == null) this.removeAttribute('href');
      else this.setAttribute('href', v);
    }

    get disabled() {
      return isTruthyAttr(this.getAttribute('disabled'));
    }
    set disabled(v) {
      if (v) this.setAttribute('disabled', '');
      else this.removeAttribute('disabled');
    }

    get selected() {
      return isTruthyAttr(this.getAttribute('selected'));
    }
    set selected(v) {
      if (v) this.setAttribute('selected', '');
      else this.removeAttribute('selected');
    }

    get selectionRole() {
      var r = this.getAttribute('selection-role');
      return r === 'current' ? 'current' : 'pressed';
    }
    set selectionRole(v) {
      if (v == null) this.removeAttribute('selection-role');
      else this.setAttribute('selection-role', v);
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
      var interactive = this.interactive;
      var href = this.href;
      var desiredTag = !interactive ? 'article' : href != null ? 'a' : 'button';

      // (Re)create the inner root only when the element kind changes, so we keep
      // the consumer's content and focus where possible.
      if (!this._root || this._root.tagName.toLowerCase() !== desiredTag) {
        this._buildRoot(desiredTag);
      }

      this._applyClasses();
      this._applyAria();
    }

    /**
     * Build the inner root element, moving the host's current child nodes into
     * it so authored card content (headers, body, cta) is preserved. The host
     * itself stays display:contents-free; the inner element carries .hisd-card.
     */
    _buildRoot(tag) {
      this._teardownListeners();

      var root = document.createElement(tag);

      // Move existing host content into the new root. If a previous root exists,
      // pull its children out first so we don't nest roots.
      var source = this._root || this;
      while (source.firstChild) {
        root.appendChild(source.firstChild);
      }
      if (this._root && this._root.parentNode === this) {
        this.removeChild(this._root);
      }

      this.appendChild(root);
      this._root = root;
      this._setupListeners();
    }

    _applyClasses() {
      var root = this._root;
      if (!root) return;

      var classes = ['hisd-card'];
      var variant = this.variant;
      if (variant === 'raised') classes.push('hisd-card--raised');
      if (variant === 'sunken') classes.push('hisd-card--sunken');
      if (this.interactive) classes.push('hisd-card--interactive');
      if (this.selected) classes.push('hisd-card--selected');

      var accent = this.accent;
      if (accent && ACCENTS.indexOf(accent) !== -1) {
        classes.push('hisd-card--accent-' + accent);
      }

      root.setAttribute('class', classes.join(' '));
    }

    _applyAria() {
      var root = this._root;
      if (!root) return;

      // Accessible name / labelledby, mirrored from host attributes.
      var label = this.getAttribute('label');
      if (label != null) root.setAttribute('aria-label', label);
      else root.removeAttribute('aria-label');

      var headingId = this.getAttribute('heading-id');
      if (headingId != null) root.setAttribute('aria-labelledby', headingId);
      else root.removeAttribute('aria-labelledby');

      if (!this.interactive) {
        // Static <article>: clear any interactive-only attributes.
        root.removeAttribute('aria-pressed');
        root.removeAttribute('aria-current');
        root.removeAttribute('aria-disabled');
        root.removeAttribute('role');
        root.removeAttribute('href');
        if ('disabled' in root) root.disabled = false;
        return;
      }

      // Selected-state ARIA: aria-pressed OR aria-current per selection-role.
      if (this.selectionRole === 'current') {
        root.setAttribute('aria-current', String(this.selected));
        root.removeAttribute('aria-pressed');
      } else {
        root.setAttribute('aria-pressed', String(this.selected));
        root.removeAttribute('aria-current');
      }

      var disabled = this.disabled;
      var tag = root.tagName.toLowerCase();

      if (tag === 'a') {
        // Keep a disabled anchor announced as a (disabled) link, but inert:
        // drop href so it's not followable, and intercept activation in JS.
        root.setAttribute('role', 'link');
        if (disabled) {
          root.setAttribute('aria-disabled', 'true');
          root.removeAttribute('href');
        } else {
          root.removeAttribute('aria-disabled');
          var href = this.href;
          if (href != null) root.setAttribute('href', href);
          else root.removeAttribute('href');
        }
      } else if (tag === 'button') {
        if (!root.getAttribute('type')) root.setAttribute('type', 'button');
        // Native disabled is genuinely inert for buttons.
        root.disabled = disabled;
        if (disabled) root.setAttribute('aria-disabled', 'true');
        else root.removeAttribute('aria-disabled');
      }
    }

    // ---- Behavior ----------------------------------------------------------

    _setupListeners() {
      if (!this._root) return;
      this._root.addEventListener('click', this._onClick);
      this._root.addEventListener('keydown', this._onKeyDown);
    }

    _teardownListeners() {
      if (!this._root) return;
      this._root.removeEventListener('click', this._onClick);
      this._root.removeEventListener('keydown', this._onKeyDown);
    }

    _handleClick(event) {
      if (!this.interactive) return;

      // Guard aria-disabled / disabled interactive cards against activation.
      if (this.disabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      this._toggleSelected();
    }

    _handleKeyDown(event) {
      if (!this.interactive) return;
      // Only Enter/Space activate; native click handles the toggle, so here we
      // only need to block activation on disabled roots (the keydown guard).
      if (this.disabled && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    /** Flip selected state, sync ARIA + class, and emit a cancelable event. */
    _toggleSelected() {
      var next = !this.selected;

      var evt = new CustomEvent('hisd-card-select', {
        bubbles: true,
        cancelable: true,
        detail: { selected: next },
      });
      var proceed = this.dispatchEvent(evt);
      if (!proceed) return; // consumer called preventDefault()

      this.selected = next; // reflects attribute -> attributeChangedCallback re-renders
    }
  }

  customElements.define('hisd-card', HisdCard);
})();
