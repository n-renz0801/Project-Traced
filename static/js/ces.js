/* ─────────────────────────────────────────────────────────────────────────
     Shared section-page controller
     Wired to: #ces-search / #search-clear / #ces-tbody / #ces-table
     To reuse on another page, copy this block and update the IDs below.
  ───────────────────────────────────────────────────────────────────────── */

/* ══ 1. SEARCH ══════════════════════════════════════════════════════════ */
const searchInput = document.getElementById("ces-search");
const searchClear = document.getElementById("search-clear");
const noResults = document.getElementById("no-results");
const noResultsTerm = document.getElementById("no-results-term");
const recordCount = document.getElementById("record-count");
const footerCount = document.getElementById("footer-count");
const tableFooter = document.getElementById("table-footer");

function getVisibleRows() {
  return [
    ...document.querySelectorAll("#ces-tbody tr:not(.empty-placeholder)"),
  ];
}

function updateFooter() {
  const all = getVisibleRows();
  const total = all.length;
  const visible = all.filter((r) => !r.classList.contains("row-hidden")).length;
  const q = searchInput.value.trim();

  if (q) {
    footerCount.textContent = `Showing ${visible} of ${total} record${total !== 1 ? "s" : ""}`;
    tableFooter.style.display = "block";
  } else {
    tableFooter.style.display = "none";
  }
  recordCount.textContent = `${total} record${total !== 1 ? "s" : ""}`;
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  searchClear.style.display = q ? "flex" : "none";

  let anyVisible = false;
  getVisibleRows().forEach((row) => {
    const match = row.textContent.toLowerCase().includes(q);
    row.classList.toggle("row-hidden", !match);
    if (match) anyVisible = true;
  });

  if (q && !anyVisible) {
    noResultsTerm.textContent = `"${searchInput.value.trim()}"`;
    noResults.style.display = "flex";
  } else {
    noResults.style.display = "none";
  }
  updateFooter();
});

searchClear.addEventListener("click", resetSearch);

function resetSearch() {
  searchInput.value = "";
  searchClear.style.display = "none";
  noResults.style.display = "none";
  getVisibleRows().forEach((r) => r.classList.remove("row-hidden"));
  updateFooter();
  searchInput.focus();
}

/* ══ 2. SORT ════════════════════════════════════════════════════════════ */
let currentSortCol = null;
let currentSortDir = "asc";

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const col = parseInt(th.dataset.col);
    const type = th.dataset.type;

    if (currentSortCol === col) {
      currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
    } else {
      currentSortCol = col;
      currentSortDir = "asc";
    }

    document.querySelectorAll("th.sortable").forEach((h) => {
      h.classList.remove("sort-asc", "sort-desc", "sort-active");
      h.querySelector(".sort-indicator").textContent = "";
    });
    th.classList.add(
      "sort-active",
      currentSortDir === "asc" ? "sort-asc" : "sort-desc",
    );
    th.querySelector(".sort-indicator").textContent =
      currentSortDir === "asc" ? "↑" : "↓";

    sortTable(col, type, currentSortDir);
  });
});

function sortTable(col, type, dir) {
  const tbody = document.getElementById("ces-tbody");
  const rows = [...tbody.querySelectorAll("tr:not(.empty-placeholder)")];

  rows.sort((a, b) => {
    const cellA = a.querySelectorAll("td")[col];
    const cellB = b.querySelectorAll("td")[col];
    let valA = (cellA.dataset.sort ?? cellA.textContent).trim();
    let valB = (cellB.dataset.sort ?? cellB.textContent).trim();

    if (type === "number") {
      valA = parseFloat(valA) || -Infinity;
      valB = parseFloat(valB) || -Infinity;
      return dir === "asc" ? valA - valB : valB - valA;
    }
    valA = valA.toLowerCase();
    valB = valB.toLowerCase();
    if (valA < valB) return dir === "asc" ? -1 : 1;
    if (valA > valB) return dir === "asc" ? 1 : -1;
    return 0;
  });

  rows.forEach((r) => tbody.appendChild(r));
}

/* ══ 3. EXPORT ══════════════════════════════════════════════════════════ */
const exportTrigger = document.getElementById("export-trigger");
const exportDropdown = document.getElementById("export-dropdown");

exportTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  exportDropdown.classList.toggle("open");
  exportTrigger.classList.toggle("active");
});
document.addEventListener("click", () => {
  exportDropdown.classList.remove("open");
  exportTrigger.classList.remove("active");
});
exportDropdown.addEventListener("click", (e) => e.stopPropagation());

function getTableData() {
  const headers = [...document.querySelectorAll("#ces-table thead th")]
    .slice(0, -1)
    .map((th) => th.textContent.replace(/\s+/g, " ").trim());

  const rows = [
    ...document.querySelectorAll(
      "#ces-tbody tr:not(.empty-placeholder):not(.row-hidden)",
    ),
  ];
  return { headers, rows };
}

document.getElementById("export-csv").addEventListener("click", () => {
  const { headers, rows } = getTableData();
  const escape = (v) => `"${v.replace(/"/g, '""')}"`;
  const csvRows = [
    headers.map(escape).join(","),
    ...rows.map((row) =>
      [...row.querySelectorAll("td")]
        .slice(0, -1)
        .map((td) => escape(td.textContent.replace(/\s+/g, " ").trim()))
        .join(","),
    ),
  ];
  downloadFile(csvRows.join("\n"), "text/csv", "ces-records.csv");
  closeExport();
});

document.getElementById("export-print").addEventListener("click", () => {
  window.print();
  closeExport();
});

function closeExport() {
  exportDropdown.classList.remove("open");
  exportTrigger.classList.remove("active");
}

function downloadFile(content, mimeType, filename) {
  const a = document.createElement("a");
  a.href = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ══ 4. THREE-DOT OVERFLOW MENU ════════════════════════════════════════ */
function toggleMenu(btn) {
  const menu = btn.closest(".overflow-menu");
  const dropdown = menu.querySelector(".overflow-dropdown");
  const rect = btn.getBoundingClientRect();

  dropdown.style.top = rect.bottom + "px";
  dropdown.style.left = rect.right - 130 + "px";

  const isOpen = menu.classList.contains("open");
  document
    .querySelectorAll(".overflow-menu.open")
    .forEach((m) => m.classList.remove("open"));
  if (!isOpen) menu.classList.add("open");
}

document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".overflow-trigger") &&
    !e.target.closest(".overflow-dropdown")
  ) {
    document
      .querySelectorAll(".overflow-menu.open")
      .forEach((m) => m.classList.remove("open"));
  }
});

/* ══ Init ═══════════════════════════════════════════════════════════════ */
updateFooter();
