/**
 * <hisd-table> — framework-agnostic Web Component wrapper around the HISD
 * design-system `table` component.
 *
 * LIGHT DOM by design: the element renders the `hisd-table*` markup into ITSELF
 * (no shadow root) so the global design-system CSS (assets/hisd-theme.css +
 * components/components.css → table.css) styles it. This wrapper never
 * re-implements styling — the sunken bold header, zebra striping, hover wash,
 * teal selected row, sort-indicator chevron, sticky header and focusable scroll
 * region are all CSS-owned. It is a thin behaviour + markup layer that mirrors
 * components/table.html exactly: same classes, same ARIA, same keyboard contract.
 *
 * Rendered structure (identical to the demo):
 *   <div class="hisd-table-region" role="region" aria-label tabindex="0">
 *     <table class="hisd-table">
 *       <caption>…</caption>
 *       <thead><tr>
 *         <th scope="col" aria-sort="…"><button class="hisd-table__sort">…</button></th>  (sortable)
 *         <th scope="col">…</th>                                                            (plain)
 *       </tr></thead>
 *       <tbody>
 *         <tr tabindex="0" aria-selected="…"><th scope="row">…</th><td>…</td>…</tr>
 *       </tbody>
 *       <tfoot>…</tfoot>  (optional)
 *     </table>
 *   </div>
 *   + a visually-hidden role="status" aria-live="polite" announcer.
 *
 * Ported interactive behaviour (from the demo's <script>):
 *   1. Sorting — one column ascending/descending at a time. Activating a column
 *      toggles its direction and resets the others to aria-sort="none". Rows are
 *      re-ordered by each cell's data-value (numeric, comma-tolerant) or text.
 *      The native <button> handles Enter/Space for free.
 *   2. Row selection — single-select per table via aria-selected. Click, or
 *      focus a row and press Enter/Space, to select it (clears the others).
 *      Clicks inside the header sort button never count as selection.
 *   3. A polite live region announces sort + selection changes to AT.
 *
 * Authoring options:
 *   A) Declarative markup — place a `<table>` (optionally with thead/tbody/tfoot
 *      and the hisd-table* classes/attributes) as a child. It is adopted, its
 *      classes/ARIA normalised, and behaviour wired. This is the most flexible
 *      path and keeps server-rendered/SEO content intact.
 *   B) JSON props — set the `columns` and `rows` attributes to JSON (and
 *      optionally `footer`). See the property docs below.
 *
 * Reflected attributes:
 *   caption, region-label, compact (boolean), sticky-header (defaults true;
 *   set sticky-header="false" to opt out), scroll-y (boolean or a CSS length),
 *   selectable (defaults true), selected (the selected row id), sort
 *   ("columnKey:direction"). The `selected` and `sort` attributes stay in sync
 *   with interaction.
 *
 * Events:
 *   - `selection-change` (bubbling, composed) — detail: { id }.
 *   - `sort-change` (bubbling, composed) — detail: { columnKey, direction }.
 */
