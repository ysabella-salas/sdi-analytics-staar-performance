import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type TableHTMLAttributes,
} from "react";

/**
 * HISD Table — typed React wrapper around the design-system `table` component.
 *
 * This is a THIN behaviour + markup layer. It re-uses the existing component
 * CSS (assets/hisd-theme.css + components/components.css → table.css) by
 * applying the same `hisd-table*` classes and the same ARIA contract as
 * components/table.html. It NEVER re-implements styling — the sunken bold
 * header, zebra striping, hover wash, teal selected row, sort-indicator
 * chevron, sticky header and focusable scroll region are all CSS-owned.
 *
 * Markup + roles mirror table.html exactly:
 *   - A focusable scroll region: <div role="region" aria-label tabindex="0">
 *     wrapping a <table class="hisd-table">.
 *   - <caption> as the visible/accessible title.
 *   - Sortable headers: a real <button class="hisd-table__sort"> inside a <th>
 *     carrying aria-sort ("none" | "ascending" | "descending"). The native
 *     <button> handles Enter/Space activation for free.
 *   - Non-sortable headers: plain text in <th scope="col">, no button, no
 *     aria-sort.
 *   - Numeric cells: .hisd-table__cell--numeric.
 *   - Selectable rows: <tr tabindex="0" aria-selected> — click, or focus + Enter
 *     / Space, toggles single-select selection (mirrors the demo <script>).
 *
 * Ported interactive behaviour (from the demo's <script>):
 *   1. Sorting — one column ascending/descending at a time. Activating a column
 *      toggles its direction and resets the others to aria-sort="none". Rows are
 *      re-ordered by each cell's `value` (numeric, comma-tolerant) or text.
 *   2. Row selection — single-select per table via aria-selected; selecting one
 *      row clears the others. Enter/Space on a focused row activates it; clicks
 *      inside a header sort button never count as selection.
 *   3. A polite live region announces sort + selection changes to AT.
 *
 * Both sorting and selection support controlled and uncontrolled use. Reduced
 * motion is honoured implicitly by the CSS.
 */

/** aria-sort values the design-system CSS understands. */
export type TableSortDirection = "none" | "ascending" | "descending";

/** A single column definition. */
export interface TableColumn {
  /** Stable key identifying the column (used for cell lookup + sort state). */
  key: string;
  /** Visible header label. */
  header: ReactNode;
  /**
   * Whether this column is sortable. Sortable columns render a
   * <button class="hisd-table__sort"> and carry aria-sort on the <th>.
   */
  sortable?: boolean;
  /** Trailing-align + tabular figures via .hisd-table__cell--numeric. */
  numeric?: boolean;
  /**
   * Render this column's cell as the row-header (`<th scope="row">`). Exactly
   * one column should be the row header; defaults to the first column when no
   * column sets it.
   */
  rowHeader?: boolean;
}

/** A single data row. */
export interface TableRow {
  /** Stable unique id for the row (used as React key + selection identity). */
  id: string;
  /**
   * Per-column cell content, keyed by column `key`. A value may be a primitive
   * (used directly for display + sort) or a { value, display } pair when the
   * sort key differs from the rendered content (mirrors data-value in the HTML).
   */
  cells: Record<string, TableCell>;
  /** Marks this row selected on first render (uncontrolled selection). */
  defaultSelected?: boolean;
}

/** A cell is either a primitive or an explicit display/value split. */
export type TableCell =
  | string
  | number
  | null
  | undefined
  | {
      /** The sort key (mirrors `data-value`). Falls back to `display` text. */
      value?: string | number;
      /** What is rendered in the cell. */
      display: ReactNode;
    };

export interface TableSortState {
  /** The column key currently sorted, or null when unsorted. */
  columnKey: string | null;
  /** The active direction. */
  direction: TableSortDirection;
}

export interface TableProps
  extends Omit<
    TableHTMLAttributes<HTMLTableElement>,
    "children" | "onSelect"
  > {
  /** Column definitions, left to right. */
  columns: TableColumn[];
  /** Body rows. */
  rows: TableRow[];
  /**
   * Accessible/visible table title rendered in <caption> AND used as the scroll
   * region's aria-label.
   */
  caption: ReactNode;
  /** Optional footer cells, keyed by column `key`. Renders a <tfoot> row. */
  footer?: Record<string, ReactNode>;
  /** Compact density: applies .hisd-table--compact. */
  compact?: boolean;
  /**
   * Pin the header while the region scrolls vertically (the CSS default). Set
   * false to opt out via .hisd-table-region--no-sticky.
   */
  stickyHeader?: boolean;
  /**
   * Cap the region height to unlock the vertically sticky header
   * (.hisd-table-region--scroll-y). Pass a CSS length to override the default
   * via the --hisd-table-max-block-size custom property.
   */
  scrollY?: boolean | string;
  /** Enable row selection (single-select). Defaults to true. */
  selectable?: boolean;
  /** Controlled selected row id (null = none). Omit for uncontrolled. */
  selectedId?: string | null;
  /** Fires with the newly selected row id. */
  onSelectionChange?: (id: string) => void;
  /** Controlled sort state. Omit for uncontrolled. */
  sort?: TableSortState;
  /** Fires with the next sort state when a sortable header is activated. */
  onSortChange?: (next: TableSortState) => void;
  /** Initial (uncontrolled) sort state. */
  defaultSort?: TableSortState;
  /**
   * Override the region's aria-label. Defaults to the `caption` text when it is
   * a string; provide this when `caption` is a non-string node.
   */
  regionLabel?: string;
  /** Extra class names appended to the scroll region root. */
  className?: string;
}

