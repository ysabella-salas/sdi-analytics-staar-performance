/**
 * <hisd-button> — framework-agnostic Web Component wrapper around the vanilla
 * HISD button.
 *
 * LIGHT DOM by design: the element renders the canonical `.hisd-button` markup
 * INTO ITSELF (no shadow root), so the global design-system stylesheets style
 * it exactly like the hand-written HTML:
 *   - assets/hisd-theme.css      (tokens, light/dark, reduced-motion, forced-colors)
 *   - components/components.css   (or components/button.css)
 *
 * This is a thin behavior + markup layer. It re-uses a real native <button>
 * inside, so Enter/Space activation, focus, and form semantics come for free
 * from the platform (matching the WAI-ARIA APG button pattern and the vanilla
 * demo, which adds no key handling). The component only:
 *   1. Reflects attributes -> classes/ARIA on the inner button.
 *   2. Mirrors the loading lifecycle (aria-busy swaps label for spinner).
 *   3. Suppresses activation (click / Enter / Space) while disabled or loading;
 *      otherwise the inner button's native click bubbles through the host (we
 *      use light DOM) so `<hisd-button>` click listeners fire for free.
 *   4. Cleans up its listener in disconnectedCallback.
 *
 * Attributes (all reflected):
 *   variant     "action" | "secondary" | "ghost" | "danger"  (default "action")
 *   disabled    boolean   -> native disabled + matches CSS [aria-disabled]
 *   loading     boolean   -> aria-busy="true" on the inner button
 *   icon-only   boolean   -> adds .hisd-button--icon-only (requires label/aria-label)
 *   label       string    -> visible text (alternative to default slotted text)
 *   value       string    -> forwarded to the inner button's value
 *   type        string    -> inner button type (default "button")
 *   aria-label  string    -> forwarded; REQUIRED for icon-only buttons
 *
 * Light-DOM children: any markup placed inside <hisd-button> that is NOT the
 * managed wrapper is treated as the label/icon content and moved into the
 * `.hisd-button__label` (an explicit child with class `hisd-button__icon` is
 * preserved as the leading icon). Use the `label` attribute for plain text.
 */
