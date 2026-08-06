// Renders a Power BI data view as a structured <table>. Always called, so
// the visual remains usable when the SVG/canvas recipe fails or is disabled
// (high-contrast environments, reduced-motion preference, or a render throw).

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { strings } from "./i18n";

export function renderTableFallback(host: HTMLElement, dataViews: DataView[] | undefined) {
  host.replaceChildren();
  const dv = dataViews?.[0];
  const cats = dv?.categorical?.categories;
  const vals = dv?.categorical?.values;

  if (!cats?.length || !vals?.length) {
    const empty = document.createElement("p");
    empty.className = "hisd-visual__state";
    empty.textContent = strings("noData");
    host.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "hisd-visual__data-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const cat0 = cats[0];
  const catHead = document.createElement("th");
  catHead.scope = "col";
  catHead.textContent = String(cat0.source.displayName ?? strings("series"));
  headRow.appendChild(catHead);
  for (const v of vals) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = String(v.source.displayName ?? strings("value"));
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const n = cat0.values.length;
  for (let i = 0; i < n; i++) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = String(cat0.values[i]);
    tr.appendChild(th);
    for (const v of vals) {
      const td = document.createElement("td");
      td.textContent = v.values[i] == null ? "" : String(v.values[i]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  host.appendChild(table);
}