(function () {
  if (typeof window === "undefined" || !("customElements" in window)) {
    return;
  }
  if (customElements.get("hisd-table")) {
    return;
  }

  let uid = 0;

  /** Comma-tolerant numeric/text sort key from a raw string. */
  function sortKey(raw) {
    const text = raw == null ? "" : String(raw).trim();
    const num = parseFloat(text.replace(/,/g, ""));
    return { num, text };
  }

  class HisdTable extends HTMLElement {
    static get observedAttributes() {
      return [
        "caption",
        "region-label",
        "compact",
        "sticky-header",
        "scroll-y",
        "selectable",
        "selected",
        "sort",
        "columns",
        "rows",
        "footer",
      ];
    }

    constructor() {
      super();
      this._id = `hisd-table-${(uid += 1)}`;
      this._rendered = false;
      /** @type {HTMLTableElement | null} */
      this._table = null;
      /** @type {HTMLElement | null} */
      this._region = null;
      /** @type {HTMLElement | null} */
      this._live = null;
      /**
       * Column key for the row-header cell (scope="row"); first column unless a
       * column opts in with rowHeader.
       * @type {string}
       */
      this._rowHeaderKey = "";
      /** Authored <table> captured before we re-render, if any. */
      this._authoredTable = null;

      this._onSortClick = this._onSortClick.bind(this);
      this._onRowClick = this._onRowClick.bind(this);
      this._onRowKeyDown = this._onRowKeyDown.bind(this);

      // Tracks the bound nodes so disconnectedCallback can clean up exactly the
      // listeners we added (the demo binds per-button and per-row).
      this._sortButtons = [];
      this._rows = [];
    }

    connectedCallback() {
      if (!this._rendered) {
        this._authoredTable = this.querySelector("table");
        this._render();
        this._rendered = true;
      }
      this._bind();
    }

    disconnectedCallback() {
      this._unbind();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this._rendered) {
        return;
      }
      switch (name) {
        case "caption":
          this._renderCaption();
          break;
        case "region-label":
          this._applyRegionLabel();
          break;
        case "compact":
          this._applyCompact();
          break;
        case "sticky-header":
        case "scroll-y":
          this._applyRegionModifiers();
          break;
        case "selectable":
          // Re-wire from scratch so tabindex / aria-selected / listeners match.
          this._unbind();
          this._applySelectable();
          this._bind();
          break;
        case "selected":
          this._applySelected(newValue);
          break;
        case "sort":
          this._applySortAttribute(newValue);
          break;
        case "columns":
        case "rows":
        case "footer":
          // Data-driven re-render (only meaningful when not authored as markup).
          if (!this._authoredTable) {
            this._unbind();
            this._render();
            this._bind();
          }
          break;
        default:
          break;
      }
    }

    /* ----------------------------------------------------------------------
       Public properties.
       ---------------------------------------------------------------------- */
    get selected() {
      return this.getAttribute("selected");
    }
    set selected(next) {
      if (next == null) {
        this.removeAttribute("selected");
      } else {
        this.setAttribute("selected", String(next));
      }
    }

    get selectable() {
      return this._isSelectable();
    }
    set selectable(next) {
      this.setAttribute("selectable", next ? "true" : "false");
    }

    /** Current sort as { columnKey, direction }. */
    get sort() {
      return this._parseSortAttribute(this.getAttribute("sort"));
    }
    set sort(next) {
      if (!next || !next.columnKey || next.direction === "none") {
        this.removeAttribute("sort");
      } else {
        this.setAttribute("sort", `${next.columnKey}:${next.direction}`);
      }
    }

    /** Direct access to the underlying <table>. */
    get table() {
      return this._table;
    }

    /* ----------------------------------------------------------------------
       Rendering.
       ---------------------------------------------------------------------- */
    _isSelectable() {
      const attr = this.getAttribute("selectable");
      return attr == null ? true : attr !== "false";
    }

    _isStickyHeader() {
      const attr = this.getAttribute("sticky-header");
      return attr == null ? true : attr !== "false";
    }

    _render() {
      this.innerHTML = "";

      // Scroll region — the focusable WAI-ARIA region wrapper.
      const region = document.createElement("div");
      region.className = "hisd-table-region";
      region.setAttribute("role", "region");
      region.setAttribute("tabindex", "0");
      this._region = region;

      // Table — either adopt the authored <table> or build one from JSON.
      let table;
      if (this._authoredTable) {
        table = this._authoredTable;
        this._normaliseAuthoredTable(table);
      } else {
        table = this._buildTableFromData();
      }
      this._table = table;

      region.appendChild(table);
      this.appendChild(region);

      // Visually-hidden polite announcer (mirrors the demo's #table-live).
      const live = document.createElement("div");
      live.id = `${this._id}-live`;
      live.setAttribute("role", "status");
      live.setAttribute("aria-live", "polite");
      live.style.cssText =
        "position:absolute;width:1px;height:1px;padding:0;margin:-1px;" +
        "overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
      this._live = live;
      this.appendChild(live);

      this._resolveRowHeaderKey();
      this._renderCaption();
      this._applyRegionLabel();
      this._applyCompact();
      this._applyRegionModifiers();
      this._applySelectable();
      // Honour an initial sort attribute by actually ordering rows.
      const initialSort = this.getAttribute("sort");
      if (initialSort) {
        this._applySortAttribute(initialSort);
      }
      // Honour an initial selected attribute. When none is set, adopt any row
      // that was pre-marked aria-selected="true" (JSON `selected` / authored
      // markup) and reflect it to the attribute instead of clobbering it.
      if (this.hasAttribute("selected")) {
        this._applySelected(this.getAttribute("selected"));
      } else {
        this._adoptPreselectedRow();
      }
    }

    /**
     * On first render, if a row is already marked aria-selected="true" (from the
     * JSON `selected`/`defaultSelected` flag or authored markup), reflect its id
     * to the `selected` attribute and ensure all other rows read "false".
     */
    _adoptPreselectedRow() {
      if (!this._table || !this._isSelectable()) {
        return;
      }
      const tbody = this._table.tBodies[0];
      if (!tbody) {
        return;
      }
      let selectedRow = null;
      Array.prototype.forEach.call(tbody.rows, (row) => {
        if (row.getAttribute("aria-selected") === "true") {
          if (selectedRow) {
            // Enforce single-select: keep the first, clear later duplicates.
            row.setAttribute("aria-selected", "false");
          } else {
            selectedRow = row;
          }
        }
      });
      if (selectedRow) {
        const id = selectedRow.getAttribute("data-row-id");
        if (id != null) {
          this.setAttribute("selected", id);
        }
      }
    }

    /** Ensure an author-supplied <table> carries the required classes/ARIA. */
    _normaliseAuthoredTable(table) {
      table.classList.add("hisd-table");

      // Sortable headers: a <th> with a .hisd-table__sort button is sortable;
      // ensure each carries aria-sort (default "none" when absent).
      const sortButtons = table.querySelectorAll("thead .hisd-table__sort");
      sortButtons.forEach((button) => {
        const th = button.closest("th");
        if (th && !th.hasAttribute("aria-sort")) {
          th.setAttribute("aria-sort", "none");
        }
      });
    }

    /** Build the full <table> markup from the `columns`/`rows` JSON props. */
    _buildTableFromData() {
      const columns = this._parseJSON("columns") || [];
      const rows = this._parseJSON("rows") || [];
      const footer = this._parseJSON("footer");

      const table = document.createElement("table");
      table.className = "hisd-table";

      const caption = document.createElement("caption");
      table.appendChild(caption); // text filled by _renderCaption

      // Resolve the row-header column up front.
      const rowHeaderKey = this._computeRowHeaderKey(columns);

      // thead
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      columns.forEach((col) => {
        const th = document.createElement("th");
        th.setAttribute("scope", "col");
        if (col.numeric) {
          th.classList.add("hisd-table__cell--numeric");
        }
        if (col.sortable) {
          th.setAttribute("aria-sort", "none");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "hisd-table__sort";
          const label = document.createElement("span");
          label.className = "hisd-table__sort-label";
          label.textContent = col.header != null ? String(col.header) : "";
          const icon = document.createElement("span");
          icon.className = "hisd-table__sort-icon";
          icon.setAttribute("aria-hidden", "true");
          button.appendChild(label);
          button.appendChild(icon);
          th.appendChild(button);
        } else {
          th.textContent = col.header != null ? String(col.header) : "";
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      // tbody
      const tbody = document.createElement("tbody");
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        if (row.id != null) {
          tr.setAttribute("data-row-id", String(row.id));
        }
        if (row.selected || row.defaultSelected) {
          tr.setAttribute("aria-selected", "true");
        }
        columns.forEach((col) => {
          const raw = row.cells ? row.cells[col.key] : undefined;
          const isObj = raw != null && typeof raw === "object";
          const display = isObj
            ? raw.display != null
              ? String(raw.display)
              : ""
            : raw != null
              ? String(raw)
              : "";
          const value = isObj && raw.value != null ? String(raw.value) : null;

          const cell =
            col.key === rowHeaderKey
              ? document.createElement("th")
              : document.createElement("td");
          if (col.key === rowHeaderKey) {
            cell.setAttribute("scope", "row");
          }
          if (col.numeric) {
            cell.classList.add("hisd-table__cell--numeric");
          }
          if (value != null) {
            cell.setAttribute("data-value", value);
          }
          cell.textContent = display;
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      // tfoot
      if (footer && typeof footer === "object") {
        const tfoot = document.createElement("tfoot");
        const footRow = document.createElement("tr");
        columns.forEach((col) => {
          const content = footer[col.key];
          const cell =
            col.key === rowHeaderKey
              ? document.createElement("th")
              : document.createElement("td");
          if (col.key === rowHeaderKey) {
            cell.setAttribute("scope", "row");
          }
          if (col.numeric) {
            cell.classList.add("hisd-table__cell--numeric");
          }
          cell.textContent = content != null ? String(content) : "";
          footRow.appendChild(cell);
        });
        tfoot.appendChild(footRow);
        table.appendChild(tfoot);
      }

      return table;
    }

    _computeRowHeaderKey(columns) {
      const flagged = columns.find((c) => c && c.rowHeader);
      if (flagged) {
        return flagged.key;
      }
      return columns[0] ? columns[0].key : "";
    }

    /**
     * Resolve the live row-header column key from the rendered DOM so both the
     * authored-markup and JSON paths agree. The first <th scope="row"> in the
     * body identifies which column index is the row header.
     */
    _resolveRowHeaderKey() {
      // For JSON-built tables we can derive the key directly.
      const columns = this._parseJSON("columns");
      if (columns && Array.isArray(columns) && columns.length) {
        this._rowHeaderKey = this._computeRowHeaderKey(columns);
      } else {
        this._rowHeaderKey = "";
      }
    }

    _renderCaption() {
      if (!this._table) {
        return;
      }
      const captionText = this.getAttribute("caption");
      let caption = this._table.querySelector("caption");
      // When authored markup already provides a caption and no attribute is set,
      // leave the authored one alone.
      if (captionText == null) {
        return;
      }
      if (!caption) {
        caption = document.createElement("caption");
        this._table.insertBefore(caption, this._table.firstChild);
      }
      caption.textContent = captionText;
    }

    _regionLabelText() {
      const explicit = this.getAttribute("region-label");
      if (explicit != null) {
        return explicit;
      }
      const captionAttr = this.getAttribute("caption");
      if (captionAttr != null) {
        return captionAttr;
      }
      const caption = this._table && this._table.querySelector("caption");
      return caption ? caption.textContent.trim() : "";
    }

    _applyRegionLabel() {
      if (!this._region) {
        return;
      }
      const label = this._regionLabelText();
      if (label) {
        this._region.setAttribute("aria-label", label);
      } else {
        this._region.removeAttribute("aria-label");
      }
    }

    _applyCompact() {
      if (!this._table) {
        return;
      }
      this._table.classList.toggle(
        "hisd-table--compact",
        this.hasAttribute("compact") &&
          this.getAttribute("compact") !== "false",
      );
    }

    _applyRegionModifiers() {
      if (!this._region) {
        return;
      }
      // Sticky header opt-out.
      this._region.classList.toggle(
        "hisd-table-region--no-sticky",
        !this._isStickyHeader(),
      );

      // scroll-y: boolean toggles the modifier; a length value also sets the
      // custom property that caps the region height.
      const scrollY = this.getAttribute("scroll-y");
      const enabled = scrollY != null && scrollY !== "false";
      this._region.classList.toggle("hisd-table-region--scroll-y", enabled);
      if (enabled && scrollY !== "" && scrollY !== "true") {
        this._region.style.setProperty("--hisd-table-max-block-size", scrollY);
      } else {
        this._region.style.removeProperty("--hisd-table-max-block-size");
      }
    }

    /** Ensure body rows are focusable + carry aria-selected when selectable. */
    _applySelectable() {
      if (!this._table) {
        return;
      }
      const selectable = this._isSelectable();
      const tbody = this._table.tBodies[0];
      if (!tbody) {
        return;
      }
      Array.prototype.forEach.call(tbody.rows, (row) => {
        if (selectable) {
          if (!row.hasAttribute("tabindex")) {
            row.setAttribute("tabindex", "0");
          }
          if (!row.hasAttribute("aria-selected")) {
            row.setAttribute("aria-selected", "false");
          }
        } else {
          row.removeAttribute("tabindex");
          row.removeAttribute("aria-selected");
        }
      });
    }

    /* ----------------------------------------------------------------------
       Behaviour — sorting + selection, ported from the demo <script>.
       ---------------------------------------------------------------------- */
    _bind() {
      if (!this._table) {
        return;
      }
      // Sort buttons.
      this._sortButtons = Array.prototype.slice.call(
        this._table.querySelectorAll("thead th[aria-sort] .hisd-table__sort"),
      );
      this._sortButtons.forEach((button) => {
        button.addEventListener("click", this._onSortClick);
      });

      // Selectable rows.
      if (this._isSelectable()) {
        const tbody = this._table.tBodies[0];
        this._rows = tbody
          ? Array.prototype.slice.call(tbody.rows)
          : [];
        this._rows.forEach((row) => {
          row.addEventListener("click", this._onRowClick);
          row.addEventListener("keydown", this._onRowKeyDown);
        });
      } else {
        this._rows = [];
      }
    }

    _unbind() {
      this._sortButtons.forEach((button) => {
        button.removeEventListener("click", this._onSortClick);
      });
      this._sortButtons = [];
      this._rows.forEach((row) => {
        row.removeEventListener("click", this._onRowClick);
        row.removeEventListener("keydown", this._onRowKeyDown);
      });
      this._rows = [];
    }

    _announce(message) {
      if (this._live) {
        this._live.textContent = message;
      }
    }

    _onSortClick(event) {
      const button = event.currentTarget;
      const th = button.closest("th");
      if (!th || !this._table) {
        return;
      }
      const headerRow = th.parentNode;
      const columnIndex = Array.prototype.indexOf.call(headerRow.cells, th);

      const current = th.getAttribute("aria-sort");
      const next = current === "ascending" ? "descending" : "ascending";

      // Reset every sortable column in this table to "none"...
      const headerCells = this._table.querySelectorAll("thead th[aria-sort]");
      headerCells.forEach((otherTh) => {
        otherTh.setAttribute("aria-sort", "none");
      });
      // ...then set the active direction on the clicked column.
      th.setAttribute("aria-sort", next);

      this._sortByColumnIndex(columnIndex, next);

      // Reflect to the `sort` attribute via columnKey when we can derive it.
      const columns = this._parseJSON("columns");
      if (columns && columns[columnIndex]) {
        this.setAttribute("sort", `${columns[columnIndex].key}:${next}`);
      }

      const label = button.querySelector(".hisd-table__sort-label");
      const name = label ? label.textContent.trim() : "column";
      this._announce(`${name} sorted ${next}`);

      this.dispatchEvent(
        new CustomEvent("sort-change", {
          bubbles: true,
          composed: true,
          detail: {
            columnKey:
              columns && columns[columnIndex] ? columns[columnIndex].key : null,
            columnIndex,
            direction: next,
          },
        }),
      );
    }

    /** Re-order tbody rows by the cell at columnIndex (data-value or text). */
    _sortByColumnIndex(columnIndex, direction) {
      if (!this._table) {
        return;
      }
      const tbody = this._table.tBodies[0];
      if (!tbody) {
        return;
      }
      const rows = Array.prototype.slice.call(tbody.rows);
      rows.sort((a, b) => {
        const cellA = a.cells[columnIndex];
        const cellB = b.cells[columnIndex];
        const rawA = cellA
          ? cellA.getAttribute("data-value") !== null
            ? cellA.getAttribute("data-value")
            : cellA.textContent.trim()
          : "";
        const rawB = cellB
          ? cellB.getAttribute("data-value") !== null
            ? cellB.getAttribute("data-value")
            : cellB.textContent.trim()
          : "";
        const ka = sortKey(rawA);
        const kb = sortKey(rawB);
        const bothNumeric = !Number.isNaN(ka.num) && !Number.isNaN(kb.num);
        const result = bothNumeric
          ? ka.num - kb.num
          : ka.text.localeCompare(kb.text, undefined, { sensitivity: "base" });
        return direction === "descending" ? -result : result;
      });
      rows.forEach((row) => tbody.appendChild(row));
    }

    _onRowClick(event) {
      // Ignore clicks that land on a nested interactive element so sorting (or
      // any in-cell control) never doubles as selection.
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, select, textarea")
      ) {
        return;
      }
      this._selectRow(event.currentTarget);
    }

    _onRowKeyDown(event) {
      // Only activate when the row itself is focused (not a child control).
      if (event.target !== event.currentTarget) {
        return;
      }
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "Spacebar"
      ) {
        event.preventDefault();
        this._selectRow(event.currentTarget);
      }
    }

    _selectRow(row) {
      if (!this._table || !this._isSelectable()) {
        return;
      }
      const tbody = this._table.tBodies[0];
      const rows = tbody ? tbody.rows : [];
      Array.prototype.forEach.call(rows, (r) => {
        r.setAttribute("aria-selected", r === row ? "true" : "false");
      });

      const id = row.getAttribute("data-row-id");
      if (id != null) {
        // No-op-safe: attributeChangedCallback's selected branch only re-applies
        // the visual state, which already matches.
        this.setAttribute("selected", id);
      }

      const heading = row.querySelector('th[scope="row"]');
      this._announce(
        `${heading ? heading.textContent.trim() : "Row"} selected`,
      );

      this.dispatchEvent(
        new CustomEvent("selection-change", {
          bubbles: true,
          composed: true,
          detail: { id: id != null ? id : null },
        }),
      );
    }

    /** Reflect a `selected` attribute change onto the rows' aria-selected. */
    _applySelected(id) {
      if (!this._table || !this._isSelectable()) {
        return;
      }
      const tbody = this._table.tBodies[0];
      if (!tbody) {
        return;
      }
      Array.prototype.forEach.call(tbody.rows, (row) => {
        const rowId = row.getAttribute("data-row-id");
        row.setAttribute(
          "aria-selected",
          id != null && rowId === id ? "true" : "false",
        );
      });
    }

    /* ----------------------------------------------------------------------
       Sort attribute helpers.
       ---------------------------------------------------------------------- */
    _parseSortAttribute(value) {
      if (!value) {
        return { columnKey: null, direction: "none" };
      }
      const idx = value.lastIndexOf(":");
      if (idx === -1) {
        return { columnKey: value, direction: "ascending" };
      }
      const columnKey = value.slice(0, idx);
      const direction = value.slice(idx + 1);
      return {
        columnKey: columnKey || null,
        direction:
          direction === "ascending" || direction === "descending"
            ? direction
            : "none",
      };
    }

    /** Apply a `sort` attribute value: set aria-sort + actually order rows. */
    _applySortAttribute(value) {
      if (!this._table) {
        return;
      }
      const parsed = this._parseSortAttribute(value);
      const headerCells = Array.prototype.slice.call(
        this._table.querySelectorAll("thead th[aria-sort]"),
      );
      if (!parsed.columnKey || parsed.direction === "none") {
        headerCells.forEach((th) => th.setAttribute("aria-sort", "none"));
        return;
      }

      // Map the columnKey to an index via the JSON columns when available;
      // otherwise fall back to matching the header label text.
      let columnIndex = -1;
      const columns = this._parseJSON("columns");
      if (columns && Array.isArray(columns)) {
        columnIndex = columns.findIndex((c) => c && c.key === parsed.columnKey);
      }
      if (columnIndex === -1) {
        // Match by visible header label as a fallback for authored markup.
        const headerRow =
          this._table.tHead && this._table.tHead.rows[0]
            ? this._table.tHead.rows[0]
            : null;
        if (headerRow) {
          columnIndex = Array.prototype.findIndex.call(
            headerRow.cells,
            (th) => {
              const label = th.querySelector(".hisd-table__sort-label");
              const text = (label ? label.textContent : th.textContent).trim();
              return text === parsed.columnKey;
            },
          );
        }
      }
      if (columnIndex === -1) {
        return;
      }

      // Find the matching th to set aria-sort; reset the rest.
      const headerRow = this._table.tHead.rows[0];
      const targetTh = headerRow.cells[columnIndex];
      headerCells.forEach((th) =>
        th.setAttribute(
          "aria-sort",
          th === targetTh ? parsed.direction : "none",
        ),
      );
      this._sortByColumnIndex(columnIndex, parsed.direction);
    }

    /* ----------------------------------------------------------------------
       JSON attribute parsing.
       ---------------------------------------------------------------------- */
    _parseJSON(attr) {
      const raw = this.getAttribute(attr);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    }
  }

  customElements.define("hisd-table", HisdTable);
})();
