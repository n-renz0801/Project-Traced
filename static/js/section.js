const PAGE = document.querySelector(".section-page");
const SECTION = PAGE.dataset.section;
const IMPORT_URL = PAGE.dataset.importUrl;
const BULK_DELETE_URL = PAGE.dataset.bulkDeleteUrl;
const EXPORT_FILENAME = `${SECTION}-records.csv`;

/* ══ 1. SEARCH ══════════════════════════════════════════════════════════ */
const searchInput = document.getElementById("section-search");
const searchClear = document.getElementById("search-clear");
const noResults = document.getElementById("no-results");
const noResultsTerm = document.getElementById("no-results-term");
const footerCount = document.getElementById("footer-count");
const tableFooter = document.getElementById("table-footer");

function getVisibleRows() {
  return [
    ...document.querySelectorAll("#section-tbody tr:not(.empty-placeholder)"),
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
}

// Safely escape values before inserting into innerHTML
function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, " · "); // flatten newlines for preview readability
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
  noResultsTerm.textContent = `"${searchInput.value.trim()}"`;
  noResults.style.display = q && !anyVisible ? "flex" : "none";
  updateFooter();
  // Keep toolbar in sync if selection changes due to hidden rows
  updateBulkToolbar();
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
  const tbody = document.getElementById("section-tbody");
  const rows = [...tbody.querySelectorAll("tr:not(.empty-placeholder)")];
  rows.sort((a, b) => {
    // +1 offset on col index when checkbox column is present
    const offset = document.getElementById("select-all-checkbox") ? 1 : 0;
    const cellA = a.querySelectorAll("td")[col + offset];
    const cellB = b.querySelectorAll("td")[col + offset];
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
  const allHeaders = [...document.querySelectorAll("#section-table thead th")];
  // Exclude checkbox col (first, if present) and actions col (last)
  const hasCheckbox = !!document.getElementById("select-all-checkbox");
  const sliceStart = hasCheckbox ? 1 : 0;
  const headers = allHeaders.slice(sliceStart, -1).map((th) => {
    const clone = th.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
    return clone.textContent.replace(/\s+/g, " ").trim();
  });
  const rows = [
    ...document.querySelectorAll(
      "#section-tbody tr:not(.empty-placeholder):not(.row-hidden)",
    ),
  ];
  return { headers, rows, hasCheckbox };
}

document.getElementById("export-csv").addEventListener("click", () => {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  if (SECTION === "hrd") {
    // ── HRD export: reads data-export-* attributes ──────────────────
    const headers = [
      "Code",
      "Process",
      "Name of School",
      "Title",
      "Implementation Date Start",
      "Implementation Date End",
      "Venue",
      "Participants M",
      "Participants F",
      "Participants T",
      "Evaluation Rating",
      "Topic/Matrix",
      "Date Received",
      "Status",
      "Date Completed / Forwarded",
      "Processing Time (Days)",
      "Remarks",
    ];

    const rows = [
      ...document.querySelectorAll(
        "#section-tbody tr:not(.empty-placeholder):not(.row-hidden)",
      ),
    ];

    const csvRows = [
      headers.map(escape).join(","),
      ...rows.map((row) => {
        const cells = [...row.querySelectorAll("td")];
        // Remove checkbox cell if present
        const hasCheckbox = !!document.getElementById("select-all-checkbox");
        const c = hasCheckbox ? cells.slice(1) : cells;
        // c indices (after removing checkbox + actions last col):
        // 0=code, 1=process, 2=school, 3=title,
        // 4=impl_date, 5=venue, 6=participants, 7=eval, 8=topic_matrix,
        // 9=date_received, 10=status, 11=date_completed, 12=days, 13=remarks
        const implDate = c[4];
        const partCell = c[6];
        const dateRec = c[9];
        const dateComp = c[11];
        const daysCell = c[12];

        const toDate = (cell) => {
          const s = cell?.dataset.sort;
          return s && s !== "00000000"
            ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
            : "";
        };

        return [
          c[0].textContent.trim(), // Code
          c[1].textContent.trim(), // Process
          c[2].textContent.trim(), // School
          c[3]?.dataset.export ?? "", // Title
          implDate?.dataset.exportStart ?? "", // Impl Date Start
          implDate?.dataset.exportEnd ?? "", // Impl Date End
          c[5]?.dataset.export ?? "", // Venue
          partCell?.dataset.exportM ?? "", // Participants M
          partCell?.dataset.exportF ?? "", // Participants F
          partCell?.dataset.exportT ?? "", // Participants T
          c[7]?.dataset.export ?? "", // Eval Rating
          c[8]?.dataset.export ?? "", // Topic/Matrix
          toDate(dateRec), // Date Received
          c[10].textContent.trim(), // Status
          toDate(dateComp), // Date Completed
          (() => {
            const s = daysCell?.dataset.sort;
            return s && s !== "-1" ? s : "";
          })(), // Days
          c[13]?.textContent.trim() ?? "", // Remarks
        ]
          .map(escape)
          .join(",");
      }),
    ];

    downloadFile(csvRows.join("\n"), "text/csv", EXPORT_FILENAME);
  } else {
    // ── Standard export (unchanged) ─────────────────────────────────
    const { headers, rows, hasCheckbox } = getTableData();
    const escape2 = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const colOffset = hasCheckbox ? 1 : 0;
    const csvRows = [
      headers.map(escape2).join(","),
      ...rows.map((row) => {
        const cells = [...row.querySelectorAll("td")].slice(colOffset, -1);
        return cells
          .map((td, i) => {
            let val = td.textContent.replace(/\s+/g, " ").trim();
            if (i === 3 || i === 5) {
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
            return escape2(val);
          })
          .join(",");
      }),
    ];
    downloadFile(csvRows.join("\n"), "text/csv", EXPORT_FILENAME);
  }

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

// Section-aware expected import headers
const EXPECTED_HEADERS =
  SECTION === "hrd"
    ? [
        "code",
        "process",
        "name of school",
        "title",
        "implementation date start",
        "implementation date end",
        "venue",
        "participants m",
        "participants f",
        "date received",
        "status",
        "date completed / forwarded",
        "processing time (days)",
        "evaluation rating",
        "topic/matrix",
        "remarks",
      ]
    : [
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
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    const next = t[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // Escaped double-quote inside a quoted field → literal "
        field += '"';
        i++;
      } else if (ch === '"') {
        // Closing quote
        inQuotes = false;
      } else {
        // Everything else inside quotes, including newlines, is part of the field
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true; // Opening quote
      } else if (ch === ",") {
        row.push(field.trim()); // End of field
        field = "";
      } else if (ch === "\n") {
        row.push(field.trim()); // End of row
        field = "";
        if (row.some((c) => c !== "")) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // Flush the last field / row
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c !== "")) rows.push(row);
  }

  return rows;
}

function handleImportFile(file) {
  importError.style.display = "none";
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
        `Missing required column(s): ${missing.map((m) => `"${m}"`).join(", ")}.`,
      );
      return;
    }
    const idx = {};
    EXPECTED_HEADERS.forEach((h) => {
      idx[h] = headers.indexOf(h);
    });
    // Build parsedImportRows — branch for HRD
    if (SECTION === "hrd") {
      parsedImportRows = rows
        .slice(1)
        .filter((r) => r.some((c) => c))
        .map((r) => ({
          process: r[idx["process"]] || "",
          school: r[idx["name of school"]] || "",
          title: r[idx["title"]] || "",
          impl_date_start: r[idx["implementation date start"]] || "",
          impl_date_end: r[idx["implementation date end"]] || "",
          venue: r[idx["venue"]] || "",
          participants_m: r[idx["participants m"]] || "",
          participants_f: r[idx["participants f"]] || "",
          date_received: r[idx["date received"]] || "",
          status: r[idx["status"]] || "",
          date_completed: r[idx["date completed / forwarded"]] || "",
          processing_days: r[idx["processing time (days)"]] || "",
          eval_rating: r[idx["evaluation rating"]] || "",
          topic_matrix: r[idx["topic/matrix"]] || "",
          remarks: r[idx["remarks"]] || "",
        }));
    } else {
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
    }
    if (!parsedImportRows.length) {
      showImportError("No data rows found in the file.");
      return;
    }
    importDropzone.style.display = "none";
    importPreview.style.display = "block";
    importPreviewLbl.textContent = `${parsedImportRows.length} row${parsedImportRows.length !== 1 ? "s" : ""} ready to import from "${file.name}"`;

    const previewHeaders =
      SECTION === "hrd"
        ? [
            "Process",
            "School",
            "Title",
            "Impl Start",
            "Impl End",
            "Venue",
            "M",
            "F",
            "Date Received",
            "Status",
            "Date Completed",
            "Days",
            "Eval",
            "Topic/Matrix",
            "Remarks",
          ]
        : [
            "Code",
            "Process",
            "School",
            "Date Received",
            "Status",
            "Date Completed",
            "Processing Days",
            "Remarks",
          ];

    importPreviewThr.innerHTML = `<tr>${previewHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;

    importPreviewTbd.innerHTML =
      parsedImportRows
        .slice(0, 10)
        .map((r) => {
          const cells =
            SECTION === "hrd"
              ? [
                  r.process,
                  r.school,
                  r.title,
                  r.impl_date_start,
                  r.impl_date_end,
                  r.venue,
                  r.participants_m,
                  r.participants_f,
                  r.date_received,
                  r.status,
                  r.date_completed,
                  r.processing_days,
                  r.eval_rating,
                  r.topic_matrix,
                  r.remarks,
                ]
              : [
                  r.code,
                  r.process,
                  r.school,
                  r.date_received,
                  r.status,
                  r.date_completed,
                  r.processing_days,
                  r.remarks,
                ];
          return `<tr>${cells.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`;
        })
        .join("") +
      (parsedImportRows.length > 10
        ? `<tr><td colspan="${SECTION === "hrd" ? 15 : 8}" class="import-preview__more">… and ${parsedImportRows.length - 10} more row(s)</td></tr>`
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
    const res = await fetch(IMPORT_URL, {
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

/* ══ 6. MULTI-SELECT & BULK DELETE (superadmin only) ════════════════════ */
const selectAllCb = document.getElementById("select-all-checkbox");
const bulkToolbar = document.getElementById("bulk-toolbar");
const bulkCount = document.getElementById("bulk-count");
const bulkDeselect = document.getElementById("bulk-deselect");
const bulkDeleteSelected = document.getElementById("bulk-delete-selected");
const bulkDeleteAll = document.getElementById("bulk-delete-all");
const bulkConfirmOverlay = document.getElementById("bulk-confirm-overlay");
const bulkConfirmTitle = document.getElementById("bulk-confirm-title");
const bulkConfirmBody = document.getElementById("bulk-confirm-body");
const bulkConfirmCancel = document.getElementById("bulk-confirm-cancel");
const bulkConfirmProceed = document.getElementById("bulk-confirm-proceed");

// Only wire up if superadmin elements exist
if (selectAllCb && bulkToolbar) {
  function getRowCheckboxes() {
    return [...document.querySelectorAll(".row-checkbox")];
  }

  function getCheckedIds() {
    return getRowCheckboxes()
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.id);
  }

  function getAllVisibleIds() {
    return getRowCheckboxes()
      .filter((cb) => !cb.closest("tr").classList.contains("row-hidden"))
      .map((cb) => cb.dataset.id);
  }

  function getAllIds() {
    return getRowCheckboxes().map((cb) => cb.dataset.id);
  }

  function updateBulkToolbar() {
    const checked = getCheckedIds();
    const count = checked.length;
    const total = getRowCheckboxes().filter(
      (cb) => !cb.closest("tr").classList.contains("row-hidden"),
    ).length;

    // Update select-all indeterminate state
    if (count === 0) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    } else if (count === total && total > 0) {
      selectAllCb.checked = true;
      selectAllCb.indeterminate = false;
    } else {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = true;
    }

    // Show/hide toolbar
    bulkToolbar.classList.toggle("bulk-toolbar--visible", count > 0);

    // Update count label
    bulkCount.textContent =
      count === 1 ? "1 record selected" : `${count} records selected`;

    // Enable/disable delete selected button
    if (bulkDeleteSelected) {
      bulkDeleteSelected.disabled = count === 0;
    }

    // Highlight selected rows
    getRowCheckboxes().forEach((cb) => {
      cb.closest("tr").classList.toggle("row-selected", cb.checked);
    });
  }

  // Select all / deselect all via header checkbox
  selectAllCb.addEventListener("change", () => {
    const visibleCbs = getRowCheckboxes().filter(
      (cb) => !cb.closest("tr").classList.contains("row-hidden"),
    );
    visibleCbs.forEach((cb) => (cb.checked = selectAllCb.checked));
    updateBulkToolbar();
  });

  // Individual row checkboxes
  document.getElementById("section-tbody").addEventListener("change", (e) => {
    if (e.target.classList.contains("row-checkbox")) {
      updateBulkToolbar();
    }
  });

  // Deselect all button in toolbar
  bulkDeselect.addEventListener("click", () => {
    getRowCheckboxes().forEach((cb) => (cb.checked = false));
    updateBulkToolbar();
  });

  // ── Confirm modal logic ──────────────────────────────────────────────
  let pendingDeleteIds = []; // ids to delete, or null means "all"
  let deleteAll = false;

  function openConfirmModal(ids, all) {
    pendingDeleteIds = ids;
    deleteAll = all;
    if (all) {
      const total = getAllIds().length;
      bulkConfirmTitle.textContent = "Delete All Records?";
      bulkConfirmBody.textContent = `This will permanently delete all ${total} record${total !== 1 ? "s" : ""} in this section. This action cannot be undone.`;
    } else {
      const n = ids.length;
      bulkConfirmTitle.textContent = `Delete ${n} Record${n !== 1 ? "s" : ""}?`;
      bulkConfirmBody.textContent = `You are about to permanently delete ${n} selected record${n !== 1 ? "s" : ""}. This action cannot be undone.`;
    }
    bulkConfirmOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeConfirmModal() {
    bulkConfirmOverlay.style.display = "none";
    document.body.style.overflow = "";
    pendingDeleteIds = [];
    deleteAll = false;
  }

  bulkConfirmCancel.addEventListener("click", closeConfirmModal);
  bulkConfirmOverlay.addEventListener("click", (e) => {
    if (e.target === bulkConfirmOverlay) closeConfirmModal();
  });

  // Delete Selected
  bulkDeleteSelected.addEventListener("click", () => {
    const ids = getCheckedIds();
    if (!ids.length) return;
    openConfirmModal(ids, false);
  });

  // Delete All
  bulkDeleteAll.addEventListener("click", () => {
    const ids = getAllIds();
    if (!ids.length) return;
    openConfirmModal(ids, true);
  });

  // Confirm proceed
  bulkConfirmProceed.addEventListener("click", async () => {
    const ids = deleteAll ? getAllIds() : pendingDeleteIds;
    bulkConfirmProceed.disabled = true;
    bulkConfirmProceed.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
      Deleting…`;

    try {
      const res = await fetch(BULK_DELETE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.success) {
        closeConfirmModal();
        location.reload();
      } else {
        alert(data.error || "Delete failed. Please try again.");
        bulkConfirmProceed.disabled = false;
        bulkConfirmProceed.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          Yes, Delete`;
      }
    } catch {
      alert("Network error. Please check your connection and try again.");
      bulkConfirmProceed.disabled = false;
    }
  });

  // Initial state
  updateBulkToolbar();
}

// Expose for search integration
function updateBulkToolbar() {
  if (!selectAllCb) return;
  const checked = document.querySelectorAll(".row-checkbox:checked").length;
  const total = [...document.querySelectorAll(".row-checkbox")].filter(
    (cb) => !cb.closest("tr").classList.contains("row-hidden"),
  ).length;

  if (checked === 0) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  } else if (checked === total && total > 0) {
    selectAllCb.checked = true;
    selectAllCb.indeterminate = false;
  } else {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = true;
  }

  if (bulkToolbar) {
    bulkToolbar.classList.toggle("bulk-toolbar--visible", checked > 0);
    if (bulkCount) {
      bulkCount.textContent =
        checked === 1 ? "1 record selected" : `${checked} records selected`;
    }
    if (bulkDeleteSelected) {
      bulkDeleteSelected.disabled = checked === 0;
    }
  }
  document.querySelectorAll(".row-checkbox").forEach((cb) => {
    cb.closest("tr").classList.toggle("row-selected", cb.checked);
  });
}

/* ══ Init ═══════════════════════════════════════════════════════════════ */
updateFooter();
