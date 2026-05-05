/* ══ 1. SEARCH ══════════════════════════════════════════════════════════ */
const searchInput = document.getElementById("eps-search");
const searchClear = document.getElementById("search-clear");
const noResults = document.getElementById("no-results");
const noResultsTerm = document.getElementById("no-results-term");
const recordCount = document.getElementById("record-count");
const footerCount = document.getElementById("footer-count");
const tableFooter = document.getElementById("table-footer");

function getVisibleRows() {
  return [
    ...document.querySelectorAll("#eps-tbody tr:not(.empty-placeholder)"),
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
  const tbody = document.getElementById("eps-tbody");
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
  const headers = [...document.querySelectorAll("#eps-table thead th")]
    .slice(0, -1)
    .map((th) => {
      const clone = th.cloneNode(true);
      clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
      return clone.textContent.replace(/\s+/g, " ").trim();
    });
  const rows = [
    ...document.querySelectorAll(
      "#eps-tbody tr:not(.empty-placeholder):not(.row-hidden)",
    ),
  ];
  return { headers, rows };
}

document.getElementById("export-csv").addEventListener("click", () => {
  const { headers, rows } = getTableData();
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csvRows = [
    headers.map(escape).join(","),
    ...rows.map((row) => {
      const cells = [...row.querySelectorAll("td")].slice(0, -1);
      return cells
        .map((td, i) => {
          let val = td.textContent.replace(/\s+/g, " ").trim();
          if (i === 3) {
            const raw = td.dataset.sort;
            val =
              raw && raw !== "00000000"
                ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
                : "";
          }
          if (i === 5) {
            const raw = td.dataset.sort;
            val =
              raw && raw !== "00000000"
                ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
                : "";
          }
          if (i === 6) {
            const raw = td.dataset.sort;
            val = raw && raw !== "-1" ? raw : "";
          }
          return escape(val);
        })
        .join(",");
    }),
  ];
  downloadFile(csvRows.join("\n"), "text/csv", "eps-records.csv");
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

/* ══ 5. IMPORT ══════════════════════════════════════════════════════════ */
const importTrigger = document.getElementById("import-trigger");
const importOverlay = document.getElementById("import-modal-overlay");
const importClose = document.getElementById("import-modal-close");
const importCancel = document.getElementById("import-btn-cancel");
const importSubmit = document.getElementById("import-btn-submit");
const importFileInput = document.getElementById("import-file-input");
const importDropzone = document.getElementById("import-dropzone");
const importDropText = document.getElementById("import-dropzone-text");
const importPreview = document.getElementById("import-preview");
const importPreviewLbl = document.getElementById("import-preview-label");
const importPreviewClr = document.getElementById("import-preview-clear");
const importPreviewThr = document.getElementById("import-preview-thead");
const importPreviewTbd = document.getElementById("import-preview-tbody");
const importError = document.getElementById("import-error");

const EXPECTED_HEADERS = [
  "code",
  "process",
  "name of school",
  "date received",
  "status",
  "date completed / forwarded",
  "processing time (days)",
  "remarks",
];

let parsedImportRows = [];

importTrigger.addEventListener("click", () => {
  importOverlay.style.display = "flex";
  document.body.style.overflow = "hidden";
});

function closeImportModal() {
  importOverlay.style.display = "none";
  document.body.style.overflow = "";
  resetImportState();
}

importClose.addEventListener("click", closeImportModal);
importCancel.addEventListener("click", closeImportModal);
importOverlay.addEventListener("click", (e) => {
  if (e.target === importOverlay) closeImportModal();
});

function resetImportState() {
  importFileInput.value = "";
  importPreview.style.display = "none";
  importDropzone.style.display = "flex";
  importDropText.textContent =
    "Click to choose a CSV file, or drag and drop here";
  importPreviewThr.innerHTML = "";
  importPreviewTbd.innerHTML = "";
  importError.style.display = "none";
  importError.textContent = "";
  importSubmit.disabled = true;
  parsedImportRows = [];
}

importPreviewClr.addEventListener("click", resetImportState);

importDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  importDropzone.classList.add("dragover");
});
importDropzone.addEventListener("dragleave", () => {
  importDropzone.classList.remove("dragover");
});
importDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  importDropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleImportFile(file);
});
importFileInput.addEventListener("change", () => {
  if (importFileInput.files[0]) handleImportFile(importFileInput.files[0]);
});

