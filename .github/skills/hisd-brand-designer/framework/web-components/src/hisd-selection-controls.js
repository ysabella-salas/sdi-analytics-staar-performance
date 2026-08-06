/**
 * HISD Selection Controls — framework-agnostic Web Component
 * ---------------------------------------------------------------------------
 * <hisd-selection-controls> renders the vanilla `hisd-selection-controls`
 * markup into ITSELF using LIGHT DOM so the global design-system CSS
 * (assets/hisd-theme.css + components/selection-controls.css) styles it. No
 * shadow DOM, no inline styles, no re-implemented styling — this is a thin
 * behavior + markup layer.
 *
 * It renders REAL native <input type="checkbox"|"radio"> elements, so the
 * platform keyboard model (Space to toggle, Arrow keys to rove a radio group
 * with wrapping, Tab into the checked/first radio) works for free — exactly as
 * the vanilla demo intends. We do not re-implement that.
 *
 * Ported interactive behavior from the vanilla demo's <script>:
 *   - Polite live-region announcements on change.
 *   - Auto-clearing of the group's error state once a valid radio selection is
 *     made (drops the --error modifier, removes aria-invalid, hides the error).
 *
 * Authoring API — two ways to supply options:
 *   1. Attribute: options='[{"value":"email","label":"Email", ...}]' (JSON).
 *   2. Light-DOM children: <hisd-option value="email" label="Email"
 *        description="..." disabled checked></hisd-option>
 *      (consumed and replaced by rendered markup).
 *
 * Reflected attributes: type, name, legend, hint, error, disabled, value.
 * Emits a "change" CustomEvent { detail: { value, type, option } }, bubbling.
 *
 * Public property: `.value` (string for radio, string[] for checkbox).
 */

