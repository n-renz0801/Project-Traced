// ── home.js — Project TRACED Dashboard ───────────────────────────────────────

// Live date display
(function () {
  const el = document.getElementById("live-date");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
})();

// Animate stat numbers on load
(function () {
  const statValues = document.querySelectorAll(
    ".stat-value, .section-stat-value",
  );
  statValues.forEach((el) => {
    const raw = el.textContent.trim();
    const num = parseFloat(raw);
    if (isNaN(num) || raw === "—") return;

    const isDecimal = raw.includes(".");
    const duration = 600;
    const steps = 30;
    const increment = num / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = step >= steps ? num : current + increment;
      el.textContent = isDecimal ? current.toFixed(1) : Math.round(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
  });
})();

/* ── Home Export ─────────────────────────────────────────────────────────── */
const homeExportTrigger = document.getElementById("home-export-trigger");
const homeExportDropdown = document.getElementById("home-export-dropdown");

homeExportTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  homeExportDropdown.classList.toggle("open");
  homeExportTrigger.classList.toggle("active");
});

document.addEventListener("click", () => {
  homeExportDropdown.classList.remove("open");
  homeExportTrigger.classList.remove("active");
});

homeExportDropdown.addEventListener("click", (e) => e.stopPropagation());

document.getElementById("home-export-print").addEventListener("click", () => {
  homeExportDropdown.classList.remove("open");
  homeExportTrigger.classList.remove("active");
  window.print();
});

document
  .getElementById("home-export-csv")
  .addEventListener("click", async () => {
    homeExportDropdown.classList.remove("open");
    homeExportTrigger.classList.remove("active");

    try {
      const res = await fetch("/api/sections/export-all");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not export records. Please try again.");
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "traced-all-sections.csv";

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      alert("Could not export records. Please try again.");
    }
  });

/* ── Home Import (all sections) ──────────────────────────────────────────── */
const homeImportTrigger = document.getElementById("home-import-trigger");
const homeImportFileInput = document.getElementById("home-import-file-input");

if (homeImportTrigger && homeImportFileInput) {
  homeImportTrigger.addEventListener("click", () =>
    homeImportFileInput.click(),
  );

  homeImportFileInput.addEventListener("change", async () => {
    const file = homeImportFileInput.files[0];
    if (!file) return;

    homeImportTrigger.disabled = true;
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/sections/import-all", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        const skippedMsg = data.skipped
          ? `, skipped ${data.skipped} row${data.skipped !== 1 ? "s" : ""} (unrecognized section or missing required fields)`
          : "";
        alert(
          `Imported ${data.imported} record${data.imported !== 1 ? "s" : ""} across sections${skippedMsg}.`,
        );
        window.location.reload();
        return;
      }
      alert(data.error || "Import failed.");
    } catch (err) {
      alert("Import failed. Please try again.");
    } finally {
      homeImportTrigger.disabled = false;
      homeImportFileInput.value = "";
    }
  });
}
