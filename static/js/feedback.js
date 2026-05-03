/**
 * feedback.js
 * Handles the star-rating widget on the home dashboard.
 * Submits to POST /api/feedback and updates the live stats.
 */
(function () {
  "use strict";

  const STAR_LABELS = {
    1: "Very Poor — no communication about status at all",
    2: "Poor — minimal and delayed status updates",
    3: "Fair — some updates provided but inconsistent",
    4: "Good — timely updates provided most of the time",
    5: "Excellent — proactive, timely, and clear status updates always provided",
  };

  const widget = document.getElementById("star-rating-widget");
  const labelRow = document.getElementById("star-label");
  const labelText = labelRow?.querySelector(".star-label-text");
  const submitBtn = document.getElementById("feedback-submit-btn");
  const formArea = document.getElementById("feedback-form-area");
  const thankyou = document.getElementById("feedback-thankyou");

  // Live score elements (banner right side)
  const fbScoreNumber = document.getElementById("fb-score-number");
  const fbScoreResponses = document.getElementById("fb-score-responses");

  // Satisfaction stat card elements
  const satAvgValue = document.getElementById("sat-avg-value");
  const satCount = document.getElementById("sat-count");
  const satMiniStars = document.getElementById("sat-mini-stars");

  if (!widget) return;

  const stars = Array.from(widget.querySelectorAll(".star-btn"));
  let selectedValue = 0;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function highlightUpTo(n) {
    stars.forEach((btn) => {
      const v = parseInt(btn.dataset.value, 10);
      btn.classList.toggle("hovered", v <= n);
    });
  }

  function applySelection(n) {
    stars.forEach((btn) => {
      const v = parseInt(btn.dataset.value, 10);
      btn.classList.toggle("selected", v <= n);
      btn.classList.remove("hovered");
    });
  }

  function setLabel(text, active) {
    if (!labelText) return;
    labelText.textContent = text;
    labelRow.classList.toggle("has-selection", !!active);
  }

  function updateStatCard(stats) {
    if (!stats) return;
    const avg = stats.avg_rating;
    const total = stats.total_responses;

    // Banner score
    if (fbScoreNumber) fbScoreNumber.textContent = avg ? avg.toFixed(1) : "—";
    if (fbScoreResponses) {
      fbScoreResponses.textContent = `${total} response${total !== 1 ? "s" : ""}`;
    }

    // Satisfaction stat card
    if (satAvgValue) satAvgValue.textContent = avg ? avg.toFixed(1) : "—";
    if (satCount) {
      satCount.textContent = `${total} response${total !== 1 ? "s" : ""}`;
    }

    // Mini stars
    if (satMiniStars) {
      const rounded = Math.round(avg || 0);
      satMiniStars.querySelectorAll(".mini-star").forEach((star, i) => {
        star.classList.toggle("mini-star--filled", i < rounded);
      });
    }

    // Distribution bars
    if (stats.distribution) {
      const dist = stats.distribution;
      const distRows = document.querySelectorAll("#sat-dist .dist-row");
      distRows.forEach((row) => {
        const star = parseInt(row.querySelector(".dist-label").textContent, 10);
        const cnt = dist[star] || 0;
        const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
        const fill = row.querySelector(".dist-fill");
        const countEl = row.querySelector(".dist-count");
        if (fill) fill.style.width = `${pct}%`;
        if (countEl) countEl.textContent = cnt;
      });
    }
  }

  // ── Event listeners ──────────────────────────────────────────────────────

  stars.forEach((btn) => {
    const v = parseInt(btn.dataset.value, 10);

    btn.addEventListener("mouseenter", () => {
      if (selectedValue === 0) highlightUpTo(v);
      setLabel(STAR_LABELS[v], true);
    });

    btn.addEventListener("mouseleave", () => {
      if (selectedValue === 0) highlightUpTo(0);
      setLabel(
        selectedValue ? STAR_LABELS[selectedValue] : "Tap a star to rate",
        !!selectedValue,
      );
    });

    btn.addEventListener("click", () => {
      selectedValue = v;
      applySelection(v);
      setLabel(STAR_LABELS[v], true);
      if (submitBtn) submitBtn.disabled = false;
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 200);
    });

    // Keyboard: Enter / Space
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // ── Submit ───────────────────────────────────────────────────────────────

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      if (!selectedValue || submitBtn.disabled) return;

      submitBtn.disabled = true;
      submitBtn.classList.add("loading");
      submitBtn.textContent = "Submitting…";

      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: selectedValue }),
        });

        if (!res.ok) throw new Error("Server error");

        const data = await res.json();

        // Show thank-you, hide form
        if (formArea) formArea.hidden = true;
        if (thankyou) thankyou.hidden = false;

        // Update live stats without a page reload
        updateStatCard(data.stats);

        // After 4 seconds, restore the form for another rating
        setTimeout(() => {
          if (formArea) formArea.hidden = false;
          if (thankyou) thankyou.hidden = true;

          selectedValue = 0;
          applySelection(0);
          setLabel("Tap a star to rate", false);
          submitBtn.disabled = true;
          submitBtn.textContent = "Submit Rating";
          submitBtn.classList.remove("loading");
        }, 4000);
      } catch (err) {
        console.error("Feedback submission failed:", err);
        submitBtn.disabled = false;
        submitBtn.classList.remove("loading");
        submitBtn.textContent = "Submit Rating";
        alert("Something went wrong. Please try again.");
      }
    });
  }
})();
