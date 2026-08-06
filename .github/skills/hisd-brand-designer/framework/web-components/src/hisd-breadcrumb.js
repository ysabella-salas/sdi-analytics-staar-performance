/**
 * <hisd-breadcrumb> — framework-agnostic Web Component wrapping the vanilla
 * `.hisd-breadcrumb` component.
 * ============================================================================
 * LIGHT DOM by design: the element renders its markup into itself (no shadow
 * root) so the GLOBAL design-system CSS (assets/hisd-theme.css +
 * components/components.css, which includes components/breadcrumb.css) styles
 * it. This component NEVER re-implements styling — it only applies the
 * `hisd-breadcrumb*` classes and the ARIA contract, and ports the demo's
 * <script> behavior faithfully.
 *
 * Markup model (matches components/breadcrumb.html):
 *   <nav class="hisd-breadcrumb" aria-label="Breadcrumb">
 *     <ol class="hisd-breadcrumb__list">
 *       <li class="hisd-breadcrumb__item">
 *         <a class="hisd-breadcrumb__link" href="…">…</a></li>
 *       <li class="hisd-breadcrumb__separator" aria-hidden="true"></li>
 *       …
 *       <li class="hisd-breadcrumb__item">
 *         <span class="hisd-breadcrumb__current" aria-current="page">…</span></li>
 *     </ol>
 *   </nav>
 *
 * Two ways to supply crumbs:
 *   1. `items` property / `items` attribute (JSON array). Each entry:
 *      { label, href?, current?, truncate?, title?, collapsible? }.
 *      The component renders the full trail, separators, and (when any crumb is
 *      collapsible) the overflow disclosure.
 *   2. If no `items` are given but the host has authored light-DOM children
 *      already using the `hisd-breadcrumb*` classes, they are left as-is and the
 *      disclosure behavior is wired to whatever overflow button is present.
 *
 * Reflected attributes:
 *   - label       (string)  -> aria-label on the <nav> (default "Breadcrumb")
 *   - collapsible (boolean) -> force the overflow disclosure on
 *   - expanded    (boolean) <-> disclosure open/closed state
 *   - items       (string)  -> JSON crumb array (alternative to the .items prop)
 *
 * Properties:
 *   - items     (Array)   the crumb model (preferred over the attribute)
 *   - expanded  (boolean) the disclosure state
 *   - collapsible (boolean)
 *
 * Events:
 *   - "toggle": dispatched after the overflow disclosure is toggled, with
 *     detail = { expanded: boolean }. Bubbles.
 *
 * Behavior (ported faithfully from the demo script — APG disclosure pattern):
 *   - The `…` button toggles aria-expanded and shows/hides the [hidden]
 *     `--collapsible` crumbs (and their separators).
 *   - On expand, focus moves to the first revealed link; on collapse, focus
 *     returns to the `…` button.
 *   - The button's aria-label swaps between "Show N hidden…" and "Hide N…".
 *   - Activation is Enter/Space via the native <button>.
 *   - Listeners are cleaned up in disconnectedCallback.
 *   - prefers-reduced-motion / forced-colors are handled by the CSS already.
 * ============================================================================
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !('customElements' in window)) return;
  if (customElements.get('hisd-breadcrumb')) return; // guard double-definition

  var BC = 'hisd-breadcrumb';
  var BC_LIST = 'hisd-breadcrumb__list';
  var BC_ITEM = 'hisd-breadcrumb__item';
  var BC_ITEM_COLLAPSIBLE = 'hisd-breadcrumb__item--collapsible';
  var BC_LINK = 'hisd-breadcrumb__link';
  var BC_LINK_TRUNCATE = 'hisd-breadcrumb__link--truncate';
  var BC_CURRENT = 'hisd-breadcrumb__current';
  var BC_CURRENT_TRUNCATE = 'hisd-breadcrumb__current--truncate';
  var BC_SEPARATOR = 'hisd-breadcrumb__separator';
  var BC_OVERFLOW = 'hisd-breadcrumb__overflow';

  function isTruthyAttr(value) {
    // Boolean-attribute semantics: present (even "") is true, "false" is false.
    return value !== null && value !== undefined && value !== 'false';
  }

  function formatLabel(template, n) {
    return String(template).replace('{n}', String(n));
  }

  /** Resolve which crumb is the current page (explicit flag, else the last). */
  function currentIndex(items) {
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].current) return i;
    }
    return items.length - 1;
  }

  class HisdBreadcrumb extends HTMLElement {
    static get observedAttributes() {
      return ['label', 'collapsible', 'expanded', 'items'];
    }

    constructor() {
      super();
      /** @type {HTMLElement|null} The inner <nav>. */
      this._nav = null;
      /** @type {HTMLButtonElement|null} The overflow `…` disclosure button. */
      this._toggle = null;
      /** @type {Array} The crumb model supplied via the `items` property. */
      this._items = null;
      this._connected = false;
      this._onToggleClick = this._handleToggleClick.bind(this);
    }

    // ---- Property <-> attribute reflection ---------------------------------

    get items() {
      if (this._items) return this._items;
      var raw = this.getAttribute('items');
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {
          /* ignore malformed JSON; fall through to null */
        }
      }
      return null;
    }
    set items(val) {
      // Setting the property takes precedence over the attribute and re-renders.
      this._items = Array.isArray(val) ? val : null;
      if (this._connected) this._render();
    }

    get label() {
      return this.getAttribute('label') || 'Breadcrumb';
    }
    set label(v) {
      if (v == null) this.removeAttribute('label');
      else this.setAttribute('label', v);
    }

    get collapsible() {
      return isTruthyAttr(this.getAttribute('collapsible'));
    }
    set collapsible(v) {
      if (v) this.setAttribute('collapsible', '');
      else this.removeAttribute('collapsible');
    }

    get expanded() {
      return isTruthyAttr(this.getAttribute('expanded'));
    }
    set expanded(v) {
      if (v) this.setAttribute('expanded', '');
      else this.removeAttribute('expanded');
    }

    // ---- Lifecycle ---------------------------------------------------------

    connectedCallback() {
      this._connected = true;
      this._render();
    }

    disconnectedCallback() {
      this._connected = false;
      this._teardownListeners();
      this._nav = null;
      this._toggle = null;
    }

    attributeChangedCallback() {
      if (this._connected) this._render();
    }

    // ---- Rendering ---------------------------------------------------------

    _render() {
      var items = this.items;

      if (items && items.length) {
        // Model-driven: (re)build the full trail markup from `items`.
        this._renderFromItems(items);
      } else if (this._nav) {
        // We previously rendered model-driven markup but now have no items.
        // Leave the last rendered nav in place (no destructive clearing) but
        // still re-apply the disclosure state + aria-label.
        this._applyNavAria();
        this._wireExistingDisclosure();
        this._syncDisclosure();
      } else {
        // Author-supplied light-DOM markup. Adopt an existing <nav> (or the
        // host's own children) and just wire/sync the disclosure behavior.
        this._adoptAuthoredMarkup();
      }
    }

    _renderFromItems(items) {
      this._teardownListeners();

      var doc = this.ownerDocument;
      var collapsibleCount = items.filter(function (c) {
        return c && c.collapsible;
      }).length;
      var hasCollapsible = this.collapsible || collapsibleCount > 0;
      var expanded = this.expanded;
      var leaf = currentIndex(items);

      var nav = doc.createElement('nav');
      nav.className = BC;
      nav.setAttribute('aria-label', this.label);

      var list = doc.createElement('ol');
      list.className = BC_LIST;

      var overflowInjected = false;
      var firstRevealedAssigned = false;
      var firstRevealed = null;
      var toggleBtn = null;

      var expandLabel = formatLabel(
        this.getAttribute('overflow-expand-label') ||
          'Show {n} hidden breadcrumb levels',
        collapsibleCount,
      );
      var collapseLabel = formatLabel(
        this.getAttribute('overflow-collapse-label') ||
          'Hide {n} breadcrumb levels',
        collapsibleCount,
      );

      for (var index = 0; index < items.length; index++) {
        var crumb = items[index] || {};
        var isLeaf = index === leaf;
        var isCollapsibleCrumb = hasCollapsible && Boolean(crumb.collapsible);

        // Separator before every crumb except the first.
        if (index > 0) {
          var sep = doc.createElement('li');
          sep.className =
            BC_SEPARATOR +
            (isCollapsibleCrumb ? ' ' + BC_ITEM_COLLAPSIBLE : '');
          sep.setAttribute('aria-hidden', 'true');
          if (isCollapsibleCrumb && !expanded) sep.setAttribute('hidden', '');
          list.appendChild(sep);
        }

        // Inject the overflow disclosure once, before the first collapsed crumb.
        if (hasCollapsible && isCollapsibleCrumb && !overflowInjected) {
          overflowInjected = true;

          var overflowItem = doc.createElement('li');
          overflowItem.className = BC_ITEM;
          toggleBtn = doc.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = BC_OVERFLOW;
          toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          toggleBtn.setAttribute(
            'aria-label',
            expanded ? collapseLabel : expandLabel,
          );
          toggleBtn.textContent = '…'; // …
          overflowItem.appendChild(toggleBtn);
          list.appendChild(overflowItem);

          // Separator between the `…` button and the first revealed crumb.
          var overflowSep = doc.createElement('li');
          overflowSep.className = BC_SEPARATOR + ' ' + BC_ITEM_COLLAPSIBLE;
          overflowSep.setAttribute('aria-hidden', 'true');
          if (!expanded) overflowSep.setAttribute('hidden', '');
          list.appendChild(overflowSep);
        }

        // The crumb itself.
        var li = doc.createElement('li');
        if (isLeaf) {
          li.className = BC_ITEM;
          var current = doc.createElement('span');
          current.className =
            BC_CURRENT + (crumb.truncate ? ' ' + BC_CURRENT_TRUNCATE : '');
          current.setAttribute('aria-current', 'page');
          if (crumb.title) current.setAttribute('title', crumb.title);
          current.textContent = crumb.label != null ? String(crumb.label) : '';
          li.appendChild(current);
        } else {
          li.className =
            BC_ITEM + (isCollapsibleCrumb ? ' ' + BC_ITEM_COLLAPSIBLE : '');
          if (isCollapsibleCrumb && !expanded) li.setAttribute('hidden', '');
          var link = doc.createElement('a');
          link.className =
            BC_LINK + (crumb.truncate ? ' ' + BC_LINK_TRUNCATE : '');
          if (crumb.href != null) link.setAttribute('href', String(crumb.href));
          if (crumb.title) link.setAttribute('title', crumb.title);
          link.textContent = crumb.label != null ? String(crumb.label) : '';
          li.appendChild(link);

          if (isCollapsibleCrumb && !firstRevealedAssigned) {
            firstRevealedAssigned = true;
            firstRevealed = link;
          }
        }
        list.appendChild(li);
      }

      nav.appendChild(list);

      // Swap the rendered nav into our light DOM.
      this.textContent = '';
      this.appendChild(nav);
      this._nav = nav;
      this._toggle = toggleBtn;
      this._firstRevealed = firstRevealed;

      if (this._toggle) {
        this._toggle.addEventListener('click', this._onToggleClick);
      }
    }

    /** Adopt author-supplied markup and wire the disclosure to its `…` button. */
    _adoptAuthoredMarkup() {
      this._teardownListeners();
      var nav = this.querySelector('.' + BC) || this;
      this._nav = nav.classList && nav.classList.contains(BC) ? nav : null;
      this._applyNavAria();
      this._wireExistingDisclosure();
      this._syncDisclosure();
    }

    _applyNavAria() {
      if (this._nav && !this._nav.hasAttribute('aria-label')) {
        this._nav.setAttribute('aria-label', this.label);
      }
    }

    _wireExistingDisclosure() {
      var scope = this._nav || this;
      var toggle = scope.querySelector('.' + BC_OVERFLOW);
      if (toggle !== this._toggle) {
        if (this._toggle) {
          this._toggle.removeEventListener('click', this._onToggleClick);
        }
        this._toggle = toggle;
        if (this._toggle) {
          this._toggle.addEventListener('click', this._onToggleClick);
        }
      }
      // Cache the first collapsible link for focus management on expand.
      var firstItem = scope.querySelector(
        '.' + BC_ITEM_COLLAPSIBLE + ' .' + BC_LINK,
      );
      this._firstRevealed = firstItem || null;
    }

    // ---- Behavior (disclosure) --------------------------------------------

    _handleToggleClick() {
      var next = !this.expanded;
      // Reflect the attribute; for model-driven markup this re-renders, for
      // authored markup we sync below. Either way we then manage focus.
      this.expanded = next;

      // If we are in authored-markup mode (no model), attributeChangedCallback
      // re-runs _render(), which for the author path only re-syncs — so apply
      // the show/hide + focus + label here too for both paths.
      this._syncDisclosure();
      this._manageFocus(next);

      this.dispatchEvent(
        new CustomEvent('toggle', {
          detail: { expanded: next },
          bubbles: true,
        }),
      );
    }

    /** Show/hide the collapsible crumbs and update the button label/state. */
    _syncDisclosure() {
      var scope = this._nav || this;
      var toggle = this._toggle;
      var expanded = this.expanded;
      var collapsibles = scope.querySelectorAll('.' + BC_ITEM_COLLAPSIBLE);

      for (var i = 0; i < collapsibles.length; i++) {
        if (expanded) collapsibles[i].removeAttribute('hidden');
        else collapsibles[i].setAttribute('hidden', '');
      }

      if (toggle) {
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        // Swap the accessible name. Prefer explicit attrs; else count crumbs.
        var n = scope.querySelectorAll(
          '.' + BC_ITEM_COLLAPSIBLE + '.' + BC_ITEM,
        ).length;
        var expandLabel = formatLabel(
          this.getAttribute('overflow-expand-label') ||
            'Show {n} hidden breadcrumb levels',
          n,
        );
        var collapseLabel = formatLabel(
          this.getAttribute('overflow-collapse-label') ||
            'Hide {n} breadcrumb levels',
          n,
        );
        toggle.setAttribute(
          'aria-label',
          expanded ? collapseLabel : expandLabel,
        );
      }
    }

    /** Move focus to the first revealed link on expand, back to button on collapse. */
    _manageFocus(expanded) {
      if (expanded) {
        var scope = this._nav || this;
        var firstLink =
          this._firstRevealed ||
          scope.querySelector('.' + BC_ITEM_COLLAPSIBLE + ' .' + BC_LINK);
        if (firstLink) firstLink.focus();
      } else if (this._toggle) {
        this._toggle.focus();
      }
    }

    _teardownListeners() {
      if (this._toggle) {
        this._toggle.removeEventListener('click', this._onToggleClick);
      }
    }
  }

  customElements.define('hisd-breadcrumb', HisdBreadcrumb);
})();