/** Pull the sort key from a cell, comma-tolerant for numeric values. */
function cellSortKey(cell: TableCell): { num: number; text: string } {
  let raw: string;
  if (cell == null) {
    raw = "";
  } else if (typeof cell === "object") {
    raw =
      cell.value != null
        ? String(cell.value)
        : typeof cell.display === "string" || typeof cell.display === "number"
          ? String(cell.display)
          : "";
  } else {
    raw = String(cell);
  }
  const num = parseFloat(raw.replace(/,/g, ""));
  return { num, text: raw };
}

/** Render the displayed content of a cell. */
function cellDisplay(cell: TableCell): ReactNode {
  if (cell == null) {
    return null;
  }
  if (typeof cell === "object") {
    return cell.display;
  }
  return cell;
}

/** Plain-text version of a node for live-region announcements. */
function nodeText(node: ReactNode): string {
  if (node == null || node === false || node === true) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeText).join("");
  }
  return "";
}

export const Table = forwardRef(function Table(
  props: TableProps,
  ref: Ref<HTMLTableElement>,
) {
  const {
    columns,
    rows,
    caption,
    footer,
    compact = false,
    stickyHeader = true,
    scrollY = false,
    selectable = true,
    selectedId,
    onSelectionChange,
    sort,
    onSortChange,
    defaultSort,
    regionLabel,
    className,
    ...rest
  } = props;

  const reactId = useId();
  const liveId = `hisd-table-live-${reactId}`;
  const liveRef = useRef<HTMLDivElement>(null);

  // Resolve the row-header column: the one flagged, else the first column.
  const rowHeaderKey = useMemo(() => {
    const flagged = columns.find((col) => col.rowHeader);
    return flagged?.key ?? columns[0]?.key ?? "";
  }, [columns]);

  /* ----------------------------------------------------------------------
     Selection state — controlled vs uncontrolled.
     ---------------------------------------------------------------------- */
  const isSelectionControlled = selectedId !== undefined;
  const [internalSelected, setInternalSelected] = useState<string | null>(
    () => rows.find((row) => row.defaultSelected)?.id ?? null,
  );
  const currentSelected = isSelectionControlled ? selectedId : internalSelected;

  /* ----------------------------------------------------------------------
     Sort state — controlled vs uncontrolled.
     ---------------------------------------------------------------------- */
  const isSortControlled = sort !== undefined;
  const [internalSort, setInternalSort] = useState<TableSortState>(
    () => defaultSort ?? { columnKey: null, direction: "none" },
  );
  const currentSort = isSortControlled ? sort : internalSort;

  const announce = useCallback((message: string) => {
    if (liveRef.current) {
      liveRef.current.textContent = message;
    }
  }, []);

  /* ----------------------------------------------------------------------
     Derived: rows in display order (re-ordered when a column is sorted).
     ---------------------------------------------------------------------- */
  const orderedRows = useMemo(() => {
    if (!currentSort.columnKey || currentSort.direction === "none") {
      return rows;
    }
    const key = currentSort.columnKey;
    const dir = currentSort.direction;
    const sorted = [...rows].sort((a, b) => {
      const ka = cellSortKey(a.cells[key]);
      const kb = cellSortKey(b.cells[key]);
      const bothNumeric = !Number.isNaN(ka.num) && !Number.isNaN(kb.num);
      const result = bothNumeric
        ? ka.num - kb.num
        : ka.text.localeCompare(kb.text, undefined, { sensitivity: "base" });
      return dir === "descending" ? -result : result;
    });
    return sorted;
  }, [rows, currentSort]);

  /* ----------------------------------------------------------------------
     Sort activation — toggle this column; reset the others to "none".
     ---------------------------------------------------------------------- */
  const handleSort = useCallback(
    (column: TableColumn) => {
      const next: TableSortState = {
        columnKey: column.key,
        direction:
          currentSort.columnKey === column.key &&
          currentSort.direction === "ascending"
            ? "descending"
            : "ascending",
      };
      if (!isSortControlled) {
        setInternalSort(next);
      }
      onSortChange?.(next);
      announce(`${nodeText(column.header)} sorted ${next.direction}`);
    },
    [currentSort, isSortControlled, onSortChange, announce],
  );

  /* ----------------------------------------------------------------------
     Selection activation — single-select; selecting one clears the others.
     ---------------------------------------------------------------------- */
  const selectRow = useCallback(
    (row: TableRow) => {
      if (!selectable) {
        return;
      }
      if (!isSelectionControlled) {
        setInternalSelected(row.id);
      }
      onSelectionChange?.(row.id);
      announce(`${nodeText(cellDisplay(row.cells[rowHeaderKey]))} selected`);
    },
    [
      selectable,
      isSelectionControlled,
      onSelectionChange,
      announce,
      rowHeaderKey,
    ],
  );

  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>, row: TableRow) => {
      // Clicks inside a header sort button never reach a body row, but guard
      // against any nested interactive element so selection stays unambiguous.
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, select, textarea")) {
        return;
      }
      selectRow(row);
    },
    [selectRow],
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>, row: TableRow) => {
      // Only activate when the row itself is focused (not a child control).
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        selectRow(row);
      }
    },
    [selectRow],
  );

  /* ----------------------------------------------------------------------
     Region classes — sticky / scroll-y opt-in mirrors the CSS modifiers.
     ---------------------------------------------------------------------- */
  const regionClasses = ["hisd-table-region"];
  if (scrollY) {
    regionClasses.push("hisd-table-region--scroll-y");
  }
  if (!stickyHeader) {
    regionClasses.push("hisd-table-region--no-sticky");
  }
  if (className) {
    regionClasses.push(className);
  }

  const regionStyle =
    typeof scrollY === "string"
      ? ({ ["--hisd-table-max-block-size"]: scrollY } as CSSProperties)
      : undefined;

  const tableClasses = compact ? "hisd-table hisd-table--compact" : "hisd-table";

  const computedRegionLabel =
    regionLabel ?? (typeof caption === "string" ? caption : undefined);

  return (
    <>
      {/* Polite live region announces sort + selection changes to AT. */}
      <div
        id={liveId}
        ref={liveRef}
        role="status"
        aria-live="polite"
        style={visuallyHidden}
      />

      <div
        className={regionClasses.join(" ")}
        role="region"
        aria-label={computedRegionLabel}
        tabIndex={0}
        style={regionStyle}
      >
        <table {...rest} ref={ref} className={tableClasses}>
          <caption>{caption}</caption>

          <thead>
            <tr>
              {columns.map((column) => {
                const isActive = currentSort.columnKey === column.key;
                const ariaSort: TableSortDirection | undefined = column.sortable
                  ? isActive
                    ? currentSort.direction
                    : "none"
                  : undefined;
                const thClass = column.numeric
                  ? "hisd-table__cell--numeric"
                  : undefined;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={thClass}
                    aria-sort={ariaSort}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="hisd-table__sort"
                        onClick={() => handleSort(column)}
                      >
                        <span className="hisd-table__sort-label">
                          {column.header}
                        </span>
                        <span
                          className="hisd-table__sort-icon"
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {orderedRows.map((row) => {
              const isSelected = currentSelected === row.id;
              return (
                <tr
                  key={row.id}
                  tabIndex={selectable ? 0 : undefined}
                  aria-selected={selectable ? isSelected : undefined}
                  onClick={
                    selectable ? (e) => handleRowClick(e, row) : undefined
                  }
                  onKeyDown={
                    selectable ? (e) => handleRowKeyDown(e, row) : undefined
                  }
                >
                  {columns.map((column) => {
                    const content = cellDisplay(row.cells[column.key]);
                    const numericClass = column.numeric
                      ? "hisd-table__cell--numeric"
                      : undefined;
                    const dataValue =
                      typeof row.cells[column.key] === "object" &&
                      row.cells[column.key] != null
                        ? (row.cells[column.key] as { value?: string | number })
                            .value
                        : undefined;

                    if (column.key === rowHeaderKey) {
                      return (
                        <th
                          key={column.key}
                          scope="row"
                          className={numericClass}
                          data-value={
                            dataValue != null ? String(dataValue) : undefined
                          }
                        >
                          {content}
                        </th>
                      );
                    }
                    return (
                      <td
                        key={column.key}
                        className={numericClass}
                        data-value={
                          dataValue != null ? String(dataValue) : undefined
                        }
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {footer ? (
            <tfoot>
              <tr>
                {columns.map((column) => {
                  const content = footer[column.key];
                  const numericClass = column.numeric
                    ? "hisd-table__cell--numeric"
                    : undefined;
                  if (column.key === rowHeaderKey) {
                    return (
                      <th key={column.key} scope="row" className={numericClass}>
                        {content}
                      </th>
                    );
                  }
                  return (
                    <td key={column.key} className={numericClass}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  );
});

/** Inline visually-hidden style for the live region (mirrors the demo CSS). */
const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
