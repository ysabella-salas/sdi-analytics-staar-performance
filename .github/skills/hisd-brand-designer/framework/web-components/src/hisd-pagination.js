/**
 * <hisd-pagination> — framework-agnostic Web Component wrapper around the
 * vanilla HISD pagination component.
 *
 * LIGHT DOM by design: the element renders the canonical `.hisd-pagination`
 * markup INTO ITSELF (no shadow root), so the global design-system stylesheets
 * style it exactly like the hand-written HTML:
 *   - assets/hisd-theme.css      (tokens, light/dark, reduced-motion, forced-colors)
 *   - components/components.css   (or components/pagination.css)
 *
 * This is a thin behaviour + markup layer. It re-uses real native
 * <button>/<a> controls, so Tab + Enter/Space activation, focus, and the
 * visible focus ring come for free from the platform (matching the WAI-ARIA APG
 * pattern and the vanilla demo). The component:
 *   1. Reflects attributes -> the canonical markup (page links, prev/next, an
 *      ellipsis gap marker for elided ranges).
 *   2. Ports the demo's `goTo(...)` behaviour: clicking a page or prev/next
 *      updates `aria-current`, toggles the disabled bounds (native `disabled`
 *      AND `aria-disabled="true"`, in lockstep), updates the polite live
 *      region, re-focuses the activated control, and emits a `change` event.
 *   3. Cleans up its listener in disconnectedCallback.
 *
 * Attributes (reflected):
 *   total-pages     number   total page count (>= 1, default 1)
 *   page            number   current page, 1-based (default 1)
 *   sibling-count   number   pages shown each side of current (default 1)
 *   boundary-count  number   pages always shown at each end (default 1)
 *   href-template   string   when set, page controls render as <a> whose href is
 *                            this string with "{page}" replaced (e.g. "?page={page}")
 *   previous-label  string   visible text beside the Prev chevron ("" = icon-only)
 *   next-label      string   visible text beside the Next chevron ("" = icon-only)
 *   aria-label      string   nav accessible name (should end in "pagination")
 *   no-status       boolean  omit the "Page X of Y" live status line
 *
 * Property API mirrors the attributes (e.g. `el.page = 3`). Listen for the
 * bubbling `change` CustomEvent; `event.detail.page` is the new page number.
 */
