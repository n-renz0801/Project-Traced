/**
 * feedback_log.js
 * Handles: search, star filter, column sort, single delete, bulk delete,
 *          select-all, live header stats update after deletions.
 */
(function () {
  "use strict";

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const tbody = document.getElementById("log-tbody");
  const searchInput = document.getElementById("log-search");
  const filterGroup = document.getElementById("star-filter-group");
  const selectAllChk = document.getElementById("select-all");
  const deleteSelBtn = document.getElementById("delete-selected-btn");
  const noResults = document.getElementById("log-no-results");
  const logShowing = document.getElementById("log-showing");
  const modal = document.getElementById("confirm-modal");
  const modalBody = document.getElementById("modal-body");
  const modalConfirmBtn = document.getElementById("modal-confirm");
  const modalCancelBtn = document.getElementById("modal-cancel");

  // Pill stats (header)
  const pillAvg = document.getElementById("pill-avg");
  const pillTotal = document.getElementById("pill-total");

  // Summary bar
  const summaryFills = document.querySelectorAll(".summary-fill");
  const summaryCounts = document.querySelectorAll("[data-star-count]");
  const summaryPcts = document.querySelectorAll("[data-star-pct]");

  // ── State ─────────────────────────────────────────────────────────────────
  let activeFilter = "all";
  let sortCol = "id";
  let sortDir = "desc"; // newest first by default
  let pendingDelete = null; // { ids: [...], rows: [...] }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function allRows() {
    return Array.from(tbody.querySelectorAll(".log-row"));
  }

  function visibleRows() {
    return allRows().filter((r) => !r.hidden);
  }

  function checkedRows() {
    return allRows().filter((r) => r.querySelector(".row-check")?.checked);
  }

  function rowData(row) {
    return {
      id: parseInt(row.dataset.id, 10),
      rating: parseInt(row.dataset.rating, 10),
      date: row.dataset.date,
      text: row.textContent.toLowerCase(),
    };
  }

  // ── Filter + Search + Sort pipeline ──────────────────────────────────────

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();

    allRows().forEach((row) => {
      const d = rowData(row);
      const matchFilter =
        activeFilter === "all" || d.rating === parseInt(activeFilter, 10);
      const matchSearch = !q || d.text.includes(q);
      row.hidden = !(matchFilter && matchSearch);
    });

    updateShowing();
    updateSelectAll();
    noResults.hidden = visibleRows().length > 0;
  }

  function applySorting() {
    const rows = allRows();
    rows.sort((a, b) => {
      const da = rowData(a);
      const db = rowData(b);
      let cmp = 0;
      if (sortCol === "id") cmp = da.id - db.id;
      if (sortCol === "rating") cmp = da.rating - db.rating;
      if (sortCol === "date") cmp = da.date.localeCompare(db.date);
      return sortDir === "asc" ? cmp : -cmp;
    });
    rows.forEach((r) => tbody.appendChild(r));
    applyFilters();
  }

  function updateShowing() {
    const vis = visibleRows().length;
    const tot = allRows().length;
    logShowing.textContent =
      vis === tot
        ? `Showing all ${tot} entr${tot !== 1 ? "ies" : "y"}`
        : `Showing ${vis} of ${tot}`;
  }

  // ── Select-all / row checks ───────────────────────────────────────────────

  function updateSelectAll() {
    const vis = visibleRows();
    const checked = vis.filter((r) => r.querySelector(".row-check")?.checked);
    selectAllChk.checked = vis.length > 0 && checked.length === vis.length;
    selectAllChk.indeterminate =
      checked.length > 0 && checked.length < vis.length;
    deleteSelBtn.disabled = checked.length === 0;
  }

  selectAllChk.addEventListener("change", () => {
    visibleRows().forEach((r) => {
      const chk = r.querySelector(".row-check");
      if (chk) chk.checked = selectAllChk.checked;
      r.classList.toggle("row-selected", selectAllChk.checked);
    });
    updateSelectAll();
  });

  tbody.addEventListener("change", (e) => {
    if (!e.target.classList.contains("row-check")) return;
    const row = e.target.closest(".log-row");
    if (row) row.classList.toggle("row-selected", e.target.checked);
    updateSelectAll();
  });

  // ── Sort headers ──────────────────────────────────────────────────────────

  document.querySelectorAll(".sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortCol = col;
        sortDir = "asc";
      }
      // Update header classes
      document.querySelectorAll(".sortable").forEach((h) => {
        h.classList.remove("sort-asc", "sort-desc");
      });
      th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
      applySorting();
    });
  });

  // ── Star filter ───────────────────────────────────────────────────────────

  filterGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    filterGroup
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("filter-btn--active"));
    btn.classList.add("filter-btn--active");
    activeFilter = btn.dataset.filter;
    applyFilters();
  });

  // ── Search ────────────────────────────────────────────────────────────────

  searchInput.addEventListener("input", applyFilters);

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openModal(ids, rows) {
    pendingDelete = { ids, rows };
    const plural = ids.length > 1;
    modalBody.textContent = plural
      ? `You are about to delete ${ids.length} entries. This cannot be undone.`
      : `You are about to delete entry #${ids[0]}. This cannot be undone.`;
    modal.hidden = false;
    modalConfirmBtn.focus();
  }

  function closeModal() {
    modal.hidden = true;
    pendingDelete = null;
  }

  modalCancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // ── Delete API calls ──────────────────────────────────────────────────────

  async function deleteIds(ids) {
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/feedback/${id}`, { method: "DELETE" })
          .then((r) => ({ id, ok: r.ok }))
          .catch(() => ({ id, ok: false })),
      ),
    );
    return results.filter((r) => r.ok).map((r) => r.id);
  }

  async function performDelete() {
    if (!pendingDelete) return;
    const { ids, rows } = pendingDelete;
    closeModal();

    modalConfirmBtn.disabled = true;

    // Animate rows out
    rows.forEach((r) => r.classList.add("row-deleting"));
    await new Promise((res) => setTimeout(res, 320));

    const deleted = await deleteIds(ids);

    // Remove deleted rows from DOM
    rows.forEach((r) => {
      if (deleted.includes(parseInt(r.dataset.id, 10))) r.remove();
    });

    modalConfirmBtn.disabled = false;
    applyFilters();
    refreshHeaderStats();
  }

  modalConfirmBtn.addEventListener("click", performDelete);

  // ── Single delete ─────────────────────────────────────────────────────────

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".delete-btn");
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const row = btn.closest(".log-row");
    openModal([id], [row]);
  });

  // ── Bulk delete ───────────────────────────────────────────────────────────

  deleteSelBtn.addEventListener("click", () => {
    const checked = checkedRows();
    if (checked.length === 0) return;
    const ids = checked.map((r) => parseInt(r.dataset.id, 10));
    openModal(ids, checked);
  });

  // ── Live stats refresh (after deletions) ──────────────────────────────────

  async function refreshHeaderStats() {
    try {
      const res = await fetch("/api/feedback/stats");
      const data = await res.json();

      // Pills
      if (pillAvg)
        pillAvg.textContent = data.avg_rating
          ? data.avg_rating.toFixed(1)
          : "—";
      if (pillTotal) pillTotal.textContent = data.total_responses;

      // Summary bars
      const total = data.total_responses;
      summaryFills.forEach((fill) => {
        const star = parseInt(fill.dataset.star, 10);
        const cnt = data.distribution[star] || 0;
        const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
        fill.style.width = `${pct}%`;
      });
      summaryCounts.forEach((el) => {
        const star = parseInt(el.dataset.starCount, 10);
        el.textContent = data.distribution[star] || 0;
      });
      summaryPcts.forEach((el) => {
        const star = parseInt(el.dataset.starPct, 10);
        const cnt = data.distribution[star] || 0;
        const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
        el.textContent = `${pct}%`;
      });
    } catch (err) {
      console.warn("Could not refresh stats:", err);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  // Default sort: newest first
  (() => {
    const dateTh = document.querySelector('.sortable[data-col="date"]');
    if (dateTh) dateTh.classList.add("sort-desc");
  })();

  applySorting();
  updateShowing();
})();
