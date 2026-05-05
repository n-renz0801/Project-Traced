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

document.getElementById("home-export-csv").addEventListener("click", () => {
  homeExportDropdown.classList.remove("open");
  homeExportTrigger.classList.remove("active");

  const rows = [["Section", "Full Name", "Records", "Avg. Processing Days"]];
  document.querySelectorAll(".section-card").forEach((card) => {
    const label =
      card.querySelector(".section-label")?.textContent.trim() ?? "";
    const full = card.querySelector(".section-full")?.textContent.trim() ?? "";
    const stats = card.querySelectorAll(".section-stat-value");
    const records = stats[0]?.textContent.trim() ?? "";
    const avgDays = stats[1]?.textContent.trim() ?? "";
    rows.push([label, full, records, avgDays]);
  });

  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");

  const a = document.createElement("a");
  a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  a.download = "traced-sections-summary.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
});
