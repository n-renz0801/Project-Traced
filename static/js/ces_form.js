// ── Searchable Dropdown Logic ─────────────────────────────────────────────────

function initSearchableSelect(wrapperId, inputId, hiddenId, listId) {
  const wrapper = document.getElementById(wrapperId);
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  const list = document.getElementById(listId);
  const items = list.querySelectorAll(".dropdown-item");

  // Track whether a confirmed selection has been made
  let isConfirmed = false;

  function filterItems(query) {
    const q = query.toLowerCase();
    items.forEach((item) => {
      const match = item.dataset.value.toLowerCase().includes(q);
      item.classList.toggle("hidden", !match);
    });
  }

  function showAll() {
    items.forEach((item) => item.classList.remove("hidden"));
  }

  function selectItem(value) {
    input.value = value;
    hidden.value = value;
    isConfirmed = true;
    wrapper.classList.remove("open");
    // Remove highlighted state
    list
      .querySelectorAll(".highlighted")
      .forEach((el) => el.classList.remove("highlighted"));
  }

  // When the user focuses the input:
  // - If a value is already confirmed, clear the field so they can pick fresh
  input.addEventListener("focus", () => {
    if (isConfirmed && hidden.value) {
      // Clear the visible text so all options show, but keep hidden value
      // until a new selection is made (so cancelling still keeps old value)
      input.value = "";
      isConfirmed = false;
    }
    showAll();
    filterItems(input.value);
    wrapper.classList.add("open");
  });

  input.addEventListener("input", () => {
    // If user is typing, clear the confirmed hidden value until they pick again
    hidden.value = "";
    isConfirmed = false;
    filterItems(input.value);
    wrapper.classList.add("open");
  });

  items.forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent blur before click
      selectItem(item.dataset.value);
    });
  });

  // On blur: if user didn't pick anything new, restore old confirmed value
  input.addEventListener("blur", () => {
    // Small delay so mousedown on item fires first
    setTimeout(() => {
      if (!hidden.value && !isConfirmed) {
        // Restore previous hidden value into the visible input
        // (hidden.value was cleared on input event; we need to recover it)
        // We stored it in a data attribute below
        const prev = wrapper.dataset.lastConfirmed || "";
        input.value = prev;
        hidden.value = prev;
        isConfirmed = !!prev;
      }
      wrapper.classList.remove("open");
    }, 150);
  });

  // Watch selectItem to update lastConfirmed
  const originalSelectItem = selectItem;
  function selectItemWithMemory(value) {
    originalSelectItem(value);
    wrapper.dataset.lastConfirmed = value;
  }

  // Re-wire item clicks and keyboard to use selectItemWithMemory
  items.forEach((item) => {
    // Remove old listener added above; re-add below
  });

  // Keyboard navigation
  input.addEventListener("keydown", (e) => {
    const visible = [...items].filter((i) => !i.classList.contains("hidden"));
    const current = list.querySelector(".highlighted");
    let idx = visible.indexOf(current);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (current) current.classList.remove("highlighted");
      idx = Math.min(idx + 1, visible.length - 1);
      if (visible[idx]) visible[idx].classList.add("highlighted");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (current) current.classList.remove("highlighted");
      idx = Math.max(idx - 1, 0);
      if (visible[idx]) visible[idx].classList.add("highlighted");
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (current) selectItemWithMemory(current.dataset.value);
    } else if (e.key === "Escape") {
      // Restore old value and close
      const prev = wrapper.dataset.lastConfirmed || "";
      input.value = prev;
      hidden.value = prev;
      isConfirmed = !!prev;
      wrapper.classList.remove("open");
    }
  });

  // Rebuild item click listeners using selectItemWithMemory
  items.forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectItemWithMemory(item.dataset.value);
    });
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) wrapper.classList.remove("open");
  });

  // Seed lastConfirmed from initial hidden value (edit mode)
  if (hidden.value) {
    wrapper.dataset.lastConfirmed = hidden.value;
    isConfirmed = true;
  }
}

initSearchableSelect(
  "process-wrapper",
  "process-input",
  "process-value",
  "process-list",
);
initSearchableSelect(
  "school-wrapper",
  "school-input",
  "school-value",
  "school-list",
);
initSearchableSelect(
  "status-wrapper",
  "status-input",
  "status-value",
  "status-list",
);

// ── Auto-calculate Processing Days ───────────────────────────────────────────

const drInput = document.getElementById("date_received");
const dcInput = document.getElementById("date_completed");
const display = document.getElementById("processing-display");

async function updateProcessingDays() {
  const dr = drInput.value;
  const dc = dcInput.value;
  if (!dr || !dc) {
    display.innerHTML =
      '<span class="days-placeholder">Fill in both dates to calculate</span>';
    return;
  }
  display.innerHTML = '<span class="days-placeholder">Calculating…</span>';
  try {
    const res = await fetch(
      `/api/processing-days?date_received=${dr}&date_completed=${dc}`,
    );
    const data = await res.json();
    if (data.days !== null && data.days !== undefined) {
      const label = data.days === 1 ? "working day" : "working days";
      display.innerHTML = `<span class="days-number">${data.days}</span><span class="days-label">${label}</span>`;
    } else {
      display.innerHTML =
        '<span class="days-placeholder">Could not calculate</span>';
    }
  } catch {
    display.innerHTML =
      '<span class="days-placeholder">Error calculating</span>';
  }
}

drInput.addEventListener("change", updateProcessingDays);
dcInput.addEventListener("change", updateProcessingDays);

// ── Form Validation ───────────────────────────────────────────────────────────

document.querySelector(".ces-form").addEventListener("submit", function (e) {
  const process = document.getElementById("process-value").value;
  const school = document.getElementById("school-value").value;
  const status = document.getElementById("status-value").value;

  if (!process || !school || !status) {
    e.preventDefault();
    alert("Please fill in all required fields (Process, School, Status).");
  }
});