(function () {
  'use strict';

  var ROOT_CLASS = 'hisd-pagination';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toInt(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  function range(start, end) {
    var out = [];
    for (var i = start; i <= end; i += 1) {
      out.push(i);
    }
    return out;
  }

  /**
   * Compute the page slots to render: boundary pages at each end, a window of
   * siblings around the current page, and the string 'ellipsis' wherever a run
   * of pages is elided. Mirrors the React wrapper and the demo's static markup.
   */
  function buildPageSlots(totalPages, current, siblingCount, boundaryCount) {
    var totalNumbers = boundaryCount * 2 + siblingCount * 2 + 3;
    if (totalPages <= totalNumbers) {
      return range(1, totalPages);
    }

    var startPages = range(1, boundaryCount);
    var endPages = range(totalPages - boundaryCount + 1, totalPages);

    var siblingsStart = Math.max(
      Math.min(
        current - siblingCount,
        totalPages - boundaryCount - siblingCount * 2 - 1,
      ),
      boundaryCount + 2,
    );
    var siblingsEnd = Math.min(
      Math.max(current + siblingCount, boundaryCount + siblingCount * 2 + 2),
      endPages.length > 0 ? endPages[0] - 2 : totalPages - 1,
    );

    var slots = startPages.slice();

    if (siblingsStart > boundaryCount + 2) {
      slots.push('ellipsis');
    } else if (boundaryCount + 1 < totalPages - boundaryCount) {
      slots.push(boundaryCount + 1);
    }

    slots = slots.concat(range(siblingsStart, siblingsEnd));

    if (siblingsEnd < totalPages - boundaryCount - 1) {
      slots.push('ellipsis');
    } else if (totalPages - boundaryCount > boundaryCount) {
      slots.push(totalPages - boundaryCount);
    }

    slots = slots.concat(endPages);

    // De-dupe page numbers defensively (small ranges can overlap).
    var seen = {};
    return slots.filter(function (slot) {
      if (slot === 'ellipsis') {
        return true;
      }
      if (seen[slot]) {
        return false;
      }
      seen[slot] = true;
      return true;
    });
  }

  function HISDPaginationClass() {
    if (typeof HTMLElement === 'undefined') return;

    class HISDPagination extends HTMLElement {
      static get observedAttributes() {
        return [
          'total-pages',
          'page',
          'sibling-count',
          'boundary-count',
          'href-template',
          'previous-label',
          'next-label',
          'previous-aria-label',
          'next-aria-label',
          'aria-label',
          'no-status',
        ];
      }

      constructor() {
        super();
        /** @type {HTMLElement|null} */
        this._nav = null;
        /** @type {HTMLElement|null} */
        this._status = null;
        this._onClick = this._onClick.bind(this);
        this._pendingFocusPage = null;
      }

      connectedCallback() {
        this._render();
      }

      disconnectedCallback() {
        if (this._nav) {
          this._nav.removeEventListener('click', this._onClick);
        }
        this._nav = null;
        this._status = null;
      }

      attributeChangedCallback() {
        if (this.isConnected) {
          this._render();
        }
      }

      /* -------------------------------------------------------------------- */
      /* Property <-> attribute reflection (ergonomic JS API)                  */
      /* -------------------------------------------------------------------- */
      get totalPages() {
        return Math.max(1, toInt(this.getAttribute('total-pages'), 1));
      }
      set totalPages(val) {
        this.setAttribute('total-pages', String(val));
      }

      get page() {
        return clamp(toInt(this.getAttribute('page'), 1), 1, this.totalPages);
      }
      set page(val) {
        this.setAttribute('page', String(val));
      }

      get siblingCount() {
        return Math.max(0, toInt(this.getAttribute('sibling-count'), 1));
      }
      set siblingCount(val) {
        this.setAttribute('sibling-count', String(val));
      }

      get boundaryCount() {
        return Math.max(1, toInt(this.getAttribute('boundary-count'), 1));
      }
      set boundaryCount(val) {
        this.setAttribute('boundary-count', String(val));
      }

      /* -------------------------------------------------------------------- */
      /* Page movement — ports the demo's goTo(): clamp, update aria-current,  */
      /* toggle bounds, announce, re-focus, emit `change`.                     */
      /* -------------------------------------------------------------------- */
      goTo(next, focus) {
        var total = this.totalPages;
        var target = clamp(toInt(next, this.page), 1, total);
        if (target === this.page) {
          return;
        }
        this._pendingFocusPage = focus ? target : null;
        // Setting the attribute triggers attributeChangedCallback -> _render.
        this.setAttribute('page', String(target));
        this.dispatchEvent(
          new CustomEvent('change', {
            bubbles: true,
            detail: { page: target, totalPages: total },
          }),
        );
      }

      /* -------------------------------------------------------------------- */
      /* Render the canonical markup into the light DOM.                       */
      /* -------------------------------------------------------------------- */
      _render() {
        var total = this.totalPages;
        var current = this.page;
        var slots = buildPageSlots(
          total,
          current,
          this.siblingCount,
          this.boundaryCount,
        );

        var hrefTemplate = this.getAttribute('href-template');
        var useAnchor = hrefTemplate != null && hrefTemplate !== '';
        var prevLabel = this._labelText('previous-label', 'Previous');
        var nextLabel = this._labelText('next-label', 'Next');
        var atFirst = current <= 1;
        var atLast = current >= total;

        var nav = document.createElement('nav');
        nav.className = ROOT_CLASS;
        nav.setAttribute(
          'aria-label',
          this.getAttribute('aria-label') || 'Pagination',
        );

        var list = document.createElement('ul');
        list.className = ROOT_CLASS + '__list';
        list.setAttribute('role', 'list');

        // Previous.
        list.appendChild(
          this._navItem('prev', this._prevAriaLabel(), prevLabel, atFirst),
        );

        // Page numbers + ellipses.
        for (var i = 0; i < slots.length; i += 1) {
          var slot = slots[i];
          if (slot === 'ellipsis') {
            list.appendChild(this._ellipsisItem());
          } else {
            list.appendChild(
              this._pageItem(slot, slot === current, useAnchor, hrefTemplate),
            );
          }
        }

        // Next.
        list.appendChild(
          this._navItem('next', this._nextAriaLabel(), nextLabel, atLast),
        );

        nav.appendChild(list);

        // Optional polite status line.
        var status = null;
        if (!this.hasAttribute('no-status')) {
          status = document.createElement('p');
          status.className = ROOT_CLASS + '__status';
          status.setAttribute('role', 'status');
          status.setAttribute('aria-live', 'polite');
          status.textContent = 'Page ' + current + ' of ' + total;
        }
        if (status) {
          nav.appendChild(status);
        }

        // Swap content in one shot, then (re)wire the delegated click listener.
        if (this._nav) {
          this._nav.removeEventListener('click', this._onClick);
        }
        this.innerHTML = '';
        this.appendChild(nav);
        this._nav = nav;
        this._status = status;
        nav.addEventListener('click', this._onClick);

        // Re-focus the activated control after a keyboard/click move (demo
        // parity: link.focus()).
        if (this._pendingFocusPage != null) {
          var focusTarget = nav.querySelector(
            '.' + ROOT_CLASS + '__link[data-page="' + this._pendingFocusPage + '"]',
          );
          if (focusTarget) {
            focusTarget.focus();
          }
          this._pendingFocusPage = null;
        }
      }

      _labelText(attr, fallback) {
        // Absent attribute -> default text; explicit "" -> icon-only (no label).
        if (!this.hasAttribute(attr)) {
          return fallback;
        }
        return this.getAttribute(attr) || '';
      }

      _prevAriaLabel() {
        return this.getAttribute('previous-aria-label') || 'Previous page';
      }

      _nextAriaLabel() {
        return this.getAttribute('next-aria-label') || 'Next page';
      }

      /** Build a page control <li>. */
      _pageItem(n, isCurrent, useAnchor, hrefTemplate) {
        var li = document.createElement('li');
        li.className = ROOT_CLASS + '__item';

        var control = document.createElement(useAnchor ? 'a' : 'button');
        control.className = ROOT_CLASS + '__link';
        control.setAttribute('data-page', String(n));
        control.setAttribute(
          'aria-label',
          isCurrent ? 'Page ' + n + ', current page' : 'Page ' + n,
        );
        if (isCurrent) {
          control.setAttribute('aria-current', 'page');
        }
        if (useAnchor) {
          control.setAttribute(
            'href',
            String(hrefTemplate).replace('{page}', String(n)),
          );
        } else {
          control.type = 'button';
        }
        control.textContent = String(n);

        li.appendChild(control);
        return li;
      }

      /** Build a prev/next <li> with chevron icon + optional label. */
      _navItem(direction, ariaLabel, labelText, disabled) {
        var li = document.createElement('li');
        li.className = ROOT_CLASS + '__item';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          ROOT_CLASS + '__nav ' + ROOT_CLASS + '__nav--' + direction;
        btn.setAttribute('aria-label', ariaLabel);
        btn.setAttribute('data-' + direction, '');

        // Disabled bound: native disabled AND aria-disabled, in lockstep.
        if (disabled) {
          btn.disabled = true;
          btn.setAttribute('aria-disabled', 'true');
        }

        var icon = document.createElement('span');
        icon.className = ROOT_CLASS + '__icon';
        icon.setAttribute('aria-hidden', 'true');

        var label = null;
        if (labelText) {
          label = document.createElement('span');
          label.className = ROOT_CLASS + '__label';
          label.textContent = labelText;
        }

        // Prev: icon then label; Next: label then icon (chevron mirrored by CSS).
        if (direction === 'prev') {
          btn.appendChild(icon);
          if (label) btn.appendChild(label);
        } else {
          if (label) btn.appendChild(label);
          btn.appendChild(icon);
        }

        li.appendChild(btn);
        return li;
      }

      /** Build the aria-hidden ellipsis gap marker <li>. */
      _ellipsisItem() {
        var li = document.createElement('li');
        li.className = ROOT_CLASS + '__item';
        var span = document.createElement('span');
        span.className = ROOT_CLASS + '__ellipsis';
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = '&hellip;';
        li.appendChild(span);
        return li;
      }

      /* -------------------------------------------------------------------- */
      /* Delegated click handler on the nav (light DOM).                       */
      /* -------------------------------------------------------------------- */
      _onClick(event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') {
          return;
        }

        // Prev / Next buttons.
        var navBtn = target.closest('.' + ROOT_CLASS + '__nav');
        if (navBtn) {
          if (
            navBtn.disabled ||
            navBtn.getAttribute('aria-disabled') === 'true'
          ) {
            event.preventDefault();
            return;
          }
          var delta = navBtn.hasAttribute('data-prev') ? -1 : 1;
          this.goTo(this.page + delta, false);
          return;
        }

        // Page link / button.
        var pageEl = target.closest('.' + ROOT_CLASS + '__link');
        if (pageEl) {
          var pageNum = toInt(pageEl.getAttribute('data-page'), this.page);
          // Active page is non-interactive.
          if (pageEl.getAttribute('aria-current') === 'page') {
            event.preventDefault();
            return;
          }
          // For anchors with a real href, let modified clicks (open in new tab)
          // and the native navigation proceed unless we own SPA routing. When a
          // template is supplied the href IS the navigation, so don't hijack it.
          var isAnchor = pageEl.tagName === 'A';
          if (
            isAnchor &&
            (event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0)
          ) {
            return;
          }
          // Button controls: we own the page change. Anchors: update internal
          // state for ARIA/status; the browser follows the href afterwards, and
          // SPA consumers can preventDefault on the bubbling event + call
          // .goTo() themselves.
          this.goTo(pageNum, true);
        }
      }
    }

    return HISDPagination;
  }

  if (
    typeof customElements !== 'undefined' &&
    !customElements.get('hisd-pagination')
  ) {
    var Cls = HISDPaginationClass();
    if (Cls) customElements.define('hisd-pagination', Cls);
  }
})();