(function () {
  if (customElements.get('hisd-selection-controls')) return;

  let idCounter = 0;

  /** Escape text for safe insertion as HTML text content. */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class HISDSelectionControls extends HTMLElement {
    static get observedAttributes() {
      return [
        'type',
        'name',
        'legend',
        'hint',
        'error',
        'disabled',
        'value',
        'options',
        'announce',
      ];
    }

    constructor() {
      super();
      this._uid = `hisd-sc-${++idCounter}`;
      this._selected = new Set();
      this._errorCleared = false;
      this._options = [];
      this._onChange = this._onChange.bind(this);
      this._rendered = false;
    }

    connectedCallback() {
      // Resolve options from <hisd-option> children before first render,
      // since we are about to overwrite our own innerHTML (light DOM).
      this._collectOptions();
      this._render();
      this.addEventListener('change', this._onChange);
      this._rendered = true;
    }

    disconnectedCallback() {
      this.removeEventListener('change', this._onChange);
    }

    attributeChangedCallback() {
      // Re-render on any observed attribute change once initially connected.
      if (this._rendered) this._render();
    }

    /* ---- Public reflected props ------------------------------------------ */

    get type() {
      return this.getAttribute('type') === 'radio' ? 'radio' : 'checkbox';
    }
    set type(v) {
      this.setAttribute('type', v);
    }

    get disabled() {
      return this.hasAttribute('disabled');
    }
    set disabled(v) {
      if (v) this.setAttribute('disabled', '');
      else this.removeAttribute('disabled');
    }

    get value() {
      const vals = Array.from(this._selected);
      return this.type === 'radio' ? (vals[0] ?? '') : vals;
    }
    set value(v) {
      this._selected = new Set(
        v == null ? [] : Array.isArray(v) ? v : [String(v)],
      );
      this._syncCheckedFromState();
    }

    /* ---- Option resolution ----------------------------------------------- */

    _collectOptions() {
      // Priority 1: JSON `options` attribute.
      const json = this.getAttribute('options');
      if (json) {
        try {
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed)) {
            this._options = parsed.map((o) => this._normalizeOption(o));
            this._seedSelectionFromOptions();
            return;
          }
        } catch (_e) {
          /* fall through to children */
        }
      }

      // Priority 2: <hisd-option> light-DOM children.
      const optionEls = Array.from(this.querySelectorAll('hisd-option'));
      if (optionEls.length) {
        this._options = optionEls.map((el) =>
          this._normalizeOption({
            value: el.getAttribute('value') || '',
            label: el.getAttribute('label') ?? el.textContent.trim(),
            description: el.getAttribute('description') || undefined,
            disabled: el.hasAttribute('disabled'),
            checked: el.hasAttribute('checked'),
          }),
        );
        this._seedSelectionFromOptions();
      }
    }

    _normalizeOption(o) {
      return {
        value: String(o.value ?? ''),
        label: o.label != null ? String(o.label) : String(o.value ?? ''),
        description: o.description != null ? String(o.description) : '',
        disabled: !!o.disabled,
        checked: !!o.checked,
      };
    }

    _seedSelectionFromOptions() {
      // Honor `value` attribute first; else use each option's `checked` flag.
      const attrValue = this.getAttribute('value');
      if (attrValue != null && attrValue !== '') {
        this._selected = new Set(
          this.type === 'radio'
            ? [attrValue]
            : attrValue.split(',').map((s) => s.trim()).filter(Boolean),
        );
        return;
      }
      this._selected = new Set();
      this._options.forEach((o) => {
        if (o.checked) this._selected.add(o.value);
      });
      // Radio is single-select: keep only the first seeded value.
      if (this.type === 'radio' && this._selected.size > 1) {
        this._selected = new Set([Array.from(this._selected)[0]]);
      }
    }

    /* ---- Rendering ------------------------------------------------------- */

    _render() {
      // Re-collect options if driven via attributes (children already consumed).
      if (this.getAttribute('options')) {
        this._collectOptions();
      }

      const type = this.type;
      const name =
        this.getAttribute('name') || `${this._uid}-${type}`;
      const legend = this.getAttribute('legend');
      const hint = this.getAttribute('hint');
      const errorMsg = this.getAttribute('error');
      const groupDisabled = this.disabled;
      const showError = !!errorMsg && !this._errorCleared;

      const hintId = `${this._uid}-hint`;
      const errorId = `${this._uid}-error`;
      const liveId = `${this._uid}-live`;

      const inputModifier =
        type === 'radio'
          ? 'hisd-selection-controls__input--radio'
          : 'hisd-selection-controls__input--checkbox';

      const describedBy = [hint ? hintId : null, showError ? errorId : null]
        .filter(Boolean)
        .join(' ');

      const optionsHtml = this._options
        .map((o) => {
          const checked = this._selected.has(o.value);
          const isDisabled = groupDisabled || o.disabled;
          const descHtml = o.description
            ? `<span class="hisd-selection-controls__description">${escapeHtml(
                o.description,
              )}</span>`
            : '';
          return `
            <label class="hisd-selection-controls__option">
              <input class="hisd-selection-controls__input ${inputModifier}"
                     type="${type}"
                     name="${escapeHtml(name)}"
                     value="${escapeHtml(o.value)}"
                     ${checked ? 'checked' : ''}
                     ${isDisabled ? 'disabled' : ''}
                     ${showError ? 'aria-invalid="true"' : ''}
                     ${showError ? `aria-describedby="${errorId}"` : ''}>
              <span class="hisd-selection-controls__text">${escapeHtml(
                o.label,
              )}${descHtml}</span>
            </label>`;
        })
        .join('');

      const legendHtml = legend
        ? `<legend class="hisd-selection-controls__legend">${escapeHtml(
            legend,
          )}</legend>`
        : '';
      const hintHtml = hint
        ? `<span class="hisd-selection-controls__hint" id="${hintId}">${escapeHtml(
            hint,
          )}</span>`
        : '';
      const errorHtml = showError
        ? `<p class="hisd-selection-controls__error" id="${errorId}">
             <span class="sr-only">Error:</span> ${escapeHtml(errorMsg)}
           </p>`
        : '';

      const groupClass = [
        'hisd-selection-controls__group',
        showError ? 'hisd-selection-controls__group--error' : '',
      ]
        .filter(Boolean)
        .join(' ');

      // The component element itself carries the .hisd-selection-controls class
      // so the design-system CSS (which defines vars on that selector) applies.
      this.classList.add('hisd-selection-controls');

      this.innerHTML = `
        <fieldset class="${groupClass}"
                  ${type === 'radio' ? 'role="radiogroup"' : ''}
                  ${describedBy ? `aria-describedby="${describedBy}"` : ''}>
          ${legendHtml}
          ${hintHtml}
          <div class="hisd-selection-controls__list">${optionsHtml}</div>
          ${errorHtml}
        </fieldset>
        <p class="sr-only" id="${liveId}" role="status" aria-live="polite"
           style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;"></p>
      `;

      this._live = this.querySelector(`#${liveId}`);
    }

    /** Re-apply selection state onto already-rendered inputs (no full re-render). */
    _syncCheckedFromState() {
      const inputs = this.querySelectorAll('.hisd-selection-controls__input');
      inputs.forEach((input) => {
        input.checked = this._selected.has(input.value);
      });
    }

    /* ---- Behavior (ported from the vanilla demo's <script>) -------------- */

    _announce(msg) {
      if (this.getAttribute('announce') === 'false' || !this._live) return;
      this._live.textContent = '';
      // rAF nudge so repeated identical messages still re-announce.
      requestAnimationFrame(() => {
        if (this._live) this._live.textContent = msg;
      });
    }

    _onChange(e) {
      const input = e.target;
      if (
        !input.classList ||
        !input.classList.contains('hisd-selection-controls__input')
      ) {
        return;
      }

      const type = this.type;
      const labelEl = input.closest('.hisd-selection-controls__option');
      const textEl = labelEl
        ? labelEl.querySelector('.hisd-selection-controls__text')
        : null;
      const name = textEl
        ? textEl.textContent.trim().split('\n')[0].trim()
        : input.value;

      // Update selection state.
      if (type === 'radio') {
        this._selected = new Set([input.value]);
      } else {
        if (input.checked) this._selected.add(input.value);
        else this._selected.delete(input.value);
      }

      // Announce.
      if (type === 'checkbox') {
        this._announce(name + (input.checked ? ' checked' : ' unchecked'));
      } else if (type === 'radio') {
        this._announce(name + ' selected');
        // Clear the demonstrated error state once a valid choice is made.
        const group = input.closest('.hisd-selection-controls__group');
        if (
          group &&
          group.classList.contains('hisd-selection-controls__group--error')
        ) {
          this._errorCleared = true;
          group.classList.remove('hisd-selection-controls__group--error');
          group
            .querySelectorAll('[aria-invalid="true"]')
            .forEach((el) => el.removeAttribute('aria-invalid'));
          const err = group.querySelector('.hisd-selection-controls__error');
          if (err) err.hidden = true;
        }
      }

      // Emit a normalized change event for consumers.
      this.dispatchEvent(
        new CustomEvent('change', {
          bubbles: true,
          composed: true,
          detail: {
            value: this.value,
            type,
            option: input.value,
          },
        }),
      );
    }
  }

  customElements.define('hisd-selection-controls', HISDSelectionControls);
})();
