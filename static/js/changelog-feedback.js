/**
 * changelog-feedback.js
 *
 * Handles the customer feedback column for each changelog entry:
 *  - Persist checklist items in localStorage keyed by entry version
 *  - Manual text input → checkbox item
 *  - .docx file drop/browse → mammoth extracts numbered list items → checkbox items
 *  - Checking an item records the date; line-through styling applied
 *  - Items can be removed with the × button
 *
 * Requires: mammoth.browser.min.js loaded before this script
 */

(function () {
  "use strict";

  const STORAGE_PREFIX = "cl_feedback_";

  // ── Utilities ──────────────────────────────────────────────────

  function storageKey(version) {
    return STORAGE_PREFIX + version;
  }

  function loadItems(version) {
    try {
      const raw = localStorage.getItem(storageKey(version));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveItems(version, items) {
    try {
      localStorage.setItem(storageKey(version), JSON.stringify(items));
    } catch (e) {
      console.warn("cl-feedback: could not save to localStorage", e);
    }
  }

  function formatDate(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  let toastTimer = null;
  function showToast(msg) {
    let toast = document.querySelector(".cl-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "cl-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  // ── Render ─────────────────────────────────────────────────────

  function renderChecklist(version) {
    const ul = document.getElementById("checklist-" + version);
    if (!ul) return;
    const items = loadItems(version);
    ul.innerHTML = "";

    items.forEach(function (item, idx) {
      const li = document.createElement("li");
      if (item.checked) li.classList.add("is-checked");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!item.checked;
      checkbox.setAttribute("aria-label", item.text);

      checkbox.addEventListener("change", function () {
        const all = loadItems(version);
        all[idx].checked = checkbox.checked;
        all[idx].checkedAt = checkbox.checked ? new Date().toISOString() : null;
        saveItems(version, all);
        renderChecklist(version);
      });

      const labelWrap = document.createElement("span");
      labelWrap.className = "cl-check-label";

      const textSpan = document.createElement("span");
      textSpan.className = "cl-check-text";
      textSpan.textContent = item.text;
      labelWrap.appendChild(textSpan);

      const removeBtn = document.createElement("button");
      removeBtn.className = "cl-check-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove";
      removeBtn.setAttribute("aria-label", "Remove item");
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const all = loadItems(version);
        all.splice(idx, 1);
        saveItems(version, all);
        renderChecklist(version);
      });

      li.appendChild(checkbox);
      li.appendChild(labelWrap);

      if (item.checked && item.checkedAt) {
        const dateSpan = document.createElement("span");
        dateSpan.className = "cl-check-date";
        dateSpan.textContent = "Done " + formatDate(item.checkedAt);
        li.appendChild(dateSpan);
      }

      li.appendChild(removeBtn);
      ul.appendChild(li);
    });
  }

  // ── Add item ───────────────────────────────────────────────────

  function addItem(version, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const items = loadItems(version);
    items.push({ text: trimmed, checked: false, checkedAt: null });
    saveItems(version, items);
    renderChecklist(version);
  }

  function addItems(version, texts) {
    const items = loadItems(version);
    texts.forEach(function (t) {
      const trimmed = t.trim();
      if (trimmed)
        items.push({ text: trimmed, checked: false, checkedAt: null });
    });
    saveItems(version, items);
    renderChecklist(version);
  }

  // ── Docx parsing via mammoth ───────────────────────────────────

  /**
   * mammoth converts .docx to HTML. We then parse list items from
   * <ol> and <ul> elements (numbered lists become <ol> in mammoth output).
   * Falls back to plain <p> lines if no lists are found.
   */
  function parseDocx(file, version) {
    if (typeof mammoth === "undefined") {
      showToast("mammoth.js not loaded — cannot parse .docx");
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      mammoth
        .convertToHtml({ arrayBuffer: e.target.result })
        .then(function (result) {
          const html = result.value;
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");

          const extracted = [];

          // Prefer list items (numbered or bulleted)
          const listItems = doc.querySelectorAll("ol li, ul li");
          if (listItems.length > 0) {
            listItems.forEach(function (li) {
              const t = li.textContent.trim();
              if (t) extracted.push(t);
            });
          } else {
            // Fallback: non-empty paragraphs
            const paras = doc.querySelectorAll("p");
            paras.forEach(function (p) {
              const t = p.textContent.trim();
              if (t) extracted.push(t);
            });
          }

          if (extracted.length === 0) {
            showToast("No text found in the document.");
            return;
          }

          addItems(version, extracted);
          showToast(
            extracted.length +
              " item" +
              (extracted.length > 1 ? "s" : "") +
              " imported from " +
              file.name,
          );
        })
        .catch(function (err) {
          console.error("mammoth error", err);
          showToast("Could not read the .docx file.");
        });
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Wire up each feedback panel ────────────────────────────────

  function initPanel(panel) {
    const version = panel.dataset.version;
    if (!version) return;

    // Render persisted items
    renderChecklist(version);

    // Add button
    const addBtn = panel.querySelector(
      '.cl-add-btn[data-version="' + version + '"]',
    );
    const addInput = panel.querySelector(
      '.cl-add-input[data-version="' + version + '"]',
    );

    if (addBtn && addInput) {
      addBtn.addEventListener("click", function () {
        addItem(version, addInput.value);
        addInput.value = "";
        addInput.focus();
      });

      addInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          addItem(version, addInput.value);
          addInput.value = "";
        }
      });
    }

    // Drop zone
    const dropzone = panel.querySelector(
      '.cl-dropzone[data-version="' + version + '"]',
    );
    const fileInput = panel.querySelector(
      '.cl-file-input[data-version="' + version + '"]',
    );

    if (dropzone && fileInput) {
      // Click on drop zone text triggers file picker
      dropzone.addEventListener("click", function (e) {
        // The hidden file input overlays the zone; let it bubble naturally.
        // But if the click reached the zone itself (not the file input), trigger it.
        if (e.target !== fileInput) {
          fileInput.click();
        }
      });

      dropzone.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInput.click();
        }
      });

      fileInput.addEventListener("change", function () {
        const file = fileInput.files[0];
        if (file) parseDocx(file, version);
        fileInput.value = ""; // reset so same file can be re-uploaded
      });

      // Drag-and-drop
      dropzone.addEventListener("dragover", function (e) {
        e.preventDefault();
        dropzone.classList.add("is-over");
      });

      dropzone.addEventListener("dragleave", function () {
        dropzone.classList.remove("is-over");
      });

      dropzone.addEventListener("drop", function (e) {
        e.preventDefault();
        dropzone.classList.remove("is-over");
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!file.name.endsWith(".docx")) {
          showToast("Please drop a .docx file.");
          return;
        }
        parseDocx(file, version);
      });
    }
  }

  // ── Init ───────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    document
      .querySelectorAll(".cl-col--feedback[data-version]")
      .forEach(initPanel);
  });
})();