function parseCSV(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  return lines.map((line) => {
    const cells = [];
    let cur = "",
      inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  });
}

function handleImportFile(file) {
  importError.style.display = "none";
  importError.textContent = "";
  if (!file.name.endsWith(".csv")) {
    showImportError("Please upload a .csv file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const rows = parseCSV(e.target.result);
    if (rows.length < 2) {
      showImportError("The file appears to be empty or has no data rows.");
      return;
    }
    const headers = rows[0].map((h) =>
      h.toLowerCase().replace(/\s+/g, " ").trim(),
    );
    const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      showImportError(
        `Missing required column(s): ${missing.map((m) => `"${m}"`).join(", ")}. Please check the column headers in your CSV.`,
      );
      return;
    }
    const idx = {};
    EXPECTED_HEADERS.forEach((h) => {
      idx[h] = headers.indexOf(h);
    });
    parsedImportRows = rows
      .slice(1)
      .filter((r) => r.some((c) => c))
      .map((r) => ({
        code: r[idx["code"]] || "",
        process: r[idx["process"]] || "",
        school: r[idx["name of school"]] || "",
        date_received: r[idx["date received"]] || "",
        status: r[idx["status"]] || "",
        date_completed: r[idx["date completed / forwarded"]] || "",
        processing_days: r[idx["processing time (days)"]] || "",
        remarks: r[idx["remarks"]] || "",
      }));
    if (!parsedImportRows.length) {
      showImportError("No data rows found in the file.");
      return;
    }
    importDropzone.style.display = "none";
    importPreview.style.display = "block";
    importPreviewLbl.textContent = `${parsedImportRows.length} row${parsedImportRows.length !== 1 ? "s" : ""} ready to import from "${file.name}"`;
    importPreviewThr.innerHTML = `<tr>${["Code", "Process", "School", "Date Received", "Status", "Date Completed", "Processing Days", "Remarks"].map((h) => `<th>${h}</th>`).join("")}</tr>`;
    importPreviewTbd.innerHTML =
      parsedImportRows
        .slice(0, 10)
        .map(
          (r) =>
            `<tr><td>${r.code}</td><td>${r.process}</td><td>${r.school}</td><td>${r.date_received}</td><td>${r.status}</td><td>${r.date_completed}</td><td>${r.processing_days}</td><td>${r.remarks}</td></tr>`,
        )
        .join("") +
      (parsedImportRows.length > 10
        ? `<tr><td colspan="8" class="import-preview__more">… and ${parsedImportRows.length - 10} more row(s)</td></tr>`
        : "");
    importSubmit.disabled = false;
  };
  reader.readAsText(file);
}

function showImportError(msg) {
  importError.textContent = msg;
  importError.style.display = "block";
  importSubmit.disabled = true;
}

importSubmit.addEventListener("click", async () => {
  importSubmit.disabled = true;
  importSubmit.textContent = "Importing…";
  try {
    const res = await fetch("/eps/import", {
      // ← only difference from ces.js
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: parsedImportRows }),
    });
    const data = await res.json();
    if (data.success) {
      closeImportModal();
      location.reload();
    } else {
      showImportError(data.error || "Import failed. Please try again.");
      importSubmit.disabled = false;
      importSubmit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="15"/></svg> Import Records`;
    }
  } catch {
    showImportError(
      "Network error. Please check your connection and try again.",
    );
    importSubmit.disabled = false;
  }
});

/* ══ Init ═══════════════════════════════════════════════════════════════ */
updateFooter();
