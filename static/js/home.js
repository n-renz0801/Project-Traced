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
