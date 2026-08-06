/**
 * HISD Design System — <hisd-alert> (framework-agnostic Web Component)
 * ============================================================================
 * A thin behaviour + markup layer over the vanilla `.hisd-alert` component. It
 * renders into its own LIGHT DOM (no shadow root) so the global design-system
 * stylesheets style it: load assets/hisd-theme.css then components/components.css
 * (or components/alert.css) on the page. This element NEVER re-implements
 * styling — it only applies the `hisd-alert*` classes and the ARIA contract,
 * mirroring components/alert.html and porting its <script> dismiss behaviour
 * faithfully.
 *
 * Inline status banner:
 *   - The inner root carries `role="alert"` (assertive — errors) or
 *     `role="status"` (polite — everything else). The default is derived from
 *     the variant (danger -> alert, otherwise status) and can be overridden with
 *     the `role` attribute.
 *   - Four semantic variants — info (default) / success / warning / danger —
 *     mapped to `hisd-alert--{variant}`. The leading icon span is `aria-hidden`;
 *     the visible title carries the status to assistive tech. Meaning rides on
 *     the variant glyph + accent rail + text, never colour alone (CSS handles it).
 *   - Anatomy: [icon] [title + message] [optional actions] [optional dismiss].
 *
 * Reflected attributes:
 *   - variant       (info | success | warning | danger)  default info
 *   - title         (string)  -> .hisd-alert__title
 *   - message       (string)  -> .hisd-alert__message
 *   - role          (alert | status)  override the variant-derived live role
 *   - dismissible   (boolean) renders the icon-only dismiss button
 *   - dismiss-label (string)  -> aria-label on the dismiss button
 *
 * Content model:
 *   Use the `title` / `message` attributes for simple cases, OR author the
 *   `.hisd-alert__body` content (and `.hisd-alert__actions`) as light-DOM
 *   children; any child nodes are moved into the rendered body so rich markup +
 *   action buttons are preserved.
 *
 * Behaviour (ported from the demo script):
 *   - The native <button> fires click on mouse, Enter, and Space, so a single
 *     click listener covers all activation paths — we never re-handle keys.
 *   - On dismiss the banner animates out (collapse + fade) via
 *     `data-state="leaving"` and is removed on `animationend`; under
 *     prefers-reduced-motion the keyframe is disabled in CSS, so we remove
 *     immediately instead of awaiting an event with zero duration.
 *   - Emits a cancelable `hisd-alert-dismiss` CustomEvent before leaving (call
 *     preventDefault() to keep the banner) and a `hisd-alert-dismissed`
 *     CustomEvent once removed.
 *   - Listeners are cleaned up in disconnectedCallback.
 *   - prefers-reduced-motion / forced-colors are handled by the CSS already.
 *
 * Usage:
 *   <hisd-alert variant="danger" title="Could not save changes"
 *     message="The network connection was lost. Try again." dismissible>
 *   </hisd-alert>
 * ============================================================================
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !('customElements' in window)) return;
  if (customElements.get('hisd-alert')) return; // guard against double-definition

  var VARIANTS = ['info', 'success', 'warning', 'danger'];

  function isTruthyAttr(value) {
    // Boolean-attribute semantics: present (even "") is true, "false" is false.
    return value !== null && value !== undefined && value !== 'false';
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  class HisdAlert extends HTMLElement {
    static get observedAttributes() {
      return ['variant', 'title', 'message', 'role', 'dismissible', 'dismiss-label'];
    }

    constructor() {
      super();
      /** @type {HTMLDivElement|null} The inner .hisd-alert root. */
      this._root = null;
      /** @type {HTMLButtonElement|null} The dismiss button, when present. */
      this._dismissBtn = null;
      /** Captured light-DOM children authored by the consumer, if any. */
      this._authoredBody = null;
      this._authoredActions = null;
      this._connected = false;
      this._leaving = false;
      // Bound once so add/removeEventListener pair correctly.
      this._onDismissClick = this._handleDismissClick.bind(this);
      this._onAnimationEnd = this._handleAnimationEnd.bind(this);
    }

    // ---- Property <-> attribute reflection ---------------------------------

    get variant() {
      var v = this.getAttribute('variant');
      return VARIANTS.indexOf(v) !== -1 ? v : 'info';
    }
    set variant(v) {
      if (v == null || v === 'info') this.removeAttribute('variant');
      else this.setAttribute('variant', v);
    }

    get title() {
      return this.getAttribute('title');
    }
    set title(v) {
      if (v == null) this.removeAttribute('title');
      else this.setAttribute('title', v);
    }

    get message() {
      return this.getAttribute('message');
    }
    set message(v) {
      if (v == null) this.removeAttribute('message');
      else this.setAttribute('message', v);
    }

    get dismissible() {
      return isTruthyAttr(this.getAttribute('dismissible'));
    }
    set dismissible(v) {
      if (v) this.setAttribute('dismissible', '');
      else this.removeAttribute('dismissible');
    }

    // ---- Lifecycle ---------------------------------------------------------

    connectedCallback() {
      // Capture any authored light-DOM body/actions ONCE before first render so
      // rich content survives re-renders. Only do this the first time we connect.
      if (this._authoredBody === null && this._authoredActions === null) {
        this._captureAuthoredContent();
      }
      this._connected = true;
      this._render();
    }

    disconnectedCallback() {
      this._connected = false;
      this._teardownListeners();
    }

    attributeChangedCallback() {
      if (this._connected && !this._leaving) this._render();
    }

    // ---- Rendering ---------------------------------------------------------

    /**
     * Pull any consumer-authored `.hisd-alert__body` / `.hisd-alert__actions`
     * (or, failing that, all initial children) out of the host so we can place
     * them back inside the rendered banner. Detaches the original light children.
     */
    _captureAuthoredContent() {
      var body = this.querySelector(':scope > .hisd-alert__body');
      var actions = this.querySelector(':scope > .hisd-alert__actions');
      if (body) {
        this._authoredBody = body;
        body.remove();
      }
      if (actions) {
        this._authoredActions = actions;
        actions.remove();
      }
      // If neither explicit part was authored but loose children exist, treat
      // them as the body content.
      if (!body && !actions && this.childNodes.length) {
        var frag = this.ownerDocument.createDocumentFragment();
        while (this.firstChild) frag.appendChild(this.firstChild);
        var wrapper = this.ownerDocument.createElement('div');
        wrapper.className = 'hisd-alert__body';
        wrapper.appendChild(frag);
        this._authoredBody = wrapper;
      }
    }

    _render() {
      this._teardownListeners();

      // (Re)build the inner root from scratch — the markup is small and this
      // keeps attribute-driven updates simple and correct.
      var root = this._root;
      if (!root) {
        root = this.ownerDocument.createElement('div');
        this.appendChild(root);
        this._root = root;
      }
      // Clear previous render output.
      while (root.firstChild) root.removeChild(root.firstChild);

      root.setAttribute('class', 'hisd-alert hisd-alert--' + this.variant);

      var roleAttr = this.getAttribute('role');
      var role =
        roleAttr === 'alert' || roleAttr === 'status'
          ? roleAttr
          : this.variant === 'danger'
            ? 'alert'
            : 'status';
      root.setAttribute('role', role);

      // Leading icon (decorative; the title carries semantics).
      var icon = this.ownerDocument.createElement('span');
      icon.className = 'hisd-alert__icon';
      icon.setAttribute('aria-hidden', 'true');
      root.appendChild(icon);

      // Body: prefer authored content, else build from title/message attributes.
      if (this._authoredBody) {
        root.appendChild(this._authoredBody);
      } else {
        var body = this.ownerDocument.createElement('div');
        body.className = 'hisd-alert__body';
        var title = this.getAttribute('title');
        if (title != null && title !== '') {
          var titleEl = this.ownerDocument.createElement('p');
          titleEl.className = 'hisd-alert__title';
          titleEl.textContent = title;
          body.appendChild(titleEl);
        }
        var message = this.getAttribute('message');
        if (message != null && message !== '') {
          var msgEl = this.ownerDocument.createElement('p');
          msgEl.className = 'hisd-alert__message';
          msgEl.textContent = message;
          body.appendChild(msgEl);
        }
        root.appendChild(body);
      }

      // Optional actions row (authored only).
      if (this._authoredActions) {
        root.appendChild(this._authoredActions);
      }

      // Optional dismiss button.
      this._dismissBtn = null;
      if (this.dismissible) {
        var btn = this.ownerDocument.createElement('button');
        btn.type = 'button';
        btn.className = 'hisd-alert__dismiss';
        btn.setAttribute(
          'aria-label',
          this.getAttribute('dismiss-label') || 'Dismiss this message',
        );
        var x = this.ownerDocument.createElement('span');
        x.className = 'hisd-alert__dismiss-icon';
        x.setAttribute('aria-hidden', 'true');
        btn.appendChild(x);
        root.appendChild(btn);
        this._dismissBtn = btn;
      }

      this._setupListeners();
    }

    // ---- Behaviour ---------------------------------------------------------

    _setupListeners() {
      if (this._dismissBtn) {
        // Native <button> synthesises click for mouse, Enter, and Space, so one
        // click listener covers all activation paths — no key re-handling.
        this._dismissBtn.addEventListener('click', this._onDismissClick);
      }
    }

    _teardownListeners() {
      if (this._dismissBtn) {
        this._dismissBtn.removeEventListener('click', this._onDismissClick);
      }
      if (this._root) {
        this._root.removeEventListener('animationend', this._onAnimationEnd);
      }
    }

    /**
     * Programmatic dismiss — same path the button takes. Emits a cancelable
     * `hisd-alert-dismiss` event; if not prevented, animates out (or removes
     * immediately under reduced motion).
     */
    dismiss() {
      this._handleDismissClick();
    }

    _handleDismissClick() {
      if (this._leaving) return;

      var evt = new CustomEvent('hisd-alert-dismiss', {
        bubbles: true,
        cancelable: true,
        detail: { variant: this.variant },
      });
      var proceed = this.dispatchEvent(evt);
      if (!proceed) return; // consumer called preventDefault()

      if (prefersReducedMotion()) {
        // The keyframe is disabled in CSS under reduced motion; remove now
        // rather than waiting for an animationend that may never carry duration.
        this._remove();
        return;
      }

      this._leaving = true;
      if (this._root) {
        this._root.setAttribute('data-state', 'leaving');
        this._root.addEventListener('animationend', this._onAnimationEnd);
      } else {
        this._remove();
      }
    }

    _handleAnimationEnd(event) {
      // Guard on the animation name so unrelated child animations don't remove.
      if (event.target !== this._root) return;
      if (event.animationName && event.animationName !== 'hisd-alert-out') {
        return;
      }
      this._remove();
    }

    _remove() {
      this._teardownListeners();
      this.dispatchEvent(
        new CustomEvent('hisd-alert-dismissed', {
          bubbles: true,
          detail: { variant: this.variant },
        }),
      );
      if (this.parentNode) this.parentNode.removeChild(this);
    }
  }

  customElements.define('hisd-alert', HisdAlert);
})();