(function () {
  'use strict';

  var VARIANTS = ['action', 'secondary', 'ghost', 'danger'];
  var WRAPPER_CLASS = 'hisd-button';

  function HISDButtonClass() {
    if (typeof HTMLElement === 'undefined') return;

    class HISDButton extends HTMLElement {
      static get observedAttributes() {
        return [
          'variant',
          'disabled',
          'loading',
          'icon-only',
          'label',
          'value',
          'type',
          'aria-label',
        ];
      }

      constructor() {
        super();
        /** @type {HTMLButtonElement|null} */
        this._button = null;
        /** Original user-supplied light-DOM content, captured once. */
        this._userIcon = null; // Element with class hisd-button__icon, if any
        this._userLabelHTML = ''; // remaining inner HTML used as label
        this._captured = false;
        this._onClick = this._onClick.bind(this);
      }

      connectedCallback() {
        this._capture();
        this._render();
      }

      disconnectedCallback() {
        if (this._button) {
          this._button.removeEventListener('click', this._onClick);
        }
        this._button = null;
      }

      attributeChangedCallback() {
        // Re-apply reflected state to the existing inner button (cheap), or do
        // a full render if we've already captured the authored content. We must
        // NOT render before _capture(): during upgrade this callback fires before
        // connectedCallback, and an early _render() would wipe the slotted label.
        if (this._button) {
          this._applyState();
        } else if (this.isConnected && this._captured) {
          this._render();
        }
      }

      /* -------------------------------------------------------------------- */
      /* Property <-> attribute reflection (ergonomic JS API)                  */
      /* -------------------------------------------------------------------- */
      get variant() {
        var v = this.getAttribute('variant');
        return VARIANTS.indexOf(v) !== -1 ? v : 'action';
      }
      set variant(val) {
        this.setAttribute('variant', val);
      }

      get disabled() {
        return this.hasAttribute('disabled');
      }
      set disabled(val) {
        this._toggleBool('disabled', val);
      }

      get loading() {
        return this.hasAttribute('loading');
      }
      set loading(val) {
        this._toggleBool('loading', val);
      }

      get iconOnly() {
        return this.hasAttribute('icon-only');
      }
      set iconOnly(val) {
        this._toggleBool('icon-only', val);
      }

      get value() {
        return this.getAttribute('value') || '';
      }
      set value(val) {
        this.setAttribute('value', val);
      }

      _toggleBool(name, val) {
        if (val) this.setAttribute(name, '');
        else this.removeAttribute(name);
      }

      /* -------------------------------------------------------------------- */
      /* Capture authored light-DOM content before we overwrite it.            */
      /* -------------------------------------------------------------------- */
      _capture() {
        if (this._captured) return;
        this._captured = true;

        // If we've already injected our wrapper (e.g. re-connect), skip.
        if (this.querySelector('.' + WRAPPER_CLASS)) return;

        var iconEl = this.querySelector('.hisd-button__icon');
        if (iconEl) {
          this._userIcon = iconEl.cloneNode(true);
          iconEl.remove();
        }
        this._userLabelHTML = this.innerHTML.trim();
      }

      /* -------------------------------------------------------------------- */
      /* Render the canonical markup into the light DOM.                       */
      /* -------------------------------------------------------------------- */
      _render() {
        // Resolve label source: explicit attribute wins, else captured content.
        var labelAttr = this.getAttribute('label');
        var labelHTML =
          labelAttr != null && labelAttr !== ''
            ? this._escape(labelAttr)
            : this._userLabelHTML;

        var btn = document.createElement('button');
        btn.className = WRAPPER_CLASS;

        // Spinner is always present; CSS shows it only under aria-busy.
        var spinner = document.createElement('span');
        spinner.className = 'hisd-button__spinner';
        spinner.setAttribute('aria-hidden', 'true');
        btn.appendChild(spinner);

        if (this._userIcon) {
          // Ensure the decorative icon is hidden from AT.
          this._userIcon.setAttribute('aria-hidden', 'true');
          btn.appendChild(this._userIcon.cloneNode(true));
        }

        if (labelHTML) {
          var label = document.createElement('span');
          label.className = 'hisd-button__label';
          label.innerHTML = labelHTML;
          btn.appendChild(label);
        }

        // Swap content in one shot.
        this.innerHTML = '';
        this.appendChild(btn);
        this._button = btn;
        btn.addEventListener('click', this._onClick);

        this._applyState();
      }

      /* -------------------------------------------------------------------- */
      /* Apply reflected attributes -> classes/ARIA on the inner button.      */
      /* -------------------------------------------------------------------- */
      _applyState() {
        var btn = this._button;
        if (!btn) return;

        var classes = [WRAPPER_CLASS, 'hisd-button--' + this.variant];
        if (this.iconOnly) classes.push('hisd-button--icon-only');
        btn.className = classes.join(' ');

        // type / value pass-through.
        btn.type = this.getAttribute('type') || 'button';
        if (this.hasAttribute('value')) btn.value = this.getAttribute('value');

        // Disabled: native attribute (CSS also matches [aria-disabled="true"]).
        if (this.disabled) {
          btn.setAttribute('disabled', '');
        } else {
          btn.removeAttribute('disabled');
        }

        // Loading: aria-busy drives the CSS label/spinner swap.
        if (this.loading) {
          btn.setAttribute('aria-busy', 'true');
        } else {
          btn.removeAttribute('aria-busy');
        }

        // Accessible name: forward aria-label; require it for icon-only.
        var ariaLabel = this.getAttribute('aria-label');
        if (ariaLabel) {
          btn.setAttribute('aria-label', ariaLabel);
        } else {
          btn.removeAttribute('aria-label');
        }
        if (
          this.iconOnly &&
          !ariaLabel &&
          !this.getAttribute('aria-labelledby')
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            '[hisd-button] An icon-only <hisd-button> requires an `aria-label` to be accessible.',
          );
        }
      }

      /* -------------------------------------------------------------------- */
      /* Activation guard.                                                     */
      /* Because we use LIGHT DOM, the inner button's native `click` already    */
      /* bubbles through <hisd-button>, so listeners attached to the host fire  */
      /* naturally — no re-dispatch needed. This handler only enforces the      */
      /* disabled/loading contract: when the control is non-interactive we      */
      /* cancel the event and stop it before it reaches host/ancestor          */
      /* listeners (the CSS also sets pointer-events:none, but a keyboard       */
      /* Enter/Space or programmatic .click() must be guarded too).            */
      /* -------------------------------------------------------------------- */
      _onClick(event) {
        if (this.disabled || this.loading) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }

      _escape(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
    }

    return HISDButton;
  }

  if (
    typeof customElements !== 'undefined' &&
    !customElements.get('hisd-button')
  ) {
    var Cls = HISDButtonClass();
    if (Cls) customElements.define('hisd-button', Cls);
  }
})();
