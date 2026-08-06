/**
 * HISD Design System — <hisd-progress> (framework-agnostic Web Component)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-progress` / `hisd-spinner`
 * components. It renders into its own LIGHT DOM (no shadow root) so the global
 * design-system stylesheets style it: load assets/hisd-theme.css then
 * components/components.css (or components/progress.css) on the page. This element
 * NEVER re-implements styling — it only applies the `hisd-progress*` /
 * `hisd-spinner*` classes and the ARIA contract, mirroring components/progress.html
 * and porting its <script> value-sync behavior.
 *
 * Accessibility contract (faithful to the WAI-ARIA APG + progress.html):
 *   - A progressbar is a NON-INTERACTIVE status widget: NO keyboard model and not
 *     in the tab order. So this element wires no key handlers. The ported
 *     "behavior" is the demo's value -> markup sync: clamp the value to
 *     [min, max], compute a percent, drive the fill width via the
 *     `--hisd-progress-value` custom property, set aria-valuenow, flip to
 *     `hisd-progress--complete` at the ceiling, and mirror the percent into a
 *     polite live read-out so assistive tech announces changes.
 *
 * Variants (via the `variant` attribute):
 *   - "determinate" (default) — role="progressbar" + aria-valuemin/valuemax/
 *     valuenow; fill width == value %; reaching max adds `hisd-progress--complete`.
 *   - "indeterminate" — drops aria-valuenow, sets aria-busy="true", adds
 *     `hisd-progress--indeterminate`.
 *   - "spinner" — circular `hisd-spinner`; icon-only, aria-busy="true".
 *
 * Reflected attributes:
 *   - variant      "determinate" | "indeterminate" | "spinner"  (default determinate)
 *   - value        number   (determinate current value; clamped to [min, max])
 *   - min          number   (default 0)
 *   - max          number   (default 100)
 *   - size         "md" | "lg"  ("lg" -> `--lg` modifier)
 *   - complete     boolean  (force the success/complete state; otherwise derived
 *                            from value >= max)
 *   - label        string   (visible label; determinate/indeterminate render a
 *                            `hisd-progress-field`, spinner renders a
 *                            `hisd-spinner-field` row + aria-label)
 *   - hide-value   boolean  (suppress the `%` read-out on a labelled determinate)
 *   - label-id     string   -> aria-labelledby on the bar (when you label it yourself)
 *   - describedby  string   -> extra aria-describedby on the bar
 *   - aria-label   string   -> aria-label on the bar/spinner (when no `label`)
 *
 * Events:
 *   - "hisd-progress-complete": dispatched once when a determinate bar first
 *     reaches its max. detail = { value, percent }. Bubbles.
 *
 * Usage:
 *   <hisd-progress label="Uploading transcript" value="42"></hisd-progress>
 *   <hisd-progress value="80" aria-label="Saving"></hisd-progress>
 *   <hisd-progress variant="indeterminate" label="Syncing records"></hisd-progress>
 *   <hisd-progress variant="spinner" label="Loading…"></hisd-progress>
 * ============================================================================
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !('customElements' in window)) return;
  if (customElements.get('hisd-progress')) return; // guard against double-definition

  function isTruthyAttr(value) {
    // Boolean-attribute semantics: present (even "") is true, "false" is false.
    return value !== null && value !== undefined && value !== 'false';
  }

  function clamp(n, min, max) {
    if (typeof n !== 'number' || isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  // Visually-hidden inline styles for an offscreen live read-out when there is no
  // visible field label. Inlined so it does not depend on a `.visually-hidden`
  // utility that may not be present on the page.
  var SR_ONLY =
    'position:absolute;inline-size:1px;block-size:1px;padding:0;margin:-1px;' +
    'overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;';

  class HisdProgress extends HTMLElement {
    static get observedAttributes() {
      return [
        'variant',
        'value',
        'min',
        'max',
        'size',
        'complete',
        'label',
        'hide-value',
        'label-id',
        'describedby',
        'aria-label',
      ];
    }

    constructor() {
      super();
      this._connected = false;
      // Track whether we have already fired the one-shot complete event so we
      // don't re-fire on every render at the ceiling.
      this._didFireComplete = false;
      // Cached references to the rendered parts.
      this._bar = null; // the .hisd-progress / .hisd-spinner element
      this._fill = null; // the .hisd-progress__fill (linear only)
      this._valueOut = null; // the live % read-out span
    }

    // ---- Property <-> attribute reflection ---------------------------------

    get variant() {
      var v = this.getAttribute('variant');
      return v === 'indeterminate' || v === 'spinner' ? v : 'determinate';
    }
    set variant(v) {
      if (v == null || v === 'determinate') this.removeAttribute('variant');
      else this.setAttribute('variant', v);
    }

    get value() {
      var raw = this.getAttribute('value');
      return raw == null ? 0 : Number(raw);
    }
    set value(v) {
      if (v == null) this.removeAttribute('value');
      else this.setAttribute('value', String(v));
    }

    get min() {
      var raw = this.getAttribute('min');
      return raw == null ? 0 : Number(raw);
    }
    set min(v) {
      if (v == null) this.removeAttribute('min');
      else this.setAttribute('min', String(v));
    }

    get max() {
      var raw = this.getAttribute('max');
      return raw == null ? 100 : Number(raw);
    }
    set max(v) {
      if (v == null) this.removeAttribute('max');
      else this.setAttribute('max', String(v));
    }

    get size() {
      return this.getAttribute('size') === 'lg' ? 'lg' : 'md';
    }
    set size(v) {
      if (v == null || v === 'md') this.removeAttribute('size');
      else this.setAttribute('size', v);
    }

    get complete() {
      return isTruthyAttr(this.getAttribute('complete'));
    }
    set complete(v) {
      if (v) this.setAttribute('complete', '');
      else this.removeAttribute('complete');
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
      // No event listeners are attached (progressbars have no interaction), but
      // drop references so the GC can reclaim the rendered nodes. Clear the
      // structural signature so a re-connection rebuilds the markup.
      this._bar = null;
      this._fill = null;
      this._valueOut = null;
      this._sig = null;
    }

    attributeChangedCallback() {
      if (this._connected) this._render();
    }

    // ---- Rendering ---------------------------------------------------------

    _render() {
      var variant = this.variant;
      // Rebuild the markup whenever the STRUCTURE changes — that is the variant,
      // whether a visible label is present, and (determinate) whether the value
      // read-out is shown. Value/size/aria changes alone are synced in place.
      var sig =
        variant +
        '|' +
        (this.getAttribute('label') != null ? '1' : '0') +
        '|' +
        (isTruthyAttr(this.getAttribute('hide-value')) ? '1' : '0');
      if (this._sig !== sig) {
        this._buildMarkup(variant);
        this._sig = sig;
      }

      if (variant === 'spinner') this._syncSpinner();
      else if (variant === 'indeterminate') this._syncIndeterminate();
      else this._syncDeterminate();
    }

    /** Replace this element's light-DOM children with the variant's markup. */
    _buildMarkup(variant) {
      var doc = this.ownerDocument;
      // Clear any previous render (our own generated markup only).
      while (this.firstChild) this.removeChild(this.firstChild);
      this._bar = null;
      this._fill = null;
      this._valueOut = null;
      this._didFireComplete = false;

      var label = this.getAttribute('label');

      if (variant === 'spinner') {
        var spinner = doc.createElement('span');
        spinner.className = 'hisd-spinner';
        spinner.setAttribute('role', 'progressbar');
        spinner.setAttribute('aria-busy', 'true');
        spinner.setAttribute('data-kind', 'spinner');
        this._bar = spinner;

        if (label != null) {
          // Status row: spinner + visible label text. The spinner carries the
          // accessible name via aria-label (the visible text is decorative).
          var field = doc.createElement('span');
          field.className = 'hisd-spinner-field';
          field.appendChild(spinner);
          var text = doc.createElement('span');
          text.textContent = label;
          field.appendChild(text);
          this.appendChild(field);
        } else {
          this.appendChild(spinner);
        }
        return;
      }

      // Linear variants share a track + fill; optionally a field wrapper.
      var bar = doc.createElement('div');
      bar.className = 'hisd-progress';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('data-kind', variant);
      var fill = doc.createElement('span');
      fill.className = 'hisd-progress__fill';
      bar.appendChild(fill);
      this._bar = bar;
      this._fill = fill;

      if (label != null) {
        var fieldEl = doc.createElement('div');
        fieldEl.className = 'hisd-progress-field';

        var header = doc.createElement('div');
        header.className = 'hisd-progress-field__header';

        var labelEl = doc.createElement('span');
        labelEl.className = 'hisd-progress-field__label';
        labelEl.textContent = label;
        // Stable id so we can wire aria-labelledby on the bar.
        var lid = this._ensureId(labelEl, 'label');
        labelEl.id = lid;
        header.appendChild(labelEl);

        // The % read-out (determinate only) is a polite live region.
        if (variant === 'determinate' && !isTruthyAttr(this.getAttribute('hide-value'))) {
          var valueEl = doc.createElement('span');
          valueEl.className = 'hisd-progress-field__value';
          valueEl.setAttribute('aria-live', 'polite');
          valueEl.id = this._ensureId(valueEl, 'value');
          header.appendChild(valueEl);
          this._valueOut = valueEl;
        }

        fieldEl.appendChild(header);
        fieldEl.appendChild(bar);
        this.appendChild(fieldEl);
        // Remember the generated label id for aria wiring.
        bar.setAttribute('data-label-id', lid);
      } else {
        this.appendChild(bar);

        // Without a visible field, optionally expose a hidden polite read-out so
        // determinate value changes are still announced.
        if (variant === 'determinate' && !isTruthyAttr(this.getAttribute('hide-value'))) {
          var srOut = doc.createElement('span');
          srOut.setAttribute('aria-live', 'polite');
          srOut.setAttribute('style', SR_ONLY);
          srOut.id = this._ensureId(srOut, 'value');
          this.appendChild(srOut);
          this._valueOut = srOut;
        }
      }
    }

    // ---- Per-variant sync --------------------------------------------------

    _syncSpinner() {
      var spinner = this._bar;
      if (!spinner) return;
      spinner.className = this._withSize('hisd-spinner');

      // Accessible name: explicit aria-label wins, else the visible label text.
      var ariaLabel = this.getAttribute('aria-label');
      if (ariaLabel == null) ariaLabel = this.getAttribute('label');
      if (ariaLabel != null) spinner.setAttribute('aria-label', ariaLabel);
      else spinner.removeAttribute('aria-label');
    }

    _syncIndeterminate() {
      var bar = this._bar;
      if (!bar) return;
      bar.className = this._withSize('hisd-progress hisd-progress--indeterminate');
      bar.setAttribute('aria-busy', 'true');
      // Indeterminate drops aria-valuenow/min/max.
      bar.removeAttribute('aria-valuenow');
      bar.removeAttribute('aria-valuemin');
      bar.removeAttribute('aria-valuemax');
      bar.removeAttribute('aria-valuetext');
      this._applyName(bar);
    }

    _syncDeterminate() {
      var bar = this._bar;
      var fill = this._fill;
      if (!bar || !fill) return;

      var min = this.min;
      var max = this.max;
      var clamped = clamp(this.value, min, max);
      var span = max - min;
      var percent = span > 0 ? Math.round(((clamped - min) / span) * 100) : 0;
      var isComplete = this.complete || clamped >= max;

      var cls = 'hisd-progress';
      if (isComplete) cls += ' hisd-progress--complete';
      bar.className = this._withSize(cls);

      // Drive the fill width via the same custom property the CSS reads.
      bar.style.setProperty('--hisd-progress-value', percent + '%');

      bar.removeAttribute('aria-busy');
      bar.setAttribute('aria-valuemin', String(min));
      bar.setAttribute('aria-valuemax', String(max));
      bar.setAttribute('aria-valuenow', String(clamped));
      var valueText = percent + '%';
      bar.setAttribute('aria-valuetext', valueText);

      this._applyName(bar);

      // Mirror the percent into the live read-out (visible field or hidden span).
      if (this._valueOut) {
        this._valueOut.textContent = valueText;
        var describedby = this._collectDescribedBy(this._valueOut.id);
        if (describedby) bar.setAttribute('aria-describedby', describedby);
        else bar.removeAttribute('aria-describedby');
      } else {
        var d = this._collectDescribedBy(null);
        if (d) bar.setAttribute('aria-describedby', d);
        else bar.removeAttribute('aria-describedby');
      }

      // One-shot complete event when first reaching the ceiling.
      if (isComplete && !this._didFireComplete) {
        this._didFireComplete = true;
        this.dispatchEvent(
          new CustomEvent('hisd-progress-complete', {
            bubbles: true,
            detail: { value: clamped, percent: percent },
          }),
        );
      } else if (!isComplete) {
        this._didFireComplete = false;
      }
    }

    // ---- Helpers -----------------------------------------------------------

    _withSize(base) {
      if (this.size !== 'lg') return base;
      // Pick the right size modifier for the variant's base class.
      return base.indexOf('hisd-spinner') === 0
        ? base + ' hisd-spinner--lg'
        : base + ' hisd-progress--lg';
    }

    /**
     * Apply the accessible name to a linear bar: aria-labelledby (from a field
     * label or an author-supplied label-id) takes precedence; otherwise an
     * explicit aria-label.
     */
    _applyName(bar) {
      var fieldLabelId = bar.getAttribute('data-label-id');
      var authorLabelId = this.getAttribute('label-id');
      var labelledby = authorLabelId || fieldLabelId;

      if (labelledby) {
        bar.setAttribute('aria-labelledby', labelledby);
        bar.removeAttribute('aria-label');
      } else {
        bar.removeAttribute('aria-labelledby');
        var ariaLabel = this.getAttribute('aria-label');
        if (ariaLabel != null) bar.setAttribute('aria-label', ariaLabel);
        else bar.removeAttribute('aria-label');
      }
    }

    /** Build the aria-describedby token list (value read-out + author ids). */
    _collectDescribedBy(valueId) {
      var tokens = [];
      if (valueId) tokens.push(valueId);
      var extra = this.getAttribute('describedby');
      if (extra) tokens.push(extra);
      return tokens.join(' ');
    }

    /** Lazily mint a stable unique id for a generated sub-part. */
    _ensureId(el, suffix) {
      if (el.id) return el.id;
      if (!this._uid) {
        this._uid =
          'hisd-progress-' + Math.random().toString(36).slice(2, 9);
      }
      return this._uid + '-' + suffix;
    }
  }

  customElements.define('hisd-progress', HisdProgress);
})();
